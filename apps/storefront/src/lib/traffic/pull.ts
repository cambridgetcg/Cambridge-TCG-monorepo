/**
 * The hourly traffic pull (/api/cron/traffic-pull; Yu chose "Vercel logs
 * hourly" on 2026-11-05). Each run reads the storefront's Vercel request
 * logs for whole UTC hours, classifies every record in memory
 * (classify.ts, ctcg.actor-class/v1), and keeps only counts:
 * traffic_hourly by host class, route group, RSC, declared class, status,
 * cache result and firewall action, and error_daily by runtime-log tag and
 * the request's status. traffic_pulls records what each run covered, so an
 * hour no pull counted reads as unknown, never zero (migration 0148).
 *
 * Nothing else is kept. No IP address is asked for; the user agent, path,
 * country, request id and log text of each record are read in memory and
 * dropped with the hour. A request id is held for the hour only to count a
 * record once (paging can repeat one at a page boundary) and to find the
 * status of the request a log line came from. No request is joined to
 * another.
 *
 * Which hours: the previous complete hour, and any earlier one within
 * Vercel's log window (about 24 hours on the current plan) that no pull has
 * counted yet, so a missed hour is rescued before it expires. An hour on its
 * last chance goes first, then the others oldest first, and an hour that
 * already ran out of time budget goes last, so one heavy hour cannot hold up
 * the hours after it. The run stops starting hours when its budget runs low;
 * the rest wait for the next run.
 *
 * Never an hour from before counting started. A run with no pull before it,
 * or more than RESTART_GAP_MS after the last one (the switch was off, or the
 * runs stopped), is a start: it counts nothing and writes one skipped row
 * (before-start) for the hour in progress, and later runs count only hours
 * that begin after it. So turning the flag on, or back on, does not reach
 * back to hours when it was off, or to before the /privacy note that names
 * these counts. A pause shorter than the gap is filled in, as a missed run
 * would be.
 *
 * Each counted hour is written once, in one transaction that starts with
 * its traffic_pulls row: 0148's exclusion constraint refuses a second
 * counted pull of the same hour, so a repeated run or two overlapping runs
 * cannot count an hour twice. An hour whose request read stops short is
 * recorded failed and counted nothing, and the next run tries it again;
 * only on its last chance (the next run would find it outside Vercel's
 * window) is what was read kept, as partial. When the requests are whole
 * but the error lines are not, the traffic is kept and the hour is partial
 * (errors-<code>), since the counts it holds are right. An hour with no
 * request record at all is never a counted zero (no-records). Then every
 * observability table is swept past its retention (retention.ts: hourly 35
 * days, daily 13 months).
 *
 * Off unless TRAFFIC_PULL is exactly "on", and that waits for the /privacy
 * note that names these counts. Off, the route touches neither Vercel nor
 * the database.
 */

import { pruneObservability } from "@/lib/observability/retention";
import { HourTally, errorTag } from "./classify";
import { readLogWindow, type ReadFailure } from "./vercel-logs";

export const TRAFFIC_PULL_FLAG = "TRAFFIC_PULL";

export function trafficPullOn(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[TRAFFIC_PULL_FLAG] === "on";
}

/** The run stops starting work after this; the route's maxDuration (300 s)
 * leaves room for the last writes and the retention sweep. */
export const TRAFFIC_PULL_BUDGET_MS = 240_000;
const HOUR_MS = 3_600_000;
/** How far back Vercel serves request and runtime logs on the current plan
 * (the 2026-11-05 study: 402 and 400 beyond about a day). */
export const LOG_WINDOW_MS = 24 * HOUR_MS;
/** An hour is not started this close to falling out of the window. */
const WINDOW_MARGIN_MS = 15 * 60_000;
/** Time left below which no new hour is started. */
const MIN_HOUR_MS = 30_000;
/** Failures that may pass by the next run: an hour that hit one is tried
 * again rather than kept short. */
const TRANSIENT = /^(budget-exhausted|rate-limited|timeout|network|http-5\d\d)$/;
/** A run this long after the last pull row starts afresh. Runs come hourly,
 * and the run after a start may find nothing to count, so two hours apart
 * is ordinary; two missed runs in a row, or the switch off for longer, are
 * not. */
export const RESTART_GAP_MS = 150 * 60_000;

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] } | undefined>;
type RunTransaction = <T>(work: (tx: RunQuery) => Promise<T>) => Promise<T>;

export interface PullDeps {
  query?: RunQuery;
  transaction?: RunTransaction;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Defaults to VERCEL_TOKEN, trimmed. */
  token?: string;
  budgetMs?: number;
}

export interface HourReport {
  hour: string;
  status: "ok" | "partial" | "failed" | "already-counted";
  /** Request records counted (or read, for a failed hour). */
  records: number;
  pages: number;
  code: string | null;
  /** traffic_hourly rows and error lines written. */
  rows: number;
  errors: number;
}

export type TrafficPullReport =
  | { ran: false; reason: "token-missing" | "not-provisioned" | "store-unavailable" }
  | {
    ran: true;
    /** This run started counting (no pull before it, or none within
     * RESTART_GAP_MS): it counted nothing and marked the hour in progress
     * skipped. */
    started: boolean;
    hours: HourReport[];
    /** Hours left uncounted for a later run (the budget ran low, or Vercel stopped answering). */
    pending: number;
    stoppedBy: string | null;
    /** Rows the retention sweep deleted, or null when it failed. */
    pruned: Record<string, number> | null;
  };

/** The whole hours a run may pull at `now`, oldest first: the previous hour
 * and each earlier one Vercel still keeps (with a margin). */
export function pullableHours(now: number): number[] {
  const current = Math.floor(now / HOUR_MS) * HOUR_MS;
  const hours: number[] = [];
  for (let at = current - HOUR_MS; at >= now - LOG_WINDOW_MS + WINDOW_MARGIN_MS; at -= HOUR_MS) hours.push(at);
  return hours.reverse();
}

/** The next run (an hour later) would no longer reach this hour. */
export const lastChance = (hour: number, now: number) => hour < now + HOUR_MS - LOG_WINDOW_MS + WINDOW_MARGIN_MS;

/** Every pull row in the window, when the last pull of any kind ran, and
 * where the latest start (skipped, before-start) ends (at least one row, so
 * a store with no pull says so). */
export const PULL_STATE_SQL = `SELECT s.last_pulled_at, s.counting_from, p.window_start, p.window_end, p.status, p.error_code
  FROM (SELECT max(pulled_at) AS last_pulled_at, max(window_end) FILTER (WHERE status = 'skipped') AS counting_from FROM traffic_pulls) AS s
  LEFT JOIN traffic_pulls AS p ON p.window_end > $1::timestamptz AND p.window_start < $2::timestamptz`;
export const PULL_ROW_SQL = `INSERT INTO traffic_pulls (window_start, window_end, status, records, pages, error_code)
  VALUES ($1::timestamptz, $2::timestamptz, $3, $4, $5, $6)`;
/** Rows an uncounted hour may still hold (an operator deleted its pull row
 * to count it again): the new count replaces them. */
export const CLEAR_HOUR_SQL = `DELETE FROM traffic_hourly WHERE hour = $1::timestamptz`;
export const HOURLY_SQL = `INSERT INTO traffic_hourly (hour, host_class, path_group, rsc, actor_class, classifier_version, status_class, cache_result, waf_action, count)
  SELECT $1::timestamptz, r.host_class, r.path_group, r.rsc, r.actor_class, r.classifier_version, r.status_class, r.cache_result, r.waf_action, r.count
  FROM jsonb_to_recordset($2::jsonb) AS r(host_class text, path_group text, rsc boolean, actor_class text, classifier_version text, status_class text, cache_result text, waf_action text, count integer)
  ON CONFLICT (hour, host_class, path_group, rsc, actor_class, classifier_version, status_class, cache_result, waf_action) DO UPDATE SET count = EXCLUDED.count`;
/** Error lines add to their UTC day; the hour's pull row, in the same
 * transaction, is what keeps an hour from being added twice. */
export const ERRORS_SQL = `INSERT INTO error_daily (day, tag, status, count)
  SELECT $1::date, r.tag, r.status, r.count FROM jsonb_to_recordset($2::jsonb) AS r(tag text, status smallint, count integer)
  ON CONFLICT (day, tag, status) DO UPDATE SET count = error_daily.count + EXCLUDED.count`;

const code = (error: unknown) => (typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined);
const iso = (at: number) => new Date(at).toISOString();
const inWindow = (event: Record<string, unknown>, start: number, end: number) => {
  const at = typeof event.timestamp === "string" || typeof event.timestamp === "number" ? new Date(event.timestamp).getTime() : NaN;
  return Number.isNaN(at) || (at >= start && at < end);
};

/** One run. Never throws for Vercel's sake; a database failure while writing
 * an hour ends the run (the route answers 500). */
export async function runTrafficPull(deps: PullDeps = {}): Promise<TrafficPullReport> {
  const token = deps.token ?? process.env.VERCEL_TOKEN?.trim();
  if (!token) return { ran: false, reason: "token-missing" };
  const now = deps.now ?? Date.now;
  const db = deps.query && deps.transaction ? null : await import("@/lib/db");
  const query = deps.query ?? (db!.query as RunQuery);
  const transaction = deps.transaction ?? (db!.transaction as unknown as RunTransaction);
  const startedAt = now();
  const deadline = startedAt + (deps.budgetMs ?? TRAFFIC_PULL_BUDGET_MS);

  const candidates = pullableHours(startedAt);
  let state: { rows: Record<string, unknown>[] } | undefined;
  try {
    state = await query(PULL_STATE_SQL, [iso(candidates[0]!), iso(candidates.at(-1)! + HOUR_MS)]);
  } catch (error) {
    return { ran: false, reason: code(error) === "42P01" ? "not-provisioned" : "store-unavailable" };
  }
  const time = (value: unknown) => (value == null ? null : new Date(value as string | Date).getTime());
  const lastPulledAt = time(state?.rows[0]?.last_pulled_at);

  if (lastPulledAt === null || startedAt - lastPulledAt > RESTART_GAP_MS) {
    await markStart(Math.floor(startedAt / HOUR_MS) * HOUR_MS, query);
    return { ran: true, started: true, hours: [], pending: 0, stoppedBy: null, pruned: await prune(query) };
  }

  const rows = (state?.rows ?? []).filter(row => row.window_start != null && row.window_end != null)
    .map(row => ({ start: time(row.window_start)!, end: time(row.window_end)!, status: String(row.status), code: row.error_code == null ? null : String(row.error_code) }));
  const covering = (hour: number) => rows.filter(row => row.start <= hour && row.end >= hour + HOUR_MS);
  const covered = (hour: number) => covering(hour).some(row => row.status !== "failed");
  const outOfBudget = (hour: number) => covering(hour).some(row => row.code !== null && /^(errors-)?budget-exhausted$/.test(row.code));
  const floor = time(state?.rows[0]?.counting_from) ?? -Infinity;
  const order = (hour: number) => (lastChance(hour, startedAt) ? 0 : outOfBudget(hour) ? 2 : 1);
  const todo = candidates.filter(hour => hour >= floor && !covered(hour)).sort((a, b) => order(a) - order(b) || a - b);

  const hours: HourReport[] = [];
  let stoppedBy: string | null = null;
  for (const hour of todo) {
    if (deadline - now() < MIN_HOUR_MS) { stoppedBy = "budget-exhausted"; break; }
    const pulled = await pullHour(hour, { token, deadline, now, fetch: deps.fetch, sleep: deps.sleep });
    hours.push(await writeHour(pulled, { query, transaction }));
    if (pulled.stop) { stoppedBy = pulled.stop.code; break; }
  }

  return { ran: true, started: false, hours, pending: todo.length - hours.length, stoppedBy, pruned: await prune(query) };
}

/** The skipped row a start writes for the hour in progress. Another run's
 * row for the same hour (0148's exclusion constraint) does as well. */
async function markStart(hour: number, query: RunQuery): Promise<void> {
  try {
    await query(PULL_ROW_SQL, [iso(hour), iso(hour + HOUR_MS), "skipped", 0, 0, "before-start"]);
  } catch (error) {
    if (code(error) !== "23P01") throw error;
  }
}

async function prune(query: RunQuery): Promise<Record<string, number> | null> {
  try { return await pruneObservability(query); }
  catch (error) {
    console.error("[cron/traffic-pull] retention sweep failed", error instanceof Error ? error.name : "UnknownError");
    return null;
  }
}

interface PulledHour {
  hour: number;
  status: "ok" | "partial" | "failed";
  code: string | null;
  records: number;
  pages: number;
  rows: ReturnType<HourTally["rows"]>;
  errors: { tag: string; status: number; count: number }[];
  /** Set when the run should stop after this hour. */
  stop: ReadFailure | null;
}

/** Reads and counts one hour. The records go no further than this function. */
async function pullHour(hour: number, context: { token: string; deadline: number; now: () => number; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }): Promise<PulledHour> {
  const start = hour, end = hour + HOUR_MS;
  const window = { start: new Date(start), end: new Date(end), token: context.token, deadline: context.deadline, now: context.now, fetch: context.fetch, sleep: context.sleep };
  const tally = new HourTally();
  // requestId → the request's status, for this hour only.
  const statuses = new Map<string, number>();
  const requests = await readLogWindow({
    ...window, source: "requests",
    onEvents: events => {
      for (const event of events) {
        if (!inWindow(event, start, end)) continue;
        const id = typeof event.requestId === "string" && event.requestId ? event.requestId : null;
        if (id) {
          if (statuses.has(id)) continue;
          statuses.set(id, typeof event.httpStatus === "number" ? event.httpStatus : 0);
        }
        tally.add(event);
      }
    },
  });
  const base = { hour, records: tally.records, rows: [] as PulledHour["rows"], errors: [] as PulledHour["errors"] };
  // Vercel's own cron calls the storefront every minute, so a whole hour
  // with no record means the read went wrong (or the logs had not arrived),
  // not that nobody came: never recorded as a counted zero.
  if (requests.complete && tally.records === 0) {
    return { ...base, status: lastChance(hour, context.now()) ? "partial" : "failed", code: "no-records", pages: requests.pages, stop: null };
  }
  if (!requests.complete) {
    const failure = requests.failure!;
    const keep = lastChance(hour, context.now()) && tally.records > 0;
    return { ...base, status: keep ? "partial" : "failed", code: failure.code, pages: requests.pages, rows: keep ? tally.rows() : [], stop: failure.stopsRun ? failure : null };
  }

  const errors = new Map<string, { tag: string; status: number; count: number }>();
  const runtime = await readLogWindow({
    ...window, source: "runtime",
    onEvents: events => {
      for (const event of events) {
        if (!inWindow(event, start, end) || (event.level !== "error" && event.level !== "fatal")) continue;
        const tag = errorTag(event.message);
        const status = (typeof event.requestId === "string" && statuses.get(event.requestId)) || 0;
        const entry = errors.get(`${tag}\t${status}`) ?? { tag, status, count: 0 };
        entry.count += 1;
        errors.set(`${tag}\t${status}`, entry);
      }
    },
  });
  const pages = requests.pages + runtime.pages;
  const gap = [...requests.excluded, ...runtime.excluded].some(interval => Date.parse(interval.start) < end && Date.parse(interval.end) > start);
  if (!runtime.complete) {
    const failure = runtime.failure!;
    // A passing failure is tried again with the hour; a lasting one would
    // fail every try, so the whole traffic count is kept and the hour is
    // marked partial for its errors.
    const stop = failure.stopsRun ? failure : null;
    if (TRANSIENT.test(failure.code) && !lastChance(hour, context.now())) return { ...base, status: "failed", code: `errors-${failure.code}`, pages, stop };
    return { ...base, status: "partial", code: `errors-${failure.code}`, pages, rows: tally.rows(), errors: [...errors.values()], stop };
  }
  return { ...base, status: gap ? "partial" : "ok", code: gap ? "stream-gap" : null, pages, rows: tally.rows(), errors: [...errors.values()], stop: null };
}

/** Writes one pulled hour. A counted hour goes in one transaction, its
 * traffic_pulls row first; a failed one is a traffic_pulls row alone. */
async function writeHour(pulled: PulledHour, db: { query: RunQuery; transaction: RunTransaction }): Promise<HourReport> {
  const start = iso(pulled.hour), end = iso(pulled.hour + HOUR_MS);
  const report: HourReport = { hour: start, status: pulled.status, records: pulled.records, pages: pulled.pages, code: pulled.code, rows: 0, errors: 0 };
  if (pulled.status === "failed") {
    await db.query(PULL_ROW_SQL, [start, end, "failed", pulled.records, pulled.pages, pulled.code]);
    return report;
  }
  try {
    await db.transaction(async tx => {
      await tx(PULL_ROW_SQL, [start, end, pulled.status, pulled.records, pulled.pages, pulled.code]);
      await tx(CLEAR_HOUR_SQL, [start]);
      if (pulled.rows.length) await tx(HOURLY_SQL, [start, JSON.stringify(pulled.rows)]);
      if (pulled.errors.length) await tx(ERRORS_SQL, [start.slice(0, 10), JSON.stringify(pulled.errors)]);
    });
  } catch (error) {
    // Another run counted this hour first (0148's exclusion constraint).
    if (code(error) === "23P01") return { ...report, status: "already-counted" };
    throw error;
  }
  return { ...report, rows: pulled.rows.length, errors: pulled.errors.reduce((total, entry) => total + entry.count, 0) };
}
