import { beforeEach, describe, expect, it } from "vitest";
import prisma from "~/db.server";
import {
  acquireCronLock,
  cleanupExpiredLocks,
  releaseCronLock,
} from "~/services/cron-lock.server";
import { hasTestDatabase, resetDatabase } from "./database";

describe.skipIf(!hasTestDatabase)("cron locks on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("acquires, blocks a second instance, and releases", async () => {
    const first = await acquireCronLock("tier-maintenance", 10);
    expect(first.acquired).toBe(true);
    expect(first.lockId).toBeTruthy();

    const second = await acquireCronLock("tier-maintenance", 10);
    expect(second.acquired).toBe(false);
    expect(second.existingLock?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await releaseCronLock(first.lockId!);
    await expect(prisma.cronLock.count()).resolves.toBe(0);

    const third = await acquireCronLock("tier-maintenance", 10);
    expect(third.acquired).toBe(true);
  });

  it("keeps locks for different jobs independent", async () => {
    const a = await acquireCronLock("raffle-auto-draw", 10);
    const b = await acquireCronLock("cashback-reconciliation", 10);
    expect([a.acquired, b.acquired]).toEqual([true, true]);
    await expect(prisma.cronLock.count()).resolves.toBe(2);
  });

  it("takes over a lock whose holder crashed after it expired", async () => {
    await prisma.cronLock.create({
      data: {
        jobName: "metrics",
        lockedAt: new Date(Date.now() - 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1000),
        instanceId: "crashed-instance",
      },
    });

    const lock = await acquireCronLock("metrics", 10);
    expect(lock.acquired).toBe(true);
    const row = await prisma.cronLock.findUniqueOrThrow({ where: { jobName: "metrics" } });
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
    const results = await Promise.all(
      Array.from({ length: 5 }, () => acquireCronLock("scheduled-campaigns", 10)),
    );
    expect(results.filter((r) => r.acquired)).toHaveLength(1);
    await expect(prisma.cronLock.count()).resolves.toBe(1);
  });
});
