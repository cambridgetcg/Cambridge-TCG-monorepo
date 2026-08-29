/**
 * AWS credential resolution.
 *
 * Every AWS client in the monorepo must go through this module so that:
 * 1. Vercel whitespace is trimmed (their env vars sometimes have trailing \n)
 * 2. Missing credentials are detected early and reported, not swallowed
 * 3. Region defaults are consistent
 */

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Required for temporary STS/Lambda/ECS credentials; absent for long-lived keys. */
  sessionToken?: string;
}

export interface AwsConfig {
  region: string;
  credentials: AwsCredentials;
}

export type AwsConfigResult =
  | { ok: true; config: AwsConfig }
  | { ok: false; error: string };

/**
 * Resolve AWS credentials from environment variables.
 *
 * Returns a discriminated union so callers can decide whether to crash or
 * degrade gracefully. The `sendEmail()` graceful sender pattern pioneered
 * this approach — now every AWS client can use it.
 *
 * @param defaultRegion — apps can pass their own default (wholesale uses eu-west-2)
 */
export function resolveAwsConfig(
  defaultRegion = "us-east-1",
): AwsConfigResult {
  const region = (process.env.AWS_REGION || defaultRegion).trim();
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const sessionToken = (process.env.AWS_SESSION_TOKEN || "").trim();

  if (!accessKeyId || !secretAccessKey) {
    return {
      ok: false,
      error: `AWS credentials not configured (region=${region}, accessKeyId=${accessKeyId ? "set" : "missing"}, secretAccessKey=${secretAccessKey ? "set" : "missing"})`,
    };
  }

  return {
    ok: true,
    config: {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    },
  };
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
