/**
 * Shop Data Provider
 *
 * Centralized service for fetching and caching shop-related data.
 * All routes should use this service instead of direct database queries
 * for data that changes infrequently (settings, tiers, entitlements, billing).
 *
 * Cache Strategy:
 * - L3 (Distributed): Vercel KV with automatic fallback to in-memory
 * - TTL-based expiry with webhook/action-triggered invalidation
 * - All cached data serializable (no Prisma objects, no Decimal types)
 */

import { kvGetOrCompute, kvDelete, kvDeletePattern } from '~/utils/vercel-kv-cache.server';
import { db } from '~/db.server';
import type { ShopSettings, Tier, ShopEntitlements, BillingSubscription } from '@prisma/client';

// ============================================
// TYPES
// ============================================

export interface ShopData {
  settings: ShopSettings | null;
  tiers?: Tier[];
  entitlements?: ShopEntitlements | null;
  billing?: BillingSubscription | null;
}

export interface ShopDataOptions {
  includeTiers?: boolean;
  includeEntitlements?: boolean;
  includeBilling?: boolean;
}

// Serialized versions (safe for caching - Decimals converted to strings)
interface SerializedTier extends Omit<Tier, 'pointsMultiplier' | 'pointsLuckBonus' | 'raffleEntryMultiplier' | 'monthlyPrice' | 'discountPercentage'> {
  pointsMultiplier: string | null;
  pointsLuckBonus: string | null;
  raffleEntryMultiplier: string | null;
  monthlyPrice: string | null;
  discountPercentage: string | null;
}

interface SerializedBillingSubscription extends Omit<BillingSubscription, 'currentPeriodUsageFee' | 'usageCappedAmount'> {
  currentPeriodUsageFee: string;
  usageCappedAmount: string | null;
}

// ============================================
// CACHE CONFIGURATION
// ============================================

const CACHE_KEYS = {
  settings: (shop: string) => `shop:${shop}:settings`,
  tiers: (shop: string) => `shop:${shop}:tiers`,
  entitlements: (shop: string) => `shop:${shop}:entitlements`,
  billing: (shop: string) => `shop:${shop}:billing`,
  tierDistribution: (shop: string) => `shop:${shop}:tier-distribution`,
};

const CACHE_TTL = {
  settings: 15 * 60 * 1000,     // 15 minutes
  tiers: 10 * 60 * 1000,        // 10 minutes
  entitlements: 30 * 60 * 1000, // 30 minutes
  billing: 30 * 60 * 1000,      // 30 minutes
  tierDistribution: 5 * 60 * 1000, // 5 minutes — stats card, eventually consistent OK
};

export interface TierDistribution {
  tierDistribution: Record<string, number>;
  totalCustomers: number;
}

// ============================================
// SERIALIZATION HELPERS
// ============================================

function serializeTier(tier: Tier): SerializedTier {
  return {
    ...tier,
    pointsMultiplier: tier.pointsMultiplier?.toString() ?? null,
    pointsLuckBonus: tier.pointsLuckBonus?.toString() ?? null,
    raffleEntryMultiplier: tier.raffleEntryMultiplier?.toString() ?? null,
    monthlyPrice: tier.monthlyPrice?.toString() ?? null,
    discountPercentage: tier.discountPercentage?.toString() ?? null,
  };
}

function deserializeTier(tier: SerializedTier): Tier {
  return {
    ...tier,
    pointsMultiplier: tier.pointsMultiplier ? (tier.pointsMultiplier as unknown as Tier['pointsMultiplier']) : null,
    pointsLuckBonus: tier.pointsLuckBonus ? (tier.pointsLuckBonus as unknown as Tier['pointsLuckBonus']) : null,
    raffleEntryMultiplier: tier.raffleEntryMultiplier ? (tier.raffleEntryMultiplier as unknown as Tier['raffleEntryMultiplier']) : null,
    monthlyPrice: tier.monthlyPrice ? (tier.monthlyPrice as unknown as Tier['monthlyPrice']) : null,
    discountPercentage: tier.discountPercentage ? (tier.discountPercentage as unknown as Tier['discountPercentage']) : null,
  } as Tier;
}

function serializeBilling(billing: BillingSubscription): SerializedBillingSubscription {
  return {
    ...billing,
    currentPeriodUsageFee: billing.currentPeriodUsageFee.toString(),
    usageCappedAmount: billing.usageCappedAmount?.toString() ?? null,
  };
}

function deserializeBilling(billing: SerializedBillingSubscription): BillingSubscription {
  return {
    ...billing,
    currentPeriodUsageFee: billing.currentPeriodUsageFee as unknown as BillingSubscription['currentPeriodUsageFee'],
    usageCappedAmount: billing.usageCappedAmount ? (billing.usageCappedAmount as unknown as BillingSubscription['usageCappedAmount']) : null,
  } as BillingSubscription;
}

// ============================================
// CORE DATA FETCHING FUNCTIONS
// ============================================

/**
 * Get shop settings with caching
 * TTL: 15 minutes
 * Invalidate: On settings update, shop.update webhook
 */
export async function getShopSettings(shop: string): Promise<ShopSettings | null> {
  return kvGetOrCompute(
    CACHE_KEYS.settings(shop),
    async () => {
      console.log(`[ShopData] Fetching settings from DB for ${shop}`);
      const settings = await db.shopSettings.findUnique({ where: { shop } });
      return settings;
    },
    CACHE_TTL.settings
  );
}

/**
 * Get shop tiers with caching
 * TTL: 10 minutes
 * Invalidate: On tier create/update/delete
 */
export async function getShopTiers(shop: string): Promise<Tier[]> {
  const cached = await kvGetOrCompute<SerializedTier[]>(
    CACHE_KEYS.tiers(shop),
    async () => {
      console.log(`[ShopData] Fetching tiers from DB for ${shop}`);
      const tiers = await db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      });
      // Serialize for caching (convert Decimals to strings)
      return tiers.map(serializeTier);
    },
    CACHE_TTL.tiers
  );

  // Deserialize back to Tier type
  return cached?.map(deserializeTier) ?? [];
}

/**
 * Get shop entitlements with caching
 * TTL: 30 minutes
 * Invalidate: On plan change, app_subscriptions_update webhook
 */
export async function getShopEntitlements(shop: string): Promise<ShopEntitlements | null> {
  return kvGetOrCompute(
    CACHE_KEYS.entitlements(shop),
    async () => {
      console.log(`[ShopData] Fetching entitlements from DB for ${shop}`);
      const entitlements = await db.shopEntitlements.findUnique({ where: { shop } });
      return entitlements;
    },
    CACHE_TTL.entitlements
  );
}

/**
 * Get billing subscription with caching
 * TTL: 30 minutes
 * Invalidate: On app_subscriptions_update webhook
 */
export async function getBillingSubscription(shop: string): Promise<BillingSubscription | null> {
  const cached = await kvGetOrCompute<SerializedBillingSubscription | null>(
    CACHE_KEYS.billing(shop),
    async () => {
      console.log(`[ShopData] Fetching billing from DB for ${shop}`);
      const billing = await db.billingSubscription.findUnique({ where: { shop } });
      return billing ? serializeBilling(billing) : null;
    },
    CACHE_TTL.billing
  );

  return cached ? deserializeBilling(cached) : null;
}

/**
 * Get tier distribution + total customer count for a shop, cached.
 *
 * Uses findMany via the model proxy (the GROUP BY raw SQL path returns
 * empty data even after the Data API adapter's template-literal fix —
 * something else in the raw-query plumbing is still wrong; needs deeper
 * investigation). The 5-min KV cache amortises the O(N_customers) cost.
 *
 * TTL: 5 minutes. Invalidate via invalidateTierDistribution on tier change.
 */
export async function getTierDistribution(shop: string): Promise<TierDistribution> {
  return kvGetOrCompute(
    CACHE_KEYS.tierDistribution(shop),
    async () => {
      const [totalCustomers, customersWithTiers] = await Promise.all([
        db.customer.count({ where: { shop } }),
        db.customer.findMany({
          where: { shop },
          select: { currentTierId: true },
        }),
      ]);

      const tierDistribution: Record<string, number> = {};
      for (const c of customersWithTiers) {
        if (c.currentTierId) {
          tierDistribution[c.currentTierId] = (tierDistribution[c.currentTierId] || 0) + 1;
        }
      }

      return { tierDistribution, totalCustomers };
    },
    CACHE_TTL.tierDistribution
  );
}

/**
 * Get multiple shop data in parallel
 * Use this in route loaders for efficient data fetching
 */
export async function getShopData(shop: string, options: ShopDataOptions = {}): Promise<ShopData> {
  const [settings, tiers, entitlements, billing] = await Promise.all([
    getShopSettings(shop),
    options.includeTiers ? getShopTiers(shop) : Promise.resolve(undefined),
    options.includeEntitlements ? getShopEntitlements(shop) : Promise.resolve(undefined),
    options.includeBilling ? getBillingSubscription(shop) : Promise.resolve(undefined),
  ]);

  return {
    settings,
    tiers,
    entitlements,
    billing,
  };
}

// ============================================
// CACHE INVALIDATION FUNCTIONS
// ============================================

/**
 * Invalidate shop settings cache
 * Call after: settings update action, shop.update webhook
 */
export async function invalidateShopSettings(shop: string): Promise<void> {
  await kvDelete(CACHE_KEYS.settings(shop));
  console.log(`[ShopData] Invalidated settings cache for ${shop}`);
}

/**
 * Invalidate shop tiers cache
 * Call after: tier create/update/delete actions
 */
export async function invalidateShopTiers(shop: string): Promise<void> {
  await kvDelete(CACHE_KEYS.tiers(shop));
  console.log(`[ShopData] Invalidated tiers cache for ${shop}`);
}

/**
 * Invalidate shop entitlements cache
 * Call after: plan changes, app_subscriptions_update webhook
 */
export async function invalidateShopEntitlements(shop: string): Promise<void> {
  await kvDelete(CACHE_KEYS.entitlements(shop));
  console.log(`[ShopData] Invalidated entitlements cache for ${shop}`);
}

/**
 * Invalidate billing subscription cache
 * Call after: app_subscriptions_update webhook
 */
export async function invalidateShopBilling(shop: string): Promise<void> {
  await kvDelete(CACHE_KEYS.billing(shop));
  console.log(`[ShopData] Invalidated billing cache for ${shop}`);
}

/**
 * Invalidate tier distribution cache.
 * Call after any tier change (resolver, manual assignment, recalc cron).
 */
export async function invalidateTierDistribution(shop: string): Promise<void> {
  await kvDelete(CACHE_KEYS.tierDistribution(shop));
}

/**
 * Invalidate all shop data caches
 * Use for complete cache reset (e.g., app uninstall)
 */
export async function invalidateAllShopData(shop: string): Promise<void> {
  await kvDeletePattern(`shop:${shop}:*`);
  console.log(`[ShopData] Invalidated all caches for ${shop}`);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get cache TTL configuration (for monitoring/debugging)
 */
export function getCacheTTLConfig() {
  return {
    settings: `${CACHE_TTL.settings / 60000} minutes`,
    tiers: `${CACHE_TTL.tiers / 60000} minutes`,
    entitlements: `${CACHE_TTL.entitlements / 60000} minutes`,
    billing: `${CACHE_TTL.billing / 60000} minutes`,
  };
}

/**
 * Get cache key for a specific data type (for debugging)
 */
export function getCacheKey(type: keyof typeof CACHE_KEYS, shop: string): string {
  return CACHE_KEYS[type](shop);
}
