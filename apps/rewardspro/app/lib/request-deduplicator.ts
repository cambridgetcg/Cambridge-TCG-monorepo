// Request deduplication to prevent duplicate API calls
export interface DedupeOptions {
  ttl?: number; // Time to live for cached results
  key?: string; // Custom cache key
}

class RequestDeduplicator {
  private pending = new Map<string, Promise<any>>();
  private cache = new Map<string, { data: any; timestamp: number }>();
  private defaultTTL = 5000; // 5 seconds default
  
  /**
   * Deduplicates requests - if the same request is in flight, returns the existing promise
   * Also caches results for a short time to prevent rapid repeated requests
   */
  async dedupe<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: DedupeOptions = {}
  ): Promise<T> {
    const cacheKey = options.key || key;
    const ttl = options.ttl ?? this.defaultTTL;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    
    // Check if request is already in flight
    if (this.pending.has(cacheKey)) {
      return this.pending.get(cacheKey)!;
    }
    
    // Start new request
    const promise = fetcher()
      .then(data => {
        // Cache the result
        if (ttl > 0) {
          this.cache.set(cacheKey, {
            data,
            timestamp: Date.now(),
          });
        }
        return data;
      })
      .finally(() => {
        // Clean up pending request
        this.pending.delete(cacheKey);
      });
    
    this.pending.set(cacheKey, promise);
    return promise;
  }
  
  /**
   * Clears all pending requests and cached data
   */
  clear(): void {
    this.pending.clear();
    this.cache.clear();
  }
  
  /**
   * Clears specific key from cache and pending
   */
  invalidate(key: string): void {
    this.pending.delete(key);
    this.cache.delete(key);
  }
  
  /**
   * Clears keys matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    for (const key of this.pending.keys()) {
      if (regex.test(key)) {
        this.pending.delete(key);
      }
    }
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Gets current stats
   */
  getStats(): {
    pendingRequests: number;
    cachedResults: number;
    cacheKeys: string[];
  } {
    return {
      pendingRequests: this.pending.size,
      cachedResults: this.cache.size,
      cacheKeys: Array.from(this.cache.keys()),
    };
  }
}

// Global instance
export const deduplicator = new RequestDeduplicator();

// Batch request deduplicator for aggregating multiple requests
export class BatchDeduplicator<K, V> {
  private batch = new Map<K, Array<(value: V) => void>>();
  private timer?: NodeJS.Timeout;
  private batchDelay: number;
  private batchSize: number;
  private fetcher: (keys: K[]) => Promise<Map<K, V>>;
  
  constructor(
    fetcher: (keys: K[]) => Promise<Map<K, V>>,
    options: {
      batchDelay?: number;
      batchSize?: number;
    } = {}
  ) {
    this.fetcher = fetcher;
    this.batchDelay = options.batchDelay ?? 10; // 10ms default
    this.batchSize = options.batchSize ?? 100; // 100 items max per batch
  }
  
  /**
   * Adds a request to the batch
   */
  async get(key: K): Promise<V> {
    return new Promise((resolve) => {
      if (!this.batch.has(key)) {
        this.batch.set(key, []);
      }
      
      this.batch.get(key)!.push(resolve);
      
      // Schedule batch processing
      this.scheduleBatch();
    });
  }
  
  private scheduleBatch(): void {
    if (this.timer) {
      return; // Already scheduled
    }
    
    this.timer = setTimeout(() => {
      this.processBatch();
    }, this.batchDelay);
  }
  
  private async processBatch(): Promise<void> {
    this.timer = undefined;
    
    if (this.batch.size === 0) {
      return;
    }
    
    // Take items from batch (up to batchSize)
    const keys = Array.from(this.batch.keys()).slice(0, this.batchSize);
    const currentBatch = new Map<K, Array<(value: V) => void>>();
    
    for (const key of keys) {
      currentBatch.set(key, this.batch.get(key)!);
      this.batch.delete(key);
    }
    
    try {
      // Fetch all keys at once
      const results = await this.fetcher(keys);
      
      // Resolve all promises
      for (const [key, resolvers] of currentBatch) {
        const value = results.get(key);
        if (value !== undefined) {
          resolvers.forEach(resolve => resolve(value));
        }
      }
    } catch (error) {
      // Reject all promises on error
      console.error('Batch fetch error:', error);
      // You might want to handle this differently
    }
    
    // Process next batch if there are more items
    if (this.batch.size > 0) {
      this.scheduleBatch();
    }
  }
}

// Utility function for creating deduped loaders
export function createDedupedLoader<T>(
  loadFn: (request: Request) => Promise<T>,
  keyFn: (request: Request) => string
) {
  return async (request: Request): Promise<T> => {
    const key = keyFn(request);
    return deduplicator.dedupe(key, () => loadFn(request));
  };
}