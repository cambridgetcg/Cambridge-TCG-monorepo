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

import prisma from "~/db.server";
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

// ============================================
// EARNING FUNCTIONS
// ============================================

/**
 * Earn points for a customer.
 *
 * The previous implementation read `customer.pointsBalance` outside the
 * transaction, computed `newBalance = current + amount` in memory, then
 * wrote that hard-coded value back. Two concurrent earns on the same
 * customer both read the same "current" and both wrote their own
 * hard-coded "new" value, silently dropping one earn. Under Prisma's
 * default isolation level (READ COMMITTED on PostgreSQL), even wrapping
 * the read inside the transaction wouldn't have helped — only an atomic
 * `increment` at the DB layer serializes.
 *
 * Fixed 2026-04-23:
 *   - The customer row is updated with `{ increment }`, which the DB
 *     compiles to `UPDATE … SET pointsBalance = pointsBalance + :amount`
 *     — a single atomic statement. Concurrent earns add correctly.
 *   - The post-commit balance is read from the same UPDATE's `select`,
 *     not via a separate query that could observe intervening writes.
 *   - The ledger entry's `balance` column now records the TRUE balance
 *     this transaction committed to — no more internally inconsistent
 *     audit trail where two entries claim different "balance after"
 *     values for the same customer.
 */
export async function earnPoints(input: EarnPointsInput): Promise<PointsTransaction> {
  // Verify points system is enabled (outside tx — cheap read, no race).
  const enabled = await isPointsEnabled(input.shop);
  if (!enabled) {
    throw new Error("Points system is not enabled for this shop");
  }

  // Calculate expiration date (config read — no race on customer state).
  const expiresAt = await calculateExpirationDate(input.shop);

  const result = await prisma.$transaction(async (tx) => {
    // Atomic increment. Returns the post-commit balance for this tx.
    // We intentionally use `update` (not `updateMany`) so a missing
    // customer throws instead of silently becoming count=0.
    let updated;
    try {
      updated = await tx.customer.update({
        where: { id: input.customerId },
        data: {
          pointsBalance: { increment: input.amount },
          lifetimePoints: { increment: input.amount },
        },
        select: { pointsBalance: true, shop: true },
      });
    } catch (e) {
      // Prisma throws P2025 when the record doesn't exist.
      throw new Error("Customer not found");
    }
    // Defense in depth: reject cross-shop writes even if id collides.
    if (updated.shop !== input.shop) {
      throw new Error("Customer not found");
    }
    const newBalance = Number(updated.pointsBalance);

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

// ============================================
// SPENDING FUNCTIONS
// ============================================

/**
 * Check if customer has sufficient points balance.
 *
 * @deprecated This function answers at a point in time; any caller that
 *   uses the result to gate a subsequent `spendPoints` has a TOCTOU
 *   window and can race two concurrent spends past the check. The
 *   current `spendPoints` implementation (below) gates atomically at
 *   the DB layer, so this pre-check is unnecessary. Prefer letting
 *   `spendPoints` throw `Insufficient points balance` and handling the
 *   error — it's the only race-safe answer.
 *
 *   Kept callable because a few read-only surfaces (UI enable/disable
 *   for a "Redeem" button) legitimately want a snapshot answer.
 */
export async function hasEnoughPoints(
  customerId: string,
  shop: string,
  amount: number
): Promise<boolean> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shop },
    select: { pointsBalance: true },
  });

  if (!customer) {
    return false;
  }

  return Number(customer.pointsBalance) >= amount;
}

/**
 * Spend points for a customer.
 *
 * The previous implementation wrapped a read-then-write in a transaction
 * and claimed "serializable isolation prevents TOCTOU". Prisma's default
 * transaction runs at READ COMMITTED on PostgreSQL, so two concurrent
 * `spendPoints` calls on the same customer could both read
 * `pointsBalance=100`, both compute `newBalance` in memory, both issue a
 * plain `update`, and the second write would overwrite the first —
 * silently dropping one spend.
 *
 * Fixed 2026-04-23:
 *   - The customer update is an atomic conditional decrement via
 *     `updateMany`. The WHERE clause `pointsBalance: { gte: amount }` is
 *     evaluated in the same DB statement that performs the decrement,
 *     which the DB serializes. If two spends race, one succeeds and the
 *     other sees `count === 0` and throws `Insufficient`.
 *   - On the insufficient-balance branch, we re-read the current balance
 *     inside the same transaction to produce an accurate error message.
 *   - Post-commit balance is read for the ledger entry — same
 *     integrity property as the earn path.
 */
export async function spendPoints(input: SpendPointsInput): Promise<PointsTransaction> {
  const enabled = await isPointsEnabled(input.shop);
  if (!enabled) {
    throw new Error("Points system is not enabled for this shop");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Atomic conditional decrement — only succeeds if the live balance is
    // still >= input.amount. The DB serializes the WHERE + UPDATE as one.
    const updated = await tx.customer.updateMany({
      where: {
        id: input.customerId,
        shop: input.shop,
        pointsBalance: { gte: input.amount },
      },
      data: { pointsBalance: { decrement: input.amount } },
    });

    if (updated.count === 0) {
      // Either the customer doesn't exist OR their balance is too low.
      // Distinguish so the caller's error message is actionable.
      const existing = await tx.customer.findFirst({
        where: { id: input.customerId, shop: input.shop },
        select: { pointsBalance: true },
      });
      if (!existing) throw new Error("Customer not found");
      throw new Error(
        `Insufficient points balance. Required: ${input.amount}, Available: ${Number(existing.pointsBalance)}`
      );
    }

    // Read post-commit balance so the ledger entry records what actually
    // happened in this transaction (not a value that could be clobbered
    // by a concurrent commit).
    const committed = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: { pointsBalance: true },
    });
    const newBalance = Number(committed!.pointsBalance);

    const entry = await tx.pointsLedger.create({
      data: {
        shop: input.shop,
        customerId: input.customerId,
        amount: -input.amount,
        balance: newBalance,
        type: input.type,
        description: input.description ?? null,
        raffleEntryId: input.raffleEntryId ?? null,
        mysteryBoxOpenId: input.mysteryBoxOpenId ?? null,
        metadata: input.metadata as Prisma.JsonValue ?? null,
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
  const customer = await prisma.customer.findFirst({
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
  const expiringEntries = await prisma.pointsLedger.findMany({
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
    prisma.pointsLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    prisma.pointsLedger.count({ where }),
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
  // Find the original earned entry (read outside tx — it's append-only,
  // no race on this row).
  const originalEntry = await prisma.pointsLedger.findFirst({
    where: { shop, customerId, orderId, type: "ORDER_EARNED" },
    select: { id: true, amount: true, metadata: true },
  });

  if (!originalEntry) {
    return { clawedBack: false, amount: 0, reason: "No points found for this order" };
  }

  // Calculate clawback amount (pure math, no DB).
  let clawbackAmount = originalEntry.amount;
  const metadata = originalEntry.metadata as Record<string, unknown> | null;
  if (refundAmount && metadata?.orderAmount) {
    const orderAmount = Number(metadata.orderAmount);
    const proportion = refundAmount / orderAmount;
    clawbackAmount = Math.floor(originalEntry.amount * proportion);
  }

  if (clawbackAmount <= 0) {
    return { clawedBack: false, amount: 0, reason: "Clawback amount is zero" };
  }

  // Everything below runs in one transaction. The previous implementation
  // checked "already clawed back" OUTSIDE the transaction, which let two
  // concurrent webhook deliveries both see "not yet clawed back" and both
  // run the decrement — double-debiting the customer. Now the uniqueness
  // check is inside the tx.
  const result = await prisma.$transaction(async (tx) => {
    // Dedup: only one REFUND_CLAWBACK per (shop, customer, orderId).
    const existingClawback = await tx.pointsLedger.findFirst({
      where: { shop, customerId, orderId, type: "REFUND_CLAWBACK" },
      select: { id: true },
    });
    if (existingClawback) {
      return { status: "already_clawed_back" as const };
    }

    // Atomic conditional decrement — cap at current balance with a
    // GREATEST(0, …) equivalent. We issue TWO updateMany calls to handle
    // the "clamp to balance" case without risk of a lost update:
    //   1. If balance >= clawbackAmount, decrement by clawbackAmount.
    //   2. Else, decrement to zero (using the live value).
    // Each is atomic; concurrent refunds serialize at the row.
    const fullDecrement = await tx.customer.updateMany({
      where: {
        id: customerId,
        shop,
        pointsBalance: { gte: clawbackAmount },
      },
      data: { pointsBalance: { decrement: clawbackAmount } },
    });

    let actualClawback: number;
    if (fullDecrement.count === 1) {
      actualClawback = clawbackAmount;
    } else {
      // Balance is below clawbackAmount. Clamp to whatever's left.
      const current = await tx.customer.findFirst({
        where: { id: customerId, shop },
        select: { pointsBalance: true },
      });
      if (!current) {
        return { status: "customer_not_found" as const };
      }
      const currentBalance = Number(current.pointsBalance);
      if (currentBalance <= 0) {
        return { status: "zero_balance" as const };
      }
      // Set to exactly zero. `updateMany` with the guard ensures we don't
      // clobber a concurrent earn that raised the balance between our
      // read and write — we only zero it if it's still <= clawbackAmount.
      const clampUpdate = await tx.customer.updateMany({
        where: {
          id: customerId,
          shop,
          pointsBalance: { lte: clawbackAmount },
        },
        data: { pointsBalance: 0 },
      });
      if (clampUpdate.count === 0) {
        // Balance rose between our checks — retry the full decrement.
        // Rare; treat as success with the original clawback amount via
        // another gated update.
        const retry = await tx.customer.updateMany({
          where: {
            id: customerId,
            shop,
            pointsBalance: { gte: clawbackAmount },
          },
          data: { pointsBalance: { decrement: clawbackAmount } },
        });
        if (retry.count === 0) {
          // Race lost twice — bail cleanly rather than loop indefinitely.
          return { status: "balance_changed" as const };
        }
        actualClawback = clawbackAmount;
      } else {
        actualClawback = currentBalance;
      }
    }

    // Post-commit balance for the ledger entry.
    const committed = await tx.customer.findUnique({
      where: { id: customerId },
      select: { pointsBalance: true },
    });
    const newBalance = Number(committed!.pointsBalance);

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

    return { status: "clawed_back" as const, actualClawback };
  });

  if (result.status === "already_clawed_back") {
    return { clawedBack: false, amount: 0, reason: "Points already clawed back for this order" };
  }
  if (result.status === "customer_not_found") {
    return { clawedBack: false, amount: 0, reason: "Customer not found" };
  }
  if (result.status === "zero_balance") {
    return { clawedBack: false, amount: 0, reason: "No points to clawback (zero balance)" };
  }
  if (result.status === "balance_changed") {
    return { clawedBack: false, amount: 0, reason: "Balance changed during clawback; retry" };
  }

  console.log(`[PointsLedger] Clawed back ${result.actualClawback} points from customer ${customerId} for order ${orderId}`);

  return {
    clawedBack: true,
    amount: result.actualClawback,
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
  const expiredEntries = await prisma.pointsLedger.findMany({
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

  // Process expirations in transaction.
  //
  // Previous implementation did a per-customer read-then-write inside the
  // transaction — same lost-update race as earnPoints: if a customer
  // earned new points DURING this batch job, the expiration write would
  // clobber the earn. Fixed by using atomic decrement (clamped to zero)
  // inside the loop.
  await prisma.$transaction(async (tx) => {
    // Mark entries as expired — this is what prevents double-expiration
    // across job runs. Atomic, conditional on `expired: false`.
    await tx.pointsLedger.updateMany({
      where: {
        id: { in: expiredEntries.map((e: { id: string }) => e.id) },
        expired: false,
      },
      data: { expired: true },
    });

    for (const [customerId, expiredAmount] of customerExpiredPoints) {
      // Atomic decrement with balance floor. Two updateMany calls cover
      // the two cases: enough balance to decrement by the full amount, or
      // clamp to zero. Same pattern as clawbackPoints — see that function
      // for why we can't use raw SQL GREATEST in Prisma.
      const fullDecrement = await tx.customer.updateMany({
        where: {
          id: customerId,
          shop,
          pointsBalance: { gte: expiredAmount },
        },
        data: { pointsBalance: { decrement: expiredAmount } },
      });

      if (fullDecrement.count === 0) {
        // Balance below expiredAmount — clamp to 0. Guarded by <= so a
        // concurrent earn that raised the balance doesn't get clobbered.
        await tx.customer.updateMany({
          where: {
            id: customerId,
            shop,
            pointsBalance: { lte: expiredAmount },
          },
          data: { pointsBalance: 0 },
        });
      }

      // Read the post-commit balance for the ledger entry. If the
      // customer disappeared (deleted concurrently, vanishingly rare),
      // we still want a ledger row for audit — use 0 as a safe default.
      const committed = await tx.customer.findUnique({
        where: { id: customerId },
        select: { pointsBalance: true },
      });
      const newBalance = committed ? Number(committed.pointsBalance) : 0;

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

  const entries = await prisma.pointsLedger.findMany({
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
