/**
 * Analytics Cache Manager
 * In-memory cache for analytics metrics with configurable TTL
 * Optimized for serverless environments
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class AnalyticsCacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number = 60000; // 60 seconds

  constructor() {
    this.cache = new Map();
  }

  /**
   * Get cached data if available and fresh
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if cache is still valid
    if (age < entry.ttl) {
      console.log(`[Analytics Cache] HIT: ${key} (age: ${age}ms)`);
      return entry.data as T;
    }

    // Cache expired, remove it
    console.log(`[Analytics Cache] EXPIRED: ${key} (age: ${age}ms > ${entry.ttl}ms)`);
    this.cache.delete(key);
    return null;
  }

  /**
   * Store data in cache with optional custom TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    };

    this.cache.set(key, entry);
    console.log(`[Analytics Cache] SET: ${key} (TTL: ${entry.ttl}ms)`);
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`[Analytics Cache] INVALIDATED: ${key}`);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[Analytics Cache] CLEARED: ${size} entries removed`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());

    return {
      totalEntries: entries.length,
      validEntries: entries.filter(([_, entry]) => {
        const age = now - entry.timestamp;
        return age < entry.ttl;
      }).length,
      invalidEntries: entries.filter(([_, entry]) => {
        const age = now - entry.timestamp;
        return age >= entry.ttl;
      }).length,
    };
  }

  /**
   * Clean up expired entries (optional maintenance)
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age >= entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[Analytics Cache] CLEANUP: ${removed} expired entries removed`);
    }
  }
}

// Singleton instance
const analyticsCache = new AnalyticsCacheManager();

// Export cache instance and helper functions
export { analyticsCache };

/**
 * Helper function to get or compute cached data
 */
export async function getCachedOrCompute<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Try to get from cache
  const cached = analyticsCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Not in cache, compute it
  console.log(`[Analytics Cache] MISS: ${key} - Computing...`);
  const data = await computeFn();

  // Store in cache
  analyticsCache.set(key, data, ttl);

  return data;
}

/**
 * Generate cache key for shop metrics
 */
export function getMetricsCacheKey(shop: string, period: 'current' | 'previous'): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = period === 'current' ? date.getMonth() + 1 : date.getMonth();
  return `metrics:${shop}:${year}-${month}`;
}
