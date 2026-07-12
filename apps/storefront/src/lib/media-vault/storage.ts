import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { CollectorMediaVaultConfig } from "./config";

export const COLLECTOR_MEDIA_ACCESS_SECONDS = 60;
const PRIVATE_CACHE_CONTROL = "private, no-store, max-age=0";
const DOWNLOAD_DISPOSITION = 'attachment; filename="collector-photo.webp"';

export interface PutCollectorMediaArgs {
  objectKey: string;
  body: Buffer;
  checksumSha256Base64: string;
}

export interface CollectorMediaVaultStorage {
  put(args: PutCollectorMediaArgs): Promise<void>;
  createAccessUrl(objectKey: string): Promise<string>;
  delete(objectKey: string): Promise<void>;
}

/** A client created here can only use the dedicated vault identity. */
export function createCollectorMediaVaultStorage(
  config: CollectorMediaVaultConfig,
  client = new S3Client({
    region: config.region,
    credentials: config.credentials,
  }),
): CollectorMediaVaultStorage {
  return {
    async put(args) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          ExpectedBucketOwner: config.expectedBucketOwner,
          Key: args.objectKey,
          Body: args.body,
          ContentLength: args.body.byteLength,
          ContentType: "image/webp",
          ContentDisposition: DOWNLOAD_DISPOSITION,
          CacheControl: PRIVATE_CACHE_CONTROL,
          ChecksumSHA256: args.checksumSha256Base64,
          ServerSideEncryption: "aws:kms",
          SSEKMSKeyId: config.kmsKeyArn,
          BucketKeyEnabled: true,
          IfNoneMatch: "*",
        }),
      );
    },

    async createAccessUrl(objectKey) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucket,
          ExpectedBucketOwner: config.expectedBucketOwner,
          Key: objectKey,
          ResponseContentType: "image/webp",
          ResponseContentDisposition: DOWNLOAD_DISPOSITION,
          ResponseCacheControl: PRIVATE_CACHE_CONTROL,
        }),
        { expiresIn: COLLECTOR_MEDIA_ACCESS_SECONDS },
      );
    },

    async delete(objectKey) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          ExpectedBucketOwner: config.expectedBucketOwner,
          Key: objectKey,
        }),
      );
    },
  };
}
