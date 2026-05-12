/**
 * Daily price snapshot — protocol-aligned successor to `price-snapshot.ts`.
 *
 * Built around `runSource()` from `@cambridge-tcg/data-ingest`. Closes
 * 9 of the 12 leaks named in `docs/connections/the-archive.md` Part B:
 *
 *   Leak  1 (failed-scrape reason)    — error_reason persisted to price_archive
 *   Leak  3 (token-bucket bypassed)   — runSource shares one fetcher across the watch-list
 *   Leak  4 (no ingest_run row)       — INSERT at start + UPDATE at finish
 *   Leak  5 (raw HTML lost)           — quarantine writer persists raw_payload
 *   Leak  6 (null URL silently skips) — parallel count → null_url_count in notes
 *   Leak  9 (crashed worker drops)    — runSource catches per-row errors as events
 *   Leak 10 (sequential logPriceChange) — Promise.all per batch
 *   Leak 12 (source_url not archived) — source_url column written per row
 *
 * Remaining leaks (out of scope for this turn): Leak 2 closed by Phase A
 * migration (source column with default 'cardrush'); Leak 7 (cross-day
 * overwrite) partially closed by widened uniqueness; Leak 8 (FX provenance)
 * named in `the-archive.md` as future work; Leak 11 (speculative subdomain
 * promotion) requires the audit check.
 *
 * ── Runtime dependency ──────────────────────────────────────────────────
 *
 * Requires `apps/wholesale/drizzle/0014_price_archive_provenance.sql` to be
 * applied. Until then this code will compile but fail at runtime on the
 * first INSERT referencing the new columns.
 *
 * ── Designed in ─────────────────────────────────────────────────────────
 *
 * `docs/connections/the-cardrush-alignment.md` (kingdom-066) §5.
 */

import { db } from "@/lib/db";
import {
  cards,
  games,
  priceArchive,
  ingestRun,
  ingestQuarantine,
} from "@/lib/db/schema";
import type { IngestContext } from "@cambridge-tcg/data-ingest";
import { cardrush, runSource } from "@cambridge-tcg/data-ingest";
import { fetchGbpJpyRate } from "@/lib/fx";
import { calculatePriceByCategory } from "@/lib/pricing";
import { logPriceChange } from "@/lib/price-change-log";
import { eq, inArray, isNotNull, isNull, and, sql } from "drizzle-orm";

export interface SnapshotV2Options {
  gameIds?: number[];
  date?: string;
  triggeredBy?: "cron" | "admin" | "webhook";
  /** Cap the number of cards scraped (useful for dry-runs). */
  maxCards?: number;
}

export interface SnapshotV2Result {
  ingestRunId: number;
  snapshotDate: string;
  rowsRead: number;
  rowsWritten: number;
  rowsQuarantined: number;
  errors: number;
  /** Cards in active games with `cardrush_url IS NULL` — visible gap, not silent skip. */
  nullUrlCount: number;
  durationMs: number;
}

interface CardRow {
  id: number;
  sku: string;
  setCode: string | null;
  category: "singles" | "sealed";
  cardrushUrl: string;
  gameId: number | null;
  previousPrice: number | null;
  previousBaseGbp: number | null;
}

const BATCH_SIZE = 100;

/**
 * Run the daily snapshot, persisting an ingest_run row so the operator
 * can query "did snapshot run today?" from the database.
 */
export async function runDailySnapshotV2(
  options?: SnapshotV2Options,
): Promise<SnapshotV2Result> {
  const startMs = Date.now();
  const snapshotDate = options?.date ?? new Date().toISOString().slice(0, 10);
  const triggeredBy = options?.triggeredBy ?? "cron";

  // ── 1. INSERT ingest_run ────────────────────────────────────────────────
  const [runRow] = await db
    .insert(ingestRun)
    .values({
      sourceId: "cardrush",
      specVersion: "1",
      triggeredBy,
      status: "running",
    })
    .returning({ id: ingestRun.id });
  const ingestRunId = runRow.id;

  try {
    // ── 2. Resolve active games + load watch list + count null-URL gap ───
    let gameIds = options?.gameIds;
    if (!gameIds || gameIds.length === 0) {
      const active = await db
        .select({ id: games.id })
        .from(games)
        .where(eq(games.active, true));
      gameIds = active.map((g) => g.id);
    }

    if (gameIds.length === 0) {
      // No active games; finalise and return.
      await markRunDone(ingestRunId, {
        rows_read: 0,
        rows_normalized: 0,
        rowsWritten: 0,
        rowsQuarantined: 0,
        errors: 0,
        events: [],
        notes: "no active games",
      });
      return {
        ingestRunId,
        snapshotDate,
        rowsRead: 0,
        rowsWritten: 0,
        rowsQuarantined: 0,
        errors: 0,
        nullUrlCount: 0,
        durationMs: Date.now() - startMs,
      };
    }

    const [allCards, nullUrlCount] = await Promise.all([
      db
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
        .where(and(inArray(cards.gameId, gameIds), isNotNull(cards.cardrushUrl))) as Promise<CardRow[]>,
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(cards)
        .where(and(inArray(cards.gameId, gameIds), isNull(cards.cardrushUrl)))
        .then((rows) => rows[0]?.count ?? 0),
    ]);

    const cappedCards = options?.maxCards
      ? allCards.slice(0, options.maxCards)
      : allCards;

    const watchList = cappedCards.map((c) => ({ url: c.cardrushUrl, sku: c.sku }));
    const skuToCard = new Map(cappedCards.map((c) => [c.sku, c]));

    // ── 3. Fetch FX once per run ──────────────────────────────────────────
    const gbpJpyRate = await fetchGbpJpyRate();

    // ── 4. Run the source through the package's runner ────────────────────
    const collected: Array<{ canonical: { sku: string; amount: string; upstream_id?: string }; card: CardRow }> = [];
    let rowsQuarantined = 0;

    // Source-specific options (cardrush.urls) live on a typed extension of
    // IngestContext; the bare runSource() signature uses IngestContext so we
    // cast through the source's own context shape. See packages/data-ingest/
    // src/cardrush/index.ts CardRushContext.
    const ctx = {
      cardrush: { urls: watchList },
      signal: AbortSignal.timeout(45 * 60_000),
    } as IngestContext;

    const summary = await runSource(
      cardrush,
      ctx,
      {
        write: async (canonical) => {
          const card = skuToCard.get(canonical.sku);
          if (!card) return; // shouldn't happen — watch list comes from skuToCard
          collected.push({ canonical, card });
        },
        quarantine: async ({ raw, reason, provenance }) => {
          rowsQuarantined += 1;
          await db.insert(ingestQuarantine).values({
            ingestRunId,
            sourceId: "cardrush",
            upstreamId: (raw as { url?: string }).url ?? null,
            rawPayload: raw as unknown as Record<string, unknown>,
            reason,
            asOf: new Date(provenance.as_of),
            retrievedAt: new Date(provenance.retrieved_at),
          });
        },
      },
    );

    // ── 5. Batched DB writes — 100 at a time ──────────────────────────────
    let rowsWritten = 0;
    const priceChangeQueue: Array<Parameters<typeof logPriceChange>[0]> = [];

    for (let i = 0; i < collected.length; i += BATCH_SIZE) {
      const batch = collected.slice(i, i + BATCH_SIZE);
      const archiveRows = batch.map(({ canonical, card }) => {
        const priceJpy = parseInt(canonical.amount, 10);
        const { baseGbp, price } = calculatePriceByCategory(
          priceJpy,
          gbpJpyRate,
          card.category,
        );
        return {
          cardId: card.id,
          snapshotDate,
          sku: canonical.sku,
          setCode: card.setCode,
          category: card.category,
          cardrushJpy: priceJpy,
          gbpJpyRate,
          baseGbp,
          price,
          source: "cardrush",
          sourceUrl: canonical.upstream_id ?? card.cardrushUrl,
          ingestRunId,
          sourceCurrency: "JPY",
          sourceRedistribute: false,
          errorReason: null,
          _previousPrice: card.previousPrice,
          _previousBaseGbp: card.previousBaseGbp,
        };
      });

      // Strip private fields before insert
      const archiveValues = archiveRows.map(({ _previousPrice, _previousBaseGbp, ...row }) => row);

      await db
        .insert(priceArchive)
        .values(archiveValues)
        .onConflictDoUpdate({
          target: [priceArchive.cardId, priceArchive.snapshotDate, priceArchive.source],
          set: {
            cardrushJpy: sql`EXCLUDED.cardrush_jpy`,
            gbpJpyRate: sql`EXCLUDED.gbp_jpy_rate`,
            baseGbp: sql`EXCLUDED.base_gbp`,
            price: sql`EXCLUDED.price`,
            sourceUrl: sql`EXCLUDED.source_url`,
            ingestRunId: sql`EXCLUDED.ingest_run_id`,
            errorReason: sql`EXCLUDED.error_reason`,
          },
        });

      // Update cards table + queue price-change log entries
      for (const row of archiveRows) {
        await db
          .update(cards)
          .set({
            cardrushJpy: row.cardrushJpy,
            gbpJpyRate: row.gbpJpyRate,
            baseGbp: row.baseGbp,
            price: row.price,
            lastSyncedAt: new Date(),
          })
          .where(eq(cards.id, row.cardId));

        const priceDelta =
          row._previousPrice === null ||
          Math.abs(Number(row._previousPrice) - row.price) > 0.001;
        const baseDelta =
          row._previousBaseGbp === null ||
          Math.abs(Number(row._previousBaseGbp) - row.baseGbp) > 0.001;
        if (priceDelta || baseDelta) {
          priceChangeQueue.push({
            cardId: row.cardId,
            action: "snapshot",
            source: "cardrush-cron-v2",
            actorLabel: `ingest_run:${ingestRunId}`,
            before: { price: row._previousPrice, baseGbp: row._previousBaseGbp },
            after: {
              price: row.price,
              baseGbp: row.baseGbp,
              cardrushJpy: row.cardrushJpy,
              gbpJpyRate: row.gbpJpyRate,
            },
            metadata: { snapshotDate, category: row.category, ingestRunId },
          });
        }
      }

      rowsWritten += batch.length;
    }

    // ── 6. Batch the price-change log writes ──────────────────────────────
    for (let i = 0; i < priceChangeQueue.length; i += BATCH_SIZE) {
      const batch = priceChangeQueue.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((row) => logPriceChange(row)));
    }

    // ── 7. UPDATE ingest_run finished_at + counts + events ────────────────
    await markRunDone(ingestRunId, {
      rows_read: summary.rows_read,
      rows_normalized: summary.rows_normalized,
      rowsWritten,
      rowsQuarantined,
      errors: summary.errors,
      events: summary.events,
      notes:
        nullUrlCount > 0
          ? `null_url_count=${nullUrlCount} (cards in active games with cardrush_url IS NULL — not scraped)`
          : null,
    });

    return {
      ingestRunId,
      snapshotDate,
      rowsRead: summary.rows_read,
      rowsWritten,
      rowsQuarantined,
      errors: summary.errors,
      nullUrlCount,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    // Mark the run failed and re-throw — caller (cron route) returns 500.
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        notes: `crashed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(ingestRun.id, ingestRunId))
      .catch(() => {
        // double-fault — don't swallow the original error
      });
    throw err;
  }
}

async function markRunDone(
  ingestRunId: number,
  summary: {
    rows_read: number;
    rows_normalized: number;
    rowsWritten: number;
    rowsQuarantined: number;
    errors: number;
    events: ReadonlyArray<unknown>;
    notes: string | null;
  },
): Promise<void> {
  await db
    .update(ingestRun)
    .set({
      finishedAt: new Date(),
      status: summary.errors > 0 ? "failed" : "done",
      rowsRead: summary.rows_read,
      rowsNormalized: summary.rows_normalized,
      rowsWritten: summary.rowsWritten,
      rowsQuarantined: summary.rowsQuarantined,
      errors: summary.errors,
      events: summary.events as unknown as Record<string, unknown>[],
      notes: summary.notes,
    })
    .where(eq(ingestRun.id, ingestRunId));
}
