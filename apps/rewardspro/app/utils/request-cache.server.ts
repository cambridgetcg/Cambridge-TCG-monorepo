/**
 * Request-Scoped Cache
 *
 * Provides per-request caching using AsyncLocalStorage to prevent
 * redundant data fetches within a single request lifecycle.
 *
 * Usage:
 * - Wrap your request handler with runWithRequestCache()
 * - Use withRequestCache() to cache expensive operations
 * - Cache is automatically cleared when the request completes
 */

import { AsyncLocalStorage } from 'async_hooks';

type RequestCache = Map<string, unknown>;

const requestCacheStorage = new AsyncLocalStorage<RequestCache>();

/**
 * Run a function with request-scoped caching enabled.
 * All withRequestCache() calls within this context will share the same cache.
 *
 * @example
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   return runWithRequestCache(async () => {
 *     const settings = await withRequestCache('settings', () => getSettings());
 *     const tiers = await withRequestCache('tiers', () => getTiers());
 *     return json({ settings, tiers });
 *   });
 * }
 */
export function runWithRequestCache<T>(fn: () => T): T {
  return requestCacheStorage.run(new Map(), fn);
}

/**
 * Cache the result of a function within the current request.
 * If the key exists in the request cache, returns the cached value.
 * If no request context exists, executes the fetcher directly.
 *
 * @param key - Unique cache key for this operation
 * @param fetcher - Async function to fetch the data
 * @returns The cached or freshly fetched data
 *
 * @example
 * const settings = await withRequestCache(
 *   `settings:${shop}`,
 *   () => getShopSettings(shop)
 * );
 */
export async function withRequestCache<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cache = requestCacheStorage.getStore();

  // If no request context, just execute the fetcher
  if (!cache) {
    return fetcher();
  }

  // Check request-level cache first
  if (cache.has(key)) {
    return cache.get(key) as T;
  }

  // Fetch and cache for this request
  const result = await fetcher();
  cache.set(key, result);
  return result;
}

/**
 * Synchronous version of withRequestCache for non-async operations.
 *
 * @param key - Unique cache key for this operation
 * @param compute - Function to compute the value
 * @returns The cached or freshly computed data
 */
export function withRequestCacheSync<T>(
  key: string,
  compute: () => T
): T {
  const cache = requestCacheStorage.getStore();

  // If no request context, just compute
  if (!cache) {
    return compute();
  }

  // Check request-level cache first
  if (cache.has(key)) {
    return cache.get(key) as T;
  }

  // Compute and cache for this request
  const result = compute();
  cache.set(key, result);
  return result;
}

/**
 * Invalidate a specific key from the request cache.
 * Useful when you mutate data and need to refetch it within the same request.
 *
 * @param key - The cache key to invalidate
 */
export function invalidateRequestCache(key: string): void {
  const cache = requestCacheStorage.getStore();
  if (cache) {
    cache.delete(key);
  }
}

/**
 * Clear the entire request cache.
 * Useful after mutations that affect multiple cached values.
 */
export function clearRequestCache(): void {
  const cache = requestCacheStorage.getStore();
  if (cache) {
    cache.clear();
  }
}

/**
 * Get statistics about the current request cache.
 * Returns null if no request context exists.
 */
export function getRequestCacheStats(): { size: number; keys: string[] } | null {
  const cache = requestCacheStorage.getStore();
  if (!cache) {
    return null;
  }
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

/**
 * Check if running within a request cache context.
 */
export function hasRequestCacheContext(): boolean {
  return requestCacheStorage.getStore() !== undefined;
}
