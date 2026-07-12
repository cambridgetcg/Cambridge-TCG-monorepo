import type { S3Client } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signedUrlMock } = vi.hoisted(() => ({ signedUrlMock: vi.fn() }));

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: signedUrlMock }));

import type { CollectorMediaVaultConfig } from "./config";
import {
  COLLECTOR_MEDIA_ACCESS_SECONDS,
  createCollectorMediaVaultStorage,
} from "./storage";

const config: CollectorMediaVaultConfig = {
  mode: "on",
  bucket: "ctcg-private-collector-media",
  region: "eu-west-2",
  kmsKeyArn:
    "arn:aws:kms:eu-west-2:123456789012:key/11111111-2222-4333-8444-555555555555",
  expectedBucketOwner: "123456789012",
  credentials: {
    accessKeyId: "vault-only-access-key",
    secretAccessKey: "vault-only-secret",
  },
};

describe("collector media private S3 operations", () => {
  const send = vi.fn();
  const client = { send } as unknown as S3Client;

  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
    signedUrlMock.mockReset().mockResolvedValue("https://signed.example/private-capability");
  });

  it("writes only a private KMS-encrypted WebP under the supplied server key", async () => {
    const storage = createCollectorMediaVaultStorage(config, client);
    const result = await storage.put({
      objectKey: "collector-media/v1/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp",
      body: Buffer.from("normalized-webp"),
      checksumSha256Base64: "checksum-base64",
    });

    expect(result).toBeUndefined();
    const command = send.mock.calls[0][0];
    expect(command.constructor.name).toBe("PutObjectCommand");
    expect(command.input).toMatchObject({
      Bucket: config.bucket,
      ExpectedBucketOwner: config.expectedBucketOwner,
      ContentType: "image/webp",
      ContentDisposition: 'attachment; filename="collector-photo.webp"',
      CacheControl: "private, no-store, max-age=0",
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: config.kmsKeyArn,
      BucketKeyEnabled: true,
      IfNoneMatch: "*",
      ChecksumSHA256: "checksum-base64",
    });
    expect(command.input).not.toHaveProperty("ACL");
    expect(command.input).not.toHaveProperty("WebsiteRedirectLocation");
  });

  it("creates an attachment-only, no-store access capability for 60 seconds", async () => {
    const storage = createCollectorMediaVaultStorage(config, client);
    const url = await storage.createAccessUrl(
      "collector-media/v1/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp",
    );

    expect(url).toBe("https://signed.example/private-capability");
    const [, command, options] = signedUrlMock.mock.calls[0];
    expect(command.constructor.name).toBe("GetObjectCommand");
    expect(command.input).toMatchObject({
      Bucket: config.bucket,
      ExpectedBucketOwner: config.expectedBucketOwner,
      ResponseContentType: "image/webp",
      ResponseContentDisposition: 'attachment; filename="collector-photo.webp"',
      ResponseCacheControl: "private, no-store, max-age=0",
    });
    expect(options).toEqual({ expiresIn: COLLECTOR_MEDIA_ACCESS_SECONDS });
    expect(COLLECTOR_MEDIA_ACCESS_SECONDS).toBeLessThanOrEqual(60);
  });

  it("deletes by opaque server key without needing a public URL", async () => {
    const storage = createCollectorMediaVaultStorage(config, client);
    await storage.delete(
      "collector-media/v1/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp",
    );

    const command = send.mock.calls[0][0];
    expect(command.constructor.name).toBe("DeleteObjectCommand");
    expect(command.input.Bucket).toBe(config.bucket);
    expect(command.input.ExpectedBucketOwner).toBe(config.expectedBucketOwner);
  });
});
