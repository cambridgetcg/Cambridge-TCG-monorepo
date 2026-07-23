/**
 * Mystery Box Delivery Service
 *
 * Handles automated delivery of mystery box rewards:
 * - POINTS: Adds bonus points to customer account
 * - DISCOUNT: Creates Shopify discount codes
 * - STORE_CREDIT: Adds store credit to customer account
 * - PRODUCT: Creates draft order or marks for manual fulfillment
 * - CUSTOM: Marks for manual fulfillment with instructions
 * - NOTHING: No delivery needed (consolation prize)
 */

import prisma from "../db.server";
import { earnPoints } from "./points-ledger.server";

const LOG_PREFIX = "[MysteryBoxDelivery]";

// ============================================
// TYPES
// ============================================

export interface DeliveryResult {
  success: boolean;
  error?: string;
  discountCode?: string;
  storeCreditId?: string;
  pointsLedgerId?: string;
  requiresManualAction?: boolean;
  manualActionReason?: string;
}

interface RewardValue {
  // POINTS
  amount?: number;
  // DISCOUNT
  type?: "percentage" | "fixed";
  value?: number;
  maxUses?: number;
  minimumPurchase?: number;
  expirationDays?: number;
  // STORE_CREDIT (amount in cents)
  // PRODUCT
  productId?: string;
  variantId?: string;
  quantity?: number;
  // CUSTOM
  instructions?: string;
  // NOTHING
  message?: string;
}

type DeliveryStatus = "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED" | "CLAIMED";

// ============================================
// MAIN DELIVERY FUNCTION
// ============================================

/**
 * Deliver a mystery box reward to a winner
 *
 * This is the main entry point for reward delivery.
 * It routes to the appropriate delivery method based on reward type.
 */
export async function deliverReward(
  winnerId: string,
  options?: {
    admin?: any; // Shopify admin API client for discount creation
    skipNotification?: boolean;
  }
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} deliverReward starting for winner: ${winnerId}`);

  try {
    // Get winner with reward and box details
    const winner = await prisma.mysteryBoxWinner.findFirst({
      where: { id: winnerId },
      include: {
        reward: true,
        box: true,
        customer: {
          select: { id: true, email: true, shopifyCustomerId: true },
        },
      },
    });

    if (!winner) {
      return { success: false, error: "Winner not found" };
    }

    if (winner.deliveryStatus === "DELIVERED" || winner.deliveryStatus === "CLAIMED") {
      return { success: false, error: "Reward already delivered" };
    }

    const reward = winner.reward;
    const rewardType = reward.rewardType;
    const rewardValue = reward.rewardValue as RewardValue;
    const shop = winner.shop;
    const customerId = winner.customerId;
    const box = winner.box;

    console.log(`${LOG_PREFIX} Delivering ${rewardType} reward to customer ${customerId}`);

    // Mark as processing
    await updateDeliveryStatus(winnerId, "PROCESSING");

    let result: DeliveryResult;

    // Route to appropriate delivery method
    switch (rewardType) {
      case "POINTS":
        result = await deliverPointsReward(
          winnerId,
          shop,
          customerId,
          rewardValue,
          box.name
        );
        break;

      case "DISCOUNT":
        result = await deliverDiscountReward(
          winnerId,
          shop,
          customerId,
          rewardValue,
          box.name,
          options?.admin
        );
        break;

      case "STORE_CREDIT":
        result = await deliverStoreCreditReward(
          winnerId,
          shop,
          customerId,
          rewardValue,
          box.name
        );
        break;

      case "PRODUCT":
        result = await deliverProductReward(
          winnerId,
          shop,
          customerId,
          rewardValue,
          box.name,
          options?.admin
        );
        break;

      case "CUSTOM":
        result = await deliverCustomReward(winnerId, rewardValue);
        break;

      case "NOTHING":
        // No delivery needed for "nothing" rewards
        result = { success: true };
        break;

      default:
        result = {
          success: false,
          error: `Unknown reward type: ${rewardType}`,
          requiresManualAction: true,
          manualActionReason: "Unknown reward type",
        };
    }

    // Update delivery status based on result
    if (result.success) {
      await updateDeliveryStatus(winnerId, "DELIVERED", {
        discountCode: result.discountCode,
        storeCreditId: result.storeCreditId,
        pointsLedgerId: result.pointsLedgerId,
      });

      // Mark as notified
      if (!options?.skipNotification) {
        await markWinnerNotified(winnerId);
      }
    } else if (result.requiresManualAction) {
      await updateDeliveryStatus(winnerId, "PENDING", {
        deliveryNotes: result.manualActionReason,
      });
    } else {
      await updateDeliveryStatus(winnerId, "FAILED", {
        deliveryNotes: result.error,
      });
    }

    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error delivering reward:`, error);

    // Mark as failed
    try {
      await updateDeliveryStatus(winnerId, "FAILED", {
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
// REWARD TYPE DELIVERY METHODS
// ============================================

/**
 * Deliver a POINTS reward
 * Adds bonus points to customer's account
 */
async function deliverPointsReward(
  winnerId: string,
  shop: string,
  customerId: string,
  rewardValue: RewardValue,
  boxName: string
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering POINTS reward`);

  const amount = rewardValue.amount || 0;

  if (amount <= 0) {
    return { success: false, error: "Invalid points amount" };
  }

  try {
    // Add points using the points ledger service
    const transaction = await earnPoints({
      shop,
      customerId,
      amount,
      type: "MYSTERY_BOX_WIN",
      description: `Won ${amount} points from "${boxName}" mystery box`,
      metadata: { winnerId, source: "mystery_box" },
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
 * Deliver a DISCOUNT reward
 * Creates a unique discount code in Shopify
 */
async function deliverDiscountReward(
  winnerId: string,
  shop: string,
  customerId: string,
  rewardValue: RewardValue,
  boxName: string,
  admin?: any
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering DISCOUNT reward`);

  // Generate unique discount code
  const codePrefix = "MBOX";
  const uniqueId = winnerId.slice(-8).toUpperCase();
  const discountCode = `${codePrefix}-${uniqueId}`;

  // If we have admin API, create the discount in Shopify
  if (admin) {
    try {
      const { createDiscountService } = await import("~/services/shopify-discount.service");
      const discountService = createDiscountService(admin, shop);

      const discountType = (rewardValue.type || "percentage") as "percentage" | "fixed_amount";
      const discountValue = rewardValue.value || 10;
      const expirationDays = rewardValue.expirationDays || 30;

      const shopifyResult = await discountService.createDiscountCode({
        title: `Mystery Box: ${boxName}`,
        code: discountCode,
        type: discountType === "percentage" ? "percentage" : "fixed_amount",
        value: discountValue,
        usageLimit: rewardValue.maxUses || 1,
        expiresAt: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000),
        minimumSubtotal: rewardValue.minimumPurchase,
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
      // Return the code anyway for manual creation
    }
  }

  return {
    success: true,
    discountCode,
  };
}

/**
 * Deliver a STORE_CREDIT reward
 * Adds store credit to customer's account
 */
async function deliverStoreCreditReward(
  winnerId: string,
  shop: string,
  customerId: string,
  rewardValue: RewardValue,
  boxName: string
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering STORE_CREDIT reward`);

  const amountCents = rewardValue.amount || 0;
  const amountDecimal = amountCents / 100;

  if (amountCents <= 0) {
    return { success: false, error: "Invalid store credit amount" };
  }

  try {
    // Create store credit ledger entry
    const entry = await prisma.storeCreditLedger.create({
      data: {
        shop,
        customerId,
        amount: amountDecimal,
        type: "ADJUSTMENT",
        description: `Mystery box reward: ${boxName}`,
        metadata: { winnerId, source: "mystery_box" },
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
 * Deliver a PRODUCT reward
 * Marks for manual fulfillment (could create draft order in full implementation)
 */
async function deliverProductReward(
  winnerId: string,
  shop: string,
  customerId: string,
  rewardValue: RewardValue,
  boxName: string,
  admin?: any
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering PRODUCT reward`);

  const productId = rewardValue.productId;
  const variantId = rewardValue.variantId;
  const quantity = rewardValue.quantity || 1;

  if (!productId) {
    return {
      success: false,
      error: "No product configured for this reward",
      requiresManualAction: true,
      manualActionReason: "Product ID not configured",
    };
  }

  // Create a draft order if admin API is available
  if (admin) {
    try {
      // Get customer's Shopify GID for draft order
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, shop },
        select: { shopifyCustomerId: true, email: true },
      });

      if (customer?.shopifyCustomerId) {
        const { createRaffleDraftOrder } = await import("~/services/raffle-draft-order.server");
        const draftResult = await createRaffleDraftOrder(admin, {
          customerId: `gid://shopify/Customer/${customer.shopifyCustomerId}`,
          productId: productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`,
          variantId: variantId
            ? (variantId.startsWith('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`)
            : undefined,
          quantity,
          raffleName: boxName, // Reusing field name — works for mystery boxes too
          winnerId,
          customerEmail: customer.email || undefined,
        });

        if (draftResult.success) {
          console.log(`${LOG_PREFIX} Draft order created: ${draftResult.draftOrderName}`);
          return {
            success: true,
          };
        }

        console.error(`${LOG_PREFIX} Draft order failed: ${draftResult.error}`);
        // Fall through to manual action
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error creating draft order (non-fatal):`, error);
    }
  }

  // Fallback: mark for manual fulfillment
  return {
    success: true,
    requiresManualAction: true,
    manualActionReason: `Create order for product ${productId} (variant: ${variantId || "default"}, qty: ${quantity})`,
  };
}

/**
 * Deliver a CUSTOM reward
 * Marks for manual fulfillment with instructions
 */
async function deliverCustomReward(
  winnerId: string,
  rewardValue: RewardValue
): Promise<DeliveryResult> {
  console.log(`${LOG_PREFIX} Delivering CUSTOM reward`);

  const instructions = rewardValue.instructions || "No instructions provided";

  return {
    success: true,
    requiresManualAction: true,
    manualActionReason: instructions,
  };
}

// ============================================
// STATUS MANAGEMENT
// ============================================

/**
 * Update winner delivery status
 */
async function updateDeliveryStatus(
  winnerId: string,
  status: DeliveryStatus,
  data?: {
    discountCode?: string;
    storeCreditId?: string;
    pointsLedgerId?: string;
    deliveryNotes?: string;
  }
): Promise<void> {
  await prisma.mysteryBoxWinner.update({
    where: { id: winnerId },
    data: {
      deliveryStatus: status,
      deliveredAt: status === "DELIVERED" ? new Date() : undefined,
      discountCode: data?.discountCode,
      storeCreditId: data?.storeCreditId,
      pointsLedgerId: data?.pointsLedgerId,
      deliveryNotes: data?.deliveryNotes,
      updatedAt: new Date(),
    },
  });
}

/**
 * Mark winner as notified
 */
async function markWinnerNotified(winnerId: string): Promise<void> {
  await prisma.mysteryBoxWinner.update({
    where: { id: winnerId },
    data: {
      notifiedAt: new Date(),
      notifyAttempts: { increment: 1 },
    },
  });
}

// ============================================
// BATCH DELIVERY
// ============================================

/**
 * Deliver all pending rewards for a mystery box
 */
export async function deliverAllPendingRewards(
  boxId: string,
  shop: string,
  admin?: any
): Promise<{
  total: number;
  successful: number;
  failed: number;
  requiresManual: number;
  results: Array<{ winnerId: string; result: DeliveryResult }>;
}> {
  console.log(`${LOG_PREFIX} deliverAllPendingRewards for box: ${boxId}`);

  // Get all pending winners
  const winners = await prisma.mysteryBoxWinner.findMany({
    where: {
      boxId,
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
    const result = await deliverReward(winner.id, { admin });
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

  console.log(
    `${LOG_PREFIX} Delivery complete: ${successful} successful, ${failed} failed, ${requiresManual} manual`
  );

  return {
    total: winners.length,
    successful,
    failed,
    requiresManual,
    results,
  };
}

/**
 * Retry failed reward deliveries for a mystery box
 */
export async function retryFailedDeliveries(
  boxId: string,
  shop: string,
  admin?: any
): Promise<{
  retried: number;
  successful: number;
  stillFailed: number;
}> {
  console.log(`${LOG_PREFIX} retryFailedDeliveries for box: ${boxId}`);

  // Get failed winners
  const failedWinners = await prisma.mysteryBoxWinner.findMany({
    where: {
      boxId,
      shop,
      deliveryStatus: "FAILED",
    },
  });

  console.log(`${LOG_PREFIX} Found ${failedWinners.length} failed deliveries to retry`);

  let successful = 0;
  let stillFailed = 0;

  for (const winner of failedWinners) {
    // Reset status to pending before retry
    await updateDeliveryStatus(winner.id, "PENDING");

    const result = await deliverReward(winner.id, { admin });

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

/**
 * Get delivery statistics for a mystery box
 */
export async function getDeliveryStats(
  boxId: string,
  shop: string
): Promise<{
  total: number;
  pending: number;
  processing: number;
  delivered: number;
  failed: number;
  claimed: number;
}> {
  // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
  // Instead, fetch deliveryStatus for all winners and count in memory
  const winners = await prisma.mysteryBoxWinner.findMany({
    where: { boxId, shop },
    select: { deliveryStatus: true },
  });

  const result = {
    total: winners.length,
    pending: 0,
    processing: 0,
    delivered: 0,
    failed: 0,
    claimed: 0,
  };

  // Count by status in memory
  for (const winner of winners) {
    switch (winner.deliveryStatus) {
      case "PENDING":
        result.pending++;
        break;
      case "PROCESSING":
        result.processing++;
        break;
      case "DELIVERED":
        result.delivered++;
        break;
      case "FAILED":
        result.failed++;
        break;
      case "CLAIMED":
        result.claimed++;
        break;
    }
  }

  return result;
}
