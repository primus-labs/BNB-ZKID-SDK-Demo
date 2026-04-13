import { getAddress } from "viem";

/** `IIdentityRegistry` on BNB Smart Chain testnet (chainId 97) for demo `getLatestIdentityProperty` reads. */
const BNB_TESTNET_IDENTITY_REGISTRY = "0x9569299A8877Bc155232cF5Aa50AF42F9Fc32C7C" as const;

export function getBnbTestnetIdentityRegistryAddress(): string {
  return getAddress(BNB_TESTNET_IDENTITY_REGISTRY);
}
