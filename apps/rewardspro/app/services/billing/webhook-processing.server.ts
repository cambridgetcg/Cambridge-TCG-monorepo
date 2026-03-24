/**
 * Webhook Processing Service
 *
 * Handles webhook idempotency, ordering, and error handling.
 * Implements best practices for reliable webhook processing.
 *
 * @module webhook-processing.server
 */

import prisma from "../../db.server";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

// ============================================
// TYPES
// ============================================

export interface WebhookProcessingResult {
  shouldProcess: boolean;
  reason?: WebhookRejectionReason;
  webhookId: string;
  message: string;
}

export type WebhookRejectionReason =
  | "DUPLICATE"      // Already processed this webhook
  | "STALE"          // Out-of-order webhook (older than existing)
  | "PROCESSING"     // Currently being processed by another instance
  | "INFRASTRUCTURE_ERROR"; // Failed to check/record

export interface WebhookContext {
  webhookId: string;
  topic: string;
  shop: string;
  triggeredAt?: Date;
  updatedAt?: Date;
  payloadHash?: string;
}

// ============================================
// IDEMPOTENCY FUNCTIONS
// ============================================

/**
 * Check if webhook should be processed (idempotency check)
 *
 * Returns true if this is a new webhook that should be processed.
 * Returns false with reason if it's a duplicate or out-of-order.
 *
 * @param context - Webhook context with ID, topic, shop, and timestamps
 */
export async function checkWebhookIdempotency(
  context: WebhookContext
): Promise<WebhookProcessingResult> {
  const { webhookId, topic, shop, triggeredAt, updatedAt, payloadHash } = context;

  try {
    // 1. Check if webhook already processed
    const existing = await prisma.processedWebhook.findUnique({
      where: { id: webhookId },
    });

    if (existing) {
      // Already seen this webhook
      await logWebhookAction(context, "REJECTED_DUPLICATE", {
        existingStatus: existing.status,
        existingReceivedAt: existing.receivedAt,
      });

      return {
        shouldProcess: false,
        reason: "DUPLICATE",
        webhookId,
        message: `Webhook ${webhookId} already processed (status: ${existing.status})`,
      };
    }

    // 2. For subscription webhooks, check ordering
    if (topic === "APP_SUBSCRIPTIONS_UPDATE" && (triggeredAt || updatedAt)) {
      const incomingTimestamp = updatedAt || triggeredAt;

      const existingSubscription = await prisma.appSubscription.findUnique({
        where: { shop },
        select: { webhookTimestamp: true },
      });

      if (existingSubscription?.webhookTimestamp && incomingTimestamp) {
        if (incomingTimestamp <= existingSubscription.webhookTimestamp) {
          // This is a stale webhook - reject it
          await logWebhookAction(context, "REJECTED_STALE", {
            incomingTimestamp,
            existingTimestamp: existingSubscription.webhookTimestamp,
          });

          return {
            shouldProcess: false,
            reason: "STALE",
            webhookId,
            message: `Stale webhook rejected. Incoming: ${incomingTimestamp.toISOString()}, Existing: ${existingSubscription.webhookTimestamp.toISOString()}`,
          };
        }
      }
    }

    // 3. Mark as processing (atomic insert)
    try {
      await prisma.processedWebhook.create({
        data: {
          id: webhookId,
          topic,
          shop,
          status: "PROCESSING",
          receivedAt: new Date(),
          payloadHash,
        },
      });
    } catch (createError: any) {
      // If we get a unique constraint violation, another instance beat us
      if (createError.code === "P2002" || createError.message?.includes("unique")) {
        await logWebhookAction(context, "REJECTED_DUPLICATE", {
          reason: "Race condition - another instance processing",
        });

        return {
          shouldProcess: false,
          reason: "PROCESSING",
          webhookId,
          message: "Another instance is already processing this webhook",
        };
      }
      throw createError;
    }

    // 4. Log successful receipt
    await logWebhookAction(context, "PROCESSING", {
      triggeredAt,
      updatedAt,
    });

    return {
      shouldProcess: true,
      webhookId,
      message: "Webhook accepted for processing",
    };

  } catch (error: any) {
    console.error("[WebhookProcessing] Idempotency check failed:", error);

    // On infrastructure error, we should NOT process to be safe
    // Return 500 so Shopify will retry
    return {
      shouldProcess: false,
      reason: "INFRASTRUCTURE_ERROR",
      webhookId,
      message: `Infrastructure error: ${error.message}`,
    };
  }
}

/**
 * Mark webhook as completed successfully
 */
export async function markWebhookCompleted(webhookId: string): Promise<void> {
  try {
    await prisma.processedWebhook.update({
      where: { id: webhookId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`[WebhookProcessing] Failed to mark ${webhookId} as completed:`, error);
    // Don't throw - webhook was processed, just logging failed
  }
}

/**
 * Mark webhook as failed
 */
export async function markWebhookFailed(
  webhookId: string,
  errorMessage: string
): Promise<void> {
  try {
    await prisma.processedWebhook.update({
      where: { id: webhookId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage,
        retryCount: { increment: 1 },
      },
    });
  } catch (error) {
    console.error(`[WebhookProcessing] Failed to mark ${webhookId} as failed:`, error);
  }
}

/**
 * Remove a failed webhook record to allow retry
 */
export async function clearWebhookForRetry(webhookId: string): Promise<void> {
  try {
    await prisma.processedWebhook.delete({
      where: { id: webhookId },
    });
    console.log(`[WebhookProcessing] Cleared ${webhookId} for retry`);
  } catch (error) {
    console.error(`[WebhookProcessing] Failed to clear ${webhookId}:`, error);
  }
}

// ============================================
// AUDIT LOGGING
// ============================================

/**
 * Log webhook processing action to audit trail
 */
async function logWebhookAction(
  context: WebhookContext,
  action: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await prisma.webhookAuditLog.create({
      data: {
        id: uuidv4(),
        shop: context.shop,
        webhookId: context.webhookId,
        topic: context.topic,
        action,
        incomingTimestamp: context.updatedAt || context.triggeredAt,
        rejectionReason: action.startsWith("REJECTED_")
          ? action.replace("REJECTED_", "")
          : null,
        metadata: metadata || null,
      },
    });
  } catch (error) {
    // Don't fail webhook processing due to audit log failure
    console.error("[WebhookProcessing] Failed to write audit log:", error);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate SHA256 hash of payload for verification
 */
export function hashPayload(payload: string): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Parse timestamps from webhook payload
 */
export function extractTimestamps(
  subscription: any,
  headers: Headers
): { triggeredAt?: Date; updatedAt?: Date } {
  const result: { triggeredAt?: Date; updatedAt?: Date } = {};

  // Try to get triggered_at from header
  const triggeredAtHeader = headers.get("x-shopify-triggered-at");
  if (triggeredAtHeader) {
    const parsed = new Date(triggeredAtHeader);
    if (!isNaN(parsed.getTime())) {
      result.triggeredAt = parsed;
    }
  }

  // Try to get updated_at from subscription payload
  if (subscription?.updated_at) {
    const parsed = new Date(subscription.updated_at);
    if (!isNaN(parsed.getTime())) {
      result.updatedAt = parsed;
    }
  }

  return result;
}

/**
 * Clean up old processed webhook records (TTL: 7 days)
 */
export async function cleanupOldWebhooks(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.processedWebhook.deleteMany({
      where: {
        receivedAt: { lt: cutoff },
        status: { in: ["COMPLETED", "FAILED"] }, // Don't delete still-processing
      },
    });

    console.log(`[WebhookProcessing] Cleaned up ${result.count} old webhook records`);
    return result.count;
  } catch (error) {
    console.error("[WebhookProcessing] Cleanup failed:", error);
    return 0;
  }
}

/**
 * Get webhook processing statistics
 */
export async function getWebhookStats(shop?: string): Promise<{
  total: number;
  completed: number;
  failed: number;
  processing: number;
}> {
  const where = shop ? { shop } : {};

  try {
    const [total, completed, failed, processing] = await Promise.all([
      prisma.processedWebhook.count({ where }),
      prisma.processedWebhook.count({ where: { ...where, status: "COMPLETED" } }),
      prisma.processedWebhook.count({ where: { ...where, status: "FAILED" } }),
      prisma.processedWebhook.count({ where: { ...where, status: "PROCESSING" } }),
    ]);

    return { total, completed, failed, processing };
  } catch (error) {
    console.error("[WebhookProcessing] Failed to get stats:", error);
    return { total: 0, completed: 0, failed: 0, processing: 0 };
  }
}
