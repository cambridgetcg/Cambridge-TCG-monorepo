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

// Per-call timeout for the wholesale API. Without this, a hung connection
// would hold the request thread indefinitely (Node's fetch has no default
// timeout). 5s comfortably covers a healthy round trip; anything past
// that means the upstream is in trouble and we should surface a clean
// error to the caller (typically the resolver, which then refunds the
// pull token via the no_stock path).
const DEFAULT_TIMEOUT_MS = 5_000;
const SALE_REPORT_TIMEOUT_MS = 10_000; // POST is rarer, allow more headroom

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
}): Promise<PricesResponse> {
  const url = new URL(WHOLESALE_URL + '/api/v1/prices');
  // Always request cambridgetcg channel pricing unless overridden
  url.searchParams.set('channel', params?.channel ?? 'cambridgetcg');
  if (params?.game) url.searchParams.set('game', params.game);
  if (params?.set) url.searchParams.set('set', params.set);
  if (params?.q) url.searchParams.set('q', params.q);
  if (params?.sort) url.searchParams.set('sort', params.sort);
  if (params?.in_stock) url.searchParams.set('in_stock', 'true');
  if (params?.limit) url.searchParams.set('limit', String(params.limit));
  if (params?.offset) url.searchParams.set('offset', String(params.offset));
  if (params?.category) url.searchParams.set('category', params.category);

  let res: Response;
  try {
    res = await wholesaleFetch(url.toString(), {
      headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
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
      headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
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

export async function reportSale(sale: {
  channel: string;
  order_ref: string;
  items: { sku: string; qty: number; price_gbp: number }[];
}): Promise<boolean> {
  try {
    const res = await wholesaleFetch(
      WHOLESALE_URL + '/api/v1/sales',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + WHOLESALE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sale),
      },
      SALE_REPORT_TIMEOUT_MS,
    );
    return res.ok;
  } catch (err) {
    console.error('[wholesale] sale report failed', err);
    return false;
  }
}
