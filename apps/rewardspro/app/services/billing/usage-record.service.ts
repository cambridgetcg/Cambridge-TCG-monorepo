import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../../db.server";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

/**
 * Service for managing usage-based billing records
 * Implements daily batching strategy to avoid cluttering merchant invoices
 *
 * @pattern Daily batching at midnight UTC
 * @security Idempotency keys prevent double-charging
 */

export interface UsageCharge {
  amount: number;
  description: string;
  currencyCode?: string;
  idempotencyKey?: string;
}

export interface UsageSummary {
  shop: string;
  date: Date;
  ordersProcessed: number;
  cashbackIssued: number;
  customersActive: number;
  pendingChargeAmount: number;
}

export class UsageRecordService {
  private admin: AdminApiContext;
  private shop: string;

  constructor(admin: AdminApiContext, shop: string) {
    this.admin = admin;
    this.shop = shop;
  }

  /**
   * Generate idempotency key for usage charges
   * Format: shop-YYYY-MM-DD-batchType
   */
  private generateIdempotencyKey(date: Date, batchType: string = "daily"): string {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const shopSlug = this.shop.replace('.myshopify.com', '');
    return `${shopSlug}-${dateStr}-${batchType}`;
  }

  /**
   * Get the subscription line item ID for usage charges
   */
  async getUsageLineItemId(): Promise<string | null> {
    const query = `
      query getUsageLineItem {
        currentAppInstallation {
          activeSubscriptions {
            id
            status
            lineItems {
              id
              plan {
                pricingDetails {
                  ... on AppUsagePricing {
                    cappedAmount {
                      amount
                      currencyCode
                    }
                    balanceRemaining {
                      amount
                    }
                    balanceUsed {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.admin.graphql(query);
      const data = await response.json();

      const activeSubscription = data?.data?.currentAppInstallation?.activeSubscriptions?.find(
        (sub: any) => sub.status === "ACTIVE"
      );

      if (!activeSubscription) {
        console.log(`[UsageRecord] No active subscription for ${this.shop}`);
        return null;
      }

      // Find the usage-based line item
      const usageLineItem = activeSubscription.lineItems?.find((item: any) =>
        item.plan?.pricingDetails?.__typename === "AppUsagePricing"
      );

      if (!usageLineItem) {
        console.log(`[UsageRecord] No usage line item found for ${this.shop}`);
        return null;
      }

      // Check if we're approaching the cap
      const cappedAmount = parseFloat(usageLineItem.plan.pricingDetails.cappedAmount?.amount || "0");
      const balanceUsed = parseFloat(usageLineItem.plan.pricingDetails.balanceUsed?.amount || "0");
      const balanceRemaining = parseFloat(usageLineItem.plan.pricingDetails.balanceRemaining?.amount || cappedAmount);

      const usagePercentage = (balanceUsed / cappedAmount) * 100;
      if (usagePercentage >= 90) {
        console.warn(`[UsageRecord] Shop ${this.shop} approaching cap: ${usagePercentage.toFixed(2)}% used`);
        // TODO: Send notification to merchant
      }

      console.log(`[UsageRecord] Found usage line item for ${this.shop}:`, {
        lineItemId: usageLineItem.id,
        cappedAmount,
        balanceUsed,
        balanceRemaining,
        usagePercentage: usagePercentage.toFixed(2),
      });

      return usageLineItem.id;

    } catch (error) {
      console.error("[UsageRecord] Error getting usage line item:", error);
      return null;
    }
  }

  /**
   * Create a usage record charge
   */
  async createUsageCharge(charge: UsageCharge): Promise<{ success: boolean; error?: string; chargeId?: string }> {
    // Get the usage line item ID
    const lineItemId = await this.getUsageLineItemId();
    if (!lineItemId) {
      return { success: false, error: "No active usage subscription found" };
    }

    // Generate idempotency key if not provided
    const idempotencyKey = charge.idempotencyKey || this.generateIdempotencyKey(new Date());

    const mutation = `
      mutation createUsageRecord(
        $lineItemId: ID!
        $amount: Decimal!
        $currencyCode: CurrencyCode!
        $description: String!
        $idempotencyKey: String!
      ) {
        appUsageRecordCreate(
          subscriptionLineItemId: $lineItemId
          price: { amount: $amount, currencyCode: $currencyCode }
          description: $description
          idempotencyKey: $idempotencyKey
        ) {
          appUsageRecord {
            id
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      lineItemId,
      amount: charge.amount.toFixed(2),
      currencyCode: charge.currencyCode || "USD",
      description: charge.description,
      idempotencyKey,
    };

    try {
      console.log(`[UsageRecord] Creating usage charge for ${this.shop}:`, {
        amount: charge.amount,
        description: charge.description,
        idempotencyKey,
      });

      const response = await this.admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data?.data?.appUsageRecordCreate?.userErrors?.length > 0) {
        const errors = data.data.appUsageRecordCreate.userErrors;
        const errorMessage = errors.map((e: any) => e.message).join(", ");

        // Check if error is due to exceeding cap
        if (errorMessage.includes("exceed") || errorMessage.includes("cap")) {
          console.error(`[UsageRecord] Cap exceeded for ${this.shop}`);
          // Update subscription status in DB
          try {
            await prisma.billingSubscription.update({
              where: { shop: this.shop },
              data: {
                balanceRemaining: 0,
                updatedAt: new Date(),
              }
            });
          } catch (dbError) {
            console.log("[UsageRecord] Could not update subscription in DB");
          }
        }

        return { success: false, error: errorMessage };
      }

      const chargeId = data?.data?.appUsageRecordCreate?.appUsageRecord?.id;
      console.log(`[UsageRecord] Usage charge created successfully: ${chargeId}`);

      // Store usage record in database
      try {
        await prisma.usageRecord.create({
          data: {
            id: uuidv4(),
            shop: this.shop,
            chargeId: chargeId || "",
            amount: charge.amount,
            description: charge.description,
            idempotencyKey,
            createdAt: new Date(),
          }
        });
      } catch (dbError: any) {
        if (!dbError.message?.includes('usageRecord')) {
          console.error("[UsageRecord] Database error:", dbError);
        }
      }

      return { success: true, chargeId };

    } catch (error) {
      console.error("[UsageRecord] Error creating usage charge:", error);
      return { success: false, error: "Failed to create usage charge" };
    }
  }

  /**
   * Process daily usage batch for a shop
   * Aggregates all usage for the day and creates a single charge
   */
  async processDailyUsageBatch(date?: Date): Promise<{ success: boolean; error?: string }> {
    const targetDate = date || new Date();
    targetDate.setUTCHours(0, 0, 0, 0);

    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    try {
      // Check if USE_NEW_BILLING is enabled
      const useNewBilling = process.env.USE_NEW_BILLING === 'true';
      if (!useNewBilling) {
        console.log(`[UsageRecord] New billing disabled for ${this.shop}`);
        return { success: true, error: "New billing not enabled" };
      }

      // Check if shop has active subscription with usage component
      const lineItemId = await this.getUsageLineItemId();
      if (!lineItemId) {
        console.log(`[UsageRecord] No usage subscription for ${this.shop}`);
        return { success: true, error: "No usage subscription" };
      }

      // Aggregate usage data for the day
      const [ordersData, customersData] = await Promise.all([
        // Count orders processed
        prisma.order.count({
          where: {
            shop: this.shop,
            createdAt: {
              gte: targetDate,
              lt: nextDay,
            }
          }
        }),
        // Count active customers
        prisma.customer.count({
          where: {
            shop: this.shop,
            lastOrderDate: {
              gte: targetDate,
              lt: nextDay,
            }
          }
        })
      ]);

      // Calculate total cashback issued for the day
      const cashbackData = await prisma.storeCreditLedger.aggregate({
        where: {
          shop: this.shop,
          type: "CASHBACK_EARNED",
          createdAt: {
            gte: targetDate,
            lt: nextDay,
          }
        },
        _sum: {
          amount: true,
        }
      });

      const totalCashback = cashbackData._sum.amount || 0;

      // Calculate usage charge amount based on your pricing model
      // Example: $0.01 per order + $0.001 per dollar of cashback
      const orderCharge = ordersData * 0.01;
      const cashbackCharge = totalCashback * 0.001;
      const totalCharge = orderCharge + cashbackCharge;

      if (totalCharge === 0) {
        console.log(`[UsageRecord] No usage to charge for ${this.shop} on ${targetDate.toISOString()}`);
        return { success: true };
      }

      // Create the daily usage charge
      const dateStr = targetDate.toISOString().split('T')[0];
      const charge: UsageCharge = {
        amount: totalCharge,
        description: `RewardsPro usage for ${dateStr} (${ordersData} orders, $${totalCashback.toFixed(2)} cashback)`,
        idempotencyKey: this.generateIdempotencyKey(targetDate),
      };

      const result = await this.createUsageCharge(charge);

      if (result.success) {
        // Store usage summary in database
        try {
          await prisma.usageSummary.create({
            data: {
              id: uuidv4(),
              shop: this.shop,
              date: targetDate,
              ordersProcessed: ordersData,
              cashbackIssued: totalCashback,
              customersActive: customersData,
              chargeAmount: totalCharge,
              chargeId: result.chargeId || null,
              createdAt: new Date(),
            }
          });
        } catch (dbError: any) {
          if (!dbError.message?.includes('usageSummary')) {
            console.error("[UsageRecord] Could not store usage summary:", dbError);
          }
        }

        console.log(`[UsageRecord] Daily usage batch processed for ${this.shop}:`, {
          date: dateStr,
          orders: ordersData,
          cashback: totalCashback,
          charge: totalCharge,
        });
      }

      return result;

    } catch (error) {
      console.error("[UsageRecord] Error processing daily batch:", error);
      return { success: false, error: "Failed to process usage batch" };
    }
  }

  /**
   * Get usage summary for a date range
   */
  async getUsageSummary(startDate: Date, endDate: Date): Promise<UsageSummary[]> {
    try {
      const summaries = await prisma.usageSummary.findMany({
        where: {
          shop: this.shop,
          date: {
            gte: startDate,
            lte: endDate,
          }
        },
        orderBy: {
          date: 'desc',
        }
      });

      return summaries.map(s => ({
        shop: s.shop,
        date: s.date,
        ordersProcessed: s.ordersProcessed,
        cashbackIssued: s.cashbackIssued,
        customersActive: s.customersActive,
        pendingChargeAmount: s.chargeAmount,
      }));

    } catch (error: any) {
      if (error.message?.includes('usageSummary')) {
        console.log("[UsageRecord] Usage summary table not available");
        return [];
      }
      console.error("[UsageRecord] Error fetching usage summary:", error);
      return [];
    }
  }
}