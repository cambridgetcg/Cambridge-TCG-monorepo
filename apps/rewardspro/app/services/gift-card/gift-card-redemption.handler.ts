/**
 * Gift Card Redemption Handler
 *
 * Detects gift card usage in orders and activates bundled memberships.
 *
 * When a customer uses a gift card that has a bundled tier membership,
 * this handler:
 * 1. Detects gift card payment via gateway name in order
 * 2. Matches gift cards assigned to the recipient customer
 * 3. If it has a bundled tier, creates a TierPurchase
 * 4. Updates the customer's effective tier
 *
 * This enables the "Gift-a-Membership" viral loop.
 *
 * NOTE: Since Shopify's GraphQL API doesn't return gift_card_id in transactions,
 * we match by recipient customer ID. Cards with bundled memberships are matched
 * when the assigned recipient makes a purchase using any gift card payment.
 */

import { v4 as uuidv4 } from "uuid";
import prisma from "~/db.server";
import { createLogger } from "~/services/logger.server";
import { updateCustomerToEffectiveTier } from "~/services/tier-resolution.server";

const logger = createLogger("GiftCardRedemptionHandler");

// ============================================================================
// TYPES
// ============================================================================

interface RedemptionCheckInput {
  /** Whether the order included gift card payment */
  hasGiftCardPayment: boolean;
  /** Payment gateway names from order (e.g., ["gift_card", "shopify_payments"]) */
  paymentGateways?: string[];
}

interface RedemptionResult {
  detected: boolean;
  giftCardId?: string;
  membershipActivated: boolean;
  tierId?: string;
  tierName?: string;
  error?: string;
}

// ============================================================================
// HANDLER
// ============================================================================

export class GiftCardRedemptionHandler {
  /**
   * Check if an order used gift card payment and process any bundled memberships
   *
   * Called from orders/paid webhook. Uses a customer-matching approach:
   * - Detects gift card payment via gateway names
   * - Finds ACTIVE gift cards assigned to the ordering customer
   * - Activates bundled memberships if present
   *
   * @param shop - Shop domain
   * @param shopifyOrderId - Shopify order ID
   * @param customerId - Internal customer ID (person placing the order)
   * @param input - Information about payment methods used
   * @returns Redemption result
   */
  static async checkAndProcessRedemption(
    shop: string,
    shopifyOrderId: string,
    customerId: string,
    input: RedemptionCheckInput
  ): Promise<RedemptionResult> {
    const handlerLogger = logger.withContext({
      operation: "checkAndProcessRedemption",
      shop,
      shopifyOrderId,
      customerId,
    });

    // Check if gift card was used as payment
    const usedGiftCard =
      input.hasGiftCardPayment ||
      input.paymentGateways?.some(
        (g) => g.toLowerCase().includes("gift_card") || g.toLowerCase() === "gift card"
      );

    if (!usedGiftCard) {
      handlerLogger.debug("No gift card payment detected in order");
      return { detected: false, membershipActivated: false };
    }

    handlerLogger.info("Gift card payment detected, checking for bundled memberships");

    // Find ACTIVE gift cards assigned to this customer with bundled memberships
    // This matches cards we issued where recipientCustomerId = the ordering customer
    const pendingMembershipCards = await prisma.issuedGiftCard.findMany({
      where: {
        shop,
        status: "ACTIVE",
        bundledTierId: { not: null }, // Has a membership bundle
        OR: [
          { recipientCustomerId: customerId }, // Directly assigned
          { recipientEmail: { not: null } }, // Has email (we'll match below)
        ],
      },
      orderBy: { createdAt: "asc" }, // Process oldest first
    });

    if (pendingMembershipCards.length === 0) {
      handlerLogger.debug("No pending membership gift cards for this customer");
      return { detected: true, membershipActivated: false };
    }

    // Get customer email for matching cards assigned by email
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true },
    });

    // Find the first matching card (assigned by ID or email)
    const matchingCard = pendingMembershipCards.find(
      (card) =>
        card.recipientCustomerId === customerId ||
        (customer?.email && card.recipientEmail?.toLowerCase() === customer.email.toLowerCase())
    );

    if (!matchingCard) {
      handlerLogger.debug("Gift card payment detected but no matching membership cards");
      return { detected: true, membershipActivated: false };
    }

    handlerLogger.info("Found matching membership gift card", {
      issuedGiftCardId: matchingCard.id,
      bundledTierId: matchingCard.bundledTierId,
      bundledTierName: matchingCard.bundledTierName,
    });

    // Activate the bundled membership
    const activationResult = await this.activateBundledMembership(
      shop,
      customerId,
      matchingCard.id,
      matchingCard.bundledTierId!,
      matchingCard.bundledTierName || "Unknown Tier",
      matchingCard.bundledDuration || "MONTHLY",
      shopifyOrderId
    );

    return {
      detected: true,
      giftCardId: matchingCard.id,
      membershipActivated: activationResult.success,
      tierId: matchingCard.bundledTierId || undefined,
      tierName: matchingCard.bundledTierName || undefined,
      error: activationResult.error,
    };
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use checkAndProcessRedemption instead
   */
  static async processOrderRedemptions(
    shop: string,
    shopifyOrderId: string,
    customerId: string,
    paymentGateways: string[]
  ): Promise<RedemptionResult[]> {
    const result = await this.checkAndProcessRedemption(shop, shopifyOrderId, customerId, {
      hasGiftCardPayment: false,
      paymentGateways,
    });
    return [result];
  }

  /**
   * Activate a bundled tier membership for the gift card recipient
   */
  private static async activateBundledMembership(
    shop: string,
    customerId: string,
    issuedGiftCardId: string,
    tierId: string,
    tierName: string,
    duration: string,
    shopifyOrderId: string
  ): Promise<{ success: boolean; error?: string }> {
    const handlerLogger = logger.withContext({
      operation: "activateBundledMembership",
      shop,
      customerId,
      tierId,
    });

    try {
      // Calculate end date based on duration
      const now = new Date();
      let endDate: Date | null = null;

      switch (duration) {
        case "MONTHLY":
          endDate = new Date(now);
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case "QUARTERLY":
          endDate = new Date(now);
          endDate.setMonth(endDate.getMonth() + 3);
          break;
        case "ANNUAL":
          endDate = new Date(now);
          endDate.setFullYear(endDate.getFullYear() + 1);
          break;
        case "LIFETIME":
          endDate = null; // No expiration
          break;
        default:
          endDate = new Date(now);
          endDate.setMonth(endDate.getMonth() + 1); // Default to 1 month
      }

      // Use transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // Create TierPurchase record
        await tx.tierPurchase.create({
          data: {
            id: uuidv4(),
            shop,
            customerId,
            tierId,
            shopifyOrderId,
            purchasePrice: 0, // Gift card redemption, not direct purchase
            startDate: now,
            endDate,
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
          },
        });

        // Update the gift card record
        await tx.issuedGiftCard.update({
          where: { id: issuedGiftCardId },
          data: {
            status: "REDEEMED",
            redeemedAt: now,
            tierActivatedAt: now,
            recipientCustomerId: customerId,
          },
        });

        // Log the tier change
        await tx.tierChangeLog.create({
          data: {
            id: uuidv4(),
            customerId,
            shop,
            toTierId: tierId,
            toTierName: tierName,
            changeType: "UPGRADE",
            triggerType: "PRODUCT_PURCHASE",
            metadata: {
              source: "gift_card_redemption",
              issuedGiftCardId,
              duration,
            },
            createdAt: now,
          },
        });
      });

      // Update customer's effective tier (outside transaction as it has its own)
      await updateCustomerToEffectiveTier(shop, customerId, {
        triggeredBy: "gift_card_redemption",
      });

      handlerLogger.info("Bundled membership activated successfully", {
        tierName,
        duration,
        endDate: endDate?.toISOString() || "lifetime",
      });

      return { success: true };
    } catch (error) {
      handlerLogger.error("Failed to activate bundled membership", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if a gift card code has been redeemed
   */
  static async isRedeemed(shop: string, lastFourDigits: string): Promise<boolean> {
    const giftCard = await prisma.issuedGiftCard.findFirst({
      where: {
        shop,
        lastFourDigits,
      },
    });

    return giftCard?.status === "REDEEMED";
  }

  /**
   * Get redemption history for a customer
   */
  static async getCustomerRedemptions(shop: string, customerId: string) {
    return prisma.issuedGiftCard.findMany({
      where: {
        shop,
        recipientCustomerId: customerId,
        status: "REDEEMED",
      },
      orderBy: { redeemedAt: "desc" },
    });
  }
}
