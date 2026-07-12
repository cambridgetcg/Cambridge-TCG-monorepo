/**
 * Price-source publication gate.
 *
 * A row existing in `price_archive` is not permission to serve it. Sources
 * enter this allowlist only after their exact downstream use is reviewed.
 * Keeping the default closed prevents a future writer or old row from
 * silently widening every archive-backed response.
 */

export const PUBLISHABLE_PRICE_SOURCES = Object.freeze([] as const);

/** External catalog publication stays closed until field-level receipts exist. */
export const LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED = false as const;
export const LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON =
  "No field-level receipt separates independently publishable catalog fields from legacy CardRush-derived prices and images.";

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
    publish: false,
    license: "internal-only",
    redistribute: false,
    reason: "Authentication and storage do not create upstream publication rights.",
  });

export function priceSourcePublicationPolicy(
  source: string,
): PriceSourcePublicationPolicy {
  if (source === "cardrush") {
    return {
      publish: false,
      license: "internal-only",
      redistribute: false,
      reason:
        "CardRush requires a formal partnership for automated price collection; no written partnership or downstream publication rule is recorded.",
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
