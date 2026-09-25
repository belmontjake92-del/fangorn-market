import { expect } from "chai";
import hre from "hardhat";
import { keccak256, parseSignature, stringToBytes, toHex, type Address, type Hex } from "viem";

// Local chain has no CREATE2 proxy, and PoseidonT3 is over the size limit, so
// the hardhat network allows unlimited contract size for these tests.
async function deployStack() {
  const [owner, buyer, relayer] = await hre.viem.getWalletClients();
  const poseidon = await hre.viem.deployContract("PoseidonT3", []);
  const verifier = await hre.viem.deployContract("SemaphoreVerifier", []);
  const semaphore = await hre.viem.deployContract("Semaphore", [verifier.address], {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": poseidon.address },
  });
  const usdc = await hre.viem.deployContract("MockUSDC", []);
  const registry = await hre.viem.deployContract("StealthAccessRegistry", [usdc.address, semaphore.address]);
  return { owner, buyer, relayer, semaphore, usdc, registry };
}

async function signAuth(
  buyer: Awaited<ReturnType<typeof hre.viem.getWalletClients>>[number],
  usdc: Address,
  to: Address,
  value: bigint,
) {
  const pc = await hre.viem.getPublicClient();
  const chainId = await pc.getChainId();
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = (await pc.getBlock()).timestamp + 3600n; // chain time, not wall clock
  const signature = await buyer.signTypedData({
    account: buyer.account,
    domain: { name: "USD Coin", version: "2", chainId, verifyingContract: usdc },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from: buyer.account.address, to, value, validAfter: 0n, validBefore, nonce },
  });
  const sig = parseSignature(signature);
  return { nonce, validBefore, v: Number(sig.v ?? BigInt(27 + (sig.yParity ?? 0))), r: sig.r, s: sig.s };
}

const rid = (name: string): Hex => keccak256(stringToBytes(name));
const COMMITMENT = 123456789n; // any field element works for membership bookkeeping

describe("StealthAccessRegistry", () => {
  it("creates a Semaphore group per resource, owned by the registry", async () => {
    const { registry, semaphore } = await deployStack();
    await registry.write.createResource([rid("a"), 1000n, "worker"]);
    const [, price, groupId] = await registry.read.getResource([rid("a")]);
    expect(price).to.equal(1000n);
    expect(groupId).to.equal(0n);
    expect((await semaphore.read.getGroupAdmin([groupId])).toLowerCase()).to.equal(registry.address.toLowerCase());
  });

  it("gasless pay moves USDC to the owner and adds the commitment to the group", async () => {
    const { owner, buyer, relayer, usdc, registry, semaphore } = await deployStack();
    await registry.write.createResource([rid("a"), 1000n, "worker"]);
    await usdc.write.mint([buyer.account.address, 5000n]);
    const a = await signAuth(buyer, usdc.address, owner.account.address, 1000n);
    await registry.write.pay(
      [rid("a"), COMMITMENT, buyer.account.address, 1000n, 0n, a.validBefore, a.nonce, a.v, a.r, a.s],
      { account: relayer.account },
    );
    expect(await usdc.read.balanceOf([owner.account.address])).to.equal(1000n);
    expect(await registry.read.isMember([rid("a"), COMMITMENT])).to.equal(true);
    expect(await semaphore.read.hasMember([0n, COMMITMENT])).to.equal(true);
  });

  it("paying again with the same identity does not re-add the member", async () => {
    const { owner, buyer, usdc, registry, semaphore } = await deployStack();
    await registry.write.createResource([rid("a"), 1000n, "worker"]);
    await usdc.write.mint([buyer.account.address, 5000n]);
    for (let i = 0; i < 2; i++) {
      const a = await signAuth(buyer, usdc.address, owner.account.address, 1000n);
      await registry.write.pay([rid("a"), COMMITMENT, buyer.account.address, 1000n, 0n, a.validBefore, a.nonce, a.v, a.r, a.s]);
    }
    expect(await semaphore.read.getMerkleTreeSize([0n])).to.equal(1n);
  });

  it("rejects underpayment and unknown resources", async () => {
    const { owner, buyer, usdc, registry } = await deployStack();
    await registry.write.createResource([rid("a"), 1000n, "worker"]);
    await usdc.write.mint([buyer.account.address, 5000n]);
    const a = await signAuth(buyer, usdc.address, owner.account.address, 999n);
    await expect(
      registry.write.pay([rid("a"), COMMITMENT, buyer.account.address, 999n, 0n, a.validBefore, a.nonce, a.v, a.r, a.s]),
    ).to.be.rejectedWith("Underpaid");
    await expect(
      registry.write.pay([rid("nope"), COMMITMENT, buyer.account.address, 1000n, 0n, a.validBefore, a.nonce, a.v, a.r, a.s]),
    ).to.be.rejectedWith("UnknownResource");
  });

  it("verifyAccess refuses a proof scoped to another resource", async () => {
    const { registry } = await deployStack();
    await registry.write.createResource([rid("a"), 1000n, "worker"]);
    const proof = { merkleTreeDepth: 1n, merkleTreeRoot: 1n, nullifier: 1n, message: 1n, scope: 42n, points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n] as const };
    expect(await registry.read.verifyAccess([rid("a"), proof])).to.equal(false);
    expect(await registry.read.verifyAccess([rid("unknown"), proof])).to.equal(false);
  });
});
