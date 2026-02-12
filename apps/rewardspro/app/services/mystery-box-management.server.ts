/**
 * Mystery Box Management Service
 *
 * Handles CRUD operations for mystery boxes and rewards:
 * - Creating, updating, and deleting mystery boxes
 * - Managing rewards with probability configurations
 * - Status transitions and validation
 */

import db from "../db.server";
import type { MysteryBox, MysteryBoxReward } from "@prisma/client";

const LOG_PREFIX = "[MysteryBoxManagement]";

// ============================================
// TYPES
// ============================================

export type MysteryBoxStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "COMPLETED" | "CANCELLED";
export type MysteryBoxRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
export type MysteryBoxRewardType = "POINTS" | "DISCOUNT" | "STORE_CREDIT" | "PRODUCT" | "CUSTOM" | "NOTHING";

export interface CreateMysteryBoxInput {
  shop: string;
  name: string;
  description?: string;
  imageUrl?: string;
  startsAt: Date;
  endsAt: Date;
  openCost?: number;
  maxOpensTotal?: number | null;
  maxOpensPerCustomer?: number;
  isPublic?: boolean;
  tierRestrictions?: { allowedTierIds: string[] } | null;
  minimumTier?: string | null;
}

export interface UpdateMysteryBoxInput {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  openCost?: number;
  maxOpensTotal?: number | null;
  maxOpensPerCustomer?: number;
  isPublic?: boolean;
  tierRestrictions?: { allowedTierIds: string[] } | null;
  minimumTier?: string | null;
}

export interface CreateRewardInput {
  name: string;
  description?: string;
  imageUrl?: string;
  rewardType: MysteryBoxRewardType;
  rewardValue: Record<string, unknown>;
  probability: number; // 0.01 - 100.00
  rarity?: MysteryBoxRarity;
  quantity?: number | null;
  position?: number;
}

export interface UpdateRewardInput {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  rewardType?: MysteryBoxRewardType;
  rewardValue?: Record<string, unknown>;
  probability?: number;
  rarity?: MysteryBoxRarity;
  quantity?: number | null;
  position?: number;
}

export interface MysteryBoxWithRewards extends MysteryBox {
  rewards: MysteryBoxReward[];
  _count?: {
    opens: number;
    winners: number;
  };
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  opensRemaining?: number;
}

// ============================================
// BOX CRUD OPERATIONS
// ============================================

/**
 * Create a new mystery box
 */
export async function createMysteryBox(input: CreateMysteryBoxInput): Promise<MysteryBox> {
  console.log(`${LOG_PREFIX} createMysteryBox: ${input.name} for shop ${input.shop}`);

  const box = await db.mysteryBox.create({
    data: {
      shop: input.shop,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      openCost: input.openCost ?? 100,
      maxOpensTotal: input.maxOpensTotal,
      maxOpensPerCustomer: input.maxOpensPerCustomer ?? 5,
      isPublic: input.isPublic ?? true,
      tierRestrictions: input.tierRestrictions as any,
      minimumTier: input.minimumTier,
      status: "DRAFT",
    },
  });

  console.log(`${LOG_PREFIX} Created mystery box: ${box.id}`);
  return box;
}

/**
 * Update a mystery box
 */
export async function updateMysteryBox(
  id: string,
  shop: string,
  input: UpdateMysteryBoxInput
): Promise<MysteryBox> {
  console.log(`${LOG_PREFIX} updateMysteryBox: ${id}`);

  const box = await db.mysteryBox.findFirst({
    where: { id, shop },
  });

  if (!box) {
    throw new Error("Mystery box not found");
  }

  // Prevent updates to certain fields if box is active
  if (box.status === "ACTIVE" && (input.startsAt || input.openCost !== undefined)) {
    console.warn(`${LOG_PREFIX} Attempting to update restricted fields on active box`);
  }

  const updatedBox = await db.mysteryBox.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      openCost: input.openCost,
      maxOpensTotal: input.maxOpensTotal,
      maxOpensPerCustomer: input.maxOpensPerCustomer,
      isPublic: input.isPublic,
      tierRestrictions: input.tierRestrictions as any,
      minimumTier: input.minimumTier,
      updatedAt: new Date(),
    },
  });

  console.log(`${LOG_PREFIX} Updated mystery box: ${id}`);
  return updatedBox;
}

/**
 * Get a single mystery box with rewards
 */
export async function getMysteryBox(
  id: string,
  shop: string
): Promise<MysteryBoxWithRewards | null> {
  console.log(`${LOG_PREFIX} getMysteryBox: ${id}`);

  const box = await db.mysteryBox.findFirst({
    where: { id, shop },
  });

  if (!box) return null;

  // Separate rewards query — Data API adapter drops nested include
  const rewards = await db.mysteryBoxReward.findMany({
    where: { boxId: id },
    orderBy: { position: "asc" },
  });

  return { ...box, rewards } as MysteryBoxWithRewards;
}

/**
 * Get all mystery boxes for a shop
 */
export async function getMysteryBoxes(
  shop: string,
  options?: {
    status?: MysteryBoxStatus | MysteryBoxStatus[];
    includeRewards?: boolean;
    limit?: number;
  }
): Promise<MysteryBox[]> {
  console.log(`${LOG_PREFIX} getMysteryBoxes for shop: ${shop}`);

  const where: any = { shop };

  if (options?.status) {
    where.status = Array.isArray(options.status)
      ? { in: options.status }
      : options.status;
  }

  const boxes = await db.mysteryBox.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit,
  });

  // Separate rewards query — Data API adapter drops nested include
  if (options?.includeRewards && boxes.length > 0) {
    const boxIds = boxes.map((b) => b.id);
    const rewards = await db.mysteryBoxReward.findMany({
      where: { boxId: { in: boxIds } },
      orderBy: { position: "asc" },
    });

    const rewardsByBox = new Map<string, typeof rewards>();
    for (const r of rewards) {
      const list = rewardsByBox.get(r.boxId) || [];
      list.push(r);
      rewardsByBox.set(r.boxId, list);
    }

    for (const box of boxes) {
      (box as any).rewards = rewardsByBox.get(box.id) || [];
    }
  }

  return boxes;
}

/**
 * Delete a mystery box
 */
export async function deleteMysteryBox(id: string, shop: string): Promise<void> {
  console.log(`${LOG_PREFIX} deleteMysteryBox: ${id}`);

  const box = await db.mysteryBox.findFirst({
    where: { id, shop },
  });

  if (!box) {
    throw new Error("Mystery box not found");
  }

  // Prevent deletion of active boxes
  if (box.status === "ACTIVE") {
    throw new Error("Cannot delete an active mystery box. Close it first.");
  }

  // Cascade delete handles rewards, opens, and winners
  await db.mysteryBox.delete({
    where: { id },
  });

  console.log(`${LOG_PREFIX} Deleted mystery box: ${id}`);
}

// ============================================
// STATUS MANAGEMENT
// ============================================

/**
 * Valid status transitions
 */
const STATUS_TRANSITIONS: Record<MysteryBoxStatus, MysteryBoxStatus[]> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "DRAFT", "CANCELLED"],
  ACTIVE: ["CLOSED", "CANCELLED"],
  CLOSED: ["COMPLETED", "ACTIVE"], // Can reactivate if needed
  COMPLETED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

/**
 * Transition a mystery box to a new status
 */
export async function transitionStatus(
  id: string,
  shop: string,
  newStatus: MysteryBoxStatus
): Promise<MysteryBox> {
  console.log(`${LOG_PREFIX} transitionStatus: ${id} -> ${newStatus}`);

  const box = await db.mysteryBox.findFirst({
    where: { id, shop },
  });

  if (!box) {
    throw new Error("Mystery box not found");
  }

  const currentStatus = box.status as MysteryBoxStatus;
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus];

  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions.join(", ") || "none"}`
    );
  }

  // Validation for specific transitions
  if (newStatus === "SCHEDULED" || newStatus === "ACTIVE") {
    // Separate rewards query — Data API adapter drops nested include
    const rewards = await db.mysteryBoxReward.findMany({
      where: { boxId: id },
    });

    // Must have at least one reward
    if (rewards.length === 0) {
      throw new Error("Mystery box must have at least one reward before activation");
    }

    // Probabilities must sum to 100%
    const probabilityResult = validateProbabilities(rewards);
    if (!probabilityResult.valid) {
      throw new Error(`Invalid probabilities: ${probabilityResult.errors.join(", ")}`);
    }
  }

  const updatedBox = await db.mysteryBox.update({
    where: { id },
    data: {
      status: newStatus,
      updatedAt: new Date(),
    },
  });

  console.log(`${LOG_PREFIX} Transitioned box ${id} from ${currentStatus} to ${newStatus}`);
  return updatedBox;
}

// ============================================
// REWARD MANAGEMENT
// ============================================

/**
 * Add a reward to a mystery box
 */
export async function addReward(
  boxId: string,
  shop: string,
  input: CreateRewardInput
): Promise<MysteryBoxReward> {
  console.log(`${LOG_PREFIX} addReward to box: ${boxId}`);

  // Verify box exists and belongs to shop
  const box = await db.mysteryBox.findFirst({
    where: { id: boxId, shop },
  });

  if (!box) {
    throw new Error("Mystery box not found");
  }

  // Get max position for ordering
  const maxPositionReward = await db.mysteryBoxReward.findFirst({
    where: { boxId },
    orderBy: { position: "desc" },
  });
  const nextPosition = input.position ?? (maxPositionReward?.position ?? -1) + 1;

  const reward = await db.mysteryBoxReward.create({
    data: {
      boxId,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      rewardType: input.rewardType,
      rewardValue: input.rewardValue as any,
      probability: input.probability,
      rarity: input.rarity ?? "COMMON",
      quantity: input.quantity,
      position: nextPosition,
    },
  });

  console.log(`${LOG_PREFIX} Added reward: ${reward.id} to box ${boxId}`);
  return reward;
}

/**
 * Update a reward
 */
export async function updateReward(
  rewardId: string,
  shop: string,
  input: UpdateRewardInput
): Promise<MysteryBoxReward> {
  console.log(`${LOG_PREFIX} updateReward: ${rewardId}`);

  // Verify reward's box belongs to shop
  // NOTE: Flat queries — Data API adapter silently drops include: { box: true }
  const reward = await db.mysteryBoxReward.findFirst({
    where: { id: rewardId },
  });

  if (!reward) {
    console.error(`${LOG_PREFIX} updateReward FAILED: reward ${rewardId} not found`);
    throw new Error("Reward not found");
  }

  const box = await db.mysteryBox.findFirst({
    where: { id: reward.boxId, shop },
  });

  if (!box) {
    console.error(`${LOG_PREFIX} updateReward FAILED: box ${reward.boxId} not found for shop ${shop}`);
    throw new Error("Reward not found");
  }

  const updatedReward = await db.mysteryBoxReward.update({
    where: { id: rewardId },
    data: {
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      rewardType: input.rewardType,
      rewardValue: input.rewardValue as any,
      probability: input.probability,
      rarity: input.rarity,
      quantity: input.quantity,
      position: input.position,
      updatedAt: new Date(),
    },
  });

  console.log(`${LOG_PREFIX} Updated reward: ${rewardId}`);
  return updatedReward;
}

/**
 * Remove a reward from a mystery box
 */
export async function removeReward(rewardId: string, shop: string): Promise<void> {
  console.log(`${LOG_PREFIX} removeReward: ${rewardId}`);

  // Verify reward's box belongs to shop
  // NOTE: Flat queries — Data API adapter silently drops include: { box: true }
  const reward = await db.mysteryBoxReward.findFirst({
    where: { id: rewardId },
  });

  if (!reward) {
    console.error(`${LOG_PREFIX} removeReward FAILED: reward ${rewardId} not found in DB`);
    throw new Error("Reward not found");
  }

  const box = await db.mysteryBox.findFirst({
    where: { id: reward.boxId, shop },
  });

  if (!box) {
    console.error(`${LOG_PREFIX} removeReward FAILED: box ${reward.boxId} not found for shop ${shop}`);
    throw new Error("Reward not found");
  }

  // Check if box is active
  if (box.status === "ACTIVE") {
    console.warn(`${LOG_PREFIX} removeReward BLOCKED: box ${box.id} is ACTIVE`);
    throw new Error("Cannot remove rewards from an active mystery box");
  }

  await db.mysteryBoxReward.delete({
    where: { id: rewardId },
  });

  console.log(`${LOG_PREFIX} Removed reward: ${rewardId}`);
}

/**
 * Reorder rewards
 */
export async function reorderRewards(
  boxId: string,
  shop: string,
  rewardIds: string[]
): Promise<void> {
  console.log(`${LOG_PREFIX} reorderRewards for box: ${boxId}`);

  // Verify box belongs to shop
  const box = await db.mysteryBox.findFirst({
    where: { id: boxId, shop },
  });

  if (!box) {
    throw new Error("Mystery box not found");
  }

  // Update positions
  await Promise.all(
    rewardIds.map((rewardId, index) =>
      db.mysteryBoxReward.update({
        where: { id: rewardId },
        data: { position: index },
      })
    )
  );

  console.log(`${LOG_PREFIX} Reordered ${rewardIds.length} rewards`);
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate that reward probabilities sum to 100%
 */
export function validateProbabilities(rewards: MysteryBoxReward[] | undefined | null): {
  valid: boolean;
  total: number;
  errors: string[];
} {
  const errors: string[] = [];

  // Handle undefined/null rewards
  if (!rewards || rewards.length === 0) {
    return { valid: false, total: 0, errors: ["No rewards configured"] };
  }

  const total = rewards.reduce((sum, r) => sum + Number(r.probability), 0);

  // Allow small floating point variance (99.99 - 100.01)
  if (total < 99.99 || total > 100.01) {
    errors.push(`Probabilities sum to ${total.toFixed(2)}%, must equal 100%`);
  }

  // Check for invalid individual probabilities
  rewards.forEach((r) => {
    const prob = Number(r.probability);
    if (prob < 0 || prob > 100) {
      errors.push(`Reward "${r.name}" has invalid probability: ${prob}%`);
    }
  });

  return {
    valid: errors.length === 0,
    total,
    errors,
  };
}

/**
 * Check if a customer is eligible to open a mystery box
 */
export async function checkMysteryBoxEligibility(
  boxId: string,
  customerId: string,
  shop: string
): Promise<EligibilityResult> {
  console.log(`${LOG_PREFIX} checkMysteryBoxEligibility: box=${boxId}, customer=${customerId}`);

  const box = await db.mysteryBox.findFirst({
    where: { id: boxId, shop },
  });

  if (!box) {
    return { eligible: false, reason: "Mystery box not found" };
  }

  // Check status
  if (box.status !== "ACTIVE") {
    return { eligible: false, reason: "Mystery box is not active" };
  }

  // Check timing
  const now = new Date();
  if (now < box.startsAt) {
    return { eligible: false, reason: "Mystery box has not started yet" };
  }
  if (now > box.endsAt) {
    return { eligible: false, reason: "Mystery box has ended" };
  }

  // Check total opens limit
  if (box.maxOpensTotal !== null && box.totalOpens >= box.maxOpensTotal) {
    return { eligible: false, reason: "Mystery box has reached maximum opens" };
  }

  // Check customer's opens
  const customerOpens = await db.mysteryBoxOpen.count({
    where: { boxId, customerId },
  });

  if (customerOpens >= box.maxOpensPerCustomer) {
    return {
      eligible: false,
      reason: `You have reached the maximum of ${box.maxOpensPerCustomer} opens`,
      opensRemaining: 0,
    };
  }

  // Check tier restrictions
  if (box.tierRestrictions || box.minimumTier) {
    const { resolveEffectiveTier } = await import("./tier-resolution.server");
    const tierResult = await resolveEffectiveTier(shop, customerId);

    // Check allowedTierIds list
    if (box.tierRestrictions) {
      const restrictions = box.tierRestrictions as { allowedTierIds?: string[] };
      if (restrictions.allowedTierIds?.length) {
        if (!tierResult.effectiveTierId) {
          return { eligible: false, reason: "You need a membership tier to open this box" };
        }
        if (!restrictions.allowedTierIds.includes(tierResult.effectiveTierId)) {
          return { eligible: false, reason: "This mystery box is restricted to specific tiers" };
        }
      }
    }

    // Check minimumTier requirement
    if (box.minimumTier) {
      if (!tierResult.effectiveTierId) {
        const minimumTier = await db.tier.findUnique({ where: { id: box.minimumTier } });
        return {
          eligible: false,
          reason: `Requires ${minimumTier?.name || 'a membership'} tier or above`,
        };
      }

      if (tierResult.effectiveTierId !== box.minimumTier) {
        // Check tier hierarchy - compare minSpend values
        const [customerTier, minimumTier] = await Promise.all([
          db.tier.findUnique({ where: { id: tierResult.effectiveTierId } }),
          db.tier.findUnique({ where: { id: box.minimumTier } }),
        ]);

        if (!customerTier || !minimumTier || customerTier.minSpend < minimumTier.minSpend) {
          return {
            eligible: false,
            reason: `Requires ${minimumTier?.name || 'higher'} tier or above`,
          };
        }
      }
    }
  }

  return {
    eligible: true,
    opensRemaining: box.maxOpensPerCustomer - customerOpens,
  };
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get mystery box statistics for a shop
 */
export async function getMysteryBoxStats(shop: string): Promise<{
  totalBoxes: number;
  activeBoxes: number;
  totalOpens: number;
  totalPointsSpent: number;
}> {
  console.log(`${LOG_PREFIX} getMysteryBoxStats for shop: ${shop}`);

  const [totalBoxes, activeBoxes, aggregates] = await Promise.all([
    db.mysteryBox.count({ where: { shop } }),
    db.mysteryBox.count({ where: { shop, status: "ACTIVE" } }),
    db.mysteryBox.aggregate({
      where: { shop },
      _sum: {
        totalOpens: true,
        totalSpent: true,
      },
    }),
  ]);

  return {
    totalBoxes,
    activeBoxes,
    totalOpens: aggregates._sum.totalOpens || 0,
    totalPointsSpent: aggregates._sum.totalSpent || 0,
  };
}
