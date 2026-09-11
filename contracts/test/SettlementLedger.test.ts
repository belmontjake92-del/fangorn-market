import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { Hex } from "viem";
import { deployment, market, price, size, usd, expectRevert } from "./helpers";

const MAX_STALENESS = 3600n;
const M = market("ACME");
const ID = deployment("dep-1");

describe("SettlementLedger", () => {
  async function deploy(limits = { maxPositionNotional: 0n, dailyLossLimit: 0n }) {
    const [owner, depOwner, operator, other] = await hre.viem.getWalletClients();
    const oracle = await hre.viem.deployContract("PriceOracle", [owner.account.address]);
    const ledger = await hre.viem.deployContract("SettlementLedger", [
      owner.account.address,
      oracle.address,
      MAX_STALENESS,
    ]);
    await ledger.write.openDeployment([
      ID,
      depOwner.account.address,
      operator.account.address,
      usd(1000),
      limits,
      [M],
    ]);
    const fill = (id: Hex, m: Hex, delta: bigint) =>
      ledger.write.submitFill([id, m, delta], { account: operator.account });
    const cashOf = async (id: Hex) => (await ledger.read.getAccount([id]))[4];
    return { oracle, ledger, owner, depOwner, operator, other, fill, cashOf };
  }

  it("opens a deployment with cash and an allowlisted market", async () => {
    const { ledger, depOwner, operator, cashOf } = await deploy();
    const acct = await ledger.read.getAccount([ID]);
    expect(acct[0].toLowerCase()).to.equal(depOwner.account.address.toLowerCase()); // owner
    expect(acct[1].toLowerCase()).to.equal(operator.account.address.toLowerCase()); // operator
    expect(acct[2]).to.equal(true); // exists
    expect(await cashOf(ID)).to.equal(usd(1000));
    expect(await ledger.read.marketAllowed([ID, M])).to.equal(true);
  });

  it("only the owner may open a deployment", async () => {
    const { ledger, other, depOwner, operator } = await deploy();
    await expectRevert(
      ledger.write.openDeployment(
        [deployment("dep-2"), depOwner.account.address, operator.account.address, usd(1), { maxPositionNotional: 0n, dailyLossLimit: 0n }, [M]],
        { account: other.account },
      ),
      "OwnableUnauthorizedAccount",
    );
  });

  it("opens a long at the fill price with no realized PnL", async () => {
    const { oracle, ledger, fill, cashOf } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(1));
    const [sz, entry] = await ledger.read.getPosition([ID, M]);
    expect(sz).to.equal(size(1));
    expect(entry).to.equal(price(100));
    expect(await cashOf(ID)).to.equal(usd(1000)); // unchanged
  });

  it("blends entry price when adding to a position", async () => {
    const { oracle, ledger, fill } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(1));
    await oracle.write.setPrice([M, price(120)]);
    await fill(ID, M, size(1));
    const [sz, entry] = await ledger.read.getPosition([ID, M]);
    expect(sz).to.equal(size(2));
    expect(entry).to.equal(price(110)); // (100 + 120) / 2
  });

  it("realizes profit on a partial close, leaving entry unchanged", async () => {
    const { oracle, ledger, fill, cashOf } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(2));
    await oracle.write.setPrice([M, price(110)]);
    await fill(ID, M, size(-1));
    const [sz, entry] = await ledger.read.getPosition([ID, M]);
    expect(sz).to.equal(size(1));
    expect(entry).to.equal(price(100));
    expect(await cashOf(ID)).to.equal(usd(1010)); // +$10 realized
  });

  it("closes a long fully, zeroing the position", async () => {
    const { oracle, ledger, fill, cashOf } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(1));
    await oracle.write.setPrice([M, price(110)]);
    await fill(ID, M, size(-1));
    const [sz, entry] = await ledger.read.getPosition([ID, M]);
    expect(sz).to.equal(0n);
    expect(entry).to.equal(0n);
    expect(await cashOf(ID)).to.equal(usd(1010));
  });

  it("flips long→short: realizes on the closed part, re-enters at the fill price", async () => {
    const { oracle, ledger, fill, cashOf } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(1));
    await oracle.write.setPrice([M, price(120)]);
    await fill(ID, M, size(-3));
    const [sz, entry] = await ledger.read.getPosition([ID, M]);
    expect(sz).to.equal(size(-2));
    expect(entry).to.equal(price(120));
    expect(await cashOf(ID)).to.equal(usd(1020)); // +$20 on the 1 unit closed
  });

  it("realizes profit on a short when price falls", async () => {
    const { oracle, ledger, fill, cashOf } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(-1));
    await oracle.write.setPrice([M, price(90)]);
    await fill(ID, M, size(1));
    expect((await ledger.read.getPosition([ID, M]))[0]).to.equal(0n);
    expect(await cashOf(ID)).to.equal(usd(1010)); // short gained $10
  });

  it("marks unrealized PnL and equity to the oracle price", async () => {
    const { oracle, ledger, fill } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(1));
    await oracle.write.setPrice([M, price(115)]);
    expect(await ledger.read.unrealizedPnl([ID, M])).to.equal(usd(15));
    expect(await ledger.read.equity([ID, M])).to.equal(usd(1015));
  });

  it("rejects a fill from a non-operator", async () => {
    const { oracle, ledger, other } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await expectRevert(
      ledger.write.submitFill([ID, M, size(1)], { account: other.account }),
      "NotOperator",
    );
  });

  it("rejects a zero-size fill", async () => {
    const { oracle, fill } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await expectRevert(fill(ID, M, 0n), "ZeroSizeDelta");
  });

  it("rejects a fill on a non-allowlisted market", async () => {
    const { oracle, fill } = await deploy();
    const other = market("OTHER");
    await oracle.write.setPrice([other, price(100)]);
    await expectRevert(fill(ID, other, size(1)), "MarketNotAllowed");
  });

  it("rejects a fill when the market has no oracle price", async () => {
    const { fill } = await deploy();
    await expectRevert(fill(ID, M, size(1)), "NoPrice");
  });

  it("rejects a fill when the price is stale", async () => {
    const { oracle, fill } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await time.increase(Number(MAX_STALENESS) + 10);
    await expectRevert(fill(ID, M, size(1)), "StalePrice");
  });

  it("enforces the max-position-notional cap", async () => {
    const { oracle, fill } = await deploy({ maxPositionNotional: usd(150), dailyLossLimit: 0n });
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(1)); // $100 notional - ok
    await expectRevert(fill(ID, M, size(1)), "PositionLimitExceeded"); // would be $200
  });

  it("enforces the daily-loss cap", async () => {
    const { oracle, fill } = await deploy({ maxPositionNotional: 0n, dailyLossLimit: usd(5) });
    await oracle.write.setPrice([M, price(100)]);
    await fill(ID, M, size(1));
    await oracle.write.setPrice([M, price(90)]);
    await expectRevert(fill(ID, M, size(-1)), "DailyLossLimitExceeded"); // -$10 > $5 cap
  });

  it("blocks all fills under global emergency stop", async () => {
    const { oracle, ledger, fill } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await ledger.write.setEmergencyStop([true]);
    await expectRevert(fill(ID, M, size(1)), "Stopped");
  });

  it("lets the deployment owner pause its own agent", async () => {
    const { oracle, ledger, depOwner, fill } = await deploy();
    await oracle.write.setPrice([M, price(100)]);
    await ledger.write.setPaused([ID, true], { account: depOwner.account });
    await expectRevert(fill(ID, M, size(1)), "DeploymentPaused");
  });
});
