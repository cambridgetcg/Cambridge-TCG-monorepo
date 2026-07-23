// Multi-layer cache manager for optimized data access
import { LRUCache } from 'lru-cache';
import { useState, useEffect, useCallback } from 'react';

export interface CacheOptions {
  ttl?: number;                // Time to live in milliseconds
  staleWhileRevalidate?: boolean; // Serve stale while fetching fresh
  tags?: string[];             // Tags for group invalidation
  priority?: 'low' | 'normal' | 'high'; // Cache priority
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
  hits: number;
}

export class CacheManager {
  private memoryCache: LRUCache<string, CacheEntry<any>>;
  private pendingRevalidations = new Map<string, Promise<any>>();
  private tagIndex = new Map<string, Set<string>>(); // tag -> keys mapping
  private stats = {
    hits: 0,
    misses: 0,
    revalidations: 0,
    evictions: 0,
  };
  
  constructor(options: {
    maxSize?: number;
    defaultTTL?: number;
  } = {}) {
    this.memoryCache = new LRUCache({
      max: options.maxSize || 500,
      ttl: options.defaultTTL || 1000 * 60 * 5, // 5 minutes default
      updateAgeOnGet: true,
      updateAgeOnHas: true,
      dispose: () => {
        this.stats.evictions++;
      },
    });
  }
  
  /**
   * Get value from cache or fetch if not available
   */
  async get<T>(
    key: string,
    fetcher?: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T | null> {
    // Check memory cache
    const cached = this.memoryCache.get(key);
    
    if (cached) {
      cached.hits++;
      this.stats.hits++;
      
      // Check if expired
      const isExpired = Date.now() - cached.timestamp > cached.ttl;
      
      if (!isExpired) {
        return cached.data;
      }
      
      // Handle stale-while-revalidate
      if (options.staleWhileRevalidate && fetcher) {
        this.revalidateInBackground(key, fetcher, options);
        return cached.data; // Return stale data
      }
    } else {
      this.stats.misses++;
    }
    
    // Fetch fresh data if fetcher provided
    if (fetcher) {
      // Check if already revalidating
      const pending = this.pendingRevalidations.get(key);
      if (pending) {
        return pending;
      }
      
      const promise = this.fetchAndCache(key, fetcher, options);
      this.pendingRevalidations.set(key, promise);
      
      try {
        const result = await promise;
        return result;
      } finally {
        this.pendingRevalidations.delete(key);
      }
    }
    
    return null;
  }
  
  /**
   * Set value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const ttl = options.ttl || 1000 * 60 * 5; // 5 minutes default
    const tags = options.tags || [];
    
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl,
      tags,
      hits: 0,
    };
    
    // Set in memory cache
    this.memoryCache.set(key, entry);
    
    // Update tag index
    tags.forEach(tag => {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    });
  }
  
  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.memoryCache.has(key);
  }
  
  /**
   * Delete specific key from cache
   */
  delete(key: string): void {
    const entry = this.memoryCache.get(key);
    if (entry) {
      // Remove from tag index
      entry.tags.forEach(tag => {
        this.tagIndex.get(tag)?.delete(key);
      });
    }
    
    this.memoryCache.delete(key);
  }
  
  /**
   * Invalidate cache by key or tag
   */
  async invalidate(keyOrTag: string): Promise<void> {
    // Check if it's a tag
    const taggedKeys = this.tagIndex.get(keyOrTag);
    
    if (taggedKeys && taggedKeys.size > 0) {
      // Invalidate all keys with this tag
      for (const key of taggedKeys) {
        this.delete(key);
      }
      this.tagIndex.delete(keyOrTag);
    } else {
      // Invalidate single key
      this.delete(keyOrTag);
    }
  }
  
  /**
   * Invalidate keys matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.delete(key);
      }
    }
  }
  
  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
    this.tagIndex.clear();
    this.pendingRevalidations.clear();
  }
  
  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    revalidations: number;
    evictions: number;
    tags: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    
    return {
      size: this.memoryCache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      revalidations: this.stats.revalidations,
      evictions: this.stats.evictions,
      tags: this.tagIndex.size,
    };
  }
  
  /**
   * Get all keys in cache
   */
  keys(): string[] {
    return Array.from(this.memoryCache.keys());
  }
  
  /**
   * Get keys by tag
   */
  getKeysByTag(tag: string): string[] {
    return Array.from(this.tagIndex.get(tag) || []);
  }
  
  /**
   * Prune expired entries
   */
  prune(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.delete(key);
      }
    }
  }
  
  private async fetchAndCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    const value = await fetcher();
    await this.set(key, value, options);
    return value;
  }
  
  private async revalidateInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<void> {
    this.stats.revalidations++;
    
    // Don't await - let it run in background
    this.fetchAndCache(key, fetcher, options).catch(error => {
      console.error(`Failed to revalidate cache for ${key}:`, error);
    });
  }
}

// Global cache instance with namespace support
class NamespacedCacheManager {
  private caches = new Map<string, CacheManager>();
  
  getNamespace(namespace: string): CacheManager {
    if (!this.caches.has(namespace)) {
      this.caches.set(namespace, new CacheManager());
    }
    return this.caches.get(namespace)!;
  }
  
  clearNamespace(namespace: string): void {
    this.caches.get(namespace)?.clear();
  }
  
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    this.caches.clear();
  }
  
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [namespace, cache] of this.caches) {
      stats[namespace] = cache.getStats();
    }
    return stats;
  }
}

// Export global instances
export const cache = new CacheManager();
export const namespacedCache = new NamespacedCacheManager();

export function useCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await cache.get(key, fetcher, options);
      setData(result);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, options]);
  
  const refresh = useCallback(async () => {
    cache.delete(key);
    await loadData();
  }, [key, loadData]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  return { data, loading, error, refresh };
}

// Decorator for caching method results
export function cached(options: CacheOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const key = `${target.constructor.name}.${propertyKey}:${JSON.stringify(args)}`;
      
      return cache.get(
        key,
        () => originalMethod.apply(this, args),
        options
      );
    };
    
    return descriptor;
  };
}
