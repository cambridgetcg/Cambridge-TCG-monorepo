/**
 * GET /api/v1/cards/[sku]/everything
 *
 * The composer half of kingdom-090 — given a canonical SKU, return
 * everything the platform knows about that card in one envelope:
 * reviewed publishable price rows, siblings across languages, and the
 * platform's labelled reference price. Restricted source histories are
 * named as blocked rather than summarized onto an anonymous route.
 *
 * Yu's directive: *"POOF!!!! PRICE, TRANSACTION HISTORIES, AVAILABLE
 * SOURCES, DIFFERENT LANGUAGE ALL POPS UP!"* This route is the POOF.
 *
 * ── What it composes ───────────────────────────────────────────────
 *
 * The route is pure-composition over existing wires:
 *   - `fetchCard(sku)`           → card meta + reference price
 *   - `fetchPriceSources(sku)`   → publication status only; values withheld
 *                                  (kingdom-081 multi-source view)
 *   - `fetchPrices({ game, q: setNum })` → siblings (same physical
 *                                          card, different languages)
 *
 * Independent reads run in parallel where their inputs are already known.
 * Each degrades to null on failure; the envelope surfaces the absence with
 * a substrate-honest message rather than fabricating data.
 *
 * ── License & freshness ────────────────────────────────────────────
 *
 * Returns mixed-license data:
 *   - mixed card meta: NOASSERTION (storage is not ownership)
 *   - CardRush observations/history: internal-only and completely withheld;
 *     the derived reference price retains CardRush lineage and tier
 *   - TCGplayer: blocked and never fetched or emitted
 *
 * `_meta.source_license` declares per-source tier so a downstream
 * caller can decide what it may redistribute. Phase 2 will add an
 * auth-gated /everything-tier-2 variant that returns the full tape.
 *
 * Freshness budget: 5 minutes (market_signal).
 */

import { NextRequest } from "next/server";
import {
  fetchCard,
  fetchPriceSources,
  type SourcePriceRow,
} from "@/lib/wholesale/client";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { skuIdentity, type SkuIdentity } from "@cambridge-tcg/sku";
import { positivePrice } from "@cambridge-tcg/pricing";
import { fetchSearchCandidates, type SearchCandidates } from "@/lib/search/catalog-lookup";
import {
  classifySibling,
  compareVariantKinds,
  type VariantKind,
} from "@/lib/search/variants";

export const runtime = "nodejs";

// ── Public response shape (typed for partners + the search page) ────

interface EverythingCard {
  sku: string;
  identity: SkuIdentity;
  game: string | null;
  set_code: string | null;
  card_number: string;
  lang: string | null;
  variant: string | null;
  name: string;
  name_en: string | null;
  name_translations: Record<string, string> | null;
  image_url: string | null;
  rarity: string | null;
  set_name: string | null;
}

interface PriceTodayRow {
  source: string;
  source_url: string | null;
  source_currency: string;
  source_license_tier: string;
  source_redistribute: boolean;
  amount_gbp: number;
  base_gbp: number;
  /** Substrate-honest: when source is cardrush, the raw upstream JPY is
   *  redistributable=false; surface it only when license allows. */
  raw: {
    cardrush_jpy: number | null;
    gbp_jpy_rate: number | null;
  };
  snapshot_date: string;
  ingest_run_id: number | null;
  error_reason: string | null;
}

interface HistorySummary {
  source: string;
  source_license_tier: string;
  count: number;
  /** Whether the points array is included in this response (Phase 1
   *  public tier returns summary stats only when the source's license
   *  doesn't permit raw redistribution). */
  points_included: boolean;
  /** Aggregate stats over a publishable observation series. Restricted
   *  source history is omitted rather than treated as safe by derivation. */
  summary: {
    earliest: string | null;
    latest: string | null;
    median_gbp: number | null;
    min_gbp: number | null;
    max_gbp: number | null;
    observations: number;
  };
  /** Sparkline points when points_included=true (currently never on
   *  Phase 1 public; reserved for Phase 2 auth-gated variant). */
  points: Array<{
    date: string;
    amount_gbp: number;
    condition?: string;
  }> | null;
}

interface SiblingRow {
  sku: string;
  lang: string | null;
  variant: string | null;
  /** Print's set code (often same as parsed.set; differs for super-parallels). */
  set_code: string | null;
  /** Card's rarity per wholesale; null when unset. */
  rarity: string | null;
  name: string;
  image_url: string | null;
  has_current_price: boolean;
  price_gbp: number | null;
  /** Whether this row IS the requested SKU (UI marks it ★). */
  is_self: boolean;
  /** Classified kind — kingdom-090 follow-up. See lib/search/variants.ts. */
  variant_kind: VariantKind;
  /** Substrate-honest: why this kind was chosen. */
  variant_kind_reason: string;
  /** Inferred from card-name script (CJK → ja, Latin → en). Distinct
   *  from the SKU's lang segment because OPTCG ships both JP-text and
   *  EN-text prints inside the same JP-set, both stored with lang=jp. */
  effective_language: "ja" | "en" | "unknown";
}

/** The house's spot price, surviving the collectors-first pivot
 *  (docs/decisions/2026-07-06-collectors-first.md) only as a labelled
 *  reference — never an offer. The shop-era quote block
 *  (sell_price_gbp / sell_in_stock / trade_in_* hooks) is retired: the
 *  house holds no retail position and neither sells nor buys cards. */
interface ReferencePrice {
  reference_price_gbp: number | null;
  /** Where the number comes from, so downstream consumers can label it. */
  provenance: string;
  /** Structural guard for machine consumers: this block is not an ask. */
  is_offer: false;
}

interface EverythingPayload {
  card: EverythingCard;
  prices_today: {
    snapshot_date: string | null;
    rows: PriceTodayRow[];
    agreement: {
      distinct_source_count: number;
      min_gbp: number | null;
      max_gbp: number | null;
      spread_gbp: number | null;
      coefficient_of_variation: number | null;
    } | null;
    note: string;
  };
  history: HistorySummary[];
  siblings: SiblingRow[];
  reference_price: ReferencePrice;
  /** Operator-visible breadcrumb: what we tried to compose + how each
   *  Falcon call resolved. 'error' = the call failed; 'absent' = it
   *  completed without data (for siblings, a successful call with zero
   *  rows is 'ok'). UI can render this in a debug panel. */
  composition: {
    falcon_calls: Record<string, "ok" | "absent" | "error" | "blocked">;
    siblings_truncated: boolean;
  };
}

function priceRowFromSource(r: SourcePriceRow): PriceTodayRow {
  return {
    source: r.source,
    source_url: r.source_url,
    source_currency: r.source_currency,
    source_license_tier: r.source_license_tier,
    source_redistribute: r.source_redistribute,
    amount_gbp: r.price_gbp,
    base_gbp: r.base_gbp,
    raw: {
      cardrush_jpy: r.source_redistribute ? positivePrice(r.cardrush_jpy) : null,
      gbp_jpy_rate: positivePrice(r.gbp_jpy_rate),
    },
    snapshot_date: r.snapshot_date,
    ingest_run_id: r.ingest_run_id,
    error_reason: r.error_reason,
  };
}

const PUBLIC_REUSE_TIERS = new Set(["cc0", "cc-by", "cc-by-sa", "mit"]);

function isAnonymousPublishableRow(r: SourcePriceRow): boolean {
  // These two sources are closed on this anonymous route regardless of a
  // stale/mistagged row returned by another service.
  if (r.source === "cardrush" || r.source === "tcgplayer") return false;
  return r.source_redistribute === true && PUBLIC_REUSE_TIERS.has(r.source_license_tier) &&
    positivePrice(r.price_gbp) !== null && Number.isFinite(r.base_gbp) && r.base_gbp >= 0 &&
    r.error_reason === null;
}

// ── Route ───────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sku: string }> },
) {
  const { sku: rawSku } = await ctx.params;
  // Preserve the caller's SKU case — wholesale data carries legacy
  // UPPERCASE SKUs (kingdom-071 normalize migration is still in drafts).
  // Lowercasing here would 404 the Falcon's `cards.sku === X` lookup.
  // Next route params are already decoded. Normalization describes syntax;
  // it does not replace the case-sensitive storage key.
  const sku = rawSku.trim();

  const parsed = sku.length <= 256 ? skuIdentity(sku) : null;
  if (!parsed || parsed.game === "tst") {
    return errorResponse({
      code: "INVALID_SKU",
      message:
        `'${rawSku}' is not a canonical SKU. Expected '<game>-<set>-<number>-<lang>[-<variant>]' (e.g. 'op-op01-001-ja' or legacy 'OP-OP01-001-JP-V11DZ').`,
      docs: "/methodology/sku-standard",
    });
  }

  // Fire every Falcon call in parallel. Each degrades to null on
  // failure; we surface absence in `composition.falcon_calls`. If the
  // primary SKU returns 404, retry once with case-swap (covers the
  // case where the caller normalized to lowercase but data is legacy
  // uppercase, or vice versa) — substrate-honest tolerance.
  let [card, priceSources] = await Promise.all([
    fetchCard(sku),
    fetchPriceSources({ sku }),
  ]);

  if (!card) {
    // Retry with swapped case. Legacy data is uppercase; canonical is
    // lowercase. The Falcon's case-sensitive lookup may need either.
    const altSku = sku === sku.toUpperCase() ? sku.toLowerCase() : sku.toUpperCase();
    if (altSku !== sku) {
      const altCard = await fetchCard(altSku);
      if (altCard) {
        card = altCard;
        // Re-fire the dependents with the corrected casing.
        priceSources = await fetchPriceSources({ sku: altSku });
      }
    }
  }

  // One bounded game-scoped lookup serves alias recovery and siblings.
  // Never infer the game from a set code shared by unrelated catalogs.
  let siblingResponse: SearchCandidates | undefined;
  const getSiblingCandidates = () => fetchSearchCandidates({
    game: parsed.game, q: `${parsed.set}-${parsed.number}`, limit: 50,
  });
  if (!card) {
    siblingResponse = await getSiblingCandidates();
    const exact = siblingResponse.items.filter((row) =>
      skuIdentity(row.sku)?.canonical_sku === parsed.canonical_sku);
    if (exact.length > 1 || siblingResponse.truncated) {
      return errorResponse({ code: "INVALID_INPUT", status: 409,
        message: "The normalization lookup is ambiguous or incomplete. Choose an explicit stored identifier before composing card data.",
        details: { sku, candidate_count: exact.length, truncated: siblingResponse.truncated } });
    }
    if (exact.length === 1) {
      card = await fetchCard(exact[0]!.sku);
      if (card) priceSources = await fetchPriceSources({ sku: card.sku });
    }
  }
  if (!card) {
    return errorResponse({
      code: siblingResponse?.source === "unavailable" ? "SOURCE_UNAVAILABLE" : "NOT_FOUND",
      message: siblingResponse?.source === "unavailable"
        ? "The card catalog is unavailable. Try again later."
        : `Card '${sku}' not found in the wholesale catalog.`,
      details: { sku },
    });
  }
  const cardIdentity = skuIdentity(card.sku);
  if (!cardIdentity || cardIdentity.canonical_sku !== parsed.canonical_sku) {
    return errorResponse({ code: "SOURCE_UNAVAILABLE",
      message: "The catalog returned a different card identifier; composition was stopped.", details: { sku } });
  }
  // Source prices use the actual storage key, not a normalized-identity join.
  let priceSourceIdentityMismatch = false;
  if (priceSources && priceSources.sku !== card.sku) {
    priceSources = await fetchPriceSources({ sku: card.sku });
    if (priceSources && priceSources.sku !== card.sku) {
      priceSourceIdentityMismatch = true;
      priceSources = null;
    }
  }
  siblingResponse ??= await getSiblingCandidates();
  const siblingItems = siblingResponse.items;
  const siblingsErrored = siblingResponse.source === "unavailable";

  // A sibling candidate shares game, set and number; each raw SKU stays intact.
  const selfCanonical = cardIdentity.canonical_sku;
  const siblings: SiblingRow[] = siblingItems
    .filter((item) => {
      const ps = skuIdentity(item.sku);
      return ps && ps.game === parsed.game && ps.set === parsed.set && ps.number === parsed.number;
    })
    .map((item) => {
      const ps = skuIdentity(item.sku);
      const is_self = ps?.canonical_sku === selfCanonical;
      const classified = classifySibling({
        sibling: {
          sku: item.sku,
          set_code: item.set_code,
          name: item.name ?? "",
          name_en: item.name_en,
          rarity: item.rarity,
        },
        self: {
          sku: card?.sku ?? sku,
          set_code: card?.set_code ?? null,
          name: card?.name ?? "",
          name_en: card?.name_en ?? null,
        },
      });
      // Override the kind to "self" for the actual self row; the
      // classifier would do this too but we double-confirm against
      // the lowercased SKU comparison.
      const variant_kind = is_self ? "self" : classified.variant_kind;
      const variant_kind_reason = is_self
        ? "self: exact SKU match"
        : classified.variant_kind_reason;
      return {
        sku: item.sku,
        lang: ps?.lang ?? null,
        variant: ps?.variant ?? null,
        set_code: item.set_code,
        rarity: item.rarity,
        name: item.name ?? item.card_number,
        image_url: null,
        has_current_price: false,
        price_gbp: null,
        is_self,
        variant_kind,
        variant_kind_reason,
        effective_language: classified.effective_language,
      };
    })
    .sort((a, b) => {
      // Self first; then by variant_kind order; then by SKU for stability.
      if (a.is_self !== b.is_self) return a.is_self ? -1 : 1;
      const k = compareVariantKinds(a.variant_kind, b.variant_kind);
      if (k !== 0) return k;
      return a.sku.localeCompare(b.sku);
    });

  // ── prices_today block ────────────────────────────────────────────
  const sourcePriceRows = priceSources?.prices ?? [];
  const blockedTcgplayerRows =
    sourcePriceRows.filter((row) => row.source === "tcgplayer").length;
  const withheldRightsRows = sourcePriceRows.filter(
    (row) => row.source !== "tcgplayer" && !isAnonymousPublishableRow(row),
  ).length;
  const withheldSourceRows = blockedTcgplayerRows + withheldRightsRows;
  const pricesTodayRows = sourcePriceRows
    .filter(isAnonymousPublishableRow)
    .map(priceRowFromSource);
  const withholdingNotes = [
    ...(withheldRightsRows > 0
      ? [
          "Restricted, malformed, failed, or otherwise nonredistributable source rows were withheld from this anonymous response.",
        ]
      : []),
    ...(blockedTcgplayerRows > 0
      ? [
          "Stored TCGplayer rows were withheld. Cambridge has no recorded written approval for this multi-source use.",
        ]
      : []),
  ];
  const pricesToday = {
    snapshot_date: priceSources?.snapshot_date ?? null,
    rows: pricesTodayRows,
    // Agreement values are computed from the source rows. Withhold them too
    // whenever any contributing row is not publishable on this anonymous door.
    agreement: withheldSourceRows > 0 ? null : (priceSources?.agreement ?? null),
    note: withholdingNotes.length > 0
      ? withholdingNotes.join(" ")
      : (priceSources?.note ?? (
        pricesTodayRows.length === 0
        ? "No source rows yet. Either this card hasn't been scraped, or no source has reported a price for it on any snapshot date."
        : ""
      )),
  };

  // Restricted source history is never summarized onto this anonymous
  // route: a one-row min/median/max would reproduce the protected value.
  const history: HistorySummary[] = [];

  // ── labelled reference price ──────────────────────────────────────
  const reference_price: ReferencePrice = {
    reference_price_gbp: null,
    provenance:
      "Legacy wholesale reference values are withheld pending field-level source-rights review; this block is not an offer.",
    is_offer: false,
  };

  // ── card meta block ───────────────────────────────────────────────
  const cardMeta: EverythingCard = {
    sku: card.sku,
    identity: cardIdentity,
    game: cardIdentity.game,
    set_code: card.set_code,
    card_number: card.card_number,
    lang: cardIdentity.lang,
    variant: cardIdentity.variant,
    name: card.name ?? card.card_number,
    name_en: card.name_en,
    name_translations: card.name_translations ?? null,
    image_url: null,
    rarity: card.rarity,
    set_name: card.set_name,
  };

  // ── composition trace (operator visibility) ───────────────────────
  // Reachability constraint: the wholesale client degrades transport
  // failures to null for price_sources, so that key reads 'absent' during
  // an upstream outage. Siblings is exact (the
  // client stamps source='unavailable'). Full error-vs-absent needs an
  // error sentinel in lib/wholesale/client.ts.
  const composition: EverythingPayload["composition"] = {
    siblings_truncated: siblingResponse.truncated,
    falcon_calls: {
      card: "ok",
      price_sources: priceSourceIdentityMismatch ? "error" : priceSources ? "ok" : "absent",
      cardrush_history: "blocked",
      tcgplayer_history: "blocked",
      // A successful sibling query with zero rows is 'ok', not 'absent'.
      siblings: siblingsErrored && siblings.length === 0 ? "error" : "ok",
    },
  };

  // Build the `_meta.sources` + `_meta.source_license` parallel arrays
  // declaring per-source rights.
  const sources: string[] = ["wholesale-rds.cards"];
  const source_license: string[] = ["proprietary"];

  const data: EverythingPayload = {
    card: cardMeta,
    prices_today: pricesToday,
    history,
    siblings,
    reference_price,
    composition,
  };

  return jsonResponse({
    endpoint: "/api/v1/cards/[sku]/everything",
    data,
    sources,
    source_license,
    license: "NOASSERTION",
    freshness: "market_signal",
    as_of: pricesToday.snapshot_date ?? undefined,
  });
}
