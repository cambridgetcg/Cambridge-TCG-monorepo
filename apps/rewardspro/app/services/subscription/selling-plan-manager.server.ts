/**
 * Selling Plan Manager Service
 * Handles creation and management of Shopify selling plans for tier subscriptions
 */

import { GraphqlQueryError } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { SUBSCRIPTION_CONFIG, type BillingInterval } from "./config.server";
import crypto from 'crypto';
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

export class SellingPlanManager {
  /**
   * Create selling plan group for tier products
   */
  static async createSellingPlanGroup({
    shop,
    admin,
    tierIds,
    productVariantMap,
  }: CreateSellingPlanGroupInput): Promise<SellingPlanGroupResult> {
    console.log(`Creating selling plan group for shop: ${shop}`);

    // Check if selling plan group already exists
    const existingGroup = await db.sellingPlanGroup.findFirst({
      where: { shop, merchantCode: SUBSCRIPTION_CONFIG.SELLING_PLAN.MERCHANT_CODE },
      include: { sellingPlans: true },
    });

    if (existingGroup) {
      console.log('Selling plan group already exists, updating...');
      return this.updateSellingPlanGroup({ shop, admin, existingGroup, productVariantMap });
    }

    // Create selling plans for each interval
    const sellingPlansToCreate = Object.entries(SUBSCRIPTION_CONFIG.BILLING_INTERVALS).map(
      ([key, interval]) => ({
        name: interval.label,
        options: [`Every ${interval.label.toLowerCase()}`],
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

    try {
      const response = await admin.graphql(mutation, {
        variables: {
          input: {
            name: SUBSCRIPTION_CONFIG.SELLING_PLAN.GROUP_NAME,
            merchantCode: SUBSCRIPTION_CONFIG.SELLING_PLAN.MERCHANT_CODE,
            description: 'Recurring billing for tier membership subscriptions',
            options: [SUBSCRIPTION_CONFIG.SELLING_PLAN.OPTIONS_TITLE],
            position: SUBSCRIPTION_CONFIG.SELLING_PLAN.POSITION,
            sellingPlansToCreate,
          },
        },
      });

      const data = await response.json();
      
      if (data.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
        throw new Error(
          `Failed to create selling plan group: ${data.data.sellingPlanGroupCreate.userErrors
            .map((e: any) => e.message)
            .join(', ')}`
        );
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
          summary: 'Subscribe and save on tier memberships',
          active: true,
          position: SUBSCRIPTION_CONFIG.SELLING_PLAN.POSITION,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Store individual selling plans
      const sellingPlans = [];
      for (const edge of sellingPlanGroup.sellingPlans.edges) {
        const plan = edge.node;
        const intervalKey = this.getIntervalKeyFromPlan(plan);
        
        const dbPlan = await db.sellingPlan.create({
          data: {
            id: uuidv4(),
            sellingPlanGroupId: groupId,
            shopifySellingPlanId: plan.id,
            name: plan.name,
            description: `${plan.name} subscription for tier membership`,
            billingInterval: intervalKey as any,
            intervalCount: plan.billingPolicy.intervalCount,
            discountType: 'PERCENTAGE',
            discountValue: SUBSCRIPTION_CONFIG.BILLING_INTERVALS[intervalKey as BillingInterval].discountPercentage,
            position: SUBSCRIPTION_CONFIG.BILLING_INTERVALS[intervalKey as BillingInterval].days,
            active: true,
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

      return {
        id: sellingPlanGroup.id,
        sellingPlans,
      };
    } catch (error) {
      console.error('Error creating selling plan group:', error);
      throw error;
    }
  }

  /**
   * Update existing selling plan group with new products
   */
  private static async updateSellingPlanGroup({
    shop,
    admin,
    existingGroup,
    productVariantMap,
  }: any): Promise<SellingPlanGroupResult> {
    // Add new products to existing selling plan group
    await this.associateProductsWithSellingPlanGroup({
      admin,
      sellingPlanGroupId: existingGroup.shopifySellingPlanGroupId,
      productVariantIds: Array.from(productVariantMap.values()),
    });

    return {
      id: existingGroup.shopifySellingPlanGroupId,
      sellingPlans: existingGroup.sellingPlans.map((plan: any) => ({
        id: plan.shopifySellingPlanId,
        name: plan.name,
        interval: plan.billingInterval,
      })),
    };
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
        console.error(
          'Errors adding products to selling plan group:',
          data.data.sellingPlanGroupAddProductVariants.userErrors
        );
      }
    } catch (error) {
      console.error('Error associating products with selling plan group:', error);
      throw error;
    }
  }

  /**
   * Remove selling plan group
   */
  static async removeSellingPlanGroup({
    shop,
    admin,
  }: {
    shop: string;
    admin: AdminApiContext;
  }): Promise<void> {
    const existingGroup = await db.sellingPlanGroup.findFirst({
      where: { shop },
    });

    if (!existingGroup) {
      console.log('No selling plan group to remove');
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

    try {
      const response = await admin.graphql(mutation, {
        variables: {
          id: existingGroup.shopifySellingPlanGroupId,
        },
      });

      const data = await response.json();
      
      if (data.data?.sellingPlanGroupDelete?.userErrors?.length > 0) {
        throw new Error(
          `Failed to delete selling plan group: ${data.data.sellingPlanGroupDelete.userErrors
            .map((e: any) => e.message)
            .join(', ')}`
        );
      }

      // Remove from database (cascade will handle selling plans)
      await db.sellingPlanGroup.delete({
        where: { id: existingGroup.id },
      });

      console.log('Selling plan group removed successfully');
    } catch (error) {
      console.error('Error removing selling plan group:', error);
      throw error;
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
    console.log(`Associating product ${productId} with selling plan group`);

    // Get or create selling plan group
    const existingGroup = await db.sellingPlanGroup.findFirst({
      where: { shop, merchantCode: SUBSCRIPTION_CONFIG.SELLING_PLAN.MERCHANT_CODE },
      include: { sellingPlans: true },
    });

    let sellingPlanGroupId: string;
    let sellingPlans: any[];

    if (existingGroup) {
      // Use existing group
      sellingPlanGroupId = existingGroup.shopifySellingPlanGroupId;
      sellingPlans = existingGroup.sellingPlans;
      
      // Add product to existing group
      await this.associateProductsWithSellingPlanGroup({
        admin,
        sellingPlanGroupId,
        productVariantIds: [variantId],
      });
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
      sellingPlanIds: sellingPlans.map(plan => plan.shopifySellingPlanId || plan.id),
    };
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
      console.error('Error checking product selling plans:', error);
      return false;
    }
  }
}