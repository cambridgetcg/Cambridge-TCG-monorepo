/** Dedicated, fail-closed configuration for private collector media. */

export const COLLECTOR_MEDIA_VAULT_MODES = ["off", "read-only", "on"] as const;
export type CollectorMediaVaultMode = (typeof COLLECTOR_MEDIA_VAULT_MODES)[number];

export interface CollectorMediaVaultConfig {
  mode: CollectorMediaVaultMode;
  bucket: string;
  region: string;
  kmsKeyArn: string;
  expectedBucketOwner: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export type CollectorMediaVaultConfigResult =
  | { ok: true; config: CollectorMediaVaultConfig }
  | {
      ok: false;
      mode: CollectorMediaVaultMode | "invalid";
      reason: "invalid-mode" | "missing-config" | "invalid-config";
    };

export type CollectorMediaVaultOperation = "list" | "read" | "upload" | "delete";
export type CollectorMediaVaultEnv = Readonly<Record<string, string | undefined>>;

const BUCKET_RE = /^(?!xn--)(?!.*\.\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const REGION_RE = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const KMS_KEY_ARN_RE =
  /^arn:aws:kms:([a-z]{2}(?:-gov)?-[a-z]+-\d):(\d{12}):key\/[A-Za-z0-9-]+$/;

function value(env: CollectorMediaVaultEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

/**
 * Resolve only COLLECTOR_MEDIA_VAULT_* variables. There is deliberately no
 * fallback to AWS_* or AUCTION_S3_BUCKET: a wrong-but-valid public bucket is
 * more dangerous than an unavailable vault.
 */
export function resolveCollectorMediaVaultConfig(
  env: CollectorMediaVaultEnv = process.env,
): CollectorMediaVaultConfigResult {
  const rawMode = value(env, "COLLECTOR_MEDIA_VAULT_MODE") || "off";
  if (!COLLECTOR_MEDIA_VAULT_MODES.includes(rawMode as CollectorMediaVaultMode)) {
    return { ok: false, mode: "invalid", reason: "invalid-mode" };
  }
  const mode = rawMode as CollectorMediaVaultMode;

  const bucket = value(env, "COLLECTOR_MEDIA_VAULT_BUCKET");
  const region = value(env, "COLLECTOR_MEDIA_VAULT_REGION");
  const kmsKeyArn = value(env, "COLLECTOR_MEDIA_VAULT_KMS_KEY_ARN");
  const accessKeyId = value(env, "COLLECTOR_MEDIA_VAULT_ACCESS_KEY_ID");
  const secretAccessKey = value(env, "COLLECTOR_MEDIA_VAULT_SECRET_ACCESS_KEY");
  const sessionToken = value(env, "COLLECTOR_MEDIA_VAULT_SESSION_TOKEN");
  const erasureVerified = value(env, "COLLECTOR_MEDIA_VAULT_ERASURE_VERIFIED") === "true";

  if (!bucket || !region || !kmsKeyArn || !accessKeyId || !secretAccessKey) {
    return { ok: false, mode, reason: "missing-config" };
  }

  const kmsArn = KMS_KEY_ARN_RE.exec(kmsKeyArn);
  if (
    !BUCKET_RE.test(bucket) ||
    bucket.includes("..") ||
    !REGION_RE.test(region) ||
    !kmsArn ||
    kmsArn[1] !== region ||
    (mode !== "off" && !erasureVerified)
  ) {
    return { ok: false, mode, reason: "invalid-config" };
  }

  return {
    ok: true,
    config: {
      mode,
      bucket,
      region,
      kmsKeyArn,
      expectedBucketOwner: kmsArn[2],
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    },
  };
}

/** Deletion stays available in every mode, but only with complete config. */
export function collectorMediaVaultOperationAllowed(
  result: CollectorMediaVaultConfigResult,
  operation: CollectorMediaVaultOperation,
): result is { ok: true; config: CollectorMediaVaultConfig } {
  if (!result.ok) return false;
  if (operation === "delete" || operation === "list") return true;
  if (operation === "read") return result.config.mode !== "off";
  return result.config.mode === "on";
}
