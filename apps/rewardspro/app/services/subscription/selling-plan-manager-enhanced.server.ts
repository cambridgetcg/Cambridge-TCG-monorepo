/**
 * Enhanced Selling Plan Manager Service
 * Consolidated version combining the best features from both implementations
 * Handles creation and management of Shopify selling plans for tier subscriptions
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { SUBSCRIPTION_CONFIG, type BillingInterval } from "./config.server";
import crypto from 'node:crypto';
const uuidv4 = () => crypto.randomUUID();

interface CreateSellingPlanGroupInput {
  shop: string;
  admin: AdminApiContext;
  tierIds: string[];
  productVariantMap: Map<string, string>; // tierId -> variantId
}

interface SellingPlanGroupResult {
  id: string;
  sellingPlans: Array<{
    id: string;
    name: string;
    interval: BillingInterval;
  }>;
}

interface UpdatePricingInput {
  shop: string;
  admin: AdminApiContext;
  sellingPlanId: string;
  newPrice: number;
  reason?: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  synced?: number;
  errors?: string[];
}

export class SellingPlanManager {
  private static readonly SERVICE_PREFIX = '[SellingPlanManager]';

  /**
   * Log helper for consistent logging
   */
  private static log(message: string, data?: any) {
    console.log(`${this.SERVICE_PREFIX} ${message}`, data || '');
  }

  private static error(message: string, error: any) {
    console.error(`${this.SERVICE_PREFIX} ❌ ${message}`, error);
  }

  /**
   * Create selling plan group for tier products
   * Enhanced with better error handling and logging
   */
  static async createSellingPlanGroup({
    shop,
    admin,
    tierIds,
    productVariantMap,
  }: CreateSellingPlanGroupInput): Promise<SellingPlanGroupResult> {
    this.log(`Creating selling plan group for shop: ${shop}`);

    try {
      // Check if selling plan group already exists
      const existingGroup = await db.sellingPlanGroup.findFirst({
        where: { shop, merchantCode: SUBSCRIPTION_CONFIG.SELLING_PLAN.MERCHANT_CODE },
      });
      
      if (existingGroup) {
        this.log('Selling plan group already exists, updating...');
        // Fetch related selling plans
        const sellingPlans = await db.sellingPlan.findMany({
          where: { groupId: existingGroup.id }
        });
        
        return this.updateSellingPlanGroup({ 
          shop, 
          admin, 
          existingGroup: { ...existingGroup, sellingPlans }, 
          productVariantMap 
        });
      }

      // Create selling plans for each interval
      const sellingPlansToCreate = Object.entries(SUBSCRIPTION_CONFIG.BILLING_INTERVALS).map(
        ([, interval]) => ({
          name: `${interval.label} Membership`,
          options: [`Tier membership billed ${interval.label.toLowerCase()}`],
          position: interval.days, // Sort by duration
          billingPolicy: {
            recurring: {
              interval: interval.interval,
              intervalCount: interval.intervalCount,
            },
          },
          deliveryPolicy: {
            recurring: {
              interval: interval.interval,
              intervalCount: interval.intervalCount,
              anchors: []  // No physical delivery needed
            },
          },
          pricingPolicies: [
            {
              fixed: {
                adjustmentType: 'PERCENTAGE',
                adjustmentValue: {
                  percentage: interval.discountPercentage,
                },
              },
            },
          ],
        })
      );

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

      const response = await admin.graphql(mutation, {
        variables: {
          input: {
            name: SUBSCRIPTION_CONFIG.SELLING_PLAN.GROUP_NAME,
            merchantCode: SUBSCRIPTION_CONFIG.SELLING_PLAN.MERCHANT_CODE,
            description: 'Exclusive tier membership with recurring billing',
            options: [SUBSCRIPTION_CONFIG.SELLING_PLAN.OPTIONS_TITLE],
            position: SUBSCRIPTION_CONFIG.SELLING_PLAN.POSITION,
            sellingPlansToCreate,
          },
        },
      });

      const data = await response.json();
      
      if (data.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
        const errors = data.data.sellingPlanGroupCreate.userErrors
          .map((e: any) => e.message)
          .join(', ');
        throw new Error(`Failed to create selling plan group: ${errors}`);
      }

      const sellingPlanGroup = data.data?.sellingPlanGroupCreate?.sellingPlanGroup;
      if (!sellingPlanGroup) {
        throw new Error('No selling plan group returned from mutation');
      }

      // Store in database
      const groupId = uuidv4();
      await db.sellingPlanGroup.create({
        data: {
          id: groupId,
          shop,
          shopifySellingPlanGroupId: sellingPlanGroup.id,
          name: sellingPlanGroup.name,
          merchantCode: sellingPlanGroup.merchantCode,
          tierProducts: Array.from(productVariantMap.values()),
          metadata: {
            tierIds,
            createdVia: 'SellingPlanManager',
            createdAt: new Date().toISOString(),
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Store individual selling plans
      const sellingPlans = [];
      for (const edge of sellingPlanGroup.sellingPlans.edges) {
        const plan = edge.node;
        const intervalKey = this.getIntervalKeyFromPlan(plan);
        
        await db.sellingPlan.create({
          data: {
            id: uuidv4(),
            groupId: groupId,
            shopifyPlanId: plan.id,
            name: plan.name,
            position: SUBSCRIPTION_CONFIG.BILLING_INTERVALS[intervalKey as BillingInterval].days,
            billingInterval: intervalKey as BillingInterval,
            intervalCount: plan.billingPolicy.intervalCount,
            discountType: 'PERCENTAGE',
            discountValue: SUBSCRIPTION_CONFIG.BILLING_INTERVALS[intervalKey as BillingInterval].discountPercentage,
            options: { billingFrequency: plan.name },
            metadata: {
              pricingPolicy: plan.pricingPolicies[0],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        sellingPlans.push({
          id: plan.id,
          name: plan.name,
          interval: intervalKey as BillingInterval,
        });
      }

      // Associate products with selling plan group
      await this.associateProductsWithSellingPlanGroup({
        admin,
        sellingPlanGroupId: sellingPlanGroup.id,
        productVariantIds: Array.from(productVariantMap.values()),
      });

      this.log(`Selling plan group created successfully: ${sellingPlanGroup.id}`);

      return {
        id: sellingPlanGroup.id,
        sellingPlans,
      };
    } catch (error) {
      this.error('Error creating selling plan group:', error);
      throw error;
    }
  }

  /**
   * Update existing selling plan group with new products
   */
  private static async updateSellingPlanGroup({
    admin,
    existingGroup,
    productVariantMap,
  }: any): Promise<SellingPlanGroupResult> {
    try {
      // Add new products to existing selling plan group
      await this.associateProductsWithSellingPlanGroup({
        admin,
        sellingPlanGroupId: existingGroup.shopifySellingPlanGroupId,
        productVariantIds: Array.from(productVariantMap.values()),
      });

      // Update local database
      await db.sellingPlanGroup.update({
        where: { id: existingGroup.id },
        data: {
          tierProducts: Array.from(productVariantMap.values()),
          updatedAt: new Date(),
        },
      });

      return {
        id: existingGroup.shopifySellingPlanGroupId,
        sellingPlans: existingGroup.sellingPlans.map((plan: any) => ({
          id: plan.shopifyPlanId,
          name: plan.name,
          interval: plan.billingInterval,
        })),
      };
    } catch (error) {
      this.error('Error updating selling plan group:', error);
      throw error;
    }
  }

  /**
   * Associate product variants with selling plan group
   */
  private static async associateProductsWithSellingPlanGroup({
    admin,
    sellingPlanGroupId,
    productVariantIds,
  }: {
    admin: AdminApiContext;
    sellingPlanGroupId: string;
    productVariantIds: string[];
  }): Promise<void> {
    const mutation = `
      mutation AddProductsToSellingPlanGroup($id: ID!, $productVariantIds: [ID!]!) {
        sellingPlanGroupAddProductVariants(
          id: $id
          productVariantIds: $productVariantIds
        ) {
          sellingPlanGroup {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(mutation, {
        variables: {
          id: sellingPlanGroupId,
          productVariantIds,
        },
      });

      const data = await response.json();
      
      if (data.data?.sellingPlanGroupAddProductVariants?.userErrors?.length > 0) {
        this.error(
          'Errors adding products to selling plan group:',
          data.data.sellingPlanGroupAddProductVariants.userErrors
        );
      }
    } catch (error) {
      this.error('Error associating products with selling plan group:', error);
      throw error;
    }
  }

  /**
   * Remove selling plan group
   * Enhanced with proper cleanup
   */
  static async removeSellingPlanGroup({
    shop,
    admin,
  }: {
    shop: string;
    admin: AdminApiContext;
  }): Promise<void> {
    this.log(`Removing selling plan group for shop: ${shop}`);

    try {
      const existingGroup = await db.sellingPlanGroup.findFirst({
        where: { shop },
      });

      if (!existingGroup) {
        this.log('No selling plan group to remove');
        return;
      }

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

      const response = await admin.graphql(mutation, {
        variables: {
          id: existingGroup.shopifySellingPlanGroupId,
        },
      });

      const data = await response.json();
      
      if (data.data?.sellingPlanGroupDelete?.userErrors?.length > 0) {
        const errors = data.data.sellingPlanGroupDelete.userErrors
          .map((e: any) => e.message)
          .join(', ');
        throw new Error(`Failed to delete selling plan group: ${errors}`);
      }

      // Remove from database (cascade will handle selling plans)
      await db.sellingPlanGroup.delete({
        where: { id: existingGroup.id },
      });

      this.log('Selling plan group removed successfully');
    } catch (error) {
      this.error('Error removing selling plan group:', error);
      throw error;
    }
  }

  /**
   * Update selling plan pricing with history tracking
   * NEW: From tier-products version
   */
  static async updateSellingPlanPricing({
    admin,
    sellingPlanId,
    newPrice,
  }: UpdatePricingInput): Promise<{ success: boolean; message: string }> {
    this.log(`Updating selling plan pricing: ${sellingPlanId}`);

    try {
      // First, get the current selling plan details
      const query = `
        query GetSellingPlan($id: ID!) {
          sellingPlan: node(id: $id) {
            ... on SellingPlan {
              id
              name
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
      `;

      const response = await admin.graphql(query, {
        variables: { id: sellingPlanId }
      });

      const data = await response.json();
      const sellingPlan = data.data?.sellingPlan;

      if (!sellingPlan) {
        throw new Error('Selling plan not found');
      }

      // Update the pricing
      const mutation = `
        mutation UpdateSellingPlan($id: ID!, $input: SellingPlanInput!) {
          sellingPlanUpdate(id: $id, input: $input) {
            sellingPlan {
              id
              pricingPolicies {
                ... on SellingPlanFixedPricingPolicy {
                  adjustmentType
                  adjustmentValue {
                    ... on MoneyV2 {
                      amount
                      currencyCode
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

      const updateResponse = await admin.graphql(mutation, {
        variables: {
          id: sellingPlanId,
          input: {
            pricingPolicies: [{
              fixed: {
                adjustmentType: 'PRICE',
                adjustmentValue: {
                  fixedValue: newPrice
                }
              }
            }]
          }
        }
      });

      const updateData = await updateResponse.json();
      
      if (updateData.data?.sellingPlanUpdate?.userErrors?.length > 0) {
        const errors = updateData.data.sellingPlanUpdate.userErrors
          .map((e: any) => e.message)
          .join(', ');
        throw new Error(`Failed to update selling plan pricing: ${errors}`);
      }

      // TODO: Record pricing history in database if needed
      this.log(`Pricing updated successfully for plan: ${sellingPlanId}`);

      return {
        success: true,
        message: `Pricing updated to ${newPrice}`,
      };
    } catch (error) {
      this.error('Error updating selling plan pricing:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update pricing',
      };
    }
  }

  /**
   * Sync selling plans from Shopify to local database
   * NEW: From tier-products version
   */
  static async syncSellingPlansFromShopify({
    shop,
    admin,
  }: {
    shop: string;
    admin: AdminApiContext;
  }): Promise<SyncResult> {
    this.log(`Syncing selling plans from Shopify for shop: ${shop}`);

    try {
      const query = `
        query GetSellingPlanGroups {
          sellingPlanGroups(first: 100) {
            edges {
              node {
                id
                name
                merchantCode
                options
                productVariants(first: 100) {
                  edges {
                    node {
                      id
                    }
                  }
                }
                sellingPlans(first: 100) {
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
        return {
          success: false,
          message: 'No selling plan groups found',
        };
      }

      let syncedCount = 0;
      const errors: string[] = [];

      for (const groupEdge of data.data.sellingPlanGroups.edges) {
        const group = groupEdge.node;
        
        try {
          // Upsert selling plan group
          const groupId = uuidv4();
          await db.sellingPlanGroup.upsert({
            where: {
              shopifySellingPlanGroupId: group.id,
            },
            update: {
              name: group.name,
              merchantCode: group.merchantCode,
              tierProducts: group.productVariants.edges.map((e: any) => e.node.id),
              updatedAt: new Date(),
            },
            create: {
              id: groupId,
              shop,
              shopifySellingPlanGroupId: group.id,
              name: group.name,
              merchantCode: group.merchantCode,
              tierProducts: group.productVariants.edges.map((e: any) => e.node.id),
              metadata: {
                options: group.options,
                syncedAt: new Date().toISOString(),
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          // Sync selling plans
          for (const planEdge of group.sellingPlans.edges) {
            const plan = planEdge.node;
            
            const billingPolicy = plan.billingPolicy;
            const pricingPolicy = plan.pricingPolicies[0];
            
            let discountType: "PERCENTAGE" | "FIXED_AMOUNT" = "PERCENTAGE";
            let discountValue = 0;
            
            if (pricingPolicy?.adjustmentType === "PERCENTAGE") {
              discountType = "PERCENTAGE";
              discountValue = pricingPolicy.adjustmentValue?.percentage || 0;
            }
            
            await db.sellingPlan.upsert({
              where: {
                shopifyPlanId: plan.id,
              },
              update: {
                name: plan.name,
                position: plan.position,
                billingInterval: this.mapShopifyInterval(billingPolicy.interval),
                intervalCount: billingPolicy.intervalCount,
                discountType,
                discountValue,
                updatedAt: new Date(),
              },
              create: {
                id: uuidv4(),
                groupId: groupId,
                shopifyPlanId: plan.id,
                name: plan.name,
                position: plan.position,
                billingInterval: this.mapShopifyInterval(billingPolicy.interval),
                intervalCount: billingPolicy.intervalCount,
                discountType,
                discountValue,
                options: { billingFrequency: plan.name },
                metadata: {
                  pricingPolicy,
                  syncedAt: new Date().toISOString(),
                },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
          }
          
          syncedCount++;
        } catch (error) {
          const errorMsg = `Failed to sync group ${group.id}: ${error}`;
          this.error(errorMsg, error);
          errors.push(errorMsg);
        }
      }

      this.log(`Sync completed. Synced ${syncedCount} selling plan groups`);

      return {
        success: true,
        message: `Successfully synced ${syncedCount} selling plan groups`,
        synced: syncedCount,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      this.error('Error syncing selling plans:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to sync selling plans',
      };
    }
  }

  /**
   * Get all selling plan groups for a shop
   * NEW: From tier-products version
   */
  static async getSellingPlanGroups({
    shop,
  }: {
    shop: string;
  }): Promise<any[]> {
    try {
      const groups = await db.sellingPlanGroup.findMany({
        where: { shop },
        include: {
          plans: true,
        },
      });
      
      return groups;
    } catch (error) {
      this.error('Error fetching selling plan groups:', error);
      return [];
    }
  }

  /**
   * Delete a selling plan group
   * NEW: Enhanced version with proper cleanup
   */
  static async deleteSellingPlanGroup({
    shop,
    admin,
    sellingPlanGroupId,
  }: {
    shop: string;
    admin: AdminApiContext;
    sellingPlanGroupId: string;
  }): Promise<{ success: boolean; message: string }> {
    this.log(`Deleting selling plan group: ${sellingPlanGroupId}`);

    try {
      // Find the group in local database
      const group = await db.sellingPlanGroup.findFirst({
        where: {
          shop,
          shopifySellingPlanGroupId: sellingPlanGroupId,
        },
      });

      if (!group) {
        return {
          success: false,
          message: 'Selling plan group not found in database',
        };
      }

      // Delete from Shopify
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

      const response = await admin.graphql(mutation, {
        variables: { id: sellingPlanGroupId },
      });

      const data = await response.json();
      
      if (data.data?.sellingPlanGroupDelete?.userErrors?.length > 0) {
        const errors = data.data.sellingPlanGroupDelete.userErrors
          .map((e: any) => e.message)
          .join(', ');
        throw new Error(`Shopify error: ${errors}`);
      }

      // Delete from local database
      await db.sellingPlanGroup.delete({
        where: { id: group.id },
      });

      this.log(`Successfully deleted selling plan group: ${sellingPlanGroupId}`);

      return {
        success: true,
        message: 'Selling plan group deleted successfully',
      };
    } catch (error) {
      this.error('Error deleting selling plan group:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete selling plan group',
      };
    }
  }

  /**
   * Associate a single product with existing selling plan group
   */
  static async associateProductWithSellingPlanGroup({
    shop,
    admin,
    productId,
    variantId,
    tierId,
  }: {
    shop: string;
    admin: AdminApiContext;
    productId: string;
    variantId: string;
    tierId: string;
  }): Promise<{
    sellingPlanGroupId: string;
    sellingPlanIds: string[];
  }> {
    this.log(`Associating product ${productId} with selling plan group`);

    try {
      // Get or create selling plan group
      const existingGroup = await db.sellingPlanGroup.findFirst({
        where: { shop, merchantCode: SUBSCRIPTION_CONFIG.SELLING_PLAN.MERCHANT_CODE },
      });

      let sellingPlanGroupId: string;
      let sellingPlans: any[];

      if (existingGroup) {
        // Use existing group
        sellingPlanGroupId = existingGroup.shopifySellingPlanGroupId;
        // Fetch selling plans separately
        sellingPlans = await db.sellingPlan.findMany({
          where: { groupId: existingGroup.id }
        });
        
        // Add product to existing group
        await this.associateProductsWithSellingPlanGroup({
          admin,
          sellingPlanGroupId,
          productVariantIds: [variantId],
        });

        // Update tierProducts array in database
        const currentProducts = (existingGroup.tierProducts as any[]) || [];
        if (!currentProducts.includes(variantId)) {
          await db.sellingPlanGroup.update({
            where: { id: existingGroup.id },
            data: {
              tierProducts: [...currentProducts, variantId],
              updatedAt: new Date(),
            },
          });
        }
      } else {
        // Create new group with this product
        const productVariantMap = new Map([[tierId, variantId]]);
        const result = await this.createSellingPlanGroup({
          shop,
          admin,
          tierIds: [tierId],
          productVariantMap,
        });
        
        sellingPlanGroupId = result.id;
        sellingPlans = result.sellingPlans;
      }

      return {
        sellingPlanGroupId,
        sellingPlanIds: sellingPlans.map(plan => plan.shopifyPlanId || plan.id),
      };
    } catch (error) {
      this.error('Error associating product with selling plan group:', error);
      throw error;
    }
  }

  /**
   * Check if a product has selling plans
   */
  static async productHasSellingPlans({
    admin,
    productId,
  }: {
    admin: AdminApiContext;
    productId: string;
  }): Promise<boolean> {
    const query = `
      query GetProductSellingPlans($id: ID!) {
        product(id: $id) {
          sellingPlanGroups(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(query, {
        variables: { id: productId },
      });

      const data = await response.json();
      return data.data?.product?.sellingPlanGroups?.edges?.length > 0;
    } catch (error) {
      this.error('Error checking product selling plans:', error);
      return false;
    }
  }

  /**
   * Helper to determine interval key from plan data
   */
  private static getIntervalKeyFromPlan(plan: any): string {
    const interval = plan.billingPolicy.interval;
    const intervalCount = plan.billingPolicy.intervalCount;

    if (interval === 'MONTH' && intervalCount === 1) return 'MONTHLY';
    if (interval === 'MONTH' && intervalCount === 3) return 'QUARTERLY';
    if (interval === 'YEAR' && intervalCount === 1) return 'ANNUAL';
    
    return 'MONTHLY'; // Default
  }

  /**
   * Map Shopify interval to our BillingInterval enum
   */
  private static mapShopifyInterval(interval: string): BillingInterval {
    switch (interval) {
      case 'WEEK':
        return 'WEEKLY' as BillingInterval;
      case 'MONTH':
        return 'MONTHLY' as BillingInterval;
      case 'YEAR':
        return 'ANNUAL' as BillingInterval;
      default:
        return 'MONTHLY' as BillingInterval;
    }
  }
}

// Export alias for compatibility
export const SellingPlanManagerEnhanced = SellingPlanManager;
