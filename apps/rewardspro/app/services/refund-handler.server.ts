import { v4 as uuidv4 } from "uuid";
import db from "../db.server";
import type { Decimal } from "@prisma/client/runtime/library";
import { clawbackPoints } from "./points-ledger.server";
import { isPointsEnabled } from "./points-config.server";

/**
 * Handle refund clawback for cashback AND points rewards
 * Industry standard: Revoke rewards for refunded purchases
 */
export async function handleRefundClawback(
  shopifyOrderId: string,
  shop: string,
  refundAmount: number,
  isFullRefund: boolean
): Promise<{
  success: boolean;
  clawbackAmount: number;
  newBalance: number;
  pointsClawback?: {
    clawedBack: boolean;
    amount: number;
    reason: string;
  };
  message: string;
}> {
  console.log(`[Refund Handler] Processing refund for order ${shopifyOrderId}, amount: ${refundAmount}, full: ${isFullRefund}`);

  try {
    // Use transaction to ensure consistency
    const result = await db.$transaction(async (tx) => {
      // 1. Find the order
      const order = await tx.order.findFirst({
        where: {
          shop,
          shopifyOrderId
        }
      });

      if (!order) {
        throw new Error(`Order ${shopifyOrderId} not found`);
      }

      if (!order.cashbackAmount || Number(order.cashbackAmount) === 0) {
        // Still return customerId for points clawback attempt
        return {
          success: true,
          clawbackAmount: 0,
          newBalance: 0,
          customerId: order.customerId,
          message: "No cashback to clawback for this order"
        };
      }

      // 2. Calculate clawback amount
      let clawbackAmount: number;
      if (isFullRefund) {
        // Full refund = full clawback
        clawbackAmount = Number(order.cashbackAmount);
      } else {
        // Partial refund = proportional clawback
        const refundPercentage = refundAmount / Number(order.totalPrice);
        clawbackAmount = Number(order.cashbackAmount) * refundPercentage;
      }

      console.log(`[Refund Handler] Calculated clawback: ${clawbackAmount} for order ${shopifyOrderId}`);

      // 3. Check if cashback was already processed
      if (!order.cashbackProcessed) {
        // Cashback not yet credited - just update the order
        await tx.order.update({
          where: { id: order.id },
          data: {
            cashbackAmount: isFullRefund ? 0 : Number(order.cashbackAmount) - clawbackAmount,
            cashbackEligible: isFullRefund ? false : order.cashbackEligible,
            totalRefunded: { increment: refundAmount },
            netAmount: Number(order.totalPrice) - (Number(order.totalRefunded) + refundAmount)
          }
        });

        // Still return customerId for points clawback attempt
        return {
          success: true,
          clawbackAmount,
          newBalance: 0,
          customerId: order.customerId,
          message: "Pending cashback adjusted (not yet credited)"
        };
      }

      // 4. Cashback was already credited - need to deduct from customer balance
      // Check for existing clawback to prevent double processing
      const existingClawback = await tx.storeCreditLedger.findFirst({
        where: {
          shop,
          shopifyOrderId,
          type: 'REFUND_CLAWBACK'
        }
      });

      if (existingClawback) {
        console.log(`[Refund Handler] Cashback clawback already processed for order ${shopifyOrderId}`);
        // Still return customerId for points clawback attempt (might not have been done)
        return {
          success: true,
          clawbackAmount: Number(existingClawback.amount) * -1, // Convert back to positive
          newBalance: Number(existingClawback.balance),
          customerId: order.customerId,
          message: "Cashback clawback already processed for this refund"
        };
      }

      // 5. Get current customer balance
      const lastLedger = await tx.storeCreditLedger.findFirst({
        where: { customerId: order.customerId },
        orderBy: { createdAt: 'desc' }
      });

      const currentBalance = lastLedger ? Number(lastLedger.balance) : 0;
      const newBalance = currentBalance - clawbackAmount;

      // 6. Create negative ledger entry for clawback
      await tx.storeCreditLedger.create({
        data: {
          id: uuidv4(),
          customerId: order.customerId,
          shop,
          amount: -clawbackAmount, // Negative amount for deduction
          balance: newBalance,
          type: 'REFUND_CLAWBACK',
          shopifyOrderId,
          orderId: order.id,
          metadata: {
            refundType: isFullRefund ? 'FULL' : 'PARTIAL',
            refundAmount,
            originalCashback: Number(order.cashbackAmount),
            clawbackAmount,
            orderNumber: order.shopifyOrderName
          },
          createdAt: new Date()
        }
      });

      // 7. Update customer balance (can go negative per industry standard)
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          storeCredit: newBalance,
          totalCashbackEarned: {
            decrement: clawbackAmount
          },
          totalRefunded: {
            increment: refundAmount
          },
          netSpent: {
            decrement: refundAmount
          }
        }
      });

      // 8. Update order to reflect refund
      await tx.order.update({
        where: { id: order.id },
        data: {
          totalRefunded: { increment: refundAmount },
          netAmount: Number(order.totalPrice) - (Number(order.totalRefunded) + refundAmount),
          cashbackAmount: isFullRefund ? 0 : Number(order.cashbackAmount) - clawbackAmount,
          financialStatus: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
        }
      });

      // 9. Create refund record if not exists
      await tx.orderRefund.upsert({
        where: {
          shopifyRefundId: `${shopifyOrderId}-${Date.now()}` // Unique ID for this refund
        },
        create: {
          id: uuidv4(),
          orderId: order.id,
          shopifyRefundId: `${shopifyOrderId}-${Date.now()}`,
          shopifyCreatedAt: new Date(),
          amount: refundAmount,
          cashbackAdjustment: clawbackAmount,
          cashbackProcessed: true,
          createdAt: new Date()
        },
        update: {
          cashbackProcessed: true
        }
      });

      console.log(`[Refund Handler] Successfully processed cashback clawback. New balance: ${newBalance}`);

      return {
        success: true,
        clawbackAmount,
        newBalance,
        customerId: order.customerId,
        message: `Cashback clawback of ${clawbackAmount} processed. New balance: ${newBalance}`
      };
    });

    // CRITICAL: Also clawback points if points system is enabled
    // This runs outside the main transaction because clawbackPoints has its own
    let pointsClawbackResult: { clawedBack: boolean; amount: number; reason: string } | undefined;

    if (result.success && result.customerId) {
      try {
        // Check if points system is enabled for this shop
        const pointsEnabled = await isPointsEnabled(shop);

        if (pointsEnabled) {
          console.log(`[Refund Handler] Points system enabled - attempting points clawback`);

          // Get the internal order ID from the database
          const order = await db.order.findFirst({
            where: { shop, shopifyOrderId },
            select: { id: true }
          });

          if (order) {
            pointsClawbackResult = await clawbackPoints(
              shop,
              result.customerId,
              order.id,
              refundAmount
            );

            console.log(`[Refund Handler] Points clawback result:`, pointsClawbackResult);
          } else {
            pointsClawbackResult = {
              clawedBack: false,
              amount: 0,
              reason: "Order not found for points clawback"
            };
          }
        } else {
          console.log(`[Refund Handler] Points system not enabled, skipping points clawback`);
        }
      } catch (pointsError: any) {
        console.error(`[Refund Handler] Error processing points clawback (non-fatal):`, pointsError);
        pointsClawbackResult = {
          clawedBack: false,
          amount: 0,
          reason: `Error: ${pointsError.message}`
        };
      }
    }

    return {
      ...result,
      pointsClawback: pointsClawbackResult,
      message: pointsClawbackResult?.clawedBack
        ? `${result.message} | Points clawback: ${pointsClawbackResult.amount} points`
        : result.message
    };
  } catch (error: any) {
    console.error(`[Refund Handler] Error processing refund clawback:`, error);
    return {
      success: false,
      clawbackAmount: 0,
      newBalance: 0,
      message: error.message
    };
  }
}

/**
 * Calculate tier impact after refund
 * Refunds may cause tier downgrade if spending drops below threshold
 */
export async function recalculateTierAfterRefund(
  customerId: string,
  shop: string
): Promise<void> {
  const { calculateAndAssignTier } = await import('./tier-management.server');

  const result = await calculateAndAssignTier(shop, customerId, 'ORDER');

  if (result.changed) {
    console.log(`[Refund Handler] Customer tier changed after refund`);

    // Optionally notify customer of tier change
    // await notifyTierChange(customerId, result.previousTierId, result.newTierId);
  }
}

/**
 * Handle store credit refunds (no clawback per Starbucks model)
 * If refund goes to store credit instead of original payment, keep the cashback
 */
export async function handleStoreCreditRefund(
  shopifyOrderId: string,
  shop: string,
  refundAmount: number
): Promise<{
  success: boolean;
  creditAmount: number;
  message: string;
}> {
  console.log(`[Refund Handler] Processing store credit refund for order ${shopifyOrderId}`);

  try {
    const result = await db.$transaction(async (tx) => {
      // Find the order
      const order = await tx.order.findFirst({
        where: {
          shop,
          shopifyOrderId
        }
      });

      if (!order) {
        throw new Error(`Order ${shopifyOrderId} not found`);
      }

      // Get current balance
      const lastLedger = await tx.storeCreditLedger.findFirst({
        where: { customerId: order.customerId },
        orderBy: { createdAt: 'desc' }
      });

      const currentBalance = lastLedger ? Number(lastLedger.balance) : 0;
      const newBalance = currentBalance + refundAmount;

      // Create positive ledger entry for store credit refund
      await tx.storeCreditLedger.create({
        data: {
          id: uuidv4(),
          customerId: order.customerId,
          shop,
          amount: refundAmount,
          balance: newBalance,
          type: 'REFUND_CREDIT',
          shopifyOrderId,
          orderId: order.id,
          metadata: {
            refundType: 'STORE_CREDIT',
            refundAmount,
            cashbackKept: Number(order.cashbackAmount), // Customer keeps cashback
            orderNumber: order.shopifyOrderName,
            note: 'Refund to store credit - cashback retained'
          },
          createdAt: new Date()
        }
      });

      // Update customer balance
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          storeCredit: newBalance
          // Note: NOT adjusting totalCashbackEarned since they keep the cashback
        }
      });

      // Update order status
      await tx.order.update({
        where: { id: order.id },
        data: {
          totalRefunded: { increment: refundAmount },
          financialStatus: 'PARTIALLY_REFUNDED'
          // Note: NOT adjusting cashbackAmount since they keep it
        }
      });

      console.log(`[Refund Handler] Store credit refund processed. New balance: ${newBalance}`);

      return {
        success: true,
        creditAmount: refundAmount,
        message: `Store credit of ${refundAmount} added. Cashback retained per policy.`
      };
    });

    return result;
  } catch (error: any) {
    console.error(`[Refund Handler] Error processing store credit refund:`, error);
    return {
      success: false,
      creditAmount: 0,
      message: error.message
    };
  }
}