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
    if (!Number.isInteger(v)) {
      return null;
    }
    if (Number.isSafeInteger(v)) {
      return BigInt(v);
    }
    // Non–safe integers in JS Number are not reliable; callers should use string/bigint in JSON.
    return null;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const t = v.trim();
    if (/^-?\d+$/.test(t)) {
      return BigInt(t);
    }
    if (/^0x[0-9a-fA-F]+$/.test(t)) {
      try {
        return BigInt(t);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Reads the first matching key (exact, then case-insensitive) as bigint-ish. */
function pickBigIntFromRecord(obj: Record<string, unknown>, keys: string[]): bigint | null {
  for (const k of keys) {
    if (k in obj) {
      const v = jsonBigIntish(obj[k]);
      if (v !== null) {
        return v;
      }
    }
  }
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  for (const [gk, gv] of Object.entries(obj)) {
    if (wanted.has(gk.toLowerCase())) {
      const v = jsonBigIntish(gv);
      if (v !== null) {
        return v;
      }
    }
  }
  return null;
}

function coerceJsonString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t !== "" ? t : null;
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(Math.trunc(v));
  }
  return null;
}

function pickStringFromRecord(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (k in obj) {
      const s = coerceJsonString(obj[k]);
      if (s !== null) {
        return s;
      }
    }
  }
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  for (const [gk, gv] of Object.entries(obj)) {
    if (wanted.has(gk.toLowerCase())) {
      const s = coerceJsonString(gv);
      if (s !== null) {
        return s;
      }
    }
  }
  return null;
}

function bigIntFieldsFromRecord(obj: Record<string, unknown>): { key: string; value: bigint }[] {
  const out: { key: string; value: bigint }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const b = jsonBigIntish(v);
    if (b !== null) {
      out.push({ key: k, value: b });
    }
  }
  return out;
}

/** Unwrap single-key wrappers like `{ "data": { ... } }` (limited depth). */
function unwrapRecordLayers(raw: unknown, maxDepth: number): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  let cur: unknown = raw;
  for (let d = 0; d < maxDepth; d++) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) {
      return null;
    }
    const rec = cur as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length === 1) {
      const inner = rec[keys[0]!];
      if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
        cur = inner;
        continue;
      }
    }
    return rec;
  }
  return cur as Record<string, unknown>;
}

function tryGithubFromJsonObject(o: Record<string, unknown>): {
  accountEarliestYear: bigint;
  contributionsLastYear: bigint;
} | null {
  const accountEarliestYear = pickBigIntFromRecord(o, [
    "accountEarliestYear",
    "account_earliest_year",
    "earliestYear",
    "accountCreationYear",
    "creationYear",
    "githubAccountEarliestYear"
  ]);
  const contributionsLastYear = pickBigIntFromRecord(o, [
    "contributionsLastYear",
    "contributions_last_year",
    "contributionLastYear",
    "lastYearContributions",
    "githubContributionsLastYear",
    "contributionCount",
    "contributionsInLastYear"
  ]);
  if (accountEarliestYear !== null && contributionsLastYear !== null) {
    return { accountEarliestYear, contributionsLastYear };
  }

  const nums = bigIntFieldsFromRecord(o);
  if (nums.length >= 2) {
    const yearLike = nums.filter((n) => n.value >= 1970n && n.value <= 2100n);
    const yearEntry = yearLike[0];
    if (yearEntry) {
      const rest = nums.filter((n) => n !== yearEntry);
      const contribEntry = rest.find((n) => n.value >= 0n && n.value <= 1_000_000n);
      if (contribEntry) {
        return { accountEarliestYear: yearEntry.value, contributionsLastYear: contribEntry.value };
      }
    }
  }
  return null;
}

function stringLikeFieldsFromRecord(obj: Record<string, unknown>): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (jsonBigIntish(v) !== null) {
      continue;
    }
    const s = coerceJsonString(v);
    if (s !== null) {
      out.push({ key: k, value: s });
    }
  }
  return out;
}

function trySteamFromJsonObject(o: Record<string, unknown>): {
  accountEarliestYear: bigint;
  limitedAccountStatus: string;
  gameLibraryValue: bigint;
} | null {
  const limitedAccountStatus = pickStringFromRecord(o, [
    "limitedAccountStatus",
    "limited_account_status",
    "limited",
    "accountLimited",
    "isLimited",
    "steamLimitedAccount"
  ]);
  const accountEarliestYear = pickBigIntFromRecord(o, [
    "accountEarliestYear",
    "account_earliest_year",
    "earliestYear",
    "accountCreationYear",
    "creationYear",
    "steamAccountEarliestYear"
  ]);
  const gameLibraryValue = pickBigIntFromRecord(o, [
    "gameLibraryValue",
    "game_library_value",
    "libraryValue",
    "steamLibraryValue",
    "accountValue"
  ]);
  if (limitedAccountStatus !== null && accountEarliestYear !== null && gameLibraryValue !== null) {
    return { accountEarliestYear, limitedAccountStatus, gameLibraryValue };
  }

  const nums = bigIntFieldsFromRecord(o);
  const strs = stringLikeFieldsFromRecord(o);
  if (nums.length === 2 && strs.length === 1) {
    const yearEntry =
      nums.find((n) => /year|earliest|creation|joined|account/i.test(n.key)) ??
      nums.find((n) => n.value >= 1970n && n.value <= 2100n);
    const libEntry =
      nums.find((n) => n !== yearEntry && /library|value|worth|inventory|asset/i.test(n.key)) ??
      nums.find((n) => n !== yearEntry);
    if (yearEntry && libEntry) {
      return {
        accountEarliestYear: yearEntry.value,
        limitedAccountStatus: strs[0]!.value,
        gameLibraryValue: libEntry.value
      };
    }
  }
  return null;
}

function amazonOrdersFromJsonValue(raw: unknown): { year: bigint; count: bigint }[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const out: { year: bigint; count: bigint }[] = [];
  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 2) {
      const y = jsonBigIntish(item[0]);
      const c = jsonBigIntish(item[1]);
      if (y !== null && c !== null) {
        out.push({ year: y, count: c });
        continue;
      }
    }
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const rec = item as Record<string, unknown>;
    const year = pickBigIntFromRecord(rec, ["year", "Y", "orderYear", "calendarYear"]);
    const count = pickBigIntFromRecord(rec, ["count", "cnt", "orders", "orderCount", "n"]);
    if (year === null || count === null) {
      return null;
    }
    out.push({ year, count });
  }
  return out;
}

function tryAmazonFromJsonObject(o: Record<string, unknown>): {
  accountEarliestYear: bigint;
  primeMemberStatus: string;
  ordersCountByYear: { year: bigint; count: bigint }[];
} | null {
  const accountEarliestYear = pickBigIntFromRecord(o, [
    "accountEarliestYear",
    "account_earliest_year",
    "earliestYear",
    "accountCreationYear",
    "creationYear",
    "amazonAccountEarliestYear"
  ]);
  const primeMemberStatus = pickStringFromRecord(o, [
    "primeMemberStatus",
    "prime_member_status",
    "primeStatus",
    "isPrimeMember",
    "prime"
  ]);
  const ordersRaw =
    o.ordersCountByYear ??
    o.orders_count_by_year ??
    o.yearlyOrders ??
    o.ordersByYear ??
    o.orders_by_year;
  const ordersCountByYear = amazonOrdersFromJsonValue(ordersRaw);

  if (accountEarliestYear !== null && primeMemberStatus !== null && ordersCountByYear !== null) {
    return { accountEarliestYear, primeMemberStatus, ordersCountByYear };
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
    try {
      const [kycLevel, spotTradeHistoryLast6Months] = decodeAbiParameters(
        [{ type: "string" }, { type: "uint256" }],
        dataBlob
      );
      return { type: "BinanceKycTradingProfileV1", kycLevel, spotTradeHistoryLast6Months };
    } catch {
      return {
        type: "BinanceKycTradingProfileUnparsed",
        rawDataBlob: dataBlob,
        utf8Preview: asText.length > 0 ? asText.slice(0, 500) : undefined
      };
    }
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
    try {
      const [kycLevel, tradeHistoryLast6Months] = decodeAbiParameters(
        [{ type: "string" }, { type: "uint256" }],
        dataBlob
      );
      return { type: "OkxKycTradingProfileV1", kycLevel, tradeHistoryLast6Months };
    } catch {
      return {
        type: "OkxKycTradingProfileUnparsed",
        rawDataBlob: dataBlob,
        utf8Preview: asText.length > 0 ? asText.slice(0, 500) : undefined
      };
    }
  }

  if (key === IDENTITY_PROPERTY.GITHUB_ACCOUNT_CONTRIBUTION_PROFILE) {
    const asText = dataBlobAsUtf8(dataBlob).trim();
    // Registry often stores a short UTF-8 JSON blob (~tens of bytes); ABI path expects abi.encode(uint256,uint256) (64 bytes).
    if (asText.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(asText);
        const flat = unwrapRecordLayers(parsed, 4) ?? (parsed as Record<string, unknown>);
        const fromJson = tryGithubFromJsonObject(flat);
        if (fromJson) {
          return { type: "GithubAccountContributionProfileV1", ...fromJson };
        }
      } catch {
        /* fall through to ABI */
      }
    }
    try {
      const [accountEarliestYear, contributionsLastYear] = decodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        dataBlob
      );
      return { type: "GithubAccountContributionProfileV1", accountEarliestYear, contributionsLastYear };
    } catch {
      return {
        type: "GithubAccountContributionProfileUnparsed",
        rawDataBlob: dataBlob,
        utf8Preview: asText.length > 0 ? asText.slice(0, 500) : undefined
      };
    }
  }

  if (key === IDENTITY_PROPERTY.STEAM_ACCOUNT_VALUE_PROFILE) {
    const asText = dataBlobAsUtf8(dataBlob).trim();
    // Registry may store UTF-8 JSON; ABI decode of a string field uses hexToNumber for lengths — JSON blobs throw IntegerOutOfRangeError.
    if (asText.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(asText);
        const flat = unwrapRecordLayers(parsed, 4) ?? (parsed as Record<string, unknown>);
        const fromJson = trySteamFromJsonObject(flat);
        if (fromJson) {
          return { type: "SteamAccountValueProfileV1", ...fromJson };
        }
      } catch {
        /* fall through to ABI */
      }
    }
    try {
      const [accountEarliestYear, limitedAccountStatus, gameLibraryValue] = decodeAbiParameters(
        [{ type: "uint256" }, { type: "string" }, { type: "uint256" }],
        dataBlob
      );
      return { type: "SteamAccountValueProfileV1", accountEarliestYear, limitedAccountStatus, gameLibraryValue };
    } catch {
      return {
        type: "SteamAccountValueProfileUnparsed",
        rawDataBlob: dataBlob,
        utf8Preview: asText.length > 0 ? asText.slice(0, 500) : undefined
      };
    }
  }

  if (key === IDENTITY_PROPERTY.AMAZON_MEMBERSHIP_ORDER_PROFILE) {
    const asText = dataBlobAsUtf8(dataBlob).trim();
    // Same class of failure as Steam: JSON mistaken for ABI hits hexToNumber / dynamic offsets.
    if (asText.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(asText);
        const flat = unwrapRecordLayers(parsed, 4) ?? (parsed as Record<string, unknown>);
        const fromJson = tryAmazonFromJsonObject(flat);
        if (fromJson) {
          return { type: "AmazonMembershipOrderProfileV1", ...fromJson };
        }
      } catch {
        /* fall through to ABI */
      }
    }
    try {
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
    } catch {
      return {
        type: "AmazonMembershipOrderProfileUnparsed",
        rawDataBlob: dataBlob,
        utf8Preview: asText.length > 0 ? asText.slice(0, 500) : undefined
      };
    }
  }

  return { type: "UnknownIdentityProperty", rawDataBlob: dataBlob };
}
