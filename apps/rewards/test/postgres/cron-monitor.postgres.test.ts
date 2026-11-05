import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { CRON_SCHEDULES, cronFailed, cronHealth, cronProblems, monitoredCron } from "~/lib/cron.server";
import { monitoring } from "~/lib/telemetry.server";
import { failNextCall, hasTestDatabase, resetDatabase, restoreFailedCalls } from "./helpers/database";

/**
 * The monitored-cron wrapper on Postgres, carried from apps/rewardspro's
 * cron-monitor tests (PR #140) and reduced to the three jobs: every run
 * started with the cron secret leaves its start and its outcome in cron_run,
 * a failure reaches Sentry, and a job that stopped is reported once.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const originalSecret = process.env.CRON_SECRET;
const originalMonitors = process.env.REWARDS_SENTRY_CRON_MONITORS;
const originalOldMonitors = process.env.SENTRY_CRON_MONITORS;

function cronRequest(job: string, authorization = "Bearer the-cron-secret") {
  return new Request(`https://rewards.test/api/cron/${job}`, { headers: { Authorization: authorization } });
}

const call = (loader: (args: { request: Request }) => Promise<Response>, request: Request) => loader({ request });

const rows = () => prisma.cronRun.findMany({ orderBy: [{ job: "asc" }, { outcome: "asc" }] });

describe.skipIf(!hasTestDatabase)("cron run records on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = "the-cron-secret";
    delete process.env.REWARDS_SENTRY_CRON_MONITORS;
    delete process.env.SENTRY_CRON_MONITORS;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(monitoring, "enabled").mockReturnValue(false);
    vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
    vi.spyOn(monitoring, "captureMessage").mockReturnValue(true);
    vi.spyOn(monitoring, "captureCheckIn").mockReturnValue("check-in-1");
    vi.spyOn(monitoring, "flush").mockResolvedValue(undefined);
  });

  afterEach(() => {
    restoreFailedCalls();
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    if (originalMonitors === undefined) delete process.env.REWARDS_SENTRY_CRON_MONITORS;
    else process.env.REWARDS_SENTRY_CRON_MONITORS = originalMonitors;
    if (originalOldMonitors === undefined) delete process.env.SENTRY_CRON_MONITORS;
    else process.env.SENTRY_CRON_MONITORS = originalOldMonitors;
  });

  it("keeps one row per job and outcome, and the health check reads them", async () => {
    const ok = monitoredCron("payouts", async () => Response.json({ success: true }));
    const failing = monitoredCron("payouts", async ({ request }) => {
      cronFailed(request, new Error("payout table locked for sam@example.com"));
      return Response.json({ success: false }, { status: 500 });
    });

    await call(ok, cronRequest("payouts"));
    await call(ok, cronRequest("payouts"));
    await call(failing, cronRequest("payouts"));

    const recorded = await rows();
    expect(recorded.map((row) => row.outcome)).toEqual(["failed", "started", "succeeded"]);
    expect(recorded.every((row) => row.job === "payouts")).toBe(true);
    // No buyer email address is stored
    expect(recorded[0].errorMessage).toBe("Error: payout table locked for [REDACTED_EMAIL]");
    // Every row carries its run's start; the outcome rows say when it ended
    expect(recorded[0].startedAt).toEqual(recorded[1].startedAt);
    expect(recorded[0].finishedAt!.getTime()).toBeGreaterThanOrEqual(recorded[0].startedAt.getTime());
    expect(recorded[1].finishedAt).toBeNull();
    expect(monitoring.captureException).toHaveBeenCalledTimes(1);
    expect(vi.mocked(monitoring.captureException).mock.calls[0][1]).toMatchObject({ tags: { "cron.job": "payouts" } });

    const health = await cronHealth();
    expect(health.jobs.payouts).toMatchObject({ stale: false, lastFailedAt: recorded[0].startedAt.toISOString() });
  });

  it("answers 500 when the job throws, and records the error", async () => {
    const loader = monitoredCron("housekeeping", async () => {
      throw new Error("connection reset");
    });

    const response = await call(loader, cronRequest("housekeeping"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ success: false, job: "housekeeping", error: "Cron job failed" });
    const failed = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "housekeeping", outcome: "failed" } } });
    expect(failed.errorMessage).toBe("Error: connection reset");
    expect(vi.mocked(monitoring.captureException).mock.calls[0][0]).toEqual(new Error("connection reset"));
    expect(monitoring.flush).toHaveBeenCalled();
  });

  it("records a run that finished with problems, counts it as a run, and reports a stopped job once", async () => {
    // Every job finished an hour ago but housekeeping (daily), three days ago
    const now = Date.now();
    await prisma.cronRun.createMany({
      data: Object.keys(CRON_SCHEDULES).map((job) => ({
        job,
        outcome: "succeeded",
        startedAt: new Date(now - (job === "housekeeping" ? 72 : 1) * HOUR),
        createdAt: new Date(now - 30 * DAY),
      })),
    });
    const partial = monitoredCron("payouts", async ({ request }) => {
      cronProblems(request, 2, new Error("Shopify refused the credit for sam@example.com"));
      return Response.json({ success: true });
    });

    await call(partial, cronRequest("payouts"));
    await call(partial, cronRequest("payouts"));

    const row = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "payouts", outcome: "partial" } } });
    expect(row.errorMessage).toBe("2 failed; first: Error: Shopify refused the credit for [REDACTED_EMAIL]");
    const health = await cronHealth();
    expect(health.jobs.payouts).toMatchObject({ lastPartialAt: row.startedAt.toISOString(), stale: false });
    expect(health.stale).toEqual(["housekeeping"]);
    expect(health.jobs.housekeeping.staleReportedAt).not.toBeNull();

    const messages = vi.mocked(monitoring.captureMessage).mock.calls.map(([message]) => message);
    expect(messages.filter((message) => message.includes("has not finished a run"))).toEqual([
      "Cron housekeeping has not finished a run within twice its schedule",
    ]);
    expect(messages.filter((message) => message.includes("finished with problems"))).toHaveLength(2);
    expect(monitoring.captureException).not.toHaveBeenCalled();
  });

  it("records nothing for a refused caller or a call with a query string", async () => {
    const run = vi.fn(async () => Response.json({ success: true }));
    const loader = monitoredCron("tiers", run);

    await call(loader, cronRequest("tiers", "Bearer wrong"));
    await call(loader, cronRequest("tiers?dry-run=true"));

    expect(run).toHaveBeenCalledTimes(2);
    await expect(prisma.cronRun.count()).resolves.toBe(0);
  });

  it("keeps the job's answer when its record can't be written", async () => {
    failNextCall("cronRun", "upsert", new Error("table missing"));
    const loader = monitoredCron("tiers", async () => Response.json({ success: true }));

    const response = await call(loader, cronRequest("tiers"));

    expect(response.status).toBe(200);
    // The start could not be recorded; the outcome was
    expect((await rows()).map((r) => r.outcome)).toEqual(["succeeded"]);
  });

  it("checks in to Sentry Crons only for the jobs REWARDS_SENTRY_CRON_MONITORS names, never the old app's setting", async () => {
    vi.mocked(monitoring.enabled).mockReturnValue(true);
    const ok = monitoredCron("housekeeping", async () => Response.json({ success: true }));
    const failing = monitoredCron("housekeeping", async () => Response.json({ success: false }, { status: 500 }));

    await call(ok, cronRequest("housekeeping"));
    expect(monitoring.captureCheckIn).not.toHaveBeenCalled();

    // The old app's variable, shared in the one Vercel project, is ignored (Ruling 47)
    process.env.SENTRY_CRON_MONITORS = "true";
    await call(ok, cronRequest("housekeeping"));
    expect(monitoring.captureCheckIn).not.toHaveBeenCalled();

    process.env.REWARDS_SENTRY_CRON_MONITORS = "payouts";
    await call(ok, cronRequest("housekeeping"));
    expect(monitoring.captureCheckIn).not.toHaveBeenCalled();

    process.env.REWARDS_SENTRY_CRON_MONITORS = "true";
    await call(ok, cronRequest("housekeeping"));
    await call(failing, cronRequest("housekeeping"));

    const checkIns = vi.mocked(monitoring.captureCheckIn).mock.calls;
    expect(checkIns).toHaveLength(4);
    // Twice the schedule, so one run Vercel didn't deliver is not an alert
    expect(checkIns[0]).toEqual([
      { monitorSlug: "rewardspro-housekeeping", status: "in_progress" },
      expect.objectContaining({ schedule: { type: "interval", value: 2, unit: "day" }, checkinMargin: 15, timezone: "Etc/UTC" }),
    ]);
    expect(checkIns[1][0]).toMatchObject({ monitorSlug: "rewardspro-housekeeping", status: "ok", checkInId: "check-in-1" });
    expect(checkIns[3][0]).toMatchObject({ status: "error", checkInId: "check-in-1" });
  });

  it("reports this job's own last run, killed before it finished, at the next run's start (Ruling 47)", async () => {
    // A payouts run started an hour ago and was stopped (Vercel's 300 s) before it recorded an outcome
    const killedAt = new Date(Date.now() - HOUR);
    await prisma.cronRun.createMany({
      data: [
        { job: "payouts", outcome: "succeeded", startedAt: new Date(killedAt.getTime() - HOUR) },
        { job: "payouts", outcome: "started", startedAt: killedAt },
      ],
    });
    const ok = monitoredCron("payouts", async () => Response.json({ success: true }));

    await call(ok, cronRequest("payouts"));

    const message = `Cron payouts did not finish its run started at ${killedAt.toISOString()}`;
    expect(monitoring.captureMessage).toHaveBeenCalledWith(message, "warning", expect.objectContaining({ tags: { "cron.job": "payouts", "cron.killed": "true" } }));
    // Logged too, so it is seen without Sentry
    expect(console.warn).toHaveBeenCalledWith(`[cron] ${message}`);

    // Reported once: this run finished
    vi.mocked(monitoring.captureMessage).mockClear();
    await call(ok, cronRequest("payouts"));
    expect(vi.mocked(monitoring.captureMessage).mock.calls.filter(([m]) => m.includes("did not finish"))).toEqual([]);
  });

  it("logs a stopped run when Sentry is off, and leaves a run still inside its budget alone", async () => {
    vi.mocked(monitoring.captureMessage).mockReturnValue(false);
    const ok = monitoredCron("tiers", async () => Response.json({ success: true }));
    // Started a minute ago: it may still be running
    await prisma.cronRun.create({ data: { job: "tiers", outcome: "started", startedAt: new Date(Date.now() - 60_000) } });
    await call(ok, cronRequest("tiers"));
    expect(vi.mocked(console.warn).mock.calls.filter(([m]) => String(m).includes("did not finish"))).toEqual([]);

    await prisma.cronRun.update({ where: { job_outcome: { job: "tiers", outcome: "started" } }, data: { startedAt: new Date(Date.now() - 2 * DAY), createdAt: new Date(Date.now() - 30 * DAY) } });
    await prisma.cronRun.deleteMany({ where: { job: "tiers", outcome: { not: "started" } } });
    await call(ok, cronRequest("tiers"));
    expect(vi.mocked(console.warn).mock.calls.filter(([m]) => String(m).includes("did not finish"))).toHaveLength(1);
    // The other jobs, with no finished run in 30 days of records, are logged as stopped too
    expect(vi.mocked(console.warn).mock.calls.filter(([m]) => String(m).includes("has not finished a run")).length).toBeGreaterThan(0);
  });
});
