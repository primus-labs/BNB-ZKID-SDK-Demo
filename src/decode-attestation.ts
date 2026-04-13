// decode-attestation.ts — dataBlob decoding for registry reads (npm i viem)
import { decodeAbiParameters, hexToString, keccak256, toBytes, type Hex } from "viem";

// 5 identityProperty types from docs/datablob-proof-configurations.md
const IDENTITY_PROPERTY = {
  BINANCE_KYC_TRADING_PROFILE:
    "0xa8b86ba89172f269976e3ef2dafed6de381b92a6d19a2ab848273b6f8db69c7c",
  OKX_KYC_TRADING_PROFILE:
    "0x289d4fed0b3ecb26e711e6d1200b46f1d67f2da4847b03f99aa8584706933195",
  GITHUB_ACCOUNT_CONTRIBUTION_PROFILE:
    "0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff",
  STEAM_ACCOUNT_VALUE_PROFILE:
    "0xab7ca68fb0d5fb64b53a938930b00a040af3d9a819756883d9bea6367ab84c08",
  AMAZON_MEMBERSHIP_ORDER_PROFILE:
    "0xc8e54ecd3ffce098897c6ed6f58d818d83ef46ecb043158d8929433b505ba944",
} as const;

/** Gateway `identityPropertyId` strings used by the demo → on-chain `bytes32` (see FALLBACK_PROVIDER_OPTIONS). */
const IDENTITY_PROPERTY_HEX_BY_GATEWAY_ID: Record<string, Hex> = {
  github_account_age: IDENTITY_PROPERTY.GITHUB_ACCOUNT_CONTRIBUTION_PROFILE,
  binance_spot_trade_kyc: IDENTITY_PROPERTY.BINANCE_KYC_TRADING_PROFILE,
  steam_library_account_age: IDENTITY_PROPERTY.STEAM_ACCOUNT_VALUE_PROFILE,
  amazon_prime_orders_account_age: IDENTITY_PROPERTY.AMAZON_MEMBERSHIP_ORDER_PROFILE,
  okx_trade_kyc: IDENTITY_PROPERTY.OKX_KYC_TRADING_PROFILE,
};

const BYTES32_HEX = /^0x[0-9a-fA-F]{64}$/;

export function identityPropertyIdToChainBytes32(identityPropertyId: string): Hex | undefined {
  const key = identityPropertyId.trim();
  if (key === "") {
    return undefined;
  }
  if (BYTES32_HEX.test(key)) {
    return key.toLowerCase() as Hex;
  }
  return IDENTITY_PROPERTY_HEX_BY_GATEWAY_ID[key];
}

/**
 * Gateway may return `providerId` as a 32-byte hex word or as a short slug (e.g. `github`).
 * Slugs are hashed with `keccak256(utf8Bytes(slug))` to match typical on-chain `bytes32` ids.
 */
export function normalizeProveProviderIdToBytes32(providerId: string): Hex | undefined {
  const t = providerId.trim();
  if (t === "") {
    return undefined;
  }
  if (BYTES32_HEX.test(t)) {
    return t.toLowerCase() as Hex;
  }
  return keccak256(toBytes(t));
}

function dataBlobAsUtf8(dataBlob: Hex): string {
  return hexToString(dataBlob);
}

function jsonBigIntish(v: unknown): bigint | null {
  if (typeof v === "bigint") {
    return v;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return BigInt(Math.trunc(v));
  }
  if (typeof v === "string" && v.trim() !== "" && /^-?\d+$/.test(v.trim())) {
    return BigInt(v.trim());
  }
  return null;
}

export function decodeDataBlobByIdentityProperty(identityProperty: string, dataBlob: Hex) {
  const key = identityProperty.toLowerCase();

  if (key === IDENTITY_PROPERTY.BINANCE_KYC_TRADING_PROFILE) {
    const asText = dataBlobAsUtf8(dataBlob).trim();
    if (asText.startsWith("{")) {
      try {
        const o = JSON.parse(asText) as Record<string, unknown>;
        const kycLevel = o.kycLevel;
        const months = jsonBigIntish(o.spotTradeHistoryLast6Months);
        if (typeof kycLevel === "string" && months !== null) {
          return { type: "BinanceKycTradingProfileV1", kycLevel, spotTradeHistoryLast6Months: months };
        }
      } catch {
        /* fall through to ABI */
      }
    }
    const [kycLevel, spotTradeHistoryLast6Months] = decodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }],
      dataBlob
    );
    return { type: "BinanceKycTradingProfileV1", kycLevel, spotTradeHistoryLast6Months };
  }

  if (key === IDENTITY_PROPERTY.OKX_KYC_TRADING_PROFILE) {
    const asText = dataBlobAsUtf8(dataBlob).trim();
    if (asText.startsWith("{")) {
      try {
        const o = JSON.parse(asText) as Record<string, unknown>;
        const kycLevel = o.kycLevel;
        const months = jsonBigIntish(o.tradeHistoryLast6Months);
        if (typeof kycLevel === "string" && months !== null) {
          return { type: "OkxKycTradingProfileV1", kycLevel, tradeHistoryLast6Months: months };
        }
      } catch {
        /* fall through to ABI */
      }
    }
    const [kycLevel, tradeHistoryLast6Months] = decodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }],
      dataBlob
    );
    return { type: "OkxKycTradingProfileV1", kycLevel, tradeHistoryLast6Months };
  }

  if (key === IDENTITY_PROPERTY.GITHUB_ACCOUNT_CONTRIBUTION_PROFILE) {
    const [accountEarliestYear, contributionsLastYear] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      dataBlob
    );
    return { type: "GithubAccountContributionProfileV1", accountEarliestYear, contributionsLastYear };
  }

  if (key === IDENTITY_PROPERTY.STEAM_ACCOUNT_VALUE_PROFILE) {
    const [accountEarliestYear, limitedAccountStatus, gameLibraryValue] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "string" }, { type: "uint256" }],
      dataBlob
    );
    return { type: "SteamAccountValueProfileV1", accountEarliestYear, limitedAccountStatus, gameLibraryValue };
  }

  if (key === IDENTITY_PROPERTY.AMAZON_MEMBERSHIP_ORDER_PROFILE) {
    const [accountEarliestYear, primeMemberStatus, ordersCountByYear] = decodeAbiParameters(
      [
        { type: "uint256" },
        { type: "string" },
        {
          type: "tuple[]",
          components: [
            { type: "uint256", name: "year" },
            { type: "uint256", name: "count" },
          ],
        },
      ],
      dataBlob
    );
    return { type: "AmazonMembershipOrderProfileV1", accountEarliestYear, primeMemberStatus, ordersCountByYear };
  }

  return { type: "UnknownIdentityProperty", rawDataBlob: dataBlob };
}
