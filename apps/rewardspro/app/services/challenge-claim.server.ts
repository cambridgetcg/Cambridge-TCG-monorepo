/**
 * Challenge Claim Service
 *
 * Handles reward delivery when customers claim completed challenges.
 * Supports multiple reward types: points, store credit, discounts, tier upgrades.
 * Integrates with the mission gamification system for XP, streaks, and combos.
 */

import prisma from "../db.server";
import { earnPoints } from "./points-ledger.server";
import { createClaimEvent } from "./mission-events.server";
import { assignCustomerToTier } from "./manual-tier-assignment.server";
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
  challengeId: string,
  admin?: any
): Promise<ClaimResult> {
  console.log(
    `${LOG_PREFIX} Claiming reward for customer ${customerId} on challenge ${challengeId}`
  );

  // Atomically claim the participant slot to prevent double-claim race condition
  // Uses updateMany with status filter — returns count=0 if already claimed by concurrent request
  // We set claimedAt as a lock marker (actual CLAIMED status is set after delivery)
  const claimLock = await prisma.challengeParticipant.updateMany({
    where: {
      challengeId,
      customerId,
      status: "COMPLETED",
      claimedAt: null, // Extra guard: only if not already being claimed
    },
    data: {
      claimedAt: new Date(), // Mark as in-progress claim
    },
  });

  if (claimLock.count === 0) {
    // Either not enrolled, not completed, or already claimed
    const participant = await prisma.challengeParticipant.findFirst({
      where: { challengeId, customerId },
      select: { status: true },
    });

    if (!participant) {
      return {
        success: false,
        error: "You are not enrolled in this challenge",
      };
    }

    if (participant.status === "CLAIMED") {
      return {
        success: false,
        error: "Reward has already been claimed",
      };
    }

    return {
      success: false,
      error: `Cannot claim reward: challenge is ${participant.status.toLowerCase()}`,
    };
  }

  // Get participant record (now locked via claimedAt)
  const participant = await prisma.challengeParticipant.findFirst({
    where: { challengeId, customerId },
  });

  if (!participant) {
    return {
      success: false,
      error: "You are not enrolled in this challenge",
    };
  }

  // Fetch challenge and reward separately
  const [challenge, reward] = await Promise.all([
    prisma.challenge.findUnique({ where: { id: challengeId } }),
    prisma.challengeReward.findFirst({ where: { challengeId } }),
  ]);

  if (!challenge) {
    // Revert claim lock since we can't deliver
    await prisma.challengeParticipant.update({
      where: { id: participant.id },
      data: { claimedAt: null },
    });
    return {
      success: false,
      error: "Challenge not found",
    };
  }

  // Verify challenge belongs to shop
  if (challenge.shop !== shop) {
    await prisma.challengeParticipant.update({
      where: { id: participant.id },
      data: { claimedAt: null },
    });
    return {
      success: false,
      error: "Challenge not found",
    };
  }

  // Get the reward
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
          challenge.name,
          rewardValue.amount || 0
        );
        break;

      case "STORE_CREDIT":
        deliveryResult = await deliverStoreCreditReward(
          shop,
          customerId,
          challengeId,
          challenge.name,
          rewardValue.amount || 0
        );
        break;

      case "DISCOUNT":
        deliveryResult = await deliverDiscountReward(
          shop,
          customerId,
          challengeId,
          challenge.name,
          rewardValue,
          admin
        );
        break;

      case "TIER_UPGRADE":
        deliveryResult = await deliverTierUpgradeReward(
          shop,
          customerId,
          challengeId,
          challenge.name,
          rewardValue
        );
        break;

      case "CUSTOM":
        deliveryResult = await deliverCustomReward(
          shop,
          customerId,
          challengeId,
          challenge.name,
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
    await prisma.challengeParticipant.update({
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
    await prisma.challenge.update({
      where: { id: challengeId },
      data: {
        claimedCount: { increment: 1 },
        totalRewardsAwarded: {
          increment: typeof deliveryResult.rewardValue === "number" ? deliveryResult.rewardValue : 1,
        },
      },
    });

    // Create a claim-specific event for the reward reveal animation
    // Note: XP, streak, and combo were already processed on mission COMPLETION
    // (in challenge-progress.server.ts), this is just for the claim animation
    try {
      await createClaimEvent(
        shop,
        customerId,
        challengeId,
        challenge.name,
        reward.description
      );
    } catch (eventError) {
      // Log but don't fail the claim if event creation fails
      console.error(`${LOG_PREFIX} Claim event creation error (non-fatal):`, eventError);
    }

    console.log(
      `${LOG_PREFIX} Successfully claimed reward for customer ${customerId}`
    );

    return {
      ...deliveryResult,
      rewardType,
    };
  }

  // Delivery failed — revert claim lock so customer can retry
  await prisma.challengeParticipant.update({
    where: { id: participant.id },
    data: { claimedAt: null },
  });

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

  try {
    // Use the points ledger to award points
    // earnPoints throws on error, so we wrap in try/catch
    const transaction = await earnPoints({
      shop,
      customerId,
      amount,
      type: "CHALLENGE_COMPLETED",
      description: `Completed challenge: ${challengeName}`,
      challengeId,
    });

    return {
      success: true,
      rewardValue: amount,
      deliveryId: transaction.id,
      newBalance: transaction.balance,
      message: `Earned ${amount} points`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to award points",
    };
  }
}

/**
 * Deliver store credit reward.
 *
 * The ledger insert and the customer balance increment are executed in a
 * single Prisma transaction so a failure on either side rolls the other
 * back — we never want an unbacked ledger row (credit "awarded" but
 * balance not moved) or a balance change with no audit trail.
 *
 * The balance increment uses `{ increment: N }` which Prisma compiles to
 * an atomic `UPDATE storeCredit = storeCredit + N`, so concurrent claims
 * from multiple challenges on the same customer add correctly without
 * lost updates. The returned row (`.storeCredit`) is the post-commit
 * value for *this* transaction; we surface it as `newBalance` instead of
 * reading with a separate query that could observe intervening writes.
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

  const { ledgerEntry, updated } = await prisma.$transaction(async (tx) => {
    const ledgerEntry = await tx.storeCreditLedger.create({
      data: {
        shop,
        customerId,
        type: "CHALLENGE_REWARD",
        amount: amountInDollars,
        description: `Challenge reward: ${challengeName}`,
        metadata: { challengeId },
      },
    });

    const updated = await tx.customer.update({
      where: { id: customerId },
      data: { storeCredit: { increment: amountInDollars } },
      select: { storeCredit: true },
    });

    return { ledgerEntry, updated };
  });

  return {
    success: true,
    rewardValue: amountInDollars,
    deliveryId: ledgerEntry.id,
    newBalance: Number(updated.storeCredit),
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
  config: RewardValue,
  admin?: any
): Promise<ClaimResult> {
  console.log(
    `${LOG_PREFIX} Creating discount code for customer ${customerId}`
  );

  // Generate a unique discount code
  const code = `CHAL-${challengeId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const discountValue =
    config.type === "percentage"
      ? `${config.value}% off`
      : `$${(config.value || 0) / 100} off`;

  // Create Shopify discount code if admin API is available
  if (admin) {
    try {
      const { createDiscountService } = await import("~/services/shopify-discount.service");
      const discountService = createDiscountService(admin, shop);

      const discountType = config.type === "percentage" ? "percentage" : "fixed_amount";
      const shopifyResult = await discountService.createDiscountCode({
        title: `Challenge Reward: ${challengeName}`,
        code,
        type: discountType,
        value: discountType === "percentage" ? (config.value || 0) : (config.value || 0) / 100,
        usageLimit: 1,
      });

      if (shopifyResult.success) {
        console.log(`${LOG_PREFIX} Shopify discount created: ${shopifyResult.discountId}`);
      } else {
        console.error(`${LOG_PREFIX} Shopify discount creation failed: ${shopifyResult.error}`);
        // Code still valid locally for manual creation
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error creating Shopify discount (non-fatal):`, error);
    }
  }

  return {
    success: true,
    rewardValue: config.value,
    deliveryId: code,
    message: `Discount code: ${code} (${discountValue})`,
  };
}

/**
 * Deliver tier upgrade reward.
 *
 * Previously this wrote `Customer.currentTierId` directly and created its
 * own (broken — wrong field names) TierChangeLog entry, skipping the tier
 * resolution system. That meant:
 *   • CustomerTierState.tierSource was never updated, so other tier
 *     sources (subscription, manual admin override, spending) could
 *     silently win on the next recalc and undo the challenge award.
 *   • Duration (`config.durationDays`) was calculated but never enforced —
 *     the expiry lived only in a log note.
 *   • The log insert used fields (`newTierId`, `newTierName`, `source`)
 *     that don't exist in the schema; it only compiled because the Data
 *     API adapter has permissive types.
 *
 * Now: delegate to `assignCustomerToTier`, which performs the whole
 * transition correctly — Customer.currentTierId, CustomerTierState upsert
 * with tierSource=MANUAL_OVERRIDE + expiry, TierChangeLog with valid
 * schema fields, and idempotent "already in this tier" handling.
 *
 * Challenge context (challengeId, challengeName) is embedded in the
 * `processedBy` identifier and `note`, so tier-change reports can
 * distinguish "earned by clearing challenge X" from a hand-toggled admin
 * override without needing a new TierTriggerType enum value (which would
 * require a migration).
 */
async function deliverTierUpgradeReward(
  shop: string,
  customerId: string,
  challengeId: string,
  challengeName: string,
  config: RewardValue
): Promise<ClaimResult> {
  console.log(
    `${LOG_PREFIX} Upgrading tier for customer ${customerId} to ${config.tierId} (challenge ${challengeId})`
  );

  if (!config.tierId) {
    return { success: false, error: "No tier specified for upgrade" };
  }

  const result = await assignCustomerToTier(
    shop,
    customerId,
    config.tierId,
    // Synthetic "admin user" identifier so reports can filter to
    // challenge-awarded tiers without reading the note blob.
    `system:challenge-reward:${challengeId}`,
    `Challenge reward: ${challengeName}`,
    {
      // If the challenge grants a time-limited tier, the tier-resolution
      // system will honor the expiry; automatic recalc on the expiry
      // date will move the customer back to their spending-based tier.
      overrideDuration: config.durationDays,
      // Duration absent = permanent override (until another source wins).
      permanentOverride: !config.durationDays,
    }
  );

  if (!result.success) {
    // "Already in this tier" returns success=false with a message; treat
    // that as a no-op success so the shopper isn't shown an error for a
    // challenge they legitimately claimed.
    if (result.message === "Customer is already in this tier") {
      return {
        success: true,
        rewardValue: result.newTierName ?? "tier maintained",
        deliveryId: `tier-upgrade-${challengeId}`,
        message: result.message,
      };
    }
    return {
      success: false,
      error: result.error ?? "Tier upgrade failed",
    };
  }

  return {
    success: true,
    rewardValue: result.newTierName ?? "upgraded",
    deliveryId: `tier-upgrade-${challengeId}`,
    message: result.message
      ?? `Upgraded to ${result.newTierName}${config.durationDays ? ` for ${config.durationDays} days` : ""}`,
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
  const result = await prisma.challengeParticipant.updateMany({
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
