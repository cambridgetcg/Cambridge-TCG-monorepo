/**
 * Shared S3 client factory and helpers.
 *
 * Replaces the duplicated S3Client instantiation across storefront and wholesale.
 * Storefront had two identical modules (auction/s3.ts, market/photos.ts) for
 * the same bucket. Wholesale had two more (runtime + tools). All four patterns
 * now converge here.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolveAwsConfig, type AwsConfig } from "./credentials";

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

let _sharedClient: S3Client | null = null;
let _sharedConfig: AwsConfig | null = null;

export interface CreateS3ClientOpts {
  /** Override the default region (default: us-east-1) */
  defaultRegion?: string;
  /** Force a new client instead of reusing the singleton */
  fresh?: boolean;
}

/**
 * Get a configured S3Client. Returns a singleton by default.
 *
 * Returns `null` if credentials are missing, so callers can degrade
 * gracefully instead of crashing.
 */
export function createS3Client(opts?: CreateS3ClientOpts): S3Client | null {
  if (_sharedClient && !opts?.fresh) return _sharedClient;

  const result = resolveAwsConfig(opts?.defaultRegion);
  if (!result.ok) {
    console.warn(`[packages/aws] S3 unavailable: ${result.error}`);
    return null;
  }

  const client = new S3Client({
    region: result.config.region,
    credentials: result.config.credentials,
  });

  if (!opts?.fresh) {
    _sharedClient = client;
    _sharedConfig = result.config;
  }

  return client;
}

/**
 * Get a configured S3Client or throw. For code paths where S3 is required.
 */
export function createS3ClientOrThrow(opts?: CreateS3ClientOpts): S3Client {
  const client = createS3Client(opts);
  if (!client) throw new Error("S3 client unavailable — AWS credentials not configured");
  return client;
}

// ---------------------------------------------------------------------------
// Presigned upload URL
// ---------------------------------------------------------------------------

export interface PresignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  s3Key: string;
}

export interface PresignedUploadOpts {
  bucket: string;
  key: string;
  contentType: string;
  /**
   * Optional S3 object-tagging header value (for example
   * `upload-state=pending`). When present it remains a signed request header
   * instead of being hoisted into the URL query string, so browser callers
   * must send the same `x-amz-tagging` value.
   */
  tagging?: string;
  /** Seconds until the presigned URL expires (default: 600 = 10 minutes) */
  expiresIn?: number;
}

export interface PresignedDownloadOpts {
  bucket: string;
  key: string;
  /** Seconds until the read URL expires (default: 300 = 5 minutes). */
  expiresIn?: number;
}

/**
 * Generate a presigned PUT URL for direct browser uploads.
 *
 * Consolidates the pattern from storefront's auction/s3.ts and market/photos.ts.
 */
export async function getPresignedUploadUrl(
  opts: PresignedUploadOpts,
): Promise<PresignedUploadResult> {
  const client = createS3ClientOrThrow();
  const result = resolveAwsConfig();
  if (!result.ok) throw new Error(result.error);

  const command = new PutObjectCommand({
    Bucket: opts.bucket,
    Key: opts.key,
    ContentType: opts.contentType,
    Tagging: opts.tagging,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: opts.expiresIn ?? 600,
    // Bind the declared MIME type to the capability. Without this explicit
    // set, the S3 presigner omits Content-Type from X-Amz-SignedHeaders and a
    // browser can replace it after the server validates the presign request.
    signableHeaders: new Set(["content-type"]),
    ...(opts.tagging
      ? { unhoistableHeaders: new Set(["x-amz-tagging"]) }
      : {}),
  });

  const publicUrl = `https://${opts.bucket}.s3.${result.config.region}.amazonaws.com/${opts.key}`;

  return { uploadUrl, publicUrl, s3Key: opts.key };
}

/**
 * Generate a short-lived GET URL for a private object.
 *
 * Sensitive uploads must use this instead of treating the stable S3 object
 * address as an access grant. Authorization remains the caller's job; this
 * helper only creates the time-bounded capability after that check.
 */
export async function getPresignedDownloadUrl(
  opts: PresignedDownloadOpts,
): Promise<string> {
  const client = createS3ClientOrThrow();
  const command = new GetObjectCommand({ Bucket: opts.bucket, Key: opts.key });
  return getSignedUrl(client, command, { expiresIn: opts.expiresIn ?? 300 });
}

// ---------------------------------------------------------------------------
// Simple operations
// ---------------------------------------------------------------------------

export async function deleteObject(bucket: string, key: string): Promise<void> {
  const client = createS3ClientOrThrow();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObject(bucket: string, key: string) {
  const client = createS3ClientOrThrow();
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function headObject(bucket: string, key: string) {
  const client = createS3ClientOrThrow();
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObjectTagging(bucket: string, key: string) {
  const client = createS3ClientOrThrow();
  return client.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key }));
}

export async function putObjectTagging(
  bucket: string,
  key: string,
  tags: Array<{ Key: string; Value: string }>,
): Promise<void> {
  const client = createS3ClientOrThrow();
  await client.send(new PutObjectTaggingCommand({
    Bucket: bucket,
    Key: key,
    Tagging: { TagSet: tags },
  }));
}

// ---------------------------------------------------------------------------
// Re-exports (so consumers don't need direct @aws-sdk/client-s3 dependency)
// ---------------------------------------------------------------------------

export {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
export { getSignedUrl } from "@aws-sdk/s3-request-presigner";
