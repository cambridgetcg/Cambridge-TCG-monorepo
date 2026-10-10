/**
 * Private identity-document storage.
 *
 * Verification documents deliberately do not share the public auction-media
 * bucket. New uploads begin with an S3 `upload-state=pending` tag; the private
 * bucket expires that tag after the abandoned-upload grace period. A document
 * is marked `linked` only after its database row exists.
 */

import crypto from "crypto";
import {
  deleteObject,
  getObjectTagging,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  headObject,
  putObjectTagging,
} from "@cambridge-tcg/aws/s3";

export const VERIFICATION_UPLOAD_PENDING_TAG = "upload-state=pending";
export const VERIFICATION_UPLOAD_LINKED_TAG = "upload-state=linked";
export const MAX_VERIFICATION_DOCUMENT_BYTES = 10 * 1024 * 1024;

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function verificationBucket(): string {
  const bucket = process.env.VERIFICATION_S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error(
      "Private verification storage is unavailable — VERIFICATION_S3_BUCKET is not configured",
    );
  }
  return bucket;
}

function awsRegion(): string {
  return (process.env.AWS_REGION || "us-east-1").trim();
}

export function isSupportedVerificationContentType(contentType: string): boolean {
  return Object.hasOwn(MIME_EXTENSIONS, contentType);
}

export function isOwnedVerificationKey(key: string, userId: string): boolean {
  const prefix = `verifications/${userId}/`;
  return (
    key.startsWith(prefix) &&
    key.length > prefix.length &&
    !key.includes("..") &&
    !key.includes("\\")
  );
}

/** Stable locator for persistence only. It is never an access grant. */
export function getStoredVerificationObjectUrl(key: string): string {
  return `https://${verificationBucket()}.s3.${awsRegion()}.amazonaws.com/${key}`;
}

export async function prepareVerificationUpload(
  userId: string,
  contentType: string,
): Promise<{
  uploadUrl: string;
  s3Key: string;
  requiredHeaders: { "x-amz-tagging": string };
}> {
  const extension = MIME_EXTENSIONS[contentType];
  if (!extension) throw new Error("Unsupported verification document type");

  const key = `verifications/${userId}/${crypto.randomUUID()}.${extension}`;
  const result = await getPresignedUploadUrl({
    bucket: verificationBucket(),
    key,
    contentType,
    tagging: VERIFICATION_UPLOAD_PENDING_TAG,
  });

  return {
    uploadUrl: result.uploadUrl,
    s3Key: result.s3Key,
    requiredHeaders: {
      "x-amz-tagging": VERIFICATION_UPLOAD_PENDING_TAG,
    },
  };
}

export async function getVerificationReadUrl(
  key: string,
  expiresIn = 300,
): Promise<string> {
  return getPresignedDownloadUrl({
    bucket: verificationBucket(),
    key,
    expiresIn,
  });
}

export async function inspectVerificationObject(key: string): Promise<{
  contentLength: number;
  contentType: string | null;
}> {
  const result = await headObject(verificationBucket(), key);
  return {
    contentLength: result.ContentLength ?? 0,
    contentType: result.ContentType ?? null,
  };
}

export async function markVerificationObjectLinked(key: string): Promise<void> {
  await putObjectTagging(verificationBucket(), key, [
    { Key: "upload-state", Value: "linked" },
  ]);
}

export async function getVerificationUploadState(
  key: string,
): Promise<string | null> {
  const result = await getObjectTagging(verificationBucket(), key);
  return result.TagSet?.find((tag) => tag.Key === "upload-state")?.Value ?? null;
}

export async function deleteVerificationObject(key: string): Promise<void> {
  await deleteObject(verificationBucket(), key);
}
