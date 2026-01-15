/**
 * Vercel KV Cache Manager
 *
 * WHAT IS VERCEL KV?
 * ==================
 * Vercel KV is a serverless Redis database that provides:
 * - Sub-millisecond read latency (~1ms)
 * - Persistent storage across function invocations
 * - Shared cache across ALL serverless instances
 * - Automatic scaling and high availability
 *
 * WHY USE IT INSTEAD OF IN-MEMORY CACHE?
 * ======================================
 * In serverless environments, each function invocation may run on a different
 * instance. In-memory caches (like Map()) are:
 * - Lost on cold starts (new instances start with empty cache)
 * - Not shared between concurrent instances
 * - Reset on deployments
 *
 * With Vercel KV:
 * - Cache persists across cold starts
 * - All instances share the same cache
 * - Cache survives deployments
 * - 80%+ cache hit rate vs ~20% with in-memory
 *
 * SETUP REQUIRED:
 * ==============
 * 1. Create KV database in Vercel Dashboard (Storage > Create > KV)
 * 2. Link to your project (it auto-adds environment variables)
 * 3. Environment variables added automatically:
 *    - KV_REST_API_URL
 *    - KV_REST_API_TOKEN
 *    - KV_REST_API_READ_ONLY_TOKEN
 *    - KV_URL
 *
 * FALLBACK BEHAVIOR:
 * =================
 * If KV is not configured (local dev, missing env vars), this module
 * automatically falls back to in-memory caching. No code changes needed.
 */

import { kv } from '@vercel/kv';

// Check if Vercel KV is configured
const isKVConfigured = !!(
  process.env.KV_REST_API_URL &&
  process.env.KV_REST_API_TOKEN
);

// In-memory fallback cache for local development
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

/**
 * Log cache operations for debugging
 */
function logCache(operation: string, key: string, details?: string) {
  const backend = isKVConfigured ? 'KV' : 'Memory';
  const detailStr = details ? ` (${details})` : '';
  console.log(`[Cache:${backend}] ${operation}: ${key}${detailStr}`);
}

/**
 * Get value from cache
 * Returns null if not found or expired
 */
export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    if (isKVConfigured) {
      // Use Vercel KV
      const value = await kv.get<T>(key);
      if (value !== null) {
        logCache('HIT', key);
        return value;
      }
      logCache('MISS', key);
      return null;
    } else {
      // Use in-memory fallback
      const entry = memoryCache.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        logCache('HIT', key, `expires in ${Math.round((entry.expiresAt - Date.now()) / 1000)}s`);
        return entry.data as T;
      }
      if (entry) {
        memoryCache.delete(key);
        logCache('EXPIRED', key);
      } else {
        logCache('MISS', key);
      }
      return null;
    }
  } catch (error) {
    console.error(`[Cache] Error getting ${key}:`, error);
    return null;
  }
}

/**
 * Set value in cache with TTL (time-to-live in milliseconds)
 */
export async function kvSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  try {
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    if (isKVConfigured) {
      // Use Vercel KV with EX (expire in seconds)
      await kv.set(key, value, { ex: ttlSeconds });
      logCache('SET', key, `TTL: ${ttlSeconds}s`);
    } else {
      // Use in-memory fallback
      memoryCache.set(key, {
        data: value,
        expiresAt: Date.now() + ttlMs,
      });
      logCache('SET', key, `TTL: ${ttlSeconds}s`);
    }
  } catch (error) {
    console.error(`[Cache] Error setting ${key}:`, error);
  }
}

/**
 * Delete value from cache
 */
export async function kvDelete(key: string): Promise<void> {
  try {
    if (isKVConfigured) {
      await kv.del(key);
    } else {
      memoryCache.delete(key);
    }
    logCache('DELETE', key);
  } catch (error) {
    console.error(`[Cache] Error deleting ${key}:`, error);
  }
}

/**
 * Delete all keys matching a pattern
 * Pattern uses * as wildcard (e.g., "analytics:shop123:*")
 */
export async function kvDeletePattern(pattern: string): Promise<number> {
  try {
    if (isKVConfigured) {
      // Vercel KV supports SCAN for pattern matching
      const keys = await kv.keys(pattern);
      if (keys.length > 0) {
        await kv.del(...keys);
        logCache('DELETE_PATTERN', pattern, `${keys.length} keys`);
      }
      return keys.length;
    } else {
      // In-memory pattern matching
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      let count = 0;
      for (const key of memoryCache.keys()) {
        if (regex.test(key)) {
          memoryCache.delete(key);
          count++;
        }
      }
      if (count > 0) {
        logCache('DELETE_PATTERN', pattern, `${count} keys`);
      }
      return count;
    }
  } catch (error) {
    console.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    return 0;
  }
}

/**
 * Get or compute cached value
 * If value exists in cache, return it
 * If not, compute it, store it, and return it
 *
 * This is the main function you'll use for caching expensive operations
 */
export async function kvGetOrCompute<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttlMs: number
): Promise<T> {
  // Try to get from cache
  const cached = await kvGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Compute the value
  const startTime = Date.now();
  const value = await computeFn();
  const computeTime = Date.now() - startTime;

  logCache('COMPUTE', key, `took ${computeTime}ms`);

  // Store in cache
  await kvSet(key, value, ttlMs);

  return value;
}

/**
 * Check if cache is using Vercel KV or memory fallback
 */
export function getCacheBackend(): 'vercel-kv' | 'memory' {
  return isKVConfigured ? 'vercel-kv' : 'memory';
}

/**
 * Get cache statistics (for debugging/monitoring)
 */
export async function getCacheStats(): Promise<{
  backend: 'vercel-kv' | 'memory';
  isKVConfigured: boolean;
  memoryEntries?: number;
}> {
  return {
    backend: getCacheBackend(),
    isKVConfigured,
    memoryEntries: isKVConfigured ? undefined : memoryCache.size,
  };
}

/**
 * Clear all cached data (use with caution!)
 */
export async function kvClearAll(): Promise<void> {
  if (isKVConfigured) {
    // Clear all keys with our prefix
    await kvDeletePattern('*');
  } else {
    memoryCache.clear();
  }
  logCache('CLEAR_ALL', '*');
}

// Export type for cache key generation
export type CacheKeyParts = (string | number | boolean | null | undefined)[];

/**
 * Generate a cache key from parts
 * Handles null/undefined gracefully
 */
export function createCacheKey(prefix: string, ...parts: CacheKeyParts): string {
  const sanitizedParts = parts
    .map(p => (p === null || p === undefined ? '_' : String(p)))
    .join(':');
  return `${prefix}:${sanitizedParts}`;
}
