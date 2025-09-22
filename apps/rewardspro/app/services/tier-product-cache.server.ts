/**
 * TierProductCache Service
 * Caches tier product IDs to avoid repeated database queries on every order
 * Implements best practices for performance optimization
 */

import db from '../db.server';

interface CacheEntry {
  ids: Set<string>;
  fetchedAt: number;
}

/**
 * In-memory cache for tier product IDs
 * Note: In serverless environments (like Vercel), consider using Redis or similar
 * for cross-instance caching. This implementation works for long-running servers.
 */
export class TierProductCache {
  private static cache = new Map<string, CacheEntry>();
  private static TTL = 5 * 60 * 1000; // 5 minutes TTL

  /**
   * Get tier product IDs for a shop (cached)
   * @param shop - The shop domain
   * @returns Set of active tier product Shopify IDs
   */
  static async getTierProductIds(shop: string): Promise<Set<string>> {
    const entry = TierProductCache.cache.get(shop);
    const now = Date.now();

    // Return cached entry if still valid
    if (entry && now - entry.fetchedAt < TierProductCache.TTL) {
      return entry.ids;
    }

    // Otherwise, fetch from database
    const products = await db.tierProduct.findMany({
      where: {
        shop,
        isActive: true
      },
      select: {
        shopifyProductId: true
      }
    });

    const idSet = new Set(products.map(p => p.shopifyProductId));

    // Cache the result
    TierProductCache.cache.set(shop, {
      ids: idSet,
      fetchedAt: now
    });

    // Optional: Clean up old cache entries periodically
    TierProductCache.cleanupOldEntries();

    return idSet;
  }

  /**
   * Invalidate cache for a specific shop
   * Call this when tier products are added/removed/updated
   */
  static invalidate(shop: string): void {
    TierProductCache.cache.delete(shop);
  }

  /**
   * Clear entire cache
   */
  static clear(): void {
    TierProductCache.cache.clear();
  }

  /**
   * Clean up expired cache entries
   * Prevents memory leaks in long-running processes
   */
  private static cleanupOldEntries(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [shop, entry] of TierProductCache.cache.entries()) {
      if (now - entry.fetchedAt > TierProductCache.TTL * 2) {
        expired.push(shop);
      }
    }

    for (const shop of expired) {
      TierProductCache.cache.delete(shop);
    }
  }

  /**
   * Get cache statistics (for monitoring)
   */
  static getStats(): {
    size: number;
    shops: string[];
    oldestEntry: number | null;
  } {
    let oldestEntry: number | null = null;

    for (const entry of TierProductCache.cache.values()) {
      if (oldestEntry === null || entry.fetchedAt < oldestEntry) {
        oldestEntry = entry.fetchedAt;
      }
    }

    return {
      size: TierProductCache.cache.size,
      shops: Array.from(TierProductCache.cache.keys()),
      oldestEntry
    };
  }
}

export default TierProductCache;