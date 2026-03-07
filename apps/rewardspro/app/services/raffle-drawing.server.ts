/**
 * Raffle Drawing Service
 *
 * Implements the drawing algorithms and winner selection logic for raffles.
 * Supports three draw types:
 * - RANDOM: Pure random selection (each entry has equal chance)
 * - WEIGHTED: More entries = higher chance of winning
 * - FIFO: First entries win (early bird advantage)
 */

import * as crypto from "crypto";
import db from "../db.server";
import type { RaffleDrawType, RafflePrizeDeliveryStatus } from "./raffle-management.server";

/**
 * Cryptographically secure random number in [0, 1).
 * Replaces Math.random() for fair prize/winner selection.
 */
function cryptoRandom(): number {
  return crypto.randomBytes(4).readUInt32BE(0) / 0x100000000;
}

const LOG_PREFIX = "[RaffleDrawing]";

// ============================================
// TYPES
// ============================================

export interface DrawResult {
  success: boolean;
  error?: string;
  winnersSelected: number;
  winners: WinnerInfo[];
  failedPrizes: string[];
}

export interface WinnerInfo {
  winnerId: string;
  customerId: string;
  customerEmail: string;
  entryId: string;
  prizeId: string;
  prizeName: string;
  prizeType: string;
  winPosition: number;
}

interface EntryWithWeight {
  entryId: string;
  customerId: string;
  entriesCount: number;
  weight: number; // For weighted draws
  createdAt: Date; // For FIFO draws
}

interface PrizeToAward {
  prizeId: string;
  prizeName: string;
  prizeType: string;
  prizeValue: any;
  remainingQuantity: number;
  weight: number;
}

// ============================================
// MAIN DRAWING FUNCTION
// ============================================

/**
 * Execute the draw for a raffle
 *
 * This is the main entry point for drawing winners.
 * It will:
 * 1. Validate the raffle is ready for drawing
 * 2. Transition status to DRAWING
 * 3. Select winners based on draw type
 * 4. Assign prizes to winners
 * 5. Create winner records
 * 6. Transition status to COMPLETED
 */
export async function executeRaffleDraw(
  raffleId: string,
  shop: string
): Promise<DrawResult> {
  console.log(`${LOG_PREFIX} executeRaffleDraw starting for raffle: ${raffleId}`);

  try {
    // 1. Get raffle with prizes and entries
    const raffle = await db.raffle.findFirst({
      where: { id: raffleId, shop },
    });

    if (!raffle) {
      return { success: false, error: "Raffle not found", winnersSelected: 0, winners: [], failedPrizes: [] };
    }

    // 2. Validate raffle is ready for drawing
    if (!["CLOSED", "DRAWING"].includes(raffle.status)) {
      return {
        success: false,
        error: `Cannot draw raffle in ${raffle.status} status. Must be CLOSED or DRAWING.`,
        winnersSelected: 0,
        winners: [],
        failedPrizes: [],
      };
    }

    // 3. Get prizes
    const prizes = await db.rafflePrize.findMany({
      where: { raffleId },
      orderBy: { displayOrder: "asc" },
    });

    if (prizes.length === 0) {
      return { success: false, error: "No prizes configured for this raffle", winnersSelected: 0, winners: [], failedPrizes: [] };
    }

    // 4. Get all entries
    const entries = await db.raffleEntry.findMany({
      where: { raffleId },
      include: {
        customer: {
          select: { email: true },
        },
      },
    });

    if (entries.length === 0) {
      return { success: false, error: "No entries in this raffle", winnersSelected: 0, winners: [], failedPrizes: [] };
    }

    // 5. Transition to DRAWING status if not already
    if (raffle.status !== "DRAWING") {
      await db.raffle.update({
        where: { id: raffleId },
        data: { status: "DRAWING", updatedAt: new Date() },
      });
    }

    // 6. Calculate total prizes to award
    const totalPrizesToAward = prizes.reduce((sum, p: any) => sum + (p.quantity - p.quantityWon), 0);
    const winnersToSelect = Math.min(raffle.totalWinners, totalPrizesToAward, entries.length);

    console.log(`${LOG_PREFIX} Drawing ${winnersToSelect} winners from ${entries.length} entries`);

    // 7. Prepare entries for drawing
    const preparedEntries: EntryWithWeight[] = entries.map((e: any) => ({
      entryId: e.id,
      customerId: e.customerId,
      customerEmail: e.customer?.email || "unknown",
      entriesCount: e.entriesCount,
      weight: e.entriesCount * Number(e.entryMultiplier || 1),
      createdAt: e.createdAt,
    }));

    // 8. Prepare prizes for awarding
    const prizesToAward: PrizeToAward[] = prizes
      .filter((p: any) => p.quantity > p.quantityWon)
      .map((p: any) => ({
        prizeId: p.id,
        prizeName: p.name,
        prizeType: p.prizeType,
        prizeValue: p.prizeValue,
        remainingQuantity: p.quantity - p.quantityWon,
        weight: p.weight,
      }));

    // 9. Select winners based on draw type
    const selectedWinners = selectWinners(
      preparedEntries,
      winnersToSelect,
      raffle.drawType as RaffleDrawType
    );

    console.log(`${LOG_PREFIX} Selected ${selectedWinners.length} winners`);

    // 10. Assign prizes to winners and create records
    const winners: WinnerInfo[] = [];
    const failedPrizes: string[] = [];
    let winPosition = 1;

    for (const winner of selectedWinners) {
      // Find next available prize
      const prize = prizesToAward.find(p => p.remainingQuantity > 0);

      if (!prize) {
        console.log(`${LOG_PREFIX} No more prizes available for winner ${winner.customerId}`);
        break;
      }

      try {
        // Create winner record
        const winnerRecord = await db.raffleWinner.create({
          data: {
            raffleId,
            raffleEntryId: winner.entryId,
            rafflePrizeId: prize.prizeId,
            customerId: winner.customerId,
            shop,
            winPosition,
            deliveryStatus: "PENDING",
            selectedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Mark entry as winner
        await db.raffleEntry.update({
          where: { id: winner.entryId },
          data: { isWinner: true },
        });

        // Update prize quantity won
        await db.rafflePrize.update({
          where: { id: prize.prizeId },
          data: {
            quantityWon: { increment: 1 },
            updatedAt: new Date(),
          },
        });

        // Decrement local tracking
        prize.remainingQuantity--;

        winners.push({
          winnerId: winnerRecord.id,
          customerId: winner.customerId,
          customerEmail: (winner as any).customerEmail || "unknown",
          entryId: winner.entryId,
          prizeId: prize.prizeId,
          prizeName: prize.prizeName,
          prizeType: prize.prizeType,
          winPosition,
        });

        winPosition++;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error creating winner record:`, error);
        failedPrizes.push(prize.prizeId);
      }
    }

    // 11. Mark raffle as completed
    await db.raffle.update({
      where: { id: raffleId },
      data: {
        status: "COMPLETED",
        drawnAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`${LOG_PREFIX} Draw completed. ${winners.length} winners selected.`);

    return {
      success: true,
      winnersSelected: winners.length,
      winners,
      failedPrizes,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error executing draw:`, error);

    // Try to revert status if possible
    try {
      await db.raffle.update({
        where: { id: raffleId },
        data: { status: "CLOSED", updatedAt: new Date() },
      });
    } catch (e) {
      // Ignore revert errors
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Draw failed",
      winnersSelected: 0,
      winners: [],
      failedPrizes: [],
    };
  }
}

// ============================================
// WINNER SELECTION ALGORITHMS
// ============================================

/**
 * Select winners based on draw type
 */
function selectWinners(
  entries: EntryWithWeight[],
  count: number,
  drawType: RaffleDrawType
): EntryWithWeight[] {
  switch (drawType) {
    case "RANDOM":
      return selectRandomWinners(entries, count);
    case "WEIGHTED":
      return selectWeightedWinners(entries, count);
    case "FIFO":
      return selectFifoWinners(entries, count);
    default:
      console.warn(`${LOG_PREFIX} Unknown draw type: ${drawType}, falling back to RANDOM`);
      return selectRandomWinners(entries, count);
  }
}

/**
 * RANDOM selection - each entry has equal chance
 * Uses Fisher-Yates shuffle for fairness
 */
function selectRandomWinners(
  entries: EntryWithWeight[],
  count: number
): EntryWithWeight[] {
  console.log(`${LOG_PREFIX} Selecting ${count} winners using RANDOM algorithm`);

  // Create a pool with one slot per entry
  const pool: EntryWithWeight[] = [];
  for (const entry of entries) {
    // Each entry count gives one chance
    for (let i = 0; i < entry.entriesCount; i++) {
      pool.push(entry);
    }
  }

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(cryptoRandom() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Select unique winners (one win per customer)
  const winners: EntryWithWeight[] = [];
  const selectedCustomers = new Set<string>();

  for (const entry of pool) {
    if (selectedCustomers.has(entry.customerId)) continue;

    winners.push(entry);
    selectedCustomers.add(entry.customerId);

    if (winners.length >= count) break;
  }

  return winners;
}

/**
 * WEIGHTED selection - more entries = higher chance
 * Uses weighted random selection
 */
function selectWeightedWinners(
  entries: EntryWithWeight[],
  count: number
): EntryWithWeight[] {
  console.log(`${LOG_PREFIX} Selecting ${count} winners using WEIGHTED algorithm`);

  const winners: EntryWithWeight[] = [];
  const selectedCustomers = new Set<string>();
  const remainingEntries = [...entries];

  while (winners.length < count && remainingEntries.length > 0) {
    // Calculate total weight of remaining entries
    const totalWeight = remainingEntries.reduce((sum, e) => sum + e.weight, 0);

    if (totalWeight === 0) break;

    // Generate random value
    let randomValue = cryptoRandom() * totalWeight;

    // Find the selected entry
    let selectedIndex = -1;
    for (let i = 0; i < remainingEntries.length; i++) {
      randomValue -= remainingEntries[i].weight;
      if (randomValue <= 0) {
        selectedIndex = i;
        break;
      }
    }

    if (selectedIndex === -1) {
      selectedIndex = remainingEntries.length - 1;
    }

    const selected = remainingEntries[selectedIndex];

    // Skip if customer already won
    if (!selectedCustomers.has(selected.customerId)) {
      winners.push(selected);
      selectedCustomers.add(selected.customerId);
    }

    // Remove selected from remaining (regardless of whether they won, to prevent infinite loop)
    remainingEntries.splice(selectedIndex, 1);
  }

  return winners;
}

/**
 * FIFO selection - first entries win
 * Simply sort by creation time and take first N unique customers
 */
function selectFifoWinners(
  entries: EntryWithWeight[],
  count: number
): EntryWithWeight[] {
  console.log(`${LOG_PREFIX} Selecting ${count} winners using FIFO algorithm`);

  // Sort by creation time (earliest first)
  const sorted = [...entries].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const winners: EntryWithWeight[] = [];
  const selectedCustomers = new Set<string>();

  for (const entry of sorted) {
    if (selectedCustomers.has(entry.customerId)) continue;

    winners.push(entry);
    selectedCustomers.add(entry.customerId);

    if (winners.length >= count) break;
  }

  return winners;
}

// ============================================
// WINNER MANAGEMENT FUNCTIONS
// ============================================

/**
 * Get all winners for a raffle
 */
export async function getRaffleWinners(
  raffleId: string,
  shop: string
): Promise<any[]> {
  console.log(`${LOG_PREFIX} getRaffleWinners: ${raffleId}`);

  const winners = await db.raffleWinner.findMany({
    where: { raffleId, shop },
    orderBy: { winPosition: "asc" },
    include: {
      customer: {
        select: { email: true, firstName: true, lastName: true },
      },
      prize: {
        select: { name: true, prizeType: true, prizeValue: true },
      },
    },
  });

  return winners.map((w: any) => ({
    id: w.id,
    winPosition: w.winPosition,
    customerId: w.customerId,
    customerEmail: w.customer?.email || "Unknown",
    customerName: [w.customer?.firstName, w.customer?.lastName].filter(Boolean).join(" ") || null,
    prizeId: w.rafflePrizeId,
    prizeName: w.prize?.name || "Unknown Prize",
    prizeType: w.prize?.prizeType || "CUSTOM",
    prizeValue: w.prize?.prizeValue || {},
    deliveryStatus: w.deliveryStatus,
    deliveredAt: w.deliveredAt,
    deliveryNotes: w.deliveryNotes,
    discountCode: w.discountCode,
    notifiedAt: w.notifiedAt,
    claimedAt: w.claimedAt,
    selectedAt: w.selectedAt,
  }));
}

/**
 * Update winner delivery status
 */
export async function updateWinnerDeliveryStatus(
  winnerId: string,
  status: RafflePrizeDeliveryStatus,
  details?: {
    discountCode?: string;
    storeCreditId?: string;
    pointsLedgerId?: string;
    deliveryNotes?: string;
  }
): Promise<any> {
  console.log(`${LOG_PREFIX} updateWinnerDeliveryStatus: ${winnerId} -> ${status}`);

  const updateData: any = {
    deliveryStatus: status,
    updatedAt: new Date(),
  };

  if (status === "DELIVERED") {
    updateData.deliveredAt = new Date();
  }

  if (details?.discountCode) updateData.discountCode = details.discountCode;
  if (details?.storeCreditId) updateData.storeCreditId = details.storeCreditId;
  if (details?.pointsLedgerId) updateData.pointsLedgerId = details.pointsLedgerId;
  if (details?.deliveryNotes) updateData.deliveryNotes = details.deliveryNotes;

  const winner = await db.raffleWinner.update({
    where: { id: winnerId },
    data: updateData,
  });

  return winner;
}

/**
 * Mark winner as notified
 */
export async function markWinnerNotified(winnerId: string): Promise<void> {
  await db.raffleWinner.update({
    where: { id: winnerId },
    data: {
      notifiedAt: new Date(),
      notifyAttempts: { increment: 1 },
      updatedAt: new Date(),
    },
  });
}

/**
 * Mark winner as claimed (acknowledged receipt)
 */
export async function markWinnerClaimed(winnerId: string): Promise<void> {
  await db.raffleWinner.update({
    where: { id: winnerId },
    data: {
      claimedAt: new Date(),
      deliveryStatus: "CLAIMED",
      updatedAt: new Date(),
    },
  });
}

// ============================================
// PREVIEW / SIMULATION
// ============================================

/**
 * Preview the draw without actually executing it
 * Useful for testing the algorithm before going live
 */
export async function previewRaffleDraw(
  raffleId: string,
  shop: string
): Promise<{
  totalEntries: number;
  uniqueEntrants: number;
  prizesAvailable: number;
  winnersToSelect: number;
  drawType: string;
  simulatedWinners: Array<{
    customerId: string;
    customerEmail: string;
    entriesCount: number;
    prize: string;
  }>;
}> {
  console.log(`${LOG_PREFIX} previewRaffleDraw: ${raffleId}`);

  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!raffle) {
    throw new Error("Raffle not found");
  }

  const prizes = await db.rafflePrize.findMany({
    where: { raffleId },
    orderBy: { displayOrder: "asc" },
  });

  const entries = await db.raffleEntry.findMany({
    where: { raffleId },
    include: {
      customer: {
        select: { email: true },
      },
    },
  });

  const totalPrizesToAward = prizes.reduce((sum, p: any) => sum + (p.quantity - p.quantityWon), 0);
  const winnersToSelect = Math.min(raffle.totalWinners, totalPrizesToAward, entries.length);

  // Simulate the draw
  const preparedEntries: EntryWithWeight[] = entries.map((e: any) => ({
    entryId: e.id,
    customerId: e.customerId,
    customerEmail: e.customer?.email || "unknown",
    entriesCount: e.entriesCount,
    weight: e.entriesCount * Number(e.entryMultiplier || 1),
    createdAt: e.createdAt,
  }));

  const simulatedWinners = selectWinners(
    preparedEntries,
    winnersToSelect,
    raffle.drawType as RaffleDrawType
  );

  // Assign simulated prizes
  const prizesToAward = prizes
    .filter((p: any) => p.quantity > p.quantityWon)
    .map((p: any) => ({
      name: p.name,
      remaining: p.quantity - p.quantityWon,
    }));

  const result = simulatedWinners.map((w, i) => ({
    customerId: w.customerId,
    customerEmail: (w as any).customerEmail,
    entriesCount: w.entriesCount,
    prize: prizesToAward[i % prizesToAward.length]?.name || "No prize available",
  }));

  return {
    totalEntries: raffle.totalEntries,
    uniqueEntrants: raffle.uniqueEntrants,
    prizesAvailable: totalPrizesToAward,
    winnersToSelect,
    drawType: raffle.drawType,
    simulatedWinners: result,
  };
}
