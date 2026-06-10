/**
 * Integration Manager Service
 *
 * Central orchestration service for managing third-party integrations.
 * Handles adapter registry, event broadcasting, and integration lifecycle.
 */

import prisma from "~/db.server";
import { encrypt } from "~/utils/encryption";
import { createLogger } from "~/services/logger.server";
import type {
  Integration,
  IntegrationProvider,
  IntegrationStatus,
  LoyaltyEventType,
} from "@prisma/client";
import type { BaseIntegrationAdapter } from "./base-adapter.server";
import type { LoyaltyEvent, IntegrationConfig } from "./types";

const logger = createLogger("IntegrationManager");

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

type AdapterFactory = () => BaseIntegrationAdapter;

// Registry of adapter factories - populated by registerAdapter()
const adapterRegistry = new Map<IntegrationProvider, AdapterFactory>();

/**
 * Register an adapter for a provider
 */
export function registerAdapter(
  provider: IntegrationProvider,
  factory: AdapterFactory
): void {
  adapterRegistry.set(provider, factory);
  logger.info("Adapter registered", { provider });
}

/**
 * Get adapter for a provider
 */
export function getAdapter(provider: IntegrationProvider): BaseIntegrationAdapter {
  const factory = adapterRegistry.get(provider);

  if (!factory) {
    throw new Error(`No adapter registered for provider: ${provider}`);
  }

  return factory();
}

/**
 * Check if adapter is registered
 */
export function hasAdapter(provider: IntegrationProvider): boolean {
  return adapterRegistry.has(provider);
}

/**
 * Get all registered providers
 */
export function getRegisteredProviders(): IntegrationProvider[] {
  return Array.from(adapterRegistry.keys());
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all integrations for a shop
 */
export async function getIntegrations(shop: string): Promise<Integration[]> {
  return prisma.integration.findMany({
    where: { shop },
    orderBy: { provider: "asc" },
  });
}

/**
 * Get connected integrations for a shop
 */
export async function getConnectedIntegrations(shop: string): Promise<Integration[]> {
  return prisma.integration.findMany({
    where: {
      shop,
      status: "CONNECTED",
    },
  });
}

/**
 * Get integration by provider
 */
export async function getIntegration(
  shop: string,
  provider: IntegrationProvider
): Promise<Integration | null> {
  return prisma.integration.findUnique({
    where: {
      shop_provider: { shop, provider },
    },
  });
}

/**
 * Get integration by ID
 */
export async function getIntegrationById(id: string): Promise<Integration | null> {
  return prisma.integration.findUnique({
    where: { id },
  });
}

/**
 * Create or update integration
 */
export async function upsertIntegration(
  shop: string,
  provider: IntegrationProvider,
  data: Partial<
    Omit<Integration, "id" | "shop" | "provider" | "createdAt" | "updatedAt">
  >
): Promise<Integration> {
  // Get adapter config for defaults
  let name = provider.toString();
  if (hasAdapter(provider)) {
    const adapter = getAdapter(provider);
    name = adapter.config.name;
  }

  return prisma.integration.upsert({
    where: {
      shop_provider: { shop, provider },
    },
    create: {
      shop,
      provider,
      name: data.name || name,
      status: data.status || "DISCONNECTED",
      ...data,
    },
    update: {
      ...data,
      updatedAt: new Date(),
    },
  });
}

/**
 * Update integration status
 */
export async function updateIntegrationStatus(
  id: string,
  status: IntegrationStatus,
  error?: string
): Promise<Integration> {
  return prisma.integration.update({
    where: { id },
    data: {
      status,
      lastError: error || null,
      lastErrorAt: error ? new Date() : null,
    },
  });
}

/**
 * Store OAuth tokens for integration
 */
export async function storeOAuthTokens(
  shop: string,
  provider: IntegrationProvider,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    scopes?: string[];
  }
): Promise<Integration> {
  return upsertIntegration(shop, provider, {
    status: "CONNECTED",
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    tokenExpiresAt: tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : null,
    scopes: tokens.scopes || [],
    lastSyncAt: new Date(),
    lastError: null,
    lastErrorAt: null,
  });
}

/**
 * Store API key for integration
 */
export async function storeApiKey(
  shop: string,
  provider: IntegrationProvider,
  apiKey: string,
  webhookSecret?: string
): Promise<Integration> {
  return upsertIntegration(shop, provider, {
    status: "CONNECTED",
    apiKey: encrypt(apiKey),
    webhookSecret: webhookSecret || null,
    lastSyncAt: new Date(),
    lastError: null,
    lastErrorAt: null,
  });
}

/**
 * Disconnect integration
 */
export async function disconnectIntegration(
  shop: string,
  provider: IntegrationProvider
): Promise<void> {
  await prisma.integration.update({
    where: {
      shop_provider: { shop, provider },
    },
    data: {
      status: "DISCONNECTED",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      apiKey: null,
      apiSecret: null,
      webhookSecret: null,
      scopes: [],
      enabledFeatures: [],
    },
  });

  logger.info("Integration disconnected", { shop, provider });
}

/**
 * Update enabled features for integration
 */
export async function updateEnabledFeatures(
  shop: string,
  provider: IntegrationProvider,
  features: string[]
): Promise<Integration> {
  return prisma.integration.update({
    where: {
      shop_provider: { shop, provider },
    },
    data: {
      enabledFeatures: features,
    },
  });
}

/**
 * Test integration connection
 */
export async function testConnection(
  shop: string,
  provider: IntegrationProvider
): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
  const integration = await getIntegration(shop, provider);

  if (!integration) {
    return { success: false, message: "Integration not found" };
  }

  if (!hasAdapter(provider)) {
    return { success: false, message: "Adapter not available" };
  }

  const adapter = getAdapter(provider);
  return adapter.testConnection(integration);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT BROADCASTING
// ═══════════════════════════════════════════════════════════════════════════

// Map event types to required features
const EVENT_FEATURE_MAP: Partial<Record<LoyaltyEventType, string>> = {
  POINTS_EARNED: "sync_points",
  POINTS_REDEEMED: "sync_points",
  POINTS_EXPIRED: "sync_points",
  POINTS_ADJUSTED: "sync_points",
  TIER_UPGRADED: "sync_tiers",
  TIER_DOWNGRADED: "sync_tiers",
  TIER_PURCHASED: "sync_tiers",
  TIER_SUBSCRIPTION_CREATED: "sync_subscriptions",
  TIER_SUBSCRIPTION_CANCELLED: "sync_subscriptions",
  CUSTOMER_ENROLLED: "sync_customers",
  CUSTOMER_PROFILE_UPDATED: "sync_customers",
  REFERRAL_SENT: "sync_referrals",
  REFERRAL_COMPLETED: "sync_referrals",
};

/**
 * Broadcast loyalty event to all relevant integrations
 */
export async function broadcastEvent(
  shop: string,
  event: LoyaltyEvent
): Promise<{ queued: number; integrations: string[] }> {
  const integrations = await getConnectedIntegrations(shop);

  // Filter integrations that should receive this event
  const relevantIntegrations = integrations.filter((integration) => {
    const enabledFeatures = integration.enabledFeatures || [];
    const requiredFeature = EVENT_FEATURE_MAP[event.type];

    // If no specific feature required, send to all with event sync enabled
    if (!requiredFeature) {
      return enabledFeatures.includes("sync_events");
    }

    return enabledFeatures.includes(requiredFeature);
  });

  if (relevantIntegrations.length === 0) {
    return { queued: 0, integrations: [] };
  }

  // Queue events for delivery
  const eventPromises = relevantIntegrations.map((integration) =>
    prisma.integrationEvent.create({
      data: {
        integrationId: integration.id,
        shop,
        eventType: event.type,
        payload: event.data as object,
        customerId: event.customerId || null,
        shopifyCustomerId: event.shopifyCustomerId || null,
        orderId: event.orderId || null,
        status: "PENDING",
      },
    })
  );

  await Promise.all(eventPromises);

  logger.info("Events queued for delivery", {
    shop,
    eventType: event.type,
    integrationCount: relevantIntegrations.length,
    integrations: relevantIntegrations.map((i) => i.provider),
  });

  return {
    queued: relevantIntegrations.length,
    integrations: relevantIntegrations.map((i) => i.provider),
  };
}

/**
 * Process pending events (called by background job)
 */
export async function processEventQueue(
  batchSize: number = 100
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pendingEvents = await prisma.integrationEvent.findMany({
    where: {
      status: "PENDING",
      attempts: { lt: 3 }, // Max 3 retries
    },
    include: {
      integration: true,
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  let succeeded = 0;
  let failed = 0;

  for (const event of pendingEvents) {
    // Skip if no adapter or integration disconnected
    if (!hasAdapter(event.integration.provider)) {
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: "SKIPPED", error: "No adapter available" },
      });
      continue;
    }

    if (event.integration.status !== "CONNECTED") {
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: "SKIPPED", error: "Integration not connected" },
      });
      continue;
    }

    try {
      // Mark as processing
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: "PROCESSING",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });

      // Get adapter and send event
      const adapter = getAdapter(event.integration.provider);
      const result = await adapter.sendEvent(event.integration, {
        type: event.eventType,
        customerId: event.customerId || undefined,
        shopifyCustomerId: event.shopifyCustomerId || undefined,
        orderId: event.orderId || undefined,
        data: event.payload as Record<string, unknown>,
      });

      if (result.success) {
        await prisma.integrationEvent.update({
          where: { id: event.id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(),
          },
        });
        succeeded++;
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Determine if we should retry or fail permanently
      const shouldRetry = event.attempts < 2; // Will be 3 after this attempt

      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: shouldRetry ? "PENDING" : "FAILED",
          error: errorMessage,
        },
      });

      failed++;

      logger.error("Event delivery failed", {
        eventId: event.id,
        provider: event.integration.provider,
        attempt: event.attempts + 1,
        error: errorMessage,
        willRetry: shouldRetry,
      });
    }
  }

  if (pendingEvents.length > 0) {
    logger.info("Event queue processed", {
      processed: pendingEvents.length,
      succeeded,
      failed,
    });
  }

  return {
    processed: pendingEvents.length,
    succeeded,
    failed,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POINTS RULES MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get points rules for an integration
 */
export async function getPointsRules(
  shop: string,
  provider: IntegrationProvider
) {
  return prisma.integrationPointsRule.findMany({
    where: { shop, provider, enabled: true },
    orderBy: { triggerEvent: "asc" },
  });
}

/**
 * Create default points rules for integration
 */
export async function createDefaultPointsRules(
  shop: string,
  provider: IntegrationProvider
): Promise<void> {
  if (!hasAdapter(provider)) {
    return;
  }

  const adapter = getAdapter(provider);
  const defaultRules = adapter.config.defaultPointsRules;

  for (const rule of defaultRules) {
    await prisma.integrationPointsRule.upsert({
      where: {
        shop_provider_triggerEvent: {
          shop,
          provider,
          triggerEvent: rule.triggerEvent,
        },
      },
      create: {
        shop,
        provider,
        triggerEvent: rule.triggerEvent,
        name: rule.name,
        description: rule.description,
        pointsAmount: rule.defaultPoints,
        pointsType: "FIXED",
        conditions: rule.conditions || {},
        enabled: true,
      },
      update: {
        // Don't override existing rules
      },
    });
  }

  logger.info("Default points rules created", {
    shop,
    provider,
    ruleCount: defaultRules.length,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get integration configs for available providers
 */
export function getAvailableIntegrations(): IntegrationConfig[] {
  const configs: IntegrationConfig[] = [];

  for (const provider of getRegisteredProviders()) {
    const adapter = getAdapter(provider);
    configs.push(adapter.config);
  }

  return configs;
}

/**
 * Clean up stale OAuth states
 */
export async function cleanupStaleOAuthStates(): Promise<number> {
  const result = await prisma.oAuthState.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { used: true, createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
      ],
    },
  });

  if (result.count > 0) {
    logger.info("Cleaned up stale OAuth states", { count: result.count });
  }

  return result.count;
}

/**
 * Clean up old webhook records
 */
export async function cleanupOldWebhooks(daysToKeep: number = 7): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  const result = await prisma.integrationWebhook.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
      status: { in: ["COMPLETED", "DUPLICATE"] },
    },
  });

  if (result.count > 0) {
    logger.info("Cleaned up old webhooks", { count: result.count, daysToKeep });
  }

  return result.count;
}
