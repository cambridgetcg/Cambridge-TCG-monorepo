/**
 * GET /api/v1/cards/[sku]/everything
 *
 * The composer half of kingdom-090 — given a canonical SKU, return
 * everything the platform knows about that card in one envelope:
 * price across every source, history (cardrush + tcgplayer), siblings
 * across languages, and the platform's labelled reference price.
 *
 * Yu's directive: *"POOF!!!! PRICE, TRANSACTION HISTORIES, AVAILABLE
 * SOURCES, DIFFERENT LANGUAGE ALL POPS UP!"* This route is the POOF.
 *
 * ── What it composes ───────────────────────────────────────────────
 *
 * The route is pure-composition over existing wires:
 *   - `fetchCard(sku)`           → card meta + reference price
 *   - `fetchPriceSources(sku)`   → today's prices across sources
 *                                  (kingdom-081 multi-source view)
 *   - `fetchCardrushHistory(sku)` (license-aware; degrades silently)
 *   - `fetchTcgplayerHistory(sku)` (license-aware; degrades silently)
 *   - `fetchPrices({ game, q: setNum })` → siblings (same physical
 *                                          card, different languages)
 *
 * All Falcon calls fire in parallel. Each degrades to null on failure;
 * the envelope surfaces the absence with a substrate-honest message
 * rather than fabricating data.
 *
 * ── License & freshness ────────────────────────────────────────────
 *
 * Returns mixed-license data:
 *   - card meta + reference price: CC0
 *   - cardrush observations: internal-only (skipped unless auth-gated;
 *     this Phase 1 route returns only sparkline-summary stats from
 *     cardrush — no raw upstream values)
 *   - tcgplayer observations: partner-redistributable (same treatment
 *     in Phase 1)
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
  fetchCardrushHistory,
  fetchTcgplayerHistory,
  fetchPrices,
  fetchGames,
  fetchSets,
  type PriceItem,
  type SourcePriceRow,
} from "@/lib/wholesale/client";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { parseSkuShape } from "@/lib/search/resolver";
import {
  classifySibling,
  compareVariantKinds,
  type VariantKind,
} from "@/lib/search/variants";

export const runtime = "nodejs";

// ── Public response shape (typed for partners + the search page) ────

interface EverythingCard {
  sku: string;
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
  /** Aggregate stats over the observation series. Always safe to
   *  publish — derived statistics don't carry the upstream's terms. */
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
    falcon_calls: Record<string, "ok" | "absent" | "error">;
  };
}

// ── Pure summary helpers ────────────────────────────────────────────

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

function summarizeCardrush(
  obs: Array<{ snapshot_date: string; price_gbp: number | null }>,
): HistorySummary["summary"] {
  const prices = obs
    .map((o) => o.price_gbp)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const dates = obs.map((o) => o.snapshot_date).sort();
  return {
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
    median_gbp: median(prices),
    min_gbp: prices.length > 0 ? Math.min(...prices) : null,
    max_gbp: prices.length > 0 ? Math.max(...prices) : null,
    observations: prices.length,
  };
}

function summarizeTcgplayer(
  obs: Array<{ snapshot_date: string; price_gbp: number | null }>,
): HistorySummary["summary"] {
  // Same shape; reuse the cardrush summary.
  return summarizeCardrush(obs);
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
      cardrush_jpy: r.source_redistribute ? r.cardrush_jpy : null,
      gbp_jpy_rate: r.gbp_jpy_rate,
    },
    snapshot_date: r.snapshot_date,
    ingest_run_id: r.ingest_run_id,
    error_reason: r.error_reason,
  };
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
  // Shape parsing (parseSkuShape) is case-insensitive internally.
  const sku = decodeURIComponent(rawSku).trim();

  const parsed = parseSkuShape(sku);
  if (!parsed) {
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
  let [card, priceSources, cardrushRes, tcgplayerRes] = await Promise.all([
    fetchCard(sku),
    fetchPriceSources({ sku }),
    fetchCardrushHistory({ sku, limit: 365 }).catch(() => "error" as const),
    fetchTcgplayerHistory({ sku, limit: 365 }).catch(() => "error" as const),
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
        const [ps, ch, th] = await Promise.all([
          fetchPriceSources({ sku: altSku }),
          fetchCardrushHistory({ sku: altSku, limit: 365 }).catch(() => "error" as const),
          fetchTcgplayerHistory({ sku: altSku, limit: 365 }).catch(() => "error" as const),
        ]);
        priceSources = ps;
        cardrushRes = ch;
        tcgplayerRes = th;
      }
    }
  }

  if (!card) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Card '${sku}' not found in the wholesale catalog.`,
      details: { sku },
    });
  }

  const cardrushHist = cardrushRes === "error" ? null : cardrushRes;
  const tcgplayerHist = tcgplayerRes === "error" ? null : tcgplayerRes;

  // ── Siblings: same physical card, different language/variant. ────
  // Query the wholesale prices route for SET-NUMBER without lang;
  // returns every language variant for this set + number. The SKU's
  // game prefix may be lowercase code ("op") but wholesale's games
  // table filter may require slug ("one-piece"); try a sequence:
  //   1. game as-parsed
  //   2. case variants
  //   3. fetchGames() lookup to find slug for the code
  // The reliable path: look up the set → its game_code (or slug) → use
  // that for the siblings query. The wholesale /api/v1/sets endpoint
  // exposes game_code per set; this lets the composer be game-table-
  // case-agnostic. Falls back to trying the SKU's parsed game prefix
  // if the set lookup fails.
  async function fetchSiblings(): Promise<{ items: PriceItem[]; errored: boolean }> {
    const q = `${parsed!.set}-${parsed!.number}`;
    const tried = new Set<string>();
    // fetchPrices stamps source='unavailable' when both substrates
    // failed — the one Falcon call here whose outage IS distinguishable
    // from a genuine empty result.
    let errored = false;
    async function tryGame(g: string): Promise<PriceItem[] | null> {
      if (tried.has(g)) return null;
      tried.add(g);
      const r = await fetchPrices({ game: g, q, limit: 50 }).catch(
        () => ({ items: [] as PriceItem[], source: "unavailable" as const }),
      );
      if (r.source === "unavailable") errored = true;
      return r.items.length > 0 ? r.items : null;
    }

    // 1. Look up the set in wholesale and use whatever game token it
    //    declares (code or slug or any field that matches the data).
    //    fetchSets returns SetItem with `game_code`.
    const sets = await fetchSets().catch(() => []);
    const matchedSet = sets.find(
      (s) => s.code.toLowerCase() === parsed!.set,
    );
    if (matchedSet) {
      const r0 = await tryGame(matchedSet.game_code);
      if (r0) return { items: r0, errored };
    }

    // 2. SKU-parsed game prefix + case variants.
    const r1 = await tryGame(parsed!.game);
    if (r1) return { items: r1, errored };
    const r2 = await tryGame(parsed!.game.toUpperCase());
    if (r2) return { items: r2, errored };

    // 3. fetchGames-based fallback (permissive prefix match).
    const games = await fetchGames().catch(() => []);
    const match = games.find(
      (g) =>
        g.code.toLowerCase() === parsed!.game ||
        g.slug.toLowerCase() === parsed!.game ||
        (parsed!.game.length >= 2 && g.code.toLowerCase().startsWith(parsed!.game)) ||
        (parsed!.game.length >= 2 && g.slug.toLowerCase().startsWith(parsed!.game)),
    );
    if (match) {
      const r3 = await tryGame(match.slug);
      if (r3) return { items: r3, errored };
      const r4 = await tryGame(match.code);
      if (r4) return { items: r4, errored };
    }
    return { items: [], errored };
  }
  const { items: siblingItems, errored: siblingsErrored } = await fetchSiblings();

  // Compare on lowercased SKUs — legacy data is uppercase, user input
  // can be either; canonicalize for the equality check.
  const selfSkuLower = (card?.sku ?? sku).toLowerCase();
  const siblings: SiblingRow[] = siblingItems
    .filter((item) => {
      const ps = parseSkuShape(item.sku);
      return ps && ps.set === parsed.set && ps.number === parsed.number;
    })
    .map((item) => {
      const ps = parseSkuShape(item.sku);
      const is_self = item.sku.toLowerCase() === selfSkuLower;
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
        image_url: item.image_url,
        has_current_price: typeof item.price_gbp === "number" && item.price_gbp > 0,
        price_gbp: typeof item.price_gbp === "number" ? item.price_gbp : null,
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
  const pricesTodayRows = priceSources?.prices.map(priceRowFromSource) ?? [];
  const pricesToday = {
    snapshot_date: priceSources?.snapshot_date ?? null,
    rows: pricesTodayRows,
    agreement: priceSources?.agreement ?? null,
    note: priceSources?.note ?? (
      pricesTodayRows.length === 0
        ? "No source rows yet. Either this card hasn't been scraped, or no source has reported a price for it on any snapshot date."
        : ""
    ),
  };

  // ── history block (sparkline summaries only on Phase 1 public) ────
  const history: HistorySummary[] = [];

  if (cardrushHist && cardrushHist.observations.length > 0) {
    history.push({
      source: "cardrush",
      source_license_tier: "internal-only",
      count: cardrushHist.observations.length,
      points_included: false,
      summary: summarizeCardrush(
        cardrushHist.observations.map((o) => ({
          snapshot_date: o.snapshot_date,
          price_gbp: o.price_gbp,
        })),
      ),
      points: null,
    });
  }

  if (tcgplayerHist && tcgplayerHist.observations.length > 0) {
    history.push({
      source: "tcgplayer",
      source_license_tier: "partner-redistributable",
      count: tcgplayerHist.observations.length,
      points_included: false,
      summary: summarizeTcgplayer(
        tcgplayerHist.observations.map((o) => ({
          snapshot_date: o.snapshot_date,
          price_gbp: o.price_gbp,
        })),
      ),
      points: null,
    });
  }

  // ── labelled reference price ──────────────────────────────────────
  const reference_price: ReferencePrice = {
    reference_price_gbp:
      typeof card.price_gbp === "number" ? card.price_gbp : null,
    provenance:
      "ctcg spot-pricing pipeline (wholesale-rds.cards) — a labelled reference price, not an offer; the house neither sells nor buys cards (collectors-first, 2026-07-06)",
    is_offer: false,
  };

  // ── card meta block ───────────────────────────────────────────────
  const cardMeta: EverythingCard = {
    sku: card.sku,
    game: parsed.game,
    set_code: card.set_code,
    card_number: card.card_number,
    lang: parsed.lang,
    variant: parsed.variant,
    name: card.name ?? card.card_number,
    name_en: card.name_en,
    name_translations: card.name_translations ?? null,
    image_url: card.image_url,
    rarity: card.rarity,
    set_name: card.set_name,
  };

  // ── composition trace (operator visibility) ───────────────────────
  // Reachability constraint: the wholesale client degrades transport
  // failures to null for price_sources and the two history calls, so
  // those keys read 'absent' during an upstream outage — 'error' fires
  // only for rejections that escape the client. Siblings is exact (the
  // client stamps source='unavailable'). Full error-vs-absent needs an
  // error sentinel in lib/wholesale/client.ts.
  const composition: EverythingPayload["composition"] = {
    falcon_calls: {
      card: "ok",
      price_sources: priceSources ? "ok" : "absent",
      cardrush_history:
        cardrushRes === "error" ? "error" : cardrushHist ? "ok" : "absent",
      tcgplayer_history:
        tcgplayerRes === "error" ? "error" : tcgplayerHist ? "ok" : "absent",
      // A successful sibling query with zero rows is 'ok', not 'absent'.
      siblings: siblingsErrored && siblings.length === 0 ? "error" : "ok",
    },
  };

  // Build the `_meta.sources` + `_meta.source_license` parallel arrays
  // declaring per-source rights.
  const sources: string[] = ["wholesale-rds.cards"];
  const source_license: string[] = ["cc0"];

  if (pricesTodayRows.some((r) => r.source === "cardrush")) {
    sources.push("cardrush");
    source_license.push("internal-only");
  }
  if (pricesTodayRows.some((r) => r.source === "tcgplayer")) {
    sources.push("tcgplayer");
    source_license.push("partner-redistributable");
  }
  if (
    cardrushHist &&
    cardrushHist.observations.length > 0 &&
    !sources.includes("cardrush")
  ) {
    sources.push("cardrush");
    source_license.push("internal-only");
  }
  if (
    tcgplayerHist &&
    tcgplayerHist.observations.length > 0 &&
    !sources.includes("tcgplayer")
  ) {
    sources.push("tcgplayer");
    source_license.push("partner-redistributable");
  }

  // Bright-data-unlocker-routed subdomains carry an upstream_proxy
  // declaration per kingdom-088's _meta widening. Authoritative signal:
  // the cardrush observation row's source URL — if it points at a
  // subdomain registered as access="bright-data-unlocker" (today: only
  // cardrush-pokemon.jp), the byte rode through the unlocker.
  // Substrate-honest fallback when no cardrush_url is present: declare
  // proxy IFF the SKU's game prefix is the pokemon family ('pk' or
  // 'pkm'). The per-row via_proxy column on price_archive will make
  // this exact once the operator applies that migration — recursion
  // target named in docs/connections/the-bright-data-unlock.md §8.
  function detectProxy(): boolean {
    if (cardrushHist?.cardrush_url?.includes("cardrush-pokemon.jp")) return true;
    if ((parsed!.game === "pk" || parsed!.game === "pkm") && sources.includes("cardrush")) return true;
    return false;
  }
  const upstream_proxy = detectProxy()
    ? sources.map((s) => (s === "cardrush" ? "bright-data-web-unlocker" : "none"))
    : undefined;

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
    ...(upstream_proxy ? { upstream_proxy } : {}),
    freshness: "market_signal",
    as_of: pricesToday.snapshot_date ?? undefined,
  });
}
