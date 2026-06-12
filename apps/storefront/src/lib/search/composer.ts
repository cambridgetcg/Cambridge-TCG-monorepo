/**
 * The composer — kingdom-090's POOF, extracted as a library.
 *
 * Given a canonical SKU, gather everything the platform knows about
 * that card in one payload: price across every source, history
 * (cardrush + tcgplayer), siblings across languages, and the platform's
 * own quote.
 *
 * Previously this lived inline in /api/v1/cards/[sku]/everything; the
 * convenience endpoint /api/v1/search/everything then called it over a
 * same-origin no-store HTTP hop — an extra serverless invocation plus a
 * JSON serialize/parse per search. Both routes now import this function
 * and compose in-process. The HTTP route remains the public contract;
 * this module is the shared engine.
 *
 * ── License & freshness ────────────────────────────────────────────
 *
 * Returns mixed-license data:
 *   - card meta + ctcg quote: CC0
 *   - cardrush observations: internal-only (Phase 1 returns only
 *     sparkline-summary stats — no raw upstream values)
 *   - tcgplayer observations: partner-redistributable (same treatment)
 *
 * `sources` / `source_license` run parallel so the caller's envelope
 * can declare per-source tiers. Freshness budget: market_signal.
 */

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
import { parseSkuShape } from "@/lib/search/resolver";
import {
  classifySibling,
  compareVariantKinds,
  type VariantKind,
} from "@/lib/search/variants";

// ── Public payload shape (typed for partners + the search page) ─────

export interface EverythingCard {
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

export interface PriceTodayRow {
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

export interface HistorySummary {
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

export interface SiblingRow {
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

export interface CtcgQuote {
  sell_price_gbp: number | null;
  sell_channel_price_gbp: number | null;
  sell_in_stock: boolean;
  pending_stock: number;
  /** Future hooks; null today until trade-in pricing is composed. */
  trade_in_cash_gbp: number | null;
  trade_in_credit_gbp: number | null;
}

export interface EverythingPayload {
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
  ctcg: CtcgQuote;
  /** Operator-visible breadcrumb: what we tried to compose + how each
   *  Falcon call resolved. UI can render this in a debug panel. */
  composition: {
    falcon_calls: Record<string, "ok" | "absent" | "error">;
  };
}

export type ComposeResult =
  | {
      ok: true;
      data: EverythingPayload;
      sources: string[];
      source_license: string[];
      upstream_proxy?: string[];
      as_of?: string;
    }
  | { ok: false; error: "invalid_sku" | "not_found"; sku: string };

// ── Pure summary helpers ────────────────────────────────────────────

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

function summarizeObservations(
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

// ── Composer ────────────────────────────────────────────────────────

export async function composeEverything(
  rawSku: string,
  opts?: {
    /** Wholesale game token already resolved upstream (the search route
     *  resolves it once via the registries) — lets the siblings lookup
     *  skip its own fallback ladder. */
    gameHint?: string;
  },
): Promise<ComposeResult> {
  // Preserve the caller's SKU case — wholesale data carries legacy
  // UPPERCASE SKUs (kingdom-071 normalize migration is still in drafts).
  // Lowercasing here would 404 the Falcon's `cards.sku === X` lookup.
  // Shape parsing (parseSkuShape) is case-insensitive internally.
  const sku = decodeURIComponent(rawSku).trim();

  const parsed = parseSkuShape(sku);
  if (!parsed) {
    return { ok: false, error: "invalid_sku", sku };
  }

  // Fire every Falcon call in parallel. Each degrades to null on
  // failure; we surface absence in `composition.falcon_calls`. If the
  // primary SKU returns 404, retry once with case-swap (covers the
  // case where the caller normalized to lowercase but data is legacy
  // uppercase, or vice versa) — substrate-honest tolerance.
  let [card, priceSources, cardrushHist, tcgplayerHist] = await Promise.all([
    fetchCard(sku),
    fetchPriceSources({ sku }),
    fetchCardrushHistory({ sku, limit: 365 }).catch(() => null),
    fetchTcgplayerHistory({ sku, limit: 365 }).catch(() => null),
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
          fetchCardrushHistory({ sku: altSku, limit: 365 }).catch(() => null),
          fetchTcgplayerHistory({ sku: altSku, limit: 365 }).catch(() => null),
        ]);
        priceSources = ps;
        cardrushHist = ch;
        tcgplayerHist = th;
      }
    }
  }

  if (!card) {
    return { ok: false, error: "not_found", sku };
  }

  // ── Siblings: same physical card, different language/variant. ────
  // Query the wholesale prices route for SET-NUMBER without lang;
  // returns every language variant for this set + number. When the
  // caller already resolved the game token (the search route), that
  // hint goes first and the ladder usually never runs. Otherwise:
  // set-registry lookup, SKU-parsed game prefix + case variants, then
  // a fetchGames-based permissive match.
  async function fetchSiblings(): Promise<PriceItem[]> {
    const q = `${parsed!.set}-${parsed!.number}`;
    const tried = new Set<string>();
    async function tryGame(g: string): Promise<PriceItem[] | null> {
      if (!g || tried.has(g)) return null;
      tried.add(g);
      const r = await fetchPrices({ game: g, q, limit: 50, skip_count: true }).catch(
        () => ({ items: [] as PriceItem[] } as { items: PriceItem[] }),
      );
      return r.items.length > 0 ? r.items : null;
    }

    // 0. Caller-resolved game token (search path) — skips the ladder.
    if (opts?.gameHint) {
      const r = await tryGame(opts.gameHint);
      if (r) return r;
    }

    // 1. Look up the set in wholesale and use whatever game token it
    //    declares (code or slug or any field that matches the data).
    const sets = await fetchSets().catch(() => []);
    const matchedSet = sets.find(
      (s) => s.code.toLowerCase() === parsed!.set,
    );
    if (matchedSet) {
      const r0 = await tryGame(matchedSet.game_code);
      if (r0) return r0;
    }

    // 2. SKU-parsed game prefix + case variants.
    const r1 = await tryGame(parsed!.game);
    if (r1) return r1;
    const r2 = await tryGame(parsed!.game.toUpperCase());
    if (r2) return r2;

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
      if (r3) return r3;
      const r4 = await tryGame(match.code);
      if (r4) return r4;
    }
    return [];
  }
  const siblingsRaw = { items: await fetchSiblings() };

  // Compare on lowercased SKUs — legacy data is uppercase, user input
  // can be either; canonicalize for the equality check.
  const selfSkuLower = (card?.sku ?? sku).toLowerCase();
  const siblings: SiblingRow[] = siblingsRaw.items
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
      summary: summarizeObservations(
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
      summary: summarizeObservations(
        tcgplayerHist.observations.map((o) => ({
          snapshot_date: o.snapshot_date,
          price_gbp: o.price_gbp,
        })),
      ),
      points: null,
    });
  }

  // ── ctcg quote ────────────────────────────────────────────────────
  const ctcg: CtcgQuote = {
    sell_price_gbp: typeof card.price_gbp === "number" ? card.price_gbp : null,
    sell_channel_price_gbp:
      typeof card.channel_price === "number" ? card.channel_price : null,
    sell_in_stock: card.stock > 0,
    pending_stock: card.pending_stock,
    trade_in_cash_gbp: null,
    trade_in_credit_gbp: null,
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
  const composition: EverythingPayload["composition"] = {
    falcon_calls: {
      card: "ok",
      price_sources: priceSources ? "ok" : "absent",
      cardrush_history: cardrushHist ? "ok" : "absent",
      tcgplayer_history: tcgplayerHist ? "ok" : "absent",
      siblings: siblings.length > 0 ? "ok" : "absent",
    },
  };

  // Build the `sources` + `source_license` parallel arrays declaring
  // per-source rights.
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

  return {
    ok: true,
    data: {
      card: cardMeta,
      prices_today: pricesToday,
      history,
      siblings,
      ctcg,
      composition,
    },
    sources,
    source_license,
    ...(upstream_proxy ? { upstream_proxy } : {}),
    ...(pricesToday.snapshot_date ? { as_of: pricesToday.snapshot_date } : {}),
  };
}
