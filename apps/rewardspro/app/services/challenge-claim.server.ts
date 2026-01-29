/**
 * Challenge Claim Service
 *
 * Handles reward delivery when customers claim completed challenges.
 * Supports multiple reward types: points, store credit, discounts, tier upgrades.
 */

import db from "../db.server";
import { earnPoints } from "./points-ledger.server";
import type { ChallengeRewardType, RewardValue } from "./challenge-management.server";

const LOG_PREFIX = "[ChallengeClaim]";

// ============================================
// TYPES
// ============================================

export interface ClaimResult {
  success: boolean;
  rewardType?: ChallengeRewardType;
  rewardValue?: number | string;
  deliveryId?: string; // Points ledger ID, discount code, etc.
  newBalance?: number; // For points rewards
  message?: string;
  error?: string;
}

// ============================================
// CLAIM REWARD
// ============================================

/**
 * Claim a completed challenge reward
 */
export async function claimChallengeReward(
  shop: string,
  customerId: string,
  challengeId: string
): Promise<ClaimResult> {
  console.log(
    `${LOG_PREFIX} Claiming reward for customer ${customerId} on challenge ${challengeId}`
  );

  // Get the participant record
  const participant = await db.challengeParticipant.findUnique({
    where: {
      challengeId_customerId: { challengeId, customerId },
    },
    include: {
      challenge: {
        include: { reward: true },
      },
    },
  });

  if (!participant) {
    return {
      success: false,
      error: "You are not enrolled in this challenge",
    };
  }

  // Verify challenge belongs to shop
  if (participant.challenge.shop !== shop) {
    return {
      success: false,
      error: "Challenge not found",
    };
  }

  // Check status
  if (participant.status === "CLAIMED") {
    return {
      success: false,
      error: "Reward has already been claimed",
    };
  }

  if (participant.status !== "COMPLETED") {
    return {
      success: false,
      error: `Cannot claim reward: challenge is ${participant.status.toLowerCase()}`,
    };
  }

  // Get the reward
  const reward = participant.challenge.reward;
  if (!reward) {
    return {
      success: false,
      error: "Challenge has no reward configured",
    };
  }

  const rewardType = reward.rewardType as ChallengeRewardType;
  const rewardValue = reward.rewardValue as RewardValue;

  // Deliver the reward based on type
  let deliveryResult: ClaimResult;

  try {
    switch (rewardType) {
      case "POINTS":
        deliveryResult = await deliverPointsReward(
          shop,
          customerId,
          challengeId,
          participant.challenge.name,
          rewardValue.amount || 0
        );
        break;

      case "STORE_CREDIT":
        deliveryResult = await deliverStoreCreditReward(
          shop,
          customerId,
          challengeId,
          participant.challenge.name,
          rewardValue.amount || 0
        );
        break;

      case "DISCOUNT":
        deliveryResult = await deliverDiscountReward(
          shop,
          customerId,
          challengeId,
          participant.challenge.name,
          rewardValue
        );
        break;

      case "TIER_UPGRADE":
        deliveryResult = await deliverTierUpgradeReward(
          shop,
          customerId,
          challengeId,
          participant.challenge.name,
          rewardValue
        );
        break;

      case "CUSTOM":
        deliveryResult = await deliverCustomReward(
          shop,
          customerId,
          challengeId,
          participant.challenge.name,
          rewardValue
        );
        break;

      default:
        deliveryResult = {
          success: false,
          error: `Unknown reward type: ${rewardType}`,
        };
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error delivering reward:`, error);
    deliveryResult = {
      success: false,
      error: error instanceof Error ? error.message : "Failed to deliver reward",
    };
  }

  // If delivery succeeded, update participant status
  if (deliveryResult.success) {
    await db.challengeParticipant.update({
      where: { id: participant.id },
      data: {
        status: "CLAIMED",
        claimedAt: new Date(),
        rewardDelivered: true,
        rewardDeliveryId: deliveryResult.deliveryId,
        rewardDeliveryNotes: `${rewardType}: ${deliveryResult.message || "Delivered successfully"}`,
      },
    });

    // Update challenge statistics
    await db.challenge.update({
      where: { id: challengeId },
      data: {
        claimedCount: { increment: 1 },
        totalRewardsAwarded: {
          increment: typeof deliveryResult.rewardValue === "number" ? deliveryResult.rewardValue : 1,
        },
      },
    });

    console.log(
      `${LOG_PREFIX} Successfully claimed reward for customer ${customerId}`
    );
  }

  return {
    ...deliveryResult,
    rewardType,
  };
}

// ============================================
// REWARD DELIVERY IMPLEMENTATIONS
// ============================================

/**
 * Deliver points reward
 */
async function deliverPointsReward(
  shop: string,
  customerId: string,
  challengeId: string,
  challengeName: string,
  amount: number
): Promise<ClaimResult> {
  console.log(`${LOG_PREFIX} Delivering ${amount} points to customer ${customerId}`);

  // Use the points ledger to award points
  const result = await earnPoints({
    shop,
    customerId,
    amount,
    type: "CHALLENGE_COMPLETED",
    description: `Completed challenge: ${challengeName}`,
    challengeId,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error || "Failed to award points",
    };
  }

  // Get updated balance
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: { pointsBalance: true },
  });

  return {
    success: true,
    rewardValue: amount,
    deliveryId: result.ledgerId,
    newBalance: customer ? Number(customer.pointsBalance) : undefined,
    message: `Earned ${amount} points`,
  };
}

/**
 * Deliver store credit reward
 */
async function deliverStoreCreditReward(
  shop: string,
  customerId: string,
  challengeId: string,
  challengeName: string,
  amountInCents: number
): Promise<ClaimResult> {
  const amountInDollars = amountInCents / 100;
  console.log(
    `${LOG_PREFIX} Delivering $${amountInDollars} store credit to customer ${customerId}`
  );

  // Create store credit ledger entry
  const ledgerEntry = await db.storeCreditLedger.create({
    data: {
      shop,
      customerId,
      type: "CHALLENGE_REWARD",
      amount: amountInDollars,
      description: `Challenge reward: ${challengeName}`,
      metadata: { challengeId },
    },
  });

  // Update customer store credit balance
  await db.customer.update({
    where: { id: customerId },
    data: {
      storeCredit: { increment: amountInDollars },
    },
  });

  // Get updated balance
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: { storeCredit: true },
  });

  return {
    success: true,
    rewardValue: amountInDollars,
    deliveryId: ledgerEntry.id,
    newBalance: customer ? Number(customer.storeCredit) : undefined,
    message: `Earned $${amountInDollars.toFixed(2)} store credit`,
  };
}

/**
 * Deliver discount code reward
 */
async function deliverDiscountReward(
  shop: string,
  customerId: string,
  challengeId: string,
  challengeName: string,
  config: RewardValue
): Promise<ClaimResult> {
  console.log(
    `${LOG_PREFIX} Creating discount code for customer ${customerId}`
  );

  // Generate a unique discount code
  const code = `CHAL-${challengeId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  // For now, store the discount info in the participant notes
  // In a full implementation, you would create the discount in Shopify via GraphQL
  const discountValue =
    config.type === "percentage"
      ? `${config.value}% off`
      : `$${(config.value || 0) / 100} off`;

  // TODO: Create actual Shopify discount code via admin GraphQL API
  // This requires the admin API context which isn't available in this service
  // For now, we'll record it for manual creation or separate job processing

  return {
    success: true,
    rewardValue: config.value,
    deliveryId: code,
    message: `Discount code: ${code} (${discountValue})`,
  };
}

/**
 * Deliver tier upgrade reward
 */
async function deliverTierUpgradeReward(
  shop: string,
  customerId: string,
  challengeId: string,
  challengeName: string,
  config: RewardValue
): Promise<ClaimResult> {
  console.log(
    `${LOG_PREFIX} Upgrading tier for customer ${customerId} to ${config.tierId}`
  );

  if (!config.tierId) {
    return {
      success: false,
      error: "No tier specified for upgrade",
    };
  }

  // Verify the tier exists
  const tier = await db.tier.findFirst({
    where: { id: config.tierId, shop },
  });

  if (!tier) {
    return {
      success: false,
      error: "Target tier not found",
    };
  }

  // Calculate expiration if temporary
  const expiresAt = config.durationDays
    ? new Date(Date.now() + config.durationDays * 24 * 60 * 60 * 1000)
    : null;

  // Update the customer's tier
  // Note: This is a simplified implementation
  // A full implementation would use the tier resolution service
  await db.customer.update({
    where: { id: customerId },
    data: {
      currentTierId: config.tierId,
    },
  });

  // Log the tier change
  await db.tierChangeLog.create({
    data: {
      shop,
      customerId,
      newTierId: config.tierId,
      newTierName: tier.name,
      changeType: "UPGRADE",
      source: "CHALLENGE_REWARD",
      note: `Challenge reward: ${challengeName}${expiresAt ? ` (expires ${expiresAt.toISOString()})` : ""}`,
    },
  });

  return {
    success: true,
    rewardValue: tier.name,
    deliveryId: `tier-upgrade-${challengeId}`,
    message: `Upgraded to ${tier.name}${config.durationDays ? ` for ${config.durationDays} days` : ""}`,
  };
}

/**
 * Deliver custom reward (requires manual fulfillment)
 */
async function deliverCustomReward(
  shop: string,
  customerId: string,
  challengeId: string,
  challengeName: string,
  config: RewardValue
): Promise<ClaimResult> {
  console.log(
    `${LOG_PREFIX} Recording custom reward for customer ${customerId}`
  );

  // Custom rewards are just recorded for manual fulfillment
  // The merchant will see these in their dashboard

  return {
    success: true,
    rewardValue: config.description || "Custom reward",
    deliveryId: `custom-${challengeId}-${Date.now()}`,
    message: config.fulfillmentInstructions || "Reward pending fulfillment",
  };
}

// ============================================
// MAINTENANCE
// ============================================

/**
 * Expire unclaimed rewards after challenge grace period
 * (Called by cron job)
 */
export async function expireUnclaimedRewards(
  shop: string,
  gracePeriodDays: number = 30
): Promise<{ expired: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);

  // Find completed but unclaimed participants past grace period
  const result = await db.challengeParticipant.updateMany({
    where: {
      shop,
      status: "COMPLETED",
      completedAt: { lt: cutoffDate },
    },
    data: {
      status: "EXPIRED",
      rewardDeliveryNotes: `Expired after ${gracePeriodDays} days unclaimed`,
    },
  });

  if (result.count > 0) {
    console.log(
      `${LOG_PREFIX} Expired ${result.count} unclaimed rewards for shop ${shop}`
    );
  }

  return { expired: result.count };
}
