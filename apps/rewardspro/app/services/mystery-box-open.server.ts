/**
 * Mystery Box Opening Service
 *
 * Handles the core mystery box opening logic:
 * - Validating eligibility and points balance
 * - Probability-based reward selection
 * - Transaction processing (points spend + winner creation)
 * - Customer queries for available boxes and history
 */

import * as crypto from "node:crypto";
import prisma from "../db.server";

/**
 * Cryptographically secure random number in [0, 1).
 * Replaces Math.random() for fair prize selection.
 */
function cryptoRandom(): number {
  return crypto.randomBytes(4).readUInt32BE(0) / 0x100000000;
}
import { spendPoints, earnPoints, getPointsBalance } from "./points-ledger.server";
import { checkMysteryBoxEligibility } from "./mystery-box-management.server";
import { trackMysteryBoxOpened, trackMysteryBoxWon, trackPointsSpent } from "./klaviyo-events.server";
import {
  processPsychologyOnOpen,
  calculateNearMiss,
  processFreeOpen,
  type PsychologyContext,
  type BoxOpenResult,
  type CelebrationEvent,
  type NearMissInfo,
  type PsychologyBonuses,
} from "./mystery-box-psychology.server";
import { getPityInfo, calculatePityMinimumRarity } from "./mystery-box-streak.server";
import { calculateDiscountedCost, getBestBonusEvent } from "./mystery-box-bonus-events.server";
import type { MysteryBoxReward, MysteryBoxOpen, MysteryBoxWinner, MysteryBoxRarity } from "@prisma/client";

const LOG_PREFIX = "[MysteryBoxOpen]";

// ════════════════════════════════════════════════════════════════════════
// SHARED TRANSACTION HELPER
//
// Before this refactor, `openMysteryBox` and `openMysteryBoxEnhanced` each
// carried a copy of the same critical-path transaction (atomic stock claim
// → open record → winner record → box stats → sentinel-error handling),
// differing only in which psychology columns they populated on the open
// row. Two copies is two places to keep the stock-lock invariant correct
// and two places to fix when the transaction body changes. Consolidated.
//
// The helper owns:
//   - The conditional `updateMany` stock claim (quantity limits, nullable = unlimited).
//   - Creation of the `mysteryBoxOpen` row with ANY psychology columns the
//     caller wants to record (all of them have nullable types or defaults,
//     so the basic caller omits them and schema defaults apply).
//   - The `mysteryBoxWinner` row.
//   - `mysteryBox` stats increment.
//   - Translation of the depletion sentinel into a customer-facing error.
//
// Point spend still runs OUTSIDE the transaction (deliberate: records
// first, points second — a post-commit `spendPoints` failure is a free
// open, which is reconcilable; the reverse would lose points with no
// prize).
// ════════════════════════════════════════════════════════════════════════

interface OpenTransactionInput {
  shop: string;
  boxId: string;
  customerId: string;
  /** The reward to award. `quantity === null` means unlimited stock. */
  reward: { id: string; quantity: number | null };
  /** Points to record on `pointsSpent` of the open row (0 for free opens). */
  pointsSpent: number;
  /** Whether this customer is opening this box for the first time. */
  isNewOpener: boolean;
  /** Stat increment — enhanced path uses `discountedCost`, basic uses `pointsSpent`. */
  boxTotalSpentDelta: number;

  // Optional psychology metadata. Fields the caller omits default to
  // the schema defaults (null / 0 / false).
  streakDay?: number | null;
  streakBonusApplied?: number | null;
  luckyStreakCount?: number;
  luckyStreakBonus?: number | null;
  bonusEventId?: string | null;
  discountApplied?: number;
  isFreeOpen?: boolean;
  pityTriggered?: boolean;
  nearMissRewardId?: string | null;
}

interface OpenTransactionResult {
  open: { id: string };
  winner: { id: string };
}

async function createOpenTransaction(
  input: OpenTransactionInput
): Promise<OpenTransactionResult> {
  let depleted = false;
  try {
    return await prisma.$transaction(async (tx) => {
      // Atomic stock claim — conditional updateMany serializes at the DB.
      // If another concurrent open took the last unit, count === 0 and we
      // abort by throwing; the rest of the transaction never runs.
      const gatedWhere =
        input.reward.quantity === null
          ? { id: input.reward.id }
          : { id: input.reward.id, quantityWon: { lt: input.reward.quantity } };
      const claim = await tx.mysteryBoxReward.updateMany({
        where: gatedWhere,
        data: { quantityWon: { increment: 1 } },
      });
      if (claim.count === 0) {
        depleted = true;
        throw new Error("MYSTERY_BOX_REWARD_DEPLETED");
      }

      const open = await tx.mysteryBoxOpen.create({
        data: {
          boxId: input.boxId,
          customerId: input.customerId,
          shop: input.shop,
          pointsSpent: input.pointsSpent,
          // Psychology columns — all optional in the schema. Undefined
          // lets Prisma apply the default; explicit null/value overrides.
          streakDay: input.streakDay,
          streakBonusApplied: input.streakBonusApplied,
          luckyStreakCount: input.luckyStreakCount,
          luckyStreakBonus: input.luckyStreakBonus,
          bonusEventId: input.bonusEventId,
          discountApplied: input.discountApplied,
          isFreeOpen: input.isFreeOpen,
          pityTriggered: input.pityTriggered,
          nearMissRewardId: input.nearMissRewardId,
        },
      });

      const winner = await tx.mysteryBoxWinner.create({
        data: {
          boxId: input.boxId,
          openId: open.id,
          rewardId: input.reward.id,
          customerId: input.customerId,
          shop: input.shop,
          deliveryStatus: "PENDING",
        },
      });

      await tx.mysteryBox.update({
        where: { id: input.boxId },
        data: {
          totalOpens: { increment: 1 },
          uniqueOpeners: input.isNewOpener ? { increment: 1 } : undefined,
          totalSpent: { increment: input.boxTotalSpentDelta },
          updatedAt: new Date(),
        },
      });

      return { open, winner };
    });
  } catch (err) {
    if (depleted) {
      // Translate the sentinel into a customer-facing message; identical
      // across both entry points now.
      throw new Error(
        "The selected reward was just claimed by another customer. Please try opening again."
      );
    }
    throw err;
  }
}

// ============================================
// TYPES
// ============================================

export interface OpenMysteryBoxInput {
  shop: string;
  customerId: string;
  boxId: string;
}

export interface OpenMysteryBoxResult {
  success: boolean;
  error?: string;
  openId?: string;
  winnerId?: string;
  rewardName?: string;
  rewardDescription?: string;
  rewardType?: string;
  rewardValue?: Record<string, unknown>;
  rarity?: string;
  pointsSpent?: number;
  newBalance?: number;
}

export interface CustomerBoxStatus {
  boxId: string;
  boxName: string;
  status: string;
  openCost: number;
  customerOpens: number;
  maxOpensPerCustomer: number;
  canOpen: boolean;
  reason?: string;
  startsAt: Date;
  endsAt: Date;
  totalOpens: number;
  uniqueOpeners: number;
  imageUrl: string | null;
  description: string | null;
}

export interface OpenHistoryEntry {
  openId: string;
  boxId: string;
  boxName: string;
  rewardName: string;
  rewardType: string;
  rarity: string;
  pointsSpent: number;
  openedAt: Date;
  deliveryStatus: string;
}

// Enhanced result with psychology data
export interface EnhancedOpenResult {
  success: boolean;
  error?: string;
  openId?: string;
  winnerId?: string;
  reward?: {
    id: string;
    name: string;
    type: string;
    rarity: string;
    value: Record<string, unknown>;
    actualValue?: number; // After bonuses applied
  };
  pointsSpent: number;
  originalCost: number;
  discountApplied: number;
  newBalance: number;
  bonuses: PsychologyBonuses;
  nearMiss: NearMissInfo | null;
  pityProgress: {
    current: number;
    threshold: number;
    message: string;
  };
  celebrations: CelebrationEvent[];
  isFreeOpen: boolean;
}

// ============================================
// CORE OPENING FUNCTION
// ============================================

/**
 * Open a mystery box for a customer
 *
 * Process:
 * 1. Validate box exists and is active
 * 2. Check customer eligibility and open limits
 * 3. Check customer has sufficient points
 * 4. Select reward based on probability
 * 5. Process transaction (spend points, create records)
 * 6. Return reward to customer
 */
export async function openMysteryBox(
  input: OpenMysteryBoxInput
): Promise<OpenMysteryBoxResult> {
  const { shop, customerId, boxId } = input;

  console.log(`${LOG_PREFIX} openMysteryBox: customer=${customerId}, box=${boxId}`);

  try {
    // 1. Get the box (flat query — Data API adapter silently ignores nested include)
    const box = await prisma.mysteryBox.findFirst({
      where: { id: boxId, shop },
    });

    if (!box) {
      return { success: false, error: "Mystery box not found" };
    }

    // Fetch rewards separately (Data API adapter compat — same pattern as proxy GET handler)
    const boxRewards = await prisma.mysteryBoxReward.findMany({
      where: { boxId },
      orderBy: { position: "asc" },
    });

    // Attach rewards to box for downstream code compatibility
    (box as any).rewards = boxRewards;

    // 2. Validate box is active and timing is correct
    if (box.status !== "ACTIVE") {
      return { success: false, error: "Mystery box is not accepting opens" };
    }

    const now = new Date();
    if (now < box.startsAt) {
      return { success: false, error: "Mystery box has not started yet" };
    }
    if (now > box.endsAt) {
      return { success: false, error: "Mystery box has ended" };
    }

    // 3. Check customer hasn't exceeded max opens
    const existingOpens = await prisma.mysteryBoxOpen.count({
      where: { boxId, customerId },
    });

    if (existingOpens >= box.maxOpensPerCustomer) {
      return {
        success: false,
        error: `You can only open this box ${box.maxOpensPerCustomer} times`,
      };
    }

    // Check total opens limit
    if (box.maxOpensTotal !== null && box.totalOpens >= box.maxOpensTotal) {
      return { success: false, error: "Mystery box has reached maximum opens" };
    }

    // 4. Check customer has sufficient points
    const balance = await getPointsBalance(shop, customerId);
    if (balance.available < box.openCost) {
      return {
        success: false,
        error: `Insufficient points. Need ${box.openCost}, have ${balance.available}`,
      };
    }

    // 5. Select reward based on probability
    const reward = selectRewardByProbability(box.rewards);

    if (!reward) {
      return { success: false, error: "No rewards available" };
    }

    // 6. Check if reward has quantity limit
    if (reward.quantity !== null && reward.quantityWon >= reward.quantity) {
      // This reward is depleted, try to select another
      const availableRewards = box.rewards.filter(
        (r: any) => r.quantity === null || r.quantityWon < r.quantity
      );

      if (availableRewards.length === 0) {
        return { success: false, error: "All rewards have been claimed" };
      }

      // Re-select from available rewards
      const alternateReward = selectRewardByProbability(availableRewards);
      if (!alternateReward) {
        return { success: false, error: "No rewards available" };
      }
      // Use the alternate reward
      Object.assign(reward, alternateReward);
    }

    // 7. Delegate to the shared transaction helper. Basic open = no
    // psychology / no pity / no bonus event, so we omit those fields and
    // schema defaults apply.
    const isNewOpener = existingOpens === 0;
    const { open, winner } = await createOpenTransaction({
      shop,
      boxId,
      customerId,
      reward: { id: reward.id, quantity: reward.quantity },
      pointsSpent: box.openCost,
      boxTotalSpentDelta: box.openCost,
      isNewOpener,
    });

    // Spend points (separate transaction — spendPoints manages its own)
    await spendPoints({
      shop,
      customerId,
      amount: box.openCost,
      type: "MYSTERY_BOX_OPEN",
      description: `Opened "${box.name}" mystery box`,
      mysteryBoxOpenId: open.id,
    });

    // 8. Get updated balance
    const newBalance = await getPointsBalance(shop, customerId);

    console.log(
      `${LOG_PREFIX} Successfully opened box for customer ${customerId}, won: ${reward.name} (${reward.rarity})`
    );

    // 9. Dispatch Klaviyo events for marketing automation
    // Run async without blocking the response
    (async () => {
      try {
        // Get customer with tier for event tracking
        const customer = await prisma.customer.findUnique({
          where: { id: customerId },
          include: { currentTier: true },
        });

        if (customer?.email) {
          // Track mystery box opened event
          await trackMysteryBoxOpened(
            shop,
            { ...customer, pointsBalance: newBalance.available },
            {
              id: box.id,
              name: box.name,
              openCost: box.openCost,
            },
            box.openCost
          );

          // Track mystery box prize won event
          await trackMysteryBoxWon(
            shop,
            { ...customer, pointsBalance: newBalance.available },
            {
              id: box.id,
              name: box.name,
            },
            {
              id: reward.id,
              name: reward.name,
              type: reward.rewardType,
              rarity: reward.rarity,
              value: (reward.rewardValue as Record<string, unknown>)?.amount as number,
              valueDescription: reward.description || undefined,
            }
          );

          // Track points spent event
          await trackPointsSpent(
            shop,
            { ...customer, pointsBalance: newBalance.available },
            box.openCost,
            "mystery_box",
            {
              mysteryBoxName: box.name,
              mysteryBoxId: box.id,
            }
          );
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Error dispatching Klaviyo events:`, error);
        // Don't throw - marketing events should not block the main flow
      }
    })();

    return {
      success: true,
      openId: open.id,
      winnerId: winner.id,
      rewardName: reward.name,
      rewardDescription: reward.description || undefined,
      rewardType: reward.rewardType,
      rewardValue: reward.rewardValue as Record<string, unknown>,
      rarity: reward.rarity,
      pointsSpent: box.openCost,
      newBalance: newBalance.available,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error opening box:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// PROBABILITY SELECTION
// ============================================

/**
 * Select a reward based on probability distribution
 *
 * Algorithm: Cumulative Distribution Function (CDF)
 * 1. Filter to available rewards (have stock or unlimited)
 * 2. Normalize probabilities to available rewards
 * 3. Generate random number and select via CDF
 */
export function selectRewardByProbability(
  rewards: MysteryBoxReward[]
): MysteryBoxReward | null {
  // Filter available rewards (have stock or unlimited)
  const available = rewards.filter(
    (r) => r.quantity === null || r.quantityWon < r.quantity
  );

  if (available.length === 0) {
    return null;
  }

  // Calculate total probability of available rewards
  const totalProbability = available.reduce(
    (sum, r) => sum + Number(r.probability),
    0
  );

  if (totalProbability <= 0) {
    // Fallback to uniform distribution
    return available[Math.floor(cryptoRandom() * available.length)];
  }

  // Generate random value scaled to available probability
  const random = cryptoRandom() * totalProbability;

  // CDF selection
  let cumulative = 0;
  for (const reward of available) {
    cumulative += Number(reward.probability);
    if (random <= cumulative) {
      return reward;
    }
  }

  // Fallback (shouldn't reach with proper probabilities)
  return available[available.length - 1];
}

// ============================================
// CUSTOMER QUERIES
// ============================================

/**
 * Get available mystery boxes for a customer
 */
export async function getCustomerAvailableBoxes(
  shop: string,
  customerId: string
): Promise<CustomerBoxStatus[]> {
  console.log(`${LOG_PREFIX} getCustomerAvailableBoxes: customer=${customerId}`);

  // Get all public, active/scheduled boxes
  const boxes = await prisma.mysteryBox.findMany({
    where: {
      shop,
      isPublic: true,
      status: { in: ["SCHEDULED", "ACTIVE"] },
    },
    orderBy: { startsAt: "asc" },
  });

  // Get customer's opens for these boxes
  // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
  // Instead, fetch boxId for each open and count in memory
  const boxIds = boxes.map((b) => b.id);
  const customerOpens = await prisma.mysteryBoxOpen.findMany({
    where: {
      customerId,
      boxId: { in: boxIds },
    },
    select: { boxId: true },
  });

  // Count opens per box in memory
  const opensMap = new Map<string, number>();
  for (const open of customerOpens) {
    opensMap.set(open.boxId, (opensMap.get(open.boxId) || 0) + 1);
  }

  // Build status for each box
  const results: CustomerBoxStatus[] = [];

  for (const box of boxes) {
    const customerOpens = opensMap.get(box.id) || 0;
    const eligibility = await checkMysteryBoxEligibility(box.id, customerId, shop);

    results.push({
      boxId: box.id,
      boxName: box.name,
      status: box.status,
      openCost: box.openCost,
      customerOpens,
      maxOpensPerCustomer: box.maxOpensPerCustomer,
      canOpen: eligibility.eligible,
      reason: eligibility.reason,
      startsAt: box.startsAt,
      endsAt: box.endsAt,
      totalOpens: box.totalOpens,
      uniqueOpeners: box.uniqueOpeners,
      imageUrl: box.imageUrl,
      description: box.description,
    });
  }

  return results;
}

/**
 * Get a customer's mystery box opening history
 */
export async function getCustomerOpenHistory(
  shop: string,
  customerId: string,
  options?: { limit?: number; boxId?: string }
): Promise<OpenHistoryEntry[]> {
  console.log(`${LOG_PREFIX} getCustomerOpenHistory: customer=${customerId}`);

  const where: any = { shop, customerId };
  if (options?.boxId) {
    where.boxId = options.boxId;
  }

  const opens = await prisma.mysteryBoxOpen.findMany({
    where,
    orderBy: { openedAt: "desc" },
    take: options?.limit || 20,
    include: {
      box: {
        select: { name: true },
      },
      winner: {
        include: {
          reward: {
            select: { name: true, rewardType: true, rarity: true },
          },
        },
      },
    },
  });

  return opens.map((open: any) => ({
    openId: open.id,
    boxId: open.boxId,
    boxName: open.box.name,
    rewardName: open.winner?.reward?.name || "Unknown",
    rewardType: open.winner?.reward?.rewardType || "UNKNOWN",
    rarity: open.winner?.reward?.rarity || "COMMON",
    pointsSpent: open.pointsSpent,
    openedAt: open.openedAt,
    deliveryStatus: open.winner?.deliveryStatus || "PENDING",
  }));
}

/**
 * Get recent winners for a mystery box (for display)
 */
export async function getRecentWinners(
  boxId: string,
  shop: string,
  limit: number = 10
): Promise<
  Array<{
    winnerId: string;
    customerEmail: string;
    rewardName: string;
    rarity: string;
    deliveryStatus: string;
    openedAt: Date;
  }>
> {
  console.log(`${LOG_PREFIX} getRecentWinners: box=${boxId}`);

  const winners = await prisma.mysteryBoxWinner.findMany({
    where: { boxId, shop },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      customer: {
        select: { email: true },
      },
      reward: {
        select: { name: true, rarity: true },
      },
      open: {
        select: { openedAt: true },
      },
    },
  });

  return winners.map((w: any) => ({
    winnerId: w.id,
    customerEmail: w.customer.email,
    rewardName: w.reward.name,
    rarity: w.reward.rarity,
    deliveryStatus: w.deliveryStatus,
    openedAt: w.open.openedAt,
  }));
}

// ============================================
// PSYCHOLOGY-ENHANCED OPENING
// ============================================

const RARITY_ORDER: MysteryBoxRarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];

/**
 * Select reward with pity system override
 * If pity is triggered, force selection of minimum rarity
 */
export function selectRewardWithPity(
  rewards: MysteryBoxReward[],
  minimumRarity: "COMMON" | "UNCOMMON" | "RARE"
): { reward: MysteryBoxReward | null; randomValue: number } {
  // Filter available rewards
  const available = rewards.filter(
    (r) => r.quantity === null || r.quantityWon < r.quantity
  );

  if (available.length === 0) {
    return { reward: null, randomValue: 0 };
  }

  // If pity triggered, filter to minimum rarity or above
  const minRarityIndex = RARITY_ORDER.indexOf(minimumRarity);
  const eligibleRewards =
    minimumRarity === "COMMON"
      ? available
      : available.filter(
          (r) => RARITY_ORDER.indexOf(r.rarity as MysteryBoxRarity) >= minRarityIndex
        );

  // If no eligible rewards after pity filter, fall back to all available
  const selectionPool = eligibleRewards.length > 0 ? eligibleRewards : available;

  // Calculate total probability
  const totalProbability = selectionPool.reduce(
    (sum, r) => sum + Number(r.probability),
    0
  );

  if (totalProbability <= 0) {
    const randomIndex = Math.floor(cryptoRandom() * selectionPool.length);
    return { reward: selectionPool[randomIndex], randomValue: cryptoRandom() };
  }

  // Generate random value
  const randomValue = cryptoRandom();
  const scaledRandom = randomValue * totalProbability;

  // CDF selection
  let cumulative = 0;
  for (const reward of selectionPool) {
    cumulative += Number(reward.probability);
    if (scaledRandom <= cumulative) {
      return { reward, randomValue };
    }
  }

  return { reward: selectionPool[selectionPool.length - 1], randomValue };
}

/**
 * Open a mystery box with psychology features
 *
 * Enhanced process:
 * 1. Check if this is a free open
 * 2. Apply bonus event discounts
 * 3. Check pity system for guaranteed rarity
 * 4. Select reward with pity override
 * 5. Calculate near-miss for psychology effect
 * 6. Process psychology (streaks, activity feed, celebrations)
 * 7. Apply bonus multipliers to reward value
 */
export async function openMysteryBoxEnhanced(input: {
  shop: string;
  customerId: string;
  boxId: string;
  isFreeOpen?: boolean;
}): Promise<EnhancedOpenResult> {
  const { shop, customerId, boxId, isFreeOpen = false } = input;

  console.log(
    `${LOG_PREFIX} openMysteryBoxEnhanced: customer=${customerId}, box=${boxId}, free=${isFreeOpen}`
  );

  try {
    // 1. Get the box with rewards and customer
    const [box, customer] = await Promise.all([
      prisma.mysteryBox.findFirst({
        where: { id: boxId, shop },
        include: {
          rewards: {
            orderBy: { position: "asc" },
          },
        },
      }),
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);

    if (!box) {
      return {
        success: false,
        error: "Mystery box not found",
        pointsSpent: 0,
        originalCost: 0,
        discountApplied: 0,
        newBalance: 0,
        bonuses: {
          streak: { applied: false, multiplier: 1, days: 0 },
          luckyStreak: { applied: false, multiplier: 1, count: 0 },
          event: null,
          totalMultiplier: 1,
        },
        nearMiss: null,
        pityProgress: { current: 0, threshold: 10, message: "" },
        celebrations: [],
        isFreeOpen,
      };
    }

    // 2. Validate box is active and timing is correct
    if (box.status !== "ACTIVE") {
      return {
        success: false,
        error: "Mystery box is not accepting opens",
        pointsSpent: 0,
        originalCost: box.openCost,
        discountApplied: 0,
        newBalance: 0,
        bonuses: {
          streak: { applied: false, multiplier: 1, days: 0 },
          luckyStreak: { applied: false, multiplier: 1, count: 0 },
          event: null,
          totalMultiplier: 1,
        },
        nearMiss: null,
        pityProgress: { current: 0, threshold: box.pityThreshold, message: "" },
        celebrations: [],
        isFreeOpen,
      };
    }

    const now = new Date();
    if (now < box.startsAt || now > box.endsAt) {
      return {
        success: false,
        error: now < box.startsAt ? "Mystery box has not started yet" : "Mystery box has ended",
        pointsSpent: 0,
        originalCost: box.openCost,
        discountApplied: 0,
        newBalance: 0,
        bonuses: {
          streak: { applied: false, multiplier: 1, days: 0 },
          luckyStreak: { applied: false, multiplier: 1, count: 0 },
          event: null,
          totalMultiplier: 1,
        },
        nearMiss: null,
        pityProgress: { current: 0, threshold: box.pityThreshold, message: "" },
        celebrations: [],
        isFreeOpen,
      };
    }

    // 3. Check customer hasn't exceeded max opens
    const existingOpens = await prisma.mysteryBoxOpen.count({
      where: { boxId, customerId },
    });

    if (existingOpens >= box.maxOpensPerCustomer) {
      return {
        success: false,
        error: `You can only open this box ${box.maxOpensPerCustomer} times`,
        pointsSpent: 0,
        originalCost: box.openCost,
        discountApplied: 0,
        newBalance: 0,
        bonuses: {
          streak: { applied: false, multiplier: 1, days: 0 },
          luckyStreak: { applied: false, multiplier: 1, count: 0 },
          event: null,
          totalMultiplier: 1,
        },
        nearMiss: null,
        pityProgress: { current: 0, threshold: box.pityThreshold, message: "" },
        celebrations: [],
        isFreeOpen,
      };
    }

    // 4. Get bonus event and calculate cost
    const bonusResult = await getBestBonusEvent({ shop, boxId, customerId });
    const discountedCost = isFreeOpen
      ? 0
      : calculateDiscountedCost(box.openCost, bonusResult.discountPercent);

    // 5. Check customer has sufficient points (unless free open)
    const balance = await getPointsBalance(shop, customerId);
    if (!isFreeOpen && balance.available < discountedCost) {
      return {
        success: false,
        error: `Insufficient points. Need ${discountedCost}, have ${balance.available}`,
        pointsSpent: 0,
        originalCost: box.openCost,
        discountApplied: box.openCost - discountedCost,
        newBalance: balance.available,
        bonuses: {
          streak: { applied: false, multiplier: 1, days: 0 },
          luckyStreak: { applied: false, multiplier: 1, count: 0 },
          event: bonusResult.event
            ? {
                applied: true,
                name: bonusResult.event.name,
                discount: bonusResult.discountPercent,
                multiplier: bonusResult.bonusMultiplier,
              }
            : null,
          totalMultiplier: 1,
        },
        nearMiss: null,
        pityProgress: { current: 0, threshold: box.pityThreshold, message: "" },
        celebrations: [],
        isFreeOpen,
      };
    }

    // 6. Check pity system
    const pityInfo = await getPityInfo(customerId, box.pityThreshold);
    const minimumRarity = box.enablePitySystem
      ? calculatePityMinimumRarity(pityInfo.commonsSinceRare, box.pityThreshold)
      : "COMMON";
    const pityTriggered = box.enablePitySystem && pityInfo.willTrigger;

    // 7. Select reward with pity override
    const { reward, randomValue } = selectRewardWithPity(box.rewards, minimumRarity);

    if (!reward) {
      return {
        success: false,
        error: "No rewards available",
        pointsSpent: 0,
        originalCost: box.openCost,
        discountApplied: 0,
        newBalance: balance.available,
        bonuses: {
          streak: { applied: false, multiplier: 1, days: 0 },
          luckyStreak: { applied: false, multiplier: 1, count: 0 },
          event: null,
          totalMultiplier: 1,
        },
        nearMiss: null,
        pityProgress: { current: pityInfo.commonsSinceRare, threshold: box.pityThreshold, message: "" },
        celebrations: [],
        isFreeOpen,
      };
    }

    // 8. Calculate near-miss
    const nearMiss = calculateNearMiss(
      reward.rarity as MysteryBoxRarity,
      box.rewards.map((r: any) => ({
        id: r.id,
        name: r.name,
        rarity: r.rarity as MysteryBoxRarity,
        probability: Number(r.probability),
      })),
      randomValue
    );

    // 9. Build psychology context
    const psychologyContext: PsychologyContext = {
      shop,
      customerId,
      boxId,
      boxName: box.name,
      firstName: customer?.firstName || null,
      lastName: customer?.lastName || null,
      originalCost: box.openCost,
      dailyFreeOpens: box.dailyFreeOpens,
      pityThreshold: box.pityThreshold,
      enableStreakBonuses: box.enableStreakBonuses,
      enablePitySystem: box.enablePitySystem,
      enableLuckyStreak: box.enableLuckyStreak,
      enableActivityFeed: box.enableActivityFeed,
    };

    // 10. Process psychology (updates streaks, logs activity, gets celebrations)
    const psychologyResult = await processPsychologyOnOpen(
      psychologyContext,
      reward.rarity as MysteryBoxRarity,
      reward.name
    );

    // 11. Delegate to the shared transaction helper with ALL psychology
    // metadata populated for the enhanced path.
    const isNewOpener = existingOpens === 0;
    const { open, winner } = await createOpenTransaction({
      shop,
      boxId,
      customerId,
      reward: { id: reward.id, quantity: reward.quantity },
      pointsSpent: discountedCost,
      boxTotalSpentDelta: discountedCost,
      isNewOpener,
      streakDay: psychologyResult.streakInfo.currentStreak,
      streakBonusApplied: psychologyResult.bonuses.streak.applied
        ? psychologyResult.bonuses.streak.multiplier
        : null,
      luckyStreakCount: psychologyResult.bonuses.luckyStreak.count,
      luckyStreakBonus: psychologyResult.bonuses.luckyStreak.applied
        ? psychologyResult.bonuses.luckyStreak.multiplier
        : null,
      bonusEventId: psychologyResult.bonusEventId,
      discountApplied: box.openCost - discountedCost,
      isFreeOpen,
      pityTriggered,
      nearMissRewardId: nearMiss?.rewardId || null,
    });

    // 12. Spend points (separate transaction — spendPoints manages its own)
    if (!isFreeOpen && discountedCost > 0) {
      await spendPoints({
        shop,
        customerId,
        amount: discountedCost,
        type: "MYSTERY_BOX_OPEN",
        description: `Opened "${box.name}" mystery box`,
        mysteryBoxOpenId: open.id,
      });
    }

    // 16. Get updated balance
    const newBalance = await getPointsBalance(shop, customerId);

    console.log(
      `${LOG_PREFIX} Successfully opened box for customer ${customerId}, won: ${reward.name} (${reward.rarity}), pity=${pityTriggered}`
    );

    // 17. Calculate actual reward value after bonuses
    const rewardValue = reward.rewardValue as Record<string, unknown>;
    const baseValue = (rewardValue?.amount as number) || 0;
    const actualValue = Math.round(baseValue * psychologyResult.bonuses.totalMultiplier);

    // 18. Dispatch Klaviyo events (async, non-blocking)
    (async () => {
      try {
        if (customer?.email) {
          const customerWithBalance = { ...customer, pointsBalance: newBalance.available };
          await trackMysteryBoxOpened(
            shop,
            customerWithBalance as any,
            { id: box.id, name: box.name, openCost: discountedCost },
            discountedCost
          );
          await trackMysteryBoxWon(
            shop,
            customerWithBalance as any,
            { id: box.id, name: box.name },
            {
              id: reward.id,
              name: reward.name,
              type: reward.rewardType,
              rarity: reward.rarity,
              value: actualValue,
              valueDescription: reward.description || undefined,
            }
          );
          if (!isFreeOpen) {
            await trackPointsSpent(
              shop,
              customerWithBalance as any,
              discountedCost,
              "mystery_box",
              { mysteryBoxName: box.name, mysteryBoxId: box.id }
            );
          }
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Error dispatching Klaviyo events:`, error);
      }
    })();

    return {
      success: true,
      openId: open.id,
      winnerId: winner.id,
      reward: {
        id: reward.id,
        name: reward.name,
        type: reward.rewardType,
        rarity: reward.rarity,
        value: rewardValue,
        actualValue,
      },
      pointsSpent: discountedCost,
      originalCost: box.openCost,
      discountApplied: box.openCost - discountedCost,
      newBalance: newBalance.available,
      bonuses: psychologyResult.bonuses,
      nearMiss,
      pityProgress: psychologyResult.pityProgress,
      celebrations: psychologyResult.celebrations,
      isFreeOpen,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in enhanced open:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      pointsSpent: 0,
      originalCost: 0,
      discountApplied: 0,
      newBalance: 0,
      bonuses: {
        streak: { applied: false, multiplier: 1, days: 0 },
        luckyStreak: { applied: false, multiplier: 1, count: 0 },
        event: null,
        totalMultiplier: 1,
      },
      nearMiss: null,
      pityProgress: { current: 0, threshold: 10, message: "" },
      celebrations: [],
      isFreeOpen: false,
    };
  }
}
