/**
 * Distributed Lock Service for Cron Jobs
 *
 * Prevents concurrent execution of cron jobs across multiple instances
 * (e.g., multiple Vercel regions triggering the same cron).
 *
 * Uses database unique constraint on jobName to ensure only one
 * instance can hold the lock at a time.
 *
 * NOTE: For production, enable DynamoDB locks by setting USE_DYNAMODB_LOCKS=true.
 * DynamoDB provides true atomic conditional writes without race conditions.
 * See: app/services/dynamodb-cron-lock.server.ts
 *
 * Features:
 * - Automatic expiry for crashed instances
 * - Safe cleanup of expired locks
 * - Instance tracking for debugging
 * - DynamoDB fallback for better reliability
 */

import prisma from "~/db.server";
import * as crypto from "crypto";
import { getAWSConfig } from "~/utils/aws-clients.server";

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
  } catch (error: any) {
    // Check if it's a unique constraint violation
    if (error?.code === "P2002" || error?.message?.includes("Unique constraint")) {
      // Another instance has the lock - check if it's expired
      const existingLock = await prisma.cronLock.findUnique({
        where: { jobName },
      });

      if (existingLock) {
        // If expired, try to clean it up and retry
        if (existingLock.expiresAt < now) {
          console.log(
            `[CronLock] Found expired lock for ${jobName}, attempting cleanup`
          );

          try {
            await prisma.cronLock.delete({
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
            acquiredAt: existingLock.lockedAt,
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
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const now = new Date();

  try {
    const result = await prisma.cronLock.deleteMany({
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

/**
 * Smart lock acquisition that uses DynamoDB when available
 *
 * Automatically tries DynamoDB first (if enabled), then falls back to PostgreSQL.
 * This provides the best of both worlds: DynamoDB's atomic operations when available,
 * with PostgreSQL as a reliable fallback.
 *
 * @param jobName - Unique identifier for the cron job
 * @param ttlMinutes - Time-to-live in minutes (default: 10)
 * @returns Lock result with backend information
 *
 * @example
 * const lock = await acquireCronLockSmart('tier-maintenance', 10);
 * if (!lock.acquired) return;
 * try {
 *   // ... do work ...
 * } finally {
 *   await releaseCronLockSmart(jobName, lock.lockId!, lock.backend);
 * }
 */
export async function acquireCronLockSmart(
  jobName: string,
  ttlMinutes: number = 10
): Promise<CronLockResult & { backend: "dynamodb" | "postgres" }> {
  const awsConfig = getAWSConfig();

  // Try DynamoDB first if enabled
  if (awsConfig.dynamodb.enabled) {
    try {
      const { DynamoDBCronLockService } = await import("./dynamodb-cron-lock.server");
      const dynamoLock = DynamoDBCronLockService.getInstance();

      if (dynamoLock.isEnabled()) {
        const result = await dynamoLock.acquireLock(jobName, ttlMinutes);

        if (result.acquired || result.existingLock) {
          return {
            acquired: result.acquired,
            lockId: result.lockId,
            existingLock: result.existingLock,
            backend: "dynamodb",
          };
        }

        // If there was an error (not a lock conflict), log and fall through
        if (result.error) {
          console.warn(`[CronLock] DynamoDB error, using PostgreSQL: ${result.error}`);
        }
      }
    } catch (error: any) {
      console.warn(`[CronLock] DynamoDB unavailable, using PostgreSQL: ${error.message}`);
    }
  }

  // Fallback to PostgreSQL
  const pgResult = await acquireCronLock(jobName, ttlMinutes);
  return {
    ...pgResult,
    backend: "postgres",
  };
}

/**
 * Smart lock release that uses the appropriate backend
 */
export async function releaseCronLockSmart(
  jobName: string,
  lockId: string,
  backend: "dynamodb" | "postgres"
): Promise<void> {
  if (backend === "dynamodb") {
    try {
      const { DynamoDBCronLockService } = await import("./dynamodb-cron-lock.server");
      const dynamoLock = DynamoDBCronLockService.getInstance();
      await dynamoLock.releaseLock(jobName, lockId);
      return;
    } catch (error) {
      console.warn(`[CronLock] Failed to release DynamoDB lock, trying PostgreSQL`);
    }
  }

  // PostgreSQL release
  await releaseCronLock(lockId);
}
