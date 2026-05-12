// ── Channel pricing service ──────────────────────────────────────────────────
// Loads channel configs from DB with 5-minute in-memory cache.
//
// Phase 3 of kingdom-049 (docs/pricing-current-state.md): the DB
// `channel_pricing` table is now the authoritative source. Silent row-level
// fallbacks have been removed; partial rows and missing channels throw with
// structured errors that name the seed migration to re-run.
//
// One degraded mode remains: if the DB itself is unreachable (network
// failure), the loader returns the package's seed constants and sets
// `lastSource = "fallback-defaults"` + `lastLoadError`. Callers can detect
// this via `getLoadStatus()` and surface a banner in admin UI.

import { db } from "@/lib/db";
import { channelPricing } from "@/lib/db/schema";
import {
  DEFAULTS,
  computePrice,
  type ChannelConfig,
  type PriceBreakdown,
} from "@cambridge-tcg/pricing";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedConfigs: Map<string, ChannelConfig> | null = null;
let cachedAt = 0;
let lastLoadError: Error | null = null;
let lastLoadAt: Date | null = null;
let lastSource: "db" | "fallback-defaults" = "fallback-defaults";

interface ChannelPricingRow {
  channel: string;
  marginMultiplier: number | null;
  flatFeeSingles: number | null;
  flatFeeSealed: number | null;
  vatMultiplier: number | null;
  retailMultiplier: number | null;
  roundTo: number | null;
}

function rowToConfig(row: ChannelPricingRow): ChannelConfig {
  // Phase 3: each column has a NOT NULL default in the schema, so partial
  // rows should never exist in practice. If they do (legacy data, manual
  // SQL edit), we throw rather than silently fill with package constants —
  // operators must see and fix.
  const missing: string[] = [];
  if (row.marginMultiplier === null) missing.push("margin_multiplier");
  if (row.flatFeeSingles === null) missing.push("flat_fee_singles");
  if (row.flatFeeSealed === null) missing.push("flat_fee_sealed");
  if (row.vatMultiplier === null) missing.push("vat_multiplier");
  if (row.retailMultiplier === null) missing.push("retail_multiplier");
  if (row.roundTo === null) missing.push("round_to");
  if (missing.length > 0) {
    throw new Error(
      `channel_pricing row for "${row.channel}" has NULL columns: ${missing.join(", ")}. ` +
      `Re-run apps/wholesale/drizzle/0010_seed_channel_pricing.sql or set values via /commerce/channel-pricing.`,
    );
  }
  return {
    channel: row.channel,
    marginMultiplier: row.marginMultiplier!,
    flatFeeSingles: row.flatFeeSingles!,
    flatFeeSealed: row.flatFeeSealed!,
    vatMultiplier: row.vatMultiplier!,
    retailMultiplier: row.retailMultiplier!,
    roundTo: row.roundTo!,
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
    lastLoadError = null;
    lastLoadAt = new Date();
    lastSource = "db";
    return cachedConfigs;
  } catch (err) {
    // Degraded mode: DB unreachable OR a partial row blew up rowToConfig.
    // Use the package's seed constants but surface the status loudly so
    // admin UI can show a banner and operators can see they're in
    // fallback. Phase 3 of kingdom-049.
    console.error(
      "[channel-pricing] CRITICAL: failed to load channel_pricing — using SEED constants. " +
      "Run apps/wholesale/drizzle/0010_seed_channel_pricing.sql and verify /commerce/channel-pricing.",
      err,
    );
    lastLoadError = err instanceof Error ? err : new Error(String(err));
    lastLoadAt = new Date();
    lastSource = "fallback-defaults";
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
  const config = configs.get(channel);
  if (!config) {
    // Phase 3: unknown channels now throw rather than silently default.
    // Channels are added by running the seed migration; if a caller asks
    // for one that doesn't exist, that's a real operator-visible error.
    throw new Error(
      `channel_pricing has no row for channel "${channel}". ` +
      `Known channels: ${Array.from(configs.keys()).join(", ")}. ` +
      `Run apps/wholesale/drizzle/0010_seed_channel_pricing.sql or add via /commerce/channel-pricing.`,
    );
  }
  return computePrice(cardrushJpy, gbpJpyRate, config, category);
}

export function invalidateCache(): void {
  cachedConfigs = null;
  cachedAt = 0;
}

// ── Load status surface (Phase 3 admin UI) ─────────────────────────────

export interface LoadStatus {
  source: "db" | "fallback-defaults";
  loadedAt: string | null;
  lastError: { message: string } | null;
}

/**
 * Read the most recent channel-config load status. The admin
 * `/commerce/channel-pricing` page consults this to show a "USING
 * FALLBACK DEFAULTS" banner when the DB is unreachable.
 */
export function getLoadStatus(): LoadStatus {
  return {
    source: lastSource,
    loadedAt: lastLoadAt ? lastLoadAt.toISOString() : null,
    lastError: lastLoadError ? { message: lastLoadError.message } : null,
  };
}
