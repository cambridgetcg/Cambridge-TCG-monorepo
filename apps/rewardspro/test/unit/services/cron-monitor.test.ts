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
  monitoredCron,
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

// The SyncStatus rows written, as [syncType, data]
function recorded() {
  return db.syncStatus.upsert.mock.calls.map(([args]) => [args.where.shop_syncType.syncType, args.update]);
}

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  delete process.env.SENTRY_CRON_MONITORS;
  db.syncStatus.upsert.mockReset().mockResolvedValue({});
  db.syncStatus.findMany.mockReset().mockResolvedValue([]);
  sentryService.isEnabled.mockReset().mockReturnValue(false);
  sentryService.captureException.mockReset();
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
    expect(checkIns[0]).toEqual([
      { monitorSlug: "rewardspro-webhook-cleanup", status: "in_progress" },
      expect.objectContaining({ schedule: { type: "crontab", value: "0 5 * * 0" }, timezone: "Etc/UTC" }),
    ]);
    expect(checkIns[1][0]).toMatchObject({ monitorSlug: "rewardspro-webhook-cleanup", status: "ok", checkInId: "check-in-1" });
    expect(checkIns[3][0]).toMatchObject({ status: "error", checkInId: "check-in-1" });
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
});

describe("cronHealth", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const row = (syncType: string, lastSyncAt: Date, createdAt = ago(3 * 24 * HOUR)) => ({ syncType, lastSyncAt, createdAt });

  it("calls a job stale when it hasn't succeeded within twice its schedule", async () => {
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
    const health = await cronHealth(now);

    expect(health.stale.sort()).toEqual(Object.keys(CRON_SCHEDULES).sort());
  });
});
