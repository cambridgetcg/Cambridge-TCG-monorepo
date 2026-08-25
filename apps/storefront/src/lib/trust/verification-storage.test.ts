import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  presignUpload: vi.fn(),
  presignRead: vi.fn(),
  head: vi.fn(),
  getTags: vi.fn(),
  putTags: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@cambridge-tcg/aws/s3", () => ({
  getPresignedUploadUrl: mocks.presignUpload,
  getPresignedDownloadUrl: mocks.presignRead,
  headObject: mocks.head,
  getObjectTagging: mocks.getTags,
  putObjectTagging: mocks.putTags,
  deleteObject: mocks.deleteObject,
}));

import {
  deleteVerificationObject,
  getStoredVerificationObjectUrl,
  getVerificationUploadState,
  inspectVerificationObject,
  isOwnedVerificationKey,
  isSupportedVerificationContentType,
  markVerificationObjectLinked,
  prepareVerificationUpload,
  VERIFICATION_UPLOAD_PENDING_TAG,
} from "./verification-storage";

const USER_ID = "123e4567-e89b-42d3-a456-426614174099";
const BUCKET = "cambridgetcg-verification-documents-prod-034362054546";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERIFICATION_S3_BUCKET", BUCKET);
  vi.stubEnv("AWS_REGION", "us-east-1");
  mocks.presignUpload.mockImplementation(async (options: { key: string }) => ({
    uploadUrl: "https://signed.example/upload",
    publicUrl: "unused",
    s3Key: options.key,
  }));
  mocks.presignRead.mockResolvedValue("https://signed.example/read");
  mocks.head.mockResolvedValue({ ContentLength: 2048, ContentType: "image/jpeg" });
  mocks.getTags.mockResolvedValue({
    TagSet: [{ Key: "upload-state", Value: "pending" }],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("private verification storage", () => {
  it("fails closed without the dedicated bucket", async () => {
    vi.stubEnv("VERIFICATION_S3_BUCKET", "");

    await expect(prepareVerificationUpload(USER_ID, "image/jpeg")).rejects.toThrow(
      "VERIFICATION_S3_BUCKET",
    );
    expect(mocks.presignUpload).not.toHaveBeenCalled();
  });

  it("mints a participant-owned pending-tag upload", async () => {
    const result = await prepareVerificationUpload(USER_ID, "application/pdf");

    expect(result.s3Key).toMatch(
      new RegExp(`^verifications/${USER_ID}/[0-9a-f-]+\\.pdf$`),
    );
    expect(result.requiredHeaders).toEqual({
      "x-amz-tagging": VERIFICATION_UPLOAD_PENDING_TAG,
    });
    expect(mocks.presignUpload).toHaveBeenCalledWith({
      bucket: BUCKET,
      key: result.s3Key,
      contentType: "application/pdf",
      tagging: "upload-state=pending",
    });
  });

  it("accepts only the explicit document content types", () => {
    expect(isSupportedVerificationContentType("image/jpeg")).toBe(true);
    expect(isSupportedVerificationContentType("image/png")).toBe(true);
    expect(isSupportedVerificationContentType("image/webp")).toBe(true);
    expect(isSupportedVerificationContentType("application/pdf")).toBe(true);
    expect(isSupportedVerificationContentType("image/svg+xml")).toBe(false);
    expect(isSupportedVerificationContentType("text/html")).toBe(false);
  });

  it("keeps keys inside the authenticated participant namespace", () => {
    const valid = `verifications/${USER_ID}/proof.jpg`;
    expect(isOwnedVerificationKey(valid, USER_ID)).toBe(true);
    expect(isOwnedVerificationKey("verifications/someone-else/proof.jpg", USER_ID)).toBe(false);
    expect(isOwnedVerificationKey(`verifications/${USER_ID}/../proof.jpg`, USER_ID)).toBe(false);
    expect(isOwnedVerificationKey(`verifications/${USER_ID}/bad\\proof.jpg`, USER_ID)).toBe(false);
  });

  it("treats the stable bucket URL as a locator, not a read grant", () => {
    const key = `verifications/${USER_ID}/proof.jpg`;
    expect(getStoredVerificationObjectUrl(key)).toBe(
      `https://${BUCKET}.s3.us-east-1.amazonaws.com/${key}`,
    );
  });

  it("heads, links, reads tags and deletes only in the private bucket", async () => {
    const key = `verifications/${USER_ID}/proof.jpg`;

    await expect(inspectVerificationObject(key)).resolves.toEqual({
      contentLength: 2048,
      contentType: "image/jpeg",
    });
    await expect(getVerificationUploadState(key)).resolves.toBe("pending");
    await markVerificationObjectLinked(key);
    await deleteVerificationObject(key);

    expect(mocks.head).toHaveBeenCalledWith(BUCKET, key);
    expect(mocks.getTags).toHaveBeenCalledWith(BUCKET, key);
    expect(mocks.putTags).toHaveBeenCalledWith(BUCKET, key, [
      { Key: "upload-state", Value: "linked" },
    ]);
    expect(mocks.deleteObject).toHaveBeenCalledWith(BUCKET, key);
  });
});
