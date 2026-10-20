import { afterEach, describe, expect, it, vi } from "vitest";

// Own file: the module registry starts empty, so the mock factory runs exactly
// when credentials.ts first imports the Vercel provider package.
const mocks = vi.hoisted(() => ({
  providerModuleLoads: 0,
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: "ASIAROLEKEY",
    secretAccessKey: "role-secret",
    sessionToken: "role-session-token",
  })),
}));

vi.mock("@vercel/oidc-aws-credentials-provider", () => {
  mocks.providerModuleLoads += 1;
  return { awsCredentialsProvider: mocks.awsCredentialsProvider };
});

import { resolveAwsConfig } from "./credentials";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vercel provider package is imported only on the role path", () => {
  it("static keys never load it; the role path loads it on the first credential request", async () => {
    for (const name of ["AWS_ROLE_ARN", "VERCEL", "VERCEL_ENV", "VERCEL_OIDC_TOKEN"]) {
      vi.stubEnv(name, "");
    }
    vi.stubEnv("AWS_ACCESS_KEY_ID", "static-access-key-id-for-tests");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "fake-static-secret-for-tests");

    expect(resolveAwsConfig().ok).toBe(true);
    expect(mocks.providerModuleLoads).toBe(0);

    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("AWS_ROLE_ARN", "arn:aws:iam::000000000000:role/fake-role-for-tests");
    const role = resolveAwsConfig();
    if (!role.ok || role.config.credentialSource !== "vercel-oidc-role") {
      throw new Error("expected role config");
    }
    expect(mocks.providerModuleLoads).toBe(0);

    await role.config.credentials();
    await role.config.credentials();
    expect(mocks.providerModuleLoads).toBe(1);
    expect(mocks.awsCredentialsProvider).toHaveBeenCalledTimes(1);
  });
});
