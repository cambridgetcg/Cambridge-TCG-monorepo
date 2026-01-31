/**
 * Raffle Management Service
 *
 * Handles CRUD operations for raffles, prizes, entries, and winners.
 * This service provides the foundational operations for the raffles system.
 */

import db from "../db.server";

const LOG_PREFIX = "[RaffleManagement]";

// Type definitions (matching Prisma schema enums)
export type RaffleStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "DRAWING" | "COMPLETED" | "CANCELLED";
export type RaffleDrawType = "RANDOM" | "WEIGHTED" | "FIFO";
export type RafflePrizeType = "DISCOUNT" | "STORE_CREDIT" | "PRODUCT" | "POINTS" | "CUSTOM";
export type RafflePrizeDeliveryStatus = "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED" | "CLAIMED";

// ============================================
// TYPES
// ============================================

export interface RafflePrizeValue {
  // For DISCOUNT prizes
  type?: "percentage" | "fixed";
  value?: number;
  maxUses?: number;
  // For STORE_CREDIT prizes
  amount?: number; // in cents
  // For PRODUCT prizes
  productId?: string;
  variantId?: string;
  quantity?: number;
  // For POINTS prizes (uses amount)
  // For CUSTOM prizes
  fulfillmentInstructions?: string;
}

export interface CreateRaffleInput {
  shop: string;
  name: string;
  description?: string;
  imageUrl?: string;
  startsAt: Date;
  endsAt: Date;
  drawAt?: Date;
  entryCost?: number;
  maxEntriesTotal?: number;
  maxEntriesPerCustomer?: number;
  drawType?: RaffleDrawType;
  totalWinners?: number;
  isPublic?: boolean;
  tierRestrictions?: { allowedTierIds: string[] } | null;
  minimumTier?: string;
}

export interface UpdateRaffleInput {
  name?: string;
  description?: string;
  imageUrl?: string;
  status?: RaffleStatus;
  startsAt?: Date;
  endsAt?: Date;
  drawAt?: Date;
  entryCost?: number;
  maxEntriesTotal?: number;
  maxEntriesPerCustomer?: number;
  drawType?: RaffleDrawType;
  totalWinners?: number;
  isPublic?: boolean;
  tierRestrictions?: { allowedTierIds: string[] } | null;
  minimumTier?: string;
}

export interface CreateRafflePrizeInput {
  raffleId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  prizeType: RafflePrizeType;
  prizeValue: RafflePrizeValue;
  quantity?: number;
  displayOrder?: number;
  weight?: number;
}

export interface UpdateRafflePrizeInput {
  name?: string;
  description?: string;
  imageUrl?: string;
  prizeType?: RafflePrizeType;
  prizeValue?: RafflePrizeValue;
  quantity?: number;
  displayOrder?: number;
  weight?: number;
}

// ============================================
// RAFFLE CRUD OPERATIONS
// ============================================

/**
 * Get all raffles for a shop with optional filtering
 */
export async function getRaffles(
  shop: string,
  options?: {
    status?: RaffleStatus | RaffleStatus[];
    includeCompleted?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<any[]> {
  console.log(`${LOG_PREFIX} getRaffles for shop: ${shop}`);

  const where: any = { shop };

  // Filter by status if provided
  if (options?.status) {
    if (Array.isArray(options.status)) {
      where.status = { in: options.status };
    } else {
      where.status = options.status;
    }
  } else if (!options?.includeCompleted) {
    // By default, exclude completed and cancelled raffles
    where.status = { notIn: ["COMPLETED", "CANCELLED"] };
  }

  const raffles = await db.raffle.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });

  console.log(`${LOG_PREFIX} Found ${raffles.length} raffles`);
  return raffles;
}

/**
 * Get a single raffle by ID
 */
export async function getRaffle(
  raffleId: string,
  shop: string
): Promise<any | null> {
  console.log(`${LOG_PREFIX} getRaffle: ${raffleId}`);

  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  return raffle;
}

/**
 * Get raffle with all related data (prizes, entries count)
 */
export async function getRaffleWithDetails(
  raffleId: string,
  shop: string
): Promise<any | null> {
  console.log(`${LOG_PREFIX} getRaffleWithDetails: ${raffleId}`);

  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!raffle) return null;

  // Get prizes
  const prizes = await db.rafflePrize.findMany({
    where: { raffleId },
    orderBy: { displayOrder: "asc" },
  });

  // Get entry count (since we have denormalized stats, just use those)
  return {
    ...raffle,
    prizes,
  };
}

/**
 * Create a new raffle
 */
export async function createRaffle(input: CreateRaffleInput): Promise<any> {
  console.log(`${LOG_PREFIX} createRaffle: ${input.name}`);

  const raffle = await db.raffle.create({
    data: {
      shop: input.shop,
      name: input.name,
      description: input.description || null,
      imageUrl: input.imageUrl || null,
      status: "DRAFT",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      drawAt: input.drawAt || null,
      entryCost: input.entryCost ?? 100,
      maxEntriesTotal: input.maxEntriesTotal || null,
      maxEntriesPerCustomer: input.maxEntriesPerCustomer ?? 10,
      drawType: input.drawType ?? "RANDOM",
      totalWinners: input.totalWinners ?? 1,
      isPublic: input.isPublic ?? true,
      tierRestrictions: input.tierRestrictions || null,
      minimumTier: input.minimumTier || null,
      totalEntries: 0,
      uniqueEntrants: 0,
      totalPrizePool: 0,
      updatedAt: new Date(),
    },
  });

  console.log(`${LOG_PREFIX} Created raffle: ${raffle.id}`);
  return raffle;
}

/**
 * Update a raffle
 */
export async function updateRaffle(
  raffleId: string,
  shop: string,
  input: UpdateRaffleInput
): Promise<any> {
  console.log(`${LOG_PREFIX} updateRaffle: ${raffleId}`);

  // Verify raffle belongs to shop
  const existing = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!existing) {
    throw new Error("Raffle not found");
  }

  // Build update data
  const updateData: any = { updatedAt: new Date() };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.startsAt !== undefined) updateData.startsAt = input.startsAt;
  if (input.endsAt !== undefined) updateData.endsAt = input.endsAt;
  if (input.drawAt !== undefined) updateData.drawAt = input.drawAt;
  if (input.entryCost !== undefined) updateData.entryCost = input.entryCost;
  if (input.maxEntriesTotal !== undefined) updateData.maxEntriesTotal = input.maxEntriesTotal;
  if (input.maxEntriesPerCustomer !== undefined) updateData.maxEntriesPerCustomer = input.maxEntriesPerCustomer;
  if (input.drawType !== undefined) updateData.drawType = input.drawType;
  if (input.totalWinners !== undefined) updateData.totalWinners = input.totalWinners;
  if (input.isPublic !== undefined) updateData.isPublic = input.isPublic;
  if (input.tierRestrictions !== undefined) updateData.tierRestrictions = input.tierRestrictions;
  if (input.minimumTier !== undefined) updateData.minimumTier = input.minimumTier;

  const raffle = await db.raffle.update({
    where: { id: raffleId },
    data: updateData,
  });

  console.log(`${LOG_PREFIX} Updated raffle: ${raffle.id}`);
  return raffle;
}

/**
 * Delete a raffle (only if in DRAFT status)
 */
export async function deleteRaffle(
  raffleId: string,
  shop: string
): Promise<boolean> {
  console.log(`${LOG_PREFIX} deleteRaffle: ${raffleId}`);

  const existing = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!existing) {
    throw new Error("Raffle not found");
  }

  if (existing.status !== "DRAFT") {
    throw new Error("Can only delete raffles in DRAFT status");
  }

  await db.raffle.delete({
    where: { id: raffleId },
  });

  console.log(`${LOG_PREFIX} Deleted raffle: ${raffleId}`);
  return true;
}

// ============================================
// RAFFLE PRIZE CRUD OPERATIONS
// ============================================

/**
 * Get all prizes for a raffle
 */
export async function getRafflePrizes(raffleId: string): Promise<any[]> {
  console.log(`${LOG_PREFIX} getRafflePrizes for raffle: ${raffleId}`);

  const prizes = await db.rafflePrize.findMany({
    where: { raffleId },
    orderBy: { displayOrder: "asc" },
  });

  return prizes;
}

/**
 * Create a new prize for a raffle
 */
export async function createRafflePrize(input: CreateRafflePrizeInput): Promise<any> {
  console.log(`${LOG_PREFIX} createRafflePrize for raffle: ${input.raffleId}`);

  const prize = await db.rafflePrize.create({
    data: {
      raffleId: input.raffleId,
      name: input.name,
      description: input.description || null,
      imageUrl: input.imageUrl || null,
      prizeType: input.prizeType,
      prizeValue: input.prizeValue,
      quantity: input.quantity ?? 1,
      quantityWon: 0,
      displayOrder: input.displayOrder ?? 0,
      weight: input.weight ?? 100,
      updatedAt: new Date(),
    },
  });

  console.log(`${LOG_PREFIX} Created prize: ${prize.id}`);
  return prize;
}

/**
 * Update a raffle prize
 */
export async function updateRafflePrize(
  prizeId: string,
  input: UpdateRafflePrizeInput
): Promise<any> {
  console.log(`${LOG_PREFIX} updateRafflePrize: ${prizeId}`);

  const updateData: any = { updatedAt: new Date() };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
  if (input.prizeType !== undefined) updateData.prizeType = input.prizeType;
  if (input.prizeValue !== undefined) updateData.prizeValue = input.prizeValue;
  if (input.quantity !== undefined) updateData.quantity = input.quantity;
  if (input.displayOrder !== undefined) updateData.displayOrder = input.displayOrder;
  if (input.weight !== undefined) updateData.weight = input.weight;

  const prize = await db.rafflePrize.update({
    where: { id: prizeId },
    data: updateData,
  });

  console.log(`${LOG_PREFIX} Updated prize: ${prize.id}`);
  return prize;
}

/**
 * Delete a raffle prize
 */
export async function deleteRafflePrize(prizeId: string): Promise<boolean> {
  console.log(`${LOG_PREFIX} deleteRafflePrize: ${prizeId}`);

  await db.rafflePrize.delete({
    where: { id: prizeId },
  });

  console.log(`${LOG_PREFIX} Deleted prize: ${prizeId}`);
  return true;
}

// ============================================
// RAFFLE STATUS MANAGEMENT
// ============================================

/**
 * Transition a raffle to a new status with validation
 */
export async function transitionRaffleStatus(
  raffleId: string,
  shop: string,
  newStatus: RaffleStatus
): Promise<any> {
  console.log(`${LOG_PREFIX} transitionRaffleStatus: ${raffleId} -> ${newStatus}`);

  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!raffle) {
    throw new Error("Raffle not found");
  }

  // Validate status transitions
  const validTransitions: Record<string, string[]> = {
    DRAFT: ["SCHEDULED", "ACTIVE", "CANCELLED"],
    SCHEDULED: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["CLOSED", "CANCELLED"],
    CLOSED: ["DRAWING", "CANCELLED"],
    DRAWING: ["COMPLETED"],
    COMPLETED: [], // Terminal state
    CANCELLED: [], // Terminal state
  };

  const allowedTransitions = validTransitions[raffle.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${raffle.status} -> ${newStatus}. Allowed: ${allowedTransitions.join(", ")}`
    );
  }

  // Additional validation for specific transitions
  if (newStatus === "ACTIVE") {
    // Verify raffle has at least one prize
    const prizeCount = await db.rafflePrize.count({
      where: { raffleId },
    });
    if (prizeCount === 0) {
      throw new Error("Cannot activate raffle without prizes");
    }
  }

  const updateData: any = {
    status: newStatus,
    updatedAt: new Date(),
  };

  // Set drawnAt timestamp when completing draw
  if (newStatus === "COMPLETED") {
    updateData.drawnAt = new Date();
  }

  const updated = await db.raffle.update({
    where: { id: raffleId },
    data: updateData,
  });

  // Refund entries if raffle is cancelled
  if (newStatus === "CANCELLED" && raffle.totalEntries > 0) {
    console.log(`${LOG_PREFIX} Raffle cancelled with entries, triggering refunds...`);
    // Import dynamically to avoid circular dependencies
    const { refundRaffleEntries } = await import("./raffle-entry.server");
    try {
      const refundResult = await refundRaffleEntries(shop, raffleId);
      console.log(`${LOG_PREFIX} Refunded ${refundResult.refundedCount} entries, ${refundResult.totalPointsRefunded} points`);
    } catch (refundError) {
      console.error(`${LOG_PREFIX} Error refunding entries:`, refundError);
      // Don't fail the status transition if refund fails
    }
  }

  console.log(`${LOG_PREFIX} Transitioned raffle ${raffleId}: ${raffle.status} -> ${newStatus}`);
  return updated;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get raffle statistics for a shop
 */
export async function getRaffleStats(shop: string): Promise<{
  totalRaffles: number;
  activeRaffles: number;
  totalEntries: number;
  totalPrizePoolValue: number;
}> {
  console.log(`${LOG_PREFIX} getRaffleStats for shop: ${shop}`);

  // Get total raffles
  const totalRaffles = await db.raffle.count({ where: { shop } });

  // Get active raffles
  const activeRaffles = await db.raffle.count({
    where: { shop, status: "ACTIVE" },
  });

  // Get aggregate stats from all raffles
  const raffles = await db.raffle.findMany({
    where: { shop },
    select: { totalEntries: true, totalPrizePool: true },
  });

  const totalEntries = raffles.reduce((sum, r) => sum + (r.totalEntries || 0), 0);
  const totalPrizePoolValue = raffles.reduce((sum, r) => sum + (r.totalPrizePool || 0), 0);

  return {
    totalRaffles,
    activeRaffles,
    totalEntries,
    totalPrizePoolValue,
  };
}

/**
 * Check if a customer is eligible to enter a raffle
 */
export async function checkRaffleEligibility(
  raffleId: string,
  customerId: string,
  shop: string
): Promise<{
  eligible: boolean;
  reason?: string;
  currentEntries: number;
  maxEntries: number;
}> {
  console.log(`${LOG_PREFIX} checkRaffleEligibility: raffle=${raffleId}, customer=${customerId}`);

  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
  });

  if (!raffle) {
    return { eligible: false, reason: "Raffle not found", currentEntries: 0, maxEntries: 0 };
  }

  if (raffle.status !== "ACTIVE") {
    return {
      eligible: false,
      reason: "Raffle is not accepting entries",
      currentEntries: 0,
      maxEntries: raffle.maxEntriesPerCustomer,
    };
  }

  const now = new Date();
  if (now < raffle.startsAt) {
    return {
      eligible: false,
      reason: "Raffle has not started yet",
      currentEntries: 0,
      maxEntries: raffle.maxEntriesPerCustomer,
    };
  }

  if (now > raffle.endsAt) {
    return {
      eligible: false,
      reason: "Raffle has ended",
      currentEntries: 0,
      maxEntries: raffle.maxEntriesPerCustomer,
    };
  }

  // Check customer's current entries
  const existingEntry = await db.raffleEntry.findFirst({
    where: { raffleId, customerId },
  });

  const currentEntries = existingEntry?.entriesCount || 0;

  if (currentEntries >= raffle.maxEntriesPerCustomer) {
    return {
      eligible: false,
      reason: "Maximum entries reached",
      currentEntries,
      maxEntries: raffle.maxEntriesPerCustomer,
    };
  }

  // Check total entries limit
  if (raffle.maxEntriesTotal && raffle.totalEntries >= raffle.maxEntriesTotal) {
    return {
      eligible: false,
      reason: "Raffle is full",
      currentEntries,
      maxEntries: raffle.maxEntriesPerCustomer,
    };
  }

  // Check tier restrictions
  if (raffle.tierRestrictions || raffle.minimumTier) {
    const { resolveEffectiveTier } = await import("./tier-resolution.server");
    const tierResult = await resolveEffectiveTier(shop, customerId);

    // Check allowedTierIds list
    if (raffle.tierRestrictions) {
      const restrictions = raffle.tierRestrictions as { allowedTierIds?: string[] };
      if (restrictions.allowedTierIds?.length) {
        if (!tierResult.effectiveTierId) {
          return {
            eligible: false,
            reason: "You need a membership tier to enter this raffle",
            currentEntries,
            maxEntries: raffle.maxEntriesPerCustomer,
          };
        }
        if (!restrictions.allowedTierIds.includes(tierResult.effectiveTierId)) {
          return {
            eligible: false,
            reason: "This raffle is restricted to specific tiers",
            currentEntries,
            maxEntries: raffle.maxEntriesPerCustomer,
          };
        }
      }
    }

    // Check minimumTier requirement
    if (raffle.minimumTier) {
      if (!tierResult.effectiveTierId) {
        const minimumTier = await db.tier.findUnique({ where: { id: raffle.minimumTier } });
        return {
          eligible: false,
          reason: `Requires ${minimumTier?.name || 'a membership'} tier or above`,
          currentEntries,
          maxEntries: raffle.maxEntriesPerCustomer,
        };
      }

      if (tierResult.effectiveTierId !== raffle.minimumTier) {
        // Check tier hierarchy - compare minSpend values
        const [customerTier, minimumTier] = await Promise.all([
          db.tier.findUnique({ where: { id: tierResult.effectiveTierId } }),
          db.tier.findUnique({ where: { id: raffle.minimumTier } }),
        ]);

        if (!customerTier || !minimumTier || customerTier.minSpend < minimumTier.minSpend) {
          return {
            eligible: false,
            reason: `Requires ${minimumTier?.name || 'higher'} tier or above`,
            currentEntries,
            maxEntries: raffle.maxEntriesPerCustomer,
          };
        }
      }
    }
  }

  return {
    eligible: true,
    currentEntries,
    maxEntries: raffle.maxEntriesPerCustomer,
  };
}
