/**
 * Tier Product Purchase Service
 *
 * Single responsibility: Create tier purchase records from matched tier products
 *
 * Extracted from webhooks.orders.paid.tsx to:
 * 1. Enable reuse from other contexts (admin UI, API, manual creation)
 * 2. Simplify testing
 * 3. Separate purchase creation from webhook orchestration
 *
 * Transaction safety: Uses Prisma transactions for atomic operations
 */

import prisma from "~/db.server";
import { createLogger } from "~/services/logger.server";
import { validatePrice } from "~/utils/price-validation";
import { v4 as uuidv4 } from "uuid";
import type { TierProduct, Tier, TierPurchase, Customer, ProductDuration } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Tier product with required tier relation for purchase creation
 */
export interface TierProductForPurchase extends TierProduct {
  tier: Pick<Tier, "id" | "name" | "minSpend" | "cashbackPercent"> | null;
}

/**
 * Minimal order data needed for purchase creation
 */
export interface OrderForPurchase {
  id: string | number;
  currency: string;
  customer?: {
    id?: string | number;
    email?: string;
  } | null;
  email?: string;
}

/**
 * Minimal line item data needed for purchase creation
 */
export interface LineItemForPurchase {
  id: string | number;
  price: string | number;
  sku?: string | null;
  name?: string;
  title?: string;
  quantity?: number;
}

/**
 * Result of tier purchase creation
 */
export interface CreateTierPurchaseResult {
  success: boolean;
  tierPurchase?: TierPurchase;
  customerId?: string;
  tierId?: string;
  needsResolution: boolean;
  endDate?: Date | null;
  error?: string;
  errorCode?: "TIER_PRODUCT_DELETED" | "TIER_NOT_FOUND" | "INVALID_PRICE" | "NO_CUSTOMER" | "DATABASE_ERROR";
  requiresRefund?: boolean;
}

/**
 * Options for purchase creation
 */
export interface CreatePurchaseOptions {
  /** Skip tier/tier product validation (use with caution) */
  skipValidation?: boolean;
  /** Custom customer ID to use instead of creating from order */
  customerId?: string;
  /** Custom start date (defaults to now) */
  startDate?: Date;
}

// ============================================
// MAIN SERVICE CLASS
// ============================================

const logger = createLogger("TierProductPurchase");

export class TierProductPurchaseService {
  /**
   * Create a tier purchase record from a matched tier product
   *
   * @param shop - Shop domain
   * @param order - Order data (webhook payload or custom)
   * @param lineItem - Line item data
   * @param tierProduct - Matched tier product with tier relation
   * @param options - Optional configuration
   * @returns Purchase creation result
   */
  static async createPurchase(
    shop: string,
    order: OrderForPurchase,
    lineItem: LineItemForPurchase,
    tierProduct: TierProductForPurchase,
    options?: CreatePurchaseOptions
  ): Promise<CreateTierPurchaseResult> {
    const purchaseLogger = logger.withContext({
      shop,
      orderId: order.id?.toString(),
      tierProductId: tierProduct.id,
    });

    purchaseLogger.info("Creating tier purchase", {
      tierId: tierProduct.tierId,
      tierName: tierProduct.tier?.name,
      duration: tierProduct.duration,
      lineItemPrice: lineItem.price,
    });

    // Step 1: Validate price
    const priceValidation = validatePrice(lineItem.price, order.currency);
    if (!priceValidation.valid) {
      purchaseLogger.error("Price validation failed", { error: priceValidation.error });
      return {
        success: false,
        needsResolution: false,
        error: `Invalid price: ${priceValidation.error}`,
        errorCode: "INVALID_PRICE",
      };
    }

    // Step 2: Validate customer exists or can be created
    if (!order.customer?.id && !options?.customerId) {
      purchaseLogger.error("No customer ID available");
      return {
        success: false,
        needsResolution: false,
        error: "No customer ID in order",
        errorCode: "NO_CUSTOMER",
      };
    }

    try {
      // Step 3: Validate tier product and tier still exist (unless skipped)
      if (!options?.skipValidation) {
        const validationResult = await TierProductPurchaseService.validateTierProduct(
          shop,
          tierProduct.id,
          tierProduct.tierId,
          order,
          lineItem,
          purchaseLogger
        );

        if (!validationResult.valid) {
          return {
            success: false,
            needsResolution: false,
            error: validationResult.error,
            errorCode: validationResult.errorCode,
            requiresRefund: true,
          };
        }
      }

      // Step 4: Get or create customer
      const customer = await TierProductPurchaseService.getOrCreateCustomer(
        shop,
        order,
        options?.customerId
      );

      // Step 5: Calculate duration
      const startDate = options?.startDate || new Date();
      const endDate = TierProductPurchaseService.calculateEndDate(startDate, tierProduct.duration);

      purchaseLogger.debug("Duration calculated", {
        duration: tierProduct.duration,
        startDate: startDate.toISOString(),
        endDate: endDate?.toISOString() || "LIFETIME",
      });

      // Step 6: Create tier purchase record
      const tierPurchase = await prisma.tierPurchase.create({
        data: {
          id: uuidv4(),
          shop,
          customerId: customer.id,
          tierId: tierProduct.tierId,
          tierProductId: tierProduct.id,
          shopifyOrderId: order.id.toString(),
          shopifyLineItemId: lineItem.id.toString(),
          purchasePrice: priceValidation.sanitizedPrice!,
          currency: order.currency,
          startDate,
          endDate,
          status: "ACTIVE",
          metadata: {
            productTitle: lineItem.name || lineItem.title,
            sku: lineItem.sku,
            quantity: lineItem.quantity || 1,
          },
          createdAt: startDate,
          updatedAt: startDate,
        },
      });

      purchaseLogger.info("Tier purchase created successfully", {
        purchaseId: tierPurchase.id,
        customerId: customer.id,
        tierId: tierProduct.tierId,
        endDate: endDate?.toISOString() || "LIFETIME",
      });

      return {
        success: true,
        tierPurchase,
        customerId: customer.id,
        tierId: tierProduct.tierId,
        needsResolution: true, // Signal that tier resolution should be called
        endDate,
      };
    } catch (error) {
      purchaseLogger.error("Failed to create tier purchase", error);
      return {
        success: false,
        needsResolution: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorCode: "DATABASE_ERROR",
      };
    }
  }

  /**
   * Validate that tier product and tier still exist
   *
   * Edge case handling: Tier/product may be deleted between checkout and payment
   */
  private static async validateTierProduct(
    shop: string,
    tierProductId: string,
    tierId: string,
    order: OrderForPurchase,
    lineItem: LineItemForPurchase,
    validationLogger: ReturnType<typeof logger.withContext>
  ): Promise<{
    valid: boolean;
    error?: string;
    errorCode?: "TIER_PRODUCT_DELETED" | "TIER_NOT_FOUND";
  }> {
    // Check tier product still exists and not soft-deleted
    const currentTierProduct = await prisma.tierProduct.findUnique({
      where: { id: tierProductId },
      select: { id: true, deletedAt: true, tierId: true },
    });

    if (!currentTierProduct || currentTierProduct.deletedAt) {
      validationLogger.error("Tier product was deleted", {
        tierProductId,
        deletedAt: currentTierProduct?.deletedAt,
      });

      // Log for admin review
      await TierProductPurchaseService.logPurchaseFailure(
        shop,
        order,
        lineItem,
        tierProductId,
        tierId,
        "TierProduct was deleted - customer charged but cannot receive tier"
      );

      return {
        valid: false,
        error: "Tier product was deleted - requires manual review",
        errorCode: "TIER_PRODUCT_DELETED",
      };
    }

    // Check tier still exists
    const tier = await prisma.tier.findUnique({
      where: { id: tierId },
    });

    if (!tier) {
      validationLogger.error("Tier not found (orphaned tier product)", {
        tierProductId,
        tierId,
      });

      // Log for admin review
      await TierProductPurchaseService.logPurchaseFailure(
        shop,
        order,
        lineItem,
        tierProductId,
        tierId,
        `Tier ${tierId} not found - TierProduct is orphaned`
      );

      return {
        valid: false,
        error: "Tier was deleted - requires manual review",
        errorCode: "TIER_NOT_FOUND",
      };
    }

    return { valid: true };
  }

  /**
   * Get existing customer or create new one from order data
   */
  private static async getOrCreateCustomer(
    shop: string,
    order: OrderForPurchase,
    existingCustomerId?: string
  ): Promise<Customer> {
    if (existingCustomerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: existingCustomerId },
      });
      if (customer) return customer;
    }

    const shopifyCustomerId = order.customer?.id?.toString() || "";

    return prisma.customer.upsert({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId,
        },
      },
      update: {
        updatedAt: new Date(),
      },
      create: {
        id: uuidv4(),
        shop,
        shopifyCustomerId,
        email: order.customer?.email || order.email || "",
        storeCredit: 0,
        totalSpent: 0,
        netSpent: 0,
        totalRefunded: 0,
        orderCount: 0,
        currentTierId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Calculate tier end date based on duration
   */
  private static calculateEndDate(
    startDate: Date,
    duration: ProductDuration | null
  ): Date | null {
    if (!duration || duration === "LIFETIME") {
      return null; // No expiry
    }

    const endDate = new Date(startDate);

    switch (duration) {
      case "MONTHLY":
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case "ANNUAL":
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      default:
        return null;
    }

    return endDate;
  }

  /**
   * Log purchase failure for admin review
   */
  private static async logPurchaseFailure(
    shop: string,
    order: OrderForPurchase,
    lineItem: LineItemForPurchase,
    tierProductId: string,
    tierId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await prisma.webhookError.create({
        data: {
          id: uuidv4(),
          shop,
          topic: "tier_purchase_failed",
          orderId: order.id.toString(),
          error: errorMessage,
          payload: {
            tierProductId,
            tierId,
            lineItemId: lineItem.id,
            lineItemPrice: lineItem.price,
            currency: order.currency,
            customerEmail: order.customer?.email,
            customerId: order.customer?.id,
            sku: lineItem.sku,
            productTitle: lineItem.name || lineItem.title,
            requiresManualReview: true,
            suggestedAction: "REFUND_OR_ASSIGN_TIER_MANUALLY",
          },
          createdAt: new Date(),
        },
      });
    } catch (logError) {
      logger.error("Failed to log purchase failure", logError);
    }
  }

  /**
   * Check if a tier purchase already exists for an order line item
   *
   * Idempotency check to prevent duplicate purchases on webhook retries
   */
  static async purchaseExists(
    shop: string,
    shopifyOrderId: string,
    shopifyLineItemId: string
  ): Promise<boolean> {
    const existing = await prisma.tierPurchase.findFirst({
      where: {
        shop,
        shopifyOrderId,
        shopifyLineItemId,
      },
      select: { id: true },
    });

    return !!existing;
  }

  /**
   * Get all tier purchases for an order
   *
   * Useful for showing existing purchases on webhook retries
   */
  static async getPurchasesForOrder(
    shop: string,
    shopifyOrderId: string
  ): Promise<Array<TierPurchase & { tier: Tier | null }>> {
    return prisma.tierPurchase.findMany({
      where: {
        shop,
        shopifyOrderId,
      },
      include: {
        tier: true,
      },
    });
  }
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

/**
 * Functional wrapper for purchase creation
 */
export async function createTierPurchase(
  shop: string,
  order: OrderForPurchase,
  lineItem: LineItemForPurchase,
  tierProduct: TierProductForPurchase,
  options?: CreatePurchaseOptions
): Promise<CreateTierPurchaseResult> {
  return TierProductPurchaseService.createPurchase(
    shop,
    order,
    lineItem,
    tierProduct,
    options
  );
}

/**
 * Functional wrapper for purchase existence check
 */
export async function tierPurchaseExists(
  shop: string,
  shopifyOrderId: string,
  shopifyLineItemId: string
): Promise<boolean> {
  return TierProductPurchaseService.purchaseExists(
    shop,
    shopifyOrderId,
    shopifyLineItemId
  );
}
