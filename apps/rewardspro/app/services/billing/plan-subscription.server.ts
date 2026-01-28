/**
 * Plan Subscription Service
 * Clean, comprehensive service for handling Shopify billing subscriptions
 *
 * This service handles the complete flow from clicking "Upgrade" to completing the subscription
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { updatePlanLimit, unlockShop } from "~/utils/plan-access-control.server";
import { isTestMode } from "~/utils/billing-test-mode.server";

// ============================================
// TYPES & INTERFACES
// ============================================

export interface PlanConfig {
  planId: string;            // "pro", "max", "ultra"
  planName: string;          // "RewardsPro Pro"
  price: number;             // 39.00
  orderLimit: number;        // 500
  description: string;
  isTest: boolean;
  // Usage-based pricing (optional)
  usageEnabled?: boolean;    // true if usage-based billing
  usageRate?: number;        // Rate per order overage (e.g., 0.10 = $0.10/order)
  usageCap?: number;         // Maximum usage charges per month
  usageBatchSize?: number;   // Batch size for charging (e.g., 100 orders)
  usageTerms?: string;       // Description shown to merchant
}

export interface BillingResult {
  success: boolean;
  confirmationUrl?: string;  // URL for merchant to confirm subscription
  subscriptionId?: string;   // Shopify subscription ID
  error?: string;
  planName?: string;
}

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  currentPlan: string;       // "RewardsPro Free", "RewardsPro Pro", etc.
  subscriptionId?: string;
  status?: string;           // "ACTIVE", "CANCELLED", etc.
  currentPeriodEnd?: Date;
}

// ============================================
// PLAN CONFIGURATIONS
// ============================================

export const PLAN_CONFIGS: Record<string, Omit<PlanConfig, 'isTest'>> = {
  free: {
    planId: "free",
    planName: "RewardsPro Free",
    price: 0,
    orderLimit: 50,
    description: "Free plan with basic features"
  },
  pro: {
    planId: "pro",
    planName: "RewardsPro Pro",
    price: 39.00,
    orderLimit: 500,
    description: "Pro plan with advanced features",
    // Usage-based pricing: $10 per 100 orders over limit
    usageEnabled: true,
    usageRate: 0.10,        // $0.10 per order overage
    usageCap: 50.00,        // Max $50 usage charges per month
    usageBatchSize: 100,    // Charge in batches of 100 orders
    usageTerms: "$10 per 100 orders over 500/month limit (max $50/month)"
  },
  "pro-annual": {
    planId: "pro-annual",
    planName: "RewardsPro Pro Annual",
    price: 336.00,
    orderLimit: 500,
    description: "Pro plan with annual billing (save 28%)",
    // Usage-based pricing: $10 per 100 orders over limit
    usageEnabled: true,
    usageRate: 0.10,        // $0.10 per order overage
    usageCap: 50.00,        // Max $50 usage charges per month
    usageBatchSize: 100,    // Charge in batches of 100 orders
    usageTerms: "$10 per 100 orders over 500/month limit (max $50/month)"
  },
  max: {
    planId: "max",
    planName: "RewardsPro Max",
    price: 149.00,
    orderLimit: 2000,
    description: "Max plan for growing businesses",
    // Usage-based pricing: $5 per 100 orders over limit
    usageEnabled: true,
    usageRate: 0.05,        // $0.05 per order overage
    usageCap: 100.00,       // Max $100 usage charges per month
    usageBatchSize: 100,    // Charge in batches of 100 orders
    usageTerms: "$5 per 100 orders over 2,000/month limit (max $100/month)"
  },
  "max-annual": {
    planId: "max-annual",
    planName: "RewardsPro Max Annual",
    price: 1296.00,
    orderLimit: 2000,
    description: "Max plan with annual billing (save 27%)",
    // Usage-based pricing: $5 per 100 orders over limit
    usageEnabled: true,
    usageRate: 0.05,        // $0.05 per order overage
    usageCap: 100.00,       // Max $100 usage charges per month
    usageBatchSize: 100,    // Charge in batches of 100 orders
    usageTerms: "$5 per 100 orders over 2,000/month limit (max $100/month)"
  },
  ultra: {
    planId: "ultra",
    planName: "RewardsPro Ultra",
    price: 499.00,
    orderLimit: 999999,
    description: "Unlimited everything"
    // No usage-based pricing - unlimited orders
  },
  "ultra-annual": {
    planId: "ultra-annual",
    planName: "RewardsPro Ultra Annual",
    price: 4296.00,
    orderLimit: 999999,
    description: "Unlimited everything with annual billing (save 28%)"
    // No usage-based pricing - unlimited orders
  }
};

// ============================================
// AUDIT & RATE LIMITING
// ============================================

/**
 * Check if shop has exceeded rate limit for billing attempts
 */
export async function checkRateLimit(shop: string): Promise<{ allowed: boolean; attemptsCount: number }> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  try {
    const recentAttempts = await db.billingAuditLog.count({
      where: {
        shop,
        attemptedAt: {
          gte: fifteenMinutesAgo
        }
      }
    });

    console.log(`[BillingService] Shop ${shop} has ${recentAttempts} billing attempts in last 15 minutes`);

    return {
      allowed: recentAttempts <= 5,
      attemptsCount: recentAttempts
    };
  } catch (error) {
    console.error("[BillingService] Error checking rate limit:", error);
    // Allow attempt if we can't check (don't block legitimate users due to DB errors)
    return { allowed: true, attemptsCount: 0 };
  }
}

/**
 * Log billing attempt for audit trail
 */
export async function logBillingAttempt(
  shop: string,
  planId: string,
  success: boolean,
  errorMessage: string | null = null,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await db.billingAuditLog.create({
      data: {
        id: uuidv4(),
        shop,
        action: `subscribe-${planId}`,
        planName: PLAN_CONFIGS[planId]?.planName || planId,
        success,
        errorMessage,
        ipAddress: metadata?.ipAddress || "unknown",
        userAgent: metadata?.userAgent || "unknown",
        attemptedAt: new Date(),
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null
      }
    });
  } catch (error) {
    console.error("[BillingService] Failed to log billing attempt:", error);
    // Don't throw - logging failure shouldn't block the main flow
  }
}

// ============================================
// SUBSCRIPTION STATUS CHECK
// ============================================

/**
 * Get current subscription status for a shop
 */
export async function getSubscriptionStatus(
  shop: string,
  billing: AdminApiContext['billing'],
  admin?: AdminApiContext
): Promise<SubscriptionStatus> {
  try {
    // Check all plans
    const allPlans = Object.values(PLAN_CONFIGS).map(p => p.planName);

    // Determine test mode using centralized utility
    const testMode = admin
      ? await isTestMode(shop, admin)
      : process.env.NODE_ENV === 'development';

    const { hasActivePayment, appSubscriptions} = await billing.check({
      plans: allPlans,
      isTest: testMode,
    });

    const activeSubscription = appSubscriptions?.[0];

    if (hasActivePayment && activeSubscription) {
      console.log(`[BillingService] Shop ${shop} has active subscription:`, activeSubscription.name);

      return {
        hasActiveSubscription: true,
        currentPlan: activeSubscription.name,
        subscriptionId: activeSubscription.id,
        status: 'ACTIVE',
        currentPeriodEnd: activeSubscription.currentPeriodEnd
      };
    }

    // No active subscription - return free plan
    return {
      hasActiveSubscription: false,
      currentPlan: "RewardsPro Free"
    };

  } catch (error) {
    console.error("[BillingService] Error checking subscription status:", error);
    // Default to free plan on error
    return {
      hasActiveSubscription: false,
      currentPlan: "RewardsPro Free"
    };
  }
}

// ============================================
// SUBSCRIPTION CREATION
// ============================================

/**
 * Create a new subscription for a shop
 * This is the main entry point when user clicks "Upgrade to X Plan"
 *
 * NOTE: This service uses Shopify's billing.require()/billing.request() abstraction,
 * which handles replacementBehavior internally. For more control over replacementBehavior,
 * use GraphQLBillingService instead (see BILLING_SERVICES_GUIDE.md).
 *
 * Shopify's default behavior for plan changes:
 * - Upgrade: STANDARD (immediate with proration)
 * - Downgrade: Applied at end of current billing cycle
 */
export async function createSubscription(
  shop: string,
  planId: string,
  billing: AdminApiContext['billing'],
  admin?: AdminApiContext,
  metadata?: Record<string, any>
): Promise<BillingResult> {
  console.log(`[BillingService] Creating subscription for ${shop}, plan: ${planId}`);

  // Determine test mode using centralized utility
  const testMode = admin
    ? await isTestMode(shop, admin)
    : process.env.NODE_ENV === 'development';

  console.log(`[BillingService] Test mode: ${testMode}`);

  // Step 1: Validate plan
  const planConfig = PLAN_CONFIGS[planId];
  if (!planConfig) {
    const error = `Invalid plan: ${planId}`;
    console.error(`[BillingService] ${error}`);
    await logBillingAttempt(shop, planId, false, error, metadata);
    return { success: false, error };
  }

  // Step 2: Check rate limit
  const { allowed, attemptsCount } = await checkRateLimit(shop);
  if (!allowed) {
    const error = `Rate limit exceeded: ${attemptsCount} attempts in 15 minutes`;
    console.warn(`[BillingService] ${error} for shop: ${shop}`);
    await logBillingAttempt(shop, planId, false, error, metadata);
    return { success: false, error: "Too many subscription attempts. Please try again in 15 minutes." };
  }

  // Step 3: Handle free plan (no Shopify billing needed)
  if (planId === 'free') {
    console.log(`[BillingService] Free plan selected for ${shop}`);
    await logBillingAttempt(shop, planId, true, null, metadata);

    // Update database records
    await updatePlanLimit(shop, planConfig.planName, planConfig.orderLimit);
    await unlockShop(shop);

    return {
      success: true,
      planName: planConfig.planName
    };
  }

  // Step 4: Request Shopify billing
  try {
    console.log(`[BillingService] Requesting Shopify billing for ${shop}, plan: ${planConfig.planName}`);

    const billingCheck = await billing.require({
      plans: [planConfig.planName],
      isTest: testMode,
      onFailure: async () => {
        // No active subscription found - create new one
        console.log(`[BillingService] No active subscription, creating new billing request`);

        const result = await billing.request({
          plan: planConfig.planName,
          isTest: testMode,
          returnUrl: process.env.SHOPIFY_APP_URL ?
            `${process.env.SHOPIFY_APP_URL}/app/billing/callback?plan=${planId}` :
            `https://${shop}/admin/apps`,
        });

        return result;
      },
    });

    // Step 5: Check if subscription was created or already exists
    const subscription = billingCheck.appSubscriptions?.[0];

    if (subscription) {
      console.log(`[BillingService] Subscription confirmed for ${shop}:`, subscription.name);

      // Log successful attempt
      await logBillingAttempt(shop, planId, true, null, {
        ...metadata,
        subscriptionId: subscription.id,
        confirmationUrl: billingCheck.confirmationUrl
      });

      // Update database records
      await updatePlanLimit(shop, planConfig.planName, planConfig.orderLimit);
      await unlockShop(shop);

      // Save subscription to database
      await saveBillingSubscription(shop, planId, subscription.id, subscription.name);

      return {
        success: true,
        confirmationUrl: billingCheck.confirmationUrl,
        subscriptionId: subscription.id,
        planName: planConfig.planName
      };
    }

    // If we reach here, something went wrong
    const error = "Subscription creation failed - no subscription returned";
    console.error(`[BillingService] ${error}`);
    await logBillingAttempt(shop, planId, false, error, metadata);

    return {
      success: false,
      error
    };

  } catch (error) {
    // If billing.request() throws a Response (redirect to confirmation page), re-throw it
    if (error instanceof Response) {
      console.log(`[BillingService] Billing requires merchant approval, redirecting...`);
      throw error; // Let the action handler deal with the redirect
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[BillingService] Error creating subscription:`, error);
    console.error(`[BillingService] Full error details:`, {
      shop,
      planId,
      planName: planConfig.planName,
      isTest: process.env.NODE_ENV === 'development',
      error: errorMessage
    });

    // Provide user-friendly error messages
    let userError = errorMessage;
    if (errorMessage.includes("cannot accept the provided charge") || errorMessage.includes("shop cannot accept")) {
      userError = "This app is still in development mode. Please contact support to enable billing for your shop.";
    } else if (errorMessage.includes("not approved for billing")) {
      userError = "Billing is not yet approved for this app. Please try again later or contact support.";
    }

    await logBillingAttempt(shop, planId, false, errorMessage, metadata);

    return {
      success: false,
      error: userError
    };
  }
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Save subscription details to database
 */
async function saveBillingSubscription(
  shop: string,
  planType: string,
  subscriptionId: string,
  planName: string
): Promise<void> {
  try {
    await db.billingSubscription.upsert({
      where: { shop },
      update: {
        subscriptionId,
        subscriptionStatus: "ACTIVE",
        planType,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        updatedAt: new Date()
      },
      create: {
        id: uuidv4(),
        shop,
        subscriptionId,
        subscriptionStatus: "ACTIVE",
        planType,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingVersion: "graphql",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log(`[BillingService] Saved subscription to database for ${shop}`);
  } catch (error) {
    console.error("[BillingService] Failed to save subscription to database:", error);
    // Don't throw - this is not critical for the subscription to work
  }
}

/**
 * Cancel subscription for a shop
 */
export async function cancelSubscription(
  shop: string,
  billing: AdminApiContext['billing']
): Promise<BillingResult> {
  try {
    console.log(`[BillingService] Cancelling subscription for ${shop}`);

    // Update database
    await db.billingSubscription.updateMany({
      where: { shop },
      data: {
        subscriptionStatus: "CANCELLED",
        updatedAt: new Date()
      }
    });

    // Downgrade to free plan
    await updatePlanLimit(shop, "RewardsPro Free", 50);

    console.log(`[BillingService] Subscription cancelled for ${shop}`);

    return {
      success: true,
      planName: "RewardsPro Free"
    };
  } catch (error) {
    console.error(`[BillingService] Error cancelling subscription:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get plan configuration by ID
 * Note: isTest is included for type compatibility but is not used for billing decisions.
 * Actual test mode is determined at billing time via billing-test-mode.server.ts
 */
export function getPlanConfig(planId: string): (Omit<PlanConfig, 'isTest'> & { isTest: boolean }) | null {
  const config = PLAN_CONFIGS[planId];
  if (!config) return null;

  return {
    ...config,
    isTest: false // Placeholder - actual test mode determined at billing time
  };
}

/**
 * Get all available plans
 * Note: isTest is included for type compatibility but is not used for billing decisions.
 * Actual test mode is determined at billing time via billing-test-mode.server.ts
 */
export function getAllPlans(): (Omit<PlanConfig, 'isTest'> & { isTest: boolean })[] {
  return Object.values(PLAN_CONFIGS).map(config => ({
    ...config,
    isTest: false // Placeholder - actual test mode determined at billing time
  }));
}
