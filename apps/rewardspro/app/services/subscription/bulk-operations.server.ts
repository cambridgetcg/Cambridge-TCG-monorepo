/**
 * Bulk Operations Service
 * Handles mass updates for subscriptions, pricing, and tier assignments
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { batchWithRetry } from "~/utils/retry";
import { validatePrice, batchValidatePrices } from "~/utils/price-validation";
import { PriceSyncService } from "./price-sync.server";
import { TierSubscriptionBridgeV2 } from "./tier-subscription-bridge.server";
import { SubscriptionMigrator } from "./subscription-migrator.server";

export interface BulkPriceUpdate {
  planId: string;
  newPrice: number;
  applyToExisting?: boolean;
  effectiveDate?: Date;
}

export interface BulkStatusUpdate {
  subscriptionIds: string[];
  newStatus: SubscriptionStatus;
  reason: string;
}

export interface BulkOperationResult<T = any> {
  totalProcessed: number;
  successful: number;
  failed: number;
  results: T[];
  errors: Array<{ id: string; error: string }>;
  duration: number;
}

export interface BatchProcessOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  stopOnError?: boolean;
  maxConcurrent?: number;
}

export class BulkOperations {
  /**
   * Update prices for multiple selling plans
   */
  static async updatePrices(
    shop: string,
    admin: AdminApiContext,
    updates: BulkPriceUpdate[]
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const results: any[] = [];
    const errors: Array<{ id: string; error: string }> = [];
    let successful = 0;
    let failed = 0;

    // Validate all prices first
    const priceValidations = updates.map(u => ({
      price: u.newPrice,
      currency: 'USD' // Should get from shop settings
    }));

    const validation = batchValidatePrices(priceValidations);
    if (!validation.valid && !validation.results.some(r => r.valid)) {
      return {
        totalProcessed: 0,
        successful: 0,
        failed: updates.length,
        results: [],
        errors: validation.errors.map((e, i) => ({
          id: updates[i].planId,
          error: e
        })),
        duration: Date.now() - startTime
      };
    }

    // Process each price update
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const priceValidation = validation.results[i];

      if (!priceValidation.valid) {
        failed++;
        errors.push({
          id: update.planId,
          error: priceValidation.error || 'Invalid price'
        });
        continue;
      }

      try {
        // Update selling plan price in database
        await db.$transaction(async (tx) => {
          const sellingPlan = await tx.sellingPlan.findFirst({
            where: {
              shopifySellingPlanId: update.planId,
              sellingPlanGroup: { shop }
            }
          });

          if (!sellingPlan) {
            throw new Error(`Selling plan ${update.planId} not found`);
          }

          // Update price in database
          await tx.sellingPlan.update({
            where: { id: sellingPlan.id },
            data: {
              currentPrice: priceValidation.sanitizedPrice!,
              updatedAt: new Date()
            }
          });

          // Track price history
          await tx.subscriptionPricingHistory.create({
            data: {
              id: crypto.randomUUID(),
              shop,
              sellingPlanId: update.planId,
              oldPrice: sellingPlan.currentPrice || 0,
              newPrice: priceValidation.sanitizedPrice!,
              changeReason: 'Bulk price update',
              changedBy: 'System',
              effectiveDate: update.effectiveDate || new Date(),
              appliedToActive: update.applyToExisting || false,
              affectedContracts: 0, // Would need to calculate
              createdAt: new Date()
            }
          });

          // Get associated product for sync
          const tierProduct = await tx.tierProduct.findFirst({
            where: {
              shop,
              sellingPlanGroupId: sellingPlan.sellingPlanGroupId
            }
          });

          if (tierProduct) {
            // Sync with Shopify
            await PriceSyncService.syncProductWithSellingPlans({
              shop,
              admin,
              productId: tierProduct.shopifyProductId,
              variantId: tierProduct.shopifyVariantId,
              newPrice: priceValidation.sanitizedPrice!,
              sellingPlanGroupId: sellingPlan.sellingPlanGroupId
            });
          }

          // Update existing subscriptions if requested
          if (update.applyToExisting) {
            await tx.tierSubscription.updateMany({
              where: {
                shop,
                sellingPlanId: update.planId,
                status: 'ACTIVE'
              },
              data: {
                currentPrice: priceValidation.sanitizedPrice!,
                updatedAt: new Date()
              }
            });
          }
        });

        successful++;
        results.push({
          planId: update.planId,
          newPrice: priceValidation.sanitizedPrice!,
          success: true
        });

      } catch (error) {
        failed++;
        errors.push({
          id: update.planId,
          error: error instanceof Error ? error.message : 'Update failed'
        });
      }
    }

    return {
      totalProcessed: updates.length,
      successful,
      failed,
      results,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Update status for multiple subscriptions
   */
  static async updateStatuses(
    shop: string,
    updates: BulkStatusUpdate
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    
    const { successful: successfulResults, failed: failedResults } = await batchWithRetry(
      updates.subscriptionIds,
      async (subscriptionId) => {
        await TierSubscriptionBridgeV2.handleStatusChange({
          shop,
          subscriptionId,
          newStatus: updates.newStatus,
          reason: updates.reason
        });
        return { subscriptionId, success: true };
      },
      { maxAttempts: 2 }
    );

    return {
      totalProcessed: updates.subscriptionIds.length,
      successful: successfulResults.length,
      failed: failedResults.length,
      results: successfulResults,
      errors: failedResults.map(f => ({
        id: f.item,
        error: f.error.message
      })),
      duration: Date.now() - startTime
    };
  }

  /**
   * Cancel all subscriptions for a tier
   */
  static async cancelTierSubscriptions(
    shop: string,
    tierId: string,
    reason: string
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();

    // Find all active subscriptions for the tier
    const subscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        tierId,
        status: { in: ['ACTIVE', 'PAUSED'] }
      },
      select: { id: true }
    });

    const subscriptionIds = subscriptions.map(s => s.id);

    return this.updateStatuses(shop, {
      subscriptionIds,
      newStatus: 'CANCELLED',
      reason
    });
  }

  /**
   * Pause subscriptions with payment issues
   */
  static async pauseFailedPayments(
    shop: string,
    daysSinceFailure = 3
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceFailure);

    const failedSubscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        status: 'FAILED',
        updatedAt: { lte: cutoffDate }
      },
      select: { id: true }
    });

    return this.updateStatuses(shop, {
      subscriptionIds: failedSubscriptions.map(s => s.id),
      newStatus: 'PAUSED',
      reason: `Payment failed for ${daysSinceFailure}+ days`
    });
  }

  /**
   * Migrate all customers to a new tier structure
   */
  static async migrateTierStructure(
    shop: string,
    admin: AdminApiContext,
    mappings: Array<{ fromTierId: string; toTierId: string; toPlanId: string }>
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const results: any[] = [];
    const errors: Array<{ id: string; error: string }> = [];
    let successful = 0;
    let failed = 0;

    for (const mapping of mappings) {
      // Find subscriptions on the old tier
      const subscriptions = await db.tierSubscription.findMany({
        where: {
          shop,
          tierId: mapping.fromTierId,
          status: 'ACTIVE'
        },
        select: { id: true }
      });

      // Migrate each subscription
      for (const subscription of subscriptions) {
        try {
          const migrationResult = await SubscriptionMigrator.migratePlan(
            shop,
            admin,
            subscription.id,
            mapping.toPlanId,
            {
              immediateSwitch: true,
              creditUnusedTime: true,
              preservePrice: true,
              reason: 'Tier structure migration'
            }
          );

          if (migrationResult.success) {
            successful++;
            results.push(migrationResult);
          } else {
            failed++;
            errors.push({
              id: subscription.id,
              error: migrationResult.error || 'Migration failed'
            });
          }
        } catch (error) {
          failed++;
          errors.push({
            id: subscription.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return {
      totalProcessed: successful + failed,
      successful,
      failed,
      results,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Process operations in batches for better performance
   */
  static async processBatched<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options: BatchProcessOptions = {}
  ): Promise<BulkOperationResult<R>> {
    const {
      batchSize = 10,
      delayBetweenBatches = 1000,
      stopOnError = false,
      maxConcurrent = 5
    } = options;

    const startTime = Date.now();
    const results: R[] = [];
    const errors: Array<{ id: string; error: string }> = [];
    let successful = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Process batch with concurrency limit
      const batchPromises = batch.map((item, index) => 
        processor(item)
          .then(result => {
            successful++;
            results.push(result);
            return { success: true, result };
          })
          .catch(error => {
            failed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push({
              id: `item-${i + index}`,
              error: errorMessage
            });
            
            if (stopOnError) {
              throw error;
            }
            
            return { success: false, error: errorMessage };
          })
      );

      // Wait for batch to complete
      try {
        await Promise.all(batchPromises);
      } catch (error) {
        if (stopOnError) {
          break;
        }
      }

      // Delay between batches if not the last batch
      if (i + batchSize < items.length && delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return {
      totalProcessed: items.length,
      successful,
      failed,
      results,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Generate bulk operation report
   */
  static async generateReport(
    shop: string,
    operationType: string,
    result: BulkOperationResult
  ): Promise<string> {
    const report = {
      shop,
      operationType,
      timestamp: new Date().toISOString(),
      summary: {
        total: result.totalProcessed,
        successful: result.successful,
        failed: result.failed,
        successRate: `${((result.successful / result.totalProcessed) * 100).toFixed(2)}%`,
        duration: `${result.duration}ms`
      },
      errors: result.errors,
      metadata: {
        averageTimePerItem: `${(result.duration / result.totalProcessed).toFixed(2)}ms`
      }
    };

    // Store report in database
    await db.bulkOperationLog.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        operationType,
        report: report as Prisma.JsonObject,
        successful: result.successful,
        failed: result.failed,
        total: result.totalProcessed,
        createdAt: new Date()
      }
    });

    return JSON.stringify(report, null, 2);
  }
}