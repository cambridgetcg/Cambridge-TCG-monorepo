import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  syncStatus: { findMany: vi.fn() },
}));

vi.mock("~/db.server", () => ({ default: prisma, db: prisma }));

import { loader } from "~/routes/api.operator.readiness";
import { CRON_RECORD_SHOP, CRON_SCHEDULES } from "~/services/cron-monitor.server";

// Every scheduled cron succeeded `minutesAgo` minutes ago
function cronRecords(minutesAgo: number, except: string[] = []) {
  const at = new Date(Date.now() - minutesAgo * 60 * 1000);
  return Object.keys(CRON_SCHEDULES)
    .filter((job) => !except.includes(job))
    .flatMap((job) => [
      { syncType: `${job}:started`, lastSyncAt: at, createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      { syncType: `${job}:succeeded`, lastSyncAt: at, createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    ]);
}

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  prisma.$queryRaw.mockReset();
  prisma.syncStatus.findMany.mockReset().mockResolvedValue(cronRecords(5));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

function request(authorization?: string): Request {
  return new Request("https://example.test/api/operator/readiness", {
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

describe("operator readiness", () => {
  it.each([undefined, "Bearer wrong", "bearer readiness-secret"])(
    "rejects a missing or inexact credential before touching the database",
    async (authorization) => {
      process.env.CRON_SECRET = "readiness-secret";

      const response = await loader({
        request: request(authorization),
        params: {},
        context: {},
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({ status: "unauthorized" });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.syncStatus.findMany).not.toHaveBeenCalled();
    },
  );

  it("runs the database probe and one read of the cron records for the exact bearer credential", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const response = await loader({
      request: request("Bearer readiness-secret"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.crons.stale).toEqual([]);
    expect(Object.keys(body.crons.jobs).sort()).toEqual(Object.keys(CRON_SCHEDULES).sort());
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0][0].join("")).toBe("SELECT 1");
    expect(prisma.syncStatus.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.syncStatus.findMany.mock.calls[0][0].where).toEqual({ shop: CRON_RECORD_SHOP });
  });

  it("answers 503 and names a cron that hasn't succeeded within twice its schedule", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const stopped = new Date(Date.now() - 3 * 60 * 60 * 1000);
    prisma.syncStatus.findMany.mockResolvedValueOnce([
      ...cronRecords(5, ["cashback-reconciliation"]),
      { syncType: "cashback-reconciliation:succeeded", lastSyncAt: stopped, createdAt: stopped },
    ]);

    const response = await loader({
      request: request("Bearer readiness-secret"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.status).toBe("crons_stale");
    expect(body.crons.stale).toEqual(["cashback-reconciliation"]);
    expect(body.crons.jobs["cashback-reconciliation"]).toMatchObject({
      schedule: "30 * * * *",
      lastSucceededAt: stopped.toISOString(),
      stale: true,
    });
  });

  it("answers unavailable without detail when the cron records can't be read", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const internalDetail = "relation SyncStatus does not exist";
    prisma.syncStatus.findMany.mockRejectedValueOnce(new Error(internalDetail));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await loader({
      request: request("Bearer readiness-secret"),
      params: {},
      context: {},
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    expect(body).not.toContain(internalDetail);
  });

  it("returns a generic unavailable response without exposing the failure", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    const internalDetail = "credential material was rejected upstream";
    prisma.$queryRaw.mockRejectedValueOnce(new Error(internalDetail));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await loader({
      request: request("Bearer readiness-secret"),
      params: {},
      context: {},
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    expect(body).not.toContain(internalDetail);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.syncStatus.findMany).not.toHaveBeenCalled();
  });

  it("answers 503 when the database does not respond within the probe timeout", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    vi.useFakeTimers();
    prisma.$queryRaw.mockReturnValueOnce(new Promise(() => {}));
    vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const pending = loader({
        request: request("Bearer readiness-secret"),
        params: {},
        context: {},
      });
      await vi.advanceTimersByTimeAsync(2_000);
      const response = await pending;

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });
});
