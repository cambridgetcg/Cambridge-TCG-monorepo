/**
 * Price Synchronization Service
 * Keeps product prices and selling plan prices in sync
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";

interface SyncPriceInput {
  shop: string;
  admin: AdminApiContext;
  productId: string;
  variantId: string;
  newPrice: number;
  sellingPlanGroupId?: string;
  discountPercentage?: number;
}

interface SyncResult {
  success: boolean;
  productPrice?: number;
  sellingPlanPrices?: Array<{
    planId: string;
    originalPrice: number;
    discountedPrice: number;
  }>;
  errors?: string[];
}

export class PriceSyncService {
  /**
   * Sync price changes between product and selling plans
   */
  static async syncProductWithSellingPlans({
    shop,
    admin,
    productId,
    variantId,
    newPrice,
    sellingPlanGroupId,
    discountPercentage = 10,
  }: SyncPriceInput): Promise<SyncResult> {
    const errors: string[] = [];
    const sellingPlanPrices: SyncResult['sellingPlanPrices'] = [];

    try {
      // Step 1: Update product variant price
      const updateVariantMutation = `
        mutation updateVariantPrice($input: ProductVariantInput!) {
          productVariantUpdate(input: $input) {
            productVariant {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variantResponse = await admin.graphql(updateVariantMutation, {
        variables: {
          input: {
            id: variantId,
            price: newPrice.toString(),
          },
        },
      });

      const variantData = await variantResponse.json();
      
      if (variantData.data?.productVariantUpdate?.userErrors?.length > 0) {
        errors.push(...variantData.data.productVariantUpdate.userErrors.map((e: any) => e.message));
      }

      // Step 2: If selling plan group exists, update selling plan prices
      if (sellingPlanGroupId) {
        // Get all selling plans in the group
        const sellingPlans = await db.sellingPlan.findMany({
          where: {
            sellingPlanGroup: {
              shopifySellingPlanGroupId: sellingPlanGroupId,
            },
          },
        });

        // Update each selling plan with the new price and discount
        for (const plan of sellingPlans) {
          const discountedPrice = newPrice * (1 - (plan.discountValue || discountPercentage) / 100);
          
          try {
            // Update selling plan pricing in Shopify
            const updatePlanMutation = `
              mutation updateSellingPlan($id: ID!, $input: SellingPlanInput!) {
                sellingPlanUpdate(id: $id, input: $input) {
                  sellingPlan {
                    id
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
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            const planResponse = await admin.graphql(updatePlanMutation, {
              variables: {
                id: plan.shopifySellingPlanId,
                input: {
                  pricingPolicies: [
                    {
                      fixed: {
                        adjustmentType: 'PERCENTAGE',
                        adjustmentValue: {
                          percentage: plan.discountValue || discountPercentage,
                        },
                      },
                    },
                  ],
                },
              },
            });

            const planData = await planResponse.json();
            
            if (planData.data?.sellingPlanUpdate?.userErrors?.length > 0) {
              errors.push(...planData.data.sellingPlanUpdate.userErrors.map((e: any) => e.message));
            } else {
              sellingPlanPrices.push({
                planId: plan.shopifySellingPlanId,
                originalPrice: newPrice,
                discountedPrice: parseFloat(discountedPrice.toFixed(2)),
              });
            }

            // Track price history
            await db.subscriptionPricingHistory.create({
              data: {
                shop,
                sellingPlanId: plan.id,
                billingInterval: plan.billingInterval,
                previousPrice: plan.currentPrice || 0,
                newPrice: discountedPrice,
                previousDiscount: plan.discountValue || 0,
                newDiscount: plan.discountValue || discountPercentage,
                changeReason: 'Product price sync',
                changedBy: 'System',
                effectiveDate: new Date(),
              },
            });

            // Update current price in database
            await db.sellingPlan.update({
              where: { id: plan.id },
              data: {
                currentPrice: discountedPrice,
                updatedAt: new Date(),
              },
            });
          } catch (error) {
            console.error(`Error updating selling plan ${plan.id}:`, error);
            errors.push(`Failed to update selling plan ${plan.name}`);
          }
        }
      }

      // Step 3: Update TierProduct record if it exists
      const tierProduct = await db.tierProduct.findFirst({
        where: {
          shop,
          shopifyProductId: productId,
        },
      });

      if (tierProduct) {
        await db.tierProduct.update({
          where: { id: tierProduct.id },
          data: {
            price: newPrice,
            updatedAt: new Date(),
          },
        });
      }

      return {
        success: errors.length === 0,
        productPrice: newPrice,
        sellingPlanPrices,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      console.error('Error syncing prices:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
      };
    }
  }

  /**
   * Batch sync prices for multiple products
   */
  static async batchSyncPrices({
    shop,
    admin,
    updates,
  }: {
    shop: string;
    admin: AdminApiContext;
    updates: Array<{
      productId: string;
      variantId: string;
      newPrice: number;
      sellingPlanGroupId?: string;
    }>;
  }): Promise<{
    successful: number;
    failed: number;
    results: SyncResult[];
  }> {
    const results: SyncResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const update of updates) {
      const result = await this.syncProductWithSellingPlans({
        shop,
        admin,
        ...update,
      });

      results.push(result);
      
      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    return {
      successful,
      failed,
      results,
    };
  }

  /**
   * Validate price consistency across products and plans
   */
  static async validatePriceConsistency({
    shop,
    admin,
  }: {
    shop: string;
    admin: AdminApiContext;
  }): Promise<{
    consistent: boolean;
    inconsistencies: Array<{
      productId: string;
      productTitle: string;
      productPrice: number;
      expectedPlanPrice: number;
      actualPlanPrice: number;
      planName: string;
    }>;
  }> {
    const inconsistencies: any[] = [];

    // Get all tier products with selling plans
    const tierProducts = await db.tierProduct.findMany({
      where: {
        shop,
        hasSubscription: true,
      },
    });

    for (const tierProduct of tierProducts) {
      // Support both canonical field and legacy field for backward compatibility
      const sellingPlanGroupId = tierProduct.shopifySellingPlanGroupId || tierProduct.sellingPlanGroupId;
      if (!sellingPlanGroupId) continue;

      // Get product price from Shopify
      const productQuery = `
        query getProductPrice($id: ID!) {
          product(id: $id) {
            title
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      `;

      const productResponse = await admin.graphql(productQuery, {
        variables: { id: tierProduct.shopifyProductId },
      });

      const productData = await productResponse.json();
      const productPrice = parseFloat(
        productData.data?.product?.variants?.edges?.[0]?.node?.price || '0'
      );
      const productTitle = productData.data?.product?.title || 'Unknown Product';

      // Get selling plans for this product
      const sellingPlans = await db.sellingPlan.findMany({
        where: {
          sellingPlanGroup: {
            shopifySellingPlanGroupId: sellingPlanGroupId,
          },
        },
      });

      for (const plan of sellingPlans) {
        const expectedPrice = productPrice * (1 - (plan.discountValue || 0) / 100);
        const actualPrice = plan.currentPrice || 0;

        if (Math.abs(expectedPrice - actualPrice) > 0.01) {
          inconsistencies.push({
            productId: tierProduct.shopifyProductId,
            productTitle,
            productPrice,
            expectedPlanPrice: expectedPrice,
            actualPlanPrice: actualPrice,
            planName: plan.name,
          });
        }
      }
    }

    return {
      consistent: inconsistencies.length === 0,
      inconsistencies,
    };
  }
}