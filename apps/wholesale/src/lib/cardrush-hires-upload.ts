/**
 * One-time hi-res image archive: drains cardrush product-page og:images
 * into per-game S3 buckets under `hires/{set_code}/{sku}.jpg`.
 *
 * Spec: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md
 *
 * Substrate-honest: every invocation writes an `ingest_run` row
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
import { cardrush, createFetcher, type Fetcher } from "@cambridge-tcg/data-ingest";

const DEFAULT_MAX_BATCH = 100;

export type HiresGame = "pkm" | "op" | "dbs";

export const BUCKET_BY_GAME: Record<HiresGame, string> = {
  pkm: "jp-pk-photos",
  op: "jp-op-photos",
  dbs: "jp-db-photos",
};

export const CARDRUSH_HOST_BY_GAME: Record<HiresGame, string> = {
  pkm: "www.cardrush-pokemon.jp",
  op: "www.cardrush-op.jp",
  dbs: "www.cardrush-db.jp",
};

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
  remaining: number;
  durationMs: number;
  triggeredBy: "cron" | "admin";
  dryRun: boolean;
}

type Event = { ts: string; kind: string } & Record<string, unknown>;

export async function runHiresUpload(
  opts: HiresUploadOptions,
): Promise<HiresUploadResult> {
  const startMs = Date.now();
  const triggeredBy = opts.triggeredBy ?? "cron";
  const dryRun = opts.dryRun ?? false;
  const maxBatch = Math.max(
    1,
    Math.min(opts.maxBatch ?? DEFAULT_MAX_BATCH, 500),
  );
  const bucket = BUCKET_BY_GAME[opts.game];
  const host = CARDRUSH_HOST_BY_GAME[opts.game];

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
          like(cards.imageUrl, `https://${host}/data/cardrush-%/product/%`),
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
        if (code !== "NotFound" && code !== "NoSuchKey") {
          // Unexpected error — count as failed, don't mark archived.
          failed += 1;
          event("s3_head_failed", { sku: row.sku, key, reason: code || String(err) });
          continue;
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

    // ── 5. Compute remaining (same predicates as the batch SELECT) ────
    const remainingRows = (await db.execute(sql`
      SELECT count(*)::int AS count FROM cards
      WHERE game_id = ${gameId}
        AND image_url IS NOT NULL
        AND image_archived_at IS NULL
        AND image_url LIKE ${`https://${host}/data/cardrush-%/product/%`}
    `)) as unknown as Array<{ count: number }>;
    const remaining = remainingRows[0]?.count ?? 0;

    // ── 6. UPDATE ingest_run ──────────────────────────────────────────
    const finalStatus =
      failed > 0 && uploaded === 0 && skipped === 0 ? "failed" : "done";
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
          `uploaded ${uploaded}, skipped ${skipped}, failed ${failed}, remaining ${remaining}` +
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
