/**
 * Distributed Lock Service for Cron Jobs
 *
 * Prevents concurrent execution of cron jobs across multiple instances
 * (e.g., multiple Vercel regions triggering the same cron).
 *
 * Uses database unique constraint on jobName to ensure only one
 * instance can hold the lock at a time.
 *
 * Features:
 * - Automatic expiry for crashed instances
 * - Safe cleanup of expired locks
 * - Instance tracking for debugging
 */

import db from "~/db.server";
import * as crypto from "crypto";

export interface CronLockResult {
  acquired: boolean;
  lockId?: string;
  existingLock?: {
    lockedAt: Date;
    instanceId: string | null;
    expiresAt: Date;
  };
}

/**
 * Attempt to acquire a distributed lock for a cron job
 *
 * @param jobName - Unique identifier for the cron job (e.g., "tier-maintenance")
 * @param ttlMinutes - Time-to-live in minutes before lock auto-expires (default: 10)
 * @returns Object indicating if lock was acquired, with lockId if successful
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
    const lock = await db.cronLock.create({
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
  } catch (error: any) {
    // Check if it's a unique constraint violation
    if (error?.code === "P2002" || error?.message?.includes("Unique constraint")) {
      // Another instance has the lock - check if it's expired
      const existingLock = await db.cronLock.findUnique({
        where: { jobName },
      });

      if (existingLock) {
        // If expired, try to clean it up and retry
        if (existingLock.expiresAt < now) {
          console.log(
            `[CronLock] Found expired lock for ${jobName}, attempting cleanup`
          );

          try {
            await db.cronLock.delete({
              where: { jobName },
            });

            // Retry acquisition
            return acquireCronLock(jobName, ttlMinutes);
          } catch {
            // Another instance probably cleaned it up, return not acquired
          }
        }

        console.log(
          `[CronLock] Lock for ${jobName} held by instance ${existingLock.instanceId} until ${existingLock.expiresAt.toISOString()}`
        );

        return {
          acquired: false,
          existingLock: {
            lockedAt: existingLock.lockedAt,
            instanceId: existingLock.instanceId,
            expiresAt: existingLock.expiresAt,
          },
        };
      }
    }

    // Unexpected error - log and return not acquired for safety
    console.error(`[CronLock] Unexpected error acquiring lock for ${jobName}:`, error);

    return { acquired: false };
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
    await db.cronLock.delete({
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
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const now = new Date();

  try {
    const result = await db.cronLock.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    if (result.count > 0) {
      console.log(`[CronLock] Cleaned up ${result.count} expired lock(s)`);
    }

    return result.count;
  } catch (error) {
    console.error("[CronLock] Error cleaning up expired locks:", error);
    return 0;
  }
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
    const lock = await db.cronLock.findUnique({
      where: { id: lockId },
    });

    if (!lock) {
      console.warn(`[CronLock] Cannot extend - lock ${lockId} not found`);
      return false;
    }

    const newExpiresAt = new Date(
      Date.now() + additionalMinutes * 60 * 1000
    );

    await db.cronLock.update({
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
    const lock = await db.cronLock.findUnique({
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
