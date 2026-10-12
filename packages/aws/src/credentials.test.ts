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
  vercelDeploymentMarkers,
  vercelOidcTokenSource,
  type AwsConfig,
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
  "VERCEL_REGION",
  "AWS_LAMBDA_FUNCTION_NAME",
  STATIC_FALLBACK_ENV,
];

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

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

/** Role configs load the provider lazily; one credential request builds it. */
async function roleProviderInit(config: AwsConfig) {
  if (config.credentialSource !== "vercel-oidc-role") throw new Error("expected role config");
  await config.credentials();
  expect(mocks.awsCredentialsProvider).toHaveBeenCalledTimes(1);
  return mocks.awsCredentialsProvider.mock.calls[0][0];
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
  delete (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT];
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
  it("builds the Vercel OIDC provider with trimmed role, session name and STS region", async () => {
    onVercel("production");
    vi.stubEnv("AWS_ROLE_ARN", ` ${ROLE_ARN}\n`);
    vi.stubEnv("AWS_REGION", "us-east-1\n");

    const result = resolveAwsConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.credentialSource).toBe("vercel-oidc-role");
    expect(result.config.region).toBe("us-east-1");
    expect(result.config.notice).toBeUndefined();
    expect(typeof result.config.credentials).toBe("function");
    // Lazy: nothing is built until the SDK first asks for credentials.
    expect(mocks.awsCredentialsProvider).not.toHaveBeenCalled();

    const init = await roleProviderInit(result.config);
    expect(init).toEqual({
      roleArn: ROLE_ARN,
      roleSessionName: "cambridgetcg-production",
      clientConfig: { region: "us-east-1" },
    });
    // No audience: the token keeps its default team audience.
    expect(init).not.toHaveProperty("audience");
  });

  it("ignores static keys on the role path, including ones Vercel may inject", async () => {
    onVercel("preview");
    staticKeys();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);

    const result = resolveAwsConfig();
    if (!result.ok) throw new Error(result.error);

    const init = await roleProviderInit(result.config);
    expect(init.roleSessionName).toBe("cambridgetcg-preview");
    expect(JSON.stringify(init)).not.toContain(SECRET_KEY);
  });

  it("builds the Vercel provider once and reuses it on later credential requests", async () => {
    onVercel();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    const result = resolveAwsConfig();
    if (!result.ok || result.config.credentialSource !== "vercel-oidc-role") {
      throw new Error("expected role config");
    }

    await result.config.credentials();
    await result.config.credentials({ forceRefresh: true });

    expect(mocks.awsCredentialsProvider).toHaveBeenCalledTimes(1);
  });

  it("ignores the static-key opt-in on a token source, and says so (pulled production env)", async () => {
    // `vercel env pull --environment=production` may write VERCEL=1 and
    // VERCEL_ENV=production. Env alone cannot tell that file from a real
    // deployment, so the opt-in never wins over the role here.
    onVercel("production");
    staticKeys();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    vi.stubEnv(STATIC_FALLBACK_ENV, "1");

    const result = resolveAwsConfig();

    expect(result.ok && result.config.credentialSource).toBe("vercel-oidc-role");
    if (!result.ok) return;
    expect(result.config.notice).toContain(`${STATIC_FALLBACK_ENV} is set but ignored`);
    expect(result.config.notice).toContain("unset AWS_ROLE_ARN");
    expectValueFree(result.config.notice ?? "");
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

  it("uses a pulled VERCEL_OIDC_TOKEN as a token source off Vercel", async () => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("VERCEL_OIDC_TOKEN", OIDC_TOKEN);
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);

    const result = resolveAwsConfig();
    if (!result.ok) throw new Error(result.error);

    expect(result.config.credentialSource).toBe("vercel-oidc-role");
    expect((await roleProviderInit(result.config)).roleSessionName).toBe(
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
    expect(result.error).toContain("Unset AWS_ROLE_ARN");
    // The runtime error never advertises the local-only opt-in, nor a
    // development token the role's trust policy does not accept.
    expect(result.error).not.toContain(STATIC_FALLBACK_ENV);
    expect(result.error).not.toContain("vercel env pull");
    expectValueFree(result.error);
    expect(mocks.awsCredentialsProvider).not.toHaveBeenCalled();
  });

  it("errors when VERCEL_ENV says production but VERCEL is missing (no token source)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);

    expect(vercelOidcTokenSource()).toBeNull();
    const result = resolveAwsConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("looks like a Vercel deployment (VERCEL_ENV)");
    expect(result.error).toContain("VERCEL, VERCEL_ENV");
    expect(result.error).not.toContain(STATIC_FALLBACK_ENV);
    expectValueFree(result.error);
  });

  it.each([
    ["VERCEL_ENV=production without VERCEL", { VERCEL_ENV: "production" }, "VERCEL_ENV"],
    ["VERCEL_ENV=preview without VERCEL", { VERCEL_ENV: "preview" }, "VERCEL_ENV"],
    ["a deployed VERCEL_REGION", { VERCEL_REGION: "iad1" }, "VERCEL_REGION"],
    ["an AWS Lambda host", { AWS_LAMBDA_FUNCTION_NAME: "fn" }, "AWS_LAMBDA_FUNCTION_NAME"],
  ])("refuses the static-key opt-in on %s", (_label, env, marker) => {
    staticKeys();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    vi.stubEnv(STATIC_FALLBACK_ENV, "1");
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    const result = resolveAwsConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(`looks like a Vercel deployment (${marker})`);
    expect(result.error).toContain(`${STATIC_FALLBACK_ENV} is ignored`);
    expectValueFree(result.error);
  });

  it("refuses the static-key opt-in inside a Vercel request context", () => {
    staticKeys();
    vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
    vi.stubEnv(STATIC_FALLBACK_ENV, "1");
    (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT] = { get: () => ({}) };

    expect(vercelDeploymentMarkers()).toEqual(["Vercel request context"]);
    expect(resolveAwsConfig().ok).toBe(false);
  });

  it("does not treat `vercel dev` (development, VERCEL_REGION=dev1) as a deployment", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("VERCEL_REGION", "dev1");

    expect(vercelDeploymentMarkers()).toEqual([]);
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
    // A plain local process; `vercel env pull` (development) adds these.
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "development");
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
