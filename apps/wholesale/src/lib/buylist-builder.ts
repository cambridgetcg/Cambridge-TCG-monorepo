/**
 * Buylist Builder
 *
 * Queries the wholesale DB and builds the trade-in buylist JSON for
 * tradein.cambridgetcg.com. Uses the most recent price_archive snapshot
 * (today's if available, otherwise the latest available date).
 *
 * Called by:
 *   - /api/cron/rebuild-buylist  (daily Vercel cron, 3am UTC)
 *   - /api/admin/rebuild-buylist (manual admin trigger)
 */

import { db } from "./db";
import { cards, priceArchive, games } from "./db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "./source-publication-policy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuylistItem {
  sku: string;
  cardNumber: string;
  setCode: string;
  setName: string;
  name: string;
  rarity: string;
  isParallel: boolean;
  sourceJpy: number;
  sourceGbp: number;
  priceSource: "a-minus";
  cashPrice: number;
  creditPrice: number;
  imageUrl: string;
  imageFallback: string | null;
  cardrushUrl: string;
  wholesalePrice: number;
  stock: number;
}

export interface BuylistData {
  version: 3;
  generatedAt: string;
  fxRate: number;
  pricing: {
    source: string;
    cashRate: number;
    creditRate: number;
    note: string;
  };
  stats: {
    totalCards: number;
    setsIncluded: number;
    aPriced: number;
    wholesaleFallback: number;
    avgCashPrice: number;
    totalCashValue: number;
    totalCreditValue: number;
  };
  sets: Record<string, string>;
  items: BuylistItem[];
}

// ---------------------------------------------------------------------------
// Set name map (hardcoded)
// ---------------------------------------------------------------------------

const SET_NAMES: Record<string, string> = {
  OP01: "Romance Dawn",
  OP02: "Paramount War",
  OP03: "Pillars of Strength",
  OP04: "Kingdoms of Intrigue",
  OP05: "Awakening of the New Era",
  OP06: "Wings of the Captain",
  OP07: "500 Years in the Future",
  OP08: "Two Legends",
  OP09: "The Four Emperors",
  OP10: "Royal Blood",
  OP11: "Uta",
  OP12: "Gear 5",
  OP13: "The Three Brothers",
  OP14: "Strongest of the Strong",
  OP15: "A Fist of Divine Speed",
  EB01: "Extra Booster 01",
  EB02: "Extra Booster 02",
  EB03: "Extra Booster 03",
  EB04: "Extra Booster 04",
  ST01: "Starter Deck 01",
  ST02: "Starter Deck 02",
  ST03: "Starter Deck 03",
  ST04: "Starter Deck 04",
  ST05: "Starter Deck 05",
  ST06: "Starter Deck 06",
  ST07: "Starter Deck 07",
  ST08: "Starter Deck 08",
  ST09: "Starter Deck 09",
  ST10: "Starter Deck 10",
  ST11: "Starter Deck 11",
  ST12: "Starter Deck 12",
  ST13: "Starter Deck 13",
  ST14: "Starter Deck 14",
  ST15: "Starter Deck 15",
  ST16: "Starter Deck 16",
  ST17: "Starter Deck 17",
  ST18: "Starter Deck 18",
  ST19: "Starter Deck 19",
  ST20: "Starter Deck 20",
};

function getSetName(setCode: string): string {
  return SET_NAMES[setCode] ?? setCode;
}

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------

const CASH_RATE = 0.77;
const CREDIT_RATE = 0.88;
const CASH_MIN = 2.20;

/** Round to nearest £0.05 */
function roundPrice(x: number): number {
  return Math.round(Math.round(x * 20) / 20 * 100) / 100;
}

function isParallel(rarity: string | null): boolean {
  if (!rarity) return false;
  return rarity.includes("/P") || rarity.endsWith("/SP");
}

// ---------------------------------------------------------------------------
// Natural sort comparator for setCode → cardNumber → sku
// ---------------------------------------------------------------------------

function naturalCompare(a: string, b: string): number {
  const re = /(\d+)/g;
  const aParts = a.split(re);
  const bParts = b.split(re);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const ap = aParts[i] ?? "";
    const bp = bParts[i] ?? "";
    if (ap === bp) continue;
    const an = parseInt(ap, 10);
    const bn = parseInt(bp, 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return ap < bp ? -1 : 1;
  }
  return 0;
}

function sortItems(items: BuylistItem[]): BuylistItem[] {
  return items.sort((a, b) => {
    const setDiff = naturalCompare(a.setCode, b.setCode);
    if (setDiff !== 0) return setDiff;
    const numDiff = naturalCompare(a.cardNumber, b.cardNumber);
    if (numDiff !== 0) return numDiff;
    return naturalCompare(a.sku, b.sku);
  });
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export async function buildBuylist(): Promise<BuylistData> {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    throw new Error(`Buylist publication is blocked. ${LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON}`);
  }
  // 1. Find the One Piece game_id
  const [opGame] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.id, 1))
    .limit(1);

  const gameId = opGame?.id ?? 1;

  // 2. Find the most recent snapshot date in price_archive for One Piece cards
  const latestDateResult = await db.execute(
    sql`
      SELECT pa.snapshot_date::text AS snapshot_date
      FROM price_archive pa
      JOIN cards c ON c.id = pa.card_id
      WHERE c.game_id = ${gameId}
        AND c.cardrush_url IS NOT NULL
        AND c.cardrush_url != ''
      ORDER BY pa.snapshot_date DESC
      LIMIT 1
    `
  );

  const latestDate = (latestDateResult as unknown as Array<{ snapshot_date: string }>)[0]?.snapshot_date;

  if (!latestDate) {
    throw new Error("No price_archive data found for One Piece cards");
  }

  console.log(`[buylist-builder] Using snapshot date: ${latestDate}`);

  // 3. Query all eligible cards with their latest price_archive row
  const rows = await db.execute(
    sql`
      SELECT
        c.id            AS card_id,
        c.sku,
        c.card_number,
        c.set_code,
        c.name,
        c.rarity,
        c.cardrush_url,
        c.image_url     AS image_fallback,
        c.price         AS wholesale_price,
        c.stock,
        pa.cardrush_jpy,
        pa.gbp_jpy_rate
      FROM cards c
      JOIN price_archive pa ON pa.card_id = c.id AND pa.snapshot_date = ${latestDate}
      WHERE c.game_id = ${gameId}
        AND c.cardrush_url IS NOT NULL
        AND c.cardrush_url != ''
        AND c.category = 'singles'
      ORDER BY c.set_code, c.card_number, c.sku
    `
  ) as unknown as Array<{
    card_id: number;
    sku: string;
    card_number: string;
    set_code: string | null;
    name: string | null;
    rarity: string | null;
    cardrush_url: string;
    image_fallback: string | null;
    wholesale_price: string | null; // numeric comes back as string
    stock: number;
    cardrush_jpy: number;
    gbp_jpy_rate: number;
  }>;

  // 4. Build items, applying business rules
  const items: BuylistItem[] = [];
  let totalFxRateSum = 0;
  let fxRateCount = 0;

  for (const row of rows) {
    const jpy = row.cardrush_jpy;
    const fxRate = row.gbp_jpy_rate;
    const setCode = row.set_code ?? "UNKNOWN";

    if (!jpy || !fxRate || fxRate === 0) continue;

    const refGbp = jpy / fxRate;
    const cashPrice = roundPrice(refGbp * CASH_RATE);
    const creditPrice = roundPrice(refGbp * CREDIT_RATE);

    // Apply minimum threshold
    if (cashPrice < CASH_MIN) continue;

    totalFxRateSum += fxRate;
    fxRateCount++;

    items.push({
      sku: row.sku,
      cardNumber: row.card_number,
      setCode,
      setName: getSetName(setCode),
      name: row.name ?? "",
      rarity: row.rarity ?? "",
      isParallel: isParallel(row.rarity),
      sourceJpy: jpy,
      sourceGbp: Math.round(refGbp * 100) / 100,
      priceSource: "a-minus",
      cashPrice,
      creditPrice,
      imageUrl: `https://jp-op-photos.s3.us-east-1.amazonaws.com/hires/${setCode}/${row.sku}.jpg`,
      imageFallback: row.image_fallback,
      cardrushUrl: row.cardrush_url,
      wholesalePrice: row.wholesale_price ? Math.round(Number(row.wholesale_price) * 100) / 100 : 0,
      stock: row.stock ?? 0,
    });
  }

  // 5. Sort items
  sortItems(items);

  // 6. Compute stats
  const avgFxRate = fxRateCount > 0 ? Math.round((totalFxRateSum / fxRateCount) * 100) / 100 : 0;
  const uniqueSets = new Set(items.map((i) => i.setCode));
  const totalCashValue = Math.round(items.reduce((s, i) => s + i.cashPrice, 0) * 100) / 100;
  const totalCreditValue = Math.round(items.reduce((s, i) => s + i.creditPrice, 0) * 100) / 100;
  const avgCashPrice = items.length > 0 ? Math.round((totalCashValue / items.length) * 100) / 100 : 0;

  // Build sets map (only sets present in items)
  const setsMap: Record<string, string> = {};
  for (const setCode of Array.from(uniqueSets).sort((a, b) => naturalCompare(a, b))) {
    setsMap[setCode] = getSetName(setCode);
  }

  const buylist: BuylistData = {
    version: 3,
    generatedAt: new Date().toISOString(),
    fxRate: avgFxRate,
    pricing: {
      source: "CardRush A- condition (primary) + wholesale base (fallback)",
      cashRate: CASH_RATE,
      creditRate: CREDIT_RATE,
      note: "Cash = 77% of ref GBP, Credit = 88% of ref GBP",
    },
    stats: {
      totalCards: items.length,
      setsIncluded: uniqueSets.size,
      aPriced: items.length,
      wholesaleFallback: 0,
      avgCashPrice,
      totalCashValue,
      totalCreditValue,
    },
    sets: setsMap,
    items,
  };

  console.log(`[buylist-builder] Built buylist: ${items.length} items across ${uniqueSets.size} sets (snapshot: ${latestDate})`);

  return buylist;
}
