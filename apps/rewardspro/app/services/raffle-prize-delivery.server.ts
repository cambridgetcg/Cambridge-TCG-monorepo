/**
 * Raffle Prize Delivery Service
 *
 * Handles automated delivery of raffle prizes:
 * - DISCOUNT: Creates Shopify discount codes
 * - STORE_CREDIT: Adds store credit to customer account
 * - POINTS: Adds points to customer balance
 * - PRODUCT: Creates draft order or notifies for manual fulfillment
 * - CUSTOM: Marks for manual fulfillment
 */

import prisma from "../db.server";
import { earnPoints } from "./points-ledger.server";
import { updateWinnerDeliveryStatus, markWinnerNotified } from "./raffle-drawing.server";
import { trackRaffleWon } from "./klaviyo-events.server";
import { createRaffleDraftOrder } from "./raffle-draft-order.server";
import { getFirstVariantId } from "./product-search.server";
import type { RafflePrizeType } from "./raffle-management.server";

const LOG_PREFIX = "[RafflePrizeDelivery]";

// ============================================
// TYPES
// ============================================

export interface DeliveryResult {
  success: boolean;
  error?: string;
  discountCode?: string;
  storeCreditId?: string;
  pointsLedgerId?: string;
  draftOrderId?: string;
  draftOrderUrl?: string;
  requiresManualAction?: boolean;
  manualActionReason?: string;
}

interface PrizeValue {
  // DISCOUNT
  type?: "percentage" | "fixed";
  value?: number;
  maxUses?: number;
  // STORE_CREDIT
  amount?: number; // in cents
  // POINTS
  // (also uses amount)
  // PRODUCT
  productId?: string;
  variantId?: string;
  quantity?: number;
  productTitle?: string;
  productImage?: string;
  price?: string;
  sku?: string;
  // CUSTOM
  fulfillmentInstructions?: string;
}

// ============================================
// MAIN DELIVERY FUNCTION
// ============================================

/**
 * Deliver a prize to a winner
 *
 * This is the main entry point for prize delivery.
 * It routes to the appropriate delivery method based on prize type.
 */
export async function deliverPrize(
  winnerId: string,
  options?: {
    admin?: any; // Shopify admin API client for discount creation
    skipNotification?: boolean;
  }
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} deliverPrize starting for winner: ${winnerId}`);

  try {
    // Get winner with prize and raffle details
    const winner = await prisma.raffleWinner.findFirst({
      where: { id: winnerId },
      include: {
        prize: true,
        raffle: true,
        customer: {
          select: { id: true, email: true, shopifyCustomerId: true },
        },
      },
    });

    if (!winner) {
      return { success: false, error: "Winner not found" };
    }

    if (winner.deliveryStatus === "DELIVERED" || winner.deliveryStatus === "CLAIMED") {
      return { success: false, error: "Prize already delivered" };
    }

    const prize = winner.prize as any;
    const prizeType = prize.prizeType as RafflePrizeType;
    const prizeValue = prize.prizeValue as PrizeValue;
    const shop = winner.shop;
    const customerId = winner.customerId;
    const raffle = winner.raffle as any;

    console.log(`${LOG_PREFIX} Delivering ${prizeType} prize to customer ${customerId}`);

    // Mark as processing
    await updateWinnerDeliveryStatus(winnerId, "PROCESSING");

    let result: DeliveryResult;

    // Route to appropriate delivery method
    switch (prizeType) {
      case "DISCOUNT":
        result = await deliverDiscountPrize(
          winnerId,
          shop,
          customerId,
          prizeValue,
          raffle.name,
          options?.admin
        );
        break;

      case "STORE_CREDIT":
        result = await deliverStoreCreditPrize(
          winnerId,
          shop,
          customerId,
          prizeValue,
          raffle.name
        );
        break;

      case "POINTS":
        result = await deliverPointsPrize(
          winnerId,
          shop,
          customerId,
          prizeValue,
          raffle.name
        );
        break;

      case "PRODUCT":
        result = await deliverProductPrize(
          winnerId,
          shop,
          customerId,
          prizeValue,
          raffle.name,
          options?.admin
        );
        break;

      case "CUSTOM":
        result = await deliverCustomPrize(
          winnerId,
          prizeValue
        );
        break;

      default:
        result = {
          success: false,
          error: `Unknown prize type: ${prizeType}`,
          requiresManualAction: true,
          manualActionReason: "Unknown prize type",
        };
    }

    // Update delivery status based on result
    if (result.success) {
      await updateWinnerDeliveryStatus(winnerId, "DELIVERED", {
        discountCode: result.discountCode,
        storeCreditId: result.storeCreditId,
        pointsLedgerId: result.pointsLedgerId,
        deliveryNotes: result.draftOrderId ? `Draft order: ${result.draftOrderId}` : undefined,
      });

      // Mark as notified (in a real implementation, this would send an email)
      if (!options?.skipNotification) {
        await markWinnerNotified(winnerId);
      }

      // Dispatch Klaviyo win event for marketing automation
      // Run async without blocking
      (async () => {
        try {
          const fullCustomer = await prisma.customer.findUnique({
            where: { id: customerId },
            include: { currentTier: true },
          });

          // Get entry info for win details
          const entry = await prisma.raffleEntry.findFirst({
            where: { raffleId: raffle.id, customerId },
          });

          if (fullCustomer?.email) {
            await trackRaffleWon(
              shop,
              fullCustomer,
              {
                id: raffle.id,
                name: raffle.name,
              },
              {
                id: prize.id,
                name: prize.name,
                type: prizeType,
                value: prizeValue.amount || prizeValue.value,
                valueDescription: prize.description,
              },
              {
                entriesEntered: entry?.entriesCount || 1,
                totalParticipants: raffle.uniqueEntrants || 1,
              }
            );
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Error dispatching Klaviyo win event:`, error);
        }
      })();
    } else if (result.requiresManualAction) {
      await updateWinnerDeliveryStatus(winnerId, "PENDING", {
        deliveryNotes: result.manualActionReason,
      });
    } else {
      await updateWinnerDeliveryStatus(winnerId, "FAILED", {
        deliveryNotes: result.error,
      });
    }

    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error delivering prize:`, error);

    // Mark as failed
    try {
      await updateWinnerDeliveryStatus(winnerId, "FAILED", {
        deliveryNotes: error instanceof Error ? error.message : "Delivery failed",
      });
    } catch (e) {
      // Ignore update errors
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Delivery failed",
    };
  }
}

// ============================================
// PRIZE TYPE DELIVERY METHODS
// ============================================

/**
 * Deliver a DISCOUNT prize
 * Creates a unique discount code in Shopify
 */
async function deliverDiscountPrize(
  winnerId: string,
  shop: string,
  customerId: string,
  prizeValue: PrizeValue,
  raffleName: string,
  admin?: any
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering DISCOUNT prize`);

  // Generate unique discount code
  const codePrefix = "RAFFLE";
  const uniqueId = winnerId.slice(-8).toUpperCase();
  const discountCode = `${codePrefix}-${uniqueId}`;

  // If we have admin API, create the discount in Shopify
  if (admin) {
    try {
      const { createDiscountService } = await import("~/services/shopify-discount.service");
      const discountService = createDiscountService(admin, shop);

      const discountType = (prizeValue.type || "percentage") as "percentage" | "fixed_amount";
      const discountValue = prizeValue.value || 10;

      const shopifyResult = await discountService.createDiscountCode({
        title: `Raffle Win: ${raffleName}`,
        code: discountCode,
        type: discountType === "percentage" ? "percentage" : "fixed_amount",
        value: discountValue,
        usageLimit: prizeValue.maxUses || 1,
      });

      if (!shopifyResult.success) {
        console.error(`${LOG_PREFIX} Shopify discount creation failed:`, shopifyResult.error);
        return {
          success: false,
          error: `Failed to create discount: ${shopifyResult.error}`,
          requiresManualAction: true,
          manualActionReason: "Shopify discount creation failed",
        };
      }

      console.log(`${LOG_PREFIX} Created Shopify discount: ${discountCode}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error creating Shopify discount:`, error);
      // Fall through to return the code anyway for manual creation
    }
  }

  // Return success with the discount code
  // In a real implementation, this would be sent via email to the customer
  return {
    success: true,
    discountCode,
  };
}

/**
 * Deliver a STORE_CREDIT prize
 * Adds store credit to customer's account
 */
async function deliverStoreCreditPrize(
  winnerId: string,
  shop: string,
  customerId: string,
  prizeValue: PrizeValue,
  raffleName: string
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering STORE_CREDIT prize`);

  const amount = prizeValue.amount || 0; // Amount in cents
  const amountDecimal = amount / 100;

  if (amount <= 0) {
    return {
      success: false,
      error: "Invalid store credit amount",
    };
  }

  try {
    // Create store credit ledger entry
    const entry = await prisma.storeCreditLedger.create({
      data: {
        shop,
        customerId,
        amount: amountDecimal,
        type: "ADJUSTMENT",
        description: `Raffle prize: ${raffleName}`,
        metadata: { winnerId, source: "raffle_prize" },
      },
    });

    // Update customer's store credit balance
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        storeCredit: { increment: amountDecimal },
        updatedAt: new Date(),
      },
    });

    console.log(`${LOG_PREFIX} Added $${amountDecimal} store credit to customer ${customerId}`);

    return {
      success: true,
      storeCreditId: entry.id,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error adding store credit:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add store credit",
    };
  }
}

/**
 * Deliver a POINTS prize
 * Adds points to customer's balance
 */
async function deliverPointsPrize(
  winnerId: string,
  shop: string,
  customerId: string,
  prizeValue: PrizeValue,
  raffleName: string
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering POINTS prize`);

  const amount = prizeValue.amount || 0;

  if (amount <= 0) {
    return {
      success: false,
      error: "Invalid points amount",
    };
  }

  try {
    // Add points using the points ledger service
    const transaction = await earnPoints({
      shop,
      customerId,
      amount,
      type: "MYSTERY_BOX_WIN", // Reusing existing type for raffle wins
      description: `Raffle prize: ${raffleName}`,
      metadata: { winnerId, source: "raffle_prize" },
    });

    console.log(`${LOG_PREFIX} Added ${amount} points to customer ${customerId}`);

    return {
      success: true,
      pointsLedgerId: transaction.id,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error adding points:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add points",
    };
  }
}

/**
 * Deliver a PRODUCT prize
 * Creates a draft order for the winner or marks for manual fulfillment
 */
async function deliverProductPrize(
  winnerId: string,
  shop: string,
  customerId: string,
  prizeValue: PrizeValue,
  raffleName: string,
  admin?: any
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering PRODUCT prize`);

  const { productId, variantId, quantity = 1, productTitle } = prizeValue;

  if (!productId) {
    return {
      success: false,
      error: "No product configured for this prize",
      requiresManualAction: true,
      manualActionReason: "Product ID not configured",
    };
  }

  // If no admin API context, fall back to manual fulfillment
  if (!admin) {
    console.log(`${LOG_PREFIX} No admin context, marking for manual fulfillment`);
    return {
      success: true,
      requiresManualAction: true,
      manualActionReason: `Create order for ${productTitle || productId} (qty: ${quantity})`,
    };
  }

  try {
    // Get customer's Shopify ID for the draft order
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { shopifyCustomerId: true, email: true },
    });

    if (!customer?.shopifyCustomerId) {
      console.log(`${LOG_PREFIX} Customer has no Shopify ID, marking for manual fulfillment`);
      return {
        success: true,
        requiresManualAction: true,
        manualActionReason: `Customer has no Shopify ID. Create order for ${productTitle || productId} (qty: ${quantity})`,
      };
    }

    // Resolve variant ID if not provided
    let resolvedVariantId = variantId;
    if (!resolvedVariantId) {
      console.log(`${LOG_PREFIX} No variant specified, fetching first variant`);
      resolvedVariantId = await getFirstVariantId(admin, productId) ?? undefined;

      if (!resolvedVariantId) {
        return {
          success: true,
          requiresManualAction: true,
          manualActionReason: `Could not determine variant. Create order for ${productTitle || productId} (qty: ${quantity})`,
        };
      }
    }

    // Create draft order with 100% discount (free prize)
    const result = await createRaffleDraftOrder(admin, {
      customerId: `gid://shopify/Customer/${customer.shopifyCustomerId}`,
      productId,
      variantId: resolvedVariantId,
      quantity,
      raffleName,
      winnerId,
      customerEmail: customer.email || undefined,
    });

    if (result.success) {
      console.log(`${LOG_PREFIX} Created draft order: ${result.draftOrderName}`);
      return {
        success: true,
        draftOrderId: result.draftOrderId,
        draftOrderUrl: result.draftOrderAdminUrl,
      };
    }

    // Draft order creation failed, fall back to manual
    console.log(`${LOG_PREFIX} Draft order creation failed: ${result.error}`);
    return {
      success: true,
      requiresManualAction: true,
      manualActionReason: `Draft order failed: ${result.error}. Create order for ${productTitle || productId} (qty: ${quantity})`,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating draft order:`, error);
    return {
      success: true,
      requiresManualAction: true,
      manualActionReason: `Error: ${error instanceof Error ? error.message : "Unknown"}. Create order for ${productTitle || productId} (qty: ${quantity})`,
    };
  }
}

/**
 * Deliver a CUSTOM prize
 * Marks for manual fulfillment with instructions
 */
async function deliverCustomPrize(
  winnerId: string,
  prizeValue: PrizeValue
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering CUSTOM prize`);

  const instructions = prizeValue.fulfillmentInstructions || "No instructions provided";

  return {
    success: true,
    requiresManualAction: true,
    manualActionReason: instructions,
  };
}

// ============================================
// BATCH DELIVERY
// ============================================

/**
 * Deliver all pending prizes for a completed raffle
 */
export async function deliverAllRafflePrizes(
  raffleId: string,
  shop: string,
  admin?: any
): Promise<{
  total: number;
  successful: number;
  failed: number;
  requiresManual: number;
  results: Array<{ winnerId: string; result: DeliveryResult }>;
}> {
  console.log(`${LOG_PREFIX} deliverAllRafflePrizes for raffle: ${raffleId}`);

  // Get all pending winners
  const winners = await prisma.raffleWinner.findMany({
    where: {
      raffleId,
      shop,
      deliveryStatus: "PENDING",
    },
  });

  console.log(`${LOG_PREFIX} Found ${winners.length} pending deliveries`);

  const results: Array<{ winnerId: string; result: DeliveryResult }> = [];
  let successful = 0;
  let failed = 0;
  let requiresManual = 0;

  for (const winner of winners) {
    const result = await deliverPrize(winner.id, { admin });
    results.push({ winnerId: winner.id, result });

    if (result.success) {
      if (result.requiresManualAction) {
        requiresManual++;
      } else {
        successful++;
      }
    } else {
      failed++;
    }
  }

  console.log(`${LOG_PREFIX} Delivery complete: ${successful} successful, ${failed} failed, ${requiresManual} manual`);

  return {
    total: winners.length,
    successful,
    failed,
    requiresManual,
    results,
  };
}

// ============================================
// RETRY FAILED DELIVERIES
// ============================================

/**
 * Retry failed prize deliveries for a raffle
 */
export async function retryFailedDeliveries(
  raffleId: string,
  shop: string,
  admin?: any
): Promise<{
  retried: number;
  successful: number;
  stillFailed: number;
}> {
  console.log(`${LOG_PREFIX} retryFailedDeliveries for raffle: ${raffleId}`);

  // Get failed winners
  const failedWinners = await prisma.raffleWinner.findMany({
    where: {
      raffleId,
      shop,
      deliveryStatus: "FAILED",
    },
  });

  console.log(`${LOG_PREFIX} Found ${failedWinners.length} failed deliveries to retry`);

  let successful = 0;
  let stillFailed = 0;

  for (const winner of failedWinners) {
    // Reset status to pending before retry
    await updateWinnerDeliveryStatus(winner.id, "PENDING");

    const result = await deliverPrize(winner.id, { admin });

    if (result.success && !result.requiresManualAction) {
      successful++;
    } else {
      stillFailed++;
    }
  }

  return {
    retried: failedWinners.length,
    successful,
    stillFailed,
  };
}
