import { describe, expect, it } from "vitest";

import {
  collectorMediaVaultOperationAllowed,
  resolveCollectorMediaVaultConfig,
} from "./config";

function complete(mode = "on"): Record<string, string | undefined> {
  return {
    COLLECTOR_MEDIA_VAULT_MODE: mode,
    COLLECTOR_MEDIA_VAULT_BUCKET: "ctcg-private-collector-media",
    COLLECTOR_MEDIA_VAULT_REGION: "eu-west-2",
    COLLECTOR_MEDIA_VAULT_KMS_KEY_ARN:
      "arn:aws:kms:eu-west-2:123456789012:key/11111111-2222-4333-8444-555555555555",
    COLLECTOR_MEDIA_VAULT_ACCESS_KEY_ID: "vault-only-access-key",
    COLLECTOR_MEDIA_VAULT_SECRET_ACCESS_KEY: "vault-only-secret",
    COLLECTOR_MEDIA_VAULT_ERASURE_VERIFIED: "true",
  };
}

describe("collector media vault configuration", () => {
  it("defaults to off and fails closed when dedicated configuration is absent", () => {
    const result = resolveCollectorMediaVaultConfig({});

    expect(result).toEqual({ ok: false, mode: "off", reason: "missing-config" });
    expect(collectorMediaVaultOperationAllowed(result, "read")).toBe(false);
    expect(collectorMediaVaultOperationAllowed(result, "list")).toBe(false);
    expect(collectorMediaVaultOperationAllowed(result, "upload")).toBe(false);
    expect(collectorMediaVaultOperationAllowed(result, "delete")).toBe(false);
  });

  it("never falls back to shared AWS or public-media variables", () => {
    const result = resolveCollectorMediaVaultConfig({
      AWS_REGION: "eu-west-2",
      AWS_ACCESS_KEY_ID: "shared",
      AWS_SECRET_ACCESS_KEY: "shared-secret",
      AUCTION_S3_BUCKET: "old-public-media",
    });

    expect(result.ok).toBe(false);
  });

  it("allows deletion but no intake or reading in fully configured off mode", () => {
    const env = complete("off");
    delete env.COLLECTOR_MEDIA_VAULT_ERASURE_VERIFIED;
    const result = resolveCollectorMediaVaultConfig(env);

    expect(result.ok).toBe(true);
    expect(collectorMediaVaultOperationAllowed(result, "list")).toBe(true);
    expect(collectorMediaVaultOperationAllowed(result, "read")).toBe(false);
    expect(collectorMediaVaultOperationAllowed(result, "upload")).toBe(false);
    expect(collectorMediaVaultOperationAllowed(result, "delete")).toBe(true);
  });

  it("refuses non-off modes until account erasure is explicitly verified", () => {
    const env = complete("read-only");
    delete env.COLLECTOR_MEDIA_VAULT_ERASURE_VERIFIED;
    expect(resolveCollectorMediaVaultConfig(env)).toEqual({
      ok: false,
      mode: "read-only",
      reason: "invalid-config",
    });
  });

  it("makes read-only mode readable and deletable without enabling intake", () => {
    const result = resolveCollectorMediaVaultConfig(complete("read-only"));

    expect(collectorMediaVaultOperationAllowed(result, "read")).toBe(true);
    expect(collectorMediaVaultOperationAllowed(result, "upload")).toBe(false);
    expect(collectorMediaVaultOperationAllowed(result, "delete")).toBe(true);
  });

  it("trims dedicated values and carries an optional session token", () => {
    const env = complete();
    env.COLLECTOR_MEDIA_VAULT_BUCKET = "  ctcg-private-collector-media  ";
    env.COLLECTOR_MEDIA_VAULT_SESSION_TOKEN = "  short-lived-token  ";
    const result = resolveCollectorMediaVaultConfig(env);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.bucket).toBe("ctcg-private-collector-media");
      expect(result.config.expectedBucketOwner).toBe("123456789012");
      expect(result.config.credentials.sessionToken).toBe("short-lived-token");
    }
  });

  it.each([
    ["invalid mode", { ...complete("sometimes") }],
    [
      "bucket",
      { ...complete(), COLLECTOR_MEDIA_VAULT_BUCKET: "HTTPS://public.example" },
    ],
    [
      "region mismatch",
      {
        ...complete(),
        COLLECTOR_MEDIA_VAULT_KMS_KEY_ARN:
          "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-4333-8444-555555555555",
      },
    ],
  ])("rejects %s", (_name, env) => {
    expect(resolveCollectorMediaVaultConfig(env).ok).toBe(false);
  });
});
