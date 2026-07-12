/**
 * One-time hi-res image archive: drains cardrush-hosted card images
 * into per-game S3 buckets under `hires/{set_code}/{sku}.jpg`.
 *
 * Spec: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md
 *
 * ── Pattern fix + multi-game (2026-07-05) ───────────────────────────────
 *
 * The original LIKE pattern (`…/data/cardrush-%/product/%`) matched ZERO
 * rows in production — real cardrush image URLs verified against prod are:
 *
 *   pkm  https://www.cardrush-pokemon.jp/data/cardrushpokemon/_/…  (no hyphen)
 *   op   https://www.cardrush-op.jp/data/cardrush-op/_/…
 *   dbf  https://www.cardrush-db.jp/data/cardrush-db/_/…
 *
 * — `/_/` where the pattern said `/product/`, and per-host naming under
 * /data/. Every "remaining 0" the cron reported before this date was a
 * false completion (601 cards still cardrush-hosted, image_archived_at
 * NULL platform-wide; 2026-07-05 investigation). The pattern is now
 * `https://{host}/data/%` — any cardrush-hosted image for the game's
 * host — and `matched` (total pattern matches, archived or not) is
 * reported alongside `remaining` so "nothing matched the pattern" and
 * "everything is archived" are distinguishable at a glance.
 *
 * The runner itself stays one-game-per-call; the cron route walks all
 * games in HIRES_GAMES and early-exits cheaply (no ingest_run row) via
 * `hiresQueueStatus()` when no game has cardrush-hosted images left.
 *
 * Substrate-honest: every uploading invocation writes an `ingest_run` row
 * (sourceId='cardrush-hires-upload'); `cards.image_archived_at` marks
 * presence in the bucket; failures land in ingest_run.events with reasons,
 * the cards row stays NULL so the next run retries. HEAD-check before PUT
 * preserves the pinned hi-res-protection invariant in
 * apps/wholesale/tools/lib/s3-images.ts:5-23.
 */

import { db } from "./db";
import { cards, games, ingestRun } from "./db/schema";
import { and, eq, isNull, isNotNull, like, sql, asc } from "drizzle-orm";
import {
  createS3ClientOrThrow,
  HeadObjectCommand,
  PutObjectCommand,
} from "@cambridge-tcg/aws/s3";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
  cardrush,
  createFetcher,
  type Fetcher,
} from "@cambridge-tcg/data-ingest";

const DEFAULT_MAX_BATCH = 100;

// 'dbf' (Fusion World): the Dragon Ball inventory on cardrush-db.jp is
// FB/SB sets — games.code carries 'dbf' since migration 0022.
export type HiresGame = "pkm" | "op" | "dbf";

export const BUCKET_BY_GAME: Record<HiresGame, string> = {
  pkm: "jp-pk-photos",
  op: "jp-op-photos",
  dbf: "jp-db-photos",
};

export const CARDRUSH_HOST_BY_GAME: Record<HiresGame, string> = {
  pkm: "www.cardrush-pokemon.jp",
  op: "www.cardrush-op.jp",
  dbf: "www.cardrush-db.jp",
};

/** Games the hires archive covers — every game with a cardrush host. */
export const HIRES_GAMES = Object.keys(CARDRUSH_HOST_BY_GAME) as HiresGame[];

/**
 * LIKE pattern for "this card's image is still hosted on cardrush" for a
 * game's host. Verified against prod image_url shapes 2026-07-05 (see
 * file header) — the one truth both the batch SELECT and the counts use.
 */
export function cardrushImagePattern(game: HiresGame): string {
  return `https://${CARDRUSH_HOST_BY_GAME[game]}/data/%`;
}

export function s3KeyFor(row: { set_code: string; sku: string }): string {
  return `hires/${row.set_code}/${row.sku}.jpg`;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: "too_small" | "not_jpeg" };

const MIN_BYTES = 5_000;

/**
 * Guard against 1x1 placeholders and content-type/server-bug responses.
 * Substrate-honest: each rejection reason maps to a distinct ingest_run
 * event so the operator can tell "upstream returned junk" from "upstream
 * returned a non-jpeg" from "upstream returned a tiny placeholder".
 */
export function validateImageBytes(bytes: Buffer): ValidationResult {
  if (bytes.length < MIN_BYTES) return { ok: false, reason: "too_small" };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, reason: "not_jpeg" };
  }
  return { ok: true };
}

export interface HiresUploadOptions {
  game: HiresGame;
  triggeredBy?: "cron" | "admin";
  maxBatch?: number;
  dryRun?: boolean;
}

export interface HiresUploadResult {
  ingestRunId: number;
  game: HiresGame;
  bucket: string;
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
  /** Cards still matching the cardrush-hosted pattern with image_archived_at NULL. */
  remaining: number;
  /** Total cards matching the cardrush-hosted pattern (archived or not). 0 = pattern found nothing. */
  matched: number;
  durationMs: number;
  triggeredBy: "cron" | "admin";
  dryRun: boolean;
}

/** Per-game queue snapshot for the cron's cheap early-exit. */
export type HiresQueueStatus = Record<
  HiresGame,
  { matched: number; remaining: number }
>;

/**
 * Count, per game, how many cards still carry a cardrush-hosted image
 * URL (`matched`) and how many of those are not yet archived
 * (`remaining`). One round-trip; no ingest_run row — this is the cron
 * route's cheap "is there anything to do?" gate.
 */
export async function hiresQueueStatus(): Promise<HiresQueueStatus> {
  const unions = HIRES_GAMES.map(
    (game) => sql`
      SELECT ${game}::text AS game,
             count(*)::int AS matched,
             (count(*) FILTER (WHERE c.image_archived_at IS NULL))::int AS remaining
      FROM cards c
      JOIN games g ON g.id = c.game_id AND g.code = ${game}
      WHERE c.image_url LIKE ${cardrushImagePattern(game)}`,
  );
  const rows = (await db.execute(
    sql.join(unions, sql` UNION ALL `),
  )) as unknown as Array<{ game: HiresGame; matched: number; remaining: number }>;

  const status = Object.fromEntries(
    HIRES_GAMES.map((g) => [g, { matched: 0, remaining: 0 }]),
  ) as HiresQueueStatus;
  for (const row of rows) {
    status[row.game] = { matched: row.matched, remaining: row.remaining };
  }
  return status;
}

type Event = { ts: string; kind: string } & Record<string, unknown>;

export async function runHiresUpload(
  opts: HiresUploadOptions,
): Promise<HiresUploadResult> {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    throw new Error(CARDRUSH_BLOCK_REASON);
  }
  const startMs = Date.now();
  const triggeredBy = opts.triggeredBy ?? "cron";
  const dryRun = opts.dryRun ?? false;
  const maxBatch = Math.max(
    1,
    Math.min(opts.maxBatch ?? DEFAULT_MAX_BATCH, 500),
  );
  const bucket = BUCKET_BY_GAME[opts.game];

  const events: Event[] = [];
  const event = (kind: string, detail: Record<string, unknown> = {}) =>
    events.push({ ts: new Date().toISOString(), kind, ...detail });

  // ── 1. INSERT ingest_run row ────────────────────────────────────────
  const [run] = await db
    .insert(ingestRun)
    .values({
      sourceId: "cardrush-hires-upload",
      specVersion: "1",
      triggeredBy,
      status: "running",
    })
    .returning({ id: ingestRun.id });
  const ingestRunId = run.id;

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  try {
    // ── 2. Resolve game_id ────────────────────────────────────────────
    const [gameRow] = await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.code, opts.game))
      .limit(1);
    if (!gameRow) {
      throw new Error(`game code not found: ${opts.game}`);
    }
    const gameId = gameRow.id;

    // ── 3. Pick batch (deterministic order, partial-index-friendly) ───
    const batch = await db
      .select({
        id: cards.id,
        sku: cards.sku,
        setCode: cards.setCode,
        imageUrl: cards.imageUrl,
      })
      .from(cards)
      .where(
        and(
          eq(cards.gameId, gameId),
          isNotNull(cards.imageUrl),
          isNull(cards.imageArchivedAt),
          like(cards.imageUrl, cardrushImagePattern(opts.game)),
        ),
      )
      .orderBy(asc(cards.id))
      .limit(maxBatch);

    // ── 4. Walk the batch ─────────────────────────────────────────────
    const s3 = createS3ClientOrThrow({ defaultRegion: "us-east-1" });

    // Shared rate-limited fetcher (0.5 rps, burst 2 — from cardrush.meta).
    // Created once per invocation so the whole batch shares one token bucket.
    const fetcher: Fetcher = createFetcher(
      {
        on_event: (ev) => {
          event(`http_${ev.kind}`, ev.detail as Record<string, unknown>);
        },
      },
      cardrush.meta,
    );

    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i];
      processed += 1;
      if (!row.setCode || !row.sku || !row.imageUrl) {
        // Defensive: SELECT filtered for non-null url, but TS doesn't know.
        failed += 1;
        event("row_missing_field", { id: row.id });
        continue;
      }
      const key = s3KeyFor({ set_code: row.setCode, sku: row.sku });

      // 4a. HEAD — already-archived shortcut (idempotent).
      let alreadyInS3 = false;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        alreadyInS3 = true;
      } catch (err) {
        const code = (err as { name?: string })?.name ?? "";
        const http = (err as { $metadata?: { httpStatusCode?: number } })
          ?.$metadata?.httpStatusCode;
        // AWS gotcha (the coverage gate spec §2): HeadObject on a
        // NON-EXISTENT object returns 403 (not 404) when the caller
        // lacks s3:ListBucket. Treat 403 as "cannot prove existence" and
        // fall through to the PUT — a real permission problem then fails
        // loudly at upload instead of wedging the drain in a silent
        // head-loop (FB-FB09-007-JP-VYCC looped every 5min for this).
        if (code !== "NotFound" && code !== "NoSuchKey" && http !== 403) {
          // Unexpected error — count as failed, don't mark archived.
          failed += 1;
          event("s3_head_failed", { sku: row.sku, key, reason: code || String(err) });
          continue;
        }
        if (http === 403) {
          event("s3_head_403_treated_as_missing", { sku: row.sku, key });
        }
      }

      if (alreadyInS3) {
        if (!dryRun) {
          await db
            .update(cards)
            .set({ imageArchivedAt: new Date() })
            .where(eq(cards.id, row.id));
        }
        skipped += 1;
        event("image_already_in_s3", { sku: row.sku, key });
        continue;
      }

      if (dryRun) {
        uploaded += 1; // count "would_upload" toward uploaded for symmetry
        event("would_upload", { sku: row.sku, key, image_url: row.imageUrl });
        continue;
      }

      // 4b. Fetch bytes via shared rate-limited fetcher (image paths bypass CF).
      let bytes: Buffer | null = null;
      try {
        const res = await fetcher(row.imageUrl);
        if (!res.ok) {
          failed += 1;
          event("image_fetch_failed", { sku: row.sku, status: res.status });
          continue;
        }
        bytes = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        failed += 1;
        event("image_fetch_error", {
          sku: row.sku,
          reason: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      // 4c. Validate bytes (junk filter).
      const v = validateImageBytes(bytes);
      if (!v.ok) {
        failed += 1;
        event(`image_${v.reason}`, { sku: row.sku, bytes: bytes.length });
        continue;
      }

      // 4d. PUT to S3.
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: "image/jpeg",
            CacheControl: "public, max-age=31536000",
            ACL: "public-read",
          }),
        );
      } catch (err) {
        failed += 1;
        event("s3_put_failed", {
          sku: row.sku,
          key,
          reason: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      // 4e. Mark archived (upload-then-mark ordering).
      await db
        .update(cards)
        .set({ imageArchivedAt: new Date() })
        .where(eq(cards.id, row.id));

      uploaded += 1;
      event("image_uploaded", { sku: row.sku, key, bytes: bytes.length });
    }

    // ── 5. Compute matched + remaining (same pattern as the batch SELECT).
    // `matched` distinguishes "the pattern found nothing" from "everything
    // is archived" — the old note's bare `remaining 0` couldn't tell the
    // two apart, and a dead pattern reported completion for weeks.
    const countRows = (await db.execute(sql`
      SELECT count(*)::int AS matched,
             (count(*) FILTER (WHERE image_archived_at IS NULL))::int AS remaining
      FROM cards
      WHERE game_id = ${gameId}
        AND image_url IS NOT NULL
        AND image_url LIKE ${cardrushImagePattern(opts.game)}
    `)) as unknown as Array<{ matched: number; remaining: number }>;
    const matched = countRows[0]?.matched ?? 0;
    const remaining = countRows[0]?.remaining ?? 0;

    // ── 6. UPDATE ingest_run ──────────────────────────────────────────
    const finalStatus =
      failed > 0 && uploaded === 0 && skipped === 0 ? "failed" : "done";
    const queueNote =
      matched === 0
        ? `pattern '${cardrushImagePattern(opts.game)}' matched 0 cards — nothing cardrush-hosted for ${opts.game}`
        : `remaining ${remaining} of ${matched} matched pattern '${cardrushImagePattern(opts.game)}'${remaining === 0 ? " — all archived" : ""}`;
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: finalStatus,
        rowsRead: processed,
        rowsWritten: uploaded,
        errors: failed,
        events: events as unknown as Record<string, unknown>[],
        notes:
          `game ${opts.game}: uploaded ${uploaded}, skipped ${skipped}, failed ${failed}, ${queueNote}` +
          (dryRun ? " [DRY RUN]" : ""),
      })
      .where(eq(ingestRun.id, ingestRunId));

    return {
      ingestRunId,
      game: opts.game,
      bucket,
      processed,
      uploaded,
      skipped,
      failed,
      remaining,
      matched,
      durationMs: Date.now() - startMs,
      triggeredBy,
      dryRun,
    };
  } catch (err) {
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        notes: `crashed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(ingestRun.id, ingestRunId))
      .catch(() => {});
    throw err;
  }
}
