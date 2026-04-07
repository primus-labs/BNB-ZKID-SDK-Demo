import type { BnbZkIdGatewayConfigProviderWire } from "@primuslabs/bnb-zkid-sdk";
import type { ProviderOption } from "./sdk-demo-types";

export function flattenProviderOptions(
  providers: BnbZkIdGatewayConfigProviderWire[]
): ProviderOption[] {
  const rows: ProviderOption[] = [];

  for (const provider of providers) {
    const providerDescription =
      typeof provider.description === "string" && provider.description.trim() !== ""
        ? provider.description.trim()
        : provider.id;

    for (const property of provider.properties) {
      const identityPropertyId = property.id.trim();
      if (!identityPropertyId) {
        continue;
      }

      rows.push({
        providerDescription,
        identityPropertyId,
        propertyDescription:
          typeof property.description === "string" && property.description.trim() !== ""
            ? property.description.trim()
            : identityPropertyId
      });
    }
  }

  return rows;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}
