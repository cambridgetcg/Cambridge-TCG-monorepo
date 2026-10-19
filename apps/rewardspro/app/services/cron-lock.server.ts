/**
 * Distributed Lock Service for Cron Jobs
 *
 * Prevents concurrent execution of cron jobs across multiple instances
 * (e.g., multiple Vercel regions triggering the same cron).
 *
 * Uses database unique constraint on jobName to ensure only one
 * instance can hold the lock at a time.
 *
 * Contention is the only "not acquired" outcome. Any other failure (database
 * unreachable, missing table) throws, so the cron route answers 5xx and the
 * outage is visible instead of being reported as a skipped run.
 *
 * Features:
 * - Automatic expiry for crashed instances
 * - Safe cleanup of expired locks
 * - Instance tracking for debugging
 */

import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import * as crypto from "node:crypto";

export interface CronLockResult {
  acquired: boolean;
  lockId?: string;
  existingLock?: {
    lockedAt: Date;
    acquiredAt: Date;
    instanceId: string | null;
    expiresAt: Date;
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Attempt to acquire a distributed lock for a cron job
 *
 * @param jobName - Unique identifier for the cron job (e.g., "tier-maintenance")
 * @param ttlMinutes - Time-to-live in minutes before lock auto-expires (default: 10)
 * @returns Object indicating if lock was acquired, with lockId if successful
 * @throws if the lock table cannot be used; never reports that as contention
 *
 * @example
 * const lock = await acquireCronLock('tier-maintenance', 10);
 * if (!lock.acquired) {
 *   console.log('Another instance is running, skipping');
 *   return;
 * }
 * try {
 *   // ... do work ...
 * } finally {
 *   await releaseCronLock(lock.lockId!);
 * }
 */
export async function acquireCronLock(
  jobName: string,
  ttlMinutes: number = 10
): Promise<CronLockResult> {
  const lockId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  // Get instance identifier (Vercel deployment ID, or fallback)
  const instanceId =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_URL ||
    `local-${process.pid}`;

  try {
    // Try to create lock record
    // If another instance has the lock, unique constraint will fail
    const lock = await prisma.cronLock.create({
      data: {
        id: lockId,
        jobName,
        lockedAt: now,
        expiresAt,
        instanceId,
      },
    });

    console.log(
      `[CronLock] Acquired lock for ${jobName} (expires: ${expiresAt.toISOString()})`
    );

    return {
      acquired: true,
      lockId: lock.id,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      console.error(`[CronLock] Unexpected error acquiring lock for ${jobName}:`, error);
      throw new Error(`[CronLock] Could not acquire lock for ${jobName}`, { cause: error });
    }

    // Another instance has the lock - check if it's expired
    const existingLock = await prisma.cronLock.findUnique({
      where: { jobName },
    });

    // Released between our insert and this read: one immediate retry
    if (!existingLock) {
      return acquireCronLock(jobName, ttlMinutes);
    }

    // If expired, delete exactly that lock and retry. Matching the id means
    // a lock another instance has just re-acquired is never removed.
    if (existingLock.expiresAt < now) {
      console.log(
        `[CronLock] Found expired lock for ${jobName}, attempting cleanup`
      );
      const removed = await prisma.cronLock.deleteMany({
        where: { id: existingLock.id },
      });
      if (removed.count === 1) {
        return acquireCronLock(jobName, ttlMinutes);
      }
    }

    console.log(
      `[CronLock] Lock for ${jobName} held by instance ${existingLock.instanceId} until ${existingLock.expiresAt.toISOString()}`
    );

    return {
      acquired: false,
      existingLock: {
        lockedAt: existingLock.lockedAt,
        acquiredAt: existingLock.lockedAt,
        instanceId: existingLock.instanceId,
        expiresAt: existingLock.expiresAt,
      },
    };
  }
}

/**
 * Release a cron job lock
 *
 * @param lockId - The lock ID returned from acquireCronLock
 *
 * Should be called in a finally block to ensure cleanup even on errors.
 */
export async function releaseCronLock(lockId: string): Promise<void> {
  try {
    await prisma.cronLock.delete({
      where: { id: lockId },
    });

    console.log(`[CronLock] Released lock ${lockId}`);
  } catch (error) {
    // Lock may have already expired and been cleaned up
    console.warn(`[CronLock] Failed to release lock ${lockId}:`, error);
  }
}

/**
 * Clean up expired locks
 *
 * Should be called at the start of cron jobs to handle crashed instances
 * that didn't release their locks.
 *
 * @returns Number of expired locks cleaned up
 * @throws if the lock table cannot be used (the cron route then answers 5xx)
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const result = await prisma.cronLock.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  if (result.count > 0) {
    console.log(`[CronLock] Cleaned up ${result.count} expired lock(s)`);
  }

  return result.count;
}

/**
 * Extend a lock's expiration time
 *
 * Useful for long-running jobs that need to extend their lock
 *
 * @param lockId - The lock ID to extend
 * @param additionalMinutes - Additional time to add (default: 10)
 * @returns true if lock was extended, false if lock doesn't exist
 */
export async function extendLock(
  lockId: string,
  additionalMinutes: number = 10
): Promise<boolean> {
  try {
    const lock = await prisma.cronLock.findUnique({
      where: { id: lockId },
    });

    if (!lock) {
      console.warn(`[CronLock] Cannot extend - lock ${lockId} not found`);
      return false;
    }

    const newExpiresAt = new Date(
      Date.now() + additionalMinutes * 60 * 1000
    );

    await prisma.cronLock.update({
      where: { id: lockId },
      data: { expiresAt: newExpiresAt },
    });

    console.log(
      `[CronLock] Extended lock ${lockId} until ${newExpiresAt.toISOString()}`
    );

    return true;
  } catch (error) {
    console.error(`[CronLock] Error extending lock ${lockId}:`, error);
    return false;
  }
}

/**
 * Get current lock status for a job
 *
 * Useful for debugging and monitoring
 *
 * @param jobName - The job name to check
 * @returns Lock info if held, null if not locked
 */
export async function getLockStatus(
  jobName: string
): Promise<{
  isLocked: boolean;
  lockedAt?: Date;
  expiresAt?: Date;
  instanceId?: string | null;
  isExpired?: boolean;
} | null> {
  try {
    const lock = await prisma.cronLock.findUnique({
      where: { jobName },
    });

    if (!lock) {
      return { isLocked: false };
    }

    const now = new Date();
    return {
      isLocked: true,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
      instanceId: lock.instanceId,
      isExpired: lock.expiresAt < now,
    };
  } catch (error) {
    console.error(`[CronLock] Error getting lock status for ${jobName}:`, error);
    return null;
  }
}
