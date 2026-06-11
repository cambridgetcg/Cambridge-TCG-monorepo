/**
 * Shop Data Cleanup Service
 *
 * Provides comprehensive data cleanup when a shop uninstalls the app.
 * Implements GDPR-compliant data deletion with proper cascade ordering.
 *
 * IMPORTANT: This service deletes ALL data associated with a shop.
 * It should only be called from the app uninstall webhook.
 *
 * Deletion order respects foreign key constraints:
 * 1. Child records (ledger entries, events, logs)
 * 2. Parent records (customers, orders, tiers)
 * 3. Configuration (settings, subscriptions)
 * 4. Sessions (authentication data)
 *
 * Note: Uses raw SQL for maximum coverage of all tables,
 * regardless of which models are typed in the Data API adapter.
 */

import prisma from "~/db.server";

export interface CleanupResult {
  success: boolean;
  shop: string;
  deletedCounts: Record<string, number>;
  errors: string[];
  durationMs: number;
}

/**
 * Delete all data associated with a shop
 *
 * @param shop - The shop domain (e.g., "store.myshopify.com")
 * @returns CleanupResult with counts of deleted records
 */
export async function cleanupShopData(shop: string): Promise<CleanupResult> {
  const startTime = Date.now();
  const deletedCounts: Record<string, number> = {};
  const errors: string[] = [];

  // SECURITY: Validate shop domain before any deletions
  if (!shop || typeof shop !== 'string' || !shop.includes('.myshopify.com')) {
    return {
      success: false,
      shop: shop || 'unknown',
      deletedCounts: {},
      errors: ['Invalid shop domain - refusing to delete data'],
      durationMs: Date.now() - startTime,
    };
  }

  console.log(`[ShopCleanup] Starting comprehensive data cleanup for ${shop}`);

  // Helper function to safely delete from a table using the typed models
  async function safeDeleteModel(
    modelName: string,
    deleteOperation: () => Promise<{ count: number }>
  ): Promise<void> {
    try {
      const result = await deleteOperation();
      deletedCounts[modelName] = result.count;
      if (result.count > 0) {
        console.log(`[ShopCleanup] Deleted ${result.count} ${modelName} records`);
      }
    } catch (error: any) {
      // Log but continue - model might not exist or have data
      const errorMsg = `Failed to delete ${modelName}: ${error.message}`;
      console.warn(`[ShopCleanup] ${errorMsg}`);
      errors.push(errorMsg);
      deletedCounts[modelName] = 0;
    }
  }

  try {
    // ================================================================
    // PHASE 1: Delete leaf/child records (no foreign key dependencies)
    // ================================================================

    // Points system
    await safeDeleteModel("PointsLedger", () =>
      prisma.pointsLedger.deleteMany({ where: { shop } })
    );

    // Raffle system
    await safeDeleteModel("RaffleWinner", () =>
      prisma.raffleWinner.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("RaffleEntry", () =>
      prisma.raffleEntry.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("RafflePrize", () =>
      prisma.rafflePrize.deleteMany({ where: { raffle: { shop } } })
    );
    await safeDeleteModel("Raffle", () =>
      prisma.raffle.deleteMany({ where: { shop } })
    );

    // Mystery box system
    await safeDeleteModel("MysteryBoxWinner", () =>
      prisma.mysteryBoxWinner.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("MysteryBoxOpen", () =>
      prisma.mysteryBoxOpen.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("MysteryBoxReward", () =>
      prisma.mysteryBoxReward.deleteMany({ where: { mysteryBox: { shop } } })
    );
    await safeDeleteModel("MysteryBox", () =>
      prisma.mysteryBox.deleteMany({ where: { shop } })
    );

    // Email system
    await safeDeleteModel("EmailEvent", () =>
      prisma.emailEvent.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("EmailCampaign", () =>
      prisma.emailCampaign.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("EmailAutomation", () =>
      prisma.emailAutomation.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("EmailTemplate", () =>
      prisma.emailTemplate.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SendGridDomain", () =>
      prisma.sendGridDomain.deleteMany({ where: { shop } })
    );

    // Analytics
    await safeDeleteModel("AnalyticsRecommendation", () =>
      prisma.analyticsRecommendation.deleteMany({ where: { shop } })
    );

    // Webhook processing records
    await safeDeleteModel("WebhookProcessed", () =>
      prisma.webhookProcessed.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("WebhookError", () =>
      prisma.webhookError.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("WebhookProcess", () =>
      prisma.webhookProcess.deleteMany({ where: { shop } })
    );

    // System records
    await safeDeleteModel("DeadLetterQueue", () =>
      prisma.deadLetterQueue.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SyncStatus", () =>
      prisma.syncStatus.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("Notification", () =>
      prisma.notification.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 2: Delete order-related records
    // ================================================================

    await safeDeleteModel("OrderRefundLineItem", () =>
      prisma.orderRefundLineItem.deleteMany({ where: { refund: { order: { shop } } } })
    );
    await safeDeleteModel("OrderRefund", () =>
      prisma.orderRefund.deleteMany({ where: { order: { shop } } })
    );
    await safeDeleteModel("OrderLineItem", () =>
      prisma.orderLineItem.deleteMany({ where: { order: { shop } } })
    );

    // Store credit ledger (references orders)
    await safeDeleteModel("StoreCreditLedger", () =>
      prisma.storeCreditLedger.deleteMany({ where: { shop } })
    );

    await safeDeleteModel("Order", () =>
      prisma.order.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 3: Delete subscription-related records
    // ================================================================

    await safeDeleteModel("SubscriptionEvent", () =>
      prisma.subscriptionEvent.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SubscriptionRetry", () =>
      prisma.subscriptionRetry.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SubscriptionBillingAttempt", () =>
      prisma.subscriptionBillingAttempt.deleteMany({ where: { subscription: { shop } } })
    );
    await safeDeleteModel("SubscriptionPricingHistory", () =>
      prisma.subscriptionPricingHistory.deleteMany({ where: { shop } })
    );

    // Tier subscriptions and purchases
    await safeDeleteModel("TierSubscription", () =>
      prisma.tierSubscription.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("TierPurchase", () =>
      prisma.tierPurchase.deleteMany({ where: { shop } })
    );

    // Selling plans
    await safeDeleteModel("SellingPlan", () =>
      prisma.sellingPlan.deleteMany({ where: { group: { shop } } })
    );
    await safeDeleteModel("SellingPlanGroup", () =>
      prisma.sellingPlanGroup.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 4: Delete customer-related records
    // ================================================================

    await safeDeleteModel("CustomerTierState", () =>
      prisma.customerTierState.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("TierChangeLog", () =>
      prisma.tierChangeLog.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("Customer", () =>
      prisma.customer.deleteMany({ where: { shop } })
    );

    // Sync jobs
    await safeDeleteModel("CustomerSyncJob", () =>
      prisma.customerSyncJob.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("StoreCreditSyncJob", () =>
      prisma.storeCreditSyncJob.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("OrderSyncJob", () =>
      prisma.orderSyncJob.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("BulkOperationLog", () =>
      prisma.bulkOperationLog.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 5: Delete tier configuration
    // ================================================================

    await safeDeleteModel("TierProduct", () =>
      prisma.tierProduct.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("Tier", () =>
      prisma.tier.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 6: Delete billing records
    // ================================================================

    await safeDeleteModel("UsageRecord", () =>
      prisma.usageRecord.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("MonthlyOrderUsage", () =>
      prisma.monthlyOrderUsage.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("BillingHistory", () =>
      prisma.billingHistory.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("BillingAuditLog", () =>
      prisma.billingAuditLog.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("TierTrialAuditLog", () =>
      prisma.tierTrialAuditLog.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("AppSubscription", () =>
      prisma.appSubscription.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("BillingSubscription", () =>
      prisma.billingSubscription.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 7: Delete configuration and settings
    // ================================================================

    await safeDeleteModel("PointsConfig", () =>
      prisma.pointsConfig.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SubscriptionPricingConfig", () =>
      prisma.subscriptionPricingConfig.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("EmailSettings", () =>
      prisma.emailSettings.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("ShopEntitlements", () =>
      prisma.shopEntitlements.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("ShopSettings", () =>
      prisma.shopSettings.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 8: Delete sessions (authentication data)
    // ================================================================

    await safeDeleteModel("Session", () =>
      prisma.session.deleteMany({ where: { shop } })
    );

    const durationMs = Date.now() - startTime;
    const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);

    console.log(
      `[ShopCleanup] Completed cleanup for ${shop}: ${totalDeleted} total records deleted in ${durationMs}ms`
    );

    if (errors.length > 0) {
      console.warn(`[ShopCleanup] Completed with ${errors.length} non-fatal errors`);
    }

    return {
      success: true,
      shop,
      deletedCounts,
      errors,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[ShopCleanup] Fatal error during cleanup for ${shop}:`, error);

    return {
      success: false,
      shop,
      deletedCounts,
      errors: [...errors, `Fatal error: ${error.message}`],
      durationMs,
    };
  }
}

/**
 * Get count of all records for a shop (for verification/debugging)
 */
export async function getShopDataCounts(shop: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // Count key tables
  counts.sessions = await prisma.session.count({ where: { shop } });
  counts.customers = await prisma.customer.count({ where: { shop } });
  counts.orders = await prisma.order.count({ where: { shop } });
  counts.tiers = await prisma.tier.count({ where: { shop } });
  counts.pointsLedger = await prisma.pointsLedger.count({ where: { shop } });
  counts.storeCreditLedger = await prisma.storeCreditLedger.count({ where: { shop } });

  return counts;
}
