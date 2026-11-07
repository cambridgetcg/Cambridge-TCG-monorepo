import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { acquireCronLock, cleanupExpiredLocks, releaseCronLock, withCronLock } from "~/lib/cron.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * The cron lock on Postgres, carried from apps/rewardspro's
 * cron-lock.integration.test.ts (its five cases), plus withCronLock.
 */

describe.skipIf(!hasTestDatabase)("cron locks on Postgres", () => {
  // The test URL allows one connection per client, so Promise.all on one
  // client never races: each concurrent instance gets its own client.
  let instances: PrismaClient[] = [];

  beforeAll(() => {
    instances = Array.from({ length: 5 }, () => createPrismaClient());
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await Promise.all(instances.map((client) => client.$disconnect()));
  });

  it("acquires, blocks a second instance, and releases", async () => {
    const first = await acquireCronLock("tiers", 10);
    expect(first.acquired).toBe(true);
    expect(first.lockId).toBeTruthy();

    const second = await acquireCronLock("tiers", 10);
    expect(second.acquired).toBe(false);
    expect(second.existingLock?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await releaseCronLock(first.lockId!);
    await expect(prisma.cronLock.count()).resolves.toBe(0);

    const third = await acquireCronLock("tiers", 10);
    expect(third.acquired).toBe(true);
  });

  it("keeps locks for different jobs independent", async () => {
    const a = await acquireCronLock("tiers", 10);
    const b = await acquireCronLock("payouts", 10);
    expect([a.acquired, b.acquired]).toEqual([true, true]);
    await expect(prisma.cronLock.count()).resolves.toBe(2);
  });

  it("takes over a lock whose holder crashed after it expired", async () => {
    await prisma.cronLock.create({
      data: {
        jobName: "housekeeping",
        lockedAt: new Date(Date.now() - 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1000),
        instanceId: "crashed-instance",
      },
    });

    const lock = await acquireCronLock("housekeeping", 10);
    expect(lock.acquired).toBe(true);
    const row = await prisma.cronLock.findUniqueOrThrow({ where: { jobName: "housekeeping" } });
    expect(row.id).toBe(lock.lockId);
    expect(row.instanceId).not.toBe("crashed-instance");
  });

  it("cleans up only expired locks", async () => {
    await prisma.cronLock.createMany({
      data: [
        { jobName: "expired", expiresAt: new Date(Date.now() - 1000) },
        { jobName: "live", expiresAt: new Date(Date.now() + 60_000) },
      ],
    });

    await expect(cleanupExpiredLocks()).resolves.toBe(1);
    const remaining = await prisma.cronLock.findMany({ select: { jobName: true } });
    expect(remaining).toEqual([{ jobName: "live" }]);
  });

  it("lets exactly one of several concurrent instances acquire", async () => {
    const results = await Promise.all(instances.map((client) => acquireCronLock("payouts", 10, client)));
    expect(results.filter((r) => r.acquired)).toHaveLength(1);
    await expect(prisma.cronLock.count()).resolves.toBe(1);
  });

  describe("withCronLock", () => {
    it("runs the job under the lock, then releases it", async () => {
      const seen = await withCronLock("payouts", 15, async () => {
        const row = await prisma.cronLock.findUniqueOrThrow({ where: { jobName: "payouts" } });
        return row.expiresAt.getTime() - row.lockedAt.getTime();
      });
      expect(seen).toBe(15 * 60 * 1000);
      await expect(prisma.cronLock.count()).resolves.toBe(0);
    });

    it("answers locked, and runs nothing, while another run holds the job", async () => {
      await acquireCronLock("tiers", 30);
      const job = vi.fn(async () => "ran");
      await expect(withCronLock("tiers", 30, job)).resolves.toBe("locked");
      expect(job).not.toHaveBeenCalled();
    });

    it("releases the lock when the job throws, and passes the error on", async () => {
      await expect(
        withCronLock("housekeeping", 10, async () => {
          throw new Error("job failed");
        }),
      ).rejects.toThrow("job failed");
      await expect(prisma.cronLock.count()).resolves.toBe(0);
    });
  });
});
