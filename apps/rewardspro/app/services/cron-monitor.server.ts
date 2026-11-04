/**
 * Notice when a scheduled cron fails or stops.
 *
 * Vercel runs each cron in vercel.json on its schedule and does nothing when
 * a run fails: no retry and no alert. Its delivery is best effort, so now
 * and then a run never arrives. monitoredCron wraps a cron route so that
 * every run Vercel (or an operator) starts with the cron secret:
 *
 * - leaves a record of when it started and how it ended (SyncStatus rows
 *   under CRON_RECORD_SHOP, a shop name no store can have: `<job>:started`,
 *   then `<job>:succeeded`, `<job>:partial` or `<job>:failed`, each holding
 *   the start time of the run in lastSyncAt and, for a partial or failed
 *   run, its error);
 * - sends a failure (a 5xx answer, or an error the route throws) to Sentry,
 *   with the error the route passed to cronFailed;
 * - sends a run that finished with problems (a shop, an entry or a mission
 *   that failed, which the route passed to cronProblems) to Sentry as a
 *   warning;
 * - tells Sentry once when another cron has stopped finishing its runs (it
 *   stopped being called, times out, or fails every time);
 * - checks in to Sentry Crons for the jobs SENTRY_CRON_MONITORS names ("true"
 *   for all). Sentry then alerts when check-ins stop, which catches every
 *   cron stopping at once. Sentry includes one cron monitor per plan and
 *   bills the others, so it stays off until the owner turns it on.
 *
 * cronHealth reads the records for /api/operator/readiness: a job is stale
 * when it hasn't finished a run within twice its schedule and STALE_MARGIN_MS.
 */

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import type { MonitorConfig } from "@sentry/types";
import prisma from "~/db.server";
import { SentryService } from "~/services/monitoring/sentry.service";
import { verifyCronAuth } from "~/utils/cron-auth.server";
import { redactSensitiveTelemetryValue } from "~/utils/telemetry-redaction";

// The crons vercel.json schedules (UTC). test/unit/services/cron-monitor.test.ts keeps them equal.
export const CRON_SCHEDULES = {
  "tier-maintenance": "0 1 * * *",
  "webhook-cleanup": "0 5 * * 0",
  "session-cleanup": "0 6 * * *",
  "mission-status": "0 * * * *",
  "scheduled-campaigns": "15 * * * *",
  "cashback-reconciliation": "30 * * * *",
  "tier-recalculation": "0 9 * * *",
  "tier-product-cleanup": "30 3 * * *",
} as const;

export type CronJob = keyof typeof CRON_SCHEDULES;

// No shop domain has a colon, so no shop's queries or erasure reach these rows
export const CRON_RECORD_SHOP = "rewardspro:cron";

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

type Outcome = "started" | "succeeded" | "partial" | "failed" | "stale";
// "stale" records when Sentry was told the job stopped
const STATUS = { started: "RUNNING", succeeded: "COMPLETED", partial: "COMPLETED", failed: "FAILED", stale: "FAILED" } as const;

async function record(job: CronJob, outcome: Outcome, at: Date, errorMessage: string | null = null) {
  const syncType = `${job}:${outcome}`;
  const data = { lastSyncAt: at, status: STATUS[outcome], errorMessage };
  try {
    await prisma.syncStatus.upsert({
      where: { shop_syncType: { shop: CRON_RECORD_SHOP, syncType } },
      create: { shop: CRON_RECORD_SHOP, syncType, ...data },
      update: data,
    });
  } catch (error) {
    // The record is there to notice problems; it never fails the job
    console.error(`[CronMonitor] Could not record ${syncType}:`, error);
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
 * Called in a cron route's catch before it answers 500, so the run's record
 * and Sentry get the real error instead of only the status.
 */
export function cronFailed(request: Request, error: unknown): void {
  failures.set(request, error);
}

// What failed in each run that finished anyway
const problems = new WeakMap<Request, { count: number; first: unknown }>();

/**
 * Called by a cron route whose run finished but some of its work failed (a
 * shop, an entry, a mission), before it answers 200: how many failed, and
 * the first error. The run is recorded as partial and Sentry gets a warning.
 */
export function cronProblems(request: Request, count: number, first?: unknown): void {
  if (count > 0) problems.set(request, { count, first });
}

function monitorSlug(job: CronJob): string {
  return `rewardspro-${job}`;
}

const INTERVAL_UNIT = { [HOUR]: "hour", [24 * HOUR]: "day", [7 * 24 * HOUR]: "week" } as const;

function monitorConfig(job: CronJob): MonitorConfig {
  return {
    // A check-in within twice the schedule, as readiness asks, so one run
    // Vercel didn't deliver is not an alert
    schedule: { type: "interval", value: 2, unit: INTERVAL_UNIT[scheduleInterval(CRON_SCHEDULES[job])] },
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
 * runs, and records that it did (`<job>:stale`), so the next run doesn't
 * repeat it until the job has finished a run again. It never fails the job.
 */
async function reportStoppedCrons(current: CronJob, now: Date) {
  try {
    const { jobs } = await cronHealth(now);
    for (const job of Object.keys(jobs) as CronJob[]) {
      const health = jobs[job];
      if (job === current || !health.stale) continue;
      const finished = Math.max(Date.parse(health.lastSucceededAt ?? "") || 0, Date.parse(health.lastPartialAt ?? "") || 0);
      if (health.staleReportedAt && Date.parse(health.staleReportedAt) > finished) continue;
      const sent = SentryService.captureMessage(`Cron ${job} has not finished a run within twice its schedule`, "warning", {
        tags: { "cron.job": job, "cron.stale": "true" },
        extra: { ...health },
      });
      if (sent) await record(job, "stale", now);
    }
  } catch (error) {
    console.error("[CronMonitor] Could not check the other crons:", error);
  }
}

export function monitoredCron(
  job: CronJob,
  run: (args: LoaderFunctionArgs) => Promise<Response>,
): (args: LoaderFunctionArgs) => Promise<Response> {
  return async (args) => {
    const { request } = args;
    // A refused caller (the route answers 401) and an operator's ?stats,
    // ?dry-run or ?shop= call are not scheduled runs
    if (!verifyCronAuth(request) || new URL(request.url).search) return run(args);

    const startedAt = new Date();
    const checkIn = SentryService.isEnabled() && sentryMonitors(job);
    const checkInId = checkIn
      ? Sentry.captureCheckIn({ monitorSlug: monitorSlug(job), status: "in_progress" }, monitorConfig(job))
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
        response = json({ success: false, job, error: "Cron job failed" }, { status: 500 });
      }
    }

    const failed = response.status >= 500;
    const partial = failed ? undefined : problems.get(request);
    if (failed) {
      const error = thrown ?? failures.get(request) ?? new Error(`Cron ${job} answered HTTP ${response.status}`);
      SentryService.captureException(error, {
        operation: { type: "cron", name: job },
        tags: { "cron.job": job },
      });
      await record(job, "failed", startedAt, errorText(error));
    } else if (partial) {
      const firstProblem = partial.first === undefined ? null : errorText(partial.first);
      SentryService.captureMessage(`Cron ${job} finished with problems`, "warning", {
        tags: { "cron.job": job, "cron.partial": "true" },
        extra: { problems: partial.count, firstProblem },
      });
      await record(job, "partial", startedAt, `${partial.count} failed${firstProblem ? `; first: ${firstProblem}` : ""}`.slice(0, ERROR_MESSAGE_LENGTH));
    } else {
      await record(job, "succeeded", startedAt);
    }

    const durationMs = Date.now() - startedAt.getTime();
    if (checkInId) {
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: monitorSlug(job),
        status: failed ? "error" : "ok",
        duration: durationMs / 1000,
      });
    }
    // One line per run. Vercel's cron service sends user-agent vercel-cron/1.0
    // for the schedule and for a run started by hand (the Run button or
    // `vercel crons run`); a run by hand starts off its schedule.
    console.log(JSON.stringify({
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
    }));
    await reportStoppedCrons(job, new Date());
    await SentryService.flush();

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
 * Each scheduled job's last start, success, partial run and failure, and
 * whether it is stale: no finished run (succeeded or partial) within twice
 * its schedule and STALE_MARGIN_MS. A job with no finished run yet is judged
 * from the first record any job left, so a weekly job isn't stale the day
 * this starts recording; with no record at all, every job is stale.
 */
export async function cronHealth(now = new Date()): Promise<{ stale: CronJob[]; jobs: Record<CronJob, CronJobHealth> }> {
  const rows = await prisma.syncStatus.findMany({
    where: { shop: CRON_RECORD_SHOP },
    select: { syncType: true, lastSyncAt: true, createdAt: true },
  });
  const at = new Map(rows.map((row) => [row.syncType, row.lastSyncAt]));
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
