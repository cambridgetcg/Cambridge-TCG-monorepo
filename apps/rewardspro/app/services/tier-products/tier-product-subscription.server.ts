/**
 * Tier Product Subscription Service
 *
 * @deprecated This service is NOT ACTIVELY USED. Consider using:
 * - TierProductManagerEnhanced (tier-product-manager-enhanced.server.ts) for product creation
 * - SellingPlanManager (selling-plan-manager-enhanced.server.ts) for subscription setup
 *
 * This file is kept for reference. The methods here lack transaction support
 * which the enhanced manager provides.
 *
 * Original description:
 * Manages tier product subscriptions including:
 * - Creating subscription products in Shopify
 * - Setting up selling plans for recurring billing
 * - Managing subscription contracts
 * - Handling billing cycles
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import type { 
  TierProduct, 
  Tier, 
  Customer,
  BillingInterval,
  PurchaseType,
  ProductDuration
} from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface SubscriptionPlan {
  interval: BillingInterval;
  intervalCount: number;
  discountPercentage: number;
  name: string;
  position: number;
}

interface TierProductSubscriptionConfig {
  shop: string;
  tier: Tier;
  product: {
    title: string;
    description: string;
    price: number;
    sku: string;
    features: string[];
  };
  subscriptionPlans: SubscriptionPlan[];
  oneTimeDurations?: ProductDuration[];
}

interface CreateTierProductResult {
  success: boolean;
  tierProduct?: TierProduct;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  sellingPlanGroupId?: string;
  error?: string;
}

interface SubscriptionContractInput {
  shop: string;
  customer: Customer;
  tierProduct: TierProduct;
  billingInterval: BillingInterval;
  paymentMethodId?: string;
  shopSettings?: {
    storeCurrency: string;
  };
}

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class TierProductSubscriptionService {
  /**
   * Create a tier product with subscription options in Shopify
   */
  static async createTierProduct(
    admin: AdminApiContext,
    config: TierProductSubscriptionConfig
  ): Promise<CreateTierProductResult> {
    try {
      console.log(`[TierProductSubscription] Creating tier product for ${config.tier.name}`);

      // Step 1: Create the product in Shopify
      const productResult = await this.createShopifyProduct(admin, config);
      if (!productResult.success) {
        return productResult;
      }

      const { productId, variantId } = productResult;

      // Step 2: Create selling plan group if subscription is enabled
      let sellingPlanGroupId: string | null = null;
      if (config.subscriptionPlans.length > 0) {
        const sellingPlanResult = await this.createSellingPlanGroup(
          admin,
          config,
          productId!
        );
        if (sellingPlanResult.success) {
          sellingPlanGroupId = sellingPlanResult.groupId!;
        }
      }

      // Step 3: Create TierProduct record in database
      const tierProduct = await db.tierProduct.create({
        data: {
          id: uuidv4(),
          shop: config.shop,
          tierId: config.tier.id,
          shopifyProductId: productId!,
          shopifyVariantId: variantId!,
          productHandle: this.generateProductHandle(config.tier.name),
          sku: config.product.sku,
          purchaseType: this.determinePurchaseType(config),
          duration: config.oneTimeDurations?.[0] || null,
          hasSubscription: config.subscriptionPlans.length > 0,
          shopifySellingPlanGroupId: sellingPlanGroupId, // Use canonical field
          subscriptionPlanIds: null, // Will be updated after selling plans are created
          price: config.product.price,
          oneTimePrice: config.oneTimeDurations ? config.product.price : null,
          monthlyPrice: this.calculateMonthlyPrice(config),
          quarterlyPrice: this.calculateQuarterlyPrice(config),
          annualPrice: this.calculateAnnualPrice(config),
          features: config.product.features,
          description: config.product.description,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      console.log(`[TierProductSubscription] Created tier product ${tierProduct.id}`);

      return {
        success: true,
        tierProduct,
        shopifyProductId: productId,
        shopifyVariantId: variantId,
        sellingPlanGroupId: sellingPlanGroupId ?? undefined,
      };
    } catch (error) {
      console.error("[TierProductSubscription] Error creating tier product:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create product in Shopify
   */
  private static async createShopifyProduct(
    admin: AdminApiContext,
    config: TierProductSubscriptionConfig
  ): Promise<{ success: boolean; productId?: string; variantId?: string; error?: string }> {
    const mutation = `
      mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            handle
            variants(first: 1) {
              edges {
                node {
                  id
                  sku
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

    const variables = {
      input: {
        title: config.product.title,
        descriptionHtml: this.generateProductDescription(config),
        productType: "Tier Membership",
        vendor: config.shop,
        tags: [
          "tier-membership",
          `tier-${config.tier.name.toLowerCase()}`,
          config.subscriptionPlans.length > 0 ? "subscription" : "one-time",
        ],
        variants: [
          {
            sku: config.product.sku,
            price: config.product.price.toString(),
            requiresShipping: false,
            taxable: true,
          },
        ],
        status: "ACTIVE",
      },
    };

    try {
      const response = await admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data.data?.productCreate?.userErrors?.length > 0) {
        const errors = data.data.productCreate.userErrors;
        console.error("[TierProductSubscription] Product creation errors:", errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      const product = data.data?.productCreate?.product;
      if (!product) {
        return {
          success: false,
          error: "Product creation failed - no product returned",
        };
      }

      const variantId = product.variants.edges[0]?.node?.id;

      console.log(`[TierProductSubscription] Created Shopify product ${product.id}`);

      return {
        success: true,
        productId: product.id,
        variantId,
      };
    } catch (error) {
      console.error("[TierProductSubscription] Error creating Shopify product:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create selling plan group for subscriptions
   */
  private static async createSellingPlanGroup(
    admin: AdminApiContext,
    config: TierProductSubscriptionConfig,
    productId: string
  ): Promise<{ success: boolean; groupId?: string; error?: string }> {
    const mutation = `
      mutation CreateSellingPlanGroup($input: SellingPlanGroupInput!) {
        sellingPlanGroupCreate(input: $input) {
          sellingPlanGroup {
            id
            name
            sellingPlans(first: 10) {
              edges {
                node {
                  id
                  name
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

    const sellingPlans = config.subscriptionPlans.map((plan) => ({
      name: plan.name,
      options: [plan.name],
      position: plan.position,
      billingPolicy: {
        recurring: {
          interval: plan.interval,
          intervalCount: plan.intervalCount,
        },
      },
      deliveryPolicy: {
        recurring: {
          interval: plan.interval,
          intervalCount: plan.intervalCount,
        },
      },
      pricingPolicies: [
        {
          fixed: {
            adjustmentType: "PERCENTAGE",
            adjustmentValue: {
              percentage: plan.discountPercentage,
            },
          },
        },
      ],
    }));

    const variables = {
      input: {
        name: `${config.tier.name} Tier Subscription Plans`,
        merchantCode: `TIER_${config.tier.name.toUpperCase()}_SUB`,
        options: ["Billing Frequency"],
        position: 1,
        sellingPlansToCreate: sellingPlans,
      },
    };

    try {
      const response = await admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
        const errors = data.data.sellingPlanGroupCreate.userErrors;
        console.error("[TierProductSubscription] Selling plan creation errors:", errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      const group = data.data?.sellingPlanGroupCreate?.sellingPlanGroup;
      if (!group) {
        return {
          success: false,
          error: "Selling plan group creation failed",
        };
      }

      // Associate the product with the selling plan group
      await this.associateProductWithSellingPlan(admin, productId, group.id);

      // Store selling plan group in database
      const planIds = group.sellingPlans.edges.map((edge: any) => edge.node.id);
      await db.sellingPlanGroup.create({
        data: {
          id: uuidv4(),
          shop: config.shop,
          shopifyGroupId: group.id,
          name: group.name,
          merchantCode: `TIER_${config.tier.name.toUpperCase()}_SUB`,
          tierProducts: [productId],
          metadata: {
            tierId: config.tier.id,
            tierName: config.tier.name,
            createdAt: new Date().toISOString(),
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create individual selling plan records
      for (let i = 0; i < planIds.length; i++) {
        const plan = config.subscriptionPlans[i];
        await db.sellingPlan.create({
          data: {
            id: uuidv4(),
            groupId: group.id,
            shopifyPlanId: planIds[i],
            name: plan.name,
            position: plan.position,
            billingInterval: plan.interval,
            intervalCount: plan.intervalCount,
            discountType: "PERCENTAGE",
            discountValue: plan.discountPercentage,
            options: { billingFrequency: plan.name },
            basePrice: config.product.price,
            currentDiscount: plan.discountPercentage,
            metadata: {
              tierId: config.tier.id,
              tierName: config.tier.name,
            },
            createdAt: new Date(),
          },
        });
      }

      console.log(`[TierProductSubscription] Created selling plan group ${group.id}`);

      return {
        success: true,
        groupId: group.id,
      };
    } catch (error) {
      console.error("[TierProductSubscription] Error creating selling plan group:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Associate product with selling plan group
   */
  private static async associateProductWithSellingPlan(
    admin: AdminApiContext,
    productId: string,
    sellingPlanGroupId: string
  ): Promise<void> {
    const mutation = `
      mutation AddProductToSellingPlanGroup($id: ID!, $productIds: [ID!]!) {
        sellingPlanGroupAddProducts(
          id: $id
          productIds: $productIds
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
      await admin.graphql(mutation, {
        variables: {
          id: sellingPlanGroupId,
          productIds: [productId],
        },
      });
    } catch (error) {
      console.error("[TierProductSubscription] Error associating product with selling plan:", error);
    }
  }

  /**
   * Create a subscription contract for a customer
   */
  static async createSubscriptionContract(
    admin: AdminApiContext,
    input: SubscriptionContractInput
  ): Promise<{ success: boolean; contractId?: string; error?: string }> {
    try {
      const mutation = `
        mutation CreateSubscriptionContract($input: SubscriptionContractCreateInput!) {
          subscriptionContractCreate(input: $input) {
            draft {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Get the appropriate selling plan based on billing interval
      // Support both canonical field and legacy field for backward compatibility
      const sellingPlanGroupId = input.tierProduct.shopifySellingPlanGroupId || input.tierProduct.sellingPlanGroupId;
      const sellingPlan = await db.sellingPlan.findFirst({
        where: {
          groupId: sellingPlanGroupId!,
          billingInterval: input.billingInterval,
        },
      });

      if (!sellingPlan) {
        return {
          success: false,
          error: "No selling plan found for the selected billing interval",
        };
      }

      const price = this.calculateSubscriptionPrice(
        input.tierProduct.price.toNumber(),
        sellingPlan.discountValue?.toNumber() || 0
      );

      const variables = {
        input: {
          customerId: `gid://shopify/Customer/${input.customer.shopifyCustomerId}`,
          nextBillingDate: this.getNextBillingDate(input.billingInterval),
          currencyCode: input.shopSettings?.storeCurrency || "USD",
          contract: {
            status: "ACTIVE",
            billingPolicy: {
              interval: input.billingInterval,
              intervalCount: sellingPlan.intervalCount,
            },
            deliveryPolicy: {
              interval: input.billingInterval,
              intervalCount: sellingPlan.intervalCount,
            },
            lines: [
              {
                productVariantId: input.tierProduct.shopifyVariantId,
                quantity: 1,
                currentPrice: price.toString(),
                sellingPlanId: sellingPlan.shopifyPlanId,
                pricingPolicy: {
                  basePrice: input.tierProduct.price.toString(),
                  cycleDiscounts: [],
                },
              },
            ],
          },
        },
      };

      const response = await admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data.data?.subscriptionContractCreate?.userErrors?.length > 0) {
        const errors = data.data.subscriptionContractCreate.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      const draftId = data.data?.subscriptionContractCreate?.draft?.id;
      if (!draftId) {
        return {
          success: false,
          error: "Failed to create subscription draft",
        };
      }

      // Commit the draft to activate it
      const contractId = await this.commitSubscriptionDraft(admin, draftId);

      // Create subscription record in database
      await db.tierSubscription.create({
        data: {
          id: uuidv4(),
          shop: input.shop,
          customerId: input.customer.id,
          tierId: input.tierProduct.tierId,
          shopifyContractId: contractId,
          sellingPlanId: sellingPlan.shopifyPlanId,
          status: "ACTIVE",
          billingInterval: input.billingInterval,
          nextBillingDate: new Date(this.getNextBillingDate(input.billingInterval)),
          currentPrice: price,
          metadata: {
            tierProductId: input.tierProduct.id,
            productTitle: `${input.tierProduct.tier} Tier Membership`,
            sku: input.tierProduct.sku,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        contractId,
      };
    } catch (error) {
      console.error("[TierProductSubscription] Error creating subscription contract:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Commit subscription draft to activate it
   */
  private static async commitSubscriptionDraft(
    admin: AdminApiContext,
    draftId: string
  ): Promise<string> {
    const mutation = `
      mutation CommitSubscriptionDraft($draftId: ID!) {
        subscriptionDraftCommit(draftId: $draftId) {
          contract {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, { variables: { draftId } });
    const data = await response.json();

    if (data.data?.subscriptionDraftCommit?.userErrors?.length > 0) {
      throw new Error(
        `Failed to commit subscription draft: ${data.data.subscriptionDraftCommit.userErrors
          .map((e: any) => e.message)
          .join(", ")}`
      );
    }

    return data.data.subscriptionDraftCommit.contract.id;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private static generateProductHandle(tierName: string): string {
    return `tier-${tierName.toLowerCase()}-membership`;
  }

  private static generateProductDescription(config: TierProductSubscriptionConfig): string {
    let description = `<h3>${config.tier.name} Tier Membership</h3>`;
    description += `<p>${config.product.description}</p>`;
    
    if (config.product.features.length > 0) {
      description += "<h4>Features:</h4><ul>";
      for (const feature of config.product.features) {
        description += `<li>${feature}</li>`;
      }
      description += "</ul>";
    }

    if (config.subscriptionPlans.length > 0) {
      description += "<h4>Subscription Options:</h4><ul>";
      for (const plan of config.subscriptionPlans) {
        const discount = plan.discountPercentage > 0 
          ? ` (Save ${plan.discountPercentage}%)` 
          : "";
        description += `<li>${plan.name}${discount}</li>`;
      }
      description += "</ul>";
    }

    return description;
  }

  private static determinePurchaseType(config: TierProductSubscriptionConfig): PurchaseType {
    const hasSubscription = config.subscriptionPlans.length > 0;
    const hasOneTime = config.oneTimeDurations && config.oneTimeDurations.length > 0;

    if (hasSubscription && hasOneTime) {
      return "BOTH";
    } else if (hasSubscription) {
      return "SUBSCRIPTION";
    } else {
      return "ONE_TIME";
    }
  }

  private static calculateMonthlyPrice(config: TierProductSubscriptionConfig): number | null {
    const monthlyPlan = config.subscriptionPlans.find(p => p.interval === "MONTHLY");
    if (!monthlyPlan) return null;
    
    const discount = 1 - (monthlyPlan.discountPercentage / 100);
    return config.product.price * discount;
  }

  private static calculateQuarterlyPrice(config: TierProductSubscriptionConfig): number | null {
    const quarterlyPlan = config.subscriptionPlans.find(
      p => p.interval === "MONTHLY" && p.intervalCount === 3
    );
    if (!quarterlyPlan) return null;
    
    const discount = 1 - (quarterlyPlan.discountPercentage / 100);
    return config.product.price * discount * 3;
  }

  private static calculateAnnualPrice(config: TierProductSubscriptionConfig): number | null {
    const annualPlan = config.subscriptionPlans.find(p => p.interval === "ANNUAL");
    if (!annualPlan) return null;
    
    const discount = 1 - (annualPlan.discountPercentage / 100);
    return config.product.price * discount * 12;
  }

  private static calculateSubscriptionPrice(basePrice: number, discountPercentage: number): number {
    const discount = 1 - (discountPercentage / 100);
    return Math.round(basePrice * discount * 100) / 100;
  }

  private static getNextBillingDate(interval: BillingInterval): string {
    const date = new Date();
    const intervalStr = interval as string;

    switch (intervalStr) {
      case "WEEKLY":
        date.setDate(date.getDate() + 7);
        break;
      case "MONTHLY":
        date.setMonth(date.getMonth() + 1);
        break;
      case "QUARTERLY":
        date.setMonth(date.getMonth() + 3);
        break;
      case "SEMIANNUAL":
        date.setMonth(date.getMonth() + 6);
        break;
      case "ANNUAL":
        date.setFullYear(date.getFullYear() + 1);
        break;
    }
    
    return date.toISOString();
  }
}