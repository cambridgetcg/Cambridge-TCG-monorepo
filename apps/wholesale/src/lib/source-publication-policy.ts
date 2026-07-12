/**
 * Price-source publication gate.
 *
 * A row existing in `price_archive` is not permission to serve it. Sources
 * enter this allowlist only after their exact downstream use is reviewed.
 * Keeping the default closed prevents a future writer or old row from
 * silently widening every archive-backed response.
 */

export const PUBLISHABLE_PRICE_SOURCES = Object.freeze(["cardrush"] as const);

/**
 * Every route using this policy is bearer-gated and may contain
 * internal-only upstream observations. Authenticated responses must never be
 * stored in a shared cache or reused for another caller.
 */
export const INTERNAL_ONLY_CACHE_CONTROL = "private, no-store";

export type PricePublicationLicense = "internal-only" | "proprietary";

export interface PriceSourcePublicationPolicy {
  publish: boolean;
  license: PricePublicationLicense;
  /** Policy decision. Never copy this value from a database row. */
  redistribute: boolean;
  reason: string;
}

/** Rights of the immediate wholesale storage layer in bearer-gated routes. */
export const WHOLESALE_STORAGE_PUBLICATION_POLICY: PriceSourcePublicationPolicy =
  Object.freeze({
    publish: true,
    license: "internal-only",
    redistribute: false,
    reason: "Bearer-gated wholesale storage; no shared-cache or bulk-export grant.",
  });

export function priceSourcePublicationPolicy(
  source: string,
): PriceSourcePublicationPolicy {
  if (source === "cardrush") {
    return {
      publish: true,
      license: "internal-only",
      redistribute: false,
      reason: "Reviewed single-SKU, authenticated-use boundary.",
    };
  }

  return {
    publish: false,
    license: "proprietary",
    redistribute: false,
    reason:
      "No reviewed publication rule for this price source. Storage is not permission.",
  };
}
