import {
  keccak256,
  stringToBytes,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { arbitrumSepolia } from "viem/chains";

/** SettlementRegistry surface we use (createResource write + getPrice read). */
export const REGISTRY_ABI = [
  {
    inputs: [
      { name: "resource_id", type: "bytes32" },
      { name: "price", type: "uint256" },
      { name: "uri", type: "string" },
    ],
    name: "createResource",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "resource_id", type: "bytes32" }],
    name: "getPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** bytes32 resource id from a stable resource name. */
export const resourceIdFromName = (name: string): Hex => keccak256(stringToBytes(name));

/** uri packs both the worker to fetch from and the plaintext hash: `${workerUrl}#${plaintextHash}`. */
export const packUri = (workerUrl: string, plaintextHash: Hex): string => `${workerUrl}#${plaintextHash}`;
export const unpackUri = (uri: string): { workerUrl: string; plaintextHash: Hex } => {
  const [workerUrl, plaintextHash] = uri.split("#");
  return { workerUrl: workerUrl ?? "", plaintextHash: (plaintextHash ?? "0x") as Hex };
};

/** Register a paid resource on the SettlementRegistry. Returns the tx hash. */
export async function createResource(params: {
  ownerWallet: WalletClient;
  publicClient: PublicClient;
  registry: Address;
  resourceId: Hex;
  price: bigint;
  uri: string;
}): Promise<Hex> {
  const account = params.ownerWallet.account;
  if (!account) throw new Error("ownerWallet has no account");
  const hash = await params.ownerWallet.writeContract({
    address: params.registry,
    abi: REGISTRY_ABI,
    functionName: "createResource",
    args: [params.resourceId, params.price, params.uri],
    account,
    chain: arbitrumSepolia,
  });
  const receipt = await params.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`createResource reverted: ${hash}`);
  return hash;
}

/** On-chain price for a resource (USDC base units); 0 = free/unset. */
export async function getPrice(
  publicClient: PublicClient,
  registry: Address,
  resourceId: Hex,
): Promise<bigint> {
  return publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "getPrice",
    args: [resourceId],
  });
}
