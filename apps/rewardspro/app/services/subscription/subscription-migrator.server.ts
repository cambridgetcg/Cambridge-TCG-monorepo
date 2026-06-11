/**
 * Subscription Migration Service
 * Handles plan changes, upgrades, downgrades, and bulk migrations
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import type { TierSubscription, Prisma } from "@prisma/client";
import { withRetry } from "~/utils/retry";
import { validatePrice } from "~/utils/price-validation";
import { updateCustomerToEffectiveTier } from "../tier-resolution.server";

export interface MigrationOptions {
  immediateSwitch?: boolean;      // Switch immediately or at next billing
  creditUnusedTime?: boolean;      // Prorate and credit unused time
  preservePrice?: boolean;         // Keep current price (grandfathering)
  notifyCustomer?: boolean;        // Send notification email
  reason?: string;                 // Reason for migration
}

export interface MigrationResult {
  success: boolean;
  subscriptionId: string;
  previousPlanId: string;
  newPlanId: string;
  credit?: number;
  effectiveDate: Date;
  error?: string;
}

export interface BulkMigrationResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  results: MigrationResult[];
  errors: string[];
}

export class SubscriptionMigrator {
  /**
   * Migrate a subscription to a different plan
   */
  static async migratePlan(
    shop: string,
    admin: AdminApiContext,
    subscriptionId: string,
    newPlanId: string,
    options: MigrationOptions = {}
  ): Promise<MigrationResult> {
    const {
      immediateSwitch = false,
      creditUnusedTime = true,
      preservePrice = false,
      notifyCustomer = true,
      reason = 'Customer requested plan change'
    } = options;

    try {
      // Use transaction for atomic operation
      const result = await db.$transaction(async (tx) => {
        // 1. Get current subscription
        const subscription = await tx.tierSubscription.findUnique({
          where: { id: subscriptionId },
          include: {
            customer: true,
            tier: true,
          }
        });

        if (!subscription || subscription.shop !== shop) {
          throw new Error(`Subscription ${subscriptionId} not found`);
        }

        if (subscription.status !== 'ACTIVE') {
          throw new Error(`Can only migrate active subscriptions. Current status: ${subscription.status}`);
        }

        // 2. Get new selling plan details
        const newSellingPlan = await tx.sellingPlan.findFirst({
          where: {
            shopifySellingPlanId: newPlanId,
            sellingPlanGroup: {
              shop
            }
          },
          include: {
            sellingPlanGroup: true
          }
        });

        if (!newSellingPlan) {
          throw new Error(`Selling plan ${newPlanId} not found`);
        }

        // 3. Get associated tier product for new plan
        const newTierProduct = await tx.tierProduct.findFirst({
          where: {
            shop,
            sellingPlanGroupId: newSellingPlan.sellingPlanGroup.shopifySellingPlanGroupId
          }
        });

        if (!newTierProduct) {
          throw new Error(`No tier product found for selling plan ${newPlanId}`);
        }

        // 4. Calculate prorated credit if needed
        let creditAmount = 0;
        if (creditUnusedTime && subscription.nextBillingDate) {
          // Cast dates explicitly to avoid TypeScript deep type instantiation error
          const lastBilling = (subscription.lastBillingDate || subscription.startDate) as Date;
          const nextBilling = subscription.nextBillingDate as Date;
          creditAmount = await this.calculateProratedCredit(
            subscription.currentPrice.toNumber(),
            lastBilling,
            nextBilling,
            new Date()
          );
        }

        // 5. Determine new price
        const newPrice = preservePrice ? 
          subscription.currentPrice.toNumber() : 
          newSellingPlan.currentPrice?.toNumber() || 0;

        // Validate new price
        const priceValidation = validatePrice(newPrice, 'USD');
        if (!priceValidation.valid) {
          throw new Error(`Invalid price for new plan: ${priceValidation.error}`);
        }

        // 6. Update subscription in Shopify
        if (immediateSwitch) {
          await this.updateShopifyContract(
            admin,
            subscription.shopifyContractId,
            newPlanId,
            creditAmount
          );
        }

        // 7. Create migration record
        const migrationData = {
          fromPlanId: subscription.sellingPlanId,
          toPlanId: newPlanId,
          fromTierId: subscription.tierId,
          toTierId: newTierProduct.tierId,
          creditAmount,
          preservedPrice: preservePrice,
          effectiveDate: immediateSwitch ? new Date() : subscription.nextBillingDate,
          reason,
        };

        // 8. Update local subscription record
        const updatedSubscription = await tx.tierSubscription.update({
          where: { id: subscriptionId },
          data: {
            sellingPlanId: immediateSwitch ? newPlanId : subscription.sellingPlanId,
            tierId: immediateSwitch ? newTierProduct.tierId : subscription.tierId,
            currentPrice: priceValidation.sanitizedPrice!,
            metadata: {
              ...subscription.metadata,
              migration: migrationData,
              pendingMigration: !immediateSwitch ? {
                toPlanId: newPlanId,
                toTierId: newTierProduct.tierId,
                effectiveDate: subscription.nextBillingDate,
              } : undefined,
            } as Prisma.JsonObject,
            updatedAt: new Date(),
          }
        });

        // 9. Log the migration
        await tx.tierChangeLog.create({
          data: {
            id: crypto.randomUUID(),
            customerId: subscription.customerId,
            shop,
            fromTierId: subscription.tierId,
            toTierId: newTierProduct.tierId,
            fromTierName: subscription.tier.name,
            toTierName: newTierProduct.tier?.name || null,
            changeType: this.determineChangeType(subscription.tier, newTierProduct),
            triggerType: 'SUBSCRIPTION_UPGRADED',
            subscriptionId,
            metadata: migrationData as Prisma.JsonObject,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });

        // 10. Update customer tier if immediate switch
        if (immediateSwitch) {
          await updateCustomerToEffectiveTier(shop, subscription.customerId, {
            triggeredBy: 'subscription_migration',
            subscriptionId: subscription.id
          });
        }

        return {
          subscription: updatedSubscription,
          previousPlanId: subscription.sellingPlanId,
          newPlanId,
          credit: creditAmount,
          effectiveDate: immediateSwitch ? new Date() : subscription.nextBillingDate!,
        };
      });

      // 11. Send customer notification if requested
      if (notifyCustomer) {
        await this.sendMigrationNotification(result.subscription);
      }

      return {
        success: true,
        subscriptionId,
        previousPlanId: result.previousPlanId,
        newPlanId: result.newPlanId,
        credit: result.credit,
        effectiveDate: result.effectiveDate,
      };

    } catch (error) {
      console.error(`[SubscriptionMigrator] Migration failed for ${subscriptionId}:`, error);
      return {
        success: false,
        subscriptionId,
        previousPlanId: '',
        newPlanId,
        effectiveDate: new Date(),
        error: error instanceof Error ? error.message : 'Migration failed',
      };
    }
  }

  /**
   * Bulk migrate multiple subscriptions
   */
  static async bulkMigrate(
    shop: string,
    admin: AdminApiContext,
    migrations: Array<{
      subscriptionId: string;
      newPlanId: string;
      options?: MigrationOptions;
    }>
  ): Promise<BulkMigrationResult> {
    const results: MigrationResult[] = [];
    const errors: string[] = [];
    let successful = 0;
    let failed = 0;

    // Process migrations with retry logic
    for (const migration of migrations) {
      try {
        const result = await withRetry(
          () => this.migratePlan(
            shop,
            admin,
            migration.subscriptionId,
            migration.newPlanId,
            migration.options
          ),
          { maxAttempts: 2 }
        );

        results.push(result);
        
        if (result.success) {
          successful++;
        } else {
          failed++;
          if (result.error) {
            errors.push(`${migration.subscriptionId}: ${result.error}`);
          }
        }
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${migration.subscriptionId}: ${errorMessage}`);
        results.push({
          success: false,
          subscriptionId: migration.subscriptionId,
          previousPlanId: '',
          newPlanId: migration.newPlanId,
          effectiveDate: new Date(),
          error: errorMessage,
        });
      }
    }

    return {
      totalProcessed: migrations.length,
      successful,
      failed,
      results,
      errors,
    };
  }

  /**
   * Migrate all subscriptions on a specific plan
   */
  static async migrateAllFromPlan(
    shop: string,
    admin: AdminApiContext,
    fromPlanId: string,
    toPlanId: string,
    options: MigrationOptions = {}
  ): Promise<BulkMigrationResult> {
    // Find all active subscriptions on the source plan
    const subscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        sellingPlanId: fromPlanId,
        status: 'ACTIVE',
      },
      select: { id: true }
    });

    const migrations = subscriptions.map(sub => ({
      subscriptionId: sub.id,
      newPlanId: toPlanId,
      options,
    }));

    return this.bulkMigrate(shop, admin, migrations);
  }

  /**
   * Calculate prorated credit for unused time
   */
  private static async calculateProratedCredit(
    currentPrice: number,
    lastBillingDate: Date,
    nextBillingDate: Date,
    switchDate: Date
  ): Promise<number> {
    const totalDays = Math.floor(
      (nextBillingDate.getTime() - lastBillingDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const usedDays = Math.floor(
      (switchDate.getTime() - lastBillingDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const unusedDays = totalDays - usedDays;
    
    if (unusedDays <= 0) return 0;
    
    const dailyRate = currentPrice / totalDays;
    const credit = dailyRate * unusedDays;
    
    return Math.round(credit * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Update Shopify subscription contract
   */
  private static async updateShopifyContract(
    admin: AdminApiContext,
    contractId: string,
    newSellingPlanId: string,
    creditAmount: number
  ): Promise<void> {
    const mutation = `
      mutation updateSubscriptionContract($contractId: ID!, $input: SubscriptionContractUpdateInput!) {
        subscriptionContractUpdate(contractId: $contractId, input: $input) {
          contract {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      contractId,
      input: {
        sellingPlanId: newSellingPlanId,
        // Add credit as a discount if applicable
        ...(creditAmount > 0 && {
          discounts: [{
            value: {
              fixedAmount: {
                amount: creditAmount,
                currencyCode: 'USD'
              }
            },
            title: 'Plan migration credit',
          }]
        })
      }
    };

    const response = await withRetry(
      () => admin.graphql(mutation, { variables }),
      { maxAttempts: 3 }
    );

    const data = await response.json();
    
    if (data.data?.subscriptionContractUpdate?.userErrors?.length > 0) {
      const errors = data.data.subscriptionContractUpdate.userErrors
        .map((e: any) => e.message)
        .join(', ');
      throw new Error(`Failed to update Shopify contract: ${errors}`);
    }
  }

  /**
   * Determine change type for tier change
   */
  private static determineChangeType(
    fromTier: any,
    toTierProduct: any
  ): 'UPGRADE' | 'DOWNGRADE' {
    // Compare cashback percentages or tier values
    if (!fromTier || !toTierProduct.tier) return 'UPGRADE';
    
    if (toTierProduct.tier.cashbackPercent > fromTier.cashbackPercent) {
      return 'UPGRADE';
    }
    
    return 'DOWNGRADE';
  }

  /**
   * Send customer notification about migration
   */
  private static async sendMigrationNotification(
    subscription: TierSubscription
  ): Promise<void> {
    // This would integrate with your email service
    console.log(`[SubscriptionMigrator] Would send migration notification for subscription ${subscription.id}`);
    
    // Example implementation:
    // await emailService.send({
    //   to: subscription.customer.email,
    //   template: 'subscription-migration',
    //   data: {
    //     customerName: subscription.customer.firstName,
    //     previousPlan: subscription.metadata.migration.fromPlanId,
    //     newPlan: subscription.sellingPlanId,
    //     effectiveDate: subscription.metadata.migration.effectiveDate,
    //     credit: subscription.metadata.migration.creditAmount,
    //   }
    // });
  }

  /**
   * Process pending migrations (scheduled for next billing date)
   */
  static async processPendingMigrations(shop: string, admin: AdminApiContext): Promise<void> {
    const now = new Date();
    
    const pendingMigrations = await db.tierSubscription.findMany({
      where: {
        shop,
        status: 'ACTIVE',
        metadata: {
          path: ['pendingMigration', 'effectiveDate'],
          lte: now.toISOString(),
        }
      }
    });

    for (const subscription of pendingMigrations) {
      const metadata = subscription.metadata as any;
      if (metadata?.pendingMigration) {
        await this.migratePlan(
          shop,
          admin,
          subscription.id,
          metadata.pendingMigration.toPlanId,
          { immediateSwitch: true }
        );
      }
    }
  }
}