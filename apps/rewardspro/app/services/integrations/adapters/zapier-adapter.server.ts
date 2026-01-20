/**
 * Zapier Integration Adapter
 *
 * Handles integration with Zapier for workflow automation.
 * Supports outbound webhooks (triggers) and inbound actions.
 *
 * Zapier works differently from other integrations:
 * - Triggers: We send webhooks to user-configured Zap URLs
 * - Actions: Zapier calls our API endpoints to perform actions
 *
 * Authentication: API Key based (per shop)
 */

import { createHmac, randomBytes } from "crypto";
import { ApiKeyIntegrationAdapter } from "../base-adapter.server";
import { registerAdapter } from "../integration-manager.server";
import type { Integration } from "@prisma/client";
import type {
  IntegrationConfig,
  OAuthAuthorizationResult,
  OAuthTokens,
  WebhookProcessingResult,
  EventDeliveryResult,
  ConnectionTestResult,
  LoyaltyEvent,
} from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const ZAPIER_CONFIG: IntegrationConfig = {
  provider: "ZAPIER",
  name: "Zapier",
  description: "Connect RewardsPro to 5,000+ apps with Zapier automation",
  icon: "zapier",
  docsUrl: "https://zapier.com/apps/rewardspro/integrations",

  authType: "api_key",

  api: {
    baseUrl: "", // Zapier uses dynamic webhook URLs
    rateLimit: {
      requests: 100,
      windowMs: 60000, // 100 requests per minute
    },
  },

  webhooks: {
    supportedTopics: [], // Inbound webhooks not used (actions use REST API)
    signatureHeader: "X-RewardsPro-Signature",
    signatureAlgorithm: "hmac-sha256",
  },

  features: [
    // Triggers (outbound)
    {
      id: "trigger_tier_changed",
      name: "Tier Changed Trigger",
      description: "Triggers when a customer's tier changes",
      category: "automation",
    },
    {
      id: "trigger_points_earned",
      name: "Points Earned Trigger",
      description: "Triggers when a customer earns points",
      category: "automation",
    },
    {
      id: "trigger_points_redeemed",
      name: "Points Redeemed Trigger",
      description: "Triggers when a customer redeems points",
      category: "automation",
    },
    {
      id: "trigger_cashback_earned",
      name: "Cashback Earned Trigger",
      description: "Triggers when a customer earns cashback",
      category: "automation",
    },
    {
      id: "trigger_raffle_winner",
      name: "Raffle Winner Trigger",
      description: "Triggers when a raffle winner is selected",
      category: "automation",
    },
    // Actions (inbound)
    {
      id: "action_award_points",
      name: "Award Points Action",
      description: "Award points to a customer via Zapier",
      category: "rewards",
    },
    {
      id: "action_adjust_tier",
      name: "Adjust Tier Action",
      description: "Change a customer's tier via Zapier",
      category: "rewards",
    },
    {
      id: "action_lookup_customer",
      name: "Lookup Customer Action",
      description: "Find customer loyalty data via Zapier",
      category: "data",
    },
  ],

  defaultPointsRules: [], // Zapier doesn't award points by default
};

// ═══════════════════════════════════════════════════════════════════════════
// ZAPIER WEBHOOK TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ZapierWebhookPayload<T = unknown> {
  event: string;
  timestamp: string;
  shop: string;
  signature: string;
  data: T;
}

export interface ZapierTriggerSubscription {
  id: string;
  event: string;
  targetUrl: string;
  createdAt: string;
  enabled: boolean;
}

export interface ZapierActionRequest<T = unknown> {
  shop: string;
  api_key: string;
  data: T;
}

export interface ZapierActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Event-specific payload types
export interface TierChangedPayload {
  customer_id: string;
  customer_email: string;
  previous_tier: string | null;
  new_tier: string;
  tier_id: string;
  change_type: "upgrade" | "downgrade" | "initial";
}

export interface PointsEarnedPayload {
  customer_id: string;
  customer_email: string;
  points: number;
  reason: string;
  new_balance: number;
  order_id?: string;
}

export interface CashbackEarnedPayload {
  customer_id: string;
  customer_email: string;
  amount: number;
  currency: string;
  order_id: string;
  order_value: number;
  cashback_rate: number;
}

export interface RaffleWinnerPayload {
  customer_id: string;
  customer_email: string;
  raffle_id: string;
  raffle_name: string;
  prize_name: string;
  prize_value?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ZAPIER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

class ZapierAdapter extends ApiKeyIntegrationAdapter {
  constructor() {
    super(ZAPIER_CONFIG);
  }

  /**
   * Verify webhook signature (not used for Zapier inbound - we use API keys)
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Zapier uses API key auth, not webhook signatures
    return this.verifyHmacSha256(payload, signature, secret);
  }

  /**
   * Process incoming webhook (not used - Zapier uses REST actions)
   */
  async processWebhook(
    topic: string,
    payload: Record<string, unknown>
  ): Promise<WebhookProcessingResult> {
    // Zapier doesn't send us webhooks, we send webhooks to Zapier
    return {
      action: "ignored",
      data: payload,
      shouldAwardPoints: false,
    };
  }

  /**
   * Send loyalty event to all subscribed Zapier webhooks
   */
  async sendEvent(
    integration: Integration,
    event: LoyaltyEvent
  ): Promise<EventDeliveryResult> {
    // Get webhook subscriptions from integration config
    const subscriptions = this.getWebhookSubscriptions(integration);
    const eventName = this.mapEventToZapierTrigger(event.type);

    // Find subscriptions for this event type
    const matchingSubscriptions = subscriptions.filter(
      (sub) => sub.event === eventName && sub.enabled
    );

    if (matchingSubscriptions.length === 0) {
      this.logger.debug("No Zapier subscriptions for event", {
        shop: integration.shop,
        eventType: event.type,
      });
      return { success: true, externalId: "no_subscribers" };
    }

    // Build webhook payload
    const webhookSecret = integration.webhookSecret || "";
    const payload = this.buildWebhookPayload(integration.shop, event, webhookSecret);

    // Send to all matching webhooks
    const results = await Promise.allSettled(
      matchingSubscriptions.map((sub) =>
        this.sendWebhookToUrl(sub.targetUrl, payload, sub.id)
      )
    );

    // Check results
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      this.logger.warn("Some Zapier webhooks failed", {
        shop: integration.shop,
        eventType: event.type,
        total: results.length,
        failed: failures.length,
      });
    }

    return {
      success: failures.length === 0,
      externalId: `zapier_${Date.now()}`,
      error: failures.length > 0 ? `${failures.length} webhooks failed` : undefined,
    };
  }

  /**
   * Test connection by verifying API key is set
   */
  async testConnection(integration: Integration): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    // Check if API key is configured
    const apiKey = this.getApiKey(integration);
    if (!apiKey) {
      return {
        success: false,
        message: "API key not configured. Generate one in Settings > Integrations.",
      };
    }

    // Check if any webhook subscriptions exist
    const subscriptions = this.getWebhookSubscriptions(integration);
    const activeCount = subscriptions.filter((s) => s.enabled).length;

    return {
      success: true,
      message: `Zapier integration active with ${activeCount} webhook subscription(s).`,
      latencyMs: Date.now() - startTime,
      details: {
        subscriptionCount: subscriptions.length,
        activeSubscriptions: activeCount,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get webhook subscriptions from integration metadata
   */
  private getWebhookSubscriptions(integration: Integration): ZapierTriggerSubscription[] {
    const metadata = integration.metadata as Record<string, unknown>;
    return (metadata?.webhookSubscriptions as ZapierTriggerSubscription[]) || [];
  }

  /**
   * Map internal event type to Zapier trigger name
   */
  private mapEventToZapierTrigger(eventType: string): string {
    const mapping: Record<string, string> = {
      TIER_UPGRADED: "customer.tier_changed",
      TIER_DOWNGRADED: "customer.tier_changed",
      POINTS_EARNED: "points.earned",
      POINTS_REDEEMED: "points.redeemed",
      POINTS_ADJUSTED: "points.adjusted",
      POINTS_EXPIRED: "points.expired",
      CASHBACK_EARNED: "cashback.earned",
      CASHBACK_REDEEMED: "cashback.redeemed",
      RAFFLE_WINNER_SELECTED: "raffle.winner_selected",
      CUSTOMER_ENROLLED: "customer.created",
      TIER_SUBSCRIPTION_CREATED: "subscription.created",
      TIER_SUBSCRIPTION_CANCELLED: "subscription.cancelled",
    };

    return mapping[eventType] || eventType.toLowerCase().replace(/_/g, ".");
  }

  /**
   * Build signed webhook payload
   */
  private buildWebhookPayload(
    shop: string,
    event: LoyaltyEvent,
    secret: string
  ): ZapierWebhookPayload {
    const timestamp = new Date().toISOString();
    const eventName = this.mapEventToZapierTrigger(event.type);

    // Build data based on event type
    const data = this.buildEventData(event);

    // Create signature
    const signaturePayload = JSON.stringify({ event: eventName, timestamp, shop, data });
    const signature = createHmac("sha256", secret)
      .update(signaturePayload)
      .digest("hex");

    return {
      event: eventName,
      timestamp,
      shop,
      signature,
      data,
    };
  }

  /**
   * Build event-specific data payload
   */
  private buildEventData(event: LoyaltyEvent): Record<string, unknown> {
    const baseData: Record<string, unknown> = {
      customer_id: event.customerId,
      shopify_customer_id: event.shopifyCustomerId,
      customer_email: event.customerEmail,
      ...event.data,
    };

    // Add metadata
    if (event.metadata) {
      baseData.metadata = event.metadata;
    }

    return baseData;
  }

  /**
   * Send webhook to a specific URL
   */
  private async sendWebhookToUrl(
    url: string,
    payload: ZapierWebhookPayload,
    subscriptionId: string
  ): Promise<void> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RewardsPro-Signature": payload.signature,
        "X-RewardsPro-Event": payload.event,
        "X-RewardsPro-Timestamp": payload.timestamp,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Webhook failed (${response.status}): ${errorText}`);
    }

    this.logger.debug("Zapier webhook sent", {
      subscriptionId,
      event: payload.event,
      status: response.status,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEY GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a new Zapier API key
 * Format: rpro_live_xxxx or rpro_test_xxxx
 */
export function generateZapierApiKey(isTest: boolean = false): string {
  const prefix = isTest ? "rpro_test_" : "rpro_live_";
  const randomPart = randomBytes(24).toString("base64url");
  return `${prefix}${randomPart}`;
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  return /^rpro_(live|test)_[A-Za-z0-9_-]{32}$/.test(apiKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a webhook subscription
 */
export function addWebhookSubscription(
  currentSubscriptions: ZapierTriggerSubscription[],
  event: string,
  targetUrl: string
): ZapierTriggerSubscription[] {
  const newSubscription: ZapierTriggerSubscription = {
    id: randomBytes(16).toString("hex"),
    event,
    targetUrl,
    createdAt: new Date().toISOString(),
    enabled: true,
  };

  return [...currentSubscriptions, newSubscription];
}

/**
 * Remove a webhook subscription
 */
export function removeWebhookSubscription(
  currentSubscriptions: ZapierTriggerSubscription[],
  subscriptionId: string
): ZapierTriggerSubscription[] {
  return currentSubscriptions.filter((sub) => sub.id !== subscriptionId);
}

/**
 * Toggle a webhook subscription
 */
export function toggleWebhookSubscription(
  currentSubscriptions: ZapierTriggerSubscription[],
  subscriptionId: string,
  enabled: boolean
): ZapierTriggerSubscription[] {
  return currentSubscriptions.map((sub) =>
    sub.id === subscriptionId ? { ...sub, enabled } : sub
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

// Register the adapter when this module is imported
registerAdapter("ZAPIER", () => new ZapierAdapter());

export { ZAPIER_CONFIG };
