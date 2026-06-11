/**
 * Redis-Backed Entitlements Cache for Serverless Environments
 *
 * This cache uses Vercel KV (Redis) for distributed caching of entitlements,
 * ensuring consistent entitlement checks across all serverless instances.
 *
 * CRITICAL FIX: Replaces the broken in-memory Map cache that caused:
 * - Each Vercel instance having separate cache state
 * - invalidateCache() only clearing local instance
 * - Plan changes taking up to 5 minutes to propagate (or longer across instances)
 *
 * Now with Redis:
 * - Single shared cache across all instances
 * - invalidateCache() clears globally
 * - Consistent entitlements for all requests
 *
 * @see .claude/gating-system-dark-areas-perspective-2026-01-24.md
 * @see .claude/integration/PATH.md - Phase 0: Foundation
 */

import { kv } from '@vercel/kv';
import type { ShopEntitlements } from "@prisma/client";

// Cache key prefix for entitlements
const CACHE_PREFIX = 'entitlements:';

// Cache TTL in seconds (5 minutes - same as before)
const CACHE_TTL_SECONDS = 5 * 60;

// Check if Vercel KV is configured
const isKVConfigured = !!(
  process.env.KV_REST_API_URL &&
  process.env.KV_REST_API_TOKEN
);

// In-memory fallback for local development
const memoryCache = new Map<string, { data: ShopEntitlements; expires: number }>();

/**
 * Build cache key for a shop
 */
function getCacheKey(shop: string): string {
  return `${CACHE_PREFIX}${shop}`;
}

/**
 * Get cached entitlements for a shop
 * Returns null if not found or expired
 */
export async function getCachedEntitlements(shop: string): Promise<ShopEntitlements | null> {
  const key = getCacheKey(shop);

  try {
    if (isKVConfigured) {
      // Use Redis
      const cached = await kv.get<ShopEntitlements>(key);
      return cached;
    } else {
      // In-memory fallback for local development
      const cached = memoryCache.get(key);
      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }
      // Clear expired entry
      if (cached) {
        memoryCache.delete(key);
      }
      return null;
    }
  } catch (error) {
    // On error, return null (will trigger database fetch)
    console.error(`[EntitlementsCache] Error getting cache for ${shop}:`, error);
    return null;
  }
}

/**
 * Set cached entitlements for a shop
 */
export async function setCachedEntitlements(
  shop: string,
  entitlements: ShopEntitlements
): Promise<void> {
  const key = getCacheKey(shop);

  try {
    if (isKVConfigured) {
      // Use Redis with TTL
      await kv.set(key, entitlements, { ex: CACHE_TTL_SECONDS });
    } else {
      // In-memory fallback
      memoryCache.set(key, {
        data: entitlements,
        expires: Date.now() + (CACHE_TTL_SECONDS * 1000),
      });
    }
  } catch (error) {
    // On error, log but don't throw (caching is best-effort)
    console.error(`[EntitlementsCache] Error setting cache for ${shop}:`, error);
  }
}

/**
 * Invalidate cache for a specific shop
 * This now works GLOBALLY across all serverless instances
 */
export async function invalidateEntitlementsCache(shop: string): Promise<void> {
  const key = getCacheKey(shop);

  try {
    if (isKVConfigured) {
      // Delete from Redis - affects all instances
      await kv.del(key);
      console.log(`[EntitlementsCache] Invalidated cache for ${shop} (Redis - global)`);
    } else {
      // In-memory fallback
      memoryCache.delete(key);
      console.log(`[EntitlementsCache] Invalidated cache for ${shop} (memory - local only)`);
    }
  } catch (error) {
    console.error(`[EntitlementsCache] Error invalidating cache for ${shop}:`, error);
  }
}

/**
 * Clear entire entitlements cache
 * Uses pattern-based deletion for Redis
 * Primarily for testing or after bulk updates
 */
export async function clearEntitlementsCache(): Promise<void> {
  try {
    if (isKVConfigured) {
      // Use SCAN to find all entitlements keys and delete them
      // Note: This is more expensive but necessary for pattern-based deletion
      const keys = await kv.keys(`${CACHE_PREFIX}*`);
      if (keys.length > 0) {
        // Delete in batches of 100 to avoid overwhelming Redis
        for (let i = 0; i < keys.length; i += 100) {
          const batch = keys.slice(i, i + 100);
          await Promise.all(batch.map(key => kv.del(key)));
        }
      }
      console.log(`[EntitlementsCache] Cleared ${keys.length} entries from Redis`);
    } else {
      // In-memory fallback
      const count = memoryCache.size;
      memoryCache.clear();
      console.log(`[EntitlementsCache] Cleared ${count} entries from memory`);
    }
  } catch (error) {
    console.error(`[EntitlementsCache] Error clearing cache:`, error);
  }
}

/**
 * Get cache statistics
 */
export async function getEntitlementsCacheStats(): Promise<{
  backend: 'redis' | 'memory';
  size: number;
  keys: string[];
}> {
  try {
    if (isKVConfigured) {
      const keys = await kv.keys(`${CACHE_PREFIX}*`);
      return {
        backend: 'redis',
        size: keys.length,
        keys: keys.map(k => k.replace(CACHE_PREFIX, '')),
      };
    } else {
      return {
        backend: 'memory',
        size: memoryCache.size,
        keys: Array.from(memoryCache.keys()).map(k => k.replace(CACHE_PREFIX, '')),
      };
    }
  } catch (error) {
    console.error(`[EntitlementsCache] Error getting stats:`, error);
    return {
      backend: isKVConfigured ? 'redis' : 'memory',
      size: 0,
      keys: [],
    };
  }
}

/**
 * Check which backend is being used
 */
export function getEntitlementsCacheBackend(): 'redis' | 'memory' {
  return isKVConfigured ? 'redis' : 'memory';
}

/**
 * Warm cache for a shop
 * Used to pre-populate cache after subscription changes
 */
export async function warmEntitlementsCache(
  shop: string,
  entitlements: ShopEntitlements
): Promise<void> {
  console.log(`[EntitlementsCache] Warming cache for ${shop}`);
  await setCachedEntitlements(shop, entitlements);
}

// Clean up old memory entries (for local dev)
function cleanupMemoryCache() {
  if (isKVConfigured) return; // Only needed for memory fallback

  const now = Date.now();
  for (const [key, cached] of memoryCache.entries()) {
    if (cached.expires <= now) {
      memoryCache.delete(key);
    }
  }
}

// Run cleanup every minute for memory fallback
if (!isKVConfigured && typeof setInterval !== 'undefined') {
  setInterval(cleanupMemoryCache, 60 * 1000);
}
