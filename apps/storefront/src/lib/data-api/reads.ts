import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { query as dbQuery } from "@/lib/db";
import { MEMBER_PRICE_POLICIES, derivationAllowed } from "@cambridge-tcg/data-ingest/member-prices";
import {
  DERIVED_MARKET_METHOD_VERSION, DERIVED_MARKET_SOURCES, EXPORTABLE_DERIVATION_SOURCES, INDEX_BASE_LEVEL, INDEX_LEVEL_PATTERN_BODY,
  MIN_INDEX_CONSTITUENTS, MIN_PREMIUM_SKUS, MIN_REFERENCE_SOURCES, MIN_REFERENCE_UNEXPORTED_SOURCES, THREE_FIGURES_PATTERN_BODY,
  marketIndexKey, referenceSourcesAllowed,
  type DerivedMarketSource, type FxCurrency, type FxQuote, type MarketDerivationRun, type MarketIndexPoint, type MarketPremium, type MarketReferencePrice,
} from "@cambridge-tcg/data-spec";
import { isNotProvisioned } from "@/lib/market-derived/provisioning";
import type { DataApiEntitlement } from "./plans";
import { TREND_BASE_GRACE_DAYS, TREND_DAYS, percentChange, type TrendWindow } from "./trends";

/**
 * Readers of Cambridge-derived market data (migration 0141, method
 * ctcg.market-derived/v1) for the data API (docs/plans/tcg-data-platform/paid-data-api.md §5).
 *
 * Every statement re-reads member_price_source_releases: a row is served only
 * while every source it names is unrevoked, has derivation set and holds the
 * derivation evidence this code was written for, and the row's own run
 * recorded that same evidence. A reference is served only while at least two
 * of its sources are ones no release row exports. Revoking a source hides its
 * rows on the next read, including mid-pagination; rows are never rewritten.
 *
 * The plan's history window bounds every read: no row dated before it is
 * served, whether as history, as a latest value or in an export. Missing
 * tables, or 0139's derivation columns, are reported as not-provisioned,
 * never as empty; any other missing column is a failure.
 */

export const DATA_API_ENDPOINTS = {
  reference: "/api/v1/market/reference",
  referenceHistory: "/api/v1/market/reference/history",
  indices: "/api/v1/market/indices",
  premiums: "/api/v1/market/premiums",
  export: "/api/v1/market/export",
} as const;
export const MAX_REFERENCE_SKUS = 100;

export class DataApiQueryError extends Error {
  constructor(message: string, public readonly status: 400 | 403 = 400, public readonly code: "INVALID_INPUT" | "INSUFFICIENT_TIER" = "INVALID_INPUT") {
    super(message); this.name = "DataApiQueryError";
  }
}

// ── Queries ─────────────────────────────────────────────────────────────

export type ReferenceQuery =
  | { form: "skus"; skus: string[] }
  | { form: "set"; game: string; set: string; limit: number; cursor?: string };
export interface ReferenceHistoryQuery { sku: string; from?: string; to?: string; limit: number; cursor?: string }
/** No set is the per-game index (set_code NULL); no market is every market. */
export interface IndexQuery { game: string; set?: string; market?: DerivedMarketSource; from?: string; to?: string; limit: number; cursor?: string }
/** No date is each pair's latest servable day. */
export interface PremiumQuery { game: string; set?: string; date?: string; limit: number; cursor?: string }
export interface ExportQuery { date: string; limit: number; cursor?: string }

const GAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SET_RE = /^[a-z0-9]{1,32}$/;
const SKU_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function read(params: URLSearchParams, allowed: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const key of new Set(params.keys())) {
    if (!allowed.includes(key)) throw new DataApiQueryError(`Unknown parameter ${key.slice(0, 40)}`);
    if (params.getAll(key).length > 1) throw new DataApiQueryError(`Duplicate ${key}`);
    const value = params.get(key)!;
    if (value !== "") values.set(key, value);
  }
  return values;
}
function game(value: string | undefined, required: true): string;
function game(value: string | undefined, required: false): string | undefined;
function game(value: string | undefined, required: boolean): string | undefined {
  if (value === undefined) { if (required) throw new DataApiQueryError("game is required"); return undefined; }
  if (value.length > 64 || !GAME_RE.test(value)) throw new DataApiQueryError("Invalid game");
  return value;
}
function setCode(value: string | undefined): string | undefined {
  if (value !== undefined && !SET_RE.test(value)) throw new DataApiQueryError("Invalid set");
  return value;
}
function sku(value: string): string {
  if (!SKU_RE.test(value)) throw new DataApiQueryError("Invalid sku: use the canonical lowercase Cambridge SKU");
  return value;
}
function day(value: string | undefined, key: string): string | undefined {
  if (value === undefined) return undefined;
  const parsed = DATE_RE.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new DataApiQueryError(`Invalid ${key}: use YYYY-MM-DD`);
  return value;
}
function limit(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new DataApiQueryError(`Limit must be 1–${max}`);
  return Number(value);
}
function cursor(value: string | undefined): string | undefined {
  if (value !== undefined && (value.length > 4096 || !CURSOR_RE.test(value))) throw new DataApiQueryError("Invalid cursor");
  return value;
}
function range(from: string | undefined, to: string | undefined) {
  if (from && to && from > to) throw new DataApiQueryError("from must not be after to");
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

export function parseReferenceQuery(params: URLSearchParams): ReferenceQuery {
  const values = read(params, ["sku", "game", "set", "limit", "cursor"]);
  const list = values.get("sku");
  if (list !== undefined) {
    if (["game", "set", "limit", "cursor"].some(key => values.has(key))) throw new DataApiQueryError("Use either sku or game and set");
    const skus = [...new Set(list.split(",").map(sku))];
    if (skus.length > MAX_REFERENCE_SKUS) throw new DataApiQueryError(`At most ${MAX_REFERENCE_SKUS} SKUs per request`);
    return { form: "skus", skus };
  }
  const set = setCode(values.get("set"));
  if (!set) throw new DataApiQueryError("Give sku, or game and set");
  const parsed: ReferenceQuery = { form: "set", game: game(values.get("game"), true), set, limit: limit(values.get("limit"), 100, 500) };
  const next = cursor(values.get("cursor"));
  return next ? { ...parsed, cursor: next } : parsed;
}

export function parseReferenceHistoryQuery(params: URLSearchParams): ReferenceHistoryQuery {
  const values = read(params, ["sku", "from", "to", "limit", "cursor"]);
  const value = values.get("sku");
  if (value === undefined) throw new DataApiQueryError("sku is required");
  const parsed: ReferenceHistoryQuery = { sku: sku(value), ...range(day(values.get("from"), "from"), day(values.get("to"), "to")), limit: limit(values.get("limit"), 366, 1000) };
  const next = cursor(values.get("cursor"));
  return next ? { ...parsed, cursor: next } : parsed;
}

export function parseIndexQuery(params: URLSearchParams): IndexQuery {
  const values = read(params, ["game", "set", "market", "from", "to", "limit", "cursor"]);
  const market = values.get("market");
  if (market !== undefined && !(DERIVED_MARKET_SOURCES as readonly string[]).includes(market)) throw new DataApiQueryError("Unknown market");
  const set = setCode(values.get("set"));
  const parsed: IndexQuery = {
    game: game(values.get("game"), true), ...(set ? { set } : {}), ...(market ? { market: market as DerivedMarketSource } : {}),
    ...range(day(values.get("from"), "from"), day(values.get("to"), "to")), limit: limit(values.get("limit"), 500, 1000),
  };
  const next = cursor(values.get("cursor"));
  return next ? { ...parsed, cursor: next } : parsed;
}

export function parsePremiumQuery(params: URLSearchParams): PremiumQuery {
  const values = read(params, ["game", "set", "date", "limit", "cursor"]);
  const set = setCode(values.get("set"));
  const date = day(values.get("date"), "date");
  const parsed: PremiumQuery = { game: game(values.get("game"), true), ...(set ? { set } : {}), ...(date ? { date } : {}), limit: limit(values.get("limit"), 100, 500) };
  const next = cursor(values.get("cursor"));
  return next ? { ...parsed, cursor: next } : parsed;
}

export function parseExportQuery(params: URLSearchParams): ExportQuery {
  const values = read(params, ["date", "limit", "cursor"]);
  const date = day(values.get("date"), "date");
  if (!date) throw new DataApiQueryError("date is required");
  const parsed: ExportQuery = { date, limit: limit(values.get("limit"), 1000, 5000) };
  const next = cursor(values.get("cursor"));
  return next ? { ...parsed, cursor: next } : parsed;
}

// ── Pages ───────────────────────────────────────────────────────────────

/** The plan's history window. start is the earliest as_of this plan is
 * served (null: full history). clipped is true when a requested range began
 * before start, so earlier rows, if any, were not served. */
export interface HistoryWindow { days: number | null; start: string | null; clipped: boolean }

export interface DerivedPage<T> {
  status: "available" | "empty" | "not-provisioned" | "unavailable";
  items: T[];
  nextCursor: string | null;
  /** Highest derivation run id this pagination reads, NOT a freshness claim. */
  ceiling: string | null;
  /** Time this pagination snapshot was opened, NOT data freshness; each row carries its asOf. */
  asOf: string | null;
  count: number;
  /** End of THIS filtered, servable result. */
  complete: boolean;
  history: HistoryWindow;
  reason?: string;
}

export interface IndexChange { baseAsOf: string; changePercent: string }
export interface IndexEntry { point: MarketIndexPoint; changes: Record<TrendWindow, IndexChange | null> }

export type DerivedExportRow =
  | ({ type: "reference" } & MarketReferencePrice)
  | ({ type: "index" } & MarketIndexPoint)
  | ({ type: "premium" } & MarketPremium);
export interface DerivedExportPage extends DerivedPage<DerivedExportRow> {
  /** The day's run, or null when none is recorded for it. */
  run: MarketDerivationRun | null;
  /** Servable rows of the whole day, across pages. */
  total: number;
}

export interface ReadOptions { now?: Date; runQuery?: typeof dbQuery }

const DAY_MS = 86_400_000;
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);
function windowStart(entitlement: DataApiEntitlement, now: Date): string | null {
  if (entitlement.historyDays === null) return null;
  if (!Number.isSafeInteger(entitlement.historyDays) || entitlement.historyDays < 0) throw new TypeError("Invalid history window.");
  return isoDay(Date.parse(`${isoDay(now.getTime())}T00:00:00.000Z`) - entitlement.historyDays * DAY_MS);
}
function historyWindow(entitlement: DataApiEntitlement, now: Date, requestedFrom?: string | null): HistoryWindow {
  const start = windowStart(entitlement, now);
  // undefined: a range read with no lower bound; null: not a range read.
  const clipped = start !== null && requestedFrom !== null && (requestedFrom === undefined || requestedFrom < start);
  return { days: entitlement.historyDays, start, clipped };
}
/** A single date before the plan's window is refused, not answered as empty. */
function requireInWindow(date: string, history: HistoryWindow): void {
  if (history.start !== null && date < history.start) {
    throw new DataApiQueryError(`${date} is before your plan's history window, which starts ${history.start}.`, 403, "INSUFFICIENT_TIER");
  }
}

function base(history: HistoryWindow, status: DerivedPage<unknown>["status"], reason: string) {
  return { status, items: [], nextCursor: null, ceiling: null, asOf: null, count: 0, complete: false, history, reason };
}

// ── Cursors ─────────────────────────────────────────────────────────────

// Same secret as the member feed (lib/prices/member-feed.ts); the domain and
// binding keep a data-API cursor and a member-price cursor apart.
const CURSOR_DOMAIN = "ctcg.data-api.cursor/v1";
const CURSOR_TTL_MS = 24 * 60 * 60 * 1000;
interface Cursor { version: 1; binding: string; ceiling: string; after: string[]; asOf: string }
function cursorSecret(): string {
  const secret = process.env.MEMBER_PRICE_CURSOR_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("data-api-cursor-secret-unavailable");
  return secret;
}
const sign = (body: string) => createHmac("sha256", cursorSecret()).update(`${CURSOR_DOMAIN}.${body}`).digest();
function bind(actor: { userId: string }, endpoint: string, fields: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify([CURSOR_DOMAIN, actor.userId, endpoint, ...fields])).digest("hex");
}
function encodeCursor(cursor: Cursor): string {
  const body = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}
const ID_RE = /^(?:0|[1-9]\d{0,18})$/;
function decodeCursor(value: string, binding: string, after: readonly RegExp[], now: Date): Cursor {
  try {
    const [body, signature, extra] = value.split(".");
    if (!body || !signature || extra) throw new Error();
    const expected = sign(body);
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error();
    const cursor = JSON.parse(Buffer.from(body, "base64url").toString()) as Cursor;
    const opened = typeof cursor.asOf === "string" ? Date.parse(cursor.asOf) : NaN;
    if (cursor.version !== 1 || cursor.binding !== binding || typeof cursor.ceiling !== "string" || !ID_RE.test(cursor.ceiling)
      || !Array.isArray(cursor.after) || cursor.after.length !== after.length
      || !cursor.after.every((part, i) => typeof part === "string" && after[i]!.test(part))
      || !Number.isFinite(opened) || now.getTime() - opened > CURSOR_TTL_MS || opened > now.getTime() + 60_000) throw new Error();
    return cursor;
  } catch { throw new DataApiQueryError("Invalid, expired, or filter-mismatched cursor"); }
}

// ── SQL ─────────────────────────────────────────────────────────────────

function derivationPolicies(): string {
  return JSON.stringify(Object.entries(MEMBER_PRICE_POLICIES).flatMap(([source, policy]) => {
    const derivation = policy.derivation as { evidenceVersion: string; evidenceUrl: string } | null;
    return derivation ? [{ source, version: derivation.evidenceVersion, evidenceUrl: derivation.evidenceUrl }] : [];
  }));
}

// $1 cursor ceiling (or null), $2 derivation policies, $3 method version, $4 window start (or null).
// allowed and exportable are a few rows read once per statement; MATERIALIZED
// keeps PostgreSQL from re-deriving them for every candidate row.
const PRELUDE = `ceiling AS (
      SELECT COALESCE($1::bigint, (SELECT MAX(id) FROM market_derivation_runs), 0) AS id
    ), allowed AS MATERIALIZED (
      SELECT r.source, r.derivation_evidence_version AS version FROM member_price_source_releases r
      JOIN jsonb_to_recordset($2::jsonb) AS p(source text, version text, "evidenceUrl" text)
        ON p.source = r.source AND p.version = r.derivation_evidence_version AND p."evidenceUrl" = r.derivation_evidence_url
      WHERE r.revoked_at IS NULL AND r.derivation
    ), exportable AS MATERIALIZED (
      SELECT r.source FROM member_price_source_releases r WHERE r.member_api OR r.member_download
    )`;
/** Method, snapshot, window and read-time revocation for a derived row `t` of run `r`. */
const visible = (t: string, r: string) => `${t}.method_version = $3 AND ${t}.run_id <= (SELECT id FROM ceiling)
        AND ($4::date IS NULL OR ${t}.as_of >= $4::date)
        AND NOT EXISTS (SELECT 1 FROM unnest(${t}.sources) AS s(source) WHERE NOT EXISTS (
          SELECT 1 FROM allowed a WHERE a.source = s.source AND a.version = ${r}.input_evidence ->> s.source))`;
/** A reference needs this many sources that no release row exports. A revoked
 * row's member_api or member_download still counts: those values went out. */
const unexported = (t: string) =>
  `(SELECT count(*) FROM unnest(${t}.sources) AS s(source) WHERE s.source NOT IN (SELECT e.source FROM exportable e)) >= ${MIN_REFERENCE_UNEXPORTED_SOURCES}`;
const common = (t: string, evidence: string) => `'runId', ${t}.run_id::text, 'methodVersion', ${t}.method_version, 'asOf', to_char(${t}.as_of, 'YYYY-MM-DD'),
        'game', ${t}.game, 'setCode', ${t}.set_code, 'sources', to_jsonb(${t}.sources), '_evidence', ${evidence}`;
const referenceItem = (t: string, evidence: string) => `jsonb_build_object(${common(t, evidence)},
        'sku', ${t}.sku, 'amount', ${t}.amount::text, 'currency', ${t}.currency, 'confidence', ${t}.confidence, 'sourceCount', ${t}.source_count)`;
const indexItem = (t: string, evidence: string) => `jsonb_build_object(${common(t, evidence)},
        'indexKey', ${t}.index_key, 'market', ${t}.market, 'level', ${t}.level::text, 'constituents', ${t}.constituents,
        'previousAsOf', to_char(${t}.previous_as_of, 'YYYY-MM-DD'))`;
const premiumItem = (t: string, evidence: string) => `jsonb_build_object(${common(t, evidence)},
        'market', ${t}.market, 'baseMarket', ${t}.base_market, 'ratioP25', ${t}.ratio_p25::text, 'ratioMedian', ${t}.ratio_median::text,
        'ratioP75', ${t}.ratio_p75::text, 'skuCount', ${t}.sku_count,
        'marketLanguages', to_jsonb(${t}.market_languages), 'baseLanguages', to_jsonb(${t}.base_languages))`;
const trendBase = (days: number) => `LEFT JOIN LATERAL (
        SELECT jsonb_build_object('asOf', to_char(b.as_of, 'YYYY-MM-DD'), 'level', b.level::text) AS base
        FROM market_indices b JOIN market_derivation_runs br ON br.id = b.run_id
        WHERE b.index_key = page.index_key AND ${visible("b", "br")}
          AND b.as_of <= page.as_of - ${days} AND b.as_of >= page.as_of - ${days + TREND_BASE_GRACE_DAYS}
        ORDER BY b.as_of DESC LIMIT 1
      ) d${days} ON true`;

const REFERENCE_BY_SKUS_SQL = `WITH ${PRELUDE}
    SELECT (SELECT id::text FROM ceiling) AS ceiling,
      COALESCE((SELECT jsonb_agg(latest.item ORDER BY q.ord)
        FROM jsonb_array_elements_text($5::jsonb) WITH ORDINALITY AS q(sku, ord)
        CROSS JOIN LATERAL (
          SELECT ${referenceItem("m", "r.input_evidence")} AS item
          FROM market_reference_prices m JOIN market_derivation_runs r ON r.id = m.run_id
          WHERE m.sku = q.sku AND ${visible("m", "r")} AND ${unexported("m")}
          ORDER BY m.as_of DESC LIMIT 1
        ) latest), '[]'::jsonb) AS items`;

// The latest servable row per SKU is chosen on narrow columns, and items are
// built for the page alone: a set holds every SKU's whole history.
const REFERENCE_BY_SET_SQL = `WITH ${PRELUDE}, latest AS (
      SELECT DISTINCT ON (m.sku) m.sku, m.id
      FROM market_reference_prices m JOIN market_derivation_runs r ON r.id = m.run_id
      WHERE m.game = $5 AND m.set_code = $6 AND ${visible("m", "r")} AND ${unexported("m")}
        AND ($7::text IS NULL OR m.sku > $7::text)
      ORDER BY m.sku, m.as_of DESC
    ), page AS (SELECT * FROM latest ORDER BY sku LIMIT $8::int)
    SELECT (SELECT id::text FROM ceiling) AS ceiling,
      COALESCE((SELECT jsonb_agg(${referenceItem("m", "r.input_evidence")} ORDER BY page.sku)
        FROM page JOIN market_reference_prices m ON m.id = page.id JOIN market_derivation_runs r ON r.id = m.run_id), '[]'::jsonb) AS items`;

const REFERENCE_HISTORY_SQL = `WITH ${PRELUDE}, page AS (
      SELECT m.as_of, ${referenceItem("m", "r.input_evidence")} AS item
      FROM market_reference_prices m JOIN market_derivation_runs r ON r.id = m.run_id
      WHERE m.sku = $5 AND ${visible("m", "r")} AND ${unexported("m")}
        AND ($6::date IS NULL OR m.as_of >= $6::date) AND ($7::date IS NULL OR m.as_of <= $7::date)
        AND ($8::date IS NULL OR m.as_of > $8::date)
      ORDER BY m.as_of LIMIT $9::int
    )
    SELECT (SELECT id::text FROM ceiling) AS ceiling,
      COALESCE((SELECT jsonb_agg(page.item ORDER BY page.as_of) FROM page), '[]'::jsonb) AS items`;

const INDICES_SQL = `WITH ${PRELUDE}, page AS (
      SELECT i.*, r.input_evidence FROM market_indices i JOIN market_derivation_runs r ON r.id = i.run_id
      WHERE i.index_key IN (SELECT jsonb_array_elements_text($5::jsonb)) AND ${visible("i", "r")}
        AND ($6::date IS NULL OR i.as_of >= $6::date) AND ($7::date IS NULL OR i.as_of <= $7::date)
        AND ($8::text IS NULL OR (i.index_key, i.as_of) > ($8::text, $9::date))
      ORDER BY i.index_key, i.as_of LIMIT $10::int
    )
    SELECT (SELECT id::text FROM ceiling) AS ceiling,
      COALESCE((SELECT jsonb_agg(${indexItem("page", "page.input_evidence")}
          || jsonb_build_object('_bases', jsonb_build_object(${TREND_DAYS.map(days => `'d${days}', d${days}.base`).join(", ")}))
          ORDER BY page.index_key, page.as_of)
        FROM page
      ${TREND_DAYS.map(trendBase).join("\n      ")}), '[]'::jsonb) AS items`;

const PREMIUMS_SQL = `WITH ${PRELUDE}, latest AS (
      SELECT DISTINCT ON (p.set_code, p.market, p.base_market) p.set_code, p.market, p.base_market, ${premiumItem("p", "r.input_evidence")} AS item
      FROM market_premiums p JOIN market_derivation_runs r ON r.id = p.run_id
      WHERE p.game = $5 AND ($6::text IS NULL OR p.set_code = $6::text) AND ($7::date IS NULL OR p.as_of = $7::date)
        AND ${visible("p", "r")}
        AND ($8::text IS NULL OR (p.set_code, p.market, p.base_market) > ($8::text, $9::text, $10::text))
      ORDER BY p.set_code, p.market, p.base_market, p.as_of DESC
    ), page AS (SELECT * FROM latest ORDER BY set_code, market, base_market LIMIT $11::int)
    SELECT (SELECT id::text FROM ceiling) AS ceiling,
      COALESCE((SELECT jsonb_agg(page.item ORDER BY page.set_code, page.market, page.base_market) FROM page), '[]'::jsonb) AS items`;

const EXPORT_SQL = `WITH ${PRELUDE}, run AS (
      SELECT r.* FROM market_derivation_runs r
      WHERE r.method_version = $3 AND r.as_of = $5::date AND r.id <= (SELECT id FROM ceiling)
    ), rows AS (
      SELECT 1 AS kind, m.id, ${referenceItem("m", "r.input_evidence")} AS item
        FROM market_reference_prices m JOIN run r ON r.id = m.run_id WHERE ${visible("m", "r")} AND ${unexported("m")}
      UNION ALL
      SELECT 2, i.id, ${indexItem("i", "r.input_evidence")}
        FROM market_indices i JOIN run r ON r.id = i.run_id WHERE ${visible("i", "r")}
      UNION ALL
      SELECT 3, p.id, ${premiumItem("p", "r.input_evidence")}
        FROM market_premiums p JOIN run r ON r.id = p.run_id WHERE ${visible("p", "r")}
    ), page AS (
      SELECT * FROM rows WHERE ($6::int IS NULL OR (kind, id) > ($6::int, $7::bigint)) ORDER BY kind, id LIMIT $8::int
    )
    SELECT (SELECT id::text FROM ceiling) AS ceiling,
      (SELECT jsonb_build_object('id', run.id::text, 'methodVersion', run.method_version, 'asOf', to_char(run.as_of, 'YYYY-MM-DD'),
         'inputBatchCeiling', run.input_batch_ceiling::text, 'inputEvidence', run.input_evidence, 'fx', run.fx,
         'createdAt', to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) FROM run) AS run,
      (SELECT count(*)::text FROM rows) AS total,
      COALESCE((SELECT jsonb_agg(page.item || jsonb_build_object('_kind', page.kind, '_id', page.id::text) ORDER BY page.kind, page.id) FROM page), '[]'::jsonb) AS items`;

// ── Row checks ──────────────────────────────────────────────────────────
// Storage already enforces these (0141). A row that fails them anyway is
// corrupt, and the whole page is refused rather than served in part.

const THREE_FIGURES = new RegExp(`^${THREE_FIGURES_PATTERN_BODY}$`);
const LEVEL = new RegExp(`^${INDEX_LEVEL_PATTERN_BODY}$`);
type Raw = Record<string, unknown>;
const str = (value: unknown, label: string, pattern?: RegExp): string => {
  if (typeof value !== "string" || !value || (pattern && !pattern.test(value))) throw new TypeError(`Derived row has an invalid ${label}.`);
  return value;
};
const int = (value: unknown, label: string, min: number): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) throw new TypeError(`Derived row has an invalid ${label}.`);
  return value;
};
function sources(raw: Raw, min: number, max: number): DerivedMarketSource[] {
  const list = raw.sources;
  if (!Array.isArray(list) || list.length < min || list.length > max
    || !list.every((source, i) => typeof source === "string" && (DERIVED_MARKET_SOURCES as readonly string[]).includes(source) && (i === 0 || list[i - 1] < source))) {
    throw new TypeError("Derived row has invalid sources.");
  }
  // The statement checked the release rows; the code checks its own policies too.
  const evidence = raw._evidence as Record<string, unknown> | null;
  if (!evidence || !list.every(source => typeof evidence[source] === "string" && derivationAllowed(source, evidence[source] as string))) {
    throw new TypeError("Derived row names a source without matching derivation evidence.");
  }
  return list as DerivedMarketSource[];
}
/** A premium side's language basis as 0141 stores it: ISO 639-1 codes or "*",
 * distinct and ascending, at least one. */
function languageBasis(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length
    || !value.every((language, i) => typeof language === "string" && /^(?:[a-z]{2}|[*])$/.test(language) && (i === 0 || value[i - 1] < language))) {
    throw new TypeError(`Derived premium has an invalid ${label} language basis.`);
  }
  return [...value] as string[];
}
function method(value: unknown): typeof DERIVED_MARKET_METHOD_VERSION {
  if (value !== DERIVED_MARKET_METHOD_VERSION) throw new TypeError("Derived row has an invalid method version.");
  return DERIVED_MARKET_METHOD_VERSION;
}
const derived = (raw: Raw) => ({ runId: str(raw.runId, "run", /^[1-9]\d*$/), methodVersion: method(raw.methodVersion), asOf: str(raw.asOf, "date", DATE_RE) });

function toReference(raw: Raw): MarketReferencePrice {
  const list = sources(raw, MIN_REFERENCE_SOURCES, DERIVED_MARKET_SOURCES.length);
  if (!referenceSourcesAllowed(list, EXPORTABLE_DERIVATION_SOURCES) || raw.sourceCount !== list.length) throw new TypeError("Derived reference has invalid sources.");
  const confidence = str(raw.confidence, "confidence", /^(?:high|medium|low)$/) as MarketReferencePrice["confidence"];
  if (confidence === "high" && list.length < 3) throw new TypeError("Derived reference has an invalid confidence.");
  if (raw.currency !== "GBP") throw new TypeError("Derived reference has an invalid currency.");
  return {
    ...derived(raw), sku: str(raw.sku, "sku"), game: str(raw.game, "game", GAME_RE), setCode: str(raw.setCode, "set", /^[a-z0-9]+$/),
    amount: str(raw.amount, "amount", THREE_FIGURES), currency: "GBP", confidence, sources: list, sourceCount: list.length,
  };
}
function toIndexPoint(raw: Raw): MarketIndexPoint {
  const list = sources(raw, 1, 1);
  const point = derived(raw);
  const market = str(raw.market, "market") as DerivedMarketSource;
  const setCode = raw.setCode === null ? null : str(raw.setCode, "set", /^[a-z0-9]+$/);
  const gameCode = str(raw.game, "game", GAME_RE);
  const previousAsOf = raw.previousAsOf === null ? null : str(raw.previousAsOf, "previous date", DATE_RE);
  const level = str(raw.level, "level", LEVEL);
  if (list[0] !== market || raw.indexKey !== marketIndexKey(gameCode, setCode, market)) throw new TypeError("Derived index has an invalid key.");
  if (previousAsOf === null ? level !== INDEX_BASE_LEVEL : previousAsOf >= point.asOf) throw new TypeError("Derived index has an invalid chain.");
  return {
    ...point, indexKey: raw.indexKey as string, game: gameCode, setCode, market, level,
    constituents: int(raw.constituents, "constituent count", MIN_INDEX_CONSTITUENTS), previousAsOf, sources: [market],
  };
}
function toPremium(raw: Raw): MarketPremium {
  const list = sources(raw, 2, 2);
  const market = str(raw.market, "market") as DerivedMarketSource, baseMarket = str(raw.baseMarket, "base market") as DerivedMarketSource;
  if (market === baseMarket || !list.includes(market) || !list.includes(baseMarket)) throw new TypeError("Derived premium has invalid markets.");
  return {
    ...derived(raw), game: str(raw.game, "game", GAME_RE), setCode: str(raw.setCode, "set", /^[a-z0-9]+$/), market, baseMarket,
    ratioP25: str(raw.ratioP25, "ratio", THREE_FIGURES), ratioMedian: str(raw.ratioMedian, "ratio", THREE_FIGURES), ratioP75: str(raw.ratioP75, "ratio", THREE_FIGURES),
    skuCount: int(raw.skuCount, "SKU count", MIN_PREMIUM_SKUS), sources: list,
    marketLanguages: languageBasis(raw.marketLanguages, "market"), baseLanguages: languageBasis(raw.baseLanguages, "base"),
  };
}
function toIndexEntry(raw: Raw): IndexEntry {
  const point = toIndexPoint(raw);
  const bases = (raw._bases ?? {}) as Record<string, { asOf?: unknown; level?: unknown } | null>;
  const changes = Object.fromEntries(TREND_DAYS.map(days => {
    const found = bases[`d${days}`];
    if (!found) return [`d${days}`, null];
    const baseAsOf = str(found.asOf, "trend date", DATE_RE);
    return [`d${days}`, { baseAsOf, changePercent: percentChange(point.level, str(found.level, "trend level", LEVEL)) }];
  })) as Record<TrendWindow, IndexChange | null>;
  return { point, changes };
}
function toRun(raw: Raw): MarketDerivationRun {
  const evidence = raw.inputEvidence as Record<string, unknown>;
  const fx = raw.fx as Record<string, Record<string, unknown>>;
  if (!evidence || typeof evidence !== "object" || !Object.entries(evidence).every(([source, version]) => (DERIVED_MARKET_SOURCES as readonly string[]).includes(source) && typeof version === "string")) {
    throw new TypeError("Derivation run has invalid input evidence.");
  }
  const quotes: Partial<Record<FxCurrency, FxQuote>> = {};
  for (const [currency, quote] of Object.entries(fx ?? {})) {
    if (!["EUR", "JPY", "USD"].includes(currency) || quote?.source !== "ecb.europa.eu") throw new TypeError("Derivation run has an invalid FX record.");
    quotes[currency as FxCurrency] = { rate: str(quote.rate, "FX rate", /^\d{1,6}(?:\.\d{1,12})?$/), source: "ecb.europa.eu", as_of: str(quote.as_of, "FX date", DATE_RE) };
  }
  return {
    id: str(raw.id, "run", /^[1-9]\d*$/), methodVersion: method(raw.methodVersion), asOf: str(raw.asOf, "date", DATE_RE),
    inputBatchCeiling: str(raw.inputBatchCeiling, "batch ceiling", /^(?:0|[1-9]\d*)$/),
    inputEvidence: evidence as MarketDerivationRun["inputEvidence"], fx: quotes, createdAt: str(raw.createdAt, "creation time"),
  };
}

// ── Readers ─────────────────────────────────────────────────────────────

/** The 0139 columns these statements read from member_price_source_releases (0137). */
const MIGRATION_0139_COLUMNS = ["derivation", "derivation_evidence_version", "derivation_evidence_url"] as const;

function failure(error: unknown, history: HistoryWindow): DerivedPage<never> {
  if (error instanceof DataApiQueryError) throw error;
  // 42P01 undefined table (0141 or 0137); 42703 only for 0139's derivation columns.
  if (isNotProvisioned(error, MIGRATION_0139_COLUMNS)) return base(history, "not-provisioned", "Derived market data is not provisioned: its tables or columns do not exist yet.");
  // Do not leak SQL, connection strings, or infrastructure details.
  console.error("[data-api] derived read unavailable", error instanceof Error ? error.name : "unknown");
  return base(history, "unavailable", "Derived market data storage is unavailable.");
}

interface Snapshot { ceiling: string | null; after: string[] | null; asOf: string }
function open(actor: { userId: string }, endpoint: string, fields: readonly unknown[], value: string | undefined, after: readonly RegExp[], now: Date) {
  if (!actor?.userId?.trim()) throw new Error("data-api-actor-required");
  const binding = bind(actor, endpoint, fields);
  const cursor = value ? decodeCursor(value, binding, after, now) : null;
  const snapshot: Snapshot = { ceiling: cursor?.ceiling ?? null, after: cursor?.after ?? null, asOf: cursor?.asOf ?? now.toISOString() };
  return { binding, snapshot };
}
function finish<T>(rows: Raw[], pageLimit: number, map: (raw: Raw) => T, position: (raw: Raw) => string[], binding: string, ceiling: string, snapshot: Snapshot, history: HistoryWindow): DerivedPage<T> {
  const more = rows.length > pageLimit;
  const kept = rows.slice(0, pageLimit);
  const items = kept.map(map);
  const nextCursor = more ? encodeCursor({ version: 1, binding, ceiling, after: position(kept.at(-1)!), asOf: snapshot.asOf }) : null;
  return { status: items.length ? "available" : "empty", items, nextCursor, ceiling, asOf: snapshot.asOf, count: items.length, complete: !more, history };
}
const prelude = (snapshot: Snapshot, history: HistoryWindow) => [snapshot.ceiling, derivationPolicies(), DERIVED_MARKET_METHOD_VERSION, history.start];

/** Latest servable reference per SKU: a list of at most 100 SKUs in one
 * complete page, or a set's SKUs in signed pages. */
export async function readReferencePrices(actor: { userId: string }, entitlement: DataApiEntitlement, query: ReferenceQuery, options: ReadOptions = {}): Promise<DerivedPage<MarketReferencePrice>> {
  const now = options.now ?? new Date();
  const history = historyWindow(entitlement, now, null);
  const run = options.runQuery ?? dbQuery;
  if (query.form === "skus") {
    // One complete page: no cursor to bind.
    const { snapshot } = open(actor, DATA_API_ENDPOINTS.reference, [], undefined, [], now);
    try {
      const response = await run(REFERENCE_BY_SKUS_SQL, [...prelude(snapshot, history), JSON.stringify(query.skus)]);
      const raw = response.rows[0];
      if (!raw) return base(history, "unavailable", "Derived market storage did not return a snapshot.");
      return finish(raw.items as Raw[], MAX_REFERENCE_SKUS, toReference, () => [], "", String(raw.ceiling), snapshot, history);
    } catch (error) { return failure(error, history); }
  }
  const { binding, snapshot } = open(actor, DATA_API_ENDPOINTS.reference, ["set", query.game, query.set, query.limit], query.cursor, [SKU_RE], now);
  try {
    const response = await run(REFERENCE_BY_SET_SQL, [...prelude(snapshot, history), query.game, query.set, snapshot.after?.[0] ?? null, query.limit + 1]);
    const raw = response.rows[0];
    if (!raw) return base(history, "unavailable", "Derived market storage did not return a snapshot.");
    return finish(raw.items as Raw[], query.limit, toReference, row => [String(row.sku)], binding, String(raw.ceiling), snapshot, history);
  } catch (error) { return failure(error, history); }
}

/** One SKU's servable references, oldest first, clipped to the plan's window. */
export async function readReferenceHistory(actor: { userId: string }, entitlement: DataApiEntitlement, query: ReferenceHistoryQuery, options: ReadOptions = {}): Promise<DerivedPage<MarketReferencePrice>> {
  const now = options.now ?? new Date();
  const history = historyWindow(entitlement, now, query.from);
  const { binding, snapshot } = open(actor, DATA_API_ENDPOINTS.referenceHistory, [query.sku, query.from ?? null, query.to ?? null, query.limit], query.cursor, [DATE_RE], now);
  try {
    const response = await (options.runQuery ?? dbQuery)(REFERENCE_HISTORY_SQL, [...prelude(snapshot, history), query.sku, query.from ?? null, query.to ?? null, snapshot.after?.[0] ?? null, query.limit + 1]);
    const raw = response.rows[0];
    if (!raw) return base(history, "unavailable", "Derived market storage did not return a snapshot.");
    return finish(raw.items as Raw[], query.limit, toReference, row => [String(row.asOf)], binding, String(raw.ceiling), snapshot, history);
  } catch (error) { return failure(error, history); }
}

/** Index levels per series and day, each with its 7, 30 and 90 day change
 * against the latest servable level inside the plan's window. */
export async function readMarketIndices(actor: { userId: string }, entitlement: DataApiEntitlement, query: IndexQuery, options: ReadOptions = {}): Promise<DerivedPage<IndexEntry>> {
  const now = options.now ?? new Date();
  const history = historyWindow(entitlement, now, query.from);
  const keys = (query.market ? [query.market] : DERIVED_MARKET_SOURCES).map(market => marketIndexKey(query.game, query.set ?? null, market)).sort();
  const { binding, snapshot } = open(actor, DATA_API_ENDPOINTS.indices, [query.game, query.set ?? null, query.market ?? null, query.from ?? null, query.to ?? null, query.limit], query.cursor, [/^[a-z0-9:*-]{1,128}$/, DATE_RE], now);
  try {
    const response = await (options.runQuery ?? dbQuery)(INDICES_SQL, [...prelude(snapshot, history), JSON.stringify(keys), query.from ?? null, query.to ?? null,
      snapshot.after?.[0] ?? null, snapshot.after?.[1] ?? null, query.limit + 1]);
    const raw = response.rows[0];
    if (!raw) return base(history, "unavailable", "Derived market storage did not return a snapshot.");
    return finish(raw.items as Raw[], query.limit, toIndexEntry, row => [String(row.indexKey), String(row.asOf)], binding, String(raw.ceiling), snapshot, history);
  } catch (error) { return failure(error, history); }
}

/** Each market pair's latest servable premium (or that date's) per set. */
export async function readMarketPremiums(actor: { userId: string }, entitlement: DataApiEntitlement, query: PremiumQuery, options: ReadOptions = {}): Promise<DerivedPage<MarketPremium>> {
  const now = options.now ?? new Date();
  const history = historyWindow(entitlement, now, null);
  if (query.date) requireInWindow(query.date, history);
  const source = new RegExp(`^(?:${DERIVED_MARKET_SOURCES.join("|")})$`);
  const { binding, snapshot } = open(actor, DATA_API_ENDPOINTS.premiums, [query.game, query.set ?? null, query.date ?? null, query.limit], query.cursor, [/^[a-z0-9]+$/, source, source], now);
  try {
    const response = await (options.runQuery ?? dbQuery)(PREMIUMS_SQL, [...prelude(snapshot, history), query.game, query.set ?? null, query.date ?? null,
      snapshot.after?.[0] ?? null, snapshot.after?.[1] ?? null, snapshot.after?.[2] ?? null, query.limit + 1]);
    const raw = response.rows[0];
    if (!raw) return base(history, "unavailable", "Derived market storage did not return a snapshot.");
    return finish(raw.items as Raw[], query.limit, toPremium, row => [String(row.setCode), String(row.market), String(row.baseMarket)], binding, String(raw.ceiling), snapshot, history);
  } catch (error) { return failure(error, history); }
}

const EXPORT_KINDS = { 1: "reference", 2: "index", 3: "premium" } as const;
/** One bounded page of a day's servable derived rows, with that day's run. */
export async function readDerivedExport(actor: { userId: string }, entitlement: DataApiEntitlement, query: ExportQuery, options: ReadOptions = {}): Promise<DerivedExportPage> {
  const now = options.now ?? new Date();
  const history = historyWindow(entitlement, now, null);
  requireInWindow(query.date, history);
  const { binding, snapshot } = open(actor, DATA_API_ENDPOINTS.export, [query.date, query.limit], query.cursor, [/^[123]$/, ID_RE], now);
  try {
    const response = await (options.runQuery ?? dbQuery)(EXPORT_SQL, [...prelude(snapshot, history), query.date,
      snapshot.after ? Number(snapshot.after[0]) : null, snapshot.after?.[1] ?? null, query.limit + 1]);
    const raw = response.rows[0];
    if (!raw) return { ...base(history, "unavailable", "Derived market storage did not return a snapshot."), run: null, total: 0 };
    const page = finish(raw.items as Raw[], query.limit, (row): DerivedExportRow => {
      const kind = EXPORT_KINDS[row._kind as keyof typeof EXPORT_KINDS];
      if (kind === "reference") return { type: kind, ...toReference(row) };
      if (kind === "index") return { type: kind, ...toIndexPoint(row) };
      if (kind === "premium") return { type: kind, ...toPremium(row) };
      throw new TypeError("Derived export row has an unknown kind.");
    }, row => [String(row._kind), String(row._id)], binding, String(raw.ceiling), snapshot, history);
    const runRecord = raw.run ? toRun(raw.run as Raw) : null;
    return { ...page, run: runRecord, total: Number(raw.total), ...(runRecord ? {} : { reason: "No derivation run is recorded for this date." }) };
  } catch (error) {
    const failed = failure(error, history);
    return { ...failed, run: null, total: 0 };
  }
}

/** A bounded page is fully serialized before a response starts: no half-successful stream. */
export function serializeDerivedExport(page: DerivedExportPage, rights: string): string {
  const { items, ...manifest } = page;
  return [
    JSON.stringify({ type: "manifest", schema: DERIVED_MARKET_METHOD_VERSION, ...manifest, rights,
      pagination: "One bounded page. Follow nextCursor with the same date and limit until complete." }),
    ...items.map(item => JSON.stringify(item)),
    JSON.stringify({ type: "footer", count: page.count, total: page.total, complete: page.complete, nextCursor: page.nextCursor, pageComplete: true }),
  ].join("\n") + "\n";
}
