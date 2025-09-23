type CacheEntry = { value: any; expiresAt: number };

export class AnalyticsCache {
  private store = new Map<string, CacheEntry>();
  constructor(private defaultTtlMs = 60_000, private maxEntries = 500) {}

  get<T = any>(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.value as T;
  }

  set<T = any>(key: string, value: T, ttlMs?: number) {
    if (this.store.size >= this.maxEntries) {
      // naive eviction of first key
      const first = this.store.keys().next().value;
      if (first) this.store.delete(first);
    }
    this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  invalidate(prefix: string) {
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }
}

export const analyticsCache = new AnalyticsCache(90_000);