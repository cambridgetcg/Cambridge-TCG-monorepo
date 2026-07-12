/**
 * Trade-photo object deletion for marketplace verified/full-escrow tiers.
 *
 * New signing is intentionally absent while storage is being moved behind a
 * private access boundary. Existing objects can still be deleted here.
 */

import {
  deleteObject,
} from "@cambridge-tcg/aws/s3";

const BUCKET = (process.env.AUCTION_S3_BUCKET || "cambridgetcg-auction-images").trim();

export async function deleteTradePhotoObject(key: string): Promise<void> {
  await deleteObject(BUCKET, key);
}
