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
