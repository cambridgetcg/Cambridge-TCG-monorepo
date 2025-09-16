/**
 * Selling Plan Manager Service
 * 
 * Manages Shopify selling plans for tier product subscriptions:
 * - Creates and updates selling plan groups
 * - Manages billing intervals and discounts
 * - Syncs selling plans with Shopify
 * - Handles pricing updates
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import type { BillingInterval, SellingPlan, SellingPlanGroup } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface SellingPlanConfig {
  name: string;
  billingInterval: BillingInterval;
  intervalCount: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  position: number;
}

interface SellingPlanGroupConfig {
  shop: string;
  name: string;
  merchantCode: string;
  plans: SellingPlanConfig[];
  productIds: string[];
}

interface PricingUpdate {
  sellingPlanId: string;
  newPrice?: number;
  newDiscount?: number;
  effectiveDate: Date;
}

interface SellingPlanSyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class SellingPlanManager {
  /**
   * Create a new selling plan group with multiple plans
   */
  static async createSellingPlanGroup(
    admin: AdminApiContext,
    config: SellingPlanGroupConfig
  ): Promise<{ success: boolean; groupId?: string; error?: string }> {
    try {
      console.log(`[SellingPlanManager] Creating selling plan group: ${config.name}`);

      const mutation = `
        mutation CreateSellingPlanGroup($input: SellingPlanGroupInput!) {
          sellingPlanGroupCreate(input: $input) {
            sellingPlanGroup {
              id
              name
              merchantCode
              sellingPlans(first: 10) {
                edges {
                  node {
                    id
                    name
                    billingPolicy {
                      ... on SellingPlanRecurringBillingPolicy {
                        interval
                        intervalCount
                      }
                    }
                    pricingPolicies {
                      ... on SellingPlanFixedPricingPolicy {
                        adjustmentType
                        adjustmentValue {
                          ... on SellingPlanPricingPolicyPercentageValue {
                            percentage
                          }
                          ... on MoneyV2 {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const sellingPlansToCreate = config.plans.map(plan => ({
        name: plan.name,
        options: [plan.name],
        position: plan.position,
        billingPolicy: {
          recurring: {
            interval: plan.billingInterval,
            intervalCount: plan.intervalCount,
          },
        },
        deliveryPolicy: {
          recurring: {
            interval: plan.billingInterval,
            intervalCount: plan.intervalCount,
          },
        },
        pricingPolicies: [
          plan.discountType === "PERCENTAGE"
            ? {
                fixed: {
                  adjustmentType: "PERCENTAGE",
                  adjustmentValue: {
                    percentage: plan.discountValue,
                  },
                },
              }
            : {
                fixed: {
                  adjustmentType: "FIXED_AMOUNT",
                  adjustmentValue: {
                    fixedValue: plan.discountValue,
                  },
                },
              },
        ],
      }));

      const variables = {
        input: {
          name: config.name,
          merchantCode: config.merchantCode,
          options: ["Billing Frequency"],
          position: 1,
          sellingPlansToCreate,
        },
      };

      const response = await admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
        const errors = data.data.sellingPlanGroupCreate.userErrors;
        console.error("[SellingPlanManager] Creation errors:", errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      const group = data.data?.sellingPlanGroupCreate?.sellingPlanGroup;
      if (!group) {
        return {
          success: false,
          error: "Failed to create selling plan group",
        };
      }

      // Save to database
      const dbGroup = await db.sellingPlanGroup.create({
        data: {
          id: uuidv4(),
          shop: config.shop,
          shopifyGroupId: group.id,
          name: group.name,
          merchantCode: config.merchantCode,
          tierProducts: config.productIds,
          metadata: {
            createdAt: new Date().toISOString(),
            options: ["Billing Frequency"],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Save individual plans
      for (const edge of group.sellingPlans.edges) {
        const plan = edge.node;
        const configPlan = config.plans.find(p => p.name === plan.name);
        
        if (configPlan) {
          await db.sellingPlan.create({
            data: {
              id: uuidv4(),
              groupId: dbGroup.id,
              shopifyPlanId: plan.id,
              name: plan.name,
              position: configPlan.position,
              billingInterval: configPlan.billingInterval,
              intervalCount: configPlan.intervalCount,
              discountType: configPlan.discountType,
              discountValue: configPlan.discountValue,
              options: { billingFrequency: plan.name },
              metadata: {
                shopifyGroupId: group.id,
              },
              createdAt: new Date(),
            },
          });
        }
      }

      // Associate products with the group
      if (config.productIds.length > 0) {
        await this.addProductsToSellingPlanGroup(admin, group.id, config.productIds);
      }

      console.log(`[SellingPlanManager] Successfully created group ${group.id}`);

      return {
        success: true,
        groupId: group.id,
      };
    } catch (error) {
      console.error("[SellingPlanManager] Error creating selling plan group:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Add products to an existing selling plan group
   */
  static async addProductsToSellingPlanGroup(
    admin: AdminApiContext,
    groupId: string,
    productIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const mutation = `
        mutation AddProductsToSellingPlanGroup($id: ID!, $productIds: [ID!]!) {
          sellingPlanGroupAddProducts(
            id: $id
            productIds: $productIds
          ) {
            sellingPlanGroup {
              id
              productCount
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await admin.graphql(mutation, {
        variables: { id: groupId, productIds },
      });
      const data = await response.json();

      if (data.data?.sellingPlanGroupAddProducts?.userErrors?.length > 0) {
        const errors = data.data.sellingPlanGroupAddProducts.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      // Update database with new product associations
      const dbGroup = await db.sellingPlanGroup.findFirst({
        where: { shopifyGroupId: groupId },
      });

      if (dbGroup) {
        const currentProducts = (dbGroup.tierProducts as string[]) || [];
        const updatedProducts = [...new Set([...currentProducts, ...productIds])];
        
        await db.sellingPlanGroup.update({
          where: { id: dbGroup.id },
          data: {
            tierProducts: updatedProducts,
            updatedAt: new Date(),
          },
        });
      }

      return { success: true };
    } catch (error) {
      console.error("[SellingPlanManager] Error adding products to group:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update pricing for a selling plan
   */
  static async updateSellingPlanPricing(
    admin: AdminApiContext,
    update: PricingUpdate
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[SellingPlanManager] Updating pricing for plan ${update.sellingPlanId}`);

      // Get the selling plan from database
      const dbPlan = await db.sellingPlan.findFirst({
        where: { shopifyPlanId: update.sellingPlanId },
      });

      if (!dbPlan) {
        return {
          success: false,
          error: "Selling plan not found in database",
        };
      }

      // Record pricing history
      await db.subscriptionPricingHistory.create({
        data: {
          id: uuidv4(),
          shop: "", // TODO: Get shop from context
          sellingPlanId: dbPlan.id,
          billingInterval: dbPlan.billingInterval,
          previousPrice: dbPlan.basePrice || 0,
          newPrice: update.newPrice || dbPlan.basePrice || 0,
          previousDiscount: dbPlan.currentDiscount || 0,
          newDiscount: update.newDiscount || dbPlan.currentDiscount || 0,
          changedBy: "system",
          changeReason: "Pricing update",
          effectiveDate: update.effectiveDate,
          createdAt: new Date(),
        },
      });

      // Update selling plan in database
      await db.sellingPlan.update({
        where: { id: dbPlan.id },
        data: {
          basePrice: update.newPrice || dbPlan.basePrice,
          currentDiscount: update.newDiscount || dbPlan.currentDiscount,
          lastPriceUpdate: new Date(),
        },
      });

      // Update in Shopify (if needed)
      // Note: Shopify selling plans have limited update capabilities
      // May need to create new plans and migrate subscriptions

      return { success: true };
    } catch (error) {
      console.error("[SellingPlanManager] Error updating pricing:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get all selling plan groups for a shop
   */
  static async getSellingPlanGroups(
    shop: string
  ): Promise<SellingPlanGroup[]> {
    return await db.sellingPlanGroup.findMany({
      where: { shop },
      include: {
        plans: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Sync selling plans from Shopify to database
   */
  static async syncSellingPlansFromShopify(
    admin: AdminApiContext,
    shop: string
  ): Promise<SellingPlanSyncResult> {
    const result: SellingPlanSyncResult = {
      success: false,
      synced: 0,
      failed: 0,
      errors: [],
    };

    try {
      const query = `
        query GetSellingPlanGroups {
          sellingPlanGroups(first: 50) {
            edges {
              node {
                id
                name
                merchantCode
                options
                productCount
                sellingPlans(first: 10) {
                  edges {
                    node {
                      id
                      name
                      position
                      billingPolicy {
                        ... on SellingPlanRecurringBillingPolicy {
                          interval
                          intervalCount
                        }
                      }
                      pricingPolicies {
                        ... on SellingPlanFixedPricingPolicy {
                          adjustmentType
                          adjustmentValue {
                            ... on SellingPlanPricingPolicyPercentageValue {
                              percentage
                            }
                            ... on MoneyV2 {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await admin.graphql(query);
      const data = await response.json();

      if (!data.data?.sellingPlanGroups?.edges) {
        result.errors.push("No selling plan groups found");
        return result;
      }

      for (const edge of data.data.sellingPlanGroups.edges) {
        const group = edge.node;

        try {
          // Upsert selling plan group
          const dbGroup = await db.sellingPlanGroup.upsert({
            where: { shopifyGroupId: group.id },
            update: {
              name: group.name,
              merchantCode: group.merchantCode,
              metadata: {
                options: group.options,
                productCount: group.productCount,
                lastSynced: new Date().toISOString(),
              },
              updatedAt: new Date(),
            },
            create: {
              id: uuidv4(),
              shop,
              shopifyGroupId: group.id,
              name: group.name,
              merchantCode: group.merchantCode,
              tierProducts: [],
              metadata: {
                options: group.options,
                productCount: group.productCount,
                lastSynced: new Date().toISOString(),
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          // Sync individual plans
          for (const planEdge of group.sellingPlans.edges) {
            const plan = planEdge.node;
            
            // Extract billing interval and discount
            const billingPolicy = plan.billingPolicy;
            const pricingPolicy = plan.pricingPolicies[0];
            
            let discountType: "PERCENTAGE" | "FIXED_AMOUNT" = "PERCENTAGE";
            let discountValue = 0;

            if (pricingPolicy) {
              discountType = pricingPolicy.adjustmentType === "PERCENTAGE" 
                ? "PERCENTAGE" 
                : "FIXED_AMOUNT";
              
              if (pricingPolicy.adjustmentValue.percentage !== undefined) {
                discountValue = pricingPolicy.adjustmentValue.percentage;
              } else if (pricingPolicy.adjustmentValue.amount !== undefined) {
                discountValue = parseFloat(pricingPolicy.adjustmentValue.amount);
              }
            }

            await db.sellingPlan.upsert({
              where: { shopifyPlanId: plan.id },
              update: {
                name: plan.name,
                position: plan.position,
                billingInterval: this.mapShopifyInterval(billingPolicy.interval),
                intervalCount: billingPolicy.intervalCount,
                discountType,
                discountValue,
                metadata: {
                  lastSynced: new Date().toISOString(),
                },
              },
              create: {
                id: uuidv4(),
                groupId: dbGroup.id,
                shopifyPlanId: plan.id,
                name: plan.name,
                position: plan.position,
                billingInterval: this.mapShopifyInterval(billingPolicy.interval),
                intervalCount: billingPolicy.intervalCount,
                discountType,
                discountValue,
                options: { billingFrequency: plan.name },
                metadata: {
                  lastSynced: new Date().toISOString(),
                },
                createdAt: new Date(),
              },
            });
          }

          result.synced++;
        } catch (error) {
          result.failed++;
          result.errors.push(
            `Failed to sync group ${group.id}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      result.success = result.synced > 0;
      console.log(`[SellingPlanManager] Sync complete: ${result.synced} synced, ${result.failed} failed`);

      return result;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : "Unknown error during sync"
      );
      return result;
    }
  }

  /**
   * Delete a selling plan group
   */
  static async deleteSellingPlanGroup(
    admin: AdminApiContext,
    groupId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const mutation = `
        mutation DeleteSellingPlanGroup($id: ID!) {
          sellingPlanGroupDelete(id: $id) {
            deletedSellingPlanGroupId
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await admin.graphql(mutation, { variables: { id: groupId } });
      const data = await response.json();

      if (data.data?.sellingPlanGroupDelete?.userErrors?.length > 0) {
        const errors = data.data.sellingPlanGroupDelete.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      // Delete from database
      const dbGroup = await db.sellingPlanGroup.findFirst({
        where: { shopifyGroupId: groupId },
      });

      if (dbGroup) {
        // Delete associated plans first
        await db.sellingPlan.deleteMany({
          where: { groupId: dbGroup.id },
        });

        // Delete the group
        await db.sellingPlanGroup.delete({
          where: { id: dbGroup.id },
        });
      }

      return { success: true };
    } catch (error) {
      console.error("[SellingPlanManager] Error deleting selling plan group:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Map Shopify interval to our BillingInterval enum
   */
  private static mapShopifyInterval(shopifyInterval: string): BillingInterval {
    const mappings: Record<string, BillingInterval> = {
      WEEK: "WEEKLY",
      MONTH: "MONTHLY",
      YEAR: "ANNUAL",
    };

    return mappings[shopifyInterval] || "MONTHLY";
  }

  /**
   * Get default selling plans for tier products
   */
  static getDefaultTierSellingPlans(): SellingPlanConfig[] {
    return [
      {
        name: "Monthly",
        billingInterval: "MONTHLY",
        intervalCount: 1,
        discountType: "PERCENTAGE",
        discountValue: 0,
        position: 1,
      },
      {
        name: "Quarterly",
        billingInterval: "MONTHLY",
        intervalCount: 3,
        discountType: "PERCENTAGE",
        discountValue: 5,
        position: 2,
      },
      {
        name: "Annual",
        billingInterval: "ANNUAL",
        intervalCount: 1,
        discountType: "PERCENTAGE",
        discountValue: 15,
        position: 3,
      },
    ];
  }
}