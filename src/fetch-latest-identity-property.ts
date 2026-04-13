import { createPublicClient, getAddress, http, type Address, type Hex } from "viem";
import { bscTestnet } from "viem/chains";
import { getBnbTestnetRpcUrl, parseChainId } from "./viem-bnb-testnet.js";

const REGISTRY_GET_LATEST_ABI = [
  {
    type: "function",
    name: "getLatestIdentityProperty",
    stateMutability: "view",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "providerId", type: "bytes32" },
      { name: "identityProperty", type: "bytes32" }
    ],
    outputs: [
      { name: "timestamp", type: "uint64" },
      { name: "dataBlob", type: "bytes" }
    ]
  }
] as const;

export type RegistryReadRef = {
  chainId: string | number;
  registry: string;
};

/**
 * `IIdentityRegistry.getLatestIdentityProperty` — BNB Smart Chain testnet (chainId 97) only.
 */
export async function fetchLatestIdentityPropertyFromRegistry(input: {
  attestation: RegistryReadRef;
  wallet: Address;
  providerId: Hex;
  identityProperty: Hex;
}): Promise<{ timestamp: bigint; dataBlob: Hex }> {
  const chainId = parseChainId(input.attestation.chainId);
  if (chainId !== bscTestnet.id) {
    throw new Error(
      `Registry read only supports BNB Smart Chain testnet (chainId ${bscTestnet.id}). Got ${chainId}.`
    );
  }

  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(getBnbTestnetRpcUrl())
  });

  const [timestamp, dataBlob] = await client.readContract({
    address: getAddress(input.attestation.registry as Hex),
    abi: REGISTRY_GET_LATEST_ABI,
    functionName: "getLatestIdentityProperty",
    args: [input.wallet, input.providerId, input.identityProperty]
  });

  return { timestamp: BigInt(timestamp), dataBlob: dataBlob as Hex };
}
