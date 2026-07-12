/**
 * Daily price snapshot — scrapes CardRush prices for all active cards and
 * stores results in price_archive + price_history, then updates cards table.
 *
 * Concurrency: 8 workers, 300 ms inter-request delay per worker.
 * DB writes: batched in groups of 100.
 */

import { db } from "@/lib/db";
import { cards, games, priceArchive } from "@/lib/db/schema";
import { scrapeCardrushPrice } from "@/lib/cardrush-scraper";
import { fetchGbpJpyRate } from "@/lib/fx";
import { calculatePriceByCategory } from "@/lib/pricing";
import { logPriceChange } from "@/lib/price-change-log";
import { eq, inArray, isNotNull, and } from "drizzle-orm";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
} from "@cambridge-tcg/data-ingest";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface SnapshotOptions {
  gameIds?: number[];
  date?: string; // ISO date string, defaults to today
}

export interface SnapshotResult {
  snapshotDate: string;
  gamesProcessed: number;
  cardsProcessed: number;
  cardsUpdated: number;
  cardsFailed: number;
  durationMs: number;
}

interface CardRow {
  id: number;
  sku: string;
  setCode: string | null;
  category: "singles" | "sealed";
  cardrushUrl: string;
  gameId: number | null;
  // Previous values — carried through so the price-change log can record
  // before/after when (and only when) the snapshot produced a delta.
  // See docs/connections/the-pricing-arrow.md (S17) Act 4.
  previousPrice: number | null;
  previousBaseGbp: number | null;
}

interface CardUpdate {
  cardId: number;
  sku: string;
  setCode: string | null;
  category: "singles" | "sealed";
  cardrushJpy: number;
  gbpJpyRate: number;
  baseGbp: number;
  price: number;
  // Carried for the price-change log delta check; not written to DB.
  previousPrice: number | null;
  previousBaseGbp: number | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main function
// ──────────────────────────────────────────────────────────────────────────────

export async function runDailySnapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    throw new Error(CARDRUSH_BLOCK_REASON);
  }
  const startMs = Date.now();
  const snapshotDate = options?.date ?? new Date().toISOString().slice(0, 10);

  // ── 1. Determine which games to process ──────────────────────────────────
  let gameIds = options?.gameIds;
  if (!gameIds || gameIds.length === 0) {
    const activeGames = await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.active, true));
    gameIds = activeGames.map((g) => g.id);
  }

  // ── 2. Load cards with cardrush_url ──────────────────────────────────────
  const cardRows = await db
    .select({
      id: cards.id,
      sku: cards.sku,
      setCode: cards.setCode,
      category: cards.category,
      cardrushUrl: cards.cardrushUrl,
      gameId: cards.gameId,
      previousPrice: cards.price,
      previousBaseGbp: cards.baseGbp,
    })
    .from(cards)
    .where(
      and(
        inArray(cards.gameId, gameIds),
        isNotNull(cards.cardrushUrl),
      ),
    ) as CardRow[];

  const total = cardRows.length;
  let cardsUpdated = 0;
  let cardsFailed = 0;

  // ── 3. Fetch live GBP/JPY rate once ─────────────────────────────────────
  const gbpJpyRate = await fetchGbpJpyRate();

  // ── 4. Worker pool (8 concurrent, 300 ms delay per worker) ───────────────
  const CONCURRENCY = 8;
  const DELAY_MS = 300;

  const updates: CardUpdate[] = [];

  // Split into chunks for each worker
  const chunks = chunkArray(cardRows, Math.ceil(total / CONCURRENCY));

  await Promise.all(
    chunks.map(async (chunk) => {
      for (const card of chunk) {
        const result = await scrapeCardrushPrice(card.cardrushUrl);

        if (result.priceJpy === null) {
          cardsFailed++;
        } else {
          const { baseGbp, price } = calculatePriceByCategory(
            result.priceJpy,
            gbpJpyRate,
            card.category,
          );

          updates.push({
            cardId: card.id,
            sku: card.sku,
            setCode: card.setCode,
            category: card.category,
            cardrushJpy: result.priceJpy,
            gbpJpyRate,
            baseGbp,
            price,
            previousPrice: card.previousPrice,
            previousBaseGbp: card.previousBaseGbp,
          });
        }

        // Rate-limit: 300 ms between each request per worker
        await sleep(DELAY_MS);
      }
    }),
  );

  // ── 5. Batch DB writes (100 at a time) ───────────────────────────────────
  const BATCH_SIZE = 100;
  const now = new Date();

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    // ── 5a. UPSERT price_archive ──────────────────────────────────────────
    await db
      .insert(priceArchive)
      .values(
        batch.map((u) => ({
          cardId: u.cardId,
          snapshotDate,
          sku: u.sku,
          setCode: u.setCode,
          category: u.category,
          cardrushJpy: u.cardrushJpy,
          gbpJpyRate: u.gbpJpyRate,
          baseGbp: u.baseGbp,
          price: u.price,
        })),
      )
      .onConflictDoUpdate({
        target: [priceArchive.cardId, priceArchive.snapshotDate],
        set: {
          cardrushJpy: priceArchive.cardrushJpy,
          gbpJpyRate: priceArchive.gbpJpyRate,
          baseGbp: priceArchive.baseGbp,
          price: priceArchive.price,
        },
      });

    // ── 5b. price_history was dropped in Phase 4 of kingdom-049.
    //   priceArchive is the canonical history; the JPY-inputs-only
    //   sibling table is redundant. See drizzle/0011_drop_price_history.sql.

    // ── 5c. Update cards table ────────────────────────────────────────────
    for (const u of batch) {
      await db
        .update(cards)
        .set({
          cardrushJpy: u.cardrushJpy,
          gbpJpyRate: u.gbpJpyRate,
          baseGbp: u.baseGbp,
          price: u.price,
          lastSyncedAt: now,
        })
        .where(eq(cards.id, u.cardId));

      // Append to card_price_change_log if (and only if) price or
      // baseGbp differs from previous values. Snapshots run daily for
      // thousands of cards; logging only deltas keeps the log useful
      // as an answer to "when did this card's price change?" rather
      // than "did this card get snapshot today?".
      // See docs/connections/the-pricing-arrow.md (S17) and Phase 2 of
      // kingdom-049 in docs/pricing-current-state.md.
      const priceDelta =
        u.previousPrice === null || Math.abs(Number(u.previousPrice) - u.price) > 0.001;
      const baseDelta =
        u.previousBaseGbp === null ||
        Math.abs(Number(u.previousBaseGbp) - u.baseGbp) > 0.001;
      if (priceDelta || baseDelta) {
        await logPriceChange({
          cardId: u.cardId,
          action: "snapshot",
          source: "cardrush-cron",
          actorLabel: "cron:price-snapshot",
          before: {
            price: u.previousPrice,
            baseGbp: u.previousBaseGbp,
          },
          after: {
            price: u.price,
            baseGbp: u.baseGbp,
            cardrushJpy: u.cardrushJpy,
            gbpJpyRate: u.gbpJpyRate,
          },
          metadata: { snapshotDate, category: u.category },
        });
      }
    }

    cardsUpdated += batch.length;
  }

  return {
    snapshotDate,
    gamesProcessed: gameIds.length,
    cardsProcessed: total,
    cardsUpdated,
    cardsFailed,
    durationMs: Date.now() - startMs,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
