/**
 * What /admin/system/monitor reads (docs/operations/monitoring.md). Each
 * reader returns its data, or "unknown" with the reason: a table that is not
 * provisioned, or a read that failed, is never shown as zero. Readers count;
 * none returns a price, a source's value, a key or agent id, a user agent or
 * a path. Server-side only, behind the admin gate; nothing here runs in a
 * visitor's browser.
 */

import "server-only";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import { FRESHNESS, type FreshnessKey } from "@cambridge-tcg/data-spec";
import { BATCH_COLLECTED_SOURCES, collectionOn, type CollectedSource } from "@/lib/datafeed/collection-flags";
import { dataApiCheckoutIntake, dataApiPlansPublished, dataApiReadsPublished, dataApiSaleStatus } from "@/lib/data-api/posture";
import { deriveHostHealth, readCollectorHostStates, type CollectorHostsHealth } from "@/app/api/v1/sources/collector-health";
import { mcpDailyOn } from "./mcp-daily";
import { OBSERVABILITY_TABLES, RETENTION_BY_TABLE, expiredRowsSql, retentionLabel, type ObservabilityTable } from "./retention";
import type { TrafficPullStatus } from "./vocabulary";

export type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type Known<T> = { state: "known"; data: T } | { state: "unknown"; reason: string };

const HOUR_MS = 3_600_000, DAY_MS = 24 * HOUR_MS;

const iso = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(value as string | Date).toISOString();
const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
/** jsonb arrives parsed from pg and postgres.js alike, or as text when cast. */
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value === "string") { try { return object(JSON.parse(value)); } catch { return {}; } }
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
};
const undefinedTable = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";

/** A read, or why it could not be made. */
async function known<T>(what: string, migration: string, read: () => Promise<T>): Promise<Known<T>> {
  try {
    return { state: "known", data: await read() };
  } catch (error) {
    return { state: "unknown", reason: undefinedTable(error) ? `${what} is not provisioned here (migration ${migration})` : `${what} could not be read` };
  }
}

/** UTC calendar days, newest first, ending today. */
export function utcDays(now: Date, count: number): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, index) => new Date(today - index * DAY_MS).toISOString().slice(0, 10));
}

// ── 1. Collectors ────────────────────────────────────────────────────────

export interface BatchGroup {
  source: string;
  /** CardRush's batches name the host they read (ingest key cardrush:<host>:<time>); the others' do not. */
  host: string | null;
  batches: number; sourceRows: number; missingPrices: number; quarantined: number;
  lastInsertedAt: string | null;
}
export interface LatestBatch { source: string; insertedAt: string | null; sourceRows: number; missingPrices: number; quarantined: number }
export interface CollectorBatches { window: BatchGroup[]; latest: LatestBatch[] }

/** member_price_batches over the last 7 days, per source and (for CardRush)
 * host, and each source's newest batch however old. Counts the batch's own
 * row and quarantine totals; observations are not counted (a daily file is
 * about 74,600 rows), and quarantine entries, which hold source text, are
 * counted, never read out. */
export function readCollectorBatches(run: RunQuery): Promise<Known<CollectorBatches>> {
  return known("member_price_batches", "0137", async () => {
    const [window, latest] = await Promise.all([
      run(`SELECT source, CASE WHEN source = 'cardrush' THEN split_part(ingest_key, ':', 2) END AS host,
          count(*)::int AS batches, COALESCE(sum(source_rows), 0)::bigint AS source_rows, COALESCE(sum(missing_prices), 0)::bigint AS missing_prices,
          COALESCE(sum(jsonb_array_length(quarantine)), 0)::bigint AS quarantined, max(inserted_at) AS last_inserted_at
        FROM member_price_batches WHERE inserted_at >= now() - interval '7 days' GROUP BY 1, 2 ORDER BY 1, 2`),
      run(`SELECT DISTINCT ON (source) source, inserted_at, source_rows, missing_prices, jsonb_array_length(quarantine) AS quarantined
        FROM member_price_batches ORDER BY source, id DESC`),
    ]);
    return {
      window: window.rows.map(row => ({
        source: text(row.source), host: row.host === null || row.host === undefined ? null : text(row.host),
        batches: num(row.batches), sourceRows: num(row.source_rows), missingPrices: num(row.missing_prices), quarantined: num(row.quarantined),
        lastInsertedAt: iso(row.last_inserted_at),
      })),
      latest: latest.rows.map(row => ({
        source: text(row.source), insertedAt: iso(row.inserted_at), sourceRows: num(row.source_rows), missingPrices: num(row.missing_prices), quarantined: num(row.quarantined),
      })),
    };
  });
}

export interface CollectorSourceState { source: CollectedSource; on: boolean; hosts: CollectorHostsHealth }

/** Each collector's flag in this deployment, and its hosts' standing
 * (price_collector_hosts, migration 0146), judged as /api/v1/sources judges
 * them. */
export async function readCollectorSources(run: RunQuery, now: Date): Promise<CollectorSourceState[]> {
  const hostStates = await readCollectorHostStates(run);
  const meta = new Map(listSourceMeta().map(source => [String(source.id), source]));
  return BATCH_COLLECTED_SOURCES.map(source => {
    const key = meta.get(source)?.freshness as FreshnessKey | undefined;
    const freshness = key && Object.hasOwn(FRESHNESS, key) ? FRESHNESS[key] : 0;
    return { source, on: collectionOn(source), hosts: deriveHostHealth(source, hostStates, freshness, now.getTime()) };
  });
}

export interface CollectorLease { leaseKey: string; spacing: boolean; held: boolean; acquiredAt: string | null; expiresAt: string | null }

/** price_collector_leases (0143): which runs hold a key now, or whose spacing
 * is still running out. The holder's own id is not read. */
export function readCollectorLeases(run: RunQuery): Promise<Known<CollectorLease[]>> {
  return known("price_collector_leases", "0143", async () => (await run(
    `SELECT lease_key, holder = 'request-spacing' AS spacing, expires_at > now() AS held, acquired_at, expires_at FROM price_collector_leases ORDER BY lease_key`,
  )).rows.map(row => ({ leaseKey: text(row.lease_key), spacing: row.spacing === true, held: row.held === true, acquiredAt: iso(row.acquired_at), expiresAt: iso(row.expires_at) })));
}

export interface JobOutcomeRow { job: string; startedAt: string | null; finishedAt: string | null; httpStatus: number; outcome: string; counts: Record<string, unknown> }
export interface JobOutcomeTally { job: string; outcome: string; runs: number; lastAt: string | null }
export interface JobOutcomes { latest: JobOutcomeRow[]; tally: JobOutcomeTally[] }

/** ops_job_outcomes (0148): each job's latest run, and its outcomes over the
 * last 7 days. */
export function readJobOutcomes(run: RunQuery): Promise<Known<JobOutcomes>> {
  return known("ops_job_outcomes", "0148", async () => {
    const [latest, tally] = await Promise.all([
      run(`SELECT DISTINCT ON (job) job, started_at, finished_at, http_status, outcome, counts FROM ops_job_outcomes ORDER BY job, started_at DESC, id DESC`),
      run(`SELECT job, outcome, count(*)::int AS runs, max(started_at) AS last_at FROM ops_job_outcomes
        WHERE started_at >= now() - interval '7 days' GROUP BY 1, 2 ORDER BY 1, 3 DESC, 2`),
    ]);
    return {
      latest: latest.rows.map(jobRow),
      tally: tally.rows.map(row => ({ job: text(row.job), outcome: text(row.outcome), runs: num(row.runs), lastAt: iso(row.last_at) })),
    };
  });
}

const jobRow = (row: Record<string, unknown>): JobOutcomeRow => ({
  job: text(row.job), startedAt: iso(row.started_at), finishedAt: iso(row.finished_at), httpStatus: num(row.http_status), outcome: text(row.outcome), counts: object(row.counts),
});

// ── 2. Derivation ────────────────────────────────────────────────────────

export interface DerivationRunRow {
  id: string; asOf: string; createdAt: string | null;
  /** The sources whose evidence the run recorded. */
  sources: string[];
  /** ECB quote date per currency, never the rate. */
  fxDates: Record<string, string>;
  written: { references: number; indices: number; premiums: number };
}
export interface DerivationDay {
  asOf: string;
  run: DerivationRunRow | null;
  /** Recorded outcomes for this date, newest first (ops_job_outcomes). */
  outcomes: JobOutcomeRow[];
  /** ran (a run row), the latest recorded outcome, or unknown. */
  state: string;
}
export interface DerivedCount { kind: "index" | "premium" | "reference"; game: string; market: string; detail: string; rows: number }
export interface Derivation { on: boolean; days: DerivationDay[]; latestRun: { id: string; asOf: string } | null; counts: DerivedCount[]; outcomesReason: string | null }

/** The last 14 UTC dates: each date's run (market_derivation_runs, 0141)
 * with the rows it wrote, and the outcomes recorded for it. A date with
 * neither is unknown: before 0148 a refused day left no trace. Then the
 * latest run's rows counted by game, market and confidence. Counts only. */
export async function readDerivation(run: RunQuery, now: Date): Promise<Known<Derivation>> {
  const days = utcDays(now, 14);
  const outcomes = await readDerivationOutcomes(run, days.at(-1)!);
  return known("market_derivation_runs", "0141", async () => {
    const runs = await run(`SELECT r.id::text AS id, r.as_of::text AS as_of, r.created_at,
        array_to_string(ARRAY(SELECT jsonb_object_keys(r.input_evidence) ORDER BY 1), ',') AS sources,
        (SELECT jsonb_object_agg(q.currency, q.quote->>'as_of') FROM jsonb_each(r.fx) AS q(currency, quote))::text AS fx_dates,
        (SELECT count(*)::int FROM market_reference_prices p WHERE p.run_id = r.id) AS "references",
        (SELECT count(*)::int FROM market_indices i WHERE i.run_id = r.id) AS indices,
        (SELECT count(*)::int FROM market_premiums m WHERE m.run_id = r.id) AS premiums
      FROM market_derivation_runs r WHERE r.as_of >= $1::date ORDER BY r.as_of DESC, r.id DESC`, [days.at(-1)]);
    const latest = await run(`SELECT id::text AS id, as_of::text AS as_of FROM market_derivation_runs ORDER BY as_of DESC, id DESC LIMIT 1`);
    const latestRun = latest.rows[0] ? { id: text(latest.rows[0].id), asOf: text(latest.rows[0].as_of) } : null;
    const counts = latestRun ? (await run(`SELECT 'index' AS kind, game, market, CASE WHEN set_code IS NULL THEN 'per game' ELSE 'per set' END AS detail, count(*)::int AS n
          FROM market_indices WHERE run_id = $1::bigint GROUP BY 2, 3, 4
        UNION ALL SELECT 'premium', game, market || ' / ' || base_market, 'per set', count(*)::int FROM market_premiums WHERE run_id = $1::bigint GROUP BY 2, 3
        UNION ALL SELECT 'reference', game, 'all sources', confidence, count(*)::int FROM market_reference_prices WHERE run_id = $1::bigint GROUP BY 2, 4
        ORDER BY 1, 2, 3, 4`, [latestRun.id])).rows.map(row => ({
      kind: text(row.kind) as DerivedCount["kind"], game: text(row.game), market: text(row.market), detail: text(row.detail), rows: num(row.n),
    })) : [];
    const runByDate = new Map<string, DerivationRunRow>();
    for (const row of runs.rows) {
      if (runByDate.has(text(row.as_of))) continue;
      runByDate.set(text(row.as_of), {
        id: text(row.id), asOf: text(row.as_of), createdAt: iso(row.created_at),
        sources: text(row.sources).split(",").filter(Boolean),
        fxDates: Object.fromEntries(Object.entries(object(row.fx_dates)).map(([currency, date]) => [currency, text(date)])),
        written: { references: num(row.references), indices: num(row.indices), premiums: num(row.premiums) },
      });
    }
    const outcomeRows = outcomes.state === "known" ? outcomes.data : [];
    return {
      on: process.env.DATA_DERIVE_MARKET === "on",
      latestRun,
      counts,
      outcomesReason: outcomes.state === "unknown" ? outcomes.reason : null,
      days: days.map(asOf => {
        const recorded = outcomeRows.filter(row => outcomeDate(row) === asOf);
        const derived = runByDate.get(asOf) ?? null;
        return { asOf, run: derived, outcomes: recorded, state: derived ? "ran" : recorded[0]?.outcome ?? "unknown" };
      }),
    };
  });
}

/** The date an outcome is for: the date it derived (counts.asOf), else the
 * UTC date it started (a run that threw reports no date). */
const outcomeDate = (row: JobOutcomeRow) => typeof row.counts.asOf === "string" ? row.counts.asOf : row.startedAt?.slice(0, 10) ?? "";

function readDerivationOutcomes(run: RunQuery, since: string): Promise<Known<JobOutcomeRow[]>> {
  return known("ops_job_outcomes", "0148", async () => (await run(
    `SELECT job, started_at, finished_at, http_status, outcome, counts FROM ops_job_outcomes
      WHERE job = 'derive/market' AND started_at >= $1::date ORDER BY started_at DESC, id DESC`, [since],
  )).rows.map(jobRow));
}

// ── 3. API ───────────────────────────────────────────────────────────────

export interface ApiPosture { readsPublished: boolean; plansPublished: boolean; checkoutIntake: string; saleStatus: string }
export function readApiPosture(): ApiPosture {
  return { readsPublished: dataApiReadsPublished(), plansPublished: dataApiPlansPublished(), checkoutIntake: dataApiCheckoutIntake(), saleStatus: dataApiSaleStatus() };
}

export interface UsageMonth { month: string; requests: number; accounts: number }

/** data_api_usage_months (0142), summed over accounts: requests and how many
 * accounts made any, per month, for 13 months. No account is named. */
export function readDataApiUsage(run: RunQuery): Promise<Known<UsageMonth[]>> {
  return known("data_api_usage_months", "0142", async () => (await run(
    `SELECT month::text AS month, sum(request_count)::bigint AS requests, count(*)::int AS accounts FROM data_api_usage_months
      WHERE month >= (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '12 months')::date GROUP BY 1 ORDER BY 1 DESC`,
  )).rows.map(row => ({ month: text(row.month), requests: num(row.requests), accounts: num(row.accounts) })));
}

/** The data-API's own routes, as traffic counts them. */
export const API_PATH_GROUPS = ["/api/v1/market/*", "/api/v1/member-prices", "/api/v1/plans", "/api/v1/account/*", "/api/data-api/*"] as const;

/** Below this many holders, a count of what keys or signed-in accounts did
 * (on a key-gated route, or by MCP tool) could describe one holder's use, so
 * the page withholds it. No count names a holder; with one or two holders it
 * would not need to. */
export const MIN_HOLDERS = 5;

/** The routes that serve only an admitted key or a signed-in account
 * (/api/v1/plans is public), and those whose holders the data API's monthly
 * counts cover: market reads and the key's own usage need a data-API key.
 * Nothing counts member-price holders past a day, or checkout accounts at
 * all, so their answers to a holder are never shown. */
const GATED_PATH_GROUPS: readonly string[] = ["/api/v1/market/*", "/api/v1/member-prices", "/api/v1/account/*", "/api/data-api/*"];
const HOLDERS_FROM_USAGE: readonly string[] = ["/api/v1/market/*", "/api/v1/account/*"];
/** Answers a request gets without an admitted key or account: none or a
 * wrong one (401), or the route not published (404). Nobody's use. */
const NO_HOLDER_STATUSES: readonly string[] = ["401", "404"];

export interface ApiRouteView { rows: RouteHits[]; withheld: string | null }

/** The route hits the page may show: every public route's, the gated
 * routes' 401s and 404s, and the gated routes' other answers only where at
 * least MIN_HOLDERS accounts used the data API in each month the 35 days
 * touch. */
export function apiRouteView(hits: readonly RouteHits[], usage: Known<UsageMonth[]>, now: Date): ApiRouteView {
  const months: string[] = [];
  for (let at = new Date(now.getTime() - 35 * DAY_MS); at <= now; at = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1))) {
    months.push(at.toISOString().slice(0, 7));
  }
  const accounts = (month: string) => (usage.state === "known" ? usage.data.find(row => row.month.startsWith(month))?.accounts ?? 0 : 0);
  const fewest = Math.min(...months.map(accounts));
  const shown = (row: RouteHits) => !GATED_PATH_GROUPS.includes(row.pathGroup) || NO_HOLDER_STATUSES.includes(row.statusClass)
    || (HOLDERS_FROM_USAGE.includes(row.pathGroup) && fewest >= MIN_HOLDERS);
  const rows = hits.filter(shown);
  if (rows.length === hits.length) return { rows, withheld: null };
  return {
    rows,
    withheld: `Other answers on key-gated routes are withheld, since they could describe one holder's use: in the quietest month these 35 days touch, ${usage.state === "known" ? `${fewest} account${fewest === 1 ? "" : "s"}` : "an unknown number of accounts"} used the data API (fewer than ${MIN_HOLDERS} hides them), and member-price and checkout holders are not counted at all. The monthly table above has the data API's totals.`,
  };
}

// ── 4. Agents ────────────────────────────────────────────────────────────

export interface McpTally { method: string; tool: string; authenticated: boolean; outcome: string; requests: number }
export interface McpDay { day: string; requests: number }
export interface McpCounts { on: boolean; tally: McpTally[]; days: McpDay[] }

/** mcp_daily (0148) over the last 30 days. */
export function readMcpDaily(run: RunQuery, now: Date): Promise<Known<McpCounts>> {
  const since = utcDays(now, 30).at(-1);
  return known("mcp_daily", "0148", async () => {
    const [tally, days] = await Promise.all([
      run(`SELECT method, tool, authenticated, outcome, sum(count)::bigint AS requests FROM mcp_daily WHERE day >= $1::date
        GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC, 1, 2, 3, 4`, [since]),
      run(`SELECT day::text AS day, sum(count)::bigint AS requests FROM mcp_daily WHERE day >= $1::date GROUP BY 1 ORDER BY 1 DESC`, [since]),
    ]);
    return {
      on: mcpDailyOn(),
      tally: tally.rows.map(row => ({ method: text(row.method), tool: text(row.tool), authenticated: row.authenticated === true, outcome: text(row.outcome), requests: num(row.requests) })),
      days: days.rows.map(row => ({ day: text(row.day), requests: num(row.requests) })),
    };
  });
}

export interface AgentKeyUse { keys: number; active: number; never: number; lastHour: number; lastDay: number; lastWeek: number; lastMonth: number; older: number }

export interface McpView { tally: McpTally[]; withheld: string | null }

/** The MCP counts the page may show: every unauthenticated row, and the
 * authenticated ones by tool only where at least MIN_HOLDERS active keys were
 * used in the 30 days (agent_keys.last_used_at, counted in bands). Below
 * that, a tool's count could describe one key's calls. */
export function mcpView(mcp: McpCounts, keys: Known<AgentKeyUse>): McpView {
  const used = keys.state === "known" ? keys.data.lastHour + keys.data.lastDay + keys.data.lastWeek + keys.data.lastMonth : null;
  if (used !== null && used >= MIN_HOLDERS) return { tally: mcp.tally, withheld: null };
  const tally = mcp.tally.filter(row => !row.authenticated);
  if (tally.length === mcp.tally.length) return { tally, withheld: null };
  return {
    tally,
    withheld: `Authenticated calls by method, tool and outcome are withheld: ${used === null ? "an unknown number of" : used} active key${used === 1 ? " was" : "s were"} used in 30 days, fewer than ${MIN_HOLDERS}, so they could describe one key's calls.`,
  };
}

/** agent_keys (0090): how many, and when the active ones were last used, in
 * bands. Counts only: no key, prefix, name or agent beside a time. */
export function readAgentKeys(run: RunQuery): Promise<Known<AgentKeyUse>> {
  return known("agent_keys", "0090", async () => {
    const row = (await run(`SELECT count(*)::int AS keys,
        count(*) FILTER (WHERE revoked_at IS NULL)::int AS active,
        count(*) FILTER (WHERE revoked_at IS NULL AND last_used_at IS NULL)::int AS never,
        count(*) FILTER (WHERE revoked_at IS NULL AND last_used_at >= now() - interval '1 hour')::int AS last_hour,
        count(*) FILTER (WHERE revoked_at IS NULL AND last_used_at < now() - interval '1 hour' AND last_used_at >= now() - interval '1 day')::int AS last_day,
        count(*) FILTER (WHERE revoked_at IS NULL AND last_used_at < now() - interval '1 day' AND last_used_at >= now() - interval '7 days')::int AS last_week,
        count(*) FILTER (WHERE revoked_at IS NULL AND last_used_at < now() - interval '7 days' AND last_used_at >= now() - interval '30 days')::int AS last_month,
        count(*) FILTER (WHERE revoked_at IS NULL AND last_used_at < now() - interval '30 days')::int AS older
      FROM agent_keys`)).rows[0] ?? {};
    return {
      keys: num(row.keys), active: num(row.active), never: num(row.never), lastHour: num(row.last_hour), lastDay: num(row.last_day),
      lastWeek: num(row.last_week), lastMonth: num(row.last_month), older: num(row.older),
    };
  });
}

export interface RateBucketDay { day: string; requests: number; keys: number; busiestMinute: number }

/** agent_rate_buckets (0090), which keeps 7 days: requests per UTC day, how
 * many keys made any, and the busiest single key-minute. */
export function readAgentRateBuckets(run: RunQuery): Promise<Known<RateBucketDay[]>> {
  return known("agent_rate_buckets", "0090", async () => (await run(
    `SELECT (bucket_minute AT TIME ZONE 'UTC')::date::text AS day, sum(request_count)::bigint AS requests, count(DISTINCT key_id)::int AS keys,
        max(request_count)::int AS busiest FROM agent_rate_buckets GROUP BY 1 ORDER BY 1 DESC`,
  )).rows.map(row => ({ day: text(row.day), requests: num(row.requests), keys: num(row.keys), busiestMinute: num(row.busiest) })));
}

// ── 5. Traffic ───────────────────────────────────────────────────────────

export type HourCoverage = TrafficPullStatus | "unknown";
export interface CoverageDay { day: string; hours: number; ok: number; partial: number; failed: number; skipped: number; unknown: number }
export interface TrafficCoverage { hours: number; ok: number; partial: number; failed: number; skipped: number; unknown: number; days: CoverageDay[]; lastPullAt: string | null }

/** Which of the last 35 days' whole hours a traffic pull counted
 * (traffic_pulls, 0148), in total and per UTC day. An hour no pull covered
 * is unknown, never zero; an hour a failed pull covered is failed, one a
 * start marked is skipped (it began before counting started), and one an ok
 * pull covered is ok, whatever else covered it. The current hour is not yet
 * pullable. */
export function readTrafficCoverage(run: RunQuery, now: Date): Promise<Known<TrafficCoverage>> {
  return known("traffic_pulls", "0148", async () => {
    const result = await run(`SELECT window_start, window_end, status, pulled_at FROM traffic_pulls WHERE window_end > now() - interval '35 days' ORDER BY window_start`);
    return coverage(result.rows.map(row => ({ start: iso(row.window_start)!, end: iso(row.window_end)!, status: text(row.status) as TrafficPullStatus, pulledAt: iso(row.pulled_at) })), now);
  });
}

const RANK: Record<HourCoverage, number> = { unknown: 0, failed: 1, skipped: 2, partial: 3, ok: 4 };
export function coverage(pulls: readonly { start: string; end: string; status: TrafficPullStatus; pulledAt?: string | null }[], now: Date): TrafficCoverage {
  const last = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS; // the current hour starts here, not counted yet
  const first = last - 35 * DAY_MS;
  const hours = new Map<number, HourCoverage>();
  for (let at = first; at < last; at += HOUR_MS) hours.set(at, "unknown");
  for (const pull of pulls) {
    for (let at = Date.parse(pull.start); at < Date.parse(pull.end); at += HOUR_MS) {
      const current = hours.get(at);
      if (current !== undefined && RANK[pull.status] > RANK[current]) hours.set(at, pull.status);
    }
  }
  const days = new Map<string, CoverageDay>();
  const totals = { ok: 0, partial: 0, failed: 0, skipped: 0, unknown: 0 };
  for (const [at, state] of hours) {
    const day = new Date(at).toISOString().slice(0, 10);
    const entry = days.get(day) ?? { day, hours: 0, ok: 0, partial: 0, failed: 0, skipped: 0, unknown: 0 };
    entry.hours += 1; entry[state] += 1; totals[state] += 1;
    days.set(day, entry);
  }
  const pulledAt = pulls.map(pull => pull.pulledAt).filter((value): value is string => typeof value === "string").sort().at(-1) ?? null;
  return { hours: hours.size, ...totals, days: [...days.values()].sort((a, b) => b.day.localeCompare(a.day)), lastPullAt: pulledAt };
}

export interface TrafficDay { day: string; requests: number; rsc: number; direct: number; statuses: Record<string, number> }
export interface ClassDay { day: string; actorClass: string; requests: number }
export interface ClassGroup { actorClass: string; pathGroup: string; requests: number; rsc: number }
export interface NotFoundSpot { pathGroup: string; notFound: number; requests: number }
export interface Traffic { days: TrafficDay[]; classDays: ClassDay[]; classGroups: ClassGroup[]; notFound: NotFoundSpot[] }

/** traffic_hourly (0148) over the last 7 UTC days: totals, RSC page-data
 * share, requests that reached Vercel directly (the *.vercel.app hosts,
 * which skip Cloudflare), status mix, actor class by day, class by route
 * group, and the groups answering 404 most. Only what reached Vercel. */
export function readTraffic(run: RunQuery, now: Date): Promise<Known<Traffic>> {
  const since = utcDays(now, 7).at(-1);
  return known("traffic_hourly", "0148", async () => {
    const window = `hour >= $1::date::timestamp AT TIME ZONE 'UTC'`;
    const [days, statuses, classDays, classGroups, notFound] = await Promise.all([
      run(`SELECT (hour AT TIME ZONE 'UTC')::date::text AS day, sum(count)::bigint AS requests, (sum(count) FILTER (WHERE rsc))::bigint AS rsc,
          (sum(count) FILTER (WHERE host_class IN ('prod-alias', 'deploy-url')))::bigint AS direct
        FROM traffic_hourly WHERE ${window} GROUP BY 1 ORDER BY 1 DESC`, [since]),
      run(`SELECT (hour AT TIME ZONE 'UTC')::date::text AS day, status_class, sum(count)::bigint AS requests FROM traffic_hourly WHERE ${window} GROUP BY 1, 2`, [since]),
      run(`SELECT (hour AT TIME ZONE 'UTC')::date::text AS day, actor_class, sum(count)::bigint AS requests FROM traffic_hourly WHERE ${window} GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC`, [since]),
      run(`SELECT actor_class, path_group, sum(count)::bigint AS requests, (sum(count) FILTER (WHERE rsc))::bigint AS rsc FROM traffic_hourly WHERE ${window}
        GROUP BY 1, 2 ORDER BY 3 DESC, 1, 2 LIMIT 40`, [since]),
      run(`SELECT path_group, (sum(count) FILTER (WHERE status_class = '404'))::bigint AS not_found, sum(count)::bigint AS requests FROM traffic_hourly WHERE ${window}
        GROUP BY 1 HAVING sum(count) FILTER (WHERE status_class = '404') > 0 ORDER BY 2 DESC, 1 LIMIT 15`, [since]),
    ]);
    const statusByDay = new Map<string, Record<string, number>>();
    for (const row of statuses.rows) {
      const entry = statusByDay.get(text(row.day)) ?? {};
      entry[text(row.status_class)] = num(row.requests);
      statusByDay.set(text(row.day), entry);
    }
    return {
      days: days.rows.map(row => ({ day: text(row.day), requests: num(row.requests), rsc: num(row.rsc), direct: num(row.direct), statuses: statusByDay.get(text(row.day)) ?? {} })),
      classDays: classDays.rows.map(row => ({ day: text(row.day), actorClass: text(row.actor_class), requests: num(row.requests) })),
      classGroups: classGroups.rows.map(row => ({ actorClass: text(row.actor_class), pathGroup: text(row.path_group), requests: num(row.requests), rsc: num(row.rsc) })),
      notFound: notFound.rows.map(row => ({ pathGroup: text(row.path_group), notFound: num(row.not_found), requests: num(row.requests) })),
    };
  });
}

export interface RouteHits { pathGroup: string; statusClass: string; requests: number }

/** The data-API's routes in traffic_hourly, totalled over the last 35 days
 * by route and status: no day or hour, which with few holders would be one
 * holder's pattern of use (see apiRouteView for what the page shows). */
export function readApiRouteHits(run: RunQuery): Promise<Known<RouteHits[]>> {
  const groups = API_PATH_GROUPS.map(group => `'${group.replaceAll("'", "''")}'`).join(", ");
  return known("traffic_hourly", "0148", async () => (await run(
    `SELECT path_group, status_class, sum(count)::bigint AS requests FROM traffic_hourly
      WHERE path_group IN (${groups}) AND hour >= now() - interval '35 days' GROUP BY 1, 2 ORDER BY 1, 2`,
  )).rows.map(row => ({ pathGroup: text(row.path_group), statusClass: text(row.status_class), requests: num(row.requests) })));
}

// ── 6. Errors ────────────────────────────────────────────────────────────

export interface ErrorCount { day: string; tag: string; status: number; count: number }

/** error_daily (0148) over the last 30 days. */
export function readErrors(run: RunQuery, now: Date): Promise<Known<ErrorCount[]>> {
  const since = utcDays(now, 30).at(-1);
  return known("error_daily", "0148", async () => (await run(
    `SELECT day::text AS day, tag, status, count FROM error_daily WHERE day >= $1::date ORDER BY day DESC, count DESC, tag, status`, [since],
  )).rows.map(row => ({ day: text(row.day), tag: text(row.tag), status: num(row.status), count: num(row.count) })));
}

// ── Retention ────────────────────────────────────────────────────────────

export interface RetentionState { table: ObservabilityTable; keeps: string; rows: number; oldest: string | null; expired: number }

/** Each observability table's rows, its oldest, and how many are past the
 * period it keeps: a number above zero means the sweep has not run. */
export function readRetention(run: RunQuery): Promise<Known<RetentionState[]>> {
  return known("the observability tables", "0148", async () => Promise.all(OBSERVABILITY_TABLES.map(async table => {
    const column = RETENTION_BY_TABLE[table].column;
    const row = (await run(`SELECT count(*)::bigint AS rows, min(${column})::text AS oldest, (count(*) FILTER (WHERE ${expiredRowsSql(table)}))::bigint AS expired FROM ${table}`)).rows[0] ?? {};
    return { table, keeps: retentionLabel(table), rows: num(row.rows), oldest: row.oldest ? text(row.oldest) : null, expired: num(row.expired) };
  })));
}

// ── The page ─────────────────────────────────────────────────────────────

export interface MonitorData {
  readAt: string;
  collectors: { sources: CollectorSourceState[]; batches: Known<CollectorBatches>; leases: Known<CollectorLease[]>; jobs: Known<JobOutcomes> };
  derivation: Known<Derivation>;
  api: { posture: ApiPosture; usage: Known<UsageMonth[]>; routes: Known<RouteHits[]> };
  agents: { mcp: Known<McpCounts>; keys: Known<AgentKeyUse>; buckets: Known<RateBucketDay[]> };
  traffic: { coverage: Known<TrafficCoverage>; counts: Known<Traffic> };
  errors: Known<ErrorCount[]>;
  retention: Known<RetentionState[]>;
}

export async function loadMonitor(run: RunQuery, now: Date = new Date()): Promise<MonitorData> {
  const [sources, batches, leases, jobs, derivation, usage, routes, mcp, keys, buckets, trafficCoverage, counts, errors, retention] = await Promise.all([
    readCollectorSources(run, now), readCollectorBatches(run), readCollectorLeases(run), readJobOutcomes(run),
    readDerivation(run, now), readDataApiUsage(run), readApiRouteHits(run),
    readMcpDaily(run, now), readAgentKeys(run), readAgentRateBuckets(run),
    readTrafficCoverage(run, now), readTraffic(run, now), readErrors(run, now), readRetention(run),
  ]);
  return {
    readAt: now.toISOString(),
    collectors: { sources, batches, leases, jobs },
    derivation,
    api: { posture: readApiPosture(), usage, routes },
    agents: { mcp, keys, buckets },
    traffic: { coverage: trafficCoverage, counts },
    errors,
    retention,
  };
}
