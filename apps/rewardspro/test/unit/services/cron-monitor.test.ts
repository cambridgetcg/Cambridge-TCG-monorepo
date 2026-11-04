import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { json } from "@remix-run/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vercel neither retries a failed cron nor tells anyone. Every scheduled run
 * leaves a record of when it started and how it ended, a failure reaches
 * Sentry, and the operator readiness check can tell a job that stopped.
 */

const db = vi.hoisted(() => ({
  syncStatus: { upsert: vi.fn(), findMany: vi.fn() },
}));
const sentryService = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(),
}));
const sentry = vi.hoisted(() => ({ captureCheckIn: vi.fn() }));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));
vi.mock("~/services/monitoring/sentry.service", () => ({ SentryService: sentryService }));
vi.mock("@sentry/remix", () => sentry);

import {
  CRON_RECORD_SHOP,
  CRON_SCHEDULES,
  cronFailed,
  cronHealth,
  cronProblems,
  monitoredCron,
  onSchedule,
  scheduleInterval,
} from "~/services/cron-monitor.server";

const HOUR = 60 * 60 * 1000;
const originalSecret = process.env.CRON_SECRET;
const originalMonitors = process.env.SENTRY_CRON_MONITORS;

function cronRequest(path = "/api/cron/mission-status", authorization = "Bearer the-cron-secret") {
  return new Request(`https://rewardspro.test${path}`, { headers: { Authorization: authorization } });
}

function call(loader: ReturnType<typeof monitoredCron>, request: Request) {
  return loader({ request, params: {}, context: {} });
}

// Every cron finished a run a minute ago
function healthyRecords() {
  const at = new Date(Date.now() - 60 * 1000);
  return Object.keys(CRON_SCHEDULES).map((job) => ({ syncType: `${job}:succeeded`, lastSyncAt: at, createdAt: at }));
}

// The SyncStatus rows written, as [syncType, data]
function recorded() {
  return db.syncStatus.upsert.mock.calls.map(([args]) => [args.where.shop_syncType.syncType, args.update]);
}

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  delete process.env.SENTRY_CRON_MONITORS;
  db.syncStatus.upsert.mockReset().mockResolvedValue({});
  db.syncStatus.findMany.mockReset().mockResolvedValue(healthyRecords());
  sentryService.isEnabled.mockReset().mockReturnValue(false);
  sentryService.captureException.mockReset();
  sentryService.captureMessage.mockReset().mockReturnValue("event-1");
  sentryService.flush.mockReset().mockResolvedValue(undefined);
  sentry.captureCheckIn.mockReset().mockReturnValue("check-in-1");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  if (originalMonitors === undefined) delete process.env.SENTRY_CRON_MONITORS;
  else process.env.SENTRY_CRON_MONITORS = originalMonitors;
});

describe("monitoredCron", () => {
  it("records when an authenticated run started and that it succeeded", async () => {
    const answer = json({ success: true });
    const loader = monitoredCron("mission-status", async () => answer);

    const response = await call(loader, cronRequest());

    expect(response).toBe(answer);
    const [[startedType, started], [endedType, ended]] = recorded();
    expect(startedType).toBe("mission-status:started");
    expect(started).toMatchObject({ status: "RUNNING", errorMessage: null });
    expect(endedType).toBe("mission-status:succeeded");
    expect(ended).toMatchObject({ status: "COMPLETED", errorMessage: null });
    // Both rows carry the run's start, so the latest run's outcome is the row that matches it
    expect(ended.lastSyncAt).toEqual(started.lastSyncAt);
    expect(db.syncStatus.upsert.mock.calls[0][0].where.shop_syncType.shop).toBe(CRON_RECORD_SHOP);
    expect(sentryService.captureException).not.toHaveBeenCalled();
  });

  it("records a 500 answer as a failure with the route's error, and sends that error to Sentry", async () => {
    const failure = new Error("database refused the update for sam@example.com");
    const loader = monitoredCron("mission-status", async ({ request }) => {
      cronFailed(request, failure);
      return json({ success: false, error: "Mission status update failed" }, { status: 500 });
    });

    const response = await call(loader, cronRequest());

    expect(response.status).toBe(500);
    const [, [endedType, ended]] = recorded();
    expect(endedType).toBe("mission-status:failed");
    expect(ended.status).toBe("FAILED");
    // The stored message has no shopper email address
    expect(ended.errorMessage).toBe("Error: database refused the update for [REDACTED_EMAIL]");
    expect(sentryService.captureException).toHaveBeenCalledTimes(1);
    expect(sentryService.captureException.mock.calls[0][0]).toBe(failure);
    expect(sentryService.captureException.mock.calls[0][1]).toMatchObject({
      operation: { type: "cron", name: "mission-status" },
      tags: { "cron.job": "mission-status" },
    });
    expect(sentryService.flush).toHaveBeenCalled();
  });

  it("answers 500 when the route throws, and records the error", async () => {
    const loader = monitoredCron("session-cleanup", async () => {
      throw new Error("connection reset");
    });

    const response = await call(loader, cronRequest("/api/cron/session-cleanup"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      job: "session-cleanup",
      error: "Cron job failed",
    });
    const [, [endedType, ended]] = recorded();
    expect(endedType).toBe("session-cleanup:failed");
    expect(ended.errorMessage).toBe("Error: connection reset");
    expect(sentryService.captureException.mock.calls[0][0]).toEqual(new Error("connection reset"));
  });

  it("records nothing for a refused caller or for an operator's ?stats or ?dry-run call", async () => {
    const run = vi.fn(async () => json({ success: true }));
    const loader = monitoredCron("session-cleanup", run);

    // The route itself answers the refused caller with 401
    await call(loader, cronRequest("/api/cron/session-cleanup", "Bearer wrong"));
    await call(loader, cronRequest("/api/cron/session-cleanup?stats=true"));
    await call(loader, cronRequest("/api/cron/session-cleanup?dry-run=true"));

    expect(run).toHaveBeenCalledTimes(3);
    expect(db.syncStatus.upsert).not.toHaveBeenCalled();
  });

  it("keeps the job's answer when its record can't be written", async () => {
    db.syncStatus.upsert.mockRejectedValue(new Error("table missing"));
    const loader = monitoredCron("mission-status", async () => json({ success: true }));

    const response = await call(loader, cronRequest());

    expect(response.status).toBe(200);
  });

  it("records a run that finished with problems as partial, and warns Sentry with how many and the first", async () => {
    const answer = json({ success: true, failed: 2 });
    const loader = monitoredCron("cashback-reconciliation", async ({ request }) => {
      cronProblems(request, 2, new Error("Shopify refused the credit for sam@example.com"));
      return answer;
    });

    const response = await call(loader, cronRequest("/api/cron/cashback-reconciliation"));

    // The answer is the route's: the run finished
    expect(response).toBe(answer);
    const [[startedType], [endedType, ended]] = recorded();
    expect(startedType).toBe("cashback-reconciliation:started");
    expect(endedType).toBe("cashback-reconciliation:partial");
    expect(ended.status).toBe("COMPLETED");
    expect(ended.errorMessage).toBe("2 failed; first: Error: Shopify refused the credit for [REDACTED_EMAIL]");
    expect(sentryService.captureException).not.toHaveBeenCalled();
    const problemReports = sentryService.captureMessage.mock.calls.filter(([message]) => message.includes("finished with problems"));
    expect(problemReports).toEqual([
      [
        "Cron cashback-reconciliation finished with problems",
        "warning",
        {
          tags: { "cron.job": "cashback-reconciliation", "cron.partial": "true" },
          extra: { problems: 2, firstProblem: "Error: Shopify refused the credit for [REDACTED_EMAIL]" },
        },
      ],
    ]);
  });

  it("records a run with no problems as succeeded", async () => {
    const loader = monitoredCron("mission-status", async ({ request }) => {
      cronProblems(request, 0);
      return json({ success: true });
    });

    await call(loader, cronRequest());

    expect(recorded().map(([type]) => type)).toEqual(["mission-status:started", "mission-status:succeeded"]);
    expect(sentryService.captureMessage).not.toHaveBeenCalled();
  });

  it("tells Sentry once when another cron stops finishing its runs", async () => {
    // Every cron finished an hour ago, except tier-product-cleanup (daily), three days ago
    const now = Date.now();
    const finished = (job: string, ms: number) => ({
      syncType: `${job}:succeeded`,
      lastSyncAt: new Date(now - ms),
      createdAt: new Date(now - 30 * 24 * HOUR),
    });
    const rows = Object.keys(CRON_SCHEDULES).map((job) =>
      finished(job, job === "tier-product-cleanup" ? 72 * HOUR : 1 * HOUR),
    );
    db.syncStatus.findMany.mockResolvedValue(rows);
    const loader = monitoredCron("mission-status", async () => json({ success: true }));

    await call(loader, cronRequest());

    expect(sentryService.captureMessage).toHaveBeenCalledTimes(1);
    const [message, level, context] = sentryService.captureMessage.mock.calls[0];
    expect(message).toBe("Cron tier-product-cleanup has not finished a run within twice its schedule");
    expect(level).toBe("warning");
    expect(context.tags).toEqual({ "cron.job": "tier-product-cleanup", "cron.stale": "true" });
    expect(context.extra).toMatchObject({ lastSucceededAt: new Date(now - 72 * HOUR).toISOString() });
    const [staleType, stale] = recorded()[2];
    expect(staleType).toBe("tier-product-cleanup:stale");
    expect(stale.status).toBe("FAILED");

    // Reported once: the next run, which reads that record, says nothing more
    db.syncStatus.findMany.mockResolvedValue([
      ...rows,
      { syncType: "tier-product-cleanup:stale", lastSyncAt: new Date(now), createdAt: new Date(now) },
    ]);
    await call(loader, cronRequest());
    expect(sentryService.captureMessage).toHaveBeenCalledTimes(1);

    // A report from before its last finished run is an earlier stop: this one is reported
    db.syncStatus.findMany.mockResolvedValue([
      ...rows,
      { syncType: "tier-product-cleanup:stale", lastSyncAt: new Date(now - 80 * HOUR), createdAt: new Date(now) },
    ]);
    await call(loader, cronRequest());
    expect(sentryService.captureMessage).toHaveBeenCalledTimes(2);
  });

  it("does not report the job that is running as stopped, and keeps its answer when the check fails", async () => {
    db.syncStatus.findMany.mockRejectedValueOnce(new Error("read timed out"));
    const loader = monitoredCron("mission-status", async () => json({ success: true }));

    const response = await call(loader, cronRequest());
    expect(response.status).toBe(200);

    // Nothing recorded yet but this run's start: mission-status itself is not reported
    db.syncStatus.findMany.mockResolvedValue([
      { syncType: "mission-status:started", lastSyncAt: new Date(Date.now() - 3 * HOUR), createdAt: new Date(Date.now() - 30 * 24 * HOUR) },
    ]);
    await call(loader, cronRequest());
    const reported = sentryService.captureMessage.mock.calls.map(([, , context]) => context.tags["cron.job"]);
    expect(reported).not.toContain("mission-status");
    expect(reported.sort()).toEqual(Object.keys(CRON_SCHEDULES).filter((job) => job !== "mission-status").sort());
  });

  it("logs whether a run started on its schedule", async () => {
    const lines: Array<Record<string, unknown>> = [];
    vi.mocked(console.log).mockImplementation((line: string) => {
      lines.push(JSON.parse(line));
    });
    const loader = monitoredCron("cashback-reconciliation", async () => json({ success: true }));
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-04T10:30:40Z"));
      await call(loader, cronRequest("/api/cron/cashback-reconciliation"));
      // The 09:28 runs on 11-04 were started by hand
      vi.setSystemTime(new Date("2026-11-04T09:28:06Z"));
      await call(loader, cronRequest("/api/cron/cashback-reconciliation"));
    } finally {
      vi.useRealTimers();
    }

    const runs = lines.filter((line) => line.service === "cron-monitor");
    expect(runs.map((line) => line.onSchedule)).toEqual([true, false]);
  });

  it("checks in to Sentry Crons only when SENTRY_CRON_MONITORS is true", async () => {
    sentryService.isEnabled.mockReturnValue(true);
    const ok = monitoredCron("webhook-cleanup", async () => json({ success: true }));
    const failing = monitoredCron("webhook-cleanup", async () => json({ success: false }, { status: 500 }));

    await call(ok, cronRequest("/api/cron/webhook-cleanup"));
    expect(sentry.captureCheckIn).not.toHaveBeenCalled();

    process.env.SENTRY_CRON_MONITORS = "true";
    await call(ok, cronRequest("/api/cron/webhook-cleanup"));
    await call(failing, cronRequest("/api/cron/webhook-cleanup"));

    const checkIns = sentry.captureCheckIn.mock.calls;
    expect(checkIns).toHaveLength(4);
    // Sentry waits for twice the schedule, as readiness does, so one run Vercel
    // didn't deliver is not an alert
    expect(checkIns[0]).toEqual([
      { monitorSlug: "rewardspro-webhook-cleanup", status: "in_progress" },
      expect.objectContaining({ schedule: { type: "interval", value: 2, unit: "week" }, checkinMargin: 15, timezone: "Etc/UTC" }),
    ]);
    expect(checkIns[1][0]).toMatchObject({ monitorSlug: "rewardspro-webhook-cleanup", status: "ok", checkInId: "check-in-1" });
    expect(checkIns[3][0]).toMatchObject({ status: "error", checkInId: "check-in-1" });
  });

  it("checks in only for the jobs SENTRY_CRON_MONITORS names", async () => {
    sentryService.isEnabled.mockReturnValue(true);
    process.env.SENTRY_CRON_MONITORS = "mission-status";

    await call(monitoredCron("webhook-cleanup", async () => json({ success: true })), cronRequest("/api/cron/webhook-cleanup"));
    expect(sentry.captureCheckIn).not.toHaveBeenCalled();

    await call(monitoredCron("mission-status", async () => json({ success: true })), cronRequest());
    expect(sentry.captureCheckIn.mock.calls.map(([checkIn]) => checkIn.monitorSlug)).toEqual([
      "rewardspro-mission-status",
      "rewardspro-mission-status",
    ]);
    expect(sentry.captureCheckIn.mock.calls[0][1].schedule).toEqual({ type: "interval", value: 2, unit: "hour" });
  });
});

describe("cron schedules", () => {
  it("are the ones vercel.json schedules", () => {
    const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const scheduled = Object.fromEntries(vercelConfig.crons.map((cron) => [cron.path.replace("/api/cron/", ""), cron.schedule]));

    expect(CRON_SCHEDULES).toEqual(scheduled);
  });

  it("know how often each schedule runs", () => {
    expect(scheduleInterval("30 * * * *")).toBe(HOUR);
    expect(scheduleInterval("0 1 * * *")).toBe(24 * HOUR);
    expect(scheduleInterval("0 5 * * 0")).toBe(7 * 24 * HOUR);
    expect(() => scheduleInterval("*/15 * * * *")).toThrow("Unsupported cron schedule");
    expect(() => scheduleInterval("0 0 1 * *")).toThrow("Unsupported cron schedule");
  });

  it("tell a run that started on its schedule from one started by hand", () => {
    expect(onSchedule("30 * * * *", new Date("2026-11-04T10:30:59Z"))).toBe(true);
    expect(onSchedule("30 * * * *", new Date("2026-11-04T10:34:00Z"))).toBe(true);
    expect(onSchedule("30 * * * *", new Date("2026-11-04T10:36:00Z"))).toBe(false);
    expect(onSchedule("30 * * * *", new Date("2026-11-04T10:29:00Z"))).toBe(false);
    expect(onSchedule("0 6 * * *", new Date("2026-11-04T06:00:30Z"))).toBe(true);
    expect(onSchedule("0 6 * * *", new Date("2026-11-04T09:28:02Z"))).toBe(false);
    expect(onSchedule("0 6 * * *", new Date("2026-11-04T05:59:00Z"))).toBe(false);
    // 2026-11-08 is a Sunday
    expect(onSchedule("0 5 * * 0", new Date("2026-11-08T05:00:10Z"))).toBe(true);
    expect(onSchedule("0 5 * * 0", new Date("2026-11-04T05:00:10Z"))).toBe(false);
  });
});

describe("cronHealth", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const row = (syncType: string, lastSyncAt: Date, createdAt = ago(3 * 24 * HOUR)) => ({ syncType, lastSyncAt, createdAt });

  it("calls a job stale when it hasn't finished a run within twice its schedule and 15 minutes", async () => {
    db.syncStatus.findMany.mockResolvedValue([
      row("mission-status:started", ago(1 * HOUR)),
      row("mission-status:succeeded", ago(3 * HOUR)),
      row("mission-status:failed", ago(1 * HOUR)),
      row("cashback-reconciliation:succeeded", ago(1 * HOUR)),
      row("tier-maintenance:succeeded", ago(47 * HOUR)),
      row("session-cleanup:succeeded", ago(49 * HOUR)),
    ]);

    const health = await cronHealth(now);

    expect(db.syncStatus.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { shop: CRON_RECORD_SHOP } }));
    expect(health.jobs["mission-status"]).toEqual({
      schedule: "0 * * * *",
      lastStartedAt: ago(1 * HOUR).toISOString(),
      lastSucceededAt: ago(3 * HOUR).toISOString(),
      lastFailedAt: ago(1 * HOUR).toISOString(),
      lastPartialAt: null,
      staleReportedAt: null,
      stale: true,
    });
    expect(health.jobs["cashback-reconciliation"].stale).toBe(false);
    expect(health.jobs["tier-maintenance"].stale).toBe(false);
    expect(health.jobs["session-cleanup"].stale).toBe(true);
    // Recording began three days ago: the weekly job has had no turn yet, the hourly and daily ones have
    expect(health.jobs["webhook-cleanup"]).toMatchObject({ lastSucceededAt: null, stale: false });
    expect(health.jobs["scheduled-campaigns"]).toMatchObject({ lastSucceededAt: null, stale: true });
    expect(health.jobs["tier-recalculation"]).toMatchObject({ lastSucceededAt: null, stale: true });
    expect(health.stale.sort()).toEqual(
      ["mission-status", "scheduled-campaigns", "session-cleanup", "tier-product-cleanup", "tier-recalculation"].sort(),
    );
  });

  it("calls every job stale when no cron has left a record", async () => {
    db.syncStatus.findMany.mockResolvedValue([]);
    const health = await cronHealth(now);

    expect(health.stale.sort()).toEqual(Object.keys(CRON_SCHEDULES).sort());
  });

  it("waits 15 minutes past twice the schedule, so one run Vercel didn't deliver isn't stale", async () => {
    db.syncStatus.findMany.mockResolvedValue([
      row("mission-status:succeeded", ago(2 * HOUR + 10 * 60 * 1000)),
      row("scheduled-campaigns:succeeded", ago(2 * HOUR + 20 * 60 * 1000)),
    ]);

    const health = await cronHealth(now);

    expect(health.jobs["mission-status"].stale).toBe(false);
    expect(health.jobs["scheduled-campaigns"].stale).toBe(true);
  });

  it("counts a run that finished with problems as a run", async () => {
    db.syncStatus.findMany.mockResolvedValue([
      row("cashback-reconciliation:succeeded", ago(5 * HOUR)),
      row("cashback-reconciliation:partial", ago(1 * HOUR)),
    ]);

    const health = await cronHealth(now);

    expect(health.jobs["cashback-reconciliation"]).toMatchObject({
      lastSucceededAt: ago(5 * HOUR).toISOString(),
      lastPartialAt: ago(1 * HOUR).toISOString(),
      stale: false,
    });
  });
});
