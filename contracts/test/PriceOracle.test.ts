import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { market, price, expectRevert } from "./helpers";

describe("PriceOracle", () => {
  async function deploy() {
    const [owner, other] = await hre.viem.getWalletClients();
    const oracle = await hre.viem.deployContract("PriceOracle", [owner.account.address]);
    return { oracle, owner, other };
  }

  it("stores price and timestamp, and reads them back", async () => {
    const { oracle } = await deploy();
    const m = market("ACME");
    await oracle.write.setPrice([m, price(100)]);
    const [p, updatedAt] = await oracle.read.getPrice([m]);
    expect(p).to.equal(price(100));
    expect(updatedAt > 0n).to.equal(true);
  });

  it("returns (0,0) for an unset market", async () => {
    const { oracle } = await deploy();
    const [p, updatedAt] = await oracle.read.getPrice([market("NONE")]);
    expect(p).to.equal(0n);
    expect(updatedAt).to.equal(0n);
  });

  it("rejects a zero price", async () => {
    const { oracle } = await deploy();
    await expectRevert(oracle.write.setPrice([market("ACME"), 0n]), "ZeroPrice");
  });

  it("only the owner may set prices", async () => {
    const { oracle, other } = await deploy();
    await expectRevert(
      oracle.write.setPrice([market("ACME"), price(100)], { account: other.account }),
      "OwnableUnauthorizedAccount",
    );
  });

  it("batch-sets prices and rejects length mismatch", async () => {
    const { oracle } = await deploy();
    await oracle.write.setPrices([[market("A"), market("B")], [price(1), price(2)]]);
    expect((await oracle.read.getPrice([market("B")]))[0]).to.equal(price(2));
    await expectRevert(
      oracle.write.setPrices([[market("A")], [price(1), price(2)]]),
      "LengthMismatch",
    );
  });

  it("reports freshness against a staleness bound", async () => {
    const { oracle } = await deploy();
    const m = market("ACME");
    await oracle.write.setPrice([m, price(100)]);
    expect(await oracle.read.isFresh([m, 3600n])).to.equal(true);
    await time.increase(4000);
    expect(await oracle.read.isFresh([m, 3600n])).to.equal(false);
  });
});
