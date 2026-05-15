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
