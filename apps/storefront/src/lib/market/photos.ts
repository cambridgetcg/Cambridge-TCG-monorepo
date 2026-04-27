/**
 * Trade photo uploads for marketplace verified/full-escrow tiers.
 *
 * Delegates to @cambridge-tcg/aws for the actual S3 client. Key is
 * namespaced by trade ID so rotation/cleanup is straightforward.
 */

import {
  getPresignedUploadUrl as awsPresign,
  deleteObject,
} from "@cambridge-tcg/aws/s3";
import crypto from "crypto";

const BUCKET = (process.env.AUCTION_S3_BUCKET || "cambridgetcg-auction-images").trim();

export async function getTradePhotoUploadUrl(
  tradeId: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageUrl: string; s3Key: string }> {
  const ext = (contentType.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
  const key = `trade-photos/${tradeId}/${crypto.randomUUID()}.${ext}`;

  const result = await awsPresign({
    bucket: BUCKET,
    key,
    contentType,
  });

  return {
    uploadUrl: result.uploadUrl,
    imageUrl: result.publicUrl,
    s3Key: result.s3Key,
  };
}

export async function deleteTradePhotoObject(key: string): Promise<void> {
  await deleteObject(BUCKET, key);
}
