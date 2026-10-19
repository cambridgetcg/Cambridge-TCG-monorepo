import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  cronLock: {
    create: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("~/db.server", () => ({ default: prisma, db: prisma }));
vi.mock("~/shopify.server", () => ({ unauthenticated: {} }));

import { acquireCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import { loader as cashbackReconciliation } from "~/routes/api.cron.cashback-reconciliation";

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`jobName`)", {
    code: "P2002",
    clientVersion: "test",
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("acquireCronLock", () => {
  it("reports contention as not acquired", async () => {
    prisma.cronLock.create.mockRejectedValueOnce(uniqueViolation());
    prisma.cronLock.findUnique.mockResolvedValueOnce({
      id: "held",
      jobName: "metrics",
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      instanceId: "other",
    });

    await expect(acquireCronLock("metrics")).resolves.toMatchObject({ acquired: false });
  });

  it("throws on any other database failure instead of reporting a skipped run", async () => {
    prisma.cronLock.create.mockRejectedValueOnce(new Error("connection refused"));

    await expect(acquireCronLock("metrics")).rejects.toThrow("[CronLock] Could not acquire lock for metrics");
  });

  it("cleanupExpiredLocks propagates database failures", async () => {
    prisma.cronLock.deleteMany.mockRejectedValueOnce(new Error("connection refused"));

    await expect(cleanupExpiredLocks()).rejects.toThrow("connection refused");
  });
});

describe("cron routes when the lock table is unusable", () => {
  it("fail the request instead of answering 200 skipped", async () => {
    process.env.CRON_SECRET = "cron-secret";
    prisma.cronLock.deleteMany.mockRejectedValueOnce(new Error("connection refused"));

    await expect(
      cashbackReconciliation({
        request: new Request("https://example.test/api/cron/cashback-reconciliation", {
          headers: { Authorization: "Bearer cron-secret" },
        }),
        params: {},
        context: {},
      }),
    ).rejects.toThrow("connection refused");
  });
});
