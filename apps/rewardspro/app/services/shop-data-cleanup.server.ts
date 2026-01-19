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

import db from "~/db.server";

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
      db.pointsLedger.deleteMany({ where: { shop } })
    );

    // Raffle system
    await safeDeleteModel("RaffleWinner", () =>
      db.raffleWinner.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("RaffleEntry", () =>
      db.raffleEntry.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("RafflePrize", () =>
      db.rafflePrize.deleteMany({ where: { raffle: { shop } } })
    );
    await safeDeleteModel("Raffle", () =>
      db.raffle.deleteMany({ where: { shop } })
    );

    // Mystery box system
    await safeDeleteModel("MysteryBoxWinner", () =>
      db.mysteryBoxWinner.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("MysteryBoxOpen", () =>
      db.mysteryBoxOpen.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("MysteryBoxReward", () =>
      db.mysteryBoxReward.deleteMany({ where: { mysteryBox: { shop } } })
    );
    await safeDeleteModel("MysteryBox", () =>
      db.mysteryBox.deleteMany({ where: { shop } })
    );

    // Email system
    await safeDeleteModel("EmailEvent", () =>
      db.emailEvent.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("EmailCampaign", () =>
      db.emailCampaign.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("EmailAutomation", () =>
      db.emailAutomation.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("EmailTemplate", () =>
      db.emailTemplate.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SendGridDomain", () =>
      db.sendGridDomain.deleteMany({ where: { shop } })
    );

    // Analytics
    await safeDeleteModel("AnalyticsRecommendation", () =>
      db.analyticsRecommendation.deleteMany({ where: { shop } })
    );

    // Webhook processing records
    await safeDeleteModel("WebhookProcessed", () =>
      db.webhookProcessed.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("WebhookError", () =>
      db.webhookError.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("WebhookProcess", () =>
      db.webhookProcess.deleteMany({ where: { shop } })
    );

    // System records
    await safeDeleteModel("DeadLetterQueue", () =>
      db.deadLetterQueue.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SyncStatus", () =>
      db.syncStatus.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("Notification", () =>
      db.notification.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 2: Delete order-related records
    // ================================================================

    await safeDeleteModel("OrderRefundLineItem", () =>
      db.orderRefundLineItem.deleteMany({ where: { refund: { order: { shop } } } })
    );
    await safeDeleteModel("OrderRefund", () =>
      db.orderRefund.deleteMany({ where: { order: { shop } } })
    );
    await safeDeleteModel("OrderLineItem", () =>
      db.orderLineItem.deleteMany({ where: { order: { shop } } })
    );

    // Store credit ledger (references orders)
    await safeDeleteModel("StoreCreditLedger", () =>
      db.storeCreditLedger.deleteMany({ where: { shop } })
    );

    await safeDeleteModel("Order", () =>
      db.order.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 3: Delete subscription-related records
    // ================================================================

    await safeDeleteModel("SubscriptionEvent", () =>
      db.subscriptionEvent.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SubscriptionRetry", () =>
      db.subscriptionRetry.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SubscriptionBillingAttempt", () =>
      db.subscriptionBillingAttempt.deleteMany({ where: { subscription: { shop } } })
    );
    await safeDeleteModel("SubscriptionPricingHistory", () =>
      db.subscriptionPricingHistory.deleteMany({ where: { shop } })
    );

    // Tier subscriptions and purchases
    await safeDeleteModel("TierSubscription", () =>
      db.tierSubscription.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("TierPurchase", () =>
      db.tierPurchase.deleteMany({ where: { shop } })
    );

    // Selling plans
    await safeDeleteModel("SellingPlan", () =>
      db.sellingPlan.deleteMany({ where: { group: { shop } } })
    );
    await safeDeleteModel("SellingPlanGroup", () =>
      db.sellingPlanGroup.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 4: Delete customer-related records
    // ================================================================

    await safeDeleteModel("CustomerTierState", () =>
      db.customerTierState.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("TierChangeLog", () =>
      db.tierChangeLog.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("Customer", () =>
      db.customer.deleteMany({ where: { shop } })
    );

    // Sync jobs
    await safeDeleteModel("CustomerSyncJob", () =>
      db.customerSyncJob.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("StoreCreditSyncJob", () =>
      db.storeCreditSyncJob.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("OrderSyncJob", () =>
      db.orderSyncJob.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("BulkOperationLog", () =>
      db.bulkOperationLog.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 5: Delete tier configuration
    // ================================================================

    await safeDeleteModel("TierProduct", () =>
      db.tierProduct.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("Tier", () =>
      db.tier.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 6: Delete billing records
    // ================================================================

    await safeDeleteModel("UsageRecord", () =>
      db.usageRecord.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("MonthlyOrderUsage", () =>
      db.monthlyOrderUsage.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("BillingHistory", () =>
      db.billingHistory.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("BillingAuditLog", () =>
      db.billingAuditLog.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("TierTrialAuditLog", () =>
      db.tierTrialAuditLog.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("AppSubscription", () =>
      db.appSubscription.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("BillingSubscription", () =>
      db.billingSubscription.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 7: Delete configuration and settings
    // ================================================================

    await safeDeleteModel("PointsConfig", () =>
      db.pointsConfig.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("SubscriptionPricingConfig", () =>
      db.subscriptionPricingConfig.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("EmailSettings", () =>
      db.emailSettings.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("ShopEntitlements", () =>
      db.shopEntitlements.deleteMany({ where: { shop } })
    );
    await safeDeleteModel("ShopSettings", () =>
      db.shopSettings.deleteMany({ where: { shop } })
    );

    // ================================================================
    // PHASE 8: Delete sessions (authentication data)
    // ================================================================

    await safeDeleteModel("Session", () =>
      db.session.deleteMany({ where: { shop } })
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
  counts.sessions = await db.session.count({ where: { shop } });
  counts.customers = await db.customer.count({ where: { shop } });
  counts.orders = await db.order.count({ where: { shop } });
  counts.tiers = await db.tier.count({ where: { shop } });
  counts.pointsLedger = await db.pointsLedger.count({ where: { shop } });
  counts.storeCreditLedger = await db.storeCreditLedger.count({ where: { shop } });

  return counts;
}
