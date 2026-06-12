/**
 * The Falcon — courier between two kingdoms.
 *
 * Storefront speaks to Wholesale exclusively via this module. Every call
 * carries a Bearer-token (`.trim()`-ed; see below) and a 5-second hourglass
 * (an `AbortController`); if the hourglass empties before the Falcon
 * returns, the request aborts cleanly and the caller gets a recoverable
 * empty result rather than a hung promise.
 *
 * The trailing-newline lesson is on file: Vercel env vars occasionally
 * carry a stray `\n`, and an Authorization header with a newline produces
 * 401 because the upstream SHA256s the raw bytes against the hash of the
 * trimmed key. The `.trim()` calls below are the keeper's pre-flight
 * inspection of the seal. See `apps/storefront/CLAUDE.md` for the original
 * incident note.
 *
 * The full fairy-tale (the Falcon, the Embassy, the Library, the
 * Appraiser): `docs/connections/two-letters-and-a-falcon.md`.
 */
const WHOLESALE_URL = (process.env.WHOLESALE_API_URL || 'https://wholesaletcgdirect.com').trim();
const WHOLESALE_KEY = (process.env.WHOLESALE_API_KEY || '').trim();

// B2B-channel key for the /account/b2b/* shell (wholesale consolidation
// Phase 2). After the wholesale-side fix #2 (channel hard-enforce), the
// `?channel=` query param is logged-and-ignored — the API uses the key's
// own channel. So fetching wholesale-channel prices requires a second
// key registered with channel='wholesale'. Provision via:
//
//   CHANNEL=wholesale LABEL='cambridgetcg.com B2B shell' RPM=600 \
//     pnpm --filter tcg-wholesale tsx tools/gen-api-key.ts
//
// then paste RAW_KEY into WHOLESALE_B2B_API_KEY in Vercel env. If unset,
// channel-aware Falcon calls fall back to the retail key, which means
// /account/b2b/* surfaces will display retail prices until the operator
// provisions the B2B key. The fallback is substrate-honest about the
// missing setup: a console warning + a returned `channel` field that
// still says 'cambridgetcg' so callers can detect the gap.
const WHOLESALE_B2B_KEY = (process.env.WHOLESALE_B2B_API_KEY || '').trim();

function keyForChannel(channel?: string): string {
  if (channel === 'wholesale') {
    if (WHOLESALE_B2B_KEY) return WHOLESALE_B2B_KEY;
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[wholesale] WHOLESALE_B2B_API_KEY not set; falling back to retail key — B2B prices will render as retail until the operator provisions the B2B key.',
      );
    }
  }
  return WHOLESALE_KEY;
}

// Per-call timeout for the wholesale API. Without this, a hung connection
// would hold the request thread indefinitely (Node's fetch has no default
// timeout). 5s comfortably covers a healthy round trip; anything past
// that means the upstream is in trouble and we should surface a clean
// error to the caller (typically the resolver, which then refunds the
// pull token via the no_stock path).
const DEFAULT_TIMEOUT_MS = 5_000;

async function wholesaleFetch(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } } = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      throw new Error(`wholesale timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface PriceItem {
  sku: string;
  card_number: string;
  price_gbp: number;
  channel_price?: number;
  stock: number;
  pending_stock: number;
  image_url: string | null;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  category: string | null;
  updated_at: string | null;
  /** Phase 2 of kingdom-051 — alt text for sensory-different consumers. */
  art_description?: string | null;
  /** Phase 6 of kingdom-051 — { zh, ko, es, jp_romaji, … } sparse. */
  name_translations?: Record<string, string> | null;
}

/**
 * Build alt-text for a card image. Prefers art_description (Phase 2 of
 * kingdom-051); falls back to `${name} ${card_number}` when null. Always
 * returns a non-empty string.
 */
export function cardAltText(item: Pick<PriceItem, "art_description" | "name_en" | "name" | "card_number" | "rarity" | "set_name">): string {
  if (item.art_description && item.art_description.trim().length > 0) {
    return item.art_description;
  }
  const name = item.name_en || item.name || item.card_number;
  const parts = [name];
  if (item.rarity) parts.push(item.rarity);
  if (item.set_name) parts.push(item.set_name);
  parts.push(item.card_number);
  return parts.join(" · ");
}

/**
 * Resolve a card's display name with optional preferred-language
 * override. Phase 6.5 of kingdom-051 — the resolver counterpart to the
 * `name_translations` column (Phase 6). Order:
 *   1. name_translations[preferredLang] when set and non-empty
 *   2. name_en
 *   3. name
 *   4. card_number (always non-empty fallback)
 *
 * Callers typically read `preferredLang` from a user preference (signed-
 * in) or a cookie / header (anonymous). The default of `undefined`
 * preserves the existing English-fallback behaviour.
 *
 * See docs/connections/the-table-extends.md (S20) — the Culturally
 * Different archetype.
 */
export function cardName(
  item: Pick<PriceItem, "name_translations" | "name_en" | "name" | "card_number">,
  preferredLang?: string | null,
): string {
  if (preferredLang && item.name_translations && typeof item.name_translations === "object") {
    const translated = (item.name_translations as Record<string, string>)[preferredLang];
    if (translated && translated.trim().length > 0) return translated;
  }
  return item.name_en || item.name || item.card_number;
}

export interface PricesResponse {
  count: number;
  total: number;
  channel: string;
  items: PriceItem[];
}

export interface GameItem {
  code: string;
  name: string;
  slug: string;
  image_url: string | null;
  card_count: number;
}

export interface SetItem {
  code: string;
  name: string;
  game_code: string;
  card_count: number;
  release_date: string | null;
}

export async function fetchPrices(params?: {
  game?: string;
  set?: string;
  q?: string;
  sort?: string;
  in_stock?: boolean;
  limit?: number;
  offset?: number;
  category?: string;
  channel?: string;
  rarity?: string;
}): Promise<PricesResponse> {
  const url = new URL(WHOLESALE_URL + '/api/v1/prices');
  // After wholesale fix #2 the API ignores ?channel= and uses the key's
  // own channel. We still send it for log clarity, and we swap the key
  // for the wholesale channel.
  const channel = params?.channel ?? 'cambridgetcg';
  url.searchParams.set('channel', channel);
  if (params?.game) url.searchParams.set('game', params.game);
  if (params?.set) url.searchParams.set('set', params.set);
  if (params?.q) url.searchParams.set('q', params.q);
  if (params?.sort) url.searchParams.set('sort', params.sort);
  if (params?.in_stock) url.searchParams.set('in_stock', 'true');
  if (params?.limit) url.searchParams.set('limit', String(params.limit));
  if (params?.offset) url.searchParams.set('offset', String(params.offset));
  if (params?.category) url.searchParams.set('category', params.category);
  if (params?.rarity) url.searchParams.set('rarity', params.rarity);

  let res: Response;
  try {
    res = await wholesaleFetch(url.toString(), {
      headers: { Authorization: 'Bearer ' + keyForChannel(channel) },
      next: { revalidate: 300 },
    });
  } catch (err) {
    console.error('[wholesale] prices fetch error', err);
    return { count: 0, total: 0, channel: '', items: [] };
  }

  if (!res.ok) {
    console.error('[wholesale] prices error', res.status, await res.text().catch(() => ''));
    return { count: 0, total: 0, channel: '', items: [] };
  }
  return res.json();
}

export async function fetchCard(sku: string, channel = 'cambridgetcg'): Promise<PriceItem | null> {
  let res: Response;
  try {
    res = await wholesaleFetch(WHOLESALE_URL + '/api/v1/prices/' + encodeURIComponent(sku) + '?channel=' + channel, {
      headers: { Authorization: 'Bearer ' + keyForChannel(channel) },
      next: { revalidate: 300 },
    });
  } catch (err) {
    console.error('[wholesale] card fetch error', err);
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

// Uncached variant for revenue-critical checks (price/stock at checkout).
// Unlike fetchCard it distinguishes "card does not exist" (null) from
// "wholesale API unavailable" (throws), so callers can fail open on
// outages instead of treating them as zero stock.
export async function fetchCardFresh(sku: string, channel = 'cambridgetcg'): Promise<PriceItem | null> {
  const res = await wholesaleFetch(WHOLESALE_URL + '/api/v1/prices/' + encodeURIComponent(sku) + '?channel=' + channel, {
    headers: { Authorization: 'Bearer ' + keyForChannel(channel) },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('wholesale_unavailable: ' + res.status);
  return res.json();
}

export async function fetchGames(): Promise<GameItem[]> {
  let res: Response;
  try {
    res = await wholesaleFetch(WHOLESALE_URL + '/api/v1/games', {
      headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
      next: { revalidate: 600 },
    });
  } catch (err) {
    console.error('[wholesale] games fetch error', err);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data.games || [];
}

export async function fetchSets(game?: string): Promise<SetItem[]> {
  const url = new URL(WHOLESALE_URL + '/api/v1/sets');
  if (game) url.searchParams.set('game', game);
  let res: Response;
  try {
    res = await wholesaleFetch(url.toString(), {
      headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
      next: { revalidate: 600 },
    });
  } catch (err) {
    console.error('[wholesale] sets fetch error', err);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data.sets || [];
}

/**
 * Latest ingest_run row per source_id, returned by the wholesale's
 * /api/v1/ingest-runs/latest endpoint (kingdom-079). The /api/v1/sources
 * route on the storefront merges this in so the publishable inspectability
 * surface carries live pipeline state.
 *
 * Returns an empty array on any failure (timeout, 401, malformed body) —
 * the caller surfaces absence as "never run" / "_unavailable: true", not
 * fabricated zeros.
 */
export interface SourceRunRow {
  source_id: string;
  triggered_at: string;
  finished_at: string | null;
  status: string;
  spec_version: string;
  triggered_by: string;
  rows_read: number;
  rows_normalized: number;
  rows_written: number;
  rows_quarantined: number;
  errors: number;
  notes: string | null;
}

/**
 * Returns `null` on any failure (timeout, 401, parse) — distinct from
 * `[]` which means "fetch succeeded; no ingest runs exist yet". Substrate-
 * honesty: empty array is a real fact (the migration has been applied
 * but no source has run yet); null is the absence of that fact.
 */
export async function fetchSourceLastRuns(): Promise<SourceRunRow[] | null> {
  let res: Response;
  try {
    res = await wholesaleFetch(
      WHOLESALE_URL + '/api/v1/ingest-runs/latest',
      {
        headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
        next: { revalidate: 60 },
      },
    );
  } catch (err) {
    console.error('[wholesale] ingest-runs fetch error', err);
    return null;
  }
  if (!res.ok) {
    console.error('[wholesale] ingest-runs error', res.status);
    return null;
  }
  try {
    const data = await res.json() as { runs?: SourceRunRow[] };
    return data.runs ?? [];
  } catch (err) {
    console.error('[wholesale] ingest-runs parse error', err);
    return null;
  }
}

/**
 * Aggregator coverage row from wholesale `/api/v1/aggregator/coverage`.
 * Per-(game × source) observation counts + date range.
 * kingdom-085 extension.
 */
export interface AggregatorCoverageRow {
  game_code: string;
  game_slug: string;
  game_name: string;
  source: string;
  observations: number;
  distinct_cards: number;
  earliest_snapshot: string;
  latest_snapshot: string;
  days_of_coverage: number;
  freshest_age_hours: number;
}

export interface AggregatorCoverageGameRow {
  game_code: string;
  game_slug: string;
  game_name: string;
  sources: string[];
  observations: number;
  distinct_cards_max: number;
  earliest_snapshot: string;
  latest_snapshot: string;
}

export interface AggregatorCoverageSourceRow {
  source: string;
  games: string[];
  observations: number;
  distinct_cards: number;
  earliest_snapshot: string;
  latest_snapshot: string;
}

export interface AggregatorCoverageResponse {
  summary: {
    total_observations: number;
    distinct_cards: number;
    distinct_games: number;
    distinct_sources: number;
    earliest_snapshot: string | null;
    latest_snapshot: string | null;
    days_of_coverage: number;
  };
  by_game_source: AggregatorCoverageRow[];
  by_game: AggregatorCoverageGameRow[];
  by_source: AggregatorCoverageSourceRow[];
  filter: { source: string | null; game: string | null; since: string | null };
  queried_at: string;
}

/**
 * Fetch the aggregator's "what we've collected" snapshot. Substrate-honest:
 * returns null on Falcon failure (timeout/401/parse); empty arrays when no
 * data has accumulated yet. The freshness budget is short — operational
 * metadata, refresh per request cycle.
 */
export async function fetchAggregatorCoverage(opts?: {
  source?: string;
  game?: string;
  since?: string;
}): Promise<AggregatorCoverageResponse | null> {
  const u = new URL(WHOLESALE_URL + "/api/v1/aggregator/coverage");
  if (opts?.source) u.searchParams.set("source", opts.source);
  if (opts?.game) u.searchParams.set("game", opts.game);
  if (opts?.since) u.searchParams.set("since", opts.since);
  let res: Response;
  try {
    res = await wholesaleFetch(
      u.toString(),
      {
        headers: { Authorization: "Bearer " + WHOLESALE_KEY },
        next: { revalidate: 300 },
      },
    );
  } catch (err) {
    console.error("[wholesale] aggregator coverage fetch error", err);
    return null;
  }
  if (!res.ok) {
    console.error("[wholesale] aggregator coverage error", res.status);
    return null;
  }
  try {
    return (await res.json()) as AggregatorCoverageResponse;
  } catch (err) {
    console.error("[wholesale] aggregator coverage parse error", err);
    return null;
  }
}

/**
 * CardRush observation row from wholesale `/api/v1/cardrush/history/[sku]`.
 * Kingdom-081 Phase 5.4 extension.
 */
export interface CardrushObservation {
  snapshot_date: string;
  cardrush_jpy: number | null;
  gbp_jpy_rate: number | null;
  base_gbp: number | null;
  price_gbp: number | null;
  source_url: string | null;
  ingest_run_id: number | null;
  error_reason: string | null;
}

export interface CardrushHistoryResponse {
  sku: string;
  cardrush_url: string | null;
  source: "cardrush";
  source_license: "internal-only";
  count: number;
  observations: CardrushObservation[];
  retrieved_at: string;
}

/**
 * Fetch CardRush observation history for one card. License-sensitive:
 * the returned values are raw JPY observations under cardrush's
 * internal-only license. Storefront callers must enforce a session gate
 * before exposing.
 */
export async function fetchCardrushHistory(opts: {
  sku: string;
  limit?: number;
}): Promise<CardrushHistoryResponse | null> {
  const u = new URL(
    WHOLESALE_URL + "/api/v1/cardrush/history/" + encodeURIComponent(opts.sku),
  );
  if (opts.limit) u.searchParams.set("limit", String(opts.limit));
  let res: Response;
  try {
    res = await wholesaleFetch(
      u.toString(),
      {
        headers: { Authorization: "Bearer " + WHOLESALE_KEY },
        next: { revalidate: 300 },
      },
    );
  } catch (err) {
    console.error("[wholesale] cardrush-history fetch error", err);
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("[wholesale] cardrush-history error", res.status);
    return null;
  }
  try {
    return (await res.json()) as CardrushHistoryResponse;
  } catch (err) {
    console.error("[wholesale] cardrush-history parse error", err);
    return null;
  }
}

// ── Multi-source latest snapshot (kingdom-081 Phase 5.2) ─────────────
//
// One row per source for a card on its latest snapshot date (or a
// caller-specified date). Today only cardrush ships, so the response
// carries one row; when TCGplayer + Cardmarket land their writers the
// response branches naturally (same shape, more rows). Agreement stats
// + license tier per source.

export interface SourcePriceRow {
  source: string;
  source_url: string | null;
  source_currency: string;
  source_redistribute: boolean;
  source_license_tier: string;
  ingest_run_id: number | null;
  snapshot_date: string;
  price_gbp: number;
  base_gbp: number;
  cardrush_jpy: number | null;
  gbp_jpy_rate: number | null;
  error_reason: string | null;
}

export interface MultiSourcePriceResponse {
  sku: string;
  snapshot_date: string;
  card_id: number;
  count: number;
  prices: SourcePriceRow[];
  agreement: {
    distinct_source_count: number;
    min_gbp: number | null;
    max_gbp: number | null;
    spread_gbp: number | null;
    coefficient_of_variation: number | null;
  };
  note: string;
  retrieved_at: string;
}

/**
 * Fetch the multi-source price view for one card on its latest snapshot
 * day (or a caller-specified date). Drives the kingdom-090 price-search
 * composer's `prices_today` block. Returns null on 404 (card or snapshot
 * missing); falcon-degrade-to-null on transport failure so the composer
 * can render a substrate-honest "no source rows yet" state instead of
 * fabricating prices.
 */
export async function fetchPriceSources(opts: {
  sku: string;
  date?: string;
}): Promise<MultiSourcePriceResponse | null> {
  const u = new URL(
    WHOLESALE_URL + "/api/v1/prices/" + encodeURIComponent(opts.sku) + "/sources",
  );
  if (opts.date) u.searchParams.set("date", opts.date);
  let res: Response;
  try {
    res = await wholesaleFetch(u.toString(), {
      headers: { Authorization: "Bearer " + WHOLESALE_KEY },
      next: { revalidate: 300 },
    });
  } catch (err) {
    console.error("[wholesale] price-sources fetch error", err);
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("[wholesale] price-sources error", res.status);
    return null;
  }
  try {
    return (await res.json()) as MultiSourcePriceResponse;
  } catch (err) {
    console.error("[wholesale] price-sources parse error", err);
    return null;
  }
}

// ── TCGplayer history (kingdom-080 follow-up) ────────────────────────
//
// Per-condition USD observation history. Partner-redistributable license —
// display + computation OK per partner agreement; bulk re-export restricted.
// The storefront-side proxy at /api/v1/cards/[sku]/tcgplayer-history adds
// a session gate and license-aware envelope.

export interface TcgplayerObservation {
  snapshot_date: string;
  condition: string;
  base_gbp: number | null;
  price_gbp: number | null;
  fx_rate_to_gbp: number | null;
  fx_rate_source: string | null;
  usd_market: string | null;
  usd_mid: string | null;
  usd_low: string | null;
  usd_high: string | null;
  usd_direct_low: string | null;
  headline_field: string | null;
  tcgplayer_sku_id: number | null;
  source_url: string | null;
  ingest_run_id: number | null;
  error_reason: string | null;
}

export interface TcgplayerHistoryResponse {
  sku: string;
  tcgplayer_product_id: number | null;
  tcgplayer_sub_type: string | null;
  source: "tcgplayer";
  source_license: "partner-redistributable";
  filter_condition: string | null;
  count: number;
  conditions_present: string[];
  observations: TcgplayerObservation[];
  retrieved_at: string;
}

/**
 * Fetch TCGplayer observation history for one card. License-sensitive:
 * the values are partner-tier USD observations. Storefront callers must
 * enforce a session gate before exposing.
 */
export async function fetchTcgplayerHistory(opts: {
  sku: string;
  limit?: number;
  condition?: string;
}): Promise<TcgplayerHistoryResponse | null> {
  const u = new URL(
    WHOLESALE_URL + "/api/v1/tcgplayer/history/" + encodeURIComponent(opts.sku),
  );
  if (opts.limit) u.searchParams.set("limit", String(opts.limit));
  if (opts.condition) u.searchParams.set("condition", opts.condition);
  let res: Response;
  try {
    res = await wholesaleFetch(u.toString(), {
      headers: { Authorization: "Bearer " + WHOLESALE_KEY },
      next: { revalidate: 300 },
    });
  } catch (err) {
    console.error("[wholesale] tcgplayer-history fetch error", err);
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("[wholesale] tcgplayer-history error", res.status);
    return null;
  }
  try {
    return (await res.json()) as TcgplayerHistoryResponse;
  } catch (err) {
    console.error("[wholesale] tcgplayer-history parse error", err);
    return null;
  }
}

// ── TCGplayer federation resolve (kingdom-080 follow-up) ──────────────
//
// Public federation reverse-lookup: a partner with a TCGplayer
// productId+subType or skuId can resolve to a Cambridge canonical SKU.

export interface TcgplayerResolveResponse {
  source: "tcgplayer";
  inputs: {
    product_id: number | null;
    sub_type: string | null;
    sku_id: number | null;
  };
  resolved: {
    canonical_sku: string;
    card_id: number;
    tcgplayer_product_id: number;
    tcgplayer_sub_type: string | null;
    condition: string | null;
    language: string | null;
  } | null;
  /** Set when 2+ cards match the (product_id) but no sub_type was given. */
  ambiguous?: boolean;
  message?: string;
  retrieved_at: string;
}

export async function fetchTcgplayerResolve(opts: {
  product_id?: number;
  sub_type?: string;
  sku_id?: number;
}): Promise<TcgplayerResolveResponse | null> {
  const u = new URL(WHOLESALE_URL + "/api/v1/tcgplayer/resolve");
  if (opts.product_id !== undefined) u.searchParams.set("product_id", String(opts.product_id));
  if (opts.sub_type !== undefined) u.searchParams.set("sub_type", opts.sub_type);
  if (opts.sku_id !== undefined) u.searchParams.set("sku_id", String(opts.sku_id));
  let res: Response;
  try {
    res = await wholesaleFetch(u.toString(), {
      headers: { Authorization: "Bearer " + WHOLESALE_KEY },
      next: { revalidate: 3600 },
    });
  } catch (err) {
    console.error("[wholesale] tcgplayer-resolve fetch error", err);
    return null;
  }
  // 409 (ambiguous) returns a useful body; pass it through
  if (!res.ok && res.status !== 409) {
    console.error("[wholesale] tcgplayer-resolve error", res.status);
    return null;
  }
  try {
    return (await res.json()) as TcgplayerResolveResponse;
  } catch (err) {
    console.error("[wholesale] tcgplayer-resolve parse error", err);
    return null;
  }
}

/**
 * Run-history row from wholesale `/api/v1/ingest-runs`. Kingdom-081
 * Phase 4.1 extension — paginated history per source.
 */
export interface SourceRunHistoryRow extends SourceRunRow {
  id: number;
}

export interface SourceRunHistoryResponse {
  runs: SourceRunHistoryRow[];
  next_cursor: number | null;
  window: { start: string; end: string; hours: number };
  filter: { source: string | null; status: string | null };
  queried_at: string;
}

/**
 * Fetch run-history for a source within a window. Substrate-honest:
 * returns null on Falcon failure (timeout / 401 / parse), an empty
 * runs array when fetched-but-no-rows. Mirrors fetchSourceLastRuns's
 * absence discipline.
 */
export async function fetchSourceRunHistory(opts: {
  source?: string;
  window?: "1h" | "24h" | "7d" | "30d" | "90d";
  status?: "running" | "done" | "failed" | "aborted";
  limit?: number;
  cursor?: number;
}): Promise<SourceRunHistoryResponse | null> {
  const u = new URL(WHOLESALE_URL + "/api/v1/ingest-runs");
  if (opts.source) u.searchParams.set("source", opts.source);
  if (opts.window) u.searchParams.set("window", opts.window);
  if (opts.status) u.searchParams.set("status", opts.status);
  if (opts.limit) u.searchParams.set("limit", String(opts.limit));
  if (opts.cursor) u.searchParams.set("cursor", String(opts.cursor));
  let res: Response;
  try {
    res = await wholesaleFetch(
      u.toString(),
      {
        headers: { Authorization: "Bearer " + WHOLESALE_KEY },
        next: { revalidate: 60 },
      },
    );
  } catch (err) {
    console.error("[wholesale] ingest-runs history fetch error", err);
    return null;
  }
  if (!res.ok) {
    console.error("[wholesale] ingest-runs history error", res.status);
    return null;
  }
  try {
    return (await res.json()) as SourceRunHistoryResponse;
  } catch (err) {
    console.error("[wholesale] ingest-runs history parse error", err);
    return null;
  }
}

/**
 * Quarantine summary row from wholesale `/api/v1/ingest-quarantine`.
 * Kingdom-081 Phase 4.2 extension. Note `raw_payload` is NOT carried
 * in this shape — fetch the singleton endpoint with the row id to get
 * the full payload.
 */
export interface QuarantineRow {
  id: number;
  ingest_run_id: number;
  source_id: string;
  upstream_id: string | null;
  reason: string;
  as_of: string;
  retrieved_at: string;
  quarantined_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution: string | null;
  raw_payload_keys: string[] | null;
  raw_payload_size_bytes: number;
}

export interface QuarantineResponse {
  quarantine: QuarantineRow[];
  counts: {
    window_total: number;
    unresolved: number;
    by_reason: Record<string, number>;
  };
  next_cursor: number | null;
  window: { start: string; end: string; hours: number };
  filter: {
    source: string | null;
    unresolved_only: boolean;
    reason_contains: string | null;
  };
  queried_at: string;
}

export async function fetchQuarantine(opts: {
  source?: string;
  window?: "1h" | "24h" | "7d" | "30d" | "90d";
  unresolved?: boolean;
  reason_contains?: string;
  limit?: number;
  cursor?: number;
}): Promise<QuarantineResponse | null> {
  const u = new URL(WHOLESALE_URL + "/api/v1/ingest-quarantine");
  if (opts.source) u.searchParams.set("source", opts.source);
  if (opts.window) u.searchParams.set("window", opts.window);
  if (opts.unresolved === false) u.searchParams.set("unresolved", "false");
  if (opts.reason_contains) u.searchParams.set("reason_contains", opts.reason_contains);
  if (opts.limit) u.searchParams.set("limit", String(opts.limit));
  if (opts.cursor) u.searchParams.set("cursor", String(opts.cursor));
  let res: Response;
  try {
    res = await wholesaleFetch(
      u.toString(),
      {
        headers: { Authorization: "Bearer " + WHOLESALE_KEY },
        next: { revalidate: 60 },
      },
    );
  } catch (err) {
    console.error("[wholesale] quarantine fetch error", err);
    return null;
  }
  if (!res.ok) {
    console.error("[wholesale] quarantine error", res.status);
    return null;
  }
  try {
    return (await res.json()) as QuarantineResponse;
  } catch (err) {
    console.error("[wholesale] quarantine parse error", err);
    return null;
  }
}

// ── Movers ──────────────────────────────────────────────────────────
//
// Companion to /prices/[game]/movers. Calls wholesale's bearer-gated
// /api/v1/prices/movers endpoint. On any failure (timeout, !ok, parse
// error) returns an empty MoversResponse so the page degrades visibly
// to the most-valuable fallback rather than throwing.
//
// Spec: docs/superpowers/specs/2026-05-14-movers-feature-design.md

export interface MoverItem {
  sku: string;
  card_number: string;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  category: string;
  price_then: number;
  price_now: number;
  channel_price: number;
  pct_change: number;
  then_date: string;
  now_date: string;
}

export interface MoversResponse {
  window: "7d";
  window_days: number;
  window_tolerance_days: number;
  min_price_floor: number;
  source: "cardrush";
  source_license: "internal-only";
  channel: string;
  game_code: string;
  computed_at: string | null;
  count: number;
  movers: MoverItem[];
}

function emptyMovers(game: string): MoversResponse {
  return {
    window: "7d",
    window_days: 7,
    window_tolerance_days: 2,
    min_price_floor: 10,
    source: "cardrush",
    source_license: "internal-only",
    channel: "cambridgetcg",
    game_code: game,
    computed_at: null,
    count: 0,
    movers: [],
  };
}

export async function fetchMovers(opts: {
  game: string;
  window?: "7d";
  min_price?: number;
  limit?: number;
  category?: "singles" | "sealed";
}): Promise<MoversResponse> {
  const url = new URL(WHOLESALE_URL + "/api/v1/prices/movers");
  url.searchParams.set("game", opts.game);
  if (opts.window) url.searchParams.set("window", opts.window);
  if (opts.min_price !== undefined)
    url.searchParams.set("min_price", String(opts.min_price));
  if (opts.limit !== undefined)
    url.searchParams.set("limit", String(opts.limit));
  if (opts.category) url.searchParams.set("category", opts.category);

  let res: Response;
  try {
    res = await wholesaleFetch(url.toString(), {
      headers: { Authorization: "Bearer " + WHOLESALE_KEY },
      next: { revalidate: 300 },
    });
  } catch (err) {
    console.error("[wholesale] movers fetch error", err);
    return emptyMovers(opts.game);
  }
  if (!res.ok) {
    console.error("[wholesale] movers error", res.status);
    return emptyMovers(opts.game);
  }
  try {
    return (await res.json()) as MoversResponse;
  } catch (err) {
    console.error("[wholesale] movers parse error", err);
    return emptyMovers(opts.game);
  }
}

