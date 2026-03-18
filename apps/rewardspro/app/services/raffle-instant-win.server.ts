/**
 * Raffle Instant Win Service
 *
 * Implements variable reward schedule for dopamine release.
 * During entry purchase, customers have a chance to win instant micro-prizes.
 *
 * Probability Tiers:
 * - COMMON (15%): Small points reward (10-25 points)
 * - UNCOMMON (5%): Medium points reward (50-100 points)
 * - RARE (1%): Store credit ($1-$5)
 * - EPIC (0.1%): Discount code (15-25% off)
 * - LEGENDARY (0.01%): Major discount (50% off)
 *
 * Key Psychology:
 * - Variable ratio reinforcement (unpredictable rewards)
 * - Immediate feedback (instant gratification)
 * - Near-miss effect (showing "almost won" increases engagement)
 */

import db from "../db.server";
import type { RafflePrizeType, Prisma } from "@prisma/client";

const LOG_PREFIX = "[RaffleInstantWin]";

// ============================================
// TYPES
// ============================================

export interface InstantWinPrize {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  prizeType: RafflePrizeType;
  prizeValue: Record<string, unknown>;
  rarity: string;
  winChancePercent: number;
}

export interface InstantWinResult {
  won: boolean;
  prize: InstantWinPrize | null;
  nearMiss: InstantWinPrize | null; // For "almost won" effect
  message: string;
}

export interface InstantWinLogEntry {
  id: string;
  prizeName: string;
  prizeType: RafflePrizeType;
  rarity: string;
  delivered: boolean;
  createdAt: Date;
}

// Rarity configuration
const RARITY_CONFIG: Record<string, { color: string; glow: string }> = {
  COMMON: { color: "#9CA3AF", glow: "none" },
  UNCOMMON: { color: "#10B981", glow: "0 0 10px #10B981" },
  RARE: { color: "#3B82F6", glow: "0 0 15px #3B82F6" },
  EPIC: { color: "#8B5CF6", glow: "0 0 20px #8B5CF6" },
  LEGENDARY: { color: "#F59E0B", glow: "0 0 25px #F59E0B" },
};

// ============================================
// PROBABILITY FUNCTIONS
// ============================================

/**
 * Roll for instant win based on prize probability
 */
function rollForWin(winChancePercent: number): boolean {
  const roll = Math.random();
  return roll < winChancePercent;
}

/**
 * Check if customer has hit win limits
 */
async function hasReachedWinLimit(
  instantWinId: string,
  customerId: string,
  maxWinsPerCustomer: number
): Promise<boolean> {
  const winCount = await db.raffleInstantWinLog.count({
    where: {
      instantWinId,
      customerId,
    },
  });

  return winCount >= maxWinsPerCustomer;
}

/**
 * Check if prize has reached total win limit
 */
async function hasReachedTotalLimit(
  instantWinId: string,
  maxWinsTotal: number | null
): Promise<boolean> {
  if (maxWinsTotal === null) return false;

  const prize = await db.raffleInstantWin.findUnique({
    where: { id: instantWinId },
    select: { currentWinsTotal: true },
  });

  return prize ? prize.currentWinsTotal >= maxWinsTotal : true;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get active instant win prizes for a raffle
 */
export async function getActiveInstantWins(
  raffleId: string,
  shop: string
): Promise<InstantWinPrize[]> {
  const now = new Date();

  const prizes = await db.raffleInstantWin.findMany({
    where: {
      raffleId,
      shop,
      isActive: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: now } },
          ],
        },
      ],
    },
    orderBy: [
      { rarity: "desc" }, // Show rarer prizes first
      { winChancePercent: "asc" },
    ] as any,
  });

  return prizes.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    prizeType: p.prizeType,
    prizeValue: p.prizeValue as Record<string, unknown>,
    rarity: p.rarity,
    winChancePercent: Number(p.winChancePercent),
  }));
}

/**
 * Process instant win roll for a raffle entry
 * Returns won prizes and near-miss for psychology effect
 */
export async function processInstantWin(
  raffleId: string,
  shop: string,
  customerId: string,
  raffleEntryId: string
): Promise<InstantWinResult[]> {
  const prizes = await getActiveInstantWins(raffleId, shop);
  const results: InstantWinResult[] = [];

  if (prizes.length === 0) {
    return results;
  }

  // Sort by rarity (highest first) - gives players chance at best prizes first
  const sortedPrizes = [...prizes].sort((a, b) => {
    const rarityOrder = ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"];
    return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
  });

  let wonPrize: InstantWinPrize | null = null;
  let nearMiss: InstantWinPrize | null = null;

  for (const prize of sortedPrizes) {
    // Check limits
    const customerLimitReached = await hasReachedWinLimit(
      prize.id,
      customerId,
      await getMaxWinsPerCustomer(prize.id)
    );

    if (customerLimitReached) continue;

    const totalLimitReached = await hasReachedTotalLimit(
      prize.id,
      await getMaxWinsTotal(prize.id)
    );

    if (totalLimitReached) continue;

    // Roll for win
    const won = rollForWin(prize.winChancePercent);

    if (won) {
      wonPrize = prize;
      break;
    } else if (!nearMiss && prize.rarity !== "COMMON") {
      // Track near-miss for rarer prizes (psychology effect)
      nearMiss = prize;
    }
  }

  if (wonPrize) {
    // Record the win
    await recordInstantWin(wonPrize.id, customerId, raffleEntryId, shop);

    results.push({
      won: true,
      prize: wonPrize,
      nearMiss: null,
      message: `You won: ${wonPrize.name}!`,
    });

    console.log(
      `${LOG_PREFIX} Customer ${customerId} won instant prize: ${wonPrize.name} (${wonPrize.rarity})`
    );
  } else if (nearMiss) {
    // Show near-miss effect (increases engagement)
    results.push({
      won: false,
      prize: null,
      nearMiss,
      message: `So close! You almost won: ${nearMiss.name}`,
    });
  }

  return results;
}

/**
 * Record instant win in database
 */
async function recordInstantWin(
  instantWinId: string,
  customerId: string,
  raffleEntryId: string,
  shop: string
): Promise<string> {
  // Create win log
  const log = await db.raffleInstantWinLog.create({
    data: {
      instantWinId,
      customerId,
      raffleEntryId,
      shop,
      delivered: false,
    },
  });

  // Increment win counter
  await db.raffleInstantWin.update({
    where: { id: instantWinId },
    data: {
      currentWinsTotal: { increment: 1 },
    },
  });

  // Update entry's instant win count
  await db.raffleEntry.update({
    where: { id: raffleEntryId },
    data: {
      instantWinsTriggered: { increment: 1 },
    },
  });

  return log.id;
}

/**
 * Get max wins per customer for a prize
 */
async function getMaxWinsPerCustomer(instantWinId: string): Promise<number> {
  const prize = await db.raffleInstantWin.findUnique({
    where: { id: instantWinId },
    select: { maxWinsPerCustomer: true },
  });
  return prize?.maxWinsPerCustomer ?? 1;
}

/**
 * Get max total wins for a prize
 */
async function getMaxWinsTotal(instantWinId: string): Promise<number | null> {
  const prize = await db.raffleInstantWin.findUnique({
    where: { id: instantWinId },
    select: { maxWinsTotal: true },
  });
  return prize?.maxWinsTotal ?? null;
}

/**
 * Deliver instant win prize to customer
 */
export async function deliverInstantWinPrize(
  instantWinLogId: string
): Promise<{
  success: boolean;
  deliveryData: Record<string, unknown> | null;
  message: string;
}> {
  const log = await db.raffleInstantWinLog.findUnique({
    where: { id: instantWinLogId },
    include: {
      instantWin: true,
      customer: true,
    },
  });

  if (!log) {
    return { success: false, deliveryData: null, message: "Win log not found" };
  }

  if (log.delivered) {
    return { success: false, deliveryData: log.deliveryData as Record<string, unknown>, message: "Already delivered" };
  }

  const prize = log.instantWin;
  const prizeValue = prize.prizeValue as Record<string, unknown>;
  let deliveryData: Record<string, unknown> = {};

  try {
    switch (prize.prizeType) {
      case "POINTS": {
        // Award points to customer
        const points = (prizeValue.amount as number) || 0;
        await db.pointsLedger.create({
          data: {
            shop: log.shop,
            customerId: log.customerId,
            points,
            balance: 0, // Will be calculated
            source: "INSTANT_WIN",
            description: `Instant win: ${prize.name}`,
            expiresAt: null,
          },
        });

        // Update customer balance
        await db.customer.update({
          where: { id: log.customerId },
          data: {
            pointsBalance: { increment: points },
            lifetimePoints: { increment: points },
          },
        });

        deliveryData = { points, type: "POINTS" };
        console.log(`${LOG_PREFIX} Delivered ${points} points to customer ${log.customerId}`);
        break;
      }

      case "STORE_CREDIT": {
        // Award store credit
        const amount = (prizeValue.amount as number) || 0;
        await db.storeCreditLedger.create({
          data: {
            shop: log.shop,
            customerId: log.customerId,
            amount,
            balance: 0, // Will be calculated
            type: "EARNED",
            description: `Instant win: ${prize.name}`,
          },
        });

        // Update customer balance
        await db.customer.update({
          where: { id: log.customerId },
          data: {
            storeCredit: { increment: amount },
          },
        });

        deliveryData = { amount, type: "STORE_CREDIT" };
        console.log(`${LOG_PREFIX} Delivered $${amount / 100} store credit to customer ${log.customerId}`);
        break;
      }

      case "DISCOUNT": {
        // Generate discount code
        const discountCode = generateDiscountCode(prize.name);
        deliveryData = {
          discountCode,
          type: "DISCOUNT",
          value: prizeValue.value,
          discountType: prizeValue.type,
        };
        console.log(`${LOG_PREFIX} Generated discount code ${discountCode} for customer ${log.customerId}`);
        break;
      }

      default:
        // For PRODUCT and CUSTOM, just mark as pending manual delivery
        deliveryData = { type: prize.prizeType, manualDeliveryRequired: true };
    }

    // Mark as delivered
    await db.raffleInstantWinLog.update({
      where: { id: instantWinLogId },
      data: {
        delivered: true,
        deliveredAt: new Date(),
        deliveryData,
      },
    });

    return {
      success: true,
      deliveryData,
      message: `Prize delivered: ${prize.name}`,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to deliver prize:`, error);
    return {
      success: false,
      deliveryData: null,
      message: error instanceof Error ? error.message : "Delivery failed",
    };
  }
}

/**
 * Generate a unique discount code
 */
function generateDiscountCode(prizeName: string): string {
  const prefix = prizeName.replace(/[^A-Z]/gi, "").slice(0, 4).toUpperCase() || "WIN";
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}

/**
 * Get customer's instant win history
 */
export async function getCustomerInstantWinHistory(
  shop: string,
  customerId: string,
  limit: number = 10
): Promise<InstantWinLogEntry[]> {
  const logs = await db.raffleInstantWinLog.findMany({
    where: { shop, customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      instantWin: {
        select: {
          name: true,
          prizeType: true,
          rarity: true,
        },
      },
    },
  });

  return logs.map((log) => ({
    id: log.id,
    prizeName: log.instantWin.name,
    prizeType: log.instantWin.prizeType,
    rarity: log.instantWin.rarity,
    delivered: log.delivered,
    createdAt: log.createdAt,
  }));
}

/**
 * Get rarity display configuration
 */
export function getRarityConfig(rarity: string): { color: string; glow: string } {
  return RARITY_CONFIG[rarity] || RARITY_CONFIG.COMMON;
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Create instant win prize for a raffle
 */
export async function createInstantWin(
  raffleId: string,
  shop: string,
  data: {
    name: string;
    description?: string;
    imageUrl?: string;
    prizeType: RafflePrizeType;
    prizeValue: Record<string, unknown>;
    winChancePercent: number;
    rarity?: string;
    maxWinsTotal?: number;
    maxWinsPerCustomer?: number;
    startsAt?: Date;
    endsAt?: Date;
  }
): Promise<InstantWinPrize> {
  const prize = await db.raffleInstantWin.create({
    data: {
      raffleId,
      shop,
      name: data.name,
      description: data.description,
      imageUrl: data.imageUrl,
      prizeType: data.prizeType,
      prizeValue: data.prizeValue as Prisma.JsonValue,
      winChancePercent: data.winChancePercent,
      rarity: data.rarity || "COMMON",
      maxWinsTotal: data.maxWinsTotal,
      maxWinsPerCustomer: data.maxWinsPerCustomer || 1,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      isActive: true,
    },
  });

  console.log(
    `${LOG_PREFIX} Created instant win prize: ${prize.name} (${prize.rarity}, ${data.winChancePercent * 100}% chance)`
  );

  return {
    id: prize.id,
    name: prize.name,
    description: prize.description,
    imageUrl: prize.imageUrl,
    prizeType: prize.prizeType,
    prizeValue: prize.prizeValue as Record<string, unknown>,
    rarity: prize.rarity,
    winChancePercent: Number(prize.winChancePercent),
  };
}

/**
 * Update instant win prize
 */
export async function updateInstantWin(
  instantWinId: string,
  data: Partial<{
    name: string;
    description: string;
    imageUrl: string;
    prizeValue: Record<string, unknown>;
    winChancePercent: number;
    rarity: string;
    maxWinsTotal: number | null;
    maxWinsPerCustomer: number;
    startsAt: Date | null;
    endsAt: Date | null;
    isActive: boolean;
  }>
): Promise<void> {
  await db.raffleInstantWin.update({
    where: { id: instantWinId },
    data: {
      ...data,
      prizeValue: data.prizeValue as Prisma.JsonValue,
    },
  });
}

/**
 * Delete instant win prize
 */
export async function deleteInstantWin(instantWinId: string): Promise<void> {
  await db.raffleInstantWin.delete({
    where: { id: instantWinId },
  });
}

/**
 * Get instant win statistics for a raffle
 */
export async function getInstantWinStats(raffleId: string): Promise<{
  totalPrizes: number;
  totalWins: number;
  winsByRarity: Record<string, number>;
}> {
  const prizes = await db.raffleInstantWin.findMany({
    where: { raffleId },
    select: {
      rarity: true,
      currentWinsTotal: true,
    },
  });

  const winsByRarity: Record<string, number> = {};
  let totalWins = 0;

  for (const prize of prizes) {
    winsByRarity[prize.rarity] = (winsByRarity[prize.rarity] || 0) + prize.currentWinsTotal;
    totalWins += prize.currentWinsTotal;
  }

  return {
    totalPrizes: prizes.length,
    totalWins,
    winsByRarity,
  };
}
