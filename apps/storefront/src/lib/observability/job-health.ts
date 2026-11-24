/**
 * Whether each scheduled job ran when it should have, from the records the
 * jobs leave: ops_job_outcomes (0148), and traffic_pulls for the traffic
 * pull. One list of what is scheduled, one query. /api/v1/health publishes
 * the answer, and the guest walk and the daily check read it there.
 *
 * ok       did its work within its time
 * failing  ran within its time, but not once did its work
 * late     left no record within its time
 * off      its switch is off in this deployment
 */

import { collectionOn } from "@/lib/datafeed/collection-flags";
import { trafficPullOn } from "@/lib/traffic/pull";

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** Every cron in vercel.json but the daily check itself (DAILY_CHECK).
 * `hours`: how long a job may go without doing its work, its schedule with
 * room for a run or two that Vercel drops. A daily job has an hour's room, so
 * the check at 08:40 sees that morning's miss. */
export const SCHEDULED_JOBS: readonly { job: string; path: string; hours: number; on?: () => boolean }[] = [
  { job: "collect/cardmarket", path: "/api/cron/collect/cardmarket", hours: 25, on: () => collectionOn("cardmarket") },
  // One host a run; a suspended host's turns pass without one.
  { job: "collect/cardrush", path: "/api/cron/collect/cardrush", hours: 8, on: () => collectionOn("cardrush") },
  // Hourly, and left alone for six hours after one refusal.
  { job: "collect/tcgplayer", path: "/api/cron/collect/tcgplayer", hours: 8, on: () => collectionOn("tcgplayer") },
  { job: "derive/market", path: "/api/cron/derive/market", hours: 25, on: () => process.env.DATA_DERIVE_MARKET === "on" },
  { job: "pull/traffic", path: "/api/cron/traffic-pull", hours: 4, on: () => trafficPullOn() },
  { job: "reconcile/stripe", path: "/api/cron/reconcile-stripe", hours: 4 },
  { job: "retention/prism-beta", path: "/api/cron/prism-signals-beta-retention", hours: 25 },
  { job: "sweep/maintenance", path: "/api/cron/maintenance", hours: 3 },
];
export const DAILY_CHECK = { job: "check/daily", path: "/api/cron/daily-check" } as const;

export interface JobHealth { job: string; state: "ok" | "failing" | "late" | "off"; last_ran_at: string | null; last_seen_at: string | null }
export interface Health {
  /** The database's own clock: an answer it could only give now. */
  clock: string;
  jobs: JobHealth[];
  daily_check: { at: string; outcome: string } | null;
}

export const HEALTH_SQL = `SELECT now() AS clock, seen.*
  FROM (SELECT 1) AS one LEFT JOIN (
    SELECT job, max(started_at) AS last_seen, max(started_at) FILTER (WHERE outcome IN ('ran', 'already-derived')) AS last_ran,
           (array_agg(outcome ORDER BY started_at DESC, id DESC))[1] AS last_outcome
      FROM ops_job_outcomes WHERE started_at > now() - interval '3 days' GROUP BY job
    UNION ALL
    SELECT 'pull/traffic', max(pulled_at), max(pulled_at) FILTER (WHERE status <> 'failed'), NULL
      FROM traffic_pulls WHERE pulled_at > now() - interval '3 days'
  ) AS seen ON true`;

const time = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const at = new Date(value as string | Date).getTime();
  return Number.isFinite(at) ? at : null;
};
const iso = (at: number | null) => (at === null ? null : new Date(at).toISOString());

/** Settles in time, or rejects: a database that hangs must hold up neither the
 * health answer nor the daily message. */
export function within<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error("no answer in time")), ms); })]).finally(() => clearTimeout(timer));
}

/** Throws what the database throws. */
export async function readHealth(run: RunQuery): Promise<Health> {
  const { rows } = await run(HEALTH_SQL);
  const clock = time(rows[0]?.clock);
  if (clock === null) throw new Error("the database gave no time");
  const seen = new Map(rows.map(row => [String(row.job), row]));
  const check = seen.get(DAILY_CHECK.job);
  return {
    clock: new Date(clock).toISOString(),
    jobs: SCHEDULED_JOBS.map(({ job, hours, on }) => {
      const row = seen.get(job);
      const ran = time(row?.last_ran), last = time(row?.last_seen);
      const within = (at: number | null) => at !== null && clock - at <= hours * 3_600_000;
      const state = on && !on() ? "off" : within(ran) ? "ok" : within(last) ? "failing" : "late";
      return { job, state, last_ran_at: iso(ran), last_seen_at: iso(last) };
    }),
    daily_check: check ? { at: iso(time(check.last_seen))!, outcome: String(check.last_outcome) } : null,
  };
}
