/**
 * S3 presigned upload and delete for storefront.
 *
 * Delegates to @cambridge-tcg/aws for the actual S3 client. This module
 * preserves the local API (getPresignedUploadUrl, deleteS3Object) so that
 * consumers don't need to change their imports.
 */

import {
  getPresignedUploadUrl as awsPresign,
  deleteObject,
} from "@cambridge-tcg/aws/s3";
import crypto from "crypto";

const BUCKET = (process.env.AUCTION_S3_BUCKET || "cambridgetcg-auction-images").trim();

export async function getPresignedUploadUrl(
  prefix: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageUrl: string; s3Key: string }> {
  const ext = contentType.split("/")[1] || "jpg";
  const key = `${prefix}/${crypto.randomUUID()}.${ext}`;

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

export async function deleteS3Object(key: string): Promise<void> {
  await deleteObject(BUCKET, key);
}
