/**
 * Challenge Progress Service
 *
 * Handles progress tracking, auto-enrollment, and completion detection
 * for customer challenges. This service is called from webhooks and
 * other event sources to update customer progress.
 *
 * Integrates with the mission gamification system to award XP, update
 * streaks/combos, and trigger celebration animations on completion.
 */

import db from "../db.server";
import type {
  ChallengeObjectiveType,
  ChallengeParticipantStatus,
  ObjectiveConfig,
} from "./challenge-management.server";
import { processMissionCompletion, type MissionCompletionResult } from "./mission-stats.server";

const LOG_PREFIX = "[ChallengeProgress]";

// ============================================
// TYPES
// ============================================

export interface ProgressUpdateResult {
  participantId: string;
  challengeId: string;
  challengeName: string;
  previousProgress: number;
  newProgress: number;
  progressDelta: number;
  targetValue: number;
  progressPercent: number;
  isCompleted: boolean;
  isNewlyCompleted: boolean; // Just crossed threshold this update
}

export interface OrderData {
  orderId: string;
  orderNumber?: string;
  totalAmount: number; // in dollars
  lineItems?: Array<{
    productId?: string;
    variantId?: string;
    quantity: number;
    price: number;
  }>;
  discountCodes?: string[];
  customerId: string;
}

export interface CustomerChallengeInfo {
  id: string;
  challengeId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  objectiveType: ChallengeObjectiveType;
  targetValue: number;
  currentProgress: number;
  progressPercent: number;
  status: ChallengeParticipantStatus;
  reward: {
    type: string;
    value: number | string;
    description: string;
  } | null;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  claimedAt: string | null;
}

// ============================================
// PROGRESS TRACKING
// ============================================

/**
 * Update a customer's progress on a specific challenge
 */
export async function updateChallengeProgress(
  shop: string,
  customerId: string,
  challengeId: string,
  progressDelta: number,
  source: {
    type: string; // "ORDER", "REFERRAL", "REVIEW", "STREAK", "MANUAL"
    id?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ProgressUpdateResult | null> {
  console.log(
    `${LOG_PREFIX} Updating progress for customer ${customerId} on challenge ${challengeId}, delta: ${progressDelta}`
  );

  // Get the challenge
  const challenge = await db.challenge.findFirst({
    where: { id: challengeId, shop, status: "ACTIVE" },
  });

  if (!challenge) {
    console.log(`${LOG_PREFIX} Challenge ${challengeId} not found or not active`);
    return null;
  }

  // Get or create participant
  let participant = await db.challengeParticipant.findUnique({
    where: {
      challengeId_customerId: { challengeId, customerId },
    },
  });

  const wasNewParticipant = !participant;

  if (!participant) {
    // Auto-enroll the customer
    participant = await db.challengeParticipant.create({
      data: {
        challengeId,
        customerId,
        shop,
        currentProgress: 0,
        progressPercent: 0,
        status: "IN_PROGRESS",
      },
    });

    // Update challenge statistics
    await db.challenge.update({
      where: { id: challengeId },
      data: { totalParticipants: { increment: 1 } },
    });

    console.log(`${LOG_PREFIX} Auto-enrolled customer ${customerId} in challenge ${challengeId}`);
  }

  // Don't update if already completed or claimed
  if (participant.status === "COMPLETED" || participant.status === "CLAIMED") {
    console.log(
      `${LOG_PREFIX} Participant already ${participant.status}, skipping update`
    );
    return {
      participantId: participant.id,
      challengeId,
      challengeName: challenge.name,
      previousProgress: participant.currentProgress,
      newProgress: participant.currentProgress,
      progressDelta: 0,
      targetValue: challenge.targetValue,
      progressPercent: participant.progressPercent,
      isCompleted: true,
      isNewlyCompleted: false,
    };
  }

  // Calculate new progress
  const previousProgress = participant.currentProgress;
  const newProgress = Math.max(0, previousProgress + progressDelta);
  const targetValue = challenge.targetValue;
  const newProgressPercent = Math.min(
    100,
    Math.round((newProgress / targetValue) * 100)
  );
  const wasCompleted = previousProgress >= targetValue;
  const isNowCompleted = newProgress >= targetValue;
  const isNewlyCompleted = !wasCompleted && isNowCompleted;

  // Update participant
  const updatedParticipant = await db.challengeParticipant.update({
    where: { id: participant.id },
    data: {
      currentProgress: newProgress,
      progressPercent: newProgressPercent,
      status: isNowCompleted ? "COMPLETED" : "IN_PROGRESS",
      completedAt: isNewlyCompleted ? new Date() : participant.completedAt,
    },
  });

  // Log the progress update
  await db.challengeProgressLog.create({
    data: {
      challengeId,
      participantId: participant.id,
      shop,
      progressDelta,
      newProgress,
      newProgressPercent,
      sourceType: source.type,
      sourceId: source.id,
      description: source.description,
      metadata: source.metadata,
    },
  });

  // Update challenge statistics if newly completed
  if (isNewlyCompleted) {
    await db.challenge.update({
      where: { id: challengeId },
      data: { completedCount: { increment: 1 } },
    });

    // Process mission gamification (XP, streak, combo, events)
    // This awards XP and creates the completion event for animations
    try {
      const missionResult = await processMissionCompletion(shop, customerId, challengeId);
      console.log(
        `${LOG_PREFIX} Mission processing complete: +${missionResult.xpResult.xpEarned + missionResult.xpResult.bonusXp} XP, ` +
          `streak=${missionResult.streakInfo.currentStreak}, combo=${missionResult.comboInfo.todayComboCount}`
      );
    } catch (missionError) {
      // Log but don't fail the progress update if mission processing fails
      console.error(`${LOG_PREFIX} Mission processing error (non-fatal):`, missionError);
    }

    console.log(
      `${LOG_PREFIX} Customer ${customerId} completed challenge ${challengeId}!`
    );
  }

  return {
    participantId: updatedParticipant.id,
    challengeId,
    challengeName: challenge.name,
    previousProgress,
    newProgress,
    progressDelta,
    targetValue,
    progressPercent: newProgressPercent,
    isCompleted: isNowCompleted,
    isNewlyCompleted,
  };
}

/**
 * Process an order and update all relevant challenge progress
 */
export async function processOrderForChallenges(
  shop: string,
  customerId: string,
  order: OrderData
): Promise<ProgressUpdateResult[]> {
  console.log(
    `${LOG_PREFIX} Processing order ${order.orderId} for customer ${customerId}`
  );

  const results: ProgressUpdateResult[] = [];
  const now = new Date();

  // Get customer's tier for eligibility checks
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: { currentTierId: true },
  });

  // Get all active challenges for the shop
  const challenges = await db.challenge.findMany({
    where: {
      shop,
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
  });

  for (const challenge of challenges) {
    // Check tier eligibility
    if (challenge.tierRestrictions) {
      const restrictions = challenge.tierRestrictions as { allowedTierIds: string[] };
      if (
        restrictions.allowedTierIds?.length > 0 &&
        (!customer?.currentTierId ||
          !restrictions.allowedTierIds.includes(customer.currentTierId))
      ) {
        continue;
      }
    }

    const objectiveType = challenge.objectiveType as ChallengeObjectiveType;
    const config = (challenge.objectiveConfig as ObjectiveConfig) || {};
    let progressDelta = 0;

    switch (objectiveType) {
      case "SPENDING": {
        // Check minimum order value
        if (config.minOrderValue && order.totalAmount < config.minOrderValue) {
          continue;
        }
        // Check if discounted orders are excluded
        if (config.excludeDiscounted && order.discountCodes?.length) {
          continue;
        }
        // Progress is the order amount (in dollars or cents based on config)
        progressDelta = Math.round(order.totalAmount);
        break;
      }

      case "ORDER_COUNT": {
        // Check minimum order value
        if (config.minOrderValue && order.totalAmount < config.minOrderValue) {
          continue;
        }
        // Each qualifying order counts as 1
        progressDelta = 1;
        break;
      }

      case "PRODUCT_PURCHASE": {
        if (!order.lineItems) continue;

        // Check if order contains qualifying products
        let qualifyingQuantity = 0;
        for (const item of order.lineItems) {
          const productMatches =
            config.productIds?.includes(item.productId || "") ||
            config.productIds?.includes(item.variantId || "");

          if (productMatches) {
            qualifyingQuantity += item.quantity;
          }
        }

        if (qualifyingQuantity === 0) continue;

        progressDelta = config.quantity
          ? Math.min(qualifyingQuantity, config.quantity)
          : qualifyingQuantity;
        break;
      }

      case "STREAK": {
        // Streak is handled separately by a cron job
        // Here we just record that an order was placed (for streak tracking)
        // The actual streak calculation happens in processStreakProgress
        continue;
      }

      case "REFERRAL":
      case "REVIEW": {
        // These are handled by separate webhook handlers
        continue;
      }

      default:
        continue;
    }

    if (progressDelta > 0) {
      const result = await updateChallengeProgress(
        shop,
        customerId,
        challenge.id,
        progressDelta,
        {
          type: "ORDER",
          id: order.orderId,
          description: `Order ${order.orderNumber || order.orderId}`,
          metadata: {
            orderTotal: order.totalAmount,
            orderNumber: order.orderNumber,
          },
        }
      );

      if (result) {
        results.push(result);
      }
    }
  }

  console.log(
    `${LOG_PREFIX} Processed order for ${results.length} challenges`
  );
  return results;
}

/**
 * Process a referral completion
 */
export async function processReferralForChallenges(
  shop: string,
  referrerId: string,
  referralId: string,
  referralPurchaseValue?: number
): Promise<ProgressUpdateResult[]> {
  console.log(
    `${LOG_PREFIX} Processing referral ${referralId} for customer ${referrerId}`
  );

  const results: ProgressUpdateResult[] = [];
  const now = new Date();

  // Get all active referral challenges
  const challenges = await db.challenge.findMany({
    where: {
      shop,
      status: "ACTIVE",
      objectiveType: "REFERRAL",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
  });

  for (const challenge of challenges) {
    const config = (challenge.objectiveConfig as ObjectiveConfig) || {};

    // Check if referral purchase is required
    if (config.requirePurchase && !referralPurchaseValue) {
      continue;
    }

    // Check minimum purchase value
    if (
      config.minPurchaseValue &&
      (!referralPurchaseValue || referralPurchaseValue < config.minPurchaseValue)
    ) {
      continue;
    }

    const result = await updateChallengeProgress(
      shop,
      referrerId,
      challenge.id,
      1, // Each referral counts as 1
      {
        type: "REFERRAL",
        id: referralId,
        description: "Successful referral",
        metadata: { purchaseValue: referralPurchaseValue },
      }
    );

    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Process a product review
 */
export async function processReviewForChallenges(
  shop: string,
  customerId: string,
  reviewId: string,
  productId: string,
  rating: number
): Promise<ProgressUpdateResult[]> {
  console.log(
    `${LOG_PREFIX} Processing review ${reviewId} for customer ${customerId}`
  );

  const results: ProgressUpdateResult[] = [];
  const now = new Date();

  // Get all active review challenges
  const challenges = await db.challenge.findMany({
    where: {
      shop,
      status: "ACTIVE",
      objectiveType: "REVIEW",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
  });

  for (const challenge of challenges) {
    const config = (challenge.objectiveConfig as ObjectiveConfig) || {};

    // Check minimum rating
    if (config.minRating && rating < config.minRating) {
      continue;
    }

    // Check if specific products are required
    if (config.productIds?.length && !config.productIds.includes(productId)) {
      continue;
    }

    const result = await updateChallengeProgress(
      shop,
      customerId,
      challenge.id,
      1, // Each review counts as 1
      {
        type: "REVIEW",
        id: reviewId,
        description: `Review for product`,
        metadata: { productId, rating },
      }
    );

    if (result) {
      results.push(result);
    }
  }

  return results;
}

// ============================================
// CUSTOMER QUERIES
// ============================================

/**
 * Get all of a customer's challenges with their progress
 */
export async function getCustomerActiveChallenges(
  shop: string,
  customerId: string
): Promise<CustomerChallengeInfo[]> {
  const now = new Date();

  // Get customer's current tier
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: { currentTierId: true },
  });

  // Get all active challenges for the shop (flat — no nested includes)
  const challenges = await db.challenge.findMany({
    where: {
      shop,
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gt: now },
      isPublic: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  const challengeIds = challenges.map((c: { id: string }) => c.id);

  // Fetch rewards and participants separately (Data API adapter compat)
  const [rewards, participants] = await Promise.all([
    challengeIds.length > 0
      ? db.challengeReward.findMany({ where: { challengeId: { in: challengeIds } } })
      : [],
    challengeIds.length > 0
      ? db.challengeParticipant.findMany({
          where: { challengeId: { in: challengeIds }, customerId },
        })
      : [],
  ]);

  // Build lookup maps
  const rewardMap = new Map(
    (rewards as Array<{ challengeId: string; rewardType: string; rewardValue: unknown; description: string }>).map(
      (r) => [r.challengeId, r]
    )
  );
  const participantMap = new Map(
    (participants as Array<{ challengeId: string; id: string; status: string; currentProgress: number; progressPercent: number; completedAt: Date | null; claimedAt: Date | null }>).map(
      (p) => [p.challengeId, p]
    )
  );

  // Filter by tier eligibility and map to response format
  const result: CustomerChallengeInfo[] = [];

  for (const challenge of challenges) {
    // Check tier eligibility
    if (challenge.tierRestrictions) {
      const restrictions = challenge.tierRestrictions as { allowedTierIds: string[] };
      if (
        restrictions.allowedTierIds?.length > 0 &&
        (!customer?.currentTierId ||
          !restrictions.allowedTierIds.includes(customer.currentTierId))
      ) {
        continue;
      }
    }

    const participant = participantMap.get(challenge.id);
    const reward = rewardMap.get(challenge.id);
    const rewardValue = reward?.rewardValue as Record<string, unknown> | undefined;

    result.push({
      id: participant?.id || `pending-${challenge.id}`,
      challengeId: challenge.id,
      name: challenge.name,
      description: challenge.description,
      imageUrl: challenge.imageUrl,
      objectiveType: challenge.objectiveType as ChallengeObjectiveType,
      targetValue: challenge.targetValue,
      currentProgress: participant?.currentProgress || 0,
      progressPercent: participant?.progressPercent || 0,
      status: (participant?.status || "IN_PROGRESS") as ChallengeParticipantStatus,
      reward: reward
        ? {
            type: reward.rewardType,
            value: (rewardValue?.amount || rewardValue?.value || 0) as number | string,
            description: reward.description,
          }
        : null,
      startsAt: challenge.startsAt.toISOString(),
      endsAt: challenge.endsAt.toISOString(),
      completedAt: participant?.completedAt?.toISOString() || null,
      claimedAt: participant?.claimedAt?.toISOString() || null,
    });
  }

  // Also get completed/claimed challenges that haven't expired yet
  // (separate queries — Data API adapter doesn't support relation filters or double-nested includes)
  const completedParticipants = await db.challengeParticipant.findMany({
    where: {
      customerId,
      shop,
      status: { in: ["COMPLETED", "CLAIMED"] },
    },
  });

  // Filter to only participants whose challenges haven't expired
  const completedChallengeIds = completedParticipants.map((p: { challengeId: string }) => p.challengeId);
  const [completedChallenges, completedRewards] = await Promise.all([
    completedChallengeIds.length > 0
      ? db.challenge.findMany({
          where: { id: { in: completedChallengeIds }, endsAt: { gt: now } },
        })
      : [],
    completedChallengeIds.length > 0
      ? db.challengeReward.findMany({
          where: { challengeId: { in: completedChallengeIds } },
        })
      : [],
  ]);

  const completedChallengeMap = new Map(
    (completedChallenges as Array<{ id: string; name: string; description: string | null; imageUrl: string | null; objectiveType: string; targetValue: number; startsAt: Date; endsAt: Date }>).map(
      (c) => [c.id, c]
    )
  );
  const completedRewardMap = new Map(
    (completedRewards as Array<{ challengeId: string; rewardType: string; rewardValue: unknown; description: string }>).map(
      (r) => [r.challengeId, r]
    )
  );

  for (const participant of completedParticipants) {
    // Skip if already included in active challenges
    if (result.some((r) => r.challengeId === participant.challengeId)) {
      continue;
    }

    // Skip if challenge has expired (not in our filtered set)
    const challenge = completedChallengeMap.get(participant.challengeId);
    if (!challenge) {
      continue;
    }

    const reward = completedRewardMap.get(participant.challengeId);
    const rewardValue = reward?.rewardValue as Record<string, unknown> | undefined;

    result.push({
      id: participant.id,
      challengeId: challenge.id,
      name: challenge.name,
      description: challenge.description,
      imageUrl: challenge.imageUrl,
      objectiveType: challenge.objectiveType as ChallengeObjectiveType,
      targetValue: challenge.targetValue,
      currentProgress: participant.currentProgress,
      progressPercent: participant.progressPercent,
      status: participant.status as ChallengeParticipantStatus,
      reward: reward
        ? {
            type: reward.rewardType,
            value: (rewardValue?.amount || rewardValue?.value || 0) as number | string,
            description: reward.description,
          }
        : null,
      startsAt: challenge.startsAt.toISOString(),
      endsAt: challenge.endsAt.toISOString(),
      completedAt: participant.completedAt?.toISOString() || null,
      claimedAt: participant.claimedAt?.toISOString() || null,
    });
  }

  return result;
}

/**
 * Get a customer's recently claimed challenges (for history)
 */
export async function getCustomerChallengeHistory(
  shop: string,
  customerId: string,
  limit: number = 20
): Promise<CustomerChallengeInfo[]> {
  // Flat query — no nested includes (Data API adapter compat)
  const participants = await db.challengeParticipant.findMany({
    where: {
      customerId,
      shop,
      status: "CLAIMED",
    },
    orderBy: { claimedAt: "desc" },
    take: limit,
  });

  // Fetch challenges and rewards separately
  const histChallengeIds = participants.map((p: { challengeId: string }) => p.challengeId);
  const [histChallenges, histRewards] = await Promise.all([
    histChallengeIds.length > 0
      ? db.challenge.findMany({ where: { id: { in: histChallengeIds } } })
      : [],
    histChallengeIds.length > 0
      ? db.challengeReward.findMany({ where: { challengeId: { in: histChallengeIds } } })
      : [],
  ]);

  const histChallengeMap = new Map(
    (histChallenges as Array<{ id: string; name: string; description: string | null; imageUrl: string | null; objectiveType: string; targetValue: number; startsAt: Date; endsAt: Date }>).map(
      (c) => [c.id, c]
    )
  );
  const histRewardMap = new Map(
    (histRewards as Array<{ challengeId: string; rewardType: string; rewardValue: unknown; description: string }>).map(
      (r) => [r.challengeId, r]
    )
  );

  return participants
    .filter((p: { challengeId: string }) => histChallengeMap.has(p.challengeId))
    .map((p: { id: string; challengeId: string; currentProgress: number; progressPercent: number; status: string; completedAt: Date | null; claimedAt: Date | null }) => {
      const challenge = histChallengeMap.get(p.challengeId)!;
      const reward = histRewardMap.get(p.challengeId);
      const rewardValue = reward?.rewardValue as Record<string, unknown> | undefined;

      return {
        id: p.id,
        challengeId: p.challengeId,
        name: challenge.name,
        description: challenge.description,
        imageUrl: challenge.imageUrl,
        objectiveType: challenge.objectiveType as ChallengeObjectiveType,
        targetValue: challenge.targetValue,
        currentProgress: p.currentProgress,
        progressPercent: p.progressPercent,
        status: p.status as ChallengeParticipantStatus,
        reward: reward
          ? {
              type: reward.rewardType,
              value: (rewardValue?.amount || rewardValue?.value || 0) as number | string,
              description: reward.description,
            }
          : null,
        startsAt: challenge.startsAt.toISOString(),
        endsAt: challenge.endsAt.toISOString(),
        completedAt: p.completedAt?.toISOString() || null,
        claimedAt: p.claimedAt?.toISOString() || null,
      };
    });
}

// ============================================
// MAINTENANCE
// ============================================

/**
 * Expire challenges that have passed their end date
 * (Called by cron job)
 */
export async function expireEndedChallenges(shop: string): Promise<number> {
  const now = new Date();

  // Get challenges that have ended but are still ACTIVE
  const endedChallenges = await db.challenge.findMany({
    where: {
      shop,
      status: "ACTIVE",
      endsAt: { lt: now },
    },
    select: { id: true },
  });

  if (endedChallenges.length === 0) {
    return 0;
  }

  const challengeIds = endedChallenges.map((c) => c.id);

  // Update challenge status
  await db.challenge.updateMany({
    where: { id: { in: challengeIds } },
    data: { status: "CLOSED" },
  });

  // Expire incomplete participants
  await db.challengeParticipant.updateMany({
    where: {
      challengeId: { in: challengeIds },
      status: "IN_PROGRESS",
    },
    data: { status: "EXPIRED" },
  });

  console.log(
    `${LOG_PREFIX} Expired ${endedChallenges.length} challenges for shop ${shop}`
  );

  return endedChallenges.length;
}

/**
 * Auto-activate scheduled challenges
 * (Called by cron job)
 */
export async function activateScheduledChallenges(shop: string): Promise<number> {
  const now = new Date();

  const result = await db.challenge.updateMany({
    where: {
      shop,
      status: "SCHEDULED",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    data: { status: "ACTIVE" },
  });

  if (result.count > 0) {
    console.log(
      `${LOG_PREFIX} Activated ${result.count} scheduled challenges for shop ${shop}`
    );
  }

  return result.count;
}
