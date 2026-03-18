/**
 * DynamoDB Distributed Lock Service for Cron Jobs
 *
 * Production-grade distributed locking using AWS DynamoDB
 *
 * Features:
 * - Atomic lock acquisition using conditional writes
 * - TTL-based automatic expiry (no stale locks)
 * - No race conditions (guaranteed by DynamoDB conditional writes)
 * - Instance tracking for debugging
 * - Lock extension for long-running jobs
 * - Graceful fallback to PostgreSQL when DynamoDB unavailable
 *
 * Table Schema:
 * - lockId (PK): String - Unique job identifier
 * - instanceId: String - Who holds the lock
 * - acquiredAt: Number - Unix timestamp when acquired
 * - expiresAt: Number - TTL attribute for auto-deletion
 * - metadata: Map - Additional context
 *
 * Why DynamoDB over PostgreSQL:
 * 1. True atomic conditional writes (no unique constraint race)
 * 2. Automatic TTL cleanup (no manual expiry checks)
 * 3. Better availability in distributed scenarios
 * 4. Lower latency for lock operations
 */

import {
  PutItemCommand,
  DeleteItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { getDynamoDBClient, getAWSConfig } from "~/utils/aws-clients.server";

/**
 * Lock acquisition result
 */
export interface DynamoDBLockResult {
  acquired: boolean;
  lockId?: string;
  existingLock?: {
    instanceId: string;
    acquiredAt: Date;
    lockedAt: Date;
    expiresAt: Date;
  };
  error?: string;
}

/**
 * Lock status information
 */
export interface DynamoDBLockStatus {
  isLocked: boolean;
  instanceId?: string;
  acquiredAt?: Date;
  expiresAt?: Date;
  isExpired?: boolean;
  remainingSeconds?: number;
}

/**
 * DynamoDB Cron Lock Service
 */
export class DynamoDBCronLockService {
  private static instance: DynamoDBCronLockService | null = null;

  private tableName: string;
  private enabled: boolean;

  private constructor() {
    const config = getAWSConfig();
    this.tableName = config.dynamodb.locksTable;
    this.enabled = config.dynamodb.enabled && !!this.tableName;

    if (this.enabled) {
      console.log(`[DynamoDB] Cron lock service initialized: ${this.tableName}`);
    } else {
      console.log("[DynamoDB] Cron lock service disabled or not configured");
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DynamoDBCronLockService {
    if (!DynamoDBCronLockService.instance) {
      DynamoDBCronLockService.instance = new DynamoDBCronLockService();
    }
    return DynamoDBCronLockService.instance;
  }

  /**
   * Check if DynamoDB locks are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Acquire a distributed lock for a cron job
   *
   * Uses DynamoDB conditional write to ensure atomic acquisition.
   * If the lock exists and hasn't expired, acquisition fails.
   *
   * @param jobName Unique identifier for the cron job
   * @param ttlMinutes Time-to-live before auto-expiry (default: 10)
   * @returns Lock result with acquisition status
   *
   * @example
   * const lock = await dynamoLock.acquireLock('tier-maintenance', 10);
   * if (!lock.acquired) {
   *   console.log('Another instance is running');
   *   return;
   * }
   * try {
   *   // ... do work ...
   * } finally {
   *   await dynamoLock.releaseLock('tier-maintenance', lock.lockId!);
   * }
   */
  async acquireLock(
    jobName: string,
    ttlMinutes: number = 10
  ): Promise<DynamoDBLockResult> {
    if (!this.enabled) {
      return { acquired: false, error: "DynamoDB locks not enabled" };
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlMinutes * 60;
    const lockId = `${jobName}-${now}-${Math.random().toString(36).substr(2, 9)}`;

    // Get instance identifier
    const instanceId =
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.VERCEL_URL ||
      `local-${process.pid}`;

    try {
      const client = getDynamoDBClient();

      // Attempt to create lock with condition that it doesn't exist
      // OR if it exists, it must be expired
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          lockId: jobName, // Use jobName as PK for uniqueness
          uniqueLockId: lockId, // Unique ID for this acquisition
          instanceId,
          acquiredAt: now,
          expiresAt, // TTL attribute - DynamoDB will auto-delete
          metadata: {
            nodeVersion: process.version,
            platform: process.platform,
          },
        }),
        // Only succeed if:
        // 1. Item doesn't exist, OR
        // 2. Item exists but is expired
        ConditionExpression:
          "attribute_not_exists(lockId) OR expiresAt < :now",
        ExpressionAttributeValues: marshall({
          ":now": now,
        }),
      });

      await client.send(command);

      console.log(
        `[DynamoDB] Acquired lock for ${jobName} ` +
          `(expires: ${new Date(expiresAt * 1000).toISOString()})`
      );

      return {
        acquired: true,
        lockId,
      };
    } catch (error: any) {
      // Check if it's a conditional check failure (lock already held)
      if (error instanceof ConditionalCheckFailedException) {
        // Get existing lock info
        const existingLock = await this.getLockStatus(jobName);

        if (existingLock?.isLocked) {
          console.log(
            `[DynamoDB] Lock for ${jobName} held by ${existingLock.instanceId} ` +
              `until ${existingLock.expiresAt?.toISOString()}`
          );

          return {
            acquired: false,
            existingLock: {
              instanceId: existingLock.instanceId || "unknown",
              acquiredAt: existingLock.acquiredAt || new Date(),
              lockedAt: existingLock.acquiredAt || new Date(),
              expiresAt: existingLock.expiresAt || new Date(),
            },
          };
        }

        // Lock might have expired between our check and put
        // Retry once
        return this.acquireLock(jobName, ttlMinutes);
      }

      console.error(
        `[DynamoDB] Unexpected error acquiring lock for ${jobName}:`,
        error
      );

      return {
        acquired: false,
        error: error.message,
      };
    }
  }

  /**
   * Release a cron job lock
   *
   * @param jobName The job name (used as primary key)
   * @param lockId The lock ID returned from acquireLock (optional, for verification)
   */
  async releaseLock(jobName: string, lockId?: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const client = getDynamoDBClient();

      const command = new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({ lockId: jobName }),
        // Optionally verify we're releasing our own lock
        ...(lockId && {
          ConditionExpression: "uniqueLockId = :lockId",
          ExpressionAttributeValues: marshall({ ":lockId": lockId }),
        }),
      });

      await client.send(command);
      console.log(`[DynamoDB] Released lock for ${jobName}`);
      return true;
    } catch (error: any) {
      // ConditionalCheckFailedException means lock was already released
      // or held by different instance
      if (error instanceof ConditionalCheckFailedException) {
        console.warn(
          `[DynamoDB] Lock ${jobName} was not held or held by different instance`
        );
        return false;
      }

      console.error(`[DynamoDB] Error releasing lock ${jobName}:`, error);
      return false;
    }
  }

  /**
   * Extend a lock's expiration time
   *
   * @param jobName The job name
   * @param additionalMinutes Additional time to add (default: 10)
   * @param lockId Optional lock ID for verification
   */
  async extendLock(
    jobName: string,
    additionalMinutes: number = 10,
    lockId?: string
  ): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const client = getDynamoDBClient();
      const newExpiresAt = Math.floor(Date.now() / 1000) + additionalMinutes * 60;

      const command = new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ lockId: jobName }),
        UpdateExpression: "SET expiresAt = :newExpiry",
        ConditionExpression: lockId
          ? "uniqueLockId = :lockId"
          : "attribute_exists(lockId)",
        ExpressionAttributeValues: marshall({
          ":newExpiry": newExpiresAt,
          ...(lockId && { ":lockId": lockId }),
        }),
      });

      await client.send(command);

      console.log(
        `[DynamoDB] Extended lock ${jobName} until ` +
          new Date(newExpiresAt * 1000).toISOString()
      );

      return true;
    } catch (error: any) {
      if (error instanceof ConditionalCheckFailedException) {
        console.warn(`[DynamoDB] Cannot extend - lock ${jobName} not found or not owned`);
        return false;
      }

      console.error(`[DynamoDB] Error extending lock ${jobName}:`, error);
      return false;
    }
  }

  /**
   * Get current lock status for a job
   */
  async getLockStatus(jobName: string): Promise<DynamoDBLockStatus | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const client = getDynamoDBClient();

      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ lockId: jobName }),
      });

      const response = await client.send(command);

      if (!response.Item) {
        return { isLocked: false };
      }

      const item = unmarshall(response.Item);
      const now = Math.floor(Date.now() / 1000);
      const isExpired = item.expiresAt < now;

      return {
        isLocked: !isExpired,
        instanceId: item.instanceId,
        acquiredAt: new Date(item.acquiredAt * 1000),
        expiresAt: new Date(item.expiresAt * 1000),
        isExpired,
        remainingSeconds: isExpired ? 0 : item.expiresAt - now,
      };
    } catch (error) {
      console.error(`[DynamoDB] Error getting lock status for ${jobName}:`, error);
      return null;
    }
  }

  /**
   * Force release all locks (admin only, use with caution)
   *
   * Note: DynamoDB TTL will auto-clean expired locks,
   * but this can force immediate cleanup
   */
  async forceReleaseLock(jobName: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const client = getDynamoDBClient();

      const command = new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({ lockId: jobName }),
        // No condition - force delete
      });

      await client.send(command);
      console.log(`[DynamoDB] Force released lock for ${jobName}`);
      return true;
    } catch (error) {
      console.error(`[DynamoDB] Error force releasing lock ${jobName}:`, error);
      return false;
    }
  }
}

/**
 * Convenience export for singleton instance
 */
export const dynamoDBCronLock = DynamoDBCronLockService.getInstance();

/**
 * Helper: Acquire lock with automatic fallback to PostgreSQL
 */
export async function acquireCronLockWithFallback(
  jobName: string,
  ttlMinutes: number = 10
): Promise<{
  acquired: boolean;
  lockId?: string;
  backend: "dynamodb" | "postgres";
  existingLock?: {
    instanceId: string | null;
    acquiredAt: Date;
    lockedAt: Date;
    expiresAt: Date;
  };
}> {
  const dynamoLock = DynamoDBCronLockService.getInstance();

  // Try DynamoDB first
  if (dynamoLock.isEnabled()) {
    const result = await dynamoLock.acquireLock(jobName, ttlMinutes);

    if (result.acquired || result.existingLock) {
      return {
        acquired: result.acquired,
        lockId: result.lockId,
        backend: "dynamodb",
        existingLock: result.existingLock,
      };
    }

    // Only fall through if there was an unexpected error
    if (result.error) {
      console.warn(
        `[CronLock] DynamoDB error, falling back to PostgreSQL: ${result.error}`
      );
    }
  }

  // Fallback to PostgreSQL
  const { acquireCronLock } = await import("./cron-lock.server");
  const pgResult = await acquireCronLock(jobName, ttlMinutes);

  return {
    acquired: pgResult.acquired,
    lockId: pgResult.lockId,
    backend: "postgres",
    existingLock: pgResult.existingLock,
  };
}

/**
 * Helper: Release lock with automatic backend detection
 */
export async function releaseCronLockWithFallback(
  jobName: string,
  lockId: string,
  backend: "dynamodb" | "postgres"
): Promise<void> {
  if (backend === "dynamodb") {
    const dynamoLock = DynamoDBCronLockService.getInstance();
    await dynamoLock.releaseLock(jobName, lockId);
  } else {
    const { releaseCronLock } = await import("./cron-lock.server");
    await releaseCronLock(lockId);
  }
}

export default DynamoDBCronLockService;
