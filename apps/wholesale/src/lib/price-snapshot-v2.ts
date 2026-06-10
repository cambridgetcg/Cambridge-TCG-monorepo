/**
 * Price snapshot — protocol-aligned successor to `price-snapshot.ts`.
 *
 * Built around `runSource()` from `@cambridge-tcg/data-ingest`. Closes
 * 9 of the 12 leaks named in `docs/connections/the-archive.md` Part B:
 *
 *   Leak  1 (failed-scrape reason)    — error_reason persisted to quarantine
 *   Leak  3 (token-bucket bypassed)   — runSource shares one fetcher across the watch-list
 *   Leak  4 (no ingest_run row)       — INSERT at start + UPDATE at finish
 *   Leak  5 (raw HTML lost)           — quarantine writer persists raw_payload
 *   Leak  6 (null URL silently skips) — parallel count → null_url_count in notes
 *   Leak  9 (crashed worker drops)    — runSource catches per-row errors as events
 *   Leak 10 (sequential logPriceChange) — Promise.all per batch
 *   Leak 12 (source_url not archived) — source_url column written per row
 *
 * ── The chunked revival (kingdom-039, 2026-06-10) ───────────────────────
 *
 * The original v2 design scraped the FULL watch-list (~11,430 cards) at the
 * source's polite 0.5 rps — ~6.3 hours of work against Vercel's 800s
 * function ceiling — and deferred every DB write until after the scrape
 * loop. Each nightly run was killed mid-scrape with zero rows written and
 * its ingest_run row stuck at 'running' forever. Three changes fix it:
 *
 *   1. CHUNKED, STALEST-FIRST — each invocation takes the `chunk` cards
 *      whose `last_scrape_attempt_at` is oldest (NULL first). The cursor
 *      advances on every ATTEMPT, so dead URLs can't starve the queue.
 *      The cron runs every 2h (vercel.json); 12 × 2,000 = 24,000 attempts
 *      per day covers the full list roughly twice.
 *   2. INCREMENTAL WRITES — archive/cards/price-log writes flush inside
 *      the runSource write() callback every BATCH_SIZE rows. A killed
 *      invocation keeps everything scraped so far.
 *   3. HONEST RATE — ctx.rate_limit {rps: 4, burst: 8} overrides the
 *      meta default 0.5 rps. The legacy 8-worker pool ran ~26 rps against
 *      CardRush for a year without complaint; 0.5 rps was an accidental
 *      50× regression introduced when Leak 3 was closed. 2,000 cards at
 *      4 rps ≈ 500s — inside the budget with retry headroom.
 *
 * Pokémon (cardrush-pokemon.jp) requires the Bright Data unlocker
 * (kingdom-088); when CARDRUSH_BRIGHT_DATA_PROXY_URL is unset those cards
 * are EXCLUDED from the chunk at selection time and counted in the run
 * notes — one honest note instead of thousands of junk quarantine rows.
 *
 * Stuck-run hygiene: any prior cardrush ingest_run still 'running' after
 * 15 minutes is reaped to the (documented but previously never written)
 * 'aborted' status on entry.
 *
 * ── Runtime dependency ──────────────────────────────────────────────────
 *
 * Requires migrations through `0022_games_kingdom_codes.sql` (the
 * `cards.last_scrape_attempt_at` cursor + `price_archive.condition` from
 * 0015). Until applied this code compiles but fails at runtime.
 *
 * ── Designed in ─────────────────────────────────────────────────────────
 *
 * `docs/connections/the-cardrush-alignment.md` (kingdom-066) §5;
 * chunked revival in the kingdom-039 mission addendum.
 */

import { db } from "@/lib/db";
import {
  cards,
  games,
  priceArchive,
  ingestRun,
  ingestQuarantine,
} from "@/lib/db/schema";
import type { CardRushContext } from "@cambridge-tcg/data-ingest";
import { cardrush, runSource, CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";
import { fetchGbpJpyRate } from "@/lib/fx";
import { calculatePriceByCategory } from "@/lib/pricing";
import { logPriceChange } from "@/lib/price-change-log";
import { eq, inArray, isNotNull, isNull, and, sql, asc } from "drizzle-orm";

export interface SnapshotV2Options {
  gameIds?: number[];
  date?: string;
  triggeredBy?: "cron" | "admin" | "webhook";
  /** Cap the number of cards scraped (useful for dry-runs). */
  maxCards?: number;
  /**
   * Cards per invocation, selected stalest-first by
   * `last_scrape_attempt_at`. Defaults to CHUNK_DEFAULT. `maxCards`
   * (dry-run cap) wins when smaller.
   */
  chunk?: number;
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
  /** Cards excluded this run because their host needs the unconfigured proxy. */
  proxySkippedCount: number;
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
/** Cards per invocation. ~500s at SCRAPE_RATE — fits the 800s ceiling. */
const CHUNK_DEFAULT = 2000;
/**
 * Rate override for the shared fetcher. The legacy worker pool sustained
 * ~26 rps against CardRush for a year; 4 rps is conservative while still
 * 8× the meta default that made the watch-list mathematically uncoverable.
 */
const SCRAPE_RATE = { rps: 4, burst: 8 };
/** Scrape budget; leaves ~80s of the 800s ceiling for final flushes. */
const SCRAPE_BUDGET_MS = 700_000;
/** A 'running' cardrush run older than this is a corpse — reap to 'aborted'. */
const STUCK_RUN_REAP_MS = 15 * 60_000;

/**
 * Run one snapshot chunk, persisting an ingest_run row so the operator
 * can query "did snapshot run today?" from the database.
 */
export async function runDailySnapshotV2(
  options?: SnapshotV2Options,
): Promise<SnapshotV2Result> {
  const startMs = Date.now();
  const snapshotDate = options?.date ?? new Date().toISOString().slice(0, 10);
  const triggeredBy = options?.triggeredBy ?? "cron";

  // ── 0. Reap stuck 'running' rows from prior killed invocations ─────────
  // Vercel kills over-budget functions without running catch blocks; the
  // run row stays 'running' forever and the operator can't tell a live run
  // from a corpse. 'aborted' is the status the public ingest-runs API
  // documents for exactly this case.
  await db
    .update(ingestRun)
    .set({
      finishedAt: new Date(),
      status: "aborted",
      notes: `reaped by run started ${new Date().toISOString()}: still 'running' past ${STUCK_RUN_REAP_MS / 60_000} min — function was killed before it could finalise`,
    })
    .where(
      and(
        eq(ingestRun.sourceId, "cardrush"),
        eq(ingestRun.status, "running"),
        sql`${ingestRun.triggeredAt} < now() - interval '15 minutes'`,
      ),
    );

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
    // ── 2. Resolve active games + select the stalest chunk ───────────────
    let gameIds = options?.gameIds;
    const gameRows = await db
      .select({ id: games.id, code: games.code, active: games.active })
      .from(games);
    if (!gameIds || gameIds.length === 0) {
      gameIds = gameRows.filter((g) => g.active).map((g) => g.id);
    }
    const codeByGameId = new Map(gameRows.map((g) => [g.id, g.code]));

    if (gameIds.length === 0) {
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
        proxySkippedCount: 0,
        durationMs: Date.now() - startMs,
      };
    }

    // Hosts that can only be reached through the Bright Data unlocker.
    // When the operator hasn't supplied the proxy URL, exclude their cards
    // at selection time: scraping them would produce thousands of
    // proxy_not_configured quarantine rows per run and burn the chunk on
    // cards that cannot succeed. The exclusion is counted and noted —
    // substrate-honest gap, not a silent skip.
    const proxyConfigured = Boolean(process.env.CARDRUSH_BRIGHT_DATA_PROXY_URL);
    const unlockerHosts = Object.entries(CARDRUSH_SUBDOMAINS)
      .filter(([, entry]) => entry.access === "bright-data-unlocker")
      .map(([host]) => host);
    const proxyExclusion =
      !proxyConfigured && unlockerHosts.length > 0
        ? unlockerHosts.map(
            (host) => sql`${cards.cardrushUrl} NOT LIKE ${"%" + host + "%"}`,
          )
        : [];

    const chunkSize = Math.max(
      1,
      Math.min(
        options?.maxCards ?? Number.POSITIVE_INFINITY,
        options?.chunk ?? CHUNK_DEFAULT,
      ),
    );

    const [chunkCards, nullUrlCount, proxySkippedCount] = await Promise.all([
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
        .where(
          and(
            inArray(cards.gameId, gameIds),
            isNotNull(cards.cardrushUrl),
            ...proxyExclusion,
          ),
        )
        .orderBy(
          sql`${cards.lastScrapeAttemptAt} ASC NULLS FIRST`,
          asc(cards.id),
        )
        .limit(chunkSize) as Promise<CardRow[]>,
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(cards)
        .where(and(inArray(cards.gameId, gameIds), isNull(cards.cardrushUrl)))
        .then((rows) => rows[0]?.count ?? 0),
      proxyExclusion.length > 0
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(cards)
            .where(
              and(
                inArray(cards.gameId, gameIds),
                isNotNull(cards.cardrushUrl),
                sql`NOT (${sql.join(
                  unlockerHosts.map(
                    (host) =>
                      sql`${cards.cardrushUrl} NOT LIKE ${"%" + host + "%"}`,
                  ),
                  sql` AND `,
                )})`,
              ),
            )
            .then((rows) => rows[0]?.count ?? 0)
        : Promise.resolve(0),
    ]);

    const watchList = chunkCards.map((c) => ({ url: c.cardrushUrl, sku: c.sku }));
    const skuToCard = new Map(chunkCards.map((c) => [c.sku, c]));

    // ── 3. Fetch FX once per run ──────────────────────────────────────────
    const gbpJpyRate = await fetchGbpJpyRate();

    // ── 4 + 5. Run the source; flush writes INSIDE the loop ───────────────
    // Pending successful scrapes flush to price_archive/cards/price-log
    // every BATCH_SIZE rows so a killed invocation keeps its progress.
    // Attempted-card ids (success AND failure) flush to
    // last_scrape_attempt_at in the same cadence — the cursor advances on
    // attempt, not success, so dead URLs can't pin the queue.
    let rowsWritten = 0;
    let rowsQuarantined = 0;
    const perGameDb: Record<string, { attempted: number; succeeded: number; failed: number }> = {};
    const pending: Array<{ canonical: { sku: string; amount: string; upstream_id?: string }; card: CardRow }> = [];
    const attemptedIds: number[] = [];

    const bumpGame = (card: CardRow | undefined, ok: boolean) => {
      const code = card?.gameId != null ? (codeByGameId.get(card.gameId) ?? "unknown") : "unknown";
      const bucket = (perGameDb[code] ??= { attempted: 0, succeeded: 0, failed: 0 });
      bucket.attempted += 1;
      if (ok) bucket.succeeded += 1;
      else bucket.failed += 1;
    };

    const flushAttempts = async () => {
      if (attemptedIds.length === 0) return;
      const ids = attemptedIds.splice(0);
      await db
        .update(cards)
        .set({ lastScrapeAttemptAt: new Date() })
        .where(inArray(cards.id, ids));
    };

    const flushPending = async () => {
      if (pending.length === 0) return;
      const batch = pending.splice(0);
      const now = new Date();
      const priceChangeQueue: Array<Parameters<typeof logPriceChange>[0]> = [];

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
          // CardRush scrapes are A-condition (状態A-) — our NM equivalent.
          // Explicit (not the column default 'unspecified') so the archive
          // time-series stays unified with the 0015 backfill, and the
          // 4-column conflict target below can match.
          condition: "nm",
          _previousPrice: card.previousPrice,
          _previousBaseGbp: card.previousBaseGbp,
        };
      });

      const archiveValues = archiveRows.map(
        ({ _previousPrice, _previousBaseGbp, ...row }) => row,
      );

      // Conflict target matches the post-0015 unique index
      // (card_id, snapshot_date, source, condition).
      await db
        .insert(priceArchive)
        .values(archiveValues)
        .onConflictDoUpdate({
          target: [
            priceArchive.cardId,
            priceArchive.snapshotDate,
            priceArchive.source,
            priceArchive.condition,
          ],
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

      for (const row of archiveRows) {
        await db
          .update(cards)
          .set({
            cardrushJpy: row.cardrushJpy,
            gbpJpyRate: row.gbpJpyRate,
            baseGbp: row.baseGbp,
            price: row.price,
            lastSyncedAt: now,
            lastScrapeAttemptAt: now,
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

      for (let i = 0; i < priceChangeQueue.length; i += BATCH_SIZE) {
        const logBatch = priceChangeQueue.slice(i, i + BATCH_SIZE);
        await Promise.all(logBatch.map((row) => logPriceChange(row)));
      }

      rowsWritten += batch.length;
    };

    // bright_data_proxy_url: forwarded from the deployment env. When set,
    // cardrush subdomains with access="bright-data-unlocker" (currently
    // cardrush-pokemon.jp; WAF-blocked on direct egress) route through
    // the unlocker. Added kingdom-088 (the-bright-data-unlock).
    const ctx: CardRushContext = {
      cardrush: {
        urls: watchList,
        bright_data_proxy_url: process.env.CARDRUSH_BRIGHT_DATA_PROXY_URL,
      },
      rate_limit: SCRAPE_RATE,
      signal: AbortSignal.timeout(SCRAPE_BUDGET_MS),
    };

    const summary = await runSource(cardrush, ctx, {
      write: async (canonical) => {
        const card = skuToCard.get(canonical.sku);
        if (!card) return; // shouldn't happen — watch list comes from skuToCard
        pending.push({ canonical, card });
        attemptedIds.push(card.id); // lastScrapeAttemptAt set in flushPending too; harmless double-set
        bumpGame(card, true);
        if (pending.length >= BATCH_SIZE) {
          await flushPending();
          await flushAttempts();
        }
      },
      quarantine: async ({ raw, reason, provenance }) => {
        rowsQuarantined += 1;
        const sku = (raw as { inferred_sku?: string | null }).inferred_sku;
        const card = sku ? skuToCard.get(sku) : undefined;
        if (card) attemptedIds.push(card.id);
        bumpGame(card, false);
        await db.insert(ingestQuarantine).values({
          ingestRunId,
          sourceId: "cardrush",
          upstreamId: (raw as { url?: string }).url ?? null,
          rawPayload: raw as unknown as Record<string, unknown>,
          reason,
          asOf: new Date(provenance.as_of),
          retrievedAt: new Date(provenance.retrieved_at),
        });
        if (attemptedIds.length >= BATCH_SIZE) await flushAttempts();
      },
    });

    // Final flush for the tail batch.
    await flushPending();
    await flushAttempts();

    // ── 6. UPDATE ingest_run finished_at + counts + events + notes ────────
    const perGameNote = Object.entries(perGameDb)
      .map(([code, b]) => `${code} ${b.succeeded}/${b.attempted} ok`)
      .join(", ");
    const attempted = Object.values(perGameDb).reduce((s, b) => s + b.attempted, 0);
    const noteParts = [
      `attempted=${attempted}/${chunkCards.length} selected (stalest-first by last_scrape_attempt_at${attempted < chunkCards.length ? "; budget-aborted, remainder picked up next run" : ""})`,
      perGameNote ? `per-game: ${perGameNote}` : null,
      proxySkippedCount > 0
        ? `proxy_skipped=${proxySkippedCount} (hosts ${unlockerHosts.join(", ")} need CARDRUSH_BRIGHT_DATA_PROXY_URL — unset, cards excluded from chunk)`
        : null,
      nullUrlCount > 0
        ? `null_url_count=${nullUrlCount} (cards in active games with cardrush_url IS NULL — not scraped)`
        : null,
    ].filter(Boolean);

    await markRunDone(ingestRunId, {
      rows_read: summary.rows_read,
      rows_normalized: summary.rows_normalized,
      rowsWritten,
      rowsQuarantined,
      errors: summary.errors,
      events: summary.events,
      notes: noteParts.length > 0 ? noteParts.join("; ") : null,
    });

    return {
      ingestRunId,
      snapshotDate,
      rowsRead: summary.rows_read,
      rowsWritten,
      rowsQuarantined,
      errors: summary.errors,
      nullUrlCount,
      proxySkippedCount,
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
