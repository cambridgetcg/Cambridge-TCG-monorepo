/**
 * Enhanced Tier Product Manager Service with Transaction Support
 * 
 * Features:
 * - Atomic transaction support for product creation
 * - Proper currency handling from shop settings
 * - Rollback on failure at any step
 * - Comprehensive error handling and logging
 * - Integration with enhanced selling plan manager
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { SellingPlanManager as SellingPlanManagerEnhanced } from "../subscription/selling-plan-manager-enhanced.server";
import { ProductPublisher } from "./product-publisher.server";
import type { 
  TierProduct, 
  Tier, 
  ShopSettings,
  BillingInterval,
  PurchaseType,
  ProductDuration,
  Currency
} from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface TransactionContext {
  shopifyProductId?: string;
  shopifyVariantId?: string;
  sellingPlanGroupId?: string;
  tierProductId?: string;
  sellingPlanIds?: string[];
  rollbackActions: Array<() => Promise<void>>;
}

interface CreateTierProductConfig {
  shop: string;
  shopSettings: ShopSettings;
  tier: Tier;
  product: {
    title: string;
    description: string;
    price: number;
    sku: string;
    features: string[];
  };
  subscriptionOptions?: {
    enableMonthly: boolean;
    enableQuarterly: boolean;
    enableAnnual: boolean;
    monthlyDiscount: number;
    quarterlyDiscount: number;
    annualDiscount: number;
  };
  oneTimeDurations?: ProductDuration[];
}

interface CreateTierProductResult {
  success: boolean;
  tierProduct?: TierProduct;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  sellingPlanGroupId?: string;
  error?: string;
  details?: any;
}

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class TierProductManagerEnhanced {
  private static readonly SERVICE_PREFIX = "[TierProductManager]";

  /**
   * Create a tier product with full transaction support
   * Rolls back all operations if any step fails
   */
  static async createTierProductWithTransaction(
    admin: AdminApiContext,
    config: CreateTierProductConfig
  ): Promise<CreateTierProductResult> {
    const context: TransactionContext = {
      rollbackActions: []
    };

    try {
      console.log(`${this.SERVICE_PREFIX} Starting transaction for tier product creation:`, {
        tier: config.tier.name,
        shop: config.shop,
        currency: config.shopSettings.storeCurrency
      });

      // Step 1: Create product in Shopify
      const productResult = await this.createShopifyProduct(admin, config, context);
      if (!productResult.success) {
        throw new Error(productResult.error || "Failed to create Shopify product");
      }

      // Step 2: Create selling plans if subscription is enabled
      if (config.subscriptionOptions && this.hasEnabledSubscriptions(config.subscriptionOptions)) {
        const sellingPlanResult = await this.createSellingPlans(admin, config, context);
        if (!sellingPlanResult.success) {
          throw new Error(sellingPlanResult.error || "Failed to create selling plans");
        }
      }

      // Step 3: Create tier product record in database
      const tierProductResult = await this.createTierProductRecord(config, context);
      if (!tierProductResult.success) {
        throw new Error(tierProductResult.error || "Failed to create tier product record");
      }

      // Step 4: Update tier with product association
      await this.updateTierWithProduct(config.tier.id, context.tierProductId!, context);

      console.log(`${this.SERVICE_PREFIX} Transaction completed successfully:`, {
        tierProductId: context.tierProductId,
        shopifyProductId: context.shopifyProductId,
        sellingPlanGroupId: context.sellingPlanGroupId
      });

      return {
        success: true,
        tierProduct: tierProductResult.tierProduct,
        shopifyProductId: context.shopifyProductId,
        shopifyVariantId: context.shopifyVariantId,
        sellingPlanGroupId: context.sellingPlanGroupId,
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Transaction failed, initiating rollback:`, error);

      // Execute rollback actions in reverse order
      for (const rollbackAction of context.rollbackActions.reverse()) {
        try {
          await rollbackAction();
        } catch (rollbackError) {
          console.error(`${this.SERVICE_PREFIX} Rollback action failed:`, rollbackError);
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error during transaction",
        details: error
      };
    }
  }

  /**
   * Create product in Shopify with rollback support
   */
  private static async createShopifyProduct(
    admin: AdminApiContext,
    config: CreateTierProductConfig,
    context: TransactionContext
  ): Promise<{ success: boolean; error?: string }> {
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
                  price
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

    // Format price based on shop currency
    const formattedPrice = this.formatPriceForCurrency(
      config.product.price,
      config.shopSettings.storeCurrency
    );

    const variables = {
      input: {
        title: config.product.title,
        descriptionHtml: this.generateProductDescription(config),
        productType: "Tier Membership",
        vendor: config.shop,
        tags: [
          "tier-membership",
          `tier-${config.tier.name.toLowerCase()}`,
          config.subscriptionOptions ? "subscription-enabled" : "one-time",
        ],
        variants: [
          {
            sku: config.product.sku,
            price: formattedPrice.toString(),
            requiresShipping: false,
            taxable: true,
            inventoryPolicy: "CONTINUE",
            inventoryManagement: null,
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
        console.error(`${this.SERVICE_PREFIX} Product creation errors:`, errors);
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

      context.shopifyProductId = product.id;
      context.shopifyVariantId = variantId;

      // Add rollback action to delete product if transaction fails
      context.rollbackActions.push(async () => {
        console.log(`${this.SERVICE_PREFIX} Rolling back: Deleting Shopify product ${product.id}`);
        await this.deleteShopifyProduct(admin, product.id);
      });

      console.log(`${this.SERVICE_PREFIX} Created Shopify product:`, {
        id: product.id,
        handle: product.handle,
        variantId
      });

      // Publish product to online store sales channel using ProductPublisher service
      const publishResult = await ProductPublisher.ensurePublishedToOnlineStore(admin, product.id);
      if (!publishResult.success) {
        console.warn(`${this.SERVICE_PREFIX} Product created but could not automatically publish to online store:`, publishResult.error);
        // Don't fail the transaction, just warn - the product can be published manually
      } else {
        console.log(`${this.SERVICE_PREFIX} Product successfully published to online store`);
      }

      return { success: true };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error creating Shopify product:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create selling plans with rollback support
   */
  private static async createSellingPlans(
    admin: AdminApiContext,
    config: CreateTierProductConfig,
    context: TransactionContext
  ): Promise<{ success: boolean; error?: string }> {
    if (!context.shopifyProductId || !context.shopifyVariantId) {
      return {
        success: false,
        error: "Cannot create selling plans without product ID"
      };
    }

    try {
      // Use the enhanced selling plan manager
      const result = await SellingPlanManagerEnhanced.associateProductWithSellingPlanGroup({
        shop: config.shop,
        admin,
        productId: context.shopifyProductId,
        variantId: context.shopifyVariantId,
        tierId: config.tier.id,
      });

      context.sellingPlanGroupId = result.sellingPlanGroupId;
      context.sellingPlanIds = result.sellingPlanIds;

      // Add rollback action
      context.rollbackActions.push(async () => {
        if (context.sellingPlanGroupId) {
          console.log(`${this.SERVICE_PREFIX} Rolling back: Removing product from selling plan group`);
          await this.removeProductFromSellingPlanGroup(
            admin,
            context.shopifyProductId!,
            context.sellingPlanGroupId
          );
        }
      });

      console.log(`${this.SERVICE_PREFIX} Associated product with selling plan group:`, {
        sellingPlanGroupId: result.sellingPlanGroupId,
        sellingPlanIds: result.sellingPlanIds
      });

      return { success: true };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error creating selling plans:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create selling plans",
      };
    }
  }

  /**
   * Create tier product record with rollback support
   */
  private static async createTierProductRecord(
    config: CreateTierProductConfig,
    context: TransactionContext
  ): Promise<{ success: boolean; tierProduct?: TierProduct; error?: string }> {
    try {
      // CRITICAL: Validate that the tier exists before creating tier product
      console.log(`${this.SERVICE_PREFIX} Validating tier exists: ${config.tier.id}`);
      const tier = await db.tier.findUnique({
        where: {
          id: config.tier.id,
          shop: config.shop
        }
      });

      if (!tier) {
        const errorMsg = `Tier ${config.tier.id} not found for shop ${config.shop}. Cannot create tier product.`;
        console.error(`${this.SERVICE_PREFIX} ${errorMsg}`);
        return {
          success: false,
          error: errorMsg
        };
      }

      console.log(`${this.SERVICE_PREFIX} ✅ Tier validated: ${tier.name} (${tier.id})`);

      const tierProductId = uuidv4();

      const tierProduct = await db.tierProduct.create({
        data: {
          id: tierProductId,
          shop: config.shop,
          tierId: config.tier.id,
          shopifyProductId: context.shopifyProductId!,
          shopifyVariantId: context.shopifyVariantId!,
          shopifySellingPlanGroupId: context.sellingPlanGroupId,
          productHandle: this.generateProductHandle(config.tier.name),
          sku: config.product.sku,
          purchaseType: this.determinePurchaseType(config),
          duration: config.oneTimeDurations?.[0] || null,
          hasSubscription: !!config.subscriptionOptions && this.hasEnabledSubscriptions(config.subscriptionOptions),
          subscriptionPlanIds: context.sellingPlanIds || [],
          price: config.product.price,
          currency: config.shopSettings.storeCurrency,
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

      context.tierProductId = tierProductId;

      // Add rollback action
      context.rollbackActions.push(async () => {
        console.log(`${this.SERVICE_PREFIX} Rolling back: Deleting tier product record ${tierProductId}`);
        await db.tierProduct.delete({
          where: { id: tierProductId }
        }).catch(() => {
          // Ignore if already deleted
        });
      });

      console.log(`${this.SERVICE_PREFIX} Created tier product record:`, {
        id: tierProductId,
        sku: config.product.sku
      });

      return {
        success: true,
        tierProduct
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error creating tier product record:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create tier product record",
      };
    }
  }

  /**
   * Update tier with product association
   */
  private static async updateTierWithProduct(
    tierId: string,
    tierProductId: string,
    context: TransactionContext
  ): Promise<void> {
    const previousTier = await db.tier.findUnique({
      where: { id: tierId }
    });
    const previousProductId = previousTier?.tierProductId;

    await db.tier.update({
      where: { id: tierId },
      data: {
        tierProductId,
        updatedAt: new Date()
      }
    });

    // Add rollback action
    context.rollbackActions.push(async () => {
      console.log(`${this.SERVICE_PREFIX} Rolling back: Removing product association from tier`);
      await db.tier.update({
        where: { id: tierId },
        data: {
          tierProductId: previousProductId || null,
          updatedAt: new Date()
        }
      }).catch(() => {
        // Ignore if tier doesn't exist
      });
    });
  }

  // ============================================
  // ROLLBACK HELPER METHODS
  // ============================================

  /**
   * Delete a product from Shopify (for rollback)
   */
  private static async deleteShopifyProduct(
    admin: AdminApiContext,
    productId: string
  ): Promise<void> {
    const mutation = `
      mutation DeleteProduct($id: ID!) {
        productDelete(input: { id: $id }) {
          deletedProductId
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      await admin.graphql(mutation, {
        variables: { id: productId }
      });
    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error deleting product during rollback:`, error);
    }
  }

  /**
   * Remove product from selling plan group (for rollback)
   */
  private static async removeProductFromSellingPlanGroup(
    admin: AdminApiContext,
    productId: string,
    sellingPlanGroupId: string
  ): Promise<void> {
    const mutation = `
      mutation RemoveProductFromSellingPlanGroup($id: ID!, $productIds: [ID!]!) {
        sellingPlanGroupRemoveProducts(
          id: $id
          productIds: $productIds
        ) {
          removedProductIds
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
          productIds: [productId]
        }
      });
    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error removing product from selling plan group during rollback:`, error);
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Format price based on currency
   */
  private static formatPriceForCurrency(price: number, currency: any): number {
    // Handle currencies that don't use decimal places
    const nonDecimalCurrencies = ["JPY", "KRW", "VND", "IDR", "CLP", "ISK", "TWD"];
    
    if (nonDecimalCurrencies.includes(currency)) {
      return Math.round(price);
    }
    
    return Math.round(price * 100) / 100;
  }

  /**
   * Check if any subscription option is enabled
   */
  private static hasEnabledSubscriptions(options: any): boolean {
    return options.enableMonthly || options.enableQuarterly || options.enableAnnual;
  }

  /**
   * Generate product handle
   */
  private static generateProductHandle(tierName: string): string {
    return `tier-${tierName.toLowerCase().replace(/\s+/g, '-')}-membership`;
  }

  /**
   * Generate product description HTML
   */
  private static generateProductDescription(config: CreateTierProductConfig): string {
    let description = `<h3>${config.tier.name} Tier Membership</h3>`;
    description += `<p>${config.product.description}</p>`;
    
    if (config.product.features.length > 0) {
      description += "<h4>Features:</h4><ul>";
      for (const feature of config.product.features) {
        description += `<li>${feature}</li>`;
      }
      description += "</ul>";
    }

    if (config.subscriptionOptions && this.hasEnabledSubscriptions(config.subscriptionOptions)) {
      description += "<h4>Subscription Options:</h4><ul>";
      
      if (config.subscriptionOptions.enableMonthly) {
        const discount = config.subscriptionOptions.monthlyDiscount > 0 
          ? ` (Save ${config.subscriptionOptions.monthlyDiscount}%)` 
          : "";
        description += `<li>Monthly Billing${discount}</li>`;
      }
      
      if (config.subscriptionOptions.enableQuarterly) {
        const discount = config.subscriptionOptions.quarterlyDiscount > 0 
          ? ` (Save ${config.subscriptionOptions.quarterlyDiscount}%)` 
          : "";
        description += `<li>Quarterly Billing${discount}</li>`;
      }
      
      if (config.subscriptionOptions.enableAnnual) {
        const discount = config.subscriptionOptions.annualDiscount > 0 
          ? ` (Save ${config.subscriptionOptions.annualDiscount}%)` 
          : "";
        description += `<li>Annual Billing${discount}</li>`;
      }
      
      description += "</ul>";
    }

    return description;
  }

  /**
   * Determine purchase type
   */
  private static determinePurchaseType(config: CreateTierProductConfig): PurchaseType {
    const hasSubscription = config.subscriptionOptions && this.hasEnabledSubscriptions(config.subscriptionOptions);
    const hasOneTime = config.oneTimeDurations && config.oneTimeDurations.length > 0;

    if (hasSubscription && hasOneTime) {
      return "BOTH";
    } else if (hasSubscription) {
      return "SUBSCRIPTION";
    } else {
      return "ONE_TIME";
    }
  }

  /**
   * Calculate monthly price with discount
   */
  private static calculateMonthlyPrice(config: CreateTierProductConfig): number | null {
    if (!config.subscriptionOptions?.enableMonthly) return null;
    
    const discount = 1 - (config.subscriptionOptions.monthlyDiscount / 100);
    const price = config.product.price * discount;
    
    return this.formatPriceForCurrency(price, config.shopSettings.storeCurrency);
  }

  /**
   * Calculate quarterly price with discount
   */
  private static calculateQuarterlyPrice(config: CreateTierProductConfig): number | null {
    if (!config.subscriptionOptions?.enableQuarterly) return null;
    
    const discount = 1 - (config.subscriptionOptions.quarterlyDiscount / 100);
    const price = config.product.price * discount * 3;
    
    return this.formatPriceForCurrency(price, config.shopSettings.storeCurrency);
  }

  /**
   * Calculate annual price with discount
   */
  private static calculateAnnualPrice(config: CreateTierProductConfig): number | null {
    if (!config.subscriptionOptions?.enableAnnual) return null;
    
    const discount = 1 - (config.subscriptionOptions.annualDiscount / 100);
    const price = config.product.price * discount * 12;
    
    return this.formatPriceForCurrency(price, config.shopSettings.storeCurrency);
  }

  /**
   * Update tier product pricing
   */
  static async updateTierProductPricing(
    tierProductId: string,
    newPricing: {
      basePrice?: number;
      monthlyDiscount?: number;
      quarterlyDiscount?: number;
      annualDiscount?: number;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const tierProduct = await db.tierProduct.findUnique({
        where: { id: tierProductId }
      });
      
      if (!tierProduct) {
        return {
          success: false,
          error: "Tier product not found"
        };
      }
      
      const tier = await db.tier.findUnique({
        where: { id: tierProduct.tierId }
      });

      if (!tier) {
        return {
          success: false,
          error: "Associated tier not found"
        };
      }

      const shopSettings = await db.shopSettings.findUnique({
        where: { shop: tierProduct.shop }
      });

      if (!shopSettings) {
        return {
          success: false,
          error: "Shop settings not found"
        };
      }

      const basePrice = newPricing.basePrice || tierProduct.price.toNumber();

      await db.tierProduct.update({
        where: { id: tierProductId },
        data: {
          price: basePrice,
          monthlyPrice: newPricing.monthlyDiscount !== undefined
            ? this.formatPriceForCurrency(
                basePrice * (1 - newPricing.monthlyDiscount / 100),
                shopSettings.storeCurrency
              )
            : tierProduct.monthlyPrice,
          quarterlyPrice: newPricing.quarterlyDiscount !== undefined
            ? this.formatPriceForCurrency(
                basePrice * 3 * (1 - newPricing.quarterlyDiscount / 100),
                shopSettings.storeCurrency
              )
            : tierProduct.quarterlyPrice,
          annualPrice: newPricing.annualDiscount !== undefined
            ? this.formatPriceForCurrency(
                basePrice * 12 * (1 - newPricing.annualDiscount / 100),
                shopSettings.storeCurrency
              )
            : tierProduct.annualPrice,
          updatedAt: new Date()
        }
      });

      console.log(`${this.SERVICE_PREFIX} Updated tier product pricing:`, {
        tierProductId,
        basePrice,
        currency: shopSettings.currency
      });

      return { success: true };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error updating tier product pricing:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update pricing"
      };
    }
  }

}