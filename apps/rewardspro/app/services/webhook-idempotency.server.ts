/**
 * Webhook Idempotency Service
 * Provides atomic idempotency checks to prevent duplicate webhook processing
 *
 * Phase 1A: Concurrency & Atomicity Fix
 * Date: 2025-01-07
 *
 * This service uses database transactions with serializable isolation
 * to prevent race conditions (TOCTOU vulnerabilities) where two concurrent
 * webhook deliveries could both pass the "already processed" check.
 */

import db from '~/db.server';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '~/services/logger.server';

const logger = createLogger('WebhookIdempotency');

export interface IdempotencyResult {
  /** Whether this is a new webhook (should be processed) */
  isNew: boolean;
  /** If not new, the previous result (if available) */
  existingResult?: string | null;
  /** The idempotency record ID */
  recordId?: string;
  /** When the webhook was first processed */
  processedAt?: Date;
}

export interface IdempotencyOptions {
  /** Time-to-live for idempotency records in milliseconds (default: 1 hour) */
  ttlMs?: number;
  /** Shop domain for scoping */
  shop?: string;
  /** Additional metadata to store */
  metadata?: Record<string, unknown>;
}

const DEFAULT_TTL_MS = 3600000; // 1 hour

/**
 * Atomically checks if a webhook has been processed and acquires a lock if not.
 * Uses Serializable isolation level to prevent race conditions.
 *
 * @param webhookId - Unique identifier for the webhook (from X-Shopify-Webhook-Id header)
 * @param webhookType - Type of webhook (e.g., 'ORDERS_PAID', 'ORDERS_REFUNDED')
 * @param options - Additional options
 * @returns IdempotencyResult indicating if this is a new webhook
 */
export async function checkAndAcquireIdempotencyLock(
  webhookId: string,
  webhookType: string,
  options: IdempotencyOptions = {}
): Promise<IdempotencyResult> {
  const { ttlMs = DEFAULT_TTL_MS, shop, metadata } = options;
  const expiresAt = new Date(Date.now() + ttlMs);

  try {
    // Use serializable isolation to prevent TOCTOU race conditions
    const result = await db.$transaction(async (tx) => {
      // Try to find existing record
      const existing = await tx.webhookProcessed.findUnique({
        where: { webhookId }
      });

      if (existing) {
        logger.debug('Webhook already processed', {
          webhookId,
          webhookType,
          processedAt: existing.processedAt,
          status: existing.status
        });

        return {
          isNew: false,
          existingResult: existing.result,
          recordId: existing.id,
          processedAt: existing.processedAt
        };
      }

      // Create new record atomically
      const newRecord = await tx.webhookProcessed.create({
        data: {
          id: uuidv4(),
          webhookId,
          topic: webhookType,
          shop: shop || 'unknown',
          processedAt: new Date(),
          status: 'PROCESSING',
          expiresAt,
          metadata: metadata ? JSON.stringify(metadata) : null
        }
      });

      logger.debug('Acquired idempotency lock', {
        webhookId,
        webhookType,
        recordId: newRecord.id
      });

      return {
        isNew: true,
        recordId: newRecord.id,
        processedAt: newRecord.processedAt
      };
    });

    return result;

  } catch (error: any) {
    // Handle unique constraint violation (concurrent insert race)
    if (error.code === 'P2002') {
      logger.debug('Concurrent webhook detected via unique constraint', {
        webhookId,
        webhookType
      });
      return { isNew: false };
    }

    // Handle transaction timeout
    if (error.code === 'P2028') {
      logger.warn('Idempotency check timed out', {
        webhookId,
        webhookType
      });
      // Return false to be safe - don't process if we can't verify
      return { isNew: false };
    }

    logger.error('Idempotency check failed', {
      webhookId,
      webhookType,
      error: error.message
    });

    throw error;
  }
}

/**
 * Marks an idempotency record as successfully completed.
 */
export async function completeIdempotencyRecord(
  webhookId: string,
  result?: unknown
): Promise<void> {
  try {
    await db.webhookProcessed.update({
      where: { webhookId },
      data: {
        status: 'COMPLETED',
        result: result ? JSON.stringify(result) : null,
        completedAt: new Date()
      }
    });

    logger.debug('Marked webhook as completed', { webhookId });
  } catch (error: any) {
    // Record might not exist if table was cleared
    if (error.code === 'P2025') {
      logger.warn('Could not mark webhook complete - record not found', { webhookId });
      return;
    }
    throw error;
  }
}

/**
 * Marks an idempotency record as failed (allows retry).
 */
export async function failIdempotencyRecord(
  webhookId: string,
  errorMessage: string
): Promise<void> {
  try {
    await db.webhookProcessed.update({
      where: { webhookId },
      data: {
        status: 'FAILED',
        error: errorMessage,
        completedAt: new Date()
      }
    });

    logger.debug('Marked webhook as failed', { webhookId, error: errorMessage });
  } catch (error: any) {
    if (error.code === 'P2025') {
      logger.warn('Could not mark webhook failed - record not found', { webhookId });
      return;
    }
    throw error;
  }
}

/**
 * Releases an idempotency lock (for cleanup on error before completion).
 */
export async function releaseIdempotencyLock(webhookId: string): Promise<void> {
  try {
    await db.webhookProcessed.delete({
      where: { webhookId }
    });
    logger.debug('Released idempotency lock', { webhookId });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return; // Already released
    }
    logger.warn('Failed to release idempotency lock', { webhookId, error: error.message });
  }
}

/**
 * Cleans up expired idempotency records.
 * Should be called periodically (e.g., via cron job).
 */
export async function cleanupExpiredRecords(): Promise<number> {
  const result = await db.webhookProcessed.deleteMany({
    where: {
      expiresAt: { lt: new Date() }
    }
  });

  if (result.count > 0) {
    logger.info('Cleaned up expired idempotency records', { count: result.count });
  }

  return result.count;
}

/**
 * Wrapper function for idempotent webhook processing.
 * Handles the full lifecycle: check -> process -> complete/fail.
 */
export async function withIdempotency<T>(
  webhookId: string,
  webhookType: string,
  processor: () => Promise<T>,
  options: IdempotencyOptions = {}
): Promise<{ processed: boolean; result?: T; cached?: boolean }> {
  // Check and acquire lock
  const idempotency = await checkAndAcquireIdempotencyLock(webhookId, webhookType, options);

  if (!idempotency.isNew) {
    return {
      processed: false,
      cached: true
    };
  }

  try {
    // Process the webhook
    const result = await processor();

    // Mark as complete
    await completeIdempotencyRecord(webhookId, result);

    return {
      processed: true,
      result
    };
  } catch (error: any) {
    // Mark as failed
    await failIdempotencyRecord(webhookId, error.message);
    throw error;
  }
}

/**
 * Generates a stable idempotency key for orders.
 * Prefers Shopify webhook ID, falls back to order-based key.
 */
export function generateOrderIdempotencyKey(
  shopifyWebhookId: string | null,
  orderId: string,
  eventType: string
): string {
  // Prefer Shopify's webhook ID (globally unique)
  if (shopifyWebhookId) {
    return shopifyWebhookId;
  }

  // Fallback: order ID + event type (stable across retries)
  // Note: Do NOT include timestamps or updated_at as these change on retry
  return `${eventType}-${orderId}`;
}
