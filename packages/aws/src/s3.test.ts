import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPresignedUploadUrl } from "./s3";

beforeEach(() => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-access-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret-key");
  vi.stubEnv("AWS_SESSION_TOKEN", "test-session-token");
  vi.stubEnv("AWS_REGION", "us-east-1");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("S3 presigned upload capabilities", () => {
  it("binds content type and keeps object tagging in a required signed header", async () => {
    const result = await getPresignedUploadUrl({
      bucket: "private-test-bucket",
      key: "verifications/test/probe.jpg",
      contentType: "image/jpeg",
      tagging: "upload-state=pending",
    });
    const url = new URL(result.uploadUrl);

    expect(url.searchParams.has("x-amz-tagging")).toBe(false);
    expect(url.searchParams.get("X-Amz-Security-Token")).toBe(
      "test-session-token",
    );
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual([
      "content-type",
      "host",
      "x-amz-tagging",
    ]);
  });
});
