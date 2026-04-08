export type LogEntry =
  | { kind: "text"; text: string }
  | { kind: "outcome"; success: boolean };

export type ProviderOption = {
  providerDescription: string;
  identityPropertyId: string;
  propertyDescription: string;
};

export const SDK_DEMO_APP_ID =
  "0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C";

/**
 * When `init()` fails (e.g. no Primus yet), we still render Step 2 so the user can click
 * and get a clear prompt. After the extension is installed, click retries `init()` and loads real providers.
 */
export const FALLBACK_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    providerDescription: "GitHub",
    identityPropertyId: "github_account_age",
    propertyDescription: "GitHub account age"
  },
  {
    providerDescription: "Binance",
    identityPropertyId: "binance_spot_trade_kyc",
    propertyDescription: "Spot trade history + KYC level"
  },
  {
    providerDescription: "Steam",
    identityPropertyId: "steam_library_account_age",
    propertyDescription: "Game library value + Account age"
  },
  {
    providerDescription: "Amazon",
    identityPropertyId: "amazon_prime_orders_account_age",
    propertyDescription: "Prime status + order counts + Account age"
  },
  {
    providerDescription: "OKX",
    identityPropertyId: "okx_trade_kyc",
    propertyDescription: "Trade history + KYC level"
  }
];
