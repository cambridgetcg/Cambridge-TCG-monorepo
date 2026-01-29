/**
 * Mystery Box Opening Service
 *
 * Handles the core mystery box opening logic:
 * - Validating eligibility and points balance
 * - Probability-based reward selection
 * - Transaction processing (points spend + winner creation)
 * - Customer queries for available boxes and history
 */

import db from "../db.server";
import { spendPoints, earnPoints, getPointsBalance } from "./points-ledger.server";
import { checkMysteryBoxEligibility } from "./mystery-box-management.server";
import { trackMysteryBoxOpened, trackMysteryBoxWon, trackPointsSpent } from "./klaviyo-events.server";
import type { MysteryBoxReward, MysteryBoxOpen, MysteryBoxWinner } from "@prisma/client";

const LOG_PREFIX = "[MysteryBoxOpen]";

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
    // 1. Get the box with rewards
    const box = await db.mysteryBox.findFirst({
      where: { id: boxId, shop },
      include: {
        rewards: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!box) {
      return { success: false, error: "Mystery box not found" };
    }

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
    const existingOpens = await db.mysteryBoxOpen.count({
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
        (r) => r.quantity === null || r.quantityWon < r.quantity
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

    // 7. Process opening in transaction
    const isNewOpener = existingOpens === 0;

    // Create opening record
    const open = await db.mysteryBoxOpen.create({
      data: {
        boxId,
        customerId,
        shop,
        pointsSpent: box.openCost,
      },
    });

    // Spend points
    await spendPoints({
      shop,
      customerId,
      amount: box.openCost,
      type: "MYSTERY_BOX_OPEN",
      description: `Opened "${box.name}" mystery box`,
      mysteryBoxOpenId: open.id,
    });

    // Create winner record
    const winner = await db.mysteryBoxWinner.create({
      data: {
        boxId,
        openId: open.id,
        rewardId: reward.id,
        customerId,
        shop,
        deliveryStatus: "PENDING",
      },
    });

    // Update reward quantity won
    await db.mysteryBoxReward.update({
      where: { id: reward.id },
      data: {
        quantityWon: { increment: 1 },
      },
    });

    // Update box statistics
    await db.mysteryBox.update({
      where: { id: boxId },
      data: {
        totalOpens: { increment: 1 },
        uniqueOpeners: isNewOpener ? { increment: 1 } : undefined,
        totalSpent: { increment: box.openCost },
        updatedAt: new Date(),
      },
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
        const customer = await db.customer.findUnique({
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
    return available[Math.floor(Math.random() * available.length)];
  }

  // Generate random value scaled to available probability
  const random = Math.random() * totalProbability;

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
  const boxes = await db.mysteryBox.findMany({
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
  const customerOpens = await db.mysteryBoxOpen.findMany({
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

  const opens = await db.mysteryBoxOpen.findMany({
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

  const winners = await db.mysteryBoxWinner.findMany({
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
