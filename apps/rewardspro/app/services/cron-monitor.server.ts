/**
 * Notice when a scheduled cron fails or stops.
 *
 * Vercel runs each cron in vercel.json on its schedule and does nothing when
 * a run fails: no retry and no alert. monitoredCron wraps a cron route so
 * that every run Vercel (or an operator) starts with the cron secret:
 *
 * - leaves a record of when it started and when it last succeeded or failed
 *   (SyncStatus rows under CRON_RECORD_SHOP, a shop name no store can have:
 *   `<job>:started`, `<job>:succeeded` and `<job>:failed`, each holding the
 *   start time of the run in lastSyncAt and, for a failure, its error);
 * - sends a failure (a 5xx answer, or an error the route throws) to Sentry,
 *   with the error the route passed to cronFailed;
 * - checks in to Sentry Crons when SENTRY_CRON_MONITORS is "true". Sentry
 *   then alerts on a missed or failed run, but bills each monitor past the
 *   plan's first, so it stays off until the owner turns it on.
 *
 * cronHealth reads the records for /api/operator/readiness: a job is stale
 * when it hasn't succeeded within twice its schedule.
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

const HOUR = 60 * 60 * 1000;
const ERROR_MESSAGE_LENGTH = 500;

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

type Outcome = "started" | "succeeded" | "failed";
const STATUS = { started: "RUNNING", succeeded: "COMPLETED", failed: "FAILED" } as const;

async function record(job: CronJob, outcome: Outcome, startedAt: Date, errorMessage: string | null = null) {
  const syncType = `${job}:${outcome}`;
  const data = { lastSyncAt: startedAt, status: STATUS[outcome], errorMessage };
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

function monitorSlug(job: CronJob): string {
  return `rewardspro-${job}`;
}

function monitorConfig(job: CronJob): MonitorConfig {
  return {
    schedule: { type: "crontab", value: CRON_SCHEDULES[job] },
    // Minutes: how late a run may start, and how long it may take (Vercel stops it at 300 s)
    checkinMargin: 10,
    maxRuntime: 10,
    timezone: "Etc/UTC",
  };
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
    const checkIn = SentryService.isEnabled() && process.env.SENTRY_CRON_MONITORS === "true";
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
    if (failed) {
      const error = thrown ?? failures.get(request) ?? new Error(`Cron ${job} answered HTTP ${response.status}`);
      SentryService.captureException(error, {
        operation: { type: "cron", name: job },
        tags: { "cron.job": job },
      });
      await record(job, "failed", startedAt, errorText(error));
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
    // One line per run; Vercel's scheduler sends user-agent vercel-cron/1.0
    console.log(JSON.stringify({
      level: failed ? "error" : "info",
      message: `Cron ${job} ${failed ? "failed" : "succeeded"}`,
      service: "cron-monitor",
      job,
      status: response.status,
      durationMs,
      vercelCron: request.headers.get("user-agent")?.startsWith("vercel-cron/") ?? false,
      timestamp: new Date().toISOString(),
    }));
    await SentryService.flush();

    return response;
  };
}

export interface CronJobHealth {
  schedule: string;
  lastStartedAt: string | null;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
  stale: boolean;
}

/**
 * Each scheduled job's last start, success and failure, and whether it is
 * stale: no success within twice its schedule. A job with no success yet is
 * judged from the first record any job left, so a weekly job isn't stale the
 * day this starts recording; with no record at all, every job is stale.
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
    const since = succeeded?.getTime() ?? recordingSince;
    const isStale = since === null || now.getTime() - since > 2 * scheduleInterval(schedule);
    if (isStale) stale.push(job);
    jobs[job] = {
      schedule,
      lastStartedAt: iso(at.get(`${job}:started`)),
      lastSucceededAt: iso(succeeded),
      lastFailedAt: iso(at.get(`${job}:failed`)),
      stale: isStale,
    };
  }
  return { stale, jobs };
}
