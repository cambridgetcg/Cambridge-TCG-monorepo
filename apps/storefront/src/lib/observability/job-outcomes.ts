/**
 * One ops_job_outcomes row (migration 0148) per run of a price job, written
 * by its cron route after the work: when it ran, the HTTP status it answered,
 * what happened in Cambridge's own words, and counts. It closes the gap
 * docs/plans/tcg-data-platform/paid-data-api.md §3 left: a derivation's
 * excluded sources and skips, and a refused day, were only ever in the cron's
 * response, and a 200 alone does not say whether a job ran.
 *
 * Outcomes: ran; already-derived; refused:<code>, the job declined by its own
 * rule (a lease held, a host backing off or suspended, a revoked release, an
 * out-of-order date, no permitted input); unavailable:<code>, something it
 * needed was not there (its storage, ECB, the source) or it threw. disabled
 * is in the table's vocabulary, but these four routes record no disabled
 * run: they promise to touch no database while their flag is off, and the
 * monitor reads the flags themselves.
 *
 * Counts are numbers and Cambridge's codes, hosts and dates, never a price, a
 * source's value, an upstream URL or message text; opsCounts drops anything
 * else before the database's own check (ops_counts_valid) sees it. A write
 * that fails never fails the job: before 0148 (42P01) it records nothing,
 * quietly, and any other failure is logged by error name only.
 */

import type { CardmarketCollection, CardmarketGameRun } from "@/lib/datafeed/cardmarket-collector";
import type { CardRushRunSummary } from "@/lib/datafeed/collectors/cardrush";
import type { TcgplayerRun, TcgplayerRunRefused } from "@/lib/datafeed/collectors/tcgplayer";
import type { CollectorLeaseRefusal } from "@/lib/datafeed/collector-lease";
import type { HostClosed } from "@/lib/datafeed/collector-hosts";
import type { MarketDerivationResult } from "@/lib/market-derived/derive";
import { pruneObservability } from "./retention";

/** sweep/held-keys is the maintenance cron's signed-act sweep
 *  (lib/agents/signed-act-sweep.ts), recorded only while signed acts are
 *  open; the monitor reads its latest row as the nonce table's last purge. */
export const OPS_JOBS = ["collect/cardmarket", "collect/cardrush", "collect/tcgplayer", "derive/market", "sweep/held-keys"] as const;
export type OpsJob = (typeof OPS_JOBS)[number];

type OpsScalar = number | boolean | string | null;
export type OpsCounts = Record<string, OpsScalar | Record<string, OpsScalar>>;
export interface JobOutcome { outcome: string; counts: OpsCounts }
export type JobOutcomeWrite = { recorded: true } | { recorded: false; skipped: "not-provisioned" | "failed" };

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] } | undefined>;

const CODE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,79}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
/** Codes that mean something the job needed was missing or failed, not a
 * rule it kept; every other code is a refusal. */
const UNAVAILABLE = new Set([
  "lease-not-provisioned", "not-provisioned", "fx-unavailable", "source-unavailable", "no-set-written",
  "budget-exhausted", "not-started", "failed", "incomplete", "unexpected",
]);

const code = (value: unknown) => (typeof value === "string" && CODE.test(value) ? value : "unexpected");
/** refused:<code> or unavailable:<code>, by what the code means. */
export function declined(reason: unknown): string {
  const slug = code(reason);
  return `${UNAVAILABLE.has(slug) ? "unavailable" : "refused"}:${slug}`;
}

function scalar(value: unknown): OpsScalar | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  if (typeof value === "string") return TOKEN.test(value) ? value : undefined;
  return undefined;
}

/** Counts as the table accepts them: an object of whole non-negative
 * numbers, booleans, nulls and short tokens, nested one level at most.
 * Anything else (text with spaces, decimals, arrays, deeper objects) is
 * dropped, not stored. */
export function opsCounts(input: Record<string, unknown>): OpsCounts {
  const out: OpsCounts = {};
  for (const [key, value] of Object.entries(input)) {
    if (!KEY.test(key) || value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const inner: Record<string, OpsScalar> = {};
      for (const [innerKey, innerValue] of Object.entries(value)) {
        const kept = KEY.test(innerKey) ? scalar(innerValue) : undefined;
        if (kept !== undefined) inner[innerKey] = kept;
      }
      out[key] = inner;
      continue;
    }
    const kept = scalar(value);
    if (kept !== undefined) out[key] = kept;
  }
  return out;
}

const sum = <T>(rows: readonly T[], pick: (row: T) => number | undefined) => rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
const hostClosed = (summary: { host?: string; notBefore?: string | null; suspendedAt?: string | null; suspendedReason?: string | null }) =>
  ({ host: summary.host, notBefore: summary.notBefore, suspendedAt: summary.suspendedAt, suspendedReason: summary.suspendedReason });

/** collect/cardmarket. null: the collection threw before it could report. */
export function cardmarketJobOutcome(summary: CardmarketCollection | CollectorLeaseRefusal | HostClosed | null): JobOutcome {
  if (!summary) return { outcome: "unavailable:collection-could-not-start", counts: {} };
  if (!summary.ran) return { outcome: declined(summary.reason), counts: opsCounts("host" in summary ? hostClosed(summary) : {}) };
  const games = summary.games ?? [];
  const ingested = games.filter((game): game is Extract<CardmarketGameRun, { sourceRows: number }> => "sourceRows" in game);
  const failed = games.find(game => game.status !== "completed" && game.status !== "completed-with-quarantine");
  const crosswalks = summary.setCrosswalks;
  return {
    outcome: summary.ok ? "ran" : declined(failed?.status ?? "incomplete"),
    counts: opsCounts({
      elapsedMs: summary.elapsedMs,
      games: Object.fromEntries(games.map(game => [String(game.gameId), game.status])),
      sourceRows: sum(ingested, game => game.sourceRows),
      observations: sum(ingested, game => game.observations),
      missingPriceFields: sum(ingested, game => game.missingPriceFields),
      quarantined: sum(ingested, game => game.quarantined),
      setCrosswalks: crosswalks ? { status: crosswalks.status, written: crosswalks.written, superseded: crosswalks.superseded, unchanged: crosswalks.unchanged, kept: crosswalks.kept } : undefined,
      hostStateRecorded: summary.hostState?.recorded,
    }),
  };
}

/** collect/cardrush. null: the collector threw. */
export function cardRushJobOutcome(summary: CardRushRunSummary | null): JobOutcome {
  if (!summary) return { outcome: "unavailable:collector-failed", counts: {} };
  const base = { host: summary.host, requested: summary.requested };
  if (!summary.ran) return { outcome: declined(summary.reason), counts: opsCounts({ ...hostClosed(summary), ...base }) };
  return {
    outcome: summary.unavailable ? `unavailable:${code(summary.unavailable.reason)}` : "ran",
    counts: opsCounts({
      ...base, observed: summary.observed, quarantined: summary.quarantined, sitemapProducts: summary.sitemapProducts, robotsDisallowed: summary.robotsDisallowed,
      inserted: summary.batch?.inserted, duplicateBatch: summary.batch?.duplicate,
      crosswalks: summary.crosswalks ? { ...summary.crosswalks } : undefined,
      listingImagesWritten: summary.listingImages?.written,
      hostStateRecorded: summary.hostState?.recorded,
    }),
  };
}

/** collect/tcgplayer. null: the collector threw. */
export function tcgplayerJobOutcome(run: TcgplayerRun | TcgplayerRunRefused | null): JobOutcome {
  if (!run) return { outcome: "unavailable:internal", counts: {} };
  if (!run.ran) return { outcome: declined(run.reason), counts: opsCounts("host" in run ? hostClosed(run) : {}) };
  const sets = run.sets ?? [];
  const outcome = run.status === "ok" ? "ran"
    : run.status === "source-unavailable" ? `unavailable:${code(run.unavailable?.reason ?? "source-unavailable")}`
      : declined(run.status);
  return {
    outcome,
    counts: opsCounts({
      stoppedBy: run.stoppedBy, elapsedMs: run.elapsedMs, requests: run.requests, intervalMs: run.intervalMs,
      setsListed: run.setsListed, setsWritten: sets.length, robotsDisallowed: run.robotsDisallowed, errors: run.errors?.length,
      sourceRows: sum(sets, set => set.sourceRows), observations: sum(sets, set => set.observations), inserted: sum(sets, set => set.inserted),
      mapped: sum(sets, set => set.mapped), quarantined: sum(sets, set => set.quarantined),
      crosswalks: run.crosswalks ? { ...run.crosswalks } : undefined,
      unavailableStatus: run.unavailable?.status ?? undefined,
      hostStateRecorded: run.hostState?.recorded,
    }),
  };
}

/** Only the skips that happened; every one is a count. */
const happened = (skipped: object | undefined) =>
  skipped ? Object.fromEntries(Object.entries(skipped).filter(([, count]) => typeof count === "number" && count > 0)) : undefined;

/** derive/market. null: the derivation threw (its transaction rolled back). */
export function derivationJobOutcome(result: MarketDerivationResult | null): JobOutcome {
  if (!result) return { outcome: "unavailable:error", counts: {} };
  const base = { asOf: result.asOf, methodVersion: result.methodVersion };
  if (result.ok && result.ran) {
    return {
      outcome: "ran",
      counts: opsCounts({
        ...base, runId: result.runId, inputBatchCeiling: result.inputBatchCeiling,
        sources: Object.fromEntries(Object.keys(result.inputEvidence ?? {}).map(source => [source, true])),
        excludedSources: { ...result.excludedSources },
        written: { ...result.written },
        skipped: happened(result.skipped),
        fxDates: Object.fromEntries(Object.entries(result.fx ?? {}).map(([currency, quote]) => [currency, quote?.as_of])),
      }),
    };
  }
  if (result.ok) return { outcome: "already-derived", counts: opsCounts({ ...base, runId: result.runId }) };
  return {
    outcome: declined(result.reason),
    counts: opsCounts({
      ...base, excludedSources: result.excludedSources ? { ...result.excludedSources } : undefined,
      skipped: happened(result.skipped),
    }),
  };
}

/** The storefront database, imported on first use: it needs DATABASE_URL,
 * which a route's own tests and a disabled run never reach for. */
async function storefrontQuery(): Promise<RunQuery> {
  return (await import("@/lib/db")).query as RunQuery;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : "UnknownError");
const undefinedTable = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";

/** Records one run's outcome, then deletes observability rows past their
 * retention (retention.ts). Never throws. */
export async function recordJobOutcome(
  entry: { job: OpsJob; startedAt: Date; finishedAt?: Date; httpStatus: number } & JobOutcome,
  runQuery?: RunQuery,
): Promise<JobOutcomeWrite> {
  const finishedAt = entry.finishedAt ?? new Date();
  const outcome = /^(ran|already-derived|disabled|(refused|unavailable):[a-z0-9][a-z0-9-]{0,63})$/.test(entry.outcome) ? entry.outcome : "unavailable:unexpected";
  let run: RunQuery;
  try {
    run = runQuery ?? await storefrontQuery();
    await run(
      `INSERT INTO ops_job_outcomes (job, started_at, finished_at, http_status, outcome, counts) VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6::jsonb)`,
      [entry.job, entry.startedAt.toISOString(), finishedAt.toISOString(), entry.httpStatus, outcome, JSON.stringify(opsCounts(entry.counts))],
    );
  } catch (error) {
    if (undefinedTable(error)) return { recorded: false, skipped: "not-provisioned" };
    console.error("[ops/job-outcomes] not recorded", entry.job, errorName(error));
    return { recorded: false, skipped: "failed" };
  }
  // The row stands whether or not the sweep runs; the monitor shows a table
  // that holds rows past its period.
  try { await pruneObservability(run); }
  catch (error) { console.error("[ops/job-outcomes] retention sweep failed", errorName(error)); }
  return { recorded: true };
}

/** A cron route's work, then its outcome row. `work` answers the request
 * as it always has and hands what the job reported to `observe` (nothing,
 * when the job threw before reporting). The row is written after the work
 * and before the response returns, so the platform does not freeze the
 * function first; it never changes the response. */
export async function recordedRun<T, R extends Response>(
  job: OpsJob,
  work: (observe: (report: T) => void) => Promise<R>,
  outcomeOf: (report: T | null) => JobOutcome,
  runQuery?: RunQuery,
): Promise<R> {
  const startedAt = new Date();
  let report = null as T | null;
  let response: R;
  try {
    response = await work(value => { report = value; });
  } catch (error) {
    await record(500, null);
    throw error;
  }
  await record(response.status, report);
  return response;

  async function record(httpStatus: number, value: T | null) {
    let outcome: JobOutcome;
    try { outcome = outcomeOf(value); }
    catch (error) {
      // A report this code cannot read is left unrecorded (unknown on the
      // monitor) rather than recorded as something it was not.
      console.error("[ops/job-outcomes] not recorded", job, errorName(error));
      return;
    }
    await recordJobOutcome({ job, startedAt, httpStatus, ...outcome }, runQuery);
  }
}
