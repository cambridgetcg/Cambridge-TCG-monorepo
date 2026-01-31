/**
 * Webhook Entitlement Monitor
 *
 * Logs entitlement context for webhooks to monitor resource usage
 * against plan limits. Webhooks intentionally bypass limits (for availability),
 * but this service provides visibility for monitoring and alerting.
 *
 * @module webhook-entitlement-monitor.server
 */

import { getEntitlements, getEffectivePlan } from "./entitlements.server";
import db from "~/db.server";
import { createLogger } from "./logger.server";

const monitorLogger = createLogger("WebhookEntitlement");

// ============================================
// TYPES
// ============================================

export interface WebhookEntitlementContext {
  shop: string;
  webhookTopic: string;
  webhookId: string;
  planName: string;
  limits: {
    maxTiers: number;
    maxOrders: number;
    maxEmails: number;
    maxCustomers: number;
    maxActiveRaffles: number;
    maxActiveCampaigns: number;
  };
  currentUsage: {
    tiers: number;
    orders: number;
    customers: number;
    activeRaffles: number;
    activeCampaigns: number;
  };
  warnings: string[];
}

// ============================================
// MONITORING
// ============================================

/**
 * Log entitlement context for webhook monitoring
 *
 * This should be called at the start of webhook processing to
 * provide visibility into resource usage vs plan limits.
 *
 * @param shop - Shop domain
 * @param webhookTopic - The webhook topic (e.g., "orders/paid")
 * @param webhookId - Unique webhook ID for correlation
 * @returns Context object with plan info and warnings
 */
export async function logWebhookEntitlementContext(
  shop: string,
  webhookTopic: string,
  webhookId: string
): Promise<WebhookEntitlementContext> {
  try {
    // Get entitlements and current usage in parallel
    const [entitlements, planName, usage] = await Promise.all([
      getEntitlements(shop),
      getEffectivePlan(shop),
      getResourceUsage(shop),
    ]);

    const context: WebhookEntitlementContext = {
      shop,
      webhookTopic,
      webhookId,
      planName,
      limits: {
        maxTiers: entitlements.limitMaxTiers,
        maxOrders: entitlements.limitMaxOrders,
        maxEmails: entitlements.limitMaxEmails,
        maxCustomers: entitlements.limitMaxCustomers,
        maxActiveRaffles: entitlements.limitMaxActiveRaffles,
        maxActiveCampaigns: entitlements.limitMaxActiveCampaigns,
      },
      currentUsage: usage,
      warnings: [],
    };

    // Check for resources approaching or exceeding limits
    const checkLimit = (
      resource: string,
      current: number,
      limit: number
    ): void => {
      if (limit >= 999999) return; // Unlimited
      const percentage = (current / limit) * 100;
      if (current >= limit) {
        context.warnings.push(
          `${resource} AT LIMIT: ${current}/${limit} (100%)`
        );
      } else if (percentage >= 90) {
        context.warnings.push(
          `${resource} near limit: ${current}/${limit} (${percentage.toFixed(0)}%)`
        );
      }
    };

    checkLimit("Tiers", usage.tiers, entitlements.limitMaxTiers);
    checkLimit("Orders", usage.orders, entitlements.limitMaxOrders);
    checkLimit("Customers", usage.customers, entitlements.limitMaxCustomers);
    checkLimit("Active Raffles", usage.activeRaffles, entitlements.limitMaxActiveRaffles);
    checkLimit("Active Campaigns", usage.activeCampaigns, entitlements.limitMaxActiveCampaigns);

    // Log the context
    const logger = monitorLogger.withContext({
      shop,
      webhookTopic,
      webhookId,
    });

    if (context.warnings.length > 0) {
      logger.warn("Webhook processing with resource warnings", {
        planName,
        warnings: context.warnings,
        usage: context.currentUsage,
        limits: context.limits,
      });
    } else {
      logger.debug("Webhook entitlement context", {
        planName,
        usage: context.currentUsage,
        limits: context.limits,
      });
    }

    return context;
  } catch (error) {
    // Don't block webhook processing on monitoring failures
    monitorLogger.error("Failed to log entitlement context", {
      shop,
      webhookTopic,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Return minimal context
    return {
      shop,
      webhookTopic,
      webhookId,
      planName: "Unknown",
      limits: {
        maxTiers: 0,
        maxOrders: 0,
        maxEmails: 0,
        maxCustomers: 0,
        maxActiveRaffles: 0,
        maxActiveCampaigns: 0,
      },
      currentUsage: {
        tiers: 0,
        orders: 0,
        customers: 0,
        activeRaffles: 0,
        activeCampaigns: 0,
      },
      warnings: ["Unable to fetch entitlement context"],
    };
  }
}

/**
 * Get current resource usage counts for a shop
 */
async function getResourceUsage(shop: string): Promise<{
  tiers: number;
  orders: number;
  customers: number;
  activeRaffles: number;
  activeCampaigns: number;
}> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    tierCount,
    orderUsage,
    customerCount,
    activeRaffleCount,
    activeCampaignCount,
  ] = await Promise.all([
    db.tier.count({ where: { shop } }),
    db.monthlyOrderUsage.findUnique({
      where: { shop_year_month: { shop, year, month } },
      select: { orderCount: true },
    }),
    db.customer.count({ where: { shop } }),
    db.raffle.count({
      where: { shop, status: { in: ["ACTIVE", "SCHEDULED"] } },
    }),
    db.emailCampaign.count({
      where: { shop, status: { in: ["DRAFT", "SCHEDULED", "SENDING"] } },
    }),
  ]);

  return {
    tiers: tierCount,
    orders: orderUsage?.orderCount || 0,
    customers: customerCount,
    activeRaffles: activeRaffleCount,
    activeCampaigns: activeCampaignCount,
  };
}

/**
 * Log when a webhook creates a resource that exceeds plan limits
 *
 * @param shop - Shop domain
 * @param resource - Type of resource (e.g., "TierPurchase", "Points")
 * @param details - Additional details about the resource
 */
export function logResourceCreatedBeyondLimit(
  shop: string,
  resource: string,
  details: Record<string, any>
): void {
  monitorLogger.warn("Resource created via webhook (bypassing limit)", {
    shop,
    resource,
    note: "Webhooks intentionally bypass limits for availability",
    ...details,
  });
}
