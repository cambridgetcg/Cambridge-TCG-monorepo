// Base repository pattern for data access layer
import type { Decimal } from '@prisma/client/runtime/library';

export interface PaginationOptions {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
  skip?: number;
  take?: number;
}

export interface QueryOptions extends PaginationOptions {
  sortKey?: string;
  reverse?: boolean;
  query?: string;
  where?: Record<string, any>;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export abstract class BaseRepository<T> {
  protected cache: Map<string, CacheEntry<T | T[]>> = new Map();
  protected cacheTimeout = 5 * 60 * 1000; // 5 minutes default
  protected shop: string;
  
  constructor(shop: string) {
    this.shop = shop;
  }
  
  protected getCacheKey(method: string, params?: any): string {
    return `${this.shop}:${method}:${JSON.stringify(params || {})}`;
  }
  
  protected isCacheValid(entry: CacheEntry<T | T[]>): boolean {
    return Date.now() - entry.timestamp < this.cacheTimeout;
  }
  
  protected setCache(key: string, data: T | T[]): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }
  
  protected getFromCache(key: string): T | T[] | null {
    const cached = this.cache.get(key);
    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }
    return null;
  }
  
  protected invalidateCache(pattern?: string): void {
    if (pattern) {
      // Invalidate entries matching pattern
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all cache for this shop
      for (const key of this.cache.keys()) {
        if (key.startsWith(this.shop)) {
          this.cache.delete(key);
        }
      }
    }
  }
  
  // Convert Decimal to number for JSON serialization
  protected serializeDecimal(value: Decimal | null | undefined): number {
    if (!value) return 0;
    return parseFloat(value.toString());
  }
  
  abstract findAll(options?: QueryOptions): Promise<T[]>;
  abstract findById(id: string): Promise<T | null>;
  abstract create(input: Partial<T>): Promise<T>;
  abstract update(id: string, input: Partial<T>): Promise<T>;
  abstract delete(id: string): Promise<boolean>;
}