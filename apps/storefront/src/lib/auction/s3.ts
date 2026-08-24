/**
 * S3 presigned upload and delete for storefront.
 *
 * Delegates to @cambridge-tcg/aws for the actual S3 client. This module
 * preserves the local API (getPresignedUploadUrl, deleteS3Object) so that
 * consumers don't need to change their imports.
 */

import {
  getPresignedUploadUrl as awsPresign,
  getPresignedDownloadUrl as awsPresignDownload,
  deleteObject,
} from "@cambridge-tcg/aws/s3";
import crypto from "crypto";

const BUCKET = (process.env.AUCTION_S3_BUCKET || "cambridgetcg-auction-images").trim();
const REGION = (process.env.AWS_REGION || "us-east-1").trim();

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

export async function getPresignedReadUrl(
  key: string,
  expiresIn = 300,
): Promise<string> {
  return awsPresignDownload({ bucket: BUCKET, key, expiresIn });
}

/** Only accept generated keys inside the authenticated participant's prefix. */
export function isOwnedUploadKey(
  key: string,
  namespace: "verifications" | "avatars",
  userId: string,
): boolean {
  const prefix = `${namespace}/${userId}/`;
  return key.startsWith(prefix) && key.length > prefix.length && !key.includes("..") && !key.includes("\\");
}

/** Stable storage address only; private objects still require a signed read URL. */
export function getStoredObjectUrl(key: string): string {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export function getOwnedUploadKeyFromUrl(
  value: string,
  namespace: "verifications" | "avatars",
  userId: string,
): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== `https://${BUCKET}.s3.${REGION}.amazonaws.com`) return null;
    const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    return isOwnedUploadKey(key, namespace, userId) ? key : null;
  } catch {
    return null;
  }
}
