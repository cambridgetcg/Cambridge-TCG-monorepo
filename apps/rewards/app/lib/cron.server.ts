/**
 * The three scheduled jobs: their schedules, their credential, their lock,
 * and the monitor that notices when one fails or stops.
 *
 * Carried from apps/rewardspro: utils/cron-auth.server.ts (verifyCronAuth,
 * as is), services/cron-lock.server.ts (the lock, on cron_lock) and
 * services/cron-monitor.server.ts (PR #140, on cron_run instead of
 * SyncStatus rows, through telemetry.server.ts's `monitoring` instead of
 * SentryService). Nothing here imports react-router: monitoredCron takes any
 * route arguments that carry the request.
 *
 * Vercel runs each cron in vercel.json on its schedule and does nothing when
 * a run fails: no retry and no alert, and now and then a run never arrives.
 * monitoredCron wraps a cron route so that every run started with the cron
 * secret:
 * - leaves a record of when it started and how it ended (cron_run: one row
 *   per job and outcome, `started`, then `succeeded`, `partial` or `failed`,
 *   each holding the start time of the run and, for a partial or failed run,
 *   its error);
 * - sends a failure (a 5xx answer, or an error the route throws) to Sentry,
 *   with the error the route passed to cronFailed;
 * - sends a run that finished with problems (cronProblems) to Sentry as a
 *   warning;
 * - tells Sentry once when another job has stopped finishing its runs;
 * - checks in to Sentry Crons for the jobs SENTRY_CRON_MONITORS names
 *   ("true" for all). Sentry includes one cron monitor per plan and bills the
 *   others, so it stays off until the owner turns it on.
 */
import type { PrismaClient } from "@prisma/client";
import * as crypto from "node:crypto";
import prisma from "~/db.server";
import { monitoring, redactSensitiveTelemetryValue } from "./telemetry.server";

/** The jobs vercel.json schedules (UTC, plan Decision 17). test/unit/routes/cron-schedule.test.ts keeps them equal. */
export const CRON_SCHEDULES = { payouts: "30 * * * *", tiers: "0 2 * * *", housekeeping: "0 3 * * *" } as const;

export type CronJob = keyof typeof CRON_SCHEDULES;

/**
 * The one supported cron credential: Vercel sends CRON_SECRET as an exact
 * Authorization bearer token. Marker headers and development bypasses are
 * not credentials and are not accepted.
 */
export function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`);
}

// ---------------------------------------------------------------------------
// The lock: one cron_lock row per job, its job name unique, its expiry the
// TTL, so a crashed holder's lock runs out. Contention is the only "not
// acquired" outcome: any other failure (database unreachable, missing table)
// throws, so the run answers 5xx and the outage shows instead of passing as
// a skipped run.
// ---------------------------------------------------------------------------

export interface CronLockResult {
  acquired: boolean;
  lockId?: string;
  existingLock?: { lockedAt: Date; instanceId: string | null; expiresAt: Date };
}

/**
 * Take the lock for `jobName` for `ttlMinutes`, or say who holds it. An
 * expired lock is removed (that exact row, so a lock another instance has
 * just taken is never removed) and taken over. `db` is the client to run on
 * (tests pass several to race instances).
 */
export async function acquireCronLock(jobName: string, ttlMinutes: number = 10, db: PrismaClient = prisma): Promise<CronLockResult> {
  const lockId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const instanceId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || `local-${process.pid}`;

  let created: number;
  try {
    // ON CONFLICT DO NOTHING: a held lock is no error, so nothing is logged for it
    ({ count: created } = await db.cronLock.createMany({
      data: [{ id: lockId, jobName, lockedAt: now, expiresAt, instanceId }],
      skipDuplicates: true,
    }));
  } catch (error) {
    throw new Error(`[cron] Could not take the lock for ${jobName}`, { cause: error });
  }
  if (created === 1) return { acquired: true, lockId };

  const existing = await db.cronLock.findUnique({ where: { jobName } });
  // Released between the insert and this read: one more try
  if (!existing) return acquireCronLock(jobName, ttlMinutes, db);
  if (existing.expiresAt < now) {
    const removed = await db.cronLock.deleteMany({ where: { id: existing.id } });
    if (removed.count === 1) {
      console.log(`[cron] Took over the expired lock for ${jobName} from ${existing.instanceId ?? "an unknown instance"}`);
      return acquireCronLock(jobName, ttlMinutes, db);
    }
  }
  return {
    acquired: false,
    existingLock: { lockedAt: existing.lockedAt, instanceId: existing.instanceId, expiresAt: existing.expiresAt },
  };
}

/** Release a lock acquireCronLock took. Never throws: an expired lock may be gone already. */
export async function releaseCronLock(lockId: string): Promise<void> {
  try {
    await prisma.cronLock.deleteMany({ where: { id: lockId } });
  } catch (error) {
    console.warn(`[cron] Could not release lock ${lockId}:`, error instanceof Error ? error.message : String(error));
  }
}

/** Remove every expired lock (crashed holders); how many. Throws when the lock table can't be used. */
export async function cleanupExpiredLocks(): Promise<number> {
  const { count } = await prisma.cronLock.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  if (count > 0) console.log(`[cron] Removed ${count} expired lock(s)`);
  return count;
}

/**
 * Run `fn` holding the job's lock for at most `ttlMinutes`, then release it,
 * whether `fn` returns or throws; "locked" without running it while another
 * run holds the lock.
 */
export async function withCronLock<T>(job: CronJob, ttlMinutes: number, fn: () => Promise<T>): Promise<T | "locked"> {
  const lock = await acquireCronLock(job, ttlMinutes);
  if (!lock.acquired || !lock.lockId) {
    console.log(`[cron] ${job} is already running (lock held until ${lock.existingLock?.expiresAt.toISOString()}); skipped`);
    return "locked";
  }
  try {
    return await fn();
  } finally {
    await releaseCronLock(lock.lockId);
  }
}

// ---------------------------------------------------------------------------
// The monitor.
// ---------------------------------------------------------------------------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ERROR_MESSAGE_LENGTH = 500;
// Past twice the schedule, so a run Vercel didn't deliver and the next one starting late in its minute aren't stale
const STALE_MARGIN_MS = 15 * MINUTE;
// A scheduled run starts within its minute; one starting over 5 minutes after its slot was started by hand
const ON_SCHEDULE_MS = 5 * MINUTE;

/** How often a schedule runs: hourly ("M * * * *"), daily ("M H * * *") or weekly ("M H * * D"). */
export function scheduleInterval(schedule: string): number {
  const [minute, hour, dayOfMonth, month, dayOfWeek, ...rest] = schedule.split(" ");
  const number = /^\d+$/;
  if (rest.length > 0 || !number.test(minute ?? "") || dayOfMonth !== "*" || month !== "*") {
    throw new Error(`Unsupported cron schedule: ${schedule}`);
  }
  if (hour === "*" && dayOfWeek === "*") return HOUR;
  if (hour !== undefined && number.test(hour) && dayOfWeek === "*") return 24 * HOUR;
  if (hour !== undefined && number.test(hour) && /^[0-6]$/.test(dayOfWeek ?? "")) return 7 * 24 * HOUR;
  throw new Error(`Unsupported cron schedule: ${schedule}`);
}

/** Whether a run starting at `at` started on its schedule (within ON_SCHEDULE_MS of a slot), not by hand. */
export function onSchedule(schedule: string, at: Date): boolean {
  const [minute, hour, , , dayOfWeek] = schedule.split(" ");
  const slot = new Date(at);
  slot.setUTCSeconds(0, 0);
  slot.setUTCMinutes(Number(minute));
  if (hour !== "*") slot.setUTCHours(Number(hour));
  if (dayOfWeek !== "*") slot.setUTCDate(slot.getUTCDate() - ((slot.getUTCDay() - Number(dayOfWeek) + 7) % 7));
  // The latest slot at or before the run
  if (slot > at) slot.setTime(slot.getTime() - scheduleInterval(schedule));
  return at.getTime() - slot.getTime() < ON_SCHEDULE_MS;
}

// "stale" records when Sentry was told the job stopped
type Outcome = "started" | "succeeded" | "partial" | "failed" | "stale";

async function record(job: CronJob, outcome: Outcome, startedAt: Date, errorMessage: string | null = null) {
  const data = { startedAt, finishedAt: outcome === "started" ? null : new Date(), errorMessage };
  try {
    await prisma.cronRun.upsert({
      where: { job_outcome: { job, outcome } },
      create: { job, outcome, ...data },
      update: data,
    });
  } catch (error) {
    // The record is there to notice problems; it never fails the job
    console.error(`[cron] Could not record ${job}:${outcome}:`, error instanceof Error ? error.message : String(error));
  }
}

// "Name: message", with the cause's when it has one, without credentials or email addresses
function errorText(error: unknown): string {
  const text = String(redactSensitiveTelemetryValue(error));
  const cause = error instanceof Error && error.cause !== undefined ? ` (cause: ${String(redactSensitiveTelemetryValue(error.cause))})` : "";
  return `${text}${cause}`.slice(0, ERROR_MESSAGE_LENGTH);
}

// The error each failing run's route passed to cronFailed
const failures = new WeakMap<Request, unknown>();

/**
 * Called by a cron route before it answers 500, so the run's record and
 * Sentry get the real error instead of only the status.
 */
export function cronFailed(request: Request, error: unknown): void {
  failures.set(request, error);
}

// What failed in each run that finished anyway
const problems = new WeakMap<Request, { count: number; first: unknown }>();

/**
 * Called by a cron route whose run finished but some of its work failed (a
 * store, a payout, an order), before it answers 200: how many failed, and
 * the first error. The run is recorded as partial and Sentry gets a warning.
 */
export function cronProblems(request: Request, count: number, first?: unknown): void {
  if (count > 0) problems.set(request, { count, first });
}

function monitorSlug(job: CronJob): string {
  return `rewardspro-${job}`;
}

const INTERVAL_UNIT = { [HOUR]: "hour", [24 * HOUR]: "day", [7 * 24 * HOUR]: "week" } as const;

function monitorConfig(job: CronJob) {
  return {
    // A check-in within twice the schedule, as cronHealth asks, so one run
    // Vercel didn't deliver is not an alert
    schedule: { type: "interval" as const, value: 2, unit: INTERVAL_UNIT[scheduleInterval(CRON_SCHEDULES[job])] },
    // Minutes: how late a check-in may be, and how long a run may take (Vercel stops it at 300 s)
    checkinMargin: STALE_MARGIN_MS / MINUTE,
    maxRuntime: 10,
    timezone: "Etc/UTC",
  };
}

// SENTRY_CRON_MONITORS: "true" for every job, or the jobs to monitor, comma-separated
function sentryMonitors(job: CronJob): boolean {
  const setting = process.env.SENTRY_CRON_MONITORS?.trim();
  if (!setting) return false;
  return setting === "true" || setting.split(",").some((name) => name.trim() === job);
}

/**
 * Tells Sentry, once, about each other job that has stopped finishing its
 * runs, and records that it did (`stale`), so the next run doesn't repeat it
 * until the job has finished a run again. It never fails the job.
 */
async function reportStoppedCrons(current: CronJob, now: Date) {
  try {
    const { jobs } = await cronHealth(now);
    for (const job of Object.keys(jobs) as CronJob[]) {
      const health = jobs[job];
      if (job === current || !health.stale) continue;
      const finished = Math.max(Date.parse(health.lastSucceededAt ?? "") || 0, Date.parse(health.lastPartialAt ?? "") || 0);
      if (health.staleReportedAt && Date.parse(health.staleReportedAt) > finished) continue;
      const sent = monitoring.captureMessage(`Cron ${job} has not finished a run within twice its schedule`, "warning", {
        tags: { "cron.job": job, "cron.stale": "true" },
        extra: { ...health },
      });
      if (sent) await record(job, "stale", now);
    }
  } catch (error) {
    console.error("[cron] Could not check the other jobs:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Wrap a cron route's loader (see the header). A refused caller (the route
 * answers 401 itself) and a call with a query string are not scheduled runs:
 * they run unrecorded.
 */
export function monitoredCron<A extends { request: Request }>(
  job: CronJob,
  run: (args: A) => Promise<Response>,
): (args: A) => Promise<Response> {
  return async (args) => {
    const { request } = args;
    if (!verifyCronAuth(request) || new URL(request.url).search) return run(args);

    const startedAt = new Date();
    const checkInId =
      monitoring.enabled() && sentryMonitors(job)
        ? monitoring.captureCheckIn({ monitorSlug: monitorSlug(job), status: "in_progress" }, monitorConfig(job))
        : undefined;
    await record(job, "started", startedAt);

    let response: Response;
    let thrown: unknown;
    try {
      response = await run(args);
    } catch (error) {
      if (error instanceof Response) {
        response = error;
      } else {
        thrown = error;
        response = Response.json({ success: false, job, error: "Cron job failed" }, { status: 500 });
      }
    }

    const failed = response.status >= 500;
    const partial = failed ? undefined : problems.get(request);
    if (failed) {
      const error = thrown ?? failures.get(request) ?? new Error(`Cron ${job} answered HTTP ${response.status}`);
      monitoring.captureException(error, { tags: { "cron.job": job } });
      await record(job, "failed", startedAt, errorText(error));
    } else if (partial) {
      const firstProblem = partial.first === undefined ? null : errorText(partial.first);
      monitoring.captureMessage(`Cron ${job} finished with problems`, "warning", {
        tags: { "cron.job": job, "cron.partial": "true" },
        extra: { problems: partial.count, firstProblem },
      });
      await record(job, "partial", startedAt, `${partial.count} failed${firstProblem ? `; first: ${firstProblem}` : ""}`.slice(0, ERROR_MESSAGE_LENGTH));
    } else {
      await record(job, "succeeded", startedAt);
    }

    const durationMs = Date.now() - startedAt.getTime();
    if (checkInId) {
      monitoring.captureCheckIn({ checkInId, monitorSlug: monitorSlug(job), status: failed ? "error" : "ok", duration: durationMs / 1000 });
    }
    // One line per run. Vercel's cron service sends user-agent vercel-cron/1.0
    // for the schedule and for a run started by hand; a run by hand starts off its schedule.
    console.log(
      JSON.stringify({
        level: failed ? "error" : partial ? "warn" : "info",
        message: `Cron ${job} ${failed ? "failed" : partial ? "finished with problems" : "succeeded"}`,
        service: "cron-monitor",
        job,
        status: response.status,
        ...(partial && { problems: partial.count }),
        durationMs,
        vercelCron: request.headers.get("user-agent")?.startsWith("vercel-cron/") ?? false,
        onSchedule: onSchedule(CRON_SCHEDULES[job], startedAt),
        timestamp: new Date().toISOString(),
      }),
    );
    await reportStoppedCrons(job, new Date());
    await monitoring.flush();

    return response;
  };
}

export interface CronJobHealth {
  schedule: string;
  lastStartedAt: string | null;
  lastSucceededAt: string | null;
  /** The last run that finished with problems */
  lastPartialAt: string | null;
  lastFailedAt: string | null;
  /** When Sentry was last told the job had stopped */
  staleReportedAt: string | null;
  stale: boolean;
}

/**
 * Each job's last start, success, partial run and failure, and whether it is
 * stale: no finished run (succeeded or partial) within twice its schedule and
 * STALE_MARGIN_MS. A job with no finished run yet is judged from the first
 * record any job left; with no record at all, every job is stale.
 */
export async function cronHealth(now = new Date()): Promise<{ stale: CronJob[]; jobs: Record<CronJob, CronJobHealth> }> {
  const rows = await prisma.cronRun.findMany({ select: { job: true, outcome: true, startedAt: true, createdAt: true } });
  const at = new Map(rows.map((row) => [`${row.job}:${row.outcome}`, row.startedAt]));
  const recordingSince = rows.length > 0 ? Math.min(...rows.map((row) => row.createdAt.getTime())) : null;
  const iso = (date: Date | undefined) => date?.toISOString() ?? null;

  const stale: CronJob[] = [];
  const jobs = {} as Record<CronJob, CronJobHealth>;
  for (const job of Object.keys(CRON_SCHEDULES) as CronJob[]) {
    const schedule = CRON_SCHEDULES[job];
    const succeeded = at.get(`${job}:succeeded`);
    const partial = at.get(`${job}:partial`);
    const finished = [succeeded, partial].filter((date) => date !== undefined).map((date) => date.getTime());
    const since = finished.length > 0 ? Math.max(...finished) : recordingSince;
    const isStale = since === null || now.getTime() - since > 2 * scheduleInterval(schedule) + STALE_MARGIN_MS;
    if (isStale) stale.push(job);
    jobs[job] = {
      schedule,
      lastStartedAt: iso(at.get(`${job}:started`)),
      lastSucceededAt: iso(succeeded),
      lastPartialAt: iso(partial),
      lastFailedAt: iso(at.get(`${job}:failed`)),
      staleReportedAt: iso(at.get(`${job}:stale`)),
      stale: isStale,
    };
  }
  return { stale, jobs };
}

