/**
 * Raffle Entry Service
 *
 * Handles customer raffle entries, including:
 * - Purchasing entries with points
 * - Validating eligibility
 * - Tracking entries and updating stats
 */

import db from "../db.server";
import { spendPoints, earnPoints, getPointsBalance, adjustPoints } from "./points-ledger.server";
import { checkRaffleEligibility, type RaffleStatus } from "./raffle-management.server";
import { trackRaffleEntered, trackPointsSpent } from "./klaviyo-events.server";

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
    const raffle = await db.raffle.findFirst({
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
    const existingEntry = await db.raffleEntry.findFirst({
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

    // 4. Calculate points cost
    const pointsCost = raffle.entryCost * quantity;

    // 5. Check customer has sufficient points
    const currentBalance = await getPointsBalance(shop, customerId);
    if (currentBalance < pointsCost) {
      return {
        success: false,
        error: `Insufficient points. You need ${pointsCost} but only have ${currentBalance}`,
      };
    }

    // 6. Process the purchase in a transaction-like manner
    // First, create/update the entry record
    let entry;
    const isNewEntrant = !existingEntry;

    if (existingEntry) {
      // Update existing entry
      entry = await db.raffleEntry.update({
        where: { id: existingEntry.id },
        data: {
          entriesCount: existingEntry.entriesCount + quantity,
          pointsSpent: existingEntry.pointsSpent + pointsCost,
        },
      });
    } else {
      // Create new entry
      entry = await db.raffleEntry.create({
        data: {
          raffleId,
          customerId,
          shop,
          entriesCount: quantity,
          pointsSpent: pointsCost,
          entryMultiplier: tierMultiplier,
          isWinner: false,
        },
      });
    }

    // 7. Record points transaction (deduct points)
    await spendPoints({
      shop,
      customerId,
      amount: pointsCost, // spendPoints takes positive amount
      type: "RAFFLE_ENTRY",
      description: `Purchased ${quantity} ${quantity === 1 ? "entry" : "entries"} for "${raffle.name}"`,
      raffleEntryId: entry.id,
    });

    // 8. Update raffle statistics
    await db.raffle.update({
      where: { id: raffleId },
      data: {
        totalEntries: raffle.totalEntries + quantity,
        uniqueEntrants: isNewEntrant ? raffle.uniqueEntrants + 1 : raffle.uniqueEntrants,
        totalPrizePool: raffle.totalPrizePool + pointsCost,
        updatedAt: new Date(),
      },
    });

    // 9. Get updated balance
    const newBalance = await getPointsBalance(shop, customerId);

    console.log(`${LOG_PREFIX} Successfully purchased ${quantity} entries for raffle ${raffleId}`);

    // 10. Dispatch Klaviyo events for marketing automation
    // Run async without blocking the response
    (async () => {
      try {
        // Get customer with tier for event tracking
        const customer = await db.customer.findUnique({
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
              totalEntries: raffle.totalEntries + quantity,
            },
            quantity,
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
      newBalance,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error purchasing entries:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An error occurred",
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

  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!raffle) return null;

  const entry = await db.raffleEntry.findFirst({
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
  const raffles = await db.raffle.findMany({
    where: {
      shop,
      isPublic: true,
      status: { in: ["SCHEDULED", "ACTIVE"] },
    },
    orderBy: { startsAt: "asc" },
  });

  // Get customer's entries for these raffles
  const raffleIds = raffles.map((r: any) => r.id);
  const entries = await db.raffleEntry.findMany({
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
 * Get a customer's raffle entry history
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
  createdAt: Date;
}>> {
  console.log(`${LOG_PREFIX} getCustomerRaffleHistory: customer=${customerId}`);

  const whereClause: any = {
    shop,
    customerId,
  };

  // Get entries with raffle info
  const entries = await db.raffleEntry.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: options?.limit || 20,
  });

  // Get raffle details for each entry
  const raffleIds = [...new Set(entries.map((e: any) => e.raffleId))];
  const raffles = await db.raffle.findMany({
    where: { id: { in: raffleIds } },
  });
  const raffleMap = new Map(raffles.map((r: any) => [r.id, r]));

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
    return {
      entryId: entry.id,
      raffleId: entry.raffleId,
      raffleName: raffle?.name || "Unknown Raffle",
      raffleStatus: (raffle?.status || "COMPLETED") as RaffleStatus,
      entriesCount: entry.entriesCount,
      pointsSpent: entry.pointsSpent,
      isWinner: entry.isWinner,
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

  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!raffle) {
    throw new Error("Raffle not found");
  }

  // Get all entries
  const entries = await db.raffleEntry.findMany({
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
