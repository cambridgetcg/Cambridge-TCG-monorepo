import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  awsCredentialsProvider: vi.fn(),
  roleProvider: vi.fn(),
}));

vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: mocks.awsCredentialsProvider,
}));

const ROLE_ARN = "arn:aws:iam::000000000000:role/fake-role-for-tests";
const STATIC_SECRET = "fake-static-secret-do-not-print";
const ROLE_EXPIRATION = new Date(Date.now() + 60 * 60 * 1000);

beforeEach(() => {
  for (const name of [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_ROLE_ARN",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_OIDC_TOKEN",
    "AWS_OIDC_ALLOW_STATIC_FALLBACK",
  ]) {
    vi.stubEnv(name, "");
  }
  vi.stubEnv("AWS_REGION", "us-east-1");
  mocks.roleProvider.mockReset();
  mocks.roleProvider.mockResolvedValue({
    accessKeyId: "ASIAROLEKEYFORTESTS",
    secretAccessKey: "role-secret",
    sessionToken: "role-session-token",
    expiration: ROLE_EXPIRATION,
  });
  mocks.awsCredentialsProvider.mockReset();
  mocks.awsCredentialsProvider.mockReturnValue(mocks.roleProvider);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // s3.ts / ses.ts keep per-process singletons; load fresh copies per test.
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function useRole() {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
  // Present but unusable, as Vercel may inject; the role path must ignore them.
  vi.stubEnv("AWS_ACCESS_KEY_ID", "static-key-should-not-be-used");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", STATIC_SECRET);
}

function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n");
}

describe("role provider reaches the S3 and SES clients", () => {
  it("S3 client resolves credentials through the Vercel provider", async () => {
    useRole();
    const { createS3Client } = await import("./s3");

    const client = createS3Client();
    expect(client).not.toBeNull();
    const credentials = await client!.config.credentials();

    expect(mocks.roleProvider).toHaveBeenCalled();
    expect(credentials.accessKeyId).toBe("ASIAROLEKEYFORTESTS");
    expect(credentials.sessionToken).toBe("role-session-token");
    // Reported early so the SDK refreshes before presigned URLs could outlive the session.
    expect(credentials.expiration!.getTime()).toBeLessThan(ROLE_EXPIRATION.getTime());

    const info = logged(vi.mocked(console.info));
    expect(info).toContain("S3 client ready (credentials=vercel-oidc-role, region=us-east-1)");
    expect(info).not.toContain(ROLE_ARN);
  });

  it("SES client resolves credentials through the Vercel provider", async () => {
    useRole();
    const { createSESClient } = await import("./ses");

    const client = createSESClient();
    expect(client).not.toBeNull();
    const credentials = await client!.config.credentials();

    expect(credentials.accessKeyId).toBe("ASIAROLEKEYFORTESTS");
    expect(logged(vi.mocked(console.info))).toContain(
      "SES client ready (credentials=vercel-oidc-role, region=us-east-1)",
    );
  });

  it("presigned uploads are signed with the role session", async () => {
    useRole();
    const { getPresignedUploadUrl } = await import("./s3");

    const result = await getPresignedUploadUrl({
      bucket: "private-test-bucket",
      key: "verifications/test/probe.jpg",
      contentType: "image/jpeg",
    });
    const url = new URL(result.uploadUrl);

    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^ASIAROLEKEYFORTESTS\//);
    expect(url.searchParams.get("X-Amz-Security-Token")).toBe("role-session-token");
    expect(result.uploadUrl).not.toContain("static-key-should-not-be-used");
    expect(result.publicUrl).toBe(
      "https://private-test-bucket.s3.us-east-1.amazonaws.com/verifications/test/probe.jpg",
    );
  });
});

describe("static keys still reach the clients", () => {
  it("S3 client uses static keys when AWS_ROLE_ARN is unset", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "static-access-key-id-for-tests");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", STATIC_SECRET);
    const { createS3Client } = await import("./s3");

    const credentials = await createS3Client()!.config.credentials();

    expect(credentials.accessKeyId).toBe("static-access-key-id-for-tests");
    expect(mocks.awsCredentialsProvider).not.toHaveBeenCalled();
    const info = logged(vi.mocked(console.info));
    expect(info).toContain("credentials=static-keys");
    expect(info).not.toContain(STATIC_SECRET);
  });
});

describe("AWS_ROLE_ARN without a token source", () => {
  it("clients are unavailable with a value-free warning, not static keys", async () => {
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    vi.stubEnv("AWS_ACCESS_KEY_ID", "static-access-key-id-for-tests");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", STATIC_SECRET);
    const { createS3Client } = await import("./s3");
    const { createSESClient } = await import("./ses");

    expect(createS3Client()).toBeNull();
    expect(createSESClient()).toBeNull();

    const warn = logged(vi.mocked(console.warn));
    expect(warn).toContain("AWS_ROLE_ARN is set but no Vercel OIDC token is available");
    for (const value of [ROLE_ARN, STATIC_SECRET, "static-access-key-id-for-tests"]) {
      expect(warn).not.toContain(value);
    }
  });

  it("the explicit opt-in logs its notice and uses static keys", async () => {
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    vi.stubEnv("AWS_ACCESS_KEY_ID", "static-access-key-id-for-tests");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", STATIC_SECRET);
    vi.stubEnv("AWS_OIDC_ALLOW_STATIC_FALLBACK", "1");
    const { createSESClient } = await import("./ses");

    const credentials = await createSESClient()!.config.credentials();

    expect(credentials.accessKeyId).toBe("static-access-key-id-for-tests");
    const warn = logged(vi.mocked(console.warn));
    expect(warn).toContain("using static keys because AWS_OIDC_ALLOW_STATIC_FALLBACK is set");
    expect(warn).not.toContain(STATIC_SECRET);
  });
});
