/**
 * Raffle Entry Service
 *
 * Handles customer raffle entries, including:
 * - Purchasing entries with points
 * - Validating eligibility
 * - Tracking entries and updating stats
 * - Psychology bonuses (streaks, instant wins, lucky numbers)
 */

import type { RafflePrizeType } from "@prisma/client";
import prisma from "../db.server";
import { spendPoints, earnPoints, getPointsBalance } from "./points-ledger.server";
import { checkRaffleEligibility, type RaffleStatus } from "./raffle-management.server";
import { trackRaffleEntered, trackPointsSpent } from "./klaviyo-events.server";
import {
  processPsychologyBonuses,
  type AppliedBonuses,
  type CelebrationEvent,
} from "./raffle-psychology.server";
import type { RaffleStreakInfo } from "./raffle-streak.server";
import type { InstantWinResult } from "./raffle-instant-win.server";
import { claimFreeEntry } from "./raffle-streak.server";

const LOG_PREFIX = "[RaffleEntry]";

// ============================================
// TYPES
// ============================================

export interface PurchaseEntriesInput {
  shop: string;
  customerId: string;
  raffleId: string;
  quantity: number; // Number of entries to purchase
  tierMultiplier?: number; // Bonus multiplier from customer's tier
}

export interface PurchaseEntriesResult {
  success: boolean;
  error?: string;
  entryId?: string;
  entriesCount?: number;
  totalEntriesCount?: number;
  pointsSpent?: number;
  newBalance?: number;
  // Psychology enhancements
  bonuses?: AppliedBonuses;
  instantWins?: InstantWinResult[];
  streakInfo?: RaffleStreakInfo;
  celebrations?: CelebrationEvent[];
  finalEntries?: number; // Entries after bonuses applied
}

export interface CustomerRaffleStatus {
  raffleId: string;
  raffleName: string;
  status: RaffleStatus;
  entryCost: number;
  customerEntries: number;
  maxEntriesPerCustomer: number;
  canEnter: boolean;
  reason?: string;
  startsAt: Date;
  endsAt: Date;
  totalEntries: number;
  uniqueEntrants: number;
}

// ============================================
// ENTRY PURCHASE
// ============================================

/**
 * Purchase raffle entries for a customer
 *
 * This function:
 * 1. Validates the raffle is active and accepting entries
 * 2. Checks customer has sufficient points
 * 3. Checks customer hasn't exceeded max entries
 * 4. Deducts points and creates/updates entry record
 * 5. Updates raffle statistics
 */
export async function purchaseRaffleEntries(
  input: PurchaseEntriesInput
): Promise<PurchaseEntriesResult> {
  const { shop, customerId, raffleId, quantity, tierMultiplier = 1.0 } = input;

  console.log(`${LOG_PREFIX} purchaseRaffleEntries: customer=${customerId}, raffle=${raffleId}, qty=${quantity}`);

  try {
    // 1. Get the raffle
    const raffle = await prisma.raffle.findFirst({
      where: { id: raffleId, shop },
    });

    if (!raffle) {
      return { success: false, error: "Raffle not found" };
    }

    // 2. Check raffle status and timing
    if (raffle.status !== "ACTIVE") {
      return { success: false, error: "Raffle is not accepting entries" };
    }

    const now = new Date();
    if (now < raffle.startsAt) {
      return { success: false, error: "Raffle has not started yet" };
    }
    if (now > raffle.endsAt) {
      return { success: false, error: "Raffle has ended" };
    }

    // 3. Check entry limits
    const existingEntry = await prisma.raffleEntry.findFirst({
      where: { raffleId, customerId },
    });

    const currentEntries = existingEntry?.entriesCount || 0;
    const requestedTotal = currentEntries + quantity;

    if (requestedTotal > raffle.maxEntriesPerCustomer) {
      const remaining = raffle.maxEntriesPerCustomer - currentEntries;
      return {
        success: false,
        error: remaining > 0
          ? `You can only purchase ${remaining} more ${remaining === 1 ? "entry" : "entries"}`
          : "You have reached the maximum entries for this raffle",
      };
    }

    // Check total entry limit
    if (raffle.maxEntriesTotal) {
      const newTotal = raffle.totalEntries + quantity;
      if (newTotal > raffle.maxEntriesTotal) {
        const available = raffle.maxEntriesTotal - raffle.totalEntries;
        return {
          success: false,
          error: available > 0
            ? `Only ${available} ${available === 1 ? "entry" : "entries"} remaining`
            : "Raffle is full",
        };
      }
    }

    // 4. Calculate base points cost
    const basePointsCost = raffle.entryCost * quantity;

    // 5. Check customer has sufficient points
    const currentBalance = Number(await getPointsBalance(shop, customerId));
    if (currentBalance < basePointsCost) {
      return {
        success: false,
        error: `Insufficient points. You need ${basePointsCost} but only have ${currentBalance}`,
      };
    }

    // 6. Process psychology bonuses
    const psychologyResult = await processPsychologyBonuses(
      {
        shop,
        customerId,
        raffleId,
        raffleName: raffle.name,
        currentTotalEntries: raffle.totalEntries,
      },
      quantity,
      tierMultiplier
    );

    // Final entries after bonuses (can be higher than base)
    const finalEntries = psychologyResult.finalEntries;
    const pointsCost = basePointsCost; // Points cost stays based on base entries

    // 7. Atomic entry creation + limit enforcement + raffle stats update
    // Transaction prevents race conditions where concurrent requests exceed entry limits
    const { entry } = await prisma.$transaction(async (tx) => {
      // Re-check entry count inside transaction (prevents TOCTOU race)
      const txExistingEntry = await tx.raffleEntry.findFirst({
        where: { raffleId, customerId },
      });

      const txCurrentEntries = txExistingEntry?.entriesCount || 0;
      const txRequestedTotal = txCurrentEntries + finalEntries;

      if (txRequestedTotal > raffle.maxEntriesPerCustomer) {
        throw new Error("Maximum entries exceeded (concurrent request detected)");
      }

      // Re-check total entry limit
      if (raffle.maxEntriesTotal) {
        const txRaffle = await tx.raffle.findUnique({
          where: { id: raffleId },
          select: { totalEntries: true },
        });
        if (txRaffle && txRaffle.totalEntries + finalEntries > raffle.maxEntriesTotal) {
          throw new Error("Raffle is full (concurrent request detected)");
        }
      }

      let txEntry;
      const txIsNewEntrant = !txExistingEntry;

      if (txExistingEntry) {
        txEntry = await tx.raffleEntry.update({
          where: { id: txExistingEntry.id },
          data: {
            entriesCount: txExistingEntry.entriesCount + finalEntries,
            pointsSpent: txExistingEntry.pointsSpent + pointsCost,
            streakBonusApplied: psychologyResult.bonuses.streak.applied
              ? psychologyResult.bonuses.streak.multiplier
              : null,
            earlyBirdBonusApplied: psychologyResult.bonuses.earlyBird.applied,
            luckyNumberBonus: psychologyResult.bonuses.luckyNumber.bonusEntries,
            bonusEventId: psychologyResult.bonuses.bonusEvent.eventId,
            instantWinsTriggered: {
              increment: psychologyResult.instantWins.filter((w) => w.won).length,
            },
          },
        });
      } else {
        txEntry = await tx.raffleEntry.create({
          data: {
            raffleId,
            customerId,
            shop,
            entriesCount: finalEntries,
            pointsSpent: pointsCost,
            entryMultiplier: tierMultiplier,
            isWinner: false,
            streakBonusApplied: psychologyResult.bonuses.streak.applied
              ? psychologyResult.bonuses.streak.multiplier
              : null,
            earlyBirdBonusApplied: psychologyResult.bonuses.earlyBird.applied,
            luckyNumberBonus: psychologyResult.bonuses.luckyNumber.bonusEntries,
            bonusEventId: psychologyResult.bonuses.bonusEvent.eventId,
            instantWinsTriggered: psychologyResult.instantWins.filter((w) => w.won).length,
          },
        });
      }

      // Update raffle statistics
      await tx.raffle.update({
        where: { id: raffleId },
        data: {
          totalEntries: { increment: finalEntries },
          uniqueEntrants: txIsNewEntrant ? { increment: 1 } : undefined,
          totalPrizePool: { increment: pointsCost },
          updatedAt: new Date(),
        },
      });

      return { entry: txEntry };
    });

    // 8. Record points transaction (deduct points) — already atomic via spendPoints
    await spendPoints({
      shop,
      customerId,
      amount: pointsCost,
      type: "RAFFLE_ENTRY",
      description: `Purchased ${quantity} ${quantity === 1 ? "entry" : "entries"} for "${raffle.name}"`,
      raffleEntryId: entry.id,
    });

    // 9. Get updated balance
    const newBalance = await getPointsBalance(shop, customerId);

    console.log(`${LOG_PREFIX} Successfully purchased ${quantity} entries for raffle ${raffleId}`);

    console.log(
      `${LOG_PREFIX} Successfully purchased ${quantity} entries (${finalEntries} with bonuses) for raffle ${raffleId}`
    );

    // 10. Dispatch Klaviyo events for marketing automation
    // Run async without blocking the response
    (async () => {
      try {
        // Get customer with tier for event tracking
        const customer = await prisma.customer.findUnique({
          where: { id: customerId },
          include: { currentTier: true },
        });

        if (customer?.email) {
          // Track raffle entry event
          await trackRaffleEntered(
            shop,
            { ...customer, pointsBalance: newBalance },
            {
              id: raffle.id,
              name: raffle.name,
              endsAt: raffle.endsAt,
              entryCount: entry.entriesCount,
              totalEntries: raffle.totalEntries + finalEntries,
            },
            finalEntries, // Include bonus entries in tracking
            pointsCost
          );

          // Track points spent event
          await trackPointsSpent(
            shop,
            { ...customer, pointsBalance: newBalance },
            pointsCost,
            "raffle",
            {
              raffleName: raffle.name,
              raffleId: raffle.id,
              redemptionValue: finalEntries - quantity, // Track bonus entries separately
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
      entryId: entry.id,
      entriesCount: quantity,
      totalEntriesCount: entry.entriesCount,
      pointsSpent: pointsCost,
      newBalance: Number(newBalance),
      // Psychology data
      finalEntries,
      bonuses: psychologyResult.bonuses,
      instantWins: psychologyResult.instantWins,
      streakInfo: psychologyResult.streakInfo,
      celebrations: psychologyResult.celebrations,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "An error occurred";
    const errorStack = error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : '';
    console.error(`${LOG_PREFIX} Error purchasing entries:`, {
      error: errorMsg,
      stack: errorStack,
      shop,
      customerId,
      raffleId,
      quantity,
    });
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ============================================
// CUSTOMER STATUS QUERIES
// ============================================

/**
 * Get a customer's entry status for a specific raffle
 */
export async function getCustomerRaffleStatus(
  shop: string,
  customerId: string,
  raffleId: string
): Promise<CustomerRaffleStatus | null> {
  console.log(`${LOG_PREFIX} getCustomerRaffleStatus: customer=${customerId}, raffle=${raffleId}`);

  const raffle = await prisma.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!raffle) return null;

  const entry = await prisma.raffleEntry.findFirst({
    where: { raffleId, customerId },
  });

  const eligibility = await checkRaffleEligibility(raffleId, customerId, shop);

  return {
    raffleId: raffle.id,
    raffleName: raffle.name,
    status: raffle.status as RaffleStatus,
    entryCost: raffle.entryCost,
    customerEntries: entry?.entriesCount || 0,
    maxEntriesPerCustomer: raffle.maxEntriesPerCustomer,
    canEnter: eligibility.eligible,
    reason: eligibility.reason,
    startsAt: raffle.startsAt,
    endsAt: raffle.endsAt,
    totalEntries: raffle.totalEntries,
    uniqueEntrants: raffle.uniqueEntrants,
  };
}

/**
 * Get all raffles a customer can see (active/scheduled) with their entry status
 */
export async function getCustomerAvailableRaffles(
  shop: string,
  customerId: string
): Promise<CustomerRaffleStatus[]> {
  console.log(`${LOG_PREFIX} getCustomerAvailableRaffles: customer=${customerId}`);

  // Get all public, non-completed raffles
  const raffles = await prisma.raffle.findMany({
    where: {
      shop,
      isPublic: true,
      status: { in: ["SCHEDULED", "ACTIVE"] },
    },
    orderBy: { startsAt: "asc" },
  });

  // Get customer's entries for these raffles
  const raffleIds = raffles.map((r: any) => r.id);
  const entries = await prisma.raffleEntry.findMany({
    where: {
      customerId,
      raffleId: { in: raffleIds },
    },
  });

  const entriesMap = new Map(entries.map((e: any) => [e.raffleId, e]));

  // Build status for each raffle
  const results: CustomerRaffleStatus[] = [];

  for (const raffle of raffles) {
    const entry = entriesMap.get(raffle.id);
    const eligibility = await checkRaffleEligibility(raffle.id, customerId, shop);

    results.push({
      raffleId: raffle.id,
      raffleName: raffle.name,
      status: raffle.status as RaffleStatus,
      entryCost: raffle.entryCost,
      customerEntries: entry?.entriesCount || 0,
      maxEntriesPerCustomer: raffle.maxEntriesPerCustomer,
      canEnter: eligibility.eligible,
      reason: eligibility.reason,
      startsAt: raffle.startsAt,
      endsAt: raffle.endsAt,
      totalEntries: raffle.totalEntries,
      uniqueEntrants: raffle.uniqueEntrants,
    });
  }

  return results;
}

/**
 * Prize details returned for winners in history
 */
export interface RaffleHistoryPrize {
  id: string;
  name: string;
  description: string | null;
  prizeType: RafflePrizeType;
  prizeValue: {
    // DISCOUNT
    type?: "percentage" | "fixed";
    value?: number;
    // STORE_CREDIT / POINTS
    amount?: number;
    // PRODUCT
    productTitle?: string;
    quantity?: number;
    // CUSTOM
    fulfillmentInstructions?: string;
  };
  deliveryStatus: string;
  deliveredAt: Date | null;
  discountCode: string | null;
}

/**
 * Get a customer's raffle entry history
 * Enhanced to include prize details for winners
 */
export async function getCustomerRaffleHistory(
  shop: string,
  customerId: string,
  options?: { limit?: number; includeCompleted?: boolean }
): Promise<Array<{
  entryId: string;
  raffleId: string;
  raffleName: string;
  raffleStatus: RaffleStatus;
  entriesCount: number;
  pointsSpent: number;
  isWinner: boolean;
  prize: RaffleHistoryPrize | null;
  createdAt: Date;
}>> {
  console.log(`${LOG_PREFIX} getCustomerRaffleHistory: customer=${customerId}`);

  const whereClause: any = {
    shop,
    customerId,
  };

  // Get entries with raffle info
  const entries = await prisma.raffleEntry.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: options?.limit || 20,
  });

  // Get raffle details for each entry
  const raffleIds = [...new Set(entries.map((e: any) => e.raffleId))];
  const raffles = await prisma.raffle.findMany({
    where: { id: { in: raffleIds } },
  });
  const raffleMap = new Map(raffles.map((r: any) => [r.id, r]));

  // Get winner records for this customer's winning entries
  const winningEntryIds = entries
    .filter((e: any) => e.isWinner)
    .map((e: any) => e.id);

  let winnerMap = new Map<string, any>();
  let prizeMap = new Map<string, any>();

  if (winningEntryIds.length > 0) {
    // Fetch winner records
    const winners = await prisma.raffleWinner.findMany({
      where: {
        raffleEntryId: { in: winningEntryIds },
        shop,
      },
    });

    // Create map of entryId -> winner
    winnerMap = new Map(winners.map((w: any) => [w.raffleEntryId, w]));

    // Fetch prize details for winners
    const prizeIds = winners.map((w: any) => w.rafflePrizeId);
    if (prizeIds.length > 0) {
      const prizes = await prisma.rafflePrize.findMany({
        where: { id: { in: prizeIds } },
      });
      prizeMap = new Map(prizes.map((p: any) => [p.id, p]));
    }
  }

  // Filter if not including completed
  let filteredEntries = entries;
  if (!options?.includeCompleted) {
    filteredEntries = entries.filter((e: any) => {
      const raffle = raffleMap.get(e.raffleId);
      return raffle && !["COMPLETED", "CANCELLED"].includes(raffle.status);
    });
  }

  return filteredEntries.map((entry: any) => {
    const raffle = raffleMap.get(entry.raffleId);
    const winner = winnerMap.get(entry.id);
    const prize = winner ? prizeMap.get(winner.rafflePrizeId) : null;

    // Build prize details if winner
    let prizeDetails: RaffleHistoryPrize | null = null;
    if (entry.isWinner && prize) {
      const prizeValue = prize.prizeValue as any || {};
      prizeDetails = {
        id: prize.id,
        name: prize.name,
        description: prize.description,
        prizeType: prize.prizeType as RafflePrizeType,
        prizeValue: {
          type: prizeValue.type,
          value: prizeValue.value,
          amount: prizeValue.amount,
          productTitle: prizeValue.productTitle,
          quantity: prizeValue.quantity,
          fulfillmentInstructions: prizeValue.fulfillmentInstructions,
        },
        deliveryStatus: winner?.deliveryStatus || "PENDING",
        deliveredAt: winner?.deliveredAt || null,
        discountCode: winner?.discountCode || null,
      };
    }

    return {
      entryId: entry.id,
      raffleId: entry.raffleId,
      raffleName: raffle?.name || "Unknown Raffle",
      raffleStatus: (raffle?.status || "COMPLETED") as RaffleStatus,
      entriesCount: entry.entriesCount,
      pointsSpent: entry.pointsSpent,
      isWinner: entry.isWinner,
      prize: prizeDetails,
      createdAt: entry.createdAt,
    };
  });
}

// ============================================
// REFUND ENTRIES (for cancelled raffles)
// ============================================

/**
 * Refund all entries for a cancelled raffle
 * Called when a raffle is transitioned to CANCELLED status
 */
export async function refundRaffleEntries(
  shop: string,
  raffleId: string
): Promise<{ refundedCount: number; totalPointsRefunded: number }> {
  console.log(`${LOG_PREFIX} refundRaffleEntries: raffle=${raffleId}`);

  const raffle = await prisma.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!raffle) {
    throw new Error("Raffle not found");
  }

  // Get all entries
  const entries = await prisma.raffleEntry.findMany({
    where: { raffleId },
  });

  let refundedCount = 0;
  let totalPointsRefunded = 0;

  // Refund each entry
  for (const entry of entries) {
    try {
      // Credit back the points using earnPoints with SYSTEM_ADJUSTMENT type
      await earnPoints({
        shop,
        customerId: entry.customerId,
        amount: entry.pointsSpent,
        type: "SYSTEM_ADJUSTMENT",
        description: `Refund for cancelled raffle: "${raffle.name}"`,
        metadata: { originalEntryId: entry.id, raffleId },
      });

      refundedCount++;
      totalPointsRefunded += entry.pointsSpent;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error refunding entry ${entry.id}:`, error);
    }
  }

  console.log(`${LOG_PREFIX} Refunded ${refundedCount} entries, total ${totalPointsRefunded} points`);

  return { refundedCount, totalPointsRefunded };
}

// ============================================
// FREE ENTRY CLAIMING
// ============================================

/**
 * Claim a daily free entry for a raffle
 * Uses the streak system's free entry tracking
 */
export async function claimDailyFreeEntry(
  shop: string,
  customerId: string,
  raffleId: string
): Promise<PurchaseEntriesResult> {
  console.log(`${LOG_PREFIX} claimDailyFreeEntry: customer=${customerId}, raffle=${raffleId}`);

  try {
    // 1. Get the raffle
    const raffle = await prisma.raffle.findFirst({
      where: { id: raffleId, shop },
    });

    if (!raffle) {
      return { success: false, error: "Raffle not found" };
    }

    // 2. Check raffle allows free entries
    if (raffle.dailyFreeEntries <= 0) {
      return { success: false, error: "Free entries are not enabled for this raffle" };
    }

    // 3. Check raffle status and timing
    if (raffle.status !== "ACTIVE") {
      return { success: false, error: "Raffle is not accepting entries" };
    }

    const now = new Date();
    if (now < raffle.startsAt) {
      return { success: false, error: "Raffle has not started yet" };
    }
    if (now > raffle.endsAt) {
      return { success: false, error: "Raffle has ended" };
    }

    // 4. Check entry limits
    const existingEntry = await prisma.raffleEntry.findFirst({
      where: { raffleId, customerId },
    });

    const currentEntries = existingEntry?.entriesCount || 0;
    if (currentEntries >= raffle.maxEntriesPerCustomer) {
      return {
        success: false,
        error: "You have reached the maximum entries for this raffle",
      };
    }

    // 5. Try to claim free entry from streak system
    const claimResult = await claimFreeEntry(shop, customerId);
    if (!claimResult.success) {
      return { success: false, error: claimResult.message };
    }

    // 6. Create/update entry record (free entry = 0 points, 1 entry)
    let entry;
    const isNewEntrant = !existingEntry;

    if (existingEntry) {
      entry = await prisma.raffleEntry.update({
        where: { id: existingEntry.id },
        data: {
          entriesCount: existingEntry.entriesCount + 1,
          isFreeEntry: true, // Mark that this entry includes free entries
        },
      });
    } else {
      entry = await prisma.raffleEntry.create({
        data: {
          raffleId,
          customerId,
          shop,
          entriesCount: 1,
          pointsSpent: 0,
          entryMultiplier: 1,
          isWinner: false,
          isFreeEntry: true,
        },
      });
    }

    // 7. Update raffle statistics
    await prisma.raffle.update({
      where: { id: raffleId },
      data: {
        totalEntries: raffle.totalEntries + 1,
        uniqueEntrants: isNewEntrant ? raffle.uniqueEntrants + 1 : raffle.uniqueEntrants,
        updatedAt: new Date(),
      },
    });

    console.log(`${LOG_PREFIX} Successfully claimed free entry for raffle ${raffleId}`);

    return {
      success: true,
      entryId: entry.id,
      entriesCount: 1,
      totalEntriesCount: entry.entriesCount,
      pointsSpent: 0,
      finalEntries: 1,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error claiming free entry:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An error occurred",
    };
  }
}
