/**
 * Provenance helpers — every emitted record carries `@as_of` +
 * `@retrieved_at` + named sources.
 *
 * Substrate-honesty applied to outbound data. The envelope (see
 * `envelope.ts`) attaches a `_meta` block at the response level; this
 * file attaches *per-record* provenance for endpoints that emit
 * arrays of facts (catalog rows, price-series points, lifecycle
 * entries), where each row may have a different `as_of`.
 *
 * Naming convention: per-record provenance uses `@`-prefixed keys to
 * distinguish them from the record's domain fields. Inspired by
 * sister's math-mirror format (`@retrieved_at` vs `@as_of`).
 */

/** A canonical source name. The pantry maintains the registered set. */
export type SourceName =
  /** Storefront PostgreSQL RDS. */
  | "storefront-rds"
  /** Wholesale PostgreSQL RDS (catalog source-of-truth). */
  | "wholesale-rds"
  /** CardRush price scrape. */
  | "cardrush"
  /** Shopify channel sync. */
  | "shopify"
  /** Stripe payment data. */
  | "stripe"
  /** eBay listing sync. */
  | "ebay"
  /** Cambridge TCG market book (P2P trades). */
  | "ctcg-market"
  /** Cambridge TCG auction book. */
  | "ctcg-auctions"
  /** Cambridge TCG draw-receipt digest chain (legacy source id). */
  | "ctcg-fairness-chain"
  /** Platform internal computation (no upstream source). */
  | "ctcg-derived";

/** Per-record provenance suffix. */
export interface Provenance {
  /** Moment the underlying fact was true. */
  "@as_of": string;
  /** Moment the platform produced this response. */
  "@retrieved_at": string;
  /** Named sources contributing to this record. */
  "@sources": readonly SourceName[];
}

interface ProvenanceOptions {
  as_of?: string | Date;
  retrieved_at?: string | Date;
  sources: readonly SourceName[];
}

function toIso(t: string | Date | undefined): string {
  if (!t) return new Date().toISOString();
  if (t instanceof Date) return t.toISOString();
  return t;
}

/** Build the per-record provenance suffix. */
export function provenance(opts: ProvenanceOptions): Provenance {
  const now = new Date().toISOString();
  return {
    "@as_of": toIso(opts.as_of) || now,
    "@retrieved_at": toIso(opts.retrieved_at) || now,
    "@sources": opts.sources,
  };
}

/**
 * Attach provenance to a record. Returns a new object with the record's
 * fields plus the three `@`-prefixed provenance fields.
 *
 * @example
 *   const row = withProvenance(
 *     { sku: "op-op01-001-ja", price_gbp: "5.40" },
 *     { sources: ["wholesale-rds", "cardrush"], as_of: priceTimestamp }
 *   );
 *   //=> { sku: "...", price_gbp: "...", "@as_of": "...", "@retrieved_at": "...", "@sources": [...] }
 */
export function withProvenance<T extends Record<string, unknown>>(
  record: T,
  opts: ProvenanceOptions,
): T & Provenance {
  return { ...record, ...provenance(opts) };
}

/** Bulk-attach: same provenance to every record in an array. */
export function withProvenanceAll<T extends Record<string, unknown>>(
  records: readonly T[],
  opts: ProvenanceOptions,
): (T & Provenance)[] {
  const p = provenance(opts);
  return records.map((r) => ({ ...r, ...p }));
}
