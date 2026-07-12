/**
 * S3 deletion for storefront.
 *
 * Delegates to @cambridge-tcg/aws for the actual S3 client. This module
 * New public-file signing is intentionally absent while storage is being
 * moved behind a private access boundary. Existing objects can still be
 * deleted through this module.
 */

import {
  deleteObject,
} from "@cambridge-tcg/aws/s3";

const BUCKET = (process.env.AUCTION_S3_BUCKET || "cambridgetcg-auction-images").trim();

export async function deleteS3Object(key: string): Promise<void> {
  await deleteObject(BUCKET, key);
}
