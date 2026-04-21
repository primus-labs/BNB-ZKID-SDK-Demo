/** Matches Gateway / demo provider row for Amazon Prime proof template. */
export const AMAZON_PROVE_IDENTITY_PROPERTY_ID = "amazon_prime_orders_account_age";

/** Gateway often returns Brevis hex `property.id`; offline fallback uses the slug above. */
export function isAmazonProviderOption(row: {
  identityPropertyId: string;
  providerDescription: string;
  propertyDescription: string;
}): boolean {
  if (row.identityPropertyId === AMAZON_PROVE_IDENTITY_PROPERTY_ID) {
    return true;
  }
  const id = row.identityPropertyId.toLowerCase();
  if (id.includes("amazon")) {
    return true;
  }
  const prov = row.providerDescription.toLowerCase();
  const prop = row.propertyDescription.toLowerCase();
  return prov.includes("amazon") || prop.includes("amazon");
}

export type AmazonMarketplace = {
  /** Region code (e.g. US, JP); used as radio value. */
  id: string;
  label: string;
  /** Passed to SDK `provingParams.jumpToUrl` (Primus opens this storefront context). */
  jumpToUrl: string;
};

/** Canonical storefront URLs by region (product-provided map). */
const AMAZON_MARKETPLACE_URL_BY_CODE: Record<string, string> = {
  US: "https://www.amazon.com",
  JP: "https://www.amazon.co.jp",
  GB: "https://www.amazon.co.uk",
  DE: "https://www.amazon.de",
  IN: "https://www.amazon.in",
  CA: "https://www.amazon.ca",
  FR: "https://www.amazon.fr",
  AU: "https://www.amazon.com.au",
  IT: "https://www.amazon.it",
  ES: "https://www.amazon.es",
  BR: "https://www.amazon.com.br",
  MX: "https://www.amazon.com.mx",
  NL: "https://www.amazon.nl",
  AE: "https://www.amazon.ae",
  SG: "https://www.amazon.sg",
  ZA: "https://www.amazon.co.za",
  TR: "https://www.amazon.com.tr",
  SE: "https://www.amazon.se",
  PL: "https://www.amazon.pl",
  SA: "https://www.amazon.sa",
  BE: "https://www.amazon.com.be",
  IE: "https://www.amazon.ie",
  EG: "https://www.amazon.eg",
  DEFAULT: "https://www.amazon.com"
};

const AMAZON_MARKETPLACE_ORDER = [
  "US",
  "JP",
  "GB",
  "DE",
  "IN",
  "CA",
  "FR",
  "AU",
  "IT",
  "ES",
  "BR",
  "MX",
  "NL",
  "AE",
  "SG",
  "ZA",
  "TR",
  "SE",
  "PL",
  "SA",
  "BE",
  "IE",
  "EG",
  "DEFAULT"
] as const;

const AMAZON_MARKETPLACE_LABELS: Record<(typeof AMAZON_MARKETPLACE_ORDER)[number], string> = {
  US: "United States",
  JP: "Japan",
  GB: "United Kingdom",
  DE: "Germany",
  IN: "India",
  CA: "Canada",
  FR: "France",
  AU: "Australia",
  IT: "Italy",
  ES: "Spain",
  BR: "Brazil",
  MX: "Mexico",
  NL: "Netherlands",
  AE: "United Arab Emirates",
  SG: "Singapore",
  ZA: "South Africa",
  TR: "Turkey",
  SE: "Sweden",
  PL: "Poland",
  SA: "Saudi Arabia",
  BE: "Belgium",
  IE: "Ireland",
  EG: "Egypt",
  DEFAULT: "Default"
};

/**
 * Amazon retail storefronts for the demo picker. User choice becomes `provingParams.jumpToUrl`.
 */
export const AMAZON_MARKETPLACES: AmazonMarketplace[] = AMAZON_MARKETPLACE_ORDER.map((code) => {
  const jumpToUrl = AMAZON_MARKETPLACE_URL_BY_CODE[code];
  const name = AMAZON_MARKETPLACE_LABELS[code];
  const host = new URL(jumpToUrl).hostname.replace(/^www\./, "");
  return {
    id: code,
    label: `${name} (${code}) — ${host}`,
    jumpToUrl
  };
});
