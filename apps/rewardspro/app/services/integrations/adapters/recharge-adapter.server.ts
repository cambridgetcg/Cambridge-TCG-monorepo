/**
 * Recharge Integration Adapter
 *
 * Handles integration with Recharge for subscription management.
 * Awards points for subscription creation, renewals, and loyalty milestones.
 *
 * @see https://developer.rechargepayments.com/2021-11/
 */

import { ApiKeyIntegrationAdapter } from "../base-adapter.server";
import { registerAdapter } from "../integration-manager.server";
import type { Integration } from "@prisma/client";
import type {
  IntegrationConfig,
  WebhookProcessingResult,
  EventDeliveryResult,
  ConnectionTestResult,
  LoyaltyEvent,
} from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const RECHARGE_CONFIG: IntegrationConfig = {
  provider: "RECHARGE",
  name: "Recharge",
  description: "Subscription management platform",
  icon: "recharge",
  docsUrl: "https://developer.rechargepayments.com/",

  authType: "api_key",

  api: {
    baseUrl: "https://api.rechargeapps.com",
    version: "2021-11",
    rateLimit: {
      requests: 40,
      windowMs: 60000, // 40 requests per minute
    },
  },

  webhooks: {
    supportedTopics: [
      "subscription/created",
      "subscription/activated",
      "subscription/cancelled",
      "subscription/skipped",
      "subscription/unskipped",
      "subscription/updated",
      "charge/created",
      "charge/success",
      "charge/failed",
      "charge/refunded",
      "customer/created",
      "customer/updated",
      "order/created",
      "order/success",
    ],
    signatureHeader: "X-Recharge-Hmac-Sha256",
    signatureAlgorithm: "hmac-sha256",
  },

  features: [
    {
      id: "sync_subscriptions",
      name: "Subscription Sync",
      description: "Receive webhook notifications for subscription events",
      category: "sync",
      requiresWebhook: true,
    },
    {
      id: "points_for_subscription",
      name: "Points for Subscription",
      description: "Award points when customers create a subscription",
      category: "points",
      requiresWebhook: true,
    },
    {
      id: "points_for_renewal",
      name: "Renewal Points",
      description: "Award points for subscription renewals",
      category: "points",
      requiresWebhook: true,
    },
    {
      id: "loyalty_milestone_bonus",
      name: "Loyalty Milestone Bonus",
      description: "Bonus points for subscription anniversaries",
      category: "points",
      requiresWebhook: true,
    },
    {
      id: "tier_benefits",
      name: "Subscriber Tier Benefits",
      description: "Apply tier-based discounts to subscriptions",
      category: "data",
      requiresWebhook: false,
    },
  ],

  defaultPointsRules: [
    {
      triggerEvent: "subscription/created",
      name: "Create Subscription",
      description: "Points for starting a subscription",
      defaultPoints: 100,
    },
    {
      triggerEvent: "charge/success",
      name: "Subscription Renewal",
      description: "Points for each successful subscription charge",
      defaultPoints: 25,
    },
    {
      triggerEvent: "subscription/milestone_3",
      name: "3-Month Milestone",
      description: "Bonus for 3 months of subscription",
      defaultPoints: 50,
      conditions: { monthsActive: 3 },
    },
    {
      triggerEvent: "subscription/milestone_6",
      name: "6-Month Milestone",
      description: "Bonus for 6 months of subscription",
      defaultPoints: 100,
      conditions: { monthsActive: 6 },
    },
    {
      triggerEvent: "subscription/milestone_12",
      name: "Annual Milestone",
      description: "Bonus for 1 year of subscription",
      defaultPoints: 250,
      conditions: { monthsActive: 12 },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// RECHARGE API TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface RechargeCustomer {
  id: number;
  email: string;
  external_customer_id?: {
    ecommerce: string; // Shopify customer ID
  };
  first_name: string;
  last_name: string;
  created_at: string;
  status: "ACTIVE" | "INACTIVE";
  subscriptions_active_count: number;
  subscriptions_total_count: number;
}

interface RechargeSubscription {
  id: number;
  customer_id: number;
  external_product_id?: {
    ecommerce: string; // Shopify product ID
  };
  external_variant_id?: {
    ecommerce: string; // Shopify variant ID
  };
  product_title: string;
  variant_title: string;
  sku: string;
  price: string;
  quantity: number;
  status: "ACTIVE" | "CANCELLED" | "EXPIRED";
  next_charge_scheduled_at: string | null;
  created_at: string;
  cancelled_at: string | null;
  order_interval_unit: "day" | "week" | "month";
  order_interval_frequency: number;
  charge_interval_frequency: number;
}

interface RechargeCharge {
  id: number;
  customer_id: number;
  external_order_id?: {
    ecommerce: string; // Shopify order ID
  };
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  status: "SUCCESS" | "QUEUED" | "SKIPPED" | "ERROR" | "REFUNDED";
  processed_at: string | null;
  created_at: string;
  line_items: Array<{
    subscription_id: number;
    title: string;
    quantity: number;
    price: string;
  }>;
}

interface RechargeWebhookPayload {
  subscription?: RechargeSubscription;
  charge?: RechargeCharge;
  customer?: RechargeCustomer;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class RechargeAdapter extends ApiKeyIntegrationAdapter {
  constructor() {
    super(RECHARGE_CONFIG);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API Methods Override
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Make authenticated API request to Recharge
   */
  protected async makeApiRequest<T>(
    integration: Integration,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const apiKey = this.getApiKey(integration);
    if (!apiKey) {
      throw new Error("API key not configured");
    }

    const url = `${this.config.api!.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "X-Recharge-Access-Token": apiKey,
        "X-Recharge-Version": "2021-11",
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Recharge API error ${response.status}: ${errorBody}`
      );
    }

    return response.json() as Promise<T>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Webhook Methods
  // ─────────────────────────────────────────────────────────────────────────

  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    return this.verifyHmacSha256(payload, signature, secret);
  }

  async processWebhook(
    topic: string,
    payload: Record<string, unknown>
  ): Promise<WebhookProcessingResult> {
    this.logger.debug("Processing Recharge webhook", { topic });

    const webhookData = payload as unknown as RechargeWebhookPayload;

    switch (topic) {
      case "subscription/created":
        return this.processSubscriptionCreated(webhookData);

      case "subscription/cancelled":
        return this.processSubscriptionCancelled(webhookData);

      case "charge/success":
        return this.processChargeSuccess(webhookData);

      case "charge/failed":
        return this.processChargeFailed(webhookData);

      case "customer/created":
      case "customer/updated":
        return this.processCustomerEvent(topic, webhookData);

      default:
        return {
          action: topic,
          data: payload,
          shouldAwardPoints: false,
        };
    }
  }

  /**
   * Process subscription created webhook
   */
  private processSubscriptionCreated(
    payload: RechargeWebhookPayload
  ): WebhookProcessingResult {
    const subscription = payload.subscription;
    if (!subscription) {
      return {
        action: "subscription/created",
        data: {},
        shouldAwardPoints: false,
      };
    }

    return {
      shopifyCustomerId: payload.customer?.external_customer_id?.ecommerce,
      action: "subscription/created",
      data: {
        subscriptionId: subscription.id,
        customerId: subscription.customer_id,
        productTitle: subscription.product_title,
        variantTitle: subscription.variant_title,
        shopifyProductId: subscription.external_product_id?.ecommerce,
        shopifyVariantId: subscription.external_variant_id?.ecommerce,
        price: subscription.price,
        quantity: subscription.quantity,
        interval: `${subscription.order_interval_frequency} ${subscription.order_interval_unit}`,
        createdAt: subscription.created_at,
      },
      shouldAwardPoints: true,
      pointsContext: {
        basePoints: 100,
        bonusConditions: {
          highValue: parseFloat(subscription.price) >= 50,
          multipleItems: subscription.quantity > 1,
        },
      },
    };
  }

  /**
   * Process subscription cancelled webhook
   */
  private processSubscriptionCancelled(
    payload: RechargeWebhookPayload
  ): WebhookProcessingResult {
    const subscription = payload.subscription;
    if (!subscription) {
      return {
        action: "subscription/cancelled",
        data: {},
        shouldAwardPoints: false,
      };
    }

    // Calculate subscription duration for potential milestone check
    const createdAt = new Date(subscription.created_at);
    const cancelledAt = subscription.cancelled_at
      ? new Date(subscription.cancelled_at)
      : new Date();
    const monthsActive = Math.floor(
      (cancelledAt.getTime() - createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)
    );

    return {
      shopifyCustomerId: payload.customer?.external_customer_id?.ecommerce,
      action: "subscription/cancelled",
      data: {
        subscriptionId: subscription.id,
        productTitle: subscription.product_title,
        monthsActive,
        cancelledAt: subscription.cancelled_at,
      },
      shouldAwardPoints: false, // Don't award points for cancellation
    };
  }

  /**
   * Process successful charge webhook
   */
  private processChargeSuccess(
    payload: RechargeWebhookPayload
  ): WebhookProcessingResult {
    const charge = payload.charge;
    if (!charge) {
      return {
        action: "charge/success",
        data: {},
        shouldAwardPoints: false,
      };
    }

    const totalPrice = parseFloat(charge.total_price);
    const itemCount = charge.line_items?.reduce(
      (sum, item) => sum + item.quantity,
      0
    ) || 0;

    return {
      shopifyCustomerId: payload.customer?.external_customer_id?.ecommerce,
      action: "charge/success",
      data: {
        chargeId: charge.id,
        customerId: charge.customer_id,
        shopifyOrderId: charge.external_order_id?.ecommerce,
        totalPrice: charge.total_price,
        subtotalPrice: charge.subtotal_price,
        discountsApplied: charge.total_discounts,
        itemCount,
        lineItems: charge.line_items?.map((item) => ({
          subscriptionId: item.subscription_id,
          title: item.title,
          quantity: item.quantity,
          price: item.price,
        })),
        processedAt: charge.processed_at,
      },
      shouldAwardPoints: true,
      pointsContext: {
        basePoints: 25,
        orderValue: totalPrice,
        bonusConditions: {
          highValue: totalPrice >= 100,
          multipleSubscriptions: itemCount > 1,
        },
      },
    };
  }

  /**
   * Process failed charge webhook
   */
  private processChargeFailed(
    payload: RechargeWebhookPayload
  ): WebhookProcessingResult {
    const charge = payload.charge;
    if (!charge) {
      return {
        action: "charge/failed",
        data: {},
        shouldAwardPoints: false,
      };
    }

    return {
      shopifyCustomerId: payload.customer?.external_customer_id?.ecommerce,
      action: "charge/failed",
      data: {
        chargeId: charge.id,
        customerId: charge.customer_id,
        totalPrice: charge.total_price,
        status: charge.status,
      },
      shouldAwardPoints: false,
    };
  }

  /**
   * Process customer events
   */
  private processCustomerEvent(
    topic: string,
    payload: RechargeWebhookPayload
  ): WebhookProcessingResult {
    const customer = payload.customer;
    if (!customer) {
      return {
        action: topic,
        data: {},
        shouldAwardPoints: false,
      };
    }

    return {
      customerEmail: customer.email,
      shopifyCustomerId: customer.external_customer_id?.ecommerce,
      action: topic,
      data: {
        rechargeCustomerId: customer.id,
        firstName: customer.first_name,
        lastName: customer.last_name,
        status: customer.status,
        activeSubscriptions: customer.subscriptions_active_count,
        totalSubscriptions: customer.subscriptions_total_count,
        createdAt: customer.created_at,
      },
      shouldAwardPoints: false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Delivery Methods
  // ─────────────────────────────────────────────────────────────────────────

  async sendEvent(
    integration: Integration,
    event: LoyaltyEvent
  ): Promise<EventDeliveryResult> {
    // Recharge doesn't have an inbound event API for loyalty data
    // We could potentially update metafields on Recharge customers
    // For now, this is a no-op
    this.logger.debug("Recharge sendEvent called (no-op)", { eventType: event.type });

    return {
      success: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Test
  // ─────────────────────────────────────────────────────────────────────────

  async testConnection(integration: Integration): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    const apiKey = this.getApiKey(integration);
    if (!apiKey) {
      return {
        success: false,
        message: "API key not configured",
      };
    }

    try {
      const response = await fetch(
        `${this.config.api!.baseUrl}/store`,
        {
          method: "GET",
          headers: {
            "X-Recharge-Access-Token": apiKey,
            "X-Recharge-Version": "2021-11",
            Accept: "application/json",
          },
        }
      );

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            message: "Invalid API key",
            latencyMs,
          };
        }
        return {
          success: false,
          message: `API returned status ${response.status}`,
          latencyMs,
        };
      }

      const data = await response.json();
      const store = data.store;

      return {
        success: true,
        message: `Connected to Recharge for ${store?.name || "store"}`,
        details: {
          storeId: store?.id,
          storeName: store?.name,
          email: store?.email,
          domain: store?.domain,
          timezone: store?.timezone,
        },
        latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Custom Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get customer by Shopify customer ID
   */
  async getCustomerByShopifyId(
    integration: Integration,
    shopifyCustomerId: string
  ): Promise<{
    success: boolean;
    customer?: RechargeCustomer;
    error?: string;
  }> {
    try {
      const data = await this.makeApiRequest<{ customers: RechargeCustomer[] }>(
        integration,
        `/customers?external_customer_id=${shopifyCustomerId}`
      );

      const customer = data.customers?.[0];

      return {
        success: true,
        customer,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get customer subscriptions
   */
  async getCustomerSubscriptions(
    integration: Integration,
    customerId: number,
    options?: { status?: "ACTIVE" | "CANCELLED" | "EXPIRED" }
  ): Promise<{
    success: boolean;
    subscriptions?: RechargeSubscription[];
    error?: string;
  }> {
    try {
      let endpoint = `/subscriptions?customer_id=${customerId}`;
      if (options?.status) {
        endpoint += `&status=${options.status}`;
      }

      const data = await this.makeApiRequest<{
        subscriptions: RechargeSubscription[];
      }>(integration, endpoint);

      return {
        success: true,
        subscriptions: data.subscriptions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(
    integration: Integration,
    subscriptionId: number
  ): Promise<{
    success: boolean;
    subscription?: RechargeSubscription;
    error?: string;
  }> {
    try {
      const data = await this.makeApiRequest<{
        subscription: RechargeSubscription;
      }>(integration, `/subscriptions/${subscriptionId}`);

      return {
        success: true,
        subscription: data.subscription,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get customer charge history
   */
  async getCustomerCharges(
    integration: Integration,
    customerId: number,
    options?: {
      status?: "SUCCESS" | "QUEUED" | "SKIPPED" | "ERROR" | "REFUNDED";
      limit?: number;
    }
  ): Promise<{
    success: boolean;
    charges?: RechargeCharge[];
    error?: string;
  }> {
    try {
      let endpoint = `/charges?customer_id=${customerId}`;
      if (options?.status) {
        endpoint += `&status=${options.status}`;
      }
      if (options?.limit) {
        endpoint += `&limit=${options.limit}`;
      }

      const data = await this.makeApiRequest<{ charges: RechargeCharge[] }>(
        integration,
        endpoint
      );

      return {
        success: true,
        charges: data.charges,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Calculate subscription metrics for a customer
   */
  async calculateSubscriptionMetrics(
    integration: Integration,
    shopifyCustomerId: string
  ): Promise<{
    success: boolean;
    metrics?: {
      totalSubscriptions: number;
      activeSubscriptions: number;
      totalCharges: number;
      successfulCharges: number;
      totalSpent: number;
      monthsAsSubscriber: number;
      eligibleMilestone?: number;
    };
    error?: string;
  }> {
    try {
      // Get customer
      const customerResult = await this.getCustomerByShopifyId(
        integration,
        shopifyCustomerId
      );

      if (!customerResult.success || !customerResult.customer) {
        return {
          success: false,
          error: "Customer not found in Recharge",
        };
      }

      const customer = customerResult.customer;

      // Get charge history
      const chargesResult = await this.getCustomerCharges(
        integration,
        customer.id,
        { status: "SUCCESS" }
      );

      const charges = chargesResult.charges || [];

      // Calculate metrics
      const totalSpent = charges.reduce(
        (sum, charge) => sum + parseFloat(charge.total_price),
        0
      );

      const createdAt = new Date(customer.created_at);
      const monthsAsSubscriber = Math.floor(
        (Date.now() - createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)
      );

      // Determine milestone eligibility
      let eligibleMilestone: number | undefined;
      if (monthsAsSubscriber >= 12) {
        eligibleMilestone = 12;
      } else if (monthsAsSubscriber >= 6) {
        eligibleMilestone = 6;
      } else if (monthsAsSubscriber >= 3) {
        eligibleMilestone = 3;
      }

      return {
        success: true,
        metrics: {
          totalSubscriptions: customer.subscriptions_total_count,
          activeSubscriptions: customer.subscriptions_active_count,
          totalCharges: charges.length,
          successfulCharges: charges.length,
          totalSpent,
          monthsAsSubscriber,
          eligibleMilestone,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Apply discount to subscription (for tier benefits)
   */
  async applySubscriptionDiscount(
    integration: Integration,
    subscriptionId: number,
    discountCode: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await this.makeApiRequest(
        integration,
        `/subscriptions/${subscriptionId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            discount_code: discountCode,
          }),
        }
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

// Register the adapter when this module is imported
registerAdapter("RECHARGE", () => new RechargeAdapter());

// Export for direct use
export const rechargeAdapter = new RechargeAdapter();
