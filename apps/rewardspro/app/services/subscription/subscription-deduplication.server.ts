/**
 * Subscription Deduplication Layer
 *
 * Prevents concurrent processing of the same subscription operation.
 * Uses database-based locking for distributed environments.
 *
 * Part of Neural Network Optimization - Webhook Deduplication
 */

import { db } from '~/db.server';
import { randomUUID } from 'crypto';
import { subscriptionLogger } from './subscription-correlation.server';
import { SUBSCRIPTION_NEURAL_CONFIG } from './subscription-neural-config.server';

// ============================================================================
// LOCK TYPES
// ============================================================================

export interface ProcessingLock {
  id: string;
  key: string;
  operation: string;
  acquiredAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

export interface LockResult {
  acquired: boolean;
  lock?: ProcessingLock;
  existingLock?: ProcessingLock;
}

// ============================================================================
// DATABASE-BASED DISTRIBUTED LOCK
// ============================================================================

/**
 * Acquire a processing lock for a subscription operation
 *
 * This uses the database as a distributed lock manager.
 * We use a dedicated table to track locks with automatic expiration.
 */
export async function acquireProcessingLock(
  key: string,
  operation: string,
  metadata?: Record<string, unknown>
): Promise<LockResult> {
  const ttlMs = SUBSCRIPTION_NEURAL_CONFIG.idempotency.lockTtlMs;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const lockId = randomUUID();

  try {
    // Try to create lock or check if existing lock is expired
    // Use a transaction to ensure atomicity
    const result = await db.$transaction(async (tx) => {
      // Check for existing non-expired lock
      const existing = await tx.subscriptionProcessingLock.findUnique({
        where: { lockKey: key },
      });

      if (existing) {
        // Check if lock has expired
        if (existing.expiresAt > now) {
          // Lock is still active
          return {
            acquired: false,
            existingLock: {
              id: existing.id,
              key: existing.lockKey,
              operation: existing.operation,
              acquiredAt: existing.acquiredAt,
              expiresAt: existing.expiresAt,
              metadata: existing.metadata as Record<string, unknown> | undefined,
            },
          };
        }

        // Lock expired - delete and reacquire
        await tx.subscriptionProcessingLock.delete({
          where: { lockKey: key },
        });
      }

      // Create new lock
      const newLock = await tx.subscriptionProcessingLock.create({
        data: {
          id: lockId,
          lockKey: key,
          operation,
          acquiredAt: now,
          expiresAt,
          metadata: metadata || {},
        },
      });

      return {
        acquired: true,
        lock: {
          id: newLock.id,
          key: newLock.lockKey,
          operation: newLock.operation,
          acquiredAt: newLock.acquiredAt,
          expiresAt: newLock.expiresAt,
          metadata: newLock.metadata as Record<string, unknown> | undefined,
        },
      };
    });

    if (result.acquired) {
      subscriptionLogger.debug('Lock acquired', { key, operation, lockId });
    } else {
      subscriptionLogger.debug('Lock already held', { key, operation, existingLockId: result.existingLock?.id });
    }

    return result;
  } catch (error) {
    // Handle unique constraint violation (race condition - another process got the lock)
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      subscriptionLogger.debug('Lock contention - another process acquired lock', { key, operation });
      return { acquired: false };
    }

    subscriptionLogger.error('Failed to acquire lock', error);
    throw error;
  }
}

/**
 * Release a processing lock
 */
export async function releaseProcessingLock(lockId: string): Promise<boolean> {
  try {
    await db.subscriptionProcessingLock.delete({
      where: { id: lockId },
    });
    subscriptionLogger.debug('Lock released', { lockId });
    return true;
  } catch (error) {
    // Lock may have already expired and been cleaned up
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      subscriptionLogger.debug('Lock already released/expired', { lockId });
      return true;
    }
    subscriptionLogger.error('Failed to release lock', error);
    return false;
  }
}

/**
 * Clean up expired locks (run periodically)
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const result = await db.subscriptionProcessingLock.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  if (result.count > 0) {
    subscriptionLogger.info('Cleaned up expired locks', { count: result.count });
  }

  return result.count;
}

// ============================================================================
// IDEMPOTENCY HELPERS
// ============================================================================

/**
 * Generate idempotency key for webhook events
 */
export function generateWebhookIdempotencyKey(
  topic: string,
  contractId: string,
  eventId?: string
): string {
  const parts = [topic, contractId];
  if (eventId) parts.push(eventId);
  return parts.join(':');
}

/**
 * Generate idempotency key for billing events
 */
export function generateBillingIdempotencyKey(
  contractId: string,
  billingAttemptId: string,
  billingDate: string
): string {
  return `billing:${contractId}:${billingAttemptId}:${billingDate}`;
}

/**
 * Check if an operation was already processed (via metadata)
 */
export async function wasOperationProcessed(
  shop: string,
  idempotencyKey: string
): Promise<boolean> {
  // Check subscription metadata for idempotency key
  const existing = await db.tierSubscription.findFirst({
    where: {
      shop,
      metadata: {
        path: ['processedOperations'],
        array_contains: idempotencyKey,
      },
    },
  });

  return !!existing;
}

/**
 * Mark operation as processed
 */
export async function markOperationProcessed(
  subscriptionId: string,
  idempotencyKey: string
): Promise<void> {
  const subscription = await db.tierSubscription.findUnique({
    where: { id: subscriptionId },
    select: { metadata: true },
  });

  const metadata = (subscription?.metadata as Record<string, unknown>) || {};
  const processedOperations = (metadata.processedOperations as string[]) || [];

  // Keep only last 100 operations to prevent unbounded growth
  const updatedOperations = [...processedOperations, idempotencyKey].slice(-100);

  await db.tierSubscription.update({
    where: { id: subscriptionId },
    data: {
      metadata: {
        ...metadata,
        processedOperations: updatedOperations,
      },
    },
  });
}

// ============================================================================
// HIGH-LEVEL WRAPPER
// ============================================================================

/**
 * Execute an operation with deduplication lock
 *
 * This is the main entry point for protected operations.
 * It handles lock acquisition, execution, and cleanup.
 */
export async function withDeduplicationLock<T>(
  key: string,
  operation: string,
  fn: () => Promise<T>,
  options?: {
    onLockFailed?: () => T | Promise<T>;
    metadata?: Record<string, unknown>;
    maxRetries?: number;
    retryDelayMs?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? SUBSCRIPTION_NEURAL_CONFIG.idempotency.maxRetries;
  const retryDelayMs = options?.retryDelayMs ?? SUBSCRIPTION_NEURAL_CONFIG.idempotency.retryDelayMs;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const lockResult = await acquireProcessingLock(key, operation, options?.metadata);

    if (lockResult.acquired && lockResult.lock) {
      try {
        const result = await fn();
        return result;
      } finally {
        await releaseProcessingLock(lockResult.lock.id);
      }
    }

    // Lock not acquired
    if (options?.onLockFailed && attempt === maxRetries) {
      return options.onLockFailed();
    }

    if (attempt < maxRetries) {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }

  // All retries exhausted
  if (options?.onLockFailed) {
    return options.onLockFailed();
  }

  throw new Error(`Failed to acquire lock for ${operation} after ${maxRetries} retries`);
}

/**
 * Wrapper specifically for webhook handlers
 */
export async function withWebhookDeduplication<T>(
  shop: string,
  topic: string,
  contractId: string,
  handler: () => Promise<T>,
  options?: {
    eventId?: string;
    onDuplicate?: () => T;
  }
): Promise<T> {
  if (!SUBSCRIPTION_NEURAL_CONFIG.features.enableDeduplicationLocks) {
    // Feature disabled - run without locking
    return handler();
  }

  const key = generateWebhookIdempotencyKey(topic, contractId, options?.eventId);

  return withDeduplicationLock(
    key,
    `webhook:${topic}`,
    handler,
    {
      onLockFailed: options?.onDuplicate,
      metadata: { shop, topic, contractId },
    }
  );
}
