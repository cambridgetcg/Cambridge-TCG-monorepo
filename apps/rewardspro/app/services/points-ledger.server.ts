/**
 * Points Ledger Service
 *
 * Manages all points transactions in the Points Engagement System.
 * This service handles:
 * - Earning points from purchases
 * - Spending points on features (raffles, mystery boxes, etc.)
 * - Balance tracking
 * - Refund clawbacks
 * - Point expiration
 * - Transaction history
 *
 * Points are stored as integers for simplicity and to avoid floating-point issues.
 */

import db from "~/db.server";
import type { PointsLedgerType, PointsRoundingMode, Prisma } from "@prisma/client";
import { getPointsConfig, calculateExpirationDate, isPointsEnabled } from "./points-config.server";

// ============================================
// TYPES
// ============================================

export interface EarnPointsInput {
  customerId: string;
  shop: string;
  amount: number;
  type: PointsLedgerType;
  description?: string;
  orderId?: string;
  challengeId?: string;
  spinResultId?: string;
  scratchCardId?: string;
  bonusEventId?: string;
  metadata?: Record<string, unknown>;
}

export interface SpendPointsInput {
  customerId: string;
  shop: string;
  amount: number;
  type: PointsLedgerType;
  description?: string;
  raffleEntryId?: string;
  mysteryBoxOpenId?: string;
  metadata?: Record<string, unknown>;
}

export interface PointsTransaction {
  id: string;
  amount: number;
  balance: number;
  type: PointsLedgerType;
  description: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
}

export interface PointsBalance {
  available: number;
  lifetime: number;
  expiringSoon: number;
  expiringWithin30Days: number;
}

export interface CalculatePointsResult {
  basePoints: number;
  tierMultiplier: number;
  bonusMultiplier: number;
  totalPoints: number;
  tierName: string | null;
}

// ============================================
// EARNING FUNCTIONS
// ============================================

/**
 * Calculate points for an order based on order amount and tier multipliers
 *
 * @param shop - Shop domain
 * @param orderAmount - Order amount in dollars
 * @param tierId - Customer's current tier ID (optional)
 * @param bonusEventMultiplier - Additional multiplier from bonus events (optional)
 * @returns Calculated points breakdown
 */
export async function calculatePointsForOrder(
  shop: string,
  orderAmount: number,
  tierId?: string | null,
  bonusEventMultiplier?: number
): Promise<CalculatePointsResult> {
  const config = await getPointsConfig(shop);

  // Calculate base points
  const rawPoints = orderAmount * config.pointsPerDollar;

  // Apply rounding mode
  let basePoints: number;
  switch (config.roundingMode) {
    case "CEIL":
      basePoints = Math.ceil(rawPoints);
      break;
    case "ROUND":
      basePoints = Math.round(rawPoints);
      break;
    case "FLOOR":
    default:
      basePoints = Math.floor(rawPoints);
  }

  // Get tier multiplier
  let tierMultiplier = 1.0;
  let tierName: string | null = null;

  if (tierId) {
    const tier = await db.tier.findUnique({
      where: { id: tierId },
      select: {
        name: true,
        pointsMultiplier: true,
      },
    });

    if (tier) {
      tierName = tier.name;
      tierMultiplier = tier.pointsMultiplier ? Number(tier.pointsMultiplier) : 1.0;
    }
  }

  // Apply bonus event multiplier (defaults to 1.0)
  const bonusMultiplier = bonusEventMultiplier ?? 1.0;

  // Calculate total points
  const totalPoints = Math.floor(basePoints * tierMultiplier * bonusMultiplier);

  return {
    basePoints,
    tierMultiplier,
    bonusMultiplier,
    totalPoints,
    tierName,
  };
}

/**
 * Earn points for a customer
 *
 * Creates a ledger entry and updates the customer's balance.
 *
 * @param input - Earn points input
 * @returns Created ledger entry
 */
export async function earnPoints(input: EarnPointsInput): Promise<PointsTransaction> {
  // Verify points system is enabled
  const enabled = await isPointsEnabled(input.shop);
  if (!enabled) {
    throw new Error("Points system is not enabled for this shop");
  }

  // Get current balance
  const customer = await db.customer.findFirst({
    where: { id: input.customerId, shop: input.shop },
    select: { pointsBalance: true, lifetimePoints: true },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  const currentBalance = Number(customer.pointsBalance);
  const newBalance = currentBalance + input.amount;

  // Calculate expiration date
  const expiresAt = await calculateExpirationDate(input.shop);

  // Create ledger entry and update customer balance in transaction
  const result = await db.$transaction(async (tx) => {
    // Create ledger entry
    const entry = await tx.pointsLedger.create({
      data: {
        shop: input.shop,
        customerId: input.customerId,
        amount: input.amount,
        balance: newBalance,
        type: input.type,
        description: input.description ?? null,
        orderId: input.orderId ?? null,
        challengeId: input.challengeId ?? null,
        spinResultId: input.spinResultId ?? null,
        scratchCardId: input.scratchCardId ?? null,
        bonusEventId: input.bonusEventId ?? null,
        expiresAt,
        metadata: input.metadata as Prisma.JsonValue ?? null,
      },
    });

    // Update customer balance
    await tx.customer.update({
      where: { id: input.customerId },
      data: {
        pointsBalance: newBalance,
        lifetimePoints: { increment: input.amount },
      },
    });

    return entry;
  });

  console.log(`[PointsLedger] Customer ${input.customerId} earned ${input.amount} points (type: ${input.type})`);

  return {
    id: result.id,
    amount: result.amount,
    balance: result.balance,
    type: result.type,
    description: result.description,
    createdAt: result.createdAt,
    expiresAt: result.expiresAt,
    metadata: result.metadata as Record<string, unknown> | null,
  };
}

/**
 * Award points for completing an order
 *
 * Convenience function that calculates and awards points for an order.
 *
 * @param shop - Shop domain
 * @param customerId - Customer ID
 * @param orderId - Shopify order ID
 * @param orderAmount - Order amount in dollars
 * @param tierId - Customer's current tier ID
 * @param bonusEventMultiplier - Bonus event multiplier (optional)
 * @returns Points calculation result and ledger entry
 */
export async function awardOrderPoints(
  shop: string,
  customerId: string,
  orderId: string,
  orderAmount: number,
  tierId?: string | null,
  bonusEventMultiplier?: number
): Promise<{
  calculation: CalculatePointsResult;
  transaction: PointsTransaction;
}> {
  // Calculate points first (reads config + tier, no write contention)
  const calculation = await calculatePointsForOrder(
    shop,
    orderAmount,
    tierId,
    bonusEventMultiplier
  );

  if (calculation.totalPoints <= 0) {
    throw new Error("No points to award for this order");
  }

  // Idempotency check + earn inside a single transaction to prevent double-award
  const result = await db.$transaction(async (tx) => {
    // Check for duplicate inside transaction
    const existing = await tx.pointsLedger.findFirst({
      where: {
        shop,
        customerId,
        orderId,
        type: "ORDER_EARNED",
      },
    });

    if (existing) {
      throw new Error(`Points already awarded for order ${orderId}`);
    }

    // Get current balance
    const customer = await tx.customer.findFirst({
      where: { id: customerId, shop },
      select: { pointsBalance: true, lifetimePoints: true },
    });

    if (!customer) {
      throw new Error("Customer not found");
    }

    const currentBalance = Number(customer.pointsBalance);
    const newBalance = currentBalance + calculation.totalPoints;

    // Calculate expiration date
    const expiresAt = await calculateExpirationDate(shop);

    // Create ledger entry
    const entry = await tx.pointsLedger.create({
      data: {
        shop,
        customerId,
        amount: calculation.totalPoints,
        balance: newBalance,
        type: "ORDER_EARNED",
        description: `Earned from order`,
        orderId,
        expiresAt,
        metadata: {
          orderAmount,
          basePoints: calculation.basePoints,
          tierMultiplier: calculation.tierMultiplier,
          bonusMultiplier: calculation.bonusMultiplier,
          tierName: calculation.tierName,
        } as Prisma.JsonValue,
      },
    });

    // Update customer balance
    await tx.customer.update({
      where: { id: customerId },
      data: {
        pointsBalance: newBalance,
        lifetimePoints: { increment: calculation.totalPoints },
      },
    });

    return entry;
  });

  const transaction: PointsTransaction = {
    id: result.id,
    amount: result.amount,
    balance: result.balance,
    type: result.type,
    description: result.description,
    createdAt: result.createdAt,
    expiresAt: result.expiresAt,
    metadata: result.metadata as Record<string, unknown> | null,
  };

  return { calculation, transaction };
}

// ============================================
// SPENDING FUNCTIONS
// ============================================

/**
 * Check if customer has sufficient points balance
 *
 * @param customerId - Customer ID
 * @param shop - Shop domain
 * @param amount - Points amount required
 * @returns Whether customer has sufficient balance
 */
export async function hasEnoughPoints(
  customerId: string,
  shop: string,
  amount: number
): Promise<boolean> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: { pointsBalance: true },
  });

  if (!customer) {
    return false;
  }

  return Number(customer.pointsBalance) >= amount;
}

/**
 * Spend points for a customer
 *
 * Creates a negative ledger entry and updates the customer's balance.
 * Throws if customer doesn't have enough points.
 *
 * @param input - Spend points input
 * @returns Created ledger entry
 */
export async function spendPoints(input: SpendPointsInput): Promise<PointsTransaction> {
  // Verify points system is enabled
  const enabled = await isPointsEnabled(input.shop);
  if (!enabled) {
    throw new Error("Points system is not enabled for this shop");
  }

  // Balance check + ledger entry + balance update all inside transaction
  // to prevent race conditions from concurrent spends
  const result = await db.$transaction(async (tx) => {
    // Read balance inside transaction (serializable isolation prevents TOCTOU)
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, shop: input.shop },
      select: { pointsBalance: true },
    });

    if (!customer) {
      throw new Error("Customer not found");
    }

    const currentBalance = Number(customer.pointsBalance);

    if (currentBalance < input.amount) {
      throw new Error(`Insufficient points balance. Required: ${input.amount}, Available: ${currentBalance}`);
    }

    const newBalance = currentBalance - input.amount;

    // Create ledger entry (negative amount for spending)
    const entry = await tx.pointsLedger.create({
      data: {
        shop: input.shop,
        customerId: input.customerId,
        amount: -input.amount, // Negative for spending
        balance: newBalance,
        type: input.type,
        description: input.description ?? null,
        raffleEntryId: input.raffleEntryId ?? null,
        mysteryBoxOpenId: input.mysteryBoxOpenId ?? null,
        metadata: input.metadata as Prisma.JsonValue ?? null,
      },
    });

    // Update customer balance
    await tx.customer.update({
      where: { id: input.customerId },
      data: {
        pointsBalance: newBalance,
      },
    });

    return entry;
  });

  console.log(`[PointsLedger] Customer ${input.customerId} spent ${input.amount} points (type: ${input.type})`);

  return {
    id: result.id,
    amount: result.amount, // Will be negative
    balance: result.balance,
    type: result.type,
    description: result.description,
    createdAt: result.createdAt,
    expiresAt: result.expiresAt,
    metadata: result.metadata as Record<string, unknown> | null,
  };
}

// ============================================
// BALANCE FUNCTIONS
// ============================================

/**
 * Get the points balance for a customer
 *
 * @param customerId - Customer ID
 * @param shop - Shop domain
 * @returns Points balance breakdown
 */
export async function getPointsBalance(
  customerId: string,
  shop: string
): Promise<PointsBalance> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: {
      pointsBalance: true,
      lifetimePoints: true,
    },
  });

  if (!customer) {
    return {
      available: 0,
      lifetime: 0,
      expiringSoon: 0,
      expiringWithin30Days: 0,
    };
  }

  // Calculate expiring points
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Get expiring points (non-expired entries with expiration within 30 days)
  const expiringEntries = await db.pointsLedger.findMany({
    where: {
      customerId,
      shop,
      expired: false,
      expiresAt: {
        lte: thirtyDaysFromNow,
        gt: now,
      },
      amount: { gt: 0 }, // Only earning entries expire
    },
    select: { amount: true },
  });

  const expiringWithin30Days = expiringEntries.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0);

  return {
    available: Number(customer.pointsBalance),
    lifetime: Number(customer.lifetimePoints),
    expiringSoon: expiringWithin30Days,
    expiringWithin30Days,
  };
}

// ============================================
// HISTORY FUNCTIONS
// ============================================

/**
 * Get transaction history for a customer
 *
 * @param customerId - Customer ID
 * @param shop - Shop domain
 * @param options - Pagination and filter options
 * @returns List of transactions
 */
export async function getTransactionHistory(
  customerId: string,
  shop: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: PointsLedgerType;
  }
): Promise<{
  transactions: PointsTransaction[];
  total: number;
}> {
  const where: Prisma.PointsLedgerWhereInput = {
    customerId,
    shop,
  };

  if (options?.type) {
    where.type = options.type;
  }

  const [entries, total] = await Promise.all([
    db.pointsLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    db.pointsLedger.count({ where }),
  ]);

  return {
    transactions: entries.map((e) => ({
      id: e.id,
      amount: e.amount,
      balance: e.balance,
      type: e.type,
      description: e.description,
      createdAt: e.createdAt,
      expiresAt: e.expiresAt,
      metadata: e.metadata as Record<string, unknown> | null,
    })),
    total,
  };
}

// ============================================
// CLAWBACK FUNCTIONS
// ============================================

/**
 * Clawback points due to a refund
 *
 * @param shop - Shop domain
 * @param customerId - Customer ID
 * @param orderId - Order ID being refunded
 * @param refundAmount - Refund amount (used to calculate proportional clawback)
 * @returns Clawback result
 */
export async function clawbackPoints(
  shop: string,
  customerId: string,
  orderId: string,
  refundAmount?: number
): Promise<{
  clawedBack: boolean;
  amount: number;
  reason: string;
}> {
  // Find the original points earned for this order
  const originalEntry = await db.pointsLedger.findFirst({
    where: {
      shop,
      customerId,
      orderId,
      type: "ORDER_EARNED",
    },
    select: {
      id: true,
      amount: true,
      metadata: true,
    },
  });

  if (!originalEntry) {
    return {
      clawedBack: false,
      amount: 0,
      reason: "No points found for this order",
    };
  }

  // Calculate clawback amount
  let clawbackAmount = originalEntry.amount;
  const metadata = originalEntry.metadata as Record<string, unknown> | null;

  // If refundAmount provided, calculate proportional clawback
  if (refundAmount && metadata?.orderAmount) {
    const orderAmount = Number(metadata.orderAmount);
    const proportion = refundAmount / orderAmount;
    clawbackAmount = Math.floor(originalEntry.amount * proportion);
  }

  // Check if we already clawed back for this order
  const existingClawback = await db.pointsLedger.findFirst({
    where: {
      shop,
      customerId,
      orderId,
      type: "REFUND_CLAWBACK",
    },
  });

  if (existingClawback) {
    return {
      clawedBack: false,
      amount: 0,
      reason: "Points already clawed back for this order",
    };
  }

  // Get current balance
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: { pointsBalance: true },
  });

  if (!customer) {
    return {
      clawedBack: false,
      amount: 0,
      reason: "Customer not found",
    };
  }

  // Clawback cannot exceed current balance
  const currentBalance = Number(customer.pointsBalance);
  const actualClawback = Math.min(clawbackAmount, currentBalance);
  const newBalance = currentBalance - actualClawback;

  if (actualClawback <= 0) {
    return {
      clawedBack: false,
      amount: 0,
      reason: "No points to clawback (zero balance)",
    };
  }

  // Create clawback entry
  await db.$transaction(async (tx) => {
    await tx.pointsLedger.create({
      data: {
        shop,
        customerId,
        amount: -actualClawback,
        balance: newBalance,
        type: "REFUND_CLAWBACK",
        orderId,
        description: `Points clawed back due to refund`,
        metadata: {
          originalPointsEarned: originalEntry.amount,
          refundAmount,
        } as Prisma.JsonValue,
      },
    });

    await tx.customer.update({
      where: { id: customerId },
      data: {
        pointsBalance: newBalance,
      },
    });
  });

  console.log(`[PointsLedger] Clawed back ${actualClawback} points from customer ${customerId} for order ${orderId}`);

  return {
    clawedBack: true,
    amount: actualClawback,
    reason: "Points successfully clawed back",
  };
}

// ============================================
// EXPIRATION FUNCTIONS
// ============================================

/**
 * Expire points for all customers in a shop
 *
 * This should be run as a cron job.
 *
 * @param shop - Shop domain
 * @returns Expiration result
 */
export async function expirePoints(shop: string): Promise<{
  customersAffected: number;
  totalPointsExpired: number;
}> {
  const now = new Date();

  // Find all non-expired entries that are past their expiration date
  const expiredEntries = await db.pointsLedger.findMany({
    where: {
      shop,
      expired: false,
      expiresAt: { lte: now },
      amount: { gt: 0 }, // Only positive entries can expire
    },
    select: {
      id: true,
      customerId: true,
      amount: true,
    },
  });

  if (expiredEntries.length === 0) {
    return {
      customersAffected: 0,
      totalPointsExpired: 0,
    };
  }

  // Group by customer
  const customerExpiredPoints = new Map<string, number>();
  for (const entry of expiredEntries) {
    const current = customerExpiredPoints.get(entry.customerId) ?? 0;
    customerExpiredPoints.set(entry.customerId, current + entry.amount);
  }

  // Process expirations in transaction
  await db.$transaction(async (tx) => {
    // Mark entries as expired
    await tx.pointsLedger.updateMany({
      where: {
        id: { in: expiredEntries.map((e: { id: string }) => e.id) },
      },
      data: {
        expired: true,
      },
    });

    // Create expiration ledger entries and update balances
    for (const [customerId, expiredAmount] of customerExpiredPoints) {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, shop },
        select: { pointsBalance: true },
      });

      if (!customer) continue;

      const currentBalance = Number(customer.pointsBalance);
      const newBalance = Math.max(0, currentBalance - expiredAmount);

      await tx.pointsLedger.create({
        data: {
          shop,
          customerId,
          amount: -expiredAmount,
          balance: newBalance,
          type: "EXPIRATION",
          description: "Points expired",
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: {
          pointsBalance: newBalance,
        },
      });
    }
  });

  const totalPointsExpired = Array.from(customerExpiredPoints.values()).reduce(
    (sum, amount) => sum + amount,
    0
  );

  console.log(`[PointsLedger] Expired ${totalPointsExpired} points for ${customerExpiredPoints.size} customers in shop ${shop}`);

  return {
    customersAffected: customerExpiredPoints.size,
    totalPointsExpired,
  };
}

/**
 * Get points that are about to expire for a customer
 *
 * @param customerId - Customer ID
 * @param shop - Shop domain
 * @param withinDays - Number of days to look ahead
 * @returns Expiring points details
 */
export async function getExpiringPoints(
  customerId: string,
  shop: string,
  withinDays: number = 30
): Promise<{
  totalExpiring: number;
  entries: Array<{
    amount: number;
    expiresAt: Date;
    daysUntilExpiry: number;
  }>;
}> {
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + withinDays);

  const entries = await db.pointsLedger.findMany({
    where: {
      customerId,
      shop,
      expired: false,
      expiresAt: {
        gt: now,
        lte: futureDate,
      },
      amount: { gt: 0 },
    },
    orderBy: { expiresAt: "asc" },
    select: {
      amount: true,
      expiresAt: true,
    },
  });

  const result = entries.map((e: { amount: number; expiresAt: Date | null }) => ({
    amount: e.amount,
    expiresAt: e.expiresAt!,
    daysUntilExpiry: Math.ceil(
      (e.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));

  return {
    totalExpiring: result.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0),
    entries: result,
  };
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Manually adjust a customer's points balance
 *
 * @param shop - Shop domain
 * @param customerId - Customer ID
 * @param amount - Points to add (positive) or remove (negative)
 * @param reason - Reason for adjustment
 * @param adminId - Admin who made the adjustment
 * @returns Adjustment result
 */
export async function adjustPoints(
  shop: string,
  customerId: string,
  amount: number,
  reason: string,
  adminId?: string
): Promise<PointsTransaction> {
  const type: PointsLedgerType = amount > 0 ? "MANUAL_CREDIT" : "MANUAL_DEBIT";

  if (amount > 0) {
    return earnPoints({
      customerId,
      shop,
      amount,
      type,
      description: reason,
      metadata: { adjustedBy: adminId },
    });
  } else {
    return spendPoints({
      customerId,
      shop,
      amount: Math.abs(amount),
      type,
      description: reason,
      metadata: { adjustedBy: adminId },
    });
  }
}
