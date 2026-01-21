/**
 * Webhook Handler Service
 *
 * Handles incoming webhooks from third-party integrations.
 * Provides signature verification, idempotency, and event processing.
 */

import { createHash } from "crypto";
import db from "~/db.server";
import { createLogger } from "~/services/logger.server";
import {
  getAdapter,
  hasAdapter,
  getIntegration,
  getPointsRules,
} from "./integration-manager.server";
import type { IntegrationProvider, IntegrationWebhookStatus } from "@prisma/client";
import type { WebhookProcessingResult } from "./types";

const logger = createLogger("WebhookHandler");

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WebhookRequest {
  provider: IntegrationProvider;
  topic: string;
  payload: string;
  signature: string;
  headers: Record<string, string>;
}

export interface WebhookResponse {
  success: boolean;
  status: IntegrationWebhookStatus;
  webhookId?: string;
  error?: string;
  pointsAwarded?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// IDEMPOTENCY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate webhook ID for idempotency
 */
function generateWebhookId(
  provider: IntegrationProvider,
  topic: string,
  payload: string
): string {
  // Create a hash of provider + topic + payload for idempotency
  const content = `${provider}:${topic}:${payload}`;
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Check if webhook has already been processed
 */
async function checkIdempotency(
  shop: string,
  webhookId: string
): Promise<boolean> {
  const existing = await db.integrationWebhook.findFirst({
    where: {
      shop,
      webhookId,
      status: { in: ["COMPLETED", "PROCESSING"] },
    },
    select: { id: true },
  });

  return !!existing;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process an incoming webhook
 */
export async function processWebhook(
  shop: string,
  request: WebhookRequest
): Promise<WebhookResponse> {
  const { provider, topic, payload, signature, headers } = request;
  const startTime = Date.now();

  // Generate webhook ID for idempotency
  const webhookId = generateWebhookId(provider, topic, payload);

  // Check for duplicate
  const isDuplicate = await checkIdempotency(shop, webhookId);
  if (isDuplicate) {
    logger.debug("Duplicate webhook detected", {
      shop,
      provider,
      topic,
      webhookId: webhookId.slice(0, 16) + "...",
    });

    return {
      success: true,
      status: "DUPLICATE",
    };
  }

  // Get integration
  const integration = await getIntegration(shop, provider);
  if (!integration) {
    logger.warn("Integration not found for webhook", { shop, provider });
    return {
      success: false,
      status: "FAILED",
      error: "Integration not found",
    };
  }

  if (integration.status !== "CONNECTED") {
    logger.warn("Integration not connected for webhook", {
      shop,
      provider,
      status: integration.status,
    });
    return {
      success: false,
      status: "FAILED",
      error: "Integration not connected",
    };
  }

  // Check adapter exists
  if (!hasAdapter(provider)) {
    logger.error("No adapter for webhook provider", { provider });
    return {
      success: false,
      status: "FAILED",
      error: "Adapter not available",
    };
  }

  const adapter = getAdapter(provider);

  // Create webhook record (RECEIVED status)
  const webhookRecord = await db.integrationWebhook.create({
    data: {
      integrationId: integration.id,
      shop,
      webhookId,
      topic,
      payload: JSON.parse(payload),
      headers,
      status: "RECEIVED",
    },
  });

  try {
    // Verify signature
    const webhookSecret = integration.webhookSecret;
    if (!webhookSecret) {
      throw new Error("Webhook secret not configured");
    }

    const isValid = adapter.verifyWebhookSignature(payload, signature, webhookSecret);
    if (!isValid) {
      throw new Error("Invalid webhook signature");
    }

    // Update status to PROCESSING
    await db.integrationWebhook.update({
      where: { id: webhookRecord.id },
      data: { status: "PROCESSING" },
    });

    // Parse payload
    const parsedPayload = JSON.parse(payload) as Record<string, unknown>;

    // Process webhook through adapter
    const result = await adapter.processWebhook(topic, parsedPayload);

    let pointsAwarded = 0;

    // Award points if applicable
    if (result.shouldAwardPoints && result.pointsContext) {
      pointsAwarded = await awardWebhookPoints(
        shop,
        provider,
        result,
        webhookRecord.id
      );
    }

    const processingTime = Date.now() - startTime;

    // Update webhook record as completed
    await db.integrationWebhook.update({
      where: { id: webhookRecord.id },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
        pointsAwarded,
        actionsTaken: [
          {
            action: result.action,
            data: result.data,
            processingTimeMs: processingTime,
          },
        ],
      },
    });

    logger.info("Webhook processed successfully", {
      shop,
      provider,
      topic,
      webhookId: webhookRecord.id,
      processingTimeMs: processingTime,
      pointsAwarded,
    });

    return {
      success: true,
      status: "COMPLETED",
      webhookId: webhookRecord.id,
      pointsAwarded,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update webhook record as failed
    await db.integrationWebhook.update({
      where: { id: webhookRecord.id },
      data: {
        status: "FAILED",
        error: errorMessage,
        processedAt: new Date(),
      },
    });

    logger.error("Webhook processing failed", {
      shop,
      provider,
      topic,
      webhookId: webhookRecord.id,
      error: errorMessage,
    });

    return {
      success: false,
      status: "FAILED",
      webhookId: webhookRecord.id,
      error: errorMessage,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POINTS AWARDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Award points based on webhook result and configured rules
 */
async function awardWebhookPoints(
  shop: string,
  provider: IntegrationProvider,
  result: WebhookProcessingResult,
  webhookId: string
): Promise<number> {
  if (!result.pointsContext) {
    return 0;
  }

  // Find customer by email or Shopify ID
  let customer = null;

  if (result.shopifyCustomerId) {
    customer = await db.customer.findUnique({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId: result.shopifyCustomerId,
        },
      },
    });
  }

  if (!customer && result.customerEmail) {
    customer = await db.customer.findUnique({
      where: {
        shop_email: {
          shop,
          email: result.customerEmail.toLowerCase(),
        },
      },
    });
  }

  if (!customer) {
    logger.debug("Customer not found for points award", {
      shop,
      email: result.customerEmail,
      shopifyCustomerId: result.shopifyCustomerId,
    });
    return 0;
  }

  // Get points rules for this integration
  const pointsRules = await getPointsRules(shop, provider);

  // Find applicable rule for this action
  const applicableRule = pointsRules.find(
    (rule) => rule.triggerEvent === result.action
  );

  if (!applicableRule) {
    logger.debug("No points rule for action", {
      shop,
      provider,
      action: result.action,
    });
    return 0;
  }

  // Calculate points using adapter
  const adapter = getAdapter(provider);
  const points = adapter.calculatePoints(result.pointsContext, [
    {
      triggerEvent: applicableRule.triggerEvent,
      pointsAmount: applicableRule.pointsAmount,
      pointsType: applicableRule.pointsType,
      pointsPercent: applicableRule.pointsPercent || undefined,
      maxPoints: applicableRule.maxPoints || undefined,
      conditions: applicableRule.conditions as Record<string, unknown>,
    },
  ]);

  if (points <= 0) {
    return 0;
  }

  // Get current balance
  const currentBalance = Number(customer.pointsBalance);
  const newBalance = currentBalance + points;

  // Award points to customer
  await db.customer.update({
    where: { id: customer.id },
    data: {
      lifetimePoints: { increment: points },
      pointsBalance: newBalance,
    },
  });

  // Create points ledger entry
  await db.pointsLedger.create({
    data: {
      shop,
      customerId: customer.id,
      type: "ORDER_EARNED", // Points earned from integration webhook
      amount: points,
      balance: newBalance,
      description: `${provider} - ${result.action}`,
      metadata: {
        provider,
        action: result.action,
        webhookId,
        data: result.data,
      },
    },
  });

  logger.info("Points awarded from webhook", {
    shop,
    customerId: customer.id,
    points,
    provider,
    action: result.action,
  });

  return points;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get webhook history for a shop/integration
 */
export async function getWebhookHistory(
  shop: string,
  options?: {
    provider?: IntegrationProvider;
    status?: IntegrationWebhookStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{
  webhooks: Array<{
    id: string;
    topic: string;
    status: IntegrationWebhookStatus;
    createdAt: Date;
    processedAt: Date | null;
    pointsAwarded: number | null;
    error: string | null;
  }>;
  total: number;
}> {
  const { provider, status, limit = 50, offset = 0 } = options || {};

  const where = {
    shop,
    ...(provider && { integration: { provider } }),
    ...(status && { status }),
  };

  const [webhooks, total] = await Promise.all([
    db.integrationWebhook.findMany({
      where,
      select: {
        id: true,
        topic: true,
        status: true,
        createdAt: true,
        processedAt: true,
        pointsAwarded: true,
        error: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.integrationWebhook.count({ where }),
  ]);

  return { webhooks, total };
}

/**
 * Retry a failed webhook
 */
export async function retryWebhook(webhookId: string): Promise<WebhookResponse> {
  const webhook = await db.integrationWebhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    return {
      success: false,
      status: "FAILED",
      error: "Webhook not found",
    };
  }

  // Fetch the integration separately
  const integration = await db.integration.findUnique({
    where: { id: webhook.integrationId },
  });

  if (!integration) {
    return {
      success: false,
      status: "FAILED",
      error: "Integration not found",
    };
  }

  if (webhook.status !== "FAILED") {
    return {
      success: false,
      status: webhook.status,
      error: "Only failed webhooks can be retried",
    };
  }

  // Reset the webhook for reprocessing
  await db.integrationWebhook.update({
    where: { id: webhookId },
    data: {
      status: "RECEIVED",
      error: null,
    },
  });

  // Reprocess using stored headers
  const storedHeaders = (webhook.headers as Record<string, string>) || {};

  return processWebhook(webhook.shop, {
    provider: integration.provider,
    topic: webhook.topic,
    payload: JSON.stringify(webhook.payload),
    signature: extractSignature(storedHeaders, integration.provider) || "",
    headers: storedHeaders,
  });
}

/**
 * Get webhook statistics
 */
export async function getWebhookStats(
  shop: string,
  provider?: IntegrationProvider
): Promise<{
  total: number;
  completed: number;
  failed: number;
  received: number;
  duplicate: number;
  totalPointsAwarded: number;
}> {
  const where = {
    shop,
    ...(provider && { integration: { provider } }),
  };

  const stats = await db.integrationWebhook.aggregate({
    where,
    _count: { id: true },
    _sum: { pointsAwarded: true },
  });

  const [completed, failed, received, duplicate] = await Promise.all([
    db.integrationWebhook.count({ where: { ...where, status: "COMPLETED" } }),
    db.integrationWebhook.count({ where: { ...where, status: "FAILED" } }),
    db.integrationWebhook.count({ where: { ...where, status: "RECEIVED" } }),
    db.integrationWebhook.count({ where: { ...where, status: "DUPLICATE" } }),
  ]);

  return {
    total: stats._count.id,
    completed,
    failed,
    received,
    duplicate,
    totalPointsAwarded: stats._sum.pointsAwarded || 0,
  };
}

/**
 * Clean up old processed webhooks
 */
export async function cleanupOldWebhooks(daysToKeep: number = 7): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  const result = await db.integrationWebhook.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
      status: { in: ["COMPLETED", "DUPLICATE"] },
    },
  });

  if (result.count > 0) {
    logger.info("Old webhooks cleaned up", {
      count: result.count,
      daysToKeep,
    });
  }

  return result.count;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract signature from headers based on provider configuration
 */
export function extractSignature(
  headers: Record<string, string>,
  provider: IntegrationProvider
): string | null {
  if (!hasAdapter(provider)) {
    return null;
  }

  const adapter = getAdapter(provider);
  const signatureHeader = adapter.config.webhooks?.signatureHeader;

  if (!signatureHeader) {
    return null;
  }

  // Headers are case-insensitive, try multiple formats
  const headerName = signatureHeader.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === headerName) {
      return value;
    }
  }

  return null;
}

/**
 * Get expected signature header name for a provider
 */
export function getSignatureHeaderName(provider: IntegrationProvider): string | null {
  if (!hasAdapter(provider)) {
    return null;
  }

  const adapter = getAdapter(provider);
  return adapter.config.webhooks?.signatureHeader || null;
}
