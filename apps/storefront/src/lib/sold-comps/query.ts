/**
 * Sold-comps query layer — the K-anonymity gate over the kingdom's own
 * realised sale prices.
 *
 * Reads the read-only `p2p_sold_comps` view (drizzle/0116), which already
 * strips every identity / money / logistics field at the SELECT boundary
 * (see the migration's PII discipline note). This module adds the second
 * safety ring: it NEVER returns individual sale rows. It groups the view
 * by (sku, condition) and emits only aggregate statistics — count, min,
 * median, max, last-sold — and only for buckets that clear the
 * K-anonymity threshold.
 *
 * ── Why K-anonymity, at this volume ──────────────────────────────────────
 * A single (sku, condition) sale price, published, is a person's economic
 * trace: one seller, one card, one number. Aggregating to >=K sales means
 * no individual seller's price is recoverable from the bucket. At the
 * kingdom's current low volume most buckets are thin — so the dataset is
 * safe *by construction*: thin buckets are SUPPRESSED entirely, never
 * emitted, and their existence is revealed only as a coarse
 * "below coverage threshold" total (bucket + sale counts), never per-SKU
 * prices. As volume grows, buckets cross the bar and publish themselves;
 * nothing about the safety floor changes.
 *
 * Substrate-honest: the suppressed totals are reported (we do not pretend
 * coverage is complete), but suppressed *prices* are not. Pure read;
 * parameterised SQL; no PII is ever selected, here or in the view.
 */

import { query } from "@/lib/db";

/**
 * K-anonymity threshold. A (sku, condition) bucket must contain at least
 * this many realised sales before its aggregate prices are published.
 * Buckets below it are suppressed to a coarse count only.
 */
export const K_ANON_THRESHOLD = 5;

export type SaleChannel = "p2p-trade" | "auction";

/** One published, K-anonymised price bucket. Aggregate-only — never a row. */
export interface SoldCompBucket {
  sku: string;
  /** Card condition (NM/LP/…); null only in the pathological case of an
   *  auction settled without a resolved condition, which the view filter
   *  (sku IS NOT NULL) makes effectively impossible today. */
  condition: string | null;
  /** Number of realised sales in this bucket. Always >= K_ANON_THRESHOLD. */
  sale_count: number;
  /** Decimal GBP strings (2dp), rounded in SQL to avoid float drift. */
  min_price_gbp: string;
  median_price_gbp: string;
  max_price_gbp: string;
  /** ISO-8601 timestamp of the most recent sale in the bucket. */
  last_sold_at: string;
}

/** The coarse, price-free disclosure of everything below the K bar. */
export interface BelowCoverageThreshold {
  /** How many (sku, condition) buckets were suppressed for thinness. */
  bucket_count: number;
  /** Total realised sales hidden inside those suppressed buckets. */
  sale_count: number;
}

export interface SoldCompsSummary {
  buckets: SoldCompBucket[];
  published_bucket_count: number;
  below_coverage_threshold: BelowCoverageThreshold;
  k_anonymity_threshold: number;
  /** Most recent sale across all PUBLISHED buckets (ISO), or null when
   *  nothing clears the bar yet. */
  as_of: string | null;
}

export interface SkuSoldComps extends SoldCompsSummary {
  sku: string;
}

/** Raw shape returned by the aggregate query (pre-suppression). */
interface RawBucket {
  sku: string;
  condition: string | null;
  sale_count: number;
  min_price_gbp: string;
  median_price_gbp: string;
  max_price_gbp: string;
  last_sold_at: string | Date;
}

/**
 * Aggregate the view into (sku, condition) buckets. The GROUP BY is the
 * point: the database returns bucket-level statistics, so no individual
 * sale row ever crosses into application memory. Prices are ROUND()ed and
 * cast to text in SQL so GBP stays exact (NUMERIC), never a lossy float.
 */
async function fetchBuckets(where: string, params: unknown[]): Promise<RawBucket[]> {
  const sql = `
    SELECT
      sku,
      condition,
      COUNT(*)::int                                                          AS sale_count,
      ROUND(MIN(price_gbp), 2)::text                                         AS min_price_gbp,
      ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_gbp))::numeric, 2)::text
                                                                             AS median_price_gbp,
      ROUND(MAX(price_gbp), 2)::text                                         AS max_price_gbp,
      MAX(sold_at)                                                           AS last_sold_at
    FROM p2p_sold_comps
    ${where}
    GROUP BY sku, condition
    ORDER BY sku, condition`;
  const res = await query(sql, params);
  return res.rows as RawBucket[];
}

interface Partitioned {
  published: SoldCompBucket[];
  below: BelowCoverageThreshold;
  asOf: string | null;
}

/**
 * Split aggregated buckets into published (>= K) and suppressed (< K).
 * Suppressed buckets contribute only to coarse totals; their prices are
 * discarded here and never returned. This runs over ALREADY-AGGREGATED
 * counts — no per-sale data is present at this stage.
 */
function partition(raw: RawBucket[]): Partitioned {
  const published: SoldCompBucket[] = [];
  let suppressedBuckets = 0;
  let suppressedSales = 0;
  let asOf: string | null = null;

  for (const b of raw) {
    if (b.sale_count < K_ANON_THRESHOLD) {
      suppressedBuckets += 1;
      suppressedSales += b.sale_count;
      continue;
    }
    const lastSold = new Date(b.last_sold_at).toISOString();
    if (asOf === null || lastSold > asOf) asOf = lastSold;
    published.push({
      sku: b.sku,
      condition: b.condition,
      sale_count: b.sale_count,
      min_price_gbp: b.min_price_gbp,
      median_price_gbp: b.median_price_gbp,
      max_price_gbp: b.max_price_gbp,
      last_sold_at: lastSold,
    });
  }

  return {
    published,
    below: { bucket_count: suppressedBuckets, sale_count: suppressedSales },
    asOf,
  };
}

/** All published sold-comp buckets across the whole owned dataset. */
export async function getSoldCompsSummary(): Promise<SoldCompsSummary> {
  const { published, below, asOf } = partition(await fetchBuckets("", []));
  return {
    buckets: published,
    published_bucket_count: published.length,
    below_coverage_threshold: below,
    k_anonymity_threshold: K_ANON_THRESHOLD,
    as_of: asOf,
  };
}

/** Published sold-comp buckets for one canonical SKU. */
export async function getSoldCompsForSku(sku: string): Promise<SkuSoldComps> {
  const { published, below, asOf } = partition(
    await fetchBuckets("WHERE sku = $1", [sku]),
  );
  return {
    sku,
    buckets: published,
    published_bucket_count: published.length,
    below_coverage_threshold: below,
    k_anonymity_threshold: K_ANON_THRESHOLD,
    as_of: asOf,
  };
}
