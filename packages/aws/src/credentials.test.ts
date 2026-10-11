import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  awsCredentialsProvider: vi.fn(),
}));

vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: mocks.awsCredentialsProvider,
}));

import {
  refreshBeforeExpiry,
  resolveAwsConfig,
  resolveAwsConfigOrThrow,
  roleSessionName,
  ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS,
  STATIC_FALLBACK_ENV,
  vercelOidcTokenSource,
} from "./credentials";

// Distinctive fake values so the "never echo values" checks are meaningful.
const ACCESS_KEY = "fake-static-access-key-id";
const SECRET_KEY = "fake-secret-value-do-not-print";
const ROLE_ARN = "arn:aws:iam::000000000000:role/fake-role-for-tests";
const OIDC_TOKEN = "fake.oidc.token-value";

const ENV_NAMES = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ROLE_ARN",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_OIDC_TOKEN",
  STATIC_FALLBACK_ENV,
];

function onVercel(env = "production") {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", env);
}

function staticKeys() {
  vi.stubEnv("AWS_ACCESS_KEY_ID", ACCESS_KEY);
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", SECRET_KEY);
}

function expectValueFree(text: string) {
  for (const value of [ACCESS_KEY, SECRET_KEY, ROLE_ARN, OIDC_TOKEN]) {
    expect(text).not.toContain(value);
  }
}

beforeEach(() => {
  // Start every test from a known-empty AWS/Vercel environment.
  for (const name of ENV_NAMES) vi.stubEnv(name, "");
  mocks.awsCredentialsProvider.mockReset();
  mocks.awsCredentialsProvider.mockImplementation(() => async () => ({
    accessKeyId: "ASIAROLEKEY",
    secretAccessKey: "role-secret",
    sessionToken: "role-session-token",
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("static keys (no AWS_ROLE_ARN): unchanged behaviour", () => {
  it("uses trimmed static keys and region", () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", ` ${ACCESS_KEY}\n`);
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", `${SECRET_KEY}\n`);
    vi.stubEnv("AWS_REGION", " eu-west-2\n");

    const result = resolveAwsConfig();

    expect(result).toEqual({
      ok: true,
      config: {
        region: "eu-west-2",
        credentialSource: "static-keys",
        credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
      },
    });
    expect(mocks.awsCredentialsProvider).not.toHaveBeenCalled();
  });

  it("uses the caller's default region when AWS_REGION is unset", () => {
    staticKeys();
    const result = resolveAwsConfig("eu-west-2");
    expect(result.ok && result.config.region).toBe("eu-west-2");
  });

  it("returns the existing value-free error when nothing is configured", () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", ACCESS_KEY);

    const result = resolveAwsConfig();

    expect(result).toEqual({
      ok: false,
      error:
        "AWS credentials not configured (region=us-east-1, accessKeyId=set, secretAccessKey=missing)",
    });
    if (!result.ok) expectValueFree(result.error);
  });

  it("treats a whitespace-only AWS_ROLE_ARN as unset", () => {
    staticKeys();
    onVercel();
    vi.stubEnv("AWS_ROLE_ARN", "  \n");

    const result = resolveAwsConfig();

    expect(result.ok && result.config.credentialSource).toBe("static-keys");
    expect(mocks.awsCredentialsProvider).not.toHaveBeenCalled();
  });

  it("resolveAwsConfigOrThrow throws the same value-free error", () => {
    expect(() => resolveAwsConfigOrThrow()).toThrow(
      "AWS credentials not configured (region=us-east-1, accessKeyId=missing, secretAccessKey=missing)",
    );
  });
});

describe("AWS_ROLE_ARN on Vercel: role provider", () => {
  it("builds the Vercel OIDC provider with trimmed role, session name and STS region", () => {
    onVercel("production");
    vi.stubEnv("AWS_ROLE_ARN", ` ${ROLE_ARN}\n`);
    vi.stubEnv("AWS_REGION", "us-east-1\n");

    const result = resolveAwsConfig();

    expect(mocks.awsCredentialsProvider).toHaveBeenCalledTimes(1);
    expect(mocks.awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: ROLE_ARN,
      roleSessionName: "cambridgetcg-production",
      clientConfig: { region: "us-east-1" },
    });
    // No audience: the token keeps its default team audience.
    expect(mocks.awsCredentialsProvider.mock.calls[0][0]).not.toHaveProperty("audience");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.credentialSource).toBe("vercel-oidc-role");
    expect(result.config.region).toBe("us-east-1");
    expect(typeof result.config.credentials).toBe("function");
  });

  it("ignores static keys on the role path, including ones Vercel may inject", () => {
    onVercel("preview");
    staticKeys();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);

    const result = resolveAwsConfig();

    expect(result.ok && result.config.credentialSource).toBe("vercel-oidc-role");
    expect(mocks.awsCredentialsProvider.mock.calls[0][0].roleSessionName).toBe(
      "cambridgetcg-preview",
    );
    expect(JSON.stringify(mocks.awsCredentialsProvider.mock.calls[0][0])).not.toContain(
      SECRET_KEY,
    );
  });

  it("returns credentials from the Vercel provider", async () => {
    onVercel();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);

    const result = resolveAwsConfig();
    if (!result.ok || result.config.credentialSource !== "vercel-oidc-role") {
      throw new Error("expected role config");
    }

    await expect(result.config.credentials()).resolves.toMatchObject({
      accessKeyId: "ASIAROLEKEY",
      sessionToken: "role-session-token",
    });
  });

  it("uses a pulled VERCEL_OIDC_TOKEN as a token source off Vercel", () => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("VERCEL_OIDC_TOKEN", OIDC_TOKEN);
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);

    const result = resolveAwsConfig();

    expect(result.ok && result.config.credentialSource).toBe("vercel-oidc-role");
    expect(mocks.awsCredentialsProvider.mock.calls[0][0].roleSessionName).toBe(
      "cambridgetcg-development",
    );
  });
});

describe("AWS_ROLE_ARN without an OIDC token source", () => {
  it("fails clearly instead of silently using static keys", () => {
    staticKeys();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);

    const result = resolveAwsConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("AWS_ROLE_ARN is set but no Vercel OIDC token is available");
    expect(result.error).toContain(`${STATIC_FALLBACK_ENV}=1`);
    expectValueFree(result.error);
    expect(mocks.awsCredentialsProvider).not.toHaveBeenCalled();
  });

  it("does not treat local `vercel env pull` (VERCEL=1, development, no token) as a deployment", () => {
    onVercel("development");
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);

    expect(vercelOidcTokenSource()).toBeNull();
    expect(resolveAwsConfig().ok).toBe(false);
  });

  it("uses static keys only with the explicit opt-in, and says why", () => {
    staticKeys();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    vi.stubEnv(STATIC_FALLBACK_ENV, " true\n");

    const result = resolveAwsConfig();

    expect(result.ok).toBe(true);
    if (!result.ok || result.config.credentialSource !== "static-keys") {
      throw new Error("expected static fallback");
    }
    expect(result.config.credentials).toEqual({
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    });
    expect(result.config.notice).toContain(STATIC_FALLBACK_ENV);
    expectValueFree(result.config.notice ?? "");
    expect(mocks.awsCredentialsProvider).not.toHaveBeenCalled();
  });

  it("reports missing keys when the opt-in has nothing to fall back to", () => {
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", SECRET_KEY);
    vi.stubEnv(STATIC_FALLBACK_ENV, "1");

    const result = resolveAwsConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("accessKeyId=missing, secretAccessKey=set");
    expectValueFree(result.error);
  });

  it("ignores opt-in values that are not an explicit yes", () => {
    staticKeys();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    vi.stubEnv(STATIC_FALLBACK_ENV, "0");

    expect(resolveAwsConfig().ok).toBe(false);
  });
});

describe("roleSessionName", () => {
  it("names the Vercel environment", () => {
    expect(roleSessionName("production")).toBe("cambridgetcg-production");
  });

  it("falls back to unknown and stays within STS limits", () => {
    expect(roleSessionName("")).toBe("cambridgetcg-unknown");
    expect(roleSessionName("feature branch/x")).toBe("cambridgetcg-feature-branch-x");
    expect(roleSessionName("x".repeat(100))).toHaveLength(64);
  });
});

describe("refreshBeforeExpiry", () => {
  it("reports expiration early by the margin so the SDK refreshes sooner", async () => {
    const expiration = new Date("2026-10-12T12:00:00Z");
    const inner = vi.fn(async () => ({
      accessKeyId: "A",
      secretAccessKey: "S",
      sessionToken: "T",
      expiration,
    }));

    const credentials = await refreshBeforeExpiry(inner)({ forceRefresh: true });

    expect(inner).toHaveBeenCalledWith({ forceRefresh: true });
    expect(credentials.expiration?.getTime()).toBe(
      expiration.getTime() - ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS * 1000,
    );
    expect(credentials.sessionToken).toBe("T");
    // The inner credentials object is not mutated.
    expect(expiration.toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });

  it("passes credentials without an expiration through unchanged", async () => {
    const creds = { accessKeyId: "A", secretAccessKey: "S" };
    await expect(refreshBeforeExpiry(async () => creds)()).resolves.toBe(creds);
  });
});
