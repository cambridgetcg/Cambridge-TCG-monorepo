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

// ── The ground route ─────────────────────────────────────────────────
//
// The wholesale app is retired: its domain 301s to cambridgetcg.com and
// the API times out. The catalog paths (fetchPrices / fetchGames /
// fetchSets) therefore fall back to reading the wholesale Postgres
// directly (./db-source) when HTTP fails — and skip HTTP entirely when
// WHOLESALE_DB_DIRECT=1, so production can be flipped to direct reads
// without waiting out a 5s timeout per request. Each response names the
// source that actually served it, so surfaces can label the provenance
// instead of passing a database read off as a live API.

import {
  dbFetchAggregatorCoverage,
  dbFetchAggregatorCoverageHistory,
  dbFetchGames,
  dbFetchPrices,
  dbFetchSets,
  dbLookupCard,
} from './db-source';
import {
  publicCatalogSort,
  withholdUnreviewedWholesaleFields,
} from '@/lib/public-wholesale-fields';

/**
 * Which substrate served a catalog response.
 *  - 'wholesale-api' — the retired HTTP API answered (live upstream).
 *  - 'wholesale-db'  — direct read from the wholesale Postgres.
 *  - 'unavailable'   — both failed; any empty items array means the
 *    sources are down, NOT that no cards exist.
 */
export type WholesaleSource = 'wholesale-api' | 'wholesale-db' | 'unavailable';

// Read per call, not at module scope, so ops can flip the env var
// without a rebuild and tests can stub it.
function dbDirectOnly(): boolean {
  return (process.env.WHOLESALE_DB_DIRECT || '').trim() === '1';
}

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
  price_gbp: number | null;
  channel_price?: number | null;
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
  /** True when the stored title names the plain printing and nothing else
   *  (One Piece only; see ./listing-printing). False is not a claim that the
   *  row is a variant, only that its title does not show it is not. */
  plain_listing?: boolean;
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
  /**
   * Substrate that served this page — see {@link WholesaleSource}.
   * fetchPrices always stamps it; it is optional only because a few
   * callers synthesize a shape-compatible empty envelope for genuine
   * "no matches" results (e.g. the search routes' game fallbacks),
   * which carry no source claim at all.
   */
  source?: WholesaleSource;
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
  const safeSort = publicCatalogSort(params?.sort);
  // After wholesale fix #2 the API ignores ?channel= and uses the key's
  // own channel. We still send it for log clarity, and we swap the key
  // for the wholesale channel.
  const channel = params?.channel ?? 'cambridgetcg';
  url.searchParams.set('channel', channel);
  if (params?.game) url.searchParams.set('game', params.game);
  if (params?.set) url.searchParams.set('set', params.set);
  if (params?.q) url.searchParams.set('q', params.q);
  url.searchParams.set('sort', safeSort);
  if (params?.in_stock) url.searchParams.set('in_stock', 'true');
  if (params?.limit) url.searchParams.set('limit', String(params.limit));
  if (params?.offset) url.searchParams.set('offset', String(params.offset));
  if (params?.category) url.searchParams.set('category', params.category);

  if (!dbDirectOnly()) {
    try {
      const res = await wholesaleFetch(url.toString(), {
        headers: { Authorization: 'Bearer ' + keyForChannel(channel) },
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const data = await res.json() as PricesResponse;
        return {
          ...data,
          items: data.items.map(withholdUnreviewedWholesaleFields),
          source: 'wholesale-api',
        };
      }
      console.error('[wholesale] prices error', res.status, await res.text().catch(() => ''));
    } catch (err) {
      console.error('[wholesale] prices fetch error', err);
    }
  }

  try {
    return await dbFetchPrices({ ...params, sort: safeSort });
  } catch (err) {
    console.error('[wholesale] prices db-source error', err);
    return { count: 0, total: 0, channel: '', items: [], source: 'unavailable' };
  }
}

/** Why a SKU has no card here, when a source did answer. */
export interface CardAbsence {
  reason:
    | 'unknown_sku'          // no row under this SKU in any stored spelling
    | 'no_listing'           // a plain SKU whose number has no listing in this language
    | 'none_plain'           // listings exist; none is shown by its title to be the plain printing
    | 'several_plain'        // more than one is, so none is picked
    | 'marked_listing'       // its own row is a marked listing, and no other title may be read (not One Piece)
    | 'titles_not_reviewed'; // a plain SKU of a game whose listing titles were not reviewed
  /** Stored SKUs of the same number and language a caller may choose from. */
  listings: string[];
}

export interface CardLookup {
  card: PriceItem | null;
  source: WholesaleSource;
  absence: CardAbsence | null;
}

/**
 * One card by SKU, with provenance (see fetchGamesDetailed). `card.sku` is the
 * stored key, which differs from the SKU asked for when it was found under
 * another spelling or is a plain SKU's plain listing. An outage is
 * source 'unavailable' with no absence: it never reads as a missing card.
 *
 * Read from the wholesale Postgres only. The wholesale HTTP route for one card
 * answers 503 to every caller (apps/wholesale/src/app/api/v1/prices/[sku]),
 * and only the database read can look for a plain SKU's plain listing.
 */
export async function fetchCardDetailed(sku: string): Promise<CardLookup> {
  try {
    return { ...(await dbLookupCard(sku)), source: 'wholesale-db' };
  } catch (err) {
    console.error('[wholesale] card db-source error', err);
    return { card: null, source: 'unavailable', absence: null };
  }
}

/** The B2B callers also pass a channel. A card read carries no price, so it has no effect. */
export const fetchCard: (sku: string, channel?: string) => Promise<PriceItem | null> =
  async (sku) => (await fetchCardDetailed(sku)).card;

export interface GamesResult {
  games: GameItem[];
  source: WholesaleSource;
}

/**
 * fetchGames with source provenance. Callers that must distinguish
 * "no games" from "sources down" (the catalog route's 503 path) use
 * this; fetchGames below keeps the legacy array shape.
 */
export async function fetchGamesDetailed(): Promise<GamesResult> {
  if (!dbDirectOnly()) {
    try {
      const res = await wholesaleFetch(WHOLESALE_URL + '/api/v1/games', {
        headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
        next: { revalidate: 600 },
      });
      if (res.ok) {
        const data: unknown = await res.json();
        // HTTP 200 alone is not a catalog result. Only an explicit array
        // distinguishes a legitimate empty collection from an error payload.
        if (data === null || typeof data !== 'object' || !('games' in data) || !Array.isArray(data.games)) {
          throw new Error('wholesale games response missing a games array');
        }
        return { games: data.games, source: 'wholesale-api' };
      }
      console.error('[wholesale] games error', res.status);
    } catch (err) {
      console.error('[wholesale] games fetch error', err);
    }
  }
  try {
    return { games: await dbFetchGames(), source: 'wholesale-db' };
  } catch (err) {
    console.error('[wholesale] games db-source error', err);
    return { games: [], source: 'unavailable' };
  }
}

export async function fetchGames(): Promise<GameItem[]> {
  return (await fetchGamesDetailed()).games;
}

export interface SetsResult {
  sets: SetItem[];
  source: WholesaleSource;
}

/** Source-aware companion to fetchSets — see fetchGamesDetailed. */
export async function fetchSetsDetailed(game?: string): Promise<SetsResult> {
  if (!dbDirectOnly()) {
    const url = new URL(WHOLESALE_URL + '/api/v1/sets');
    if (game) url.searchParams.set('game', game);
    try {
      const res = await wholesaleFetch(url.toString(), {
        headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
        next: { revalidate: 600 },
      });
      if (res.ok) {
        const data: unknown = await res.json();
        if (data === null || typeof data !== 'object' || !('sets' in data) || !Array.isArray(data.sets)) {
          throw new Error('wholesale sets response missing a sets array');
        }
        return { sets: data.sets, source: 'wholesale-api' };
      }
      console.error('[wholesale] sets error', res.status);
    } catch (err) {
      console.error('[wholesale] sets fetch error', err);
    }
  }
  try {
    return { sets: await dbFetchSets(game), source: 'wholesale-db' };
  } catch (err) {
    console.error('[wholesale] sets db-source error', err);
    return { sets: [], source: 'unavailable' };
  }
}

export async function fetchSets(game?: string): Promise<SetItem[]> {
  return (await fetchSetsDetailed(game)).sets;
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
 * Aggregator coverage row from the wholesale observation database.
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
  /** Exact distinct-card union across every source attached to this game. */
  distinct_cards: number;
  /** Largest distinct-card count contributed by any one source. */
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
    /** Archive rows whose card has no game assignment. Included in totals. */
    unassigned_observations: number;
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

export type AggregatorCoverageHistoryWindow = "7d" | "30d" | "90d";

export interface AggregatorCoverageHistoryDay {
  date: string;
  is_current_utc_day: boolean;
  observations: number;
  distinct_cards: number;
  distinct_games: number;
  distinct_sources: number;
  unassigned_observations: number;
  sources: string[];
  games: string[];
}

export interface AggregatorCoverageHistoryResponse {
  period: {
    start: string;
    through: string;
    timezone: "UTC";
    current_utc_day_may_be_incomplete: true;
  };
  summary: {
    total_observations: number;
    distinct_cards: number;
    distinct_games: number;
    distinct_sources: number;
    unassigned_observations: number;
    observed_days_including_current: number;
    completed_days: number;
    observed_completed_days: number;
    zero_observation_completed_days: number;
    observation_completed_day_ratio: number;
  };
  by_day: AggregatorCoverageHistoryDay[];
  observed_sources: string[];
  filter: {
    window: AggregatorCoverageHistoryWindow;
    window_days: number;
    source: string | null;
    game: string | null;
  };
  queried_at: string;
}

const COVERAGE_CACHE_TTL_MS = 30_000;
const COVERAGE_CACHE_MAX_KEYS = 64;
const COVERAGE_MAX_IN_FLIGHT = 3;

interface CoverageCacheEntry<T> {
  expiresAt: number;
  pending: Promise<T>;
  settled: boolean;
}

const coverageCache = new Map<
  string,
  CoverageCacheEntry<AggregatorCoverageResponse>
>();
const coverageHistoryCache = new Map<
  string,
  CoverageCacheEntry<AggregatorCoverageHistoryResponse>
>();
let coverageReadsInFlight = 0;

class CoverageReadCapacityError extends Error {
  constructor() {
    super("coverage read capacity is currently full");
    this.name = "CoverageReadCapacityError";
  }
}

function coverageCacheKey(opts?: {
  source?: string;
  game?: string;
  since?: string;
}): string {
  return JSON.stringify({
    source: opts?.source ?? null,
    game: opts?.game ?? null,
    since: opts?.since ?? null,
  });
}

function cacheCoverageRead<T>(
  cache: Map<string, CoverageCacheEntry<T>>,
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && (!cached.settled || cached.expiresAt > now)) {
    return cached.pending;
  }
  if (cached) cache.delete(key);

  if (cache.size >= COVERAGE_CACHE_MAX_KEYS) {
    const reusable = [...cache.entries()].find(([, entry]) => entry.settled);
    if (!reusable) return Promise.reject(new CoverageReadCapacityError());
    cache.delete(reusable[0]);
  }

  const pending = runBoundedCoverageRead(read);
  const entry: CoverageCacheEntry<T> = {
    expiresAt: now + COVERAGE_CACHE_TTL_MS,
    pending,
    settled: false,
  };
  cache.set(key, entry);
  void pending.then(
    () => {
      entry.settled = true;
    },
    () => {
      entry.settled = true;
      if (cache.get(key) === entry) cache.delete(key);
    },
  );
  return pending;
}

function runBoundedCoverageRead<T>(read: () => Promise<T>): Promise<T> {
  if (coverageReadsInFlight >= COVERAGE_MAX_IN_FLIGHT) {
    return Promise.reject(new CoverageReadCapacityError());
  }

  coverageReadsInFlight += 1;
  return Promise.resolve()
    .then(read)
    .finally(() => {
      coverageReadsInFlight -= 1;
    });
}

function reportCoverageReadError(scope: string, error: unknown): void {
  if (error instanceof CoverageReadCapacityError) return;
  console.error(`[wholesale] ${scope} db-source error`, error);
}

/**
 * Fetch the aggregator's "what we've collected" snapshot directly from the
 * wholesale Postgres. The historical HTTP route never shipped, so probing it
 * would add a known redirect/404/timeout before every honest read. Returns
 * null when the database cannot answer or the shared read ceiling is full,
 * and empty arrays when the database is reachable but has no observations.
 */
export async function fetchAggregatorCoverage(opts?: {
  source?: string;
  game?: string;
  since?: string;
}): Promise<AggregatorCoverageResponse | null> {
  const normalized = {
    source: opts?.source || undefined,
    game: opts?.game || undefined,
    since: opts?.since || undefined,
  };
  try {
    if ((process.env.COVERAGE_CACHE_DISABLED || '').trim() === '1') {
      return await runBoundedCoverageRead(() =>
        dbFetchAggregatorCoverage(normalized),
      );
    }
    return await cacheCoverageRead(
      coverageCache,
      coverageCacheKey(normalized),
      () => dbFetchAggregatorCoverage(normalized),
    );
  } catch (err) {
    reportCoverageReadError("aggregator coverage", err);
    return null;
  }
}

/**
 * Read a bounded daily history of archive coverage. Like the current coverage
 * snapshot, this uses the direct database ground route and distinguishes a
 * reachable empty window from an unavailable or currently saturated read.
 */
export async function fetchAggregatorCoverageHistory(opts?: {
  window?: AggregatorCoverageHistoryWindow;
  source?: string;
  game?: string;
}): Promise<AggregatorCoverageHistoryResponse | null> {
  const normalized = {
    window: opts?.window ?? "30d",
    source: opts?.source || undefined,
    game: opts?.game || undefined,
  };
  const key = JSON.stringify({
    window: normalized.window,
    source: normalized.source ?? null,
    game: normalized.game ?? null,
  });

  try {
    if ((process.env.COVERAGE_CACHE_DISABLED || "").trim() === "1") {
      return await runBoundedCoverageRead(() =>
        dbFetchAggregatorCoverageHistory(normalized),
      );
    }
    return await cacheCoverageRead(
      coverageHistoryCache,
      key,
      () => dbFetchAggregatorCoverageHistory(normalized),
    );
  } catch (err) {
    reportCoverageReadError("aggregator coverage history", err);
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
 * The wholesale sources route's answer (a 503) while no price source is
 * cleared for publication. It is policy, not an outage.
 */
export const PRICE_SOURCES_WITHHELD_STATUS = "publication_withheld_pending_field_level_rights";

export interface PriceSourcesWithheld {
  withheld: true;
  note: string | null;
}

/**
 * Fetch the multi-source price view for one card on its latest snapshot
 * day (or a caller-specified date). Drives the kingdom-090 price-search
 * composer's `prices_today` block. Returns null on 404 (card or snapshot
 * missing); falcon-degrade-to-null on transport failure so the composer
 * can render a substrate-honest "no source rows yet" state instead of
 * fabricating prices. The publication-withheld policy answer comes back
 * as its own state, so it is neither logged as an error nor reported as
 * missing data.
 */
export async function fetchPriceSources(opts: {
  sku: string;
  date?: string;
}): Promise<MultiSourcePriceResponse | PriceSourcesWithheld | null> {
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
  if (res.status === 503) {
    const body = (await res.json().catch(() => null)) as { status?: unknown; note?: unknown } | null;
    if (body?.status === PRICE_SOURCES_WITHHELD_STATUS) {
      return { withheld: true, note: typeof body.note === "string" ? body.note : null };
    }
  }
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
