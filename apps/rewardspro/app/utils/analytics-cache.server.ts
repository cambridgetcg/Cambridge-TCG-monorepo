/**
 * Analytics Cache Manager
 *
 * UPGRADED TO VERCEL KV
 * ====================
 * This cache now uses Vercel KV (Redis) when available, providing:
 * - Persistent cache across serverless cold starts
 * - Shared cache across all function instances
 * - Sub-millisecond read latency
 * - Cache survives deployments
 *
 * Falls back to in-memory cache when KV is not configured (local dev).
 *
 * CACHE KEY PREFIXES:
 * - metrics:* - Overview metrics per shop/period
 * - customer-behaviour:* - RFM segmentation data
 * - cohort-analysis:* - Cohort analysis data
 * - tier-performance:* - Tier performance metrics
 * - program-impact:* - Program impact metrics
 */

import {
  kvGetOrCompute,
  kvGet,
  kvSet,
  kvDelete,
  kvDeletePattern,
  getCacheBackend,
  getCacheStats as getKVStats,
  createShopCacheKey,
} from './vercel-kv-cache.server';

// Default TTL values (in milliseconds)
const DEFAULT_TTL = 60000; // 1 minute
const ANALYTICS_TTL = 300000; // 5 minutes for analytics data

/**
 * Legacy cache manager class for backwards compatibility
 * Now proxies to Vercel KV functions
 */
class AnalyticsCacheManager {
  private defaultTTL: number = DEFAULT_TTL;

  /**
   * Get cached data if available and fresh
   * Note: This is now async internally but returns sync for backwards compat
   * Use getCachedOrCompute for new code
   */
  get<T>(key: string): T | null {
    // For backwards compatibility, we can't make this async
    // New code should use kvGet directly
    console.warn(
      `[Analytics Cache] Sync get() called for ${key}. ` +
      `Consider using getCachedOrCompute() for better KV support.`
    );
    return null; // Force recompute - sync access can't use KV
  }

  /**
   * Store data in cache with optional custom TTL
   * Note: This is fire-and-forget for backwards compat
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // Fire and forget - don't await
    kvSet(key, data, ttl || this.defaultTTL).catch(err => {
      console.error(`[Analytics Cache] Error setting ${key}:`, err);
    });
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    kvDelete(key).catch(err => {
      console.error(`[Analytics Cache] Error invalidating ${key}:`, err);
    });
  }

  /**
   * Clear all cache entries for a shop
   * SECURITY: Validates shop domain before clearing
   */
  clearShop(shop: string): void {
    // SECURITY: Validate shop to prevent clearing all cache entries
    if (!shop || typeof shop !== 'string' || !shop.includes('.myshopify.com')) {
      console.error(`[Analytics Cache] Invalid shop domain for clearShop: ${shop}`);
      return;
    }
    kvDeletePattern(`*:${shop}:*`).catch(err => {
      console.error(`[Analytics Cache] Error clearing shop ${shop}:`, err);
    });
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    kvDeletePattern('*').catch(err => {
      console.error(`[Analytics Cache] Error clearing all:`, err);
    });
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    return getKVStats();
  }
}

// Singleton instance for backwards compatibility
const analyticsCache = new AnalyticsCacheManager();

// Export cache instance
export { analyticsCache };

/**
 * Primary caching function - GET OR COMPUTE
 *
 * This is the main function you should use for caching expensive operations.
 * It automatically:
 * 1. Checks if data exists in cache (KV or memory)
 * 2. Returns cached data if fresh
 * 3. Computes new data if cache miss
 * 4. Stores computed data in cache
 *
 * @param key - Unique cache key (e.g., "cohort-analysis:shop.myshopify.com")
 * @param computeFn - Async function that computes the data
 * @param ttl - Time-to-live in milliseconds (default: 5 minutes)
 *
 * @example
 * const data = await getCachedOrCompute(
 *   `metrics:${shop}`,
 *   () => fetchExpensiveMetrics(shop),
 *   300000 // 5 minutes
 * );
 */
export async function getCachedOrCompute<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttl: number = ANALYTICS_TTL
): Promise<T> {
  return kvGetOrCompute(key, computeFn, ttl);
}

/**
 * Get value from cache (async version)
 * Returns null if not found or expired
 */
export async function getCached<T>(key: string): Promise<T | null> {
  return kvGet<T>(key);
}

/**
 * Set value in cache
 */
export async function setCache<T>(key: string, data: T, ttl: number = ANALYTICS_TTL): Promise<void> {
  return kvSet(key, data, ttl);
}

/**
 * Invalidate cache entry
 */
export async function invalidateCache(key: string): Promise<void> {
  return kvDelete(key);
}

/**
 * Invalidate all cache entries for a shop
 * Useful when shop data changes significantly
 *
 * SECURITY: Validates shop domain before invalidation to prevent
 * accidentally clearing all cache entries (if shop is empty/null).
 */
export async function invalidateShopCache(shop: string): Promise<number> {
  // SECURITY: Validate shop domain before invalidation
  if (!shop || typeof shop !== 'string' || !shop.includes('.myshopify.com')) {
    throw new Error(
      `[Analytics Cache] Invalid shop domain for cache invalidation: ${JSON.stringify(shop)}. ` +
      `Shop must be a valid Shopify domain.`
    );
  }

  // Invalidate all analytics-related keys for this shop
  const patterns = [
    `metrics:${shop}:*`,
    `customer-behaviour:${shop}`,
    `cohort-analysis:${shop}`,
    `tier-performance:${shop}`,
    `program-impact:${shop}`,
  ];

  let totalDeleted = 0;
  for (const pattern of patterns) {
    totalDeleted += await kvDeletePattern(pattern);
  }

  console.log(`[Analytics Cache] Invalidated ${totalDeleted} entries for shop: ${shop}`);
  return totalDeleted;
}

/**
 * Generate cache key for shop metrics
 *
 * SECURITY: Uses createShopCacheKey to validate shop domain
 * and prevent null/undefined collisions.
 */
export function getMetricsCacheKey(shop: string, period: 'current' | 'previous'): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = period === 'current' ? date.getMonth() + 1 : date.getMonth();
  return createShopCacheKey('metrics', shop, `${year}-${month}`);
}

/**
 * Get information about which cache backend is being used
 */
export function getCacheBackendInfo(): {
  backend: 'vercel-kv' | 'memory';
  description: string;
} {
  const backend = getCacheBackend();
  return {
    backend,
    description: backend === 'vercel-kv'
      ? 'Using Vercel KV (Redis) - persistent, shared across instances'
      : 'Using in-memory cache - resets on cold start, not shared',
  };
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  return getKVStats();
}

// Export TTL constants for consistency
export const CACHE_TTL = {
  SHORT: 60000,      // 1 minute - for frequently changing data
  MEDIUM: 300000,    // 5 minutes - default for analytics
  LONG: 600000,      // 10 minutes - for stable data
  VERY_LONG: 3600000, // 1 hour - for rarely changing data
} as const;
