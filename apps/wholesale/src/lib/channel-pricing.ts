// ── Channel pricing service ──────────────────────────────────────────────────
// Loads channel configs from DB with 5-minute in-memory cache.
// Falls back to DEFAULTS when DB is unavailable or channel is unknown.

import { db } from "@/lib/db";
import { channelPricing } from "@/lib/db/schema";
import {
  DEFAULTS,
  computePrice,
  type ChannelConfig,
  type PriceBreakdown,
} from "@/lib/pricing";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedConfigs: Map<string, ChannelConfig> | null = null;
let cachedAt = 0;

function rowToConfig(row: {
  channel: string;
  marginMultiplier: number | null;
  flatFeeSingles: number | null;
  flatFeeSealed: number | null;
  vatMultiplier: number | null;
  retailMultiplier: number | null;
  roundTo: number | null;
}): ChannelConfig {
  const defaults = DEFAULTS[row.channel] ?? DEFAULTS.wholesale;
  return {
    channel: row.channel,
    marginMultiplier: row.marginMultiplier ?? defaults.marginMultiplier,
    flatFeeSingles: row.flatFeeSingles ?? defaults.flatFeeSingles,
    flatFeeSealed: row.flatFeeSealed ?? defaults.flatFeeSealed,
    vatMultiplier: row.vatMultiplier ?? defaults.vatMultiplier,
    retailMultiplier: row.retailMultiplier ?? defaults.retailMultiplier,
    roundTo: row.roundTo ?? defaults.roundTo,
  };
}

async function loadFromDb(): Promise<Map<string, ChannelConfig>> {
  const rows = await db.select().from(channelPricing);
  const map = new Map<string, ChannelConfig>();
  for (const row of rows) {
    map.set(row.channel, rowToConfig(row));
  }
  return map;
}

export async function getChannelConfigs(): Promise<Map<string, ChannelConfig>> {
  const now = Date.now();
  if (cachedConfigs && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfigs;
  }

  try {
    cachedConfigs = await loadFromDb();
    cachedAt = now;
    return cachedConfigs;
  } catch (err) {
    console.error("[channel-pricing] Failed to load from DB, using defaults:", err);
    // Return defaults as fallback
    const map = new Map<string, ChannelConfig>();
    for (const [key, val] of Object.entries(DEFAULTS)) {
      map.set(key, val);
    }
    return map;
  }
}

export async function priceForChannel(
  cardrushJpy: number,
  gbpJpyRate: number,
  channel: string,
  category: string | null,
): Promise<PriceBreakdown> {
  const configs = await getChannelConfigs();
  const config = configs.get(channel) ?? DEFAULTS[channel] ?? DEFAULTS.wholesale;
  return computePrice(cardrushJpy, gbpJpyRate, config, category);
}

export function invalidateCache(): void {
  cachedConfigs = null;
  cachedAt = 0;
}
