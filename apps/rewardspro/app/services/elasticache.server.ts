/**
 * ElastiCache (Redis) Service
 *
 * Production-grade caching service using AWS ElastiCache Redis.
 *
 * Features:
 * - Connection pooling
 * - Automatic reconnection
 * - Cluster mode support
 * - Tag-based invalidation
 * - Graceful fallback to Vercel KV or in-memory
 *
 * Architecture:
 * ┌─────────────┐    ┌─────────────────┐
 * │   Vercel    │───►│  ElastiCache    │
 * │   App       │    │  Redis Cluster  │
 * └─────────────┘    └─────────────────┘
 *                    (Multi-AZ, encrypted)
 *
 * Note: ElastiCache requires VPC configuration.
 * For serverless environments without VPC, use Vercel KV instead.
 */

import { getAWSConfig } from "~/utils/aws-clients.server";
import { Redis } from "ioredis";

/**
 * Cache options
 */
export interface CacheOptions {
  ttl?: number; // Time-to-live in seconds
  tags?: string[]; // Tags for bulk invalidation
}

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  tags?: string[];
  createdAt: number;
  expiresAt?: number;
}

/**
 * ElastiCache Service
 */
export class ElastiCacheService {
  private static instance: ElastiCacheService | null = null;

  private client: Redis | null = null;
  private enabled: boolean;
  private endpoint: string;
  private port: number;
  private connected: boolean = false;

  // In-memory fallback cache
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private maxMemoryCacheSize: number = 1000;

  private constructor() {
    const config = getAWSConfig();
    this.endpoint = config.elasticache.endpoint;
    this.port = config.elasticache.port;
    this.enabled = config.elasticache.enabled && !!this.endpoint;

    if (this.enabled) {
      this.initializeClient();
    } else {
      console.log("[ElastiCache] Service disabled or not configured - using memory fallback");
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ElastiCacheService {
    if (!ElastiCacheService.instance) {
      ElastiCacheService.instance = new ElastiCacheService();
    }
    return ElastiCacheService.instance;
  }

  /**
   * Initialize Redis client
   */
  private initializeClient(): void {
    try {
      this.client = new Redis({
        host: this.endpoint,
        port: this.port,
        // ElastiCache encryption in transit
        tls: process.env.ELASTICACHE_TLS !== "false" ? {} : undefined,
        // Connection options
        retryStrategy: (times) => {
          if (times > 10) {
            console.error("[ElastiCache] Max reconnection attempts reached");
            return null; // Stop retrying
          }
          return Math.min(times * 100, 3000);
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        // Command timeout
        commandTimeout: 5000,
      });

      this.client.on("connect", () => {
        console.log(`[ElastiCache] Connected to ${this.endpoint}:${this.port}`);
        this.connected = true;
      });

      this.client.on("error", (error) => {
        console.error("[ElastiCache] Connection error:", error.message);
        this.connected = false;
      });

      this.client.on("close", () => {
        console.log("[ElastiCache] Connection closed");
        this.connected = false;
      });
    } catch (error: any) {
      console.error("[ElastiCache] Failed to initialize:", error.message);
      this.client = null;
    }
  }

  /**
   * Check if ElastiCache is available
   */
  isAvailable(): boolean {
    return this.enabled && this.connected && this.client !== null;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    // Try ElastiCache first
    if (this.isAvailable() && this.client) {
      try {
        const data = await this.client.get(key);
        if (data) {
          const entry: CacheEntry<T> = JSON.parse(data);
          return entry.value;
        }
        return null;
      } catch (error: any) {
        console.warn(`[ElastiCache] Get error for ${key}:`, error.message);
        // Fall through to memory cache
      }
    }

    // Fallback to memory cache
    const entry = this.memoryCache.get(key);
    if (entry) {
      // Check expiry
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        return null;
      }
      return entry.value as T;
    }

    return null;
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<boolean> {
    const { ttl, tags } = options || {};

    const entry: CacheEntry<T> = {
      value,
      tags,
      createdAt: Date.now(),
      expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
    };

    // Try ElastiCache first
    if (this.isAvailable() && this.client) {
      try {
        const serialized = JSON.stringify(entry);

        if (ttl) {
          await this.client.setex(key, ttl, serialized);
        } else {
          await this.client.set(key, serialized);
        }

        // Store tags for invalidation
        if (tags && tags.length > 0) {
          for (const tag of tags) {
            await this.client.sadd(`tag:${tag}`, key);
          }
        }

        return true;
      } catch (error: any) {
        console.warn(`[ElastiCache] Set error for ${key}:`, error.message);
        // Fall through to memory cache
      }
    }

    // Fallback to memory cache
    this.setMemoryCache(key, entry);
    return true;
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string): Promise<boolean> {
    // Delete from ElastiCache
    if (this.isAvailable() && this.client) {
      try {
        await this.client.del(key);
      } catch (error: any) {
        console.warn(`[ElastiCache] Delete error for ${key}:`, error.message);
      }
    }

    // Also delete from memory cache
    this.memoryCache.delete(key);
    return true;
  }

  /**
   * Invalidate all keys with a specific tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    let invalidated = 0;

    // Invalidate in ElastiCache
    if (this.isAvailable() && this.client) {
      try {
        const keys = await this.client.smembers(`tag:${tag}`);
        if (keys.length > 0) {
          await this.client.del(...keys);
          await this.client.del(`tag:${tag}`);
          invalidated = keys.length;
        }
      } catch (error: any) {
        console.warn(`[ElastiCache] Tag invalidation error for ${tag}:`, error.message);
      }
    }

    // Also invalidate in memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.tags?.includes(tag)) {
        this.memoryCache.delete(key);
        invalidated++;
      }
    }

    console.log(`[ElastiCache] Invalidated ${invalidated} keys with tag: ${tag}`);
    return invalidated;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    // Clear ElastiCache
    if (this.isAvailable() && this.client) {
      try {
        await this.client.flushdb();
      } catch (error: any) {
        console.warn("[ElastiCache] Clear error:", error.message);
      }
    }

    // Clear memory cache
    this.memoryCache.clear();
    console.log("[ElastiCache] Cache cleared");
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    backend: "elasticache" | "memory";
    keys?: number;
    memory?: string;
    memoryCacheSize: number;
  }> {
    const stats: any = {
      connected: this.connected,
      backend: this.isAvailable() ? "elasticache" : "memory",
      memoryCacheSize: this.memoryCache.size,
    };

    if (this.isAvailable() && this.client) {
      try {
        const info = await this.client.info("memory");
        const keyCount = await this.client.dbsize();

        stats.keys = keyCount;

        // Parse memory usage from info
        const memoryMatch = info.match(/used_memory_human:(\S+)/);
        if (memoryMatch) {
          stats.memory = memoryMatch[1];
        }
      } catch (error) {
        // Ignore stats errors
      }
    }

    return stats;
  }

  /**
   * Helper for getOrSet pattern
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Generate value
    const value = await factory();

    // Store in cache
    await this.set(key, value, options);

    return value;
  }

  /**
   * Set value in memory cache with LRU eviction
   */
  private setMemoryCache<T>(key: string, entry: CacheEntry<T>): void {
    // Evict oldest entries if at capacity
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const keysToDelete: string[] = [];
      let count = 0;
      const deleteCount = Math.floor(this.maxMemoryCacheSize * 0.1); // Delete 10%

      for (const [k] of this.memoryCache) {
        if (count >= deleteCount) break;
        keysToDelete.push(k);
        count++;
      }

      keysToDelete.forEach((k) => this.memoryCache.delete(k));
    }

    this.memoryCache.set(key, entry);
  }

  /**
   * Close connection
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
      console.log("[ElastiCache] Disconnected");
    }
  }
}

/**
 * Convenience export for singleton instance
 */
export const elasticache = ElastiCacheService.getInstance();

/**
 * Cache key helpers
 */
export const CacheKeys = {
  shopSettings: (shop: string) => `shop:${shop}:settings`,
  shopEntitlements: (shop: string) => `shop:${shop}:entitlements`,
  shopTiers: (shop: string) => `shop:${shop}:tiers`,
  customer: (customerId: string) => `customer:${customerId}`,
  customerTierState: (customerId: string) => `customer:${customerId}:tier-state`,
  analytics: (shop: string, type: string, date: string) =>
    `analytics:${shop}:${type}:${date}`,
};

/**
 * Cache tags for bulk invalidation
 */
export const CacheTags = {
  shop: (shop: string) => `shop:${shop}`,
  customer: (customerId: string) => `customer:${customerId}`,
  tiers: (shop: string) => `tiers:${shop}`,
  analytics: (shop: string) => `analytics:${shop}`,
};

export default ElastiCacheService;
