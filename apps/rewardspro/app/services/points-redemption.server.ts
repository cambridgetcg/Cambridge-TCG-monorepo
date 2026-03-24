// DEPRECATED: Points can no longer be redeemed for discount codes.
// Points are now spent exclusively on raffles and mystery boxes.
// This file is kept for reference and for any historical redemption queries.

/**
 * Points Redemption Service
 *
 * @deprecated Points can no longer be redeemed for discount codes.
 *
 * Handles the conversion of points to discounts/rewards.
 * This service manages:
 * - Redemption tier configuration
 * - Discount code generation
 * - Redemption tracking
 * - Shopify discount integration
 *
 * Redemption Types:
 * - Fixed discount ($5, $10, etc.)
 * - Percentage discount (10%, 15%, etc.)
 * - Free shipping
 * - Free product (future)
 */

import prisma from "~/db.server";
import { spendPoints, hasEnoughPoints } from "./points-ledger.server";
import { getPointsConfig, getCurrencyBranding } from "./points-config.server";
import type { Prisma } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export type RedemptionType = "FIXED_DISCOUNT" | "PERCENTAGE_DISCOUNT" | "FREE_SHIPPING" | "FREE_PRODUCT";

export interface RedemptionTier {
  id: string;
  name: string;
  pointsCost: number;
  type: RedemptionType;
  value: number; // Dollar amount for FIXED, percentage for PERCENTAGE
  isActive: boolean;
  minOrderAmount?: number;
  maxUsesPerCustomer?: number;
  validDays?: number; // Days until discount expires
  productId?: string; // For FREE_PRODUCT type
  metadata?: Record<string, unknown>;
}

export interface RedemptionResult {
  success: boolean;
  redemptionId?: string;
  discountCode?: string;
  discountAmount?: number;
  discountType?: RedemptionType;
  expiresAt?: Date;
  pointsSpent?: number;
  remainingBalance?: number;
  error?: string;
}

export interface Redemption {
  id: string;
  customerId: string;
  shop: string;
  tierId: string;
  tierName: string;
  pointsSpent: number;
  discountCode: string;
  discountType: RedemptionType;
  discountValue: number;
  status: "PENDING" | "USED" | "EXPIRED" | "CANCELLED";
  shopifyDiscountId?: string;
  usedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

// ============================================
// DEFAULT REDEMPTION TIERS
// ============================================

const DEFAULT_REDEMPTION_TIERS: RedemptionTier[] = [
  {
    id: "tier_500",
    name: "$5 Off",
    pointsCost: 500,
    type: "FIXED_DISCOUNT",
    value: 5,
    isActive: true,
    validDays: 30,
  },
  {
    id: "tier_1000",
    name: "$10 Off",
    pointsCost: 1000,
    type: "FIXED_DISCOUNT",
    value: 10,
    isActive: true,
    validDays: 30,
  },
  {
    id: "tier_2500",
    name: "$25 Off",
    pointsCost: 2500,
    type: "FIXED_DISCOUNT",
    value: 25,
    isActive: true,
    validDays: 30,
  },
  {
    id: "tier_5000",
    name: "$50 Off",
    pointsCost: 5000,
    type: "FIXED_DISCOUNT",
    value: 50,
    isActive: true,
    validDays: 30,
  },
  {
    id: "tier_freeship",
    name: "Free Shipping",
    pointsCost: 750,
    type: "FREE_SHIPPING",
    value: 0,
    isActive: true,
    validDays: 30,
  },
];

// ============================================
// TIER MANAGEMENT
// ============================================

/**
 * Get redemption tiers from shop settings
 */
async function getStoredTiers(shop: string): Promise<RedemptionTier[]> {
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { metadata: true },
  });

  const metadata = settings?.metadata as Record<string, unknown> | null;
  const tiers = metadata?.pointsRedemptionTiers as RedemptionTier[] | undefined;

  return tiers || DEFAULT_REDEMPTION_TIERS;
}

/**
 * Save redemption tiers to shop settings
 */
async function saveStoredTiers(shop: string, tiers: RedemptionTier[]): Promise<void> {
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { metadata: true },
  });

  const metadata = (settings?.metadata as Record<string, unknown>) || {};

  await prisma.shopSettings.update({
    where: { shop },
    data: {
      metadata: {
        ...metadata,
        pointsRedemptionTiers: tiers,
      } as unknown as Prisma.JsonValue,
    },
  });
}

/**
 * Get all redemption tiers for a shop
 */
export async function getRedemptionTiers(
  shop: string,
  options?: { includeInactive?: boolean }
): Promise<RedemptionTier[]> {
  let tiers = await getStoredTiers(shop);

  if (!options?.includeInactive) {
    tiers = tiers.filter((t) => t.isActive);
  }

  return tiers.sort((a, b) => a.pointsCost - b.pointsCost);
}

/**
 * Get a specific redemption tier
 */
export async function getRedemptionTier(
  shop: string,
  tierId: string
): Promise<RedemptionTier | null> {
  const tiers = await getStoredTiers(shop);
  return tiers.find((t) => t.id === tierId) || null;
}

/**
 * Create a new redemption tier
 */
export async function createRedemptionTier(
  shop: string,
  tier: Omit<RedemptionTier, "id">
): Promise<RedemptionTier> {
  const tiers = await getStoredTiers(shop);

  const newTier: RedemptionTier = {
    ...tier,
    id: `tier_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  tiers.push(newTier);
  await saveStoredTiers(shop, tiers);

  console.log(`[Redemption] Created tier "${newTier.name}" for shop ${shop}`);

  return newTier;
}

/**
 * Update a redemption tier
 */
export async function updateRedemptionTier(
  shop: string,
  tierId: string,
  updates: Partial<Omit<RedemptionTier, "id">>
): Promise<RedemptionTier | null> {
  const tiers = await getStoredTiers(shop);
  const index = tiers.findIndex((t) => t.id === tierId);

  if (index === -1) return null;

  tiers[index] = { ...tiers[index], ...updates };
  await saveStoredTiers(shop, tiers);

  return tiers[index];
}

/**
 * Delete a redemption tier
 */
export async function deleteRedemptionTier(shop: string, tierId: string): Promise<boolean> {
  const tiers = await getStoredTiers(shop);
  const filtered = tiers.filter((t) => t.id !== tierId);

  if (filtered.length === tiers.length) return false;

  await saveStoredTiers(shop, filtered);
  return true;
}

// ============================================
// REDEMPTION TRACKING
// ============================================

/**
 * Get redemption history from customer metadata
 */
async function getCustomerRedemptions(customerId: string, shop: string): Promise<Redemption[]> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shop },
    select: { metadata: true },
  });

  const metadata = customer?.metadata as Record<string, unknown> | null;
  const redemptions = metadata?.pointsRedemptions as Redemption[] | undefined;

  if (!redemptions) return [];

  return redemptions.map((r) => ({
    ...r,
    expiresAt: new Date(r.expiresAt),
    createdAt: new Date(r.createdAt),
    usedAt: r.usedAt ? new Date(r.usedAt) : undefined,
  }));
}

/**
 * Save redemption to customer metadata
 */
async function saveCustomerRedemption(
  customerId: string,
  shop: string,
  redemption: Redemption
): Promise<void> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shop },
    select: { metadata: true },
  });

  const metadata = (customer?.metadata as Record<string, unknown>) || {};
  const redemptions = (metadata?.pointsRedemptions as Redemption[]) || [];

  redemptions.push(redemption);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      metadata: {
        ...metadata,
        pointsRedemptions: redemptions,
      } as unknown as Prisma.JsonValue,
    },
  });
}

/**
 * Update redemption status in customer metadata
 */
async function updateRedemptionStatus(
  customerId: string,
  shop: string,
  redemptionId: string,
  status: Redemption["status"],
  usedAt?: Date
): Promise<void> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shop },
    select: { metadata: true },
  });

  const metadata = (customer?.metadata as Record<string, unknown>) || {};
  const redemptions = (metadata?.pointsRedemptions as Redemption[]) || [];

  const index = redemptions.findIndex((r) => r.id === redemptionId);
  if (index !== -1) {
    redemptions[index].status = status;
    if (usedAt) {
      redemptions[index].usedAt = usedAt;
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        metadata: {
          ...metadata,
          pointsRedemptions: redemptions,
        } as unknown as Prisma.JsonValue,
      },
    });
  }
}

// ============================================
// REDEMPTION FUNCTIONS
// ============================================

/**
 * Redeem points for a discount
 *
 * This is the main function for point redemption.
 * It validates the redemption, spends points, and creates a discount code.
 */
export async function redeemPoints(
  shop: string,
  customerId: string,
  tierId: string,
  admin?: any
): Promise<RedemptionResult> {
  // Get the tier
  const tier = await getRedemptionTier(shop, tierId);
  if (!tier) {
    return { success: false, error: "Redemption tier not found" };
  }

  if (!tier.isActive) {
    return { success: false, error: "This redemption option is not currently available" };
  }

  // Check if customer has enough points
  const hasPoints = await hasEnoughPoints(customerId, shop, tier.pointsCost);
  if (!hasPoints) {
    return { success: false, error: "Insufficient points balance" };
  }

  // Check max uses per customer
  if (tier.maxUsesPerCustomer) {
    const redemptions = await getCustomerRedemptions(customerId, shop);
    const tierRedemptions = redemptions.filter((r) => r.tierId === tierId && r.status !== "CANCELLED");
    if (tierRedemptions.length >= tier.maxUsesPerCustomer) {
      return { success: false, error: "Maximum redemptions reached for this reward" };
    }
  }

  // Generate discount code
  const discountCode = generateDiscountCode(shop, tier);

  // Calculate expiration
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (tier.validDays || 30));

  // Create redemption record
  const redemption: Redemption = {
    id: `rdm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    customerId,
    shop,
    tierId: tier.id,
    tierName: tier.name,
    pointsSpent: tier.pointsCost,
    discountCode,
    discountType: tier.type,
    discountValue: tier.value,
    status: "PENDING",
    expiresAt,
    createdAt: new Date(),
  };

  try {
    // Spend points
    await spendPoints({
      customerId,
      shop,
      amount: tier.pointsCost,
      type: "MANUAL_DEBIT", // Will add POINTS_REDEMPTION type later
      description: `Redeemed for: ${tier.name}`,
      metadata: {
        redemptionId: redemption.id,
        tierId: tier.id,
        discountCode,
      },
    });

    // Save redemption record
    await saveCustomerRedemption(customerId, shop, redemption);

    // Create Shopify discount code if admin API is available
    if (admin) {
      try {
        const { createDiscountService } = await import("~/services/shopify-discount.service");
        const discountService = createDiscountService(admin, shop);

        const discountType = tier.type === "PERCENTAGE_DISCOUNT" ? "percentage" : "fixed_amount";
        const shopifyResult = await discountService.createDiscountCode({
          title: `Points Redemption: ${tier.name}`,
          code: discountCode,
          type: discountType,
          value: tier.value,
          usageLimit: 1,
          expiresAt,
        });

        if (shopifyResult.success && shopifyResult.discountId) {
          redemption.shopifyDiscountId = shopifyResult.discountId;
          // Re-save with Shopify discount ID
          await saveCustomerRedemption(customerId, shop, redemption);
          console.log(`[Redemption] Shopify discount created: ${shopifyResult.discountId}`);
        } else {
          console.error(`[Redemption] Shopify discount creation failed: ${shopifyResult.error}`);
          // Points already spent — discount code is valid locally for manual creation
        }
      } catch (error) {
        console.error(`[Redemption] Error creating Shopify discount (non-fatal):`, error);
      }
    }

    console.log(`[Redemption] Customer ${customerId} redeemed ${tier.pointsCost} points for "${tier.name}"`);

    // Get remaining balance
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, shop },
      select: { pointsBalance: true },
    });

    return {
      success: true,
      redemptionId: redemption.id,
      discountCode,
      discountAmount: tier.value,
      discountType: tier.type,
      expiresAt,
      pointsSpent: tier.pointsCost,
      remainingBalance: Number(customer?.pointsBalance ?? 0),
    };
  } catch (error: any) {
    console.error(`[Redemption] Failed to redeem points:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark a redemption as used
 */
export async function markRedemptionUsed(
  shop: string,
  customerId: string,
  redemptionId: string
): Promise<boolean> {
  try {
    await updateRedemptionStatus(customerId, shop, redemptionId, "USED", new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Mark a redemption as used by discount code
 */
export async function markRedemptionUsedByCode(
  shop: string,
  discountCode: string
): Promise<boolean> {
  // Find the customer with this redemption
  const customers = await prisma.customer.findMany({
    where: { shop },
    select: { id: true, metadata: true },
  });

  for (const customer of customers) {
    const metadata = customer.metadata as Record<string, unknown> | null;
    const redemptions = metadata?.pointsRedemptions as Redemption[] | undefined;

    if (redemptions) {
      const redemption = redemptions.find((r) => r.discountCode === discountCode);
      if (redemption && redemption.status === "PENDING") {
        await updateRedemptionStatus(customer.id, shop, redemption.id, "USED", new Date());
        console.log(`[Redemption] Marked redemption ${redemption.id} as used`);
        return true;
      }
    }
  }

  return false;
}

/**
 * Cancel a redemption and refund points
 */
export async function cancelRedemption(
  shop: string,
  customerId: string,
  redemptionId: string
): Promise<boolean> {
  const redemptions = await getCustomerRedemptions(customerId, shop);
  const redemption = redemptions.find((r) => r.id === redemptionId);

  if (!redemption || redemption.status !== "PENDING") {
    return false;
  }

  try {
    // Refund points
    // Note: Using earnPoints with MANUAL_CREDIT type for now
    const { earnPoints } = await import("./points-ledger.server");
    await earnPoints({
      customerId,
      shop,
      amount: redemption.pointsSpent,
      type: "MANUAL_CREDIT",
      description: `Refund for cancelled redemption: ${redemption.tierName}`,
      metadata: {
        redemptionId,
        cancelled: true,
      },
    });

    // Update status
    await updateRedemptionStatus(customerId, shop, redemptionId, "CANCELLED");

    console.log(`[Redemption] Cancelled redemption ${redemptionId} and refunded ${redemption.pointsSpent} points`);

    return true;
  } catch (error) {
    console.error(`[Redemption] Failed to cancel redemption:`, error);
    return false;
  }
}

/**
 * Get customer's active (unused) discount codes
 */
export async function getActiveDiscountCodes(
  shop: string,
  customerId: string
): Promise<Redemption[]> {
  const redemptions = await getCustomerRedemptions(customerId, shop);
  const now = new Date();

  return redemptions.filter(
    (r) => r.status === "PENDING" && r.expiresAt > now
  );
}

/**
 * Check for expired redemptions and update their status
 */
export async function processExpiredRedemptions(shop: string): Promise<number> {
  const customers = await prisma.customer.findMany({
    where: { shop },
    select: { id: true, metadata: true },
  });

  let expiredCount = 0;
  const now = new Date();

  for (const customer of customers) {
    const metadata = customer.metadata as Record<string, unknown> | null;
    const redemptions = metadata?.pointsRedemptions as Redemption[] | undefined;

    if (!redemptions) continue;

    let hasChanges = false;
    for (const redemption of redemptions) {
      if (redemption.status === "PENDING" && new Date(redemption.expiresAt) < now) {
        redemption.status = "EXPIRED";
        hasChanges = true;
        expiredCount++;
      }
    }

    if (hasChanges) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          metadata: {
            ...metadata,
            pointsRedemptions: redemptions,
          } as unknown as Prisma.JsonValue,
        },
      });
    }
  }

  if (expiredCount > 0) {
    console.log(`[Redemption] Marked ${expiredCount} redemptions as expired for shop ${shop}`);
  }

  return expiredCount;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a unique discount code
 */
function generateDiscountCode(shop: string, tier: RedemptionTier): string {
  const prefix = tier.type === "FREE_SHIPPING" ? "FREESHIP" : "REWARD";
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();

  return `${prefix}-${random}${timestamp.slice(-4)}`;
}

/**
 * Get redemption statistics for a shop
 */
export async function getRedemptionStats(shop: string): Promise<{
  totalRedemptions: number;
  totalPointsRedeemed: number;
  totalDiscountValue: number;
  byTier: Record<string, { count: number; points: number }>;
  byStatus: Record<string, number>;
}> {
  const customers = await prisma.customer.findMany({
    where: { shop },
    select: { metadata: true },
  });

  const stats = {
    totalRedemptions: 0,
    totalPointsRedeemed: 0,
    totalDiscountValue: 0,
    byTier: {} as Record<string, { count: number; points: number }>,
    byStatus: {} as Record<string, number>,
  };

  for (const customer of customers) {
    const metadata = customer.metadata as Record<string, unknown> | null;
    const redemptions = metadata?.pointsRedemptions as Redemption[] | undefined;

    if (!redemptions) continue;

    for (const r of redemptions) {
      stats.totalRedemptions++;
      stats.totalPointsRedeemed += r.pointsSpent;
      stats.totalDiscountValue += r.discountValue;

      // By tier
      if (!stats.byTier[r.tierId]) {
        stats.byTier[r.tierId] = { count: 0, points: 0 };
      }
      stats.byTier[r.tierId].count++;
      stats.byTier[r.tierId].points += r.pointsSpent;

      // By status
      stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
    }
  }

  return stats;
}
