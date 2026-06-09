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
  /** Seconds until the presigned URL expires (default: 600 = 10 minutes) */
  expiresIn?: number;
  /**
   * Region for BOTH the signing client and the public-URL host, so the two
   * can never disagree. Falls back to `AWS_REGION`, then `us-east-1`.
   * Wholesale (eu-west-2) should pass its region when `AWS_REGION` may be
   * unset — otherwise the public URL host silently pins to us-east-1 while
   * the bucket lives elsewhere, yielding a broken image URL.
   */
  defaultRegion?: string;
}

/**
 * Generate a presigned PUT URL for direct browser uploads.
 *
 * Consolidates the pattern from storefront's auction/s3.ts and market/photos.ts.
 *
 * The signing client and the returned `publicUrl` are both built from a single
 * resolved config, so the region in the URL host always matches the region the
 * URL was signed for. (Previously the client and the public URL each resolved
 * config independently and could diverge — or both pin to the us-east-1
 * default — when `AWS_REGION` was unset for a non-us-east-1 bucket.)
 */
export async function getPresignedUploadUrl(
  opts: PresignedUploadOpts,
): Promise<PresignedUploadResult> {
  const result = resolveAwsConfig(opts.defaultRegion);
  if (!result.ok) throw new Error(result.error);

  // Build the client from the resolved config so its region is guaranteed
  // identical to the one used for `publicUrl` below.
  const client = new S3Client({
    region: result.config.region,
    credentials: result.config.credentials,
  });

  const command = new PutObjectCommand({
    Bucket: opts.bucket,
    Key: opts.key,
    ContentType: opts.contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: opts.expiresIn ?? 600,
  });

  const publicUrl = `https://${opts.bucket}.s3.${result.config.region}.amazonaws.com/${opts.key}`;

  return { uploadUrl, publicUrl, s3Key: opts.key };
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

// ---------------------------------------------------------------------------
// Re-exports (so consumers don't need direct @aws-sdk/client-s3 dependency)
// ---------------------------------------------------------------------------

export {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
export { getSignedUrl } from "@aws-sdk/s3-request-presigner";
