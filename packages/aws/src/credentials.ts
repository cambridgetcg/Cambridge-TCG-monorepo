/**
 * AWS credential resolution.
 *
 * Every AWS client in the monorepo must go through this module so that:
 * 1. Vercel whitespace is trimmed (their env vars sometimes have trailing \n)
 * 2. Missing credentials are detected early and reported, not swallowed
 * 3. Region defaults are consistent
 * 4. The credential source is chosen in one place, from config, never by a
 *    runtime try/catch that could quietly swap identities
 *
 * ── Precedence (first match wins) ─────────────────────────────────────────
 *
 * 1. `AWS_ROLE_ARN` set (trimmed, non-empty) and a Vercel OIDC token source
 *    exists → assume that role through `@vercel/oidc-aws-credentials-provider`
 *    (STS AssumeRoleWithWebIdentity). Static keys are ignored on this path,
 *    including AWS_* values Vercel may inject into functions on its own,
 *    which are not usable credentials.
 *    A token source is either a Vercel production/preview deployment
 *    (`VERCEL=1`, `VERCEL_ENV` not `development`; the token arrives per request
 *    in the `x-vercel-oidc-token` header) or a `VERCEL_OIDC_TOKEN` env var
 *    (`vercel env pull` for local development, or a Vercel build).
 *    `AWS_ROLE_ARN` set with NO token source is an error result, so a
 *    misconfigured runtime never silently falls back to long-lived keys.
 *    The one explicit opt-out is `AWS_OIDC_ALLOW_STATIC_FALLBACK=1`, which
 *    makes that case use step 2 instead and reports it in `notice`.
 * 2. `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` → static IAM user keys.
 *    Unchanged behaviour; tcg-wholesale (frozen) and local dev rely on it.
 * 3. Otherwise → error result.
 *
 * Errors and notices name variables and say set/missing. They never contain
 * a key, a secret, a token or the role ARN.
 *
 * Runbook: docs/ops-aws-oidc.md.
 */

import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/** Lazy provider the AWS SDK calls (and memoizes) whenever it needs credentials. */
export type AwsCredentialProvider = ReturnType<typeof awsCredentialsProvider>;

export type AwsCredentialSource = "vercel-oidc-role" | "static-keys";

export type AwsConfig =
  | {
      region: string;
      credentialSource: "vercel-oidc-role";
      credentials: AwsCredentialProvider;
    }
  | {
      region: string;
      credentialSource: "static-keys";
      credentials: AwsCredentials;
      /** Value-free reason when AWS_ROLE_ARN was set but ignored by explicit opt-in. */
      notice?: string;
    };

export type AwsConfigResult =
  | { ok: true; config: AwsConfig }
  | { ok: false; error: string };

/** Env flag that lets AWS_ROLE_ARN fall back to static keys when no OIDC token source exists. */
export const STATIC_FALLBACK_ENV = "AWS_OIDC_ALLOW_STATIC_FALLBACK";

/**
 * Role credentials are reported to the SDK as expiring this many seconds
 * early. The SDK refreshes credentials only in their last few minutes, and a
 * presigned URL signed with role credentials stops working when the role
 * session ends, whatever its own `expiresIn` says. Refreshing early keeps at
 * least this much session left at signing time, so presigned URLs up to this
 * long (the storefront uses 300–600 s) live their full lifetime.
 */
export const ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS = 15 * 60;

function readEnv(name: string): string {
  return (process.env[name] || "").trim();
}

function isTruthyFlag(value: string): boolean {
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

/**
 * Where a Vercel OIDC token would come from in this process, or null.
 * Checks presence only; the token value is never read here.
 */
export function vercelOidcTokenSource(): "vercel-deployment" | "env-token" | null {
  const vercelEnv = readEnv("VERCEL_ENV");
  if (readEnv("VERCEL") === "1" && vercelEnv && vercelEnv !== "development") {
    return "vercel-deployment";
  }
  if (readEnv("VERCEL_OIDC_TOKEN")) return "env-token";
  return null;
}

/**
 * STS session name, e.g. `cambridgetcg-production`, so CloudTrail shows which
 * Vercel environment assumed the role. STS allows 2–64 chars of [\w+=,.@-].
 */
export function roleSessionName(vercelEnv = readEnv("VERCEL_ENV")): string {
  const env = vercelEnv.replace(/[^\w+=,.@-]/g, "-") || "unknown";
  return `cambridgetcg-${env}`.slice(0, 64);
}

/**
 * Wrap a provider so each credential set reports an expiration
 * `marginSeconds` early, which makes the SDK refresh that much sooner.
 * Credentials without an expiration pass through unchanged.
 */
export function refreshBeforeExpiry(
  provider: AwsCredentialProvider,
  marginSeconds = ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS,
): AwsCredentialProvider {
  return async (identityProperties) => {
    const credentials = await provider(identityProperties);
    if (!credentials.expiration) return credentials;
    return {
      ...credentials,
      expiration: new Date(credentials.expiration.getTime() - marginSeconds * 1000),
    };
  };
}

function resolveStaticKeys(region: string, context: string): AwsConfigResult {
  const accessKeyId = readEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("AWS_SECRET_ACCESS_KEY");

  if (!accessKeyId || !secretAccessKey) {
    return {
      ok: false,
      error: `${context} (region=${region}, accessKeyId=${accessKeyId ? "set" : "missing"}, secretAccessKey=${secretAccessKey ? "set" : "missing"})`,
    };
  }

  return {
    ok: true,
    config: {
      region,
      credentialSource: "static-keys",
      credentials: { accessKeyId, secretAccessKey },
    },
  };
}

/**
 * Resolve AWS region and credentials from environment variables.
 *
 * Returns a discriminated union so callers can decide whether to crash or
 * degrade gracefully. The `sendEmail()` graceful sender pattern pioneered
 * this approach — now every AWS client can use it.
 *
 * Role credentials are lazy: building the config makes no network call. A
 * missing request token or a trust-policy mismatch surfaces on the first AWS
 * request (send or presign), not here.
 *
 * @param defaultRegion — apps can pass their own default (wholesale uses eu-west-2)
 */
export function resolveAwsConfig(
  defaultRegion = "us-east-1",
): AwsConfigResult {
  const region = (process.env.AWS_REGION || defaultRegion).trim();
  const roleArn = readEnv("AWS_ROLE_ARN");

  if (!roleArn) {
    return resolveStaticKeys(region, "AWS credentials not configured");
  }

  if (vercelOidcTokenSource()) {
    const provider = awsCredentialsProvider({
      roleArn,
      roleSessionName: roleSessionName(),
      // 3.3.9 does not pass the calling client's region to STS; without this
      // STS falls back to AWS_REGION or us-east-1 on its own.
      clientConfig: { region },
      // No `audience`: the token keeps its default team audience, which the
      // IAM identity provider registers. No exchange call to Vercel.
    });
    return {
      ok: true,
      config: {
        region,
        credentialSource: "vercel-oidc-role",
        credentials: refreshBeforeExpiry(provider),
      },
    };
  }

  const noOidcSource =
    "AWS_ROLE_ARN is set but no Vercel OIDC token is available here (not a Vercel production/preview deployment, and VERCEL_OIDC_TOKEN is missing)";

  if (!isTruthyFlag(readEnv(STATIC_FALLBACK_ENV))) {
    return {
      ok: false,
      error: `${noOidcSource} (region=${region}). Unset AWS_ROLE_ARN to use AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, run \`vercel env pull\` for a development token, or set ${STATIC_FALLBACK_ENV}=1 to fall back to static keys.`,
    };
  }

  const fallback = resolveStaticKeys(
    region,
    `${noOidcSource}, and the ${STATIC_FALLBACK_ENV} static-key fallback has no keys`,
  );
  if (fallback.ok && fallback.config.credentialSource === "static-keys") {
    fallback.config.notice = `${noOidcSource}; using static keys because ${STATIC_FALLBACK_ENV} is set`;
  }
  return fallback;
}

/**
 * Resolve AWS config or throw. Use this for code paths where missing
 * credentials are a hard error (batch jobs, cron handlers).
 */
export function resolveAwsConfigOrThrow(defaultRegion = "us-east-1"): AwsConfig {
  const result = resolveAwsConfig(defaultRegion);
  if (!result.ok) throw new Error(result.error);
  return result.config;
}

/**
 * Log which credential source a new client uses, value-free. On Vercel the
 * line `[packages/aws] S3 client ready (credentials=vercel-oidc-role, ...)`
 * is the runtime evidence that the role path was selected.
 */
export function logAwsClientReady(service: "S3" | "SES", config: AwsConfig): void {
  if (config.credentialSource === "static-keys" && config.notice) {
    console.warn(`[packages/aws] ${config.notice}`);
  }
  console.info(
    `[packages/aws] ${service} client ready (credentials=${config.credentialSource}, region=${config.region})`,
  );
}
