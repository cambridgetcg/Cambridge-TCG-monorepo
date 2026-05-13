/**
 * Normalize a raw eBay observation into a canonical record. Two
 * decisions happen here:
 *
 *   1. Does the title parse to a SKU we trust enough to write?
 *      → run `parseEbayTitle()`; check `forces_quarantine`;
 *      check `confidence ≥ threshold`.
 *
 *   2. Does the parsed SKU match the SKU we asked the watch list for?
 *      → if not, the listing is the wrong card (eBay search returned a
 *      similarly-named but distinct printing); quarantine with the
 *      drift reason so the operator can refine the watch-list query.
 *
 * Substrate-honesty rules:
 *
 *   - Never write a row to the wrong SKU. The expected/parsed mismatch
 *     is *evidence the search needs a better query*, not a tolerable
 *     write target.
 *   - When in doubt, quarantine. The downstream surface aggregates from
 *     observations + can show "n=12 confident, n=4 quarantined" honestly.
 *   - Carry the raw title + every parse signal out so the operator can
 *     audit *why* we accepted or rejected.
 */

import type { NormalizeResult } from "../types";
import type { CanonicalPrice } from "../canonical";
import { parseEbayTitle } from "./title-parser";
import type { EbayRaw, EbayBrowseRaw, EbayInsightsRaw } from "./types";

/** Default confidence threshold — below this we quarantine. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Cambridge-TCG-specific canonical observation, extending `CanonicalPrice`
 * with eBay's per-listing context fields. Downstream writers store the
 * full shape; cross-source aggregators read only the `CanonicalPrice` subset.
 */
export interface EbayCanonicalObservation extends CanonicalPrice {
  /** eBay listing identifier — the dedup key. */
  listing_id: string;
  /** eBay marketplace this listing lives on. */
  marketplace_id: string;
  /** API surface this row came from. */
  api_surface: "browse" | "marketplace-insights";
  /** True only when the row came from Marketplace Insights (verified sale). */
  first_party: boolean;
  /** Original eBay title (audit trail). */
  raw_title: string;
  /** Confidence of the title parse ∈ [0, 1]. */
  parsed_confidence: number;
  /** Grading company when graded. */
  grade_company: string | null;
  /** Grading value when graded. */
  grade_value: string | null;
  /** Variant token (foil, 1st-edition, etc) or null. */
  variant: string | null;
  /** Condition-keyword tokens we matched in the title. */
  condition_keywords: string[];
  /** eBay item URL for verification. */
  source_url: string | null;
  /** Shipping cost in the same currency, when known. */
  shipping_amount: string | null;
  /** Total (price + shipping) in the same currency. */
  total_amount: string | null;
}

// ── Sale-type mapping from eBay buyingOptions ──────────────────────────

function mapSaleTypeFromBrowse(item: EbayBrowseRaw["item"]): CanonicalPrice["sale_type"] {
  const opts = item.buyingOptions ?? [];
  // 'FIXED_PRICE' alone = BIN; 'AUCTION' = auction; 'AUCTION_WITH_BIN' = both
  // For Browse API, the row is always a current ask of some kind.
  if (opts.includes("AUCTION")) {
    return item.bidCount && item.bidCount > 0 ? "auction-current" : "ask";
  }
  return "ask";
}

// ── Condition normalisation ────────────────────────────────────────────
//
// eBay returns its own condition vocabulary in the `condition` field
// (NEW, LIKE_NEW, USED_EXCELLENT, USED_VERY_GOOD, USED_GOOD, USED_ACCEPTABLE).
// We treat the title's keyword-derived condition as authoritative when
// present (graded-card titles set this best); fall through to eBay's
// declared field when the title carries no signal.

function mapEbayCondition(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "new" || lower === "like_new") return "near-mint";
  if (lower === "used_excellent") return "lightly-played";
  if (lower === "used_very_good") return "played";
  if (lower === "used_good") return "played";
  if (lower === "used_acceptable") return "played";
  return null;
}

// ── Browse-row normaliser ──────────────────────────────────────────────

function normalizeBrowseRow(
  row: EbayBrowseRaw,
  threshold: number,
): NormalizeResult<EbayCanonicalObservation> {
  const { item, expected_sku, marketplace_id, fetched_at, query } = row;

  if (!item.title || typeof item.title !== "string") {
    return { ok: false, reason: "ebay row has no title" };
  }

  const parse = parseEbayTitle(item.title);

  if (parse.forces_quarantine) {
    return {
      ok: false,
      reason:
        parse.condition.exclude
          ? `condition exclusion: ${parse.condition.excluded_keywords.join(",")} in title "${item.title}"`
          : `sealed/bundle variant '${parse.variant ?? "unknown"}' not in singles-priced shape: "${item.title}"`,
    };
  }

  if (parse.sku === null) {
    return {
      ok: false,
      reason: `low-confidence title parse (confidence ${parse.confidence.toFixed(2)}; notes ${parse.notes.join("|")}): "${item.title}"`,
    };
  }

  if (parse.confidence < threshold) {
    return {
      ok: false,
      reason: `confidence ${parse.confidence.toFixed(2)} below threshold ${threshold} for "${item.title}"; notes: ${parse.notes.join("|")}`,
    };
  }

  // Substrate honesty: the parsed SKU must match what the watch list asked for.
  // If not, this is the wrong card (eBay search drifted). Quarantine.
  const parsed_lower = parse.sku.toLowerCase();
  const expected_lower = expected_sku.toLowerCase();
  if (parsed_lower !== expected_lower) {
    return {
      ok: false,
      reason: `sku-drift: parsed "${parsed_lower}" but watch-list asked for "${expected_lower}" (query="${query}", title="${item.title}")`,
    };
  }

  // Price
  if (!item.price || !item.price.value) {
    return { ok: false, reason: `ebay row has no price block: "${item.title}"` };
  }

  const amount = item.price.value;
  const currency = item.price.currency as CanonicalPrice["currency"];
  if (!isSupportedCurrency(currency)) {
    return { ok: false, reason: `unsupported currency '${currency}' on eBay row "${item.title}"` };
  }

  // Shipping
  const shippingOpt = item.shippingOptions?.[0];
  const shipping_amount = shippingOpt?.shippingCost?.value ?? null;
  const total_amount =
    shipping_amount !== null
      ? (parseFloat(amount) + parseFloat(shipping_amount)).toFixed(2)
      : null;

  // Condition — title keywords win when present, eBay's declared field is fallback
  const condition_from_title = parse.condition.condition;
  const condition_from_ebay = mapEbayCondition(item.condition);
  // When graded, the condition concept doesn't apply the same way — set to "graded"
  const condition = parse.grade.grade_company !== null
    ? "graded"
    : condition_from_title ?? condition_from_ebay;

  const sale_type = mapSaleTypeFromBrowse(item);

  const listing_id = item.legacyItemId ?? item.itemId;
  if (!listing_id) {
    return { ok: false, reason: `ebay row has no listing id: "${item.title}"` };
  }

  const record: EbayCanonicalObservation = {
    sku: parse.sku,
    currency,
    amount,
    condition: condition ?? undefined,
    sale_type,
    observed_at: fetched_at,
    retrieved_at: fetched_at,
    upstream_id: listing_id,
    listing_id,
    marketplace_id,
    api_surface: "browse",
    first_party: false,
    raw_title: item.title,
    parsed_confidence: parse.confidence,
    grade_company: parse.grade.grade_company,
    grade_value: parse.grade.grade_value,
    variant: parse.variant,
    condition_keywords: [
      ...parse.condition.neutral_keywords,
      ...parse.condition.excluded_keywords,
    ],
    source_url: item.itemWebUrl ?? null,
    shipping_amount,
    total_amount,
  };

  return { ok: true, record };
}

// ── Insights-row normaliser (deferred — defined for the day MI lands) ──

function normalizeInsightsRow(
  row: EbayInsightsRaw,
  threshold: number,
): NormalizeResult<EbayCanonicalObservation> {
  const { item, expected_sku, marketplace_id, fetched_at, query } = row;

  if (!item.title) return { ok: false, reason: "marketplace-insights row has no title" };
  if (!item.lastSoldPrice || !item.lastSoldDate) {
    return { ok: false, reason: `marketplace-insights row missing lastSoldPrice/Date: "${item.title}"` };
  }

  const parse = parseEbayTitle(item.title);

  if (parse.forces_quarantine) {
    return {
      ok: false,
      reason:
        parse.condition.exclude
          ? `condition exclusion: ${parse.condition.excluded_keywords.join(",")} in title "${item.title}"`
          : `sealed/bundle variant '${parse.variant ?? "unknown"}' on MI row: "${item.title}"`,
    };
  }

  if (parse.sku === null || parse.confidence < threshold) {
    return {
      ok: false,
      reason: `low-confidence MI parse (confidence ${parse.confidence.toFixed(2)}): "${item.title}"`,
    };
  }

  const parsed_lower = parse.sku.toLowerCase();
  if (parsed_lower !== expected_sku.toLowerCase()) {
    return {
      ok: false,
      reason: `MI sku-drift: parsed "${parsed_lower}" expected "${expected_sku}" (query="${query}")`,
    };
  }

  const amount = item.lastSoldPrice.value;
  const currency = item.lastSoldPrice.currency as CanonicalPrice["currency"];
  if (!isSupportedCurrency(currency)) {
    return { ok: false, reason: `unsupported currency '${currency}' on MI row "${item.title}"` };
  }

  const listing_id = item.legacyItemId ?? item.itemId;
  if (!listing_id) {
    return { ok: false, reason: `marketplace-insights row has no listing id` };
  }

  const sale_type: CanonicalPrice["sale_type"] = item.buyingOptions?.includes("AUCTION")
    ? "auction-final"
    : "retail";

  const record: EbayCanonicalObservation = {
    sku: parse.sku,
    currency,
    amount,
    condition: parse.grade.grade_company !== null ? "graded" : parse.condition.condition ?? mapEbayCondition(item.condition) ?? undefined,
    sale_type,
    observed_at: item.lastSoldDate,
    retrieved_at: fetched_at,
    upstream_id: listing_id,
    listing_id,
    marketplace_id,
    api_surface: "marketplace-insights",
    first_party: true,
    raw_title: item.title,
    parsed_confidence: parse.confidence,
    grade_company: parse.grade.grade_company,
    grade_value: parse.grade.grade_value,
    variant: parse.variant,
    condition_keywords: [
      ...parse.condition.neutral_keywords,
      ...parse.condition.excluded_keywords,
    ],
    source_url: item.itemWebUrl ?? null,
    shipping_amount: null,
    total_amount: null,
  };

  return { ok: true, record };
}

// ── Currency gate ──────────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = new Set(["GBP", "USD", "EUR", "JPY", "KRW", "CNY"]);

function isSupportedCurrency(c: string): c is CanonicalPrice["currency"] {
  return SUPPORTED_CURRENCIES.has(c);
}

// ── Public entry point ─────────────────────────────────────────────────

/**
 * Normalize one eBay raw row. Pure: same input → same output. Never
 * throws — failures return `{ ok: false, reason }`.
 */
export function normalizeEbay(
  raw: EbayRaw,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): NormalizeResult<EbayCanonicalObservation> {
  if (raw.api_surface === "browse") return normalizeBrowseRow(raw, threshold);
  return normalizeInsightsRow(raw, threshold);
}
