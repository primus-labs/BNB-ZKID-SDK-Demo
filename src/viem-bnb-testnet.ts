/** Default JSON-RPC for BNB Smart Chain testnet (chainId 97). */
export const DEFAULT_BNB_TESTNET_RPC = "https://bsc-testnet.publicnode.com";

export function parseChainId(chainId: string | number): number {
  if (typeof chainId === "number" && Number.isFinite(chainId)) {
    return chainId;
  }
  const n = parseInt(String(chainId), 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid chainId: ${String(chainId)}`);
  }
  return n;
}

export function getBnbTestnetRpcUrl(): string {
  const env =
    typeof import.meta !== "undefined"
      ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
      : undefined;
  const fromEnv = env?.VITE_BNB_TESTNET_RPC_URL;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  return DEFAULT_BNB_TESTNET_RPC;
}
