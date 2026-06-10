/**
 * Challenge Management Service
 *
 * Handles CRUD operations for challenges and challenge rewards.
 * Challenges are goal-based engagement activities where customers
 * complete objectives (spending, orders, referrals) to earn rewards.
 */

import prisma from "../db.server";

const LOG_PREFIX = "[ChallengeManagement]";

// Type definitions (matching Prisma schema enums)
export type ChallengeStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "COMPLETED" | "CANCELLED";
export type ChallengeObjectiveType = "SPENDING" | "ORDER_COUNT" | "REFERRAL" | "PRODUCT_PURCHASE" | "REVIEW" | "STREAK";
export type ChallengeRewardType = "POINTS" | "STORE_CREDIT" | "DISCOUNT" | "TIER_UPGRADE" | "CUSTOM";
export type ChallengeParticipantStatus = "IN_PROGRESS" | "COMPLETED" | "CLAIMED" | "EXPIRED";

// ============================================
// TYPES
// ============================================

export interface ObjectiveConfig {
  // For SPENDING
  minOrderValue?: number;
  excludeDiscounted?: boolean;
  // For ORDER_COUNT
  // minOrderValue also applies
  // For REFERRAL
  requirePurchase?: boolean;
  minPurchaseValue?: number;
  // For PRODUCT_PURCHASE
  productIds?: string[];
  collectionIds?: string[];
  quantity?: number;
  // For REVIEW
  // productIds also applies
  minRating?: number;
  // For STREAK
  streakType?: "ORDER" | "LOGIN";
  periodDays?: number;
}

export interface RewardValue {
  // For POINTS
  amount?: number;
  // For STORE_CREDIT (in cents)
  // amount also applies
  // For DISCOUNT
  type?: "percentage" | "fixed";
  value?: number;
  maxUses?: number;
  minOrderValue?: number;
  // For TIER_UPGRADE
  tierId?: string;
  durationDays?: number; // null = permanent
  // For CUSTOM
  description?: string;
  fulfillmentInstructions?: string;
}

// Mission cadence types (matching Prisma enums)
export type MissionCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "SPECIAL";
export type MissionRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
export type MissionCategory = "SHOPPING" | "DISCOVERY" | "SOCIAL" | "STREAK" | "CHALLENGE";

export interface CreateChallengeInput {
  shop: string;
  name: string;
  description?: string;
  imageUrl?: string;
  startsAt: Date;
  endsAt: Date;
  objectiveType: ChallengeObjectiveType;
  targetValue: number;
  objectiveConfig?: ObjectiveConfig;
  tierRestrictions?: { allowedTierIds: string[] } | null;
  minimumTierId?: string;
  isPublic?: boolean;
  // Mission gamification fields
  cadence?: MissionCadence;
  rarity?: MissionRarity;
  category?: MissionCategory;
  xpReward?: number;
  iconEmoji?: string;
  templateId?: string;
  comboEligible?: boolean;
  streakEligible?: boolean;
}

export interface UpdateChallengeInput {
  name?: string;
  description?: string;
  imageUrl?: string;
  startsAt?: Date;
  endsAt?: Date;
  objectiveType?: ChallengeObjectiveType;
  targetValue?: number;
  objectiveConfig?: ObjectiveConfig;
  tierRestrictions?: { allowedTierIds: string[] } | null;
  minimumTierId?: string;
  isPublic?: boolean;
}

export interface CreateChallengeRewardInput {
  challengeId: string;
  rewardType: ChallengeRewardType;
  rewardValue: RewardValue;
  description: string;
}

export interface UpdateChallengeRewardInput {
  rewardType?: ChallengeRewardType;
  rewardValue?: RewardValue;
  description?: string;
}

export interface ChallengeWithDetails {
  id: string;
  shop: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: ChallengeStatus;
  startsAt: Date;
  endsAt: Date;
  objectiveType: ChallengeObjectiveType;
  targetValue: number;
  objectiveConfig: ObjectiveConfig | null;
  tierRestrictions: { allowedTierIds: string[] } | null;
  minimumTierId: string | null;
  isPublic: boolean;
  totalParticipants: number;
  completedCount: number;
  claimedCount: number;
  totalRewardsAwarded: number;
  createdAt: Date;
  updatedAt: Date;
  reward: {
    id: string;
    rewardType: ChallengeRewardType;
    rewardValue: RewardValue;
    description: string;
  } | null;
}

export interface ChallengeStats {
  totalChallenges: number;
  draftCount: number;
  scheduledCount: number;
  activeCount: number;
  completedCount: number;
  totalParticipants: number;
  totalCompletions: number;
  totalRewardsAwarded: number;
}

// ============================================
// CHALLENGE CRUD OPERATIONS
// ============================================

/**
 * Get all challenges for a shop with optional filters
 */
export async function getChallenges(
  shop: string,
  options?: {
    status?: ChallengeStatus | ChallengeStatus[];
    objectiveType?: ChallengeObjectiveType;
    includeReward?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<ChallengeWithDetails[]> {
  const where: Record<string, unknown> = { shop };

  if (options?.status) {
    where.status = Array.isArray(options.status)
      ? { in: options.status }
      : options.status;
  }

  if (options?.objectiveType) {
    where.objectiveType = options.objectiveType;
  }

  const challenges = await prisma.challenge.findMany({
    where,
    include: {
      reward: options?.includeReward ?? true,
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit,
    skip: options?.offset,
  });

  return challenges.map((c) => ({
    ...c,
    status: c.status as ChallengeStatus,
    objectiveType: c.objectiveType as ChallengeObjectiveType,
    objectiveConfig: c.objectiveConfig as ObjectiveConfig | null,
    tierRestrictions: c.tierRestrictions as { allowedTierIds: string[] } | null,
    reward: c.reward
      ? {
          ...c.reward,
          rewardType: c.reward.rewardType as ChallengeRewardType,
          rewardValue: c.reward.rewardValue as RewardValue,
        }
      : null,
  }));
}

/**
 * Get a single challenge by ID
 */
export async function getChallenge(
  challengeId: string,
  shop: string
): Promise<ChallengeWithDetails | null> {
  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, shop },
    include: { reward: true },
  });

  if (!challenge) return null;

  return {
    ...challenge,
    status: challenge.status as ChallengeStatus,
    objectiveType: challenge.objectiveType as ChallengeObjectiveType,
    objectiveConfig: challenge.objectiveConfig as ObjectiveConfig | null,
    tierRestrictions: challenge.tierRestrictions as { allowedTierIds: string[] } | null,
    reward: challenge.reward
      ? {
          ...challenge.reward,
          rewardType: challenge.reward.rewardType as ChallengeRewardType,
          rewardValue: challenge.reward.rewardValue as RewardValue,
        }
      : null,
  };
}

/**
 * Create a new challenge
 */
export async function createChallenge(
  input: CreateChallengeInput
): Promise<ChallengeWithDetails> {
  console.log(`${LOG_PREFIX} Creating challenge: ${input.name} for shop ${input.shop}`);
  console.log(`${LOG_PREFIX} Create input:`, {
    shop: input.shop,
    name: input.name,
    objectiveType: input.objectiveType,
    targetValue: input.targetValue,
    startsAt: input.startsAt?.toISOString(),
    endsAt: input.endsAt?.toISOString(),
    isPublic: input.isPublic,
    cadence: input.cadence,
    rarity: input.rarity,
    xpReward: input.xpReward,
  });

  try {
    const challenge = await prisma.challenge.create({
      data: {
        shop: input.shop,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        status: "DRAFT",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        objectiveType: input.objectiveType,
        targetValue: input.targetValue,
        objectiveConfig: input.objectiveConfig ?? undefined,
        tierRestrictions: input.tierRestrictions ?? undefined,
        minimumTierId: input.minimumTierId,
        isPublic: input.isPublic ?? true,
        // Mission gamification fields
        cadence: input.cadence ?? "SPECIAL",
        rarity: input.rarity ?? "COMMON",
        category: input.category ?? "CHALLENGE",
        xpReward: input.xpReward ?? 10,
        iconEmoji: input.iconEmoji ?? "🎯",
        templateId: input.templateId,
        comboEligible: input.comboEligible ?? true,
        streakEligible: input.streakEligible ?? true,
      },
      include: { reward: true },
    });

    console.log(`${LOG_PREFIX} Created challenge ${challenge.id}`);

    return {
      ...challenge,
      status: challenge.status as ChallengeStatus,
      objectiveType: challenge.objectiveType as ChallengeObjectiveType,
      objectiveConfig: challenge.objectiveConfig as ObjectiveConfig | null,
      tierRestrictions: challenge.tierRestrictions as { allowedTierIds: string[] } | null,
      reward: null,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating challenge:`, error);
    throw error;
  }
}

/**
 * Update a challenge
 */
export async function updateChallenge(
  challengeId: string,
  shop: string,
  input: UpdateChallengeInput
): Promise<ChallengeWithDetails> {
  console.log(`${LOG_PREFIX} Updating challenge ${challengeId}`);

  // Verify challenge exists and belongs to shop
  const existing = await prisma.challenge.findFirst({
    where: { id: challengeId, shop },
  });

  if (!existing) {
    throw new Error("Challenge not found");
  }

  // Only allow updates to DRAFT challenges (except certain fields)
  if (existing.status !== "DRAFT") {
    const allowedFields = ["description", "imageUrl", "isPublic"];
    const attemptedFields = Object.keys(input);
    const disallowedFields = attemptedFields.filter(
      (f) => !allowedFields.includes(f)
    );

    if (disallowedFields.length > 0) {
      throw new Error(
        `Cannot update ${disallowedFields.join(", ")} on non-DRAFT challenge`
      );
    }
  }

  const challenge = await prisma.challenge.update({
    where: { id: challengeId },
    data: {
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      objectiveType: input.objectiveType,
      targetValue: input.targetValue,
      objectiveConfig: input.objectiveConfig ?? undefined,
      tierRestrictions: input.tierRestrictions ?? undefined,
      minimumTierId: input.minimumTierId,
      isPublic: input.isPublic,
    },
    include: { reward: true },
  });

  return {
    ...challenge,
    status: challenge.status as ChallengeStatus,
    objectiveType: challenge.objectiveType as ChallengeObjectiveType,
    objectiveConfig: challenge.objectiveConfig as ObjectiveConfig | null,
    tierRestrictions: challenge.tierRestrictions as { allowedTierIds: string[] } | null,
    reward: challenge.reward
      ? {
          ...challenge.reward,
          rewardType: challenge.reward.rewardType as ChallengeRewardType,
          rewardValue: challenge.reward.rewardValue as RewardValue,
        }
      : null,
  };
}

/**
 * Delete a challenge (only DRAFT status)
 */
export async function deleteChallenge(
  challengeId: string,
  shop: string
): Promise<boolean> {
  console.log(`${LOG_PREFIX} Deleting challenge ${challengeId}`);

  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, shop },
  });

  if (!challenge) {
    throw new Error("Challenge not found");
  }

  if (challenge.status !== "DRAFT") {
    throw new Error("Can only delete DRAFT challenges");
  }

  await prisma.challenge.delete({
    where: { id: challengeId },
  });

  console.log(`${LOG_PREFIX} Deleted challenge ${challengeId}`);
  return true;
}

// ============================================
// CHALLENGE REWARD OPERATIONS
// ============================================

/**
 * Set or update a challenge's reward
 */
export async function setChallengeReward(
  challengeId: string,
  shop: string,
  rewardData: { rewardType: ChallengeRewardType; rewardValue: RewardValue; description: string }
): Promise<ChallengeWithDetails> {
  console.log(`${LOG_PREFIX} Setting reward for challenge ${challengeId} (shop: ${shop})`);

  // Verify challenge exists and belongs to shop
  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, shop },
    include: { reward: true },
  });

  if (!challenge) {
    throw new Error("Challenge not found");
  }

  // Upsert the reward
  if (challenge.reward) {
    await prisma.challengeReward.update({
      where: { id: challenge.reward.id },
      data: {
        rewardType: rewardData.rewardType,
        rewardValue: rewardData.rewardValue,
        description: rewardData.description,
      },
    });
  } else {
    await prisma.challengeReward.create({
      data: {
        challengeId: challengeId,
        rewardType: rewardData.rewardType,
        rewardValue: rewardData.rewardValue,
        description: rewardData.description,
      },
    });
  }

  // Return updated challenge
  const updated = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { reward: true },
  });

  return {
    ...updated!,
    status: updated!.status as ChallengeStatus,
    objectiveType: updated!.objectiveType as ChallengeObjectiveType,
    objectiveConfig: updated!.objectiveConfig as ObjectiveConfig | null,
    tierRestrictions: updated!.tierRestrictions as { allowedTierIds: string[] } | null,
    reward: updated!.reward
      ? {
          ...updated!.reward,
          rewardType: updated!.reward.rewardType as ChallengeRewardType,
          rewardValue: updated!.reward.rewardValue as RewardValue,
        }
      : null,
  };
}

// ============================================
// STATUS TRANSITIONS
// ============================================

const VALID_TRANSITIONS: Record<ChallengeStatus, ChallengeStatus[]> = {
  DRAFT: ["SCHEDULED", "ACTIVE", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["CLOSED", "CANCELLED"],
  CLOSED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

/**
 * Transition a challenge to a new status
 */
export async function transitionChallengeStatus(
  challengeId: string,
  shop: string,
  newStatus: ChallengeStatus
): Promise<ChallengeWithDetails> {
  console.log(`${LOG_PREFIX} Transitioning challenge ${challengeId} to ${newStatus}`);

  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, shop },
    include: { reward: true },
  });

  if (!challenge) {
    throw new Error("Challenge not found");
  }

  const currentStatus = challenge.status as ChallengeStatus;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus];

  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${currentStatus} -> ${newStatus}. Allowed: ${allowedTransitions.join(", ") || "none"}`
    );
  }

  // Validation before certain transitions
  if (newStatus === "ACTIVE" || newStatus === "SCHEDULED") {
    // Must have a reward configured
    if (!challenge.reward) {
      throw new Error("Challenge must have a reward configured before activation");
    }

    // Validate dates
    const now = new Date();
    if (newStatus === "ACTIVE" && challenge.endsAt <= now) {
      throw new Error("Cannot activate a challenge that has already ended");
    }
  }

  const updated = await prisma.challenge.update({
    where: { id: challengeId },
    data: { status: newStatus },
    include: { reward: true },
  });

  console.log(`${LOG_PREFIX} Challenge ${challengeId} transitioned to ${newStatus}`);

  return {
    ...updated,
    status: updated.status as ChallengeStatus,
    objectiveType: updated.objectiveType as ChallengeObjectiveType,
    objectiveConfig: updated.objectiveConfig as ObjectiveConfig | null,
    tierRestrictions: updated.tierRestrictions as { allowedTierIds: string[] } | null,
    reward: updated.reward
      ? {
          ...updated.reward,
          rewardType: updated.reward.rewardType as ChallengeRewardType,
          rewardValue: updated.reward.rewardValue as RewardValue,
        }
      : null,
  };
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get challenge statistics for a shop
 */
export async function getChallengeStats(shop: string): Promise<ChallengeStats> {
  const [counts, aggregates] = await Promise.all([
    prisma.challenge.groupBy({
      by: ["status"],
      where: { shop },
      _count: true,
    }),
    prisma.challenge.aggregate({
      where: { shop },
      _sum: {
        totalParticipants: true,
        completedCount: true,
        totalRewardsAwarded: true,
      },
    }),
  ]);

  const statusCounts = counts.reduce(
    (acc, c) => {
      acc[c.status as ChallengeStatus] = c._count;
      return acc;
    },
    {} as Record<ChallengeStatus, number>
  );

  return {
    totalChallenges: counts.reduce((sum, c) => sum + c._count, 0),
    draftCount: statusCounts.DRAFT || 0,
    scheduledCount: statusCounts.SCHEDULED || 0,
    activeCount: statusCounts.ACTIVE || 0,
    completedCount: statusCounts.COMPLETED || 0,
    totalParticipants: aggregates._sum.totalParticipants || 0,
    totalCompletions: aggregates._sum.completedCount || 0,
    totalRewardsAwarded: aggregates._sum.totalRewardsAwarded || 0,
  };
}

/**
 * Check if shop can create a new challenge based on plan limits
 */
export async function canCreateChallenge(
  shop: string
): Promise<{ allowed: boolean; current: number; limit: number; reason?: string }> {
  // Get shop entitlements
  const entitlements = await prisma.shopEntitlements.findUnique({
    where: { shop },
  });

  const limit = entitlements?.limitMaxActiveChallenges ?? 1;

  // Count active challenges (DRAFT, SCHEDULED, ACTIVE)
  const activeCount = await prisma.challenge.count({
    where: {
      shop,
      status: { in: ["DRAFT", "SCHEDULED", "ACTIVE"] },
    },
  });

  const allowed = activeCount < limit;

  return {
    allowed,
    current: activeCount,
    limit,
    reason: allowed
      ? undefined
      : `You have reached your limit of ${limit} active challenges. Upgrade your plan for more.`,
  };
}

/**
 * Get active challenges that a customer is eligible for
 */
export async function getActiveEligibleChallenges(
  shop: string,
  customerId: string,
  customerTierId?: string | null
): Promise<ChallengeWithDetails[]> {
  const now = new Date();

  // Get all active challenges for the shop
  const challenges = await prisma.challenge.findMany({
    where: {
      shop,
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gt: now },
      isPublic: true,
    },
    include: { reward: true },
  });

  // Filter by tier eligibility
  const eligible = challenges.filter((c) => {
    // Check tier restrictions
    if (c.tierRestrictions) {
      const restrictions = c.tierRestrictions as { allowedTierIds: string[] };
      if (restrictions.allowedTierIds?.length > 0) {
        if (!customerTierId || !restrictions.allowedTierIds.includes(customerTierId)) {
          return false;
        }
      }
    }

    // Check minimum tier requirement
    if (c.minimumTierId && (!customerTierId || customerTierId !== c.minimumTierId)) {
      // TODO: Add proper tier hierarchy comparison
      return false;
    }

    return true;
  });

  return eligible.map((c) => ({
    ...c,
    status: c.status as ChallengeStatus,
    objectiveType: c.objectiveType as ChallengeObjectiveType,
    objectiveConfig: c.objectiveConfig as ObjectiveConfig | null,
    tierRestrictions: c.tierRestrictions as { allowedTierIds: string[] } | null,
    reward: c.reward
      ? {
          ...c.reward,
          rewardType: c.reward.rewardType as ChallengeRewardType,
          rewardValue: c.reward.rewardValue as RewardValue,
        }
      : null,
  }));
}

// ════════════════════════════════════════════════════════════════════════
// JOIN / PARTICIPATION
//
// Moved out of `app/routes/api.proxy.$.tsx` (`challenges/join` handler)
// 2026-04-23. The proxy route is an HTTP adapter; eligibility rules,
// idempotent-join logic, and the participant+counter mutation are
// domain concerns that belong in the service layer.
//
// `joinChallenge` is idempotent:
//   - If the customer has already joined, it returns that participant
//     record unmodified (alreadyJoined=true). Safe to call multiple times.
//   - The participant create + challenge.totalParticipants increment run
//     in a single transaction so we never bump the counter for a
//     participant row that failed to create.
// ════════════════════════════════════════════════════════════════════════

export type JoinChallengeError =
  | "challenge_not_found"
  | "tier_not_allowed"
  | "customer_not_found";

export interface JoinChallengeResult {
  success: boolean;
  alreadyJoined?: boolean;
  participant?: {
    id: string;
    status: ChallengeParticipantStatus;
    currentProgress: number;
    progressPercent: number;
  };
  challenge?: {
    id: string;
    name: string;
    targetValue: number;
    objectiveType: ChallengeObjectiveType;
    reward: {
      type: ChallengeRewardType;
      description: string | null;
    } | null;
  };
  error?: JoinChallengeError;
  message?: string;
}

/**
 * Enroll a customer in a challenge.
 *
 * @param shop       Shopify domain (scope for all queries).
 * @param customerId Internal (Prisma) customer ID — NOT the Shopify GID.
 * @param challengeId Challenge to join.
 */
export async function joinChallenge(
  shop: string,
  customerId: string,
  challengeId: string
): Promise<JoinChallengeResult> {
  // 1. Resolve the customer's current tier for the eligibility check.
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shop },
    select: { id: true, currentTierId: true },
  });
  if (!customer) {
    return { success: false, error: "customer_not_found", message: "Customer not found" };
  }

  // 2. Load the challenge; must be live NOW and publicly joinable.
  const now = new Date();
  const challenge = await prisma.challenge.findFirst({
    where: {
      id: challengeId,
      shop,
      status: "ACTIVE",
      isPublic: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    include: { reward: true },
  });
  if (!challenge) {
    return {
      success: false,
      error: "challenge_not_found",
      message: "Challenge not found or not available",
    };
  }

  // 3. Tier gate. `tierRestrictions.allowedTierIds` empty/missing = open.
  if (challenge.tierRestrictions) {
    const restrictions = challenge.tierRestrictions as { allowedTierIds?: string[] };
    const allowed = restrictions.allowedTierIds ?? [];
    if (
      allowed.length > 0 &&
      (!customer.currentTierId || !allowed.includes(customer.currentTierId))
    ) {
      return {
        success: false,
        error: "tier_not_allowed",
        message: "This challenge is not available for your tier",
      };
    }
  }

  // 4. Idempotent join — if the customer is already enrolled, return their
  //    existing record without touching the counter.
  const existing = await prisma.challengeParticipant.findUnique({
    where: { challengeId_customerId: { challengeId, customerId: customer.id } },
  });
  if (existing) {
    return {
      success: true,
      alreadyJoined: true,
      participant: {
        id: existing.id,
        status: existing.status as ChallengeParticipantStatus,
        currentProgress: Number(existing.currentProgress),
        progressPercent: Number(existing.progressPercent),
      },
    };
  }

  // 5. Enroll. Participant insert + challenge counter increment in one
  //    transaction so a partial failure leaves neither side half-written.
  const { participant } = await prisma.$transaction(async (tx) => {
    const participant = await tx.challengeParticipant.create({
      data: {
        challengeId,
        customerId: customer.id,
        shop,
        currentProgress: 0,
        progressPercent: 0,
        status: "IN_PROGRESS",
      },
    });

    await tx.challenge.update({
      where: { id: challengeId },
      data: { totalParticipants: { increment: 1 } },
    });

    return { participant };
  });

  console.log(`${LOG_PREFIX} Customer ${customer.id} joined challenge ${challengeId}`);

  return {
    success: true,
    alreadyJoined: false,
    participant: {
      id: participant.id,
      status: participant.status as ChallengeParticipantStatus,
      currentProgress: Number(participant.currentProgress),
      progressPercent: Number(participant.progressPercent),
    },
    challenge: {
      id: challenge.id,
      name: challenge.name,
      targetValue: Number(challenge.targetValue),
      objectiveType: challenge.objectiveType as ChallengeObjectiveType,
      reward: challenge.reward
        ? {
            type: challenge.reward.rewardType as ChallengeRewardType,
            description: challenge.reward.description,
          }
        : null,
    },
  };
}
