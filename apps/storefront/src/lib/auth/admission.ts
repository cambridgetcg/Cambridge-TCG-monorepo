import {
  accountExistsForSignIn,
  magicLinkRequestCapacity,
  PgAdapter,
} from "./adapter";
import { getVerifiedGitHubIdentity } from "./github";
import type { NextAuthConfig } from "next-auth";
import { getToken } from "next-auth/jwt";
import { SESSION_COOKIE_OVERRIDE } from "./cookies";
import { isAccountAdmissionOpen } from "@/lib/release/production-gates";
import { recordGitHubVerificationEvent } from "./verification-observer";

/**
 * Auth.js's normal successful email sign-in target. Returning this from its
 * signIn callback stops before token creation and delivery while preserving
 * the same external 302, empty body, Location and callback cookie as a real
 * magic-link request.
 */
export const MAGIC_LINK_SUCCESS_REDIRECT =
  "/api/auth/verify-request?provider=email&type=email";

export const REGISTRATION_PAUSED_REDIRECT =
  "/login/error?error=RegistrationPaused";

export const MAGIC_LINK_RESPONSE_FLOOR_MS = 750;

type AdmissionEnv = {
  NODE_ENV?: string;
  ACCOUNT_ADMISSION_MODE?: string;
};

/**
 * Decide whether Auth.js may create and deliver a verification token. Every
 * internal denial deliberately returns the ordinary success redirect: neither
 * account existence nor an address-specific token count belongs in the public
 * response contract.
 */
export async function magicLinkSignInDecision(
  email: string,
  env: AdmissionEnv = process.env,
): Promise<true | string> {
  const capacity = await magicLinkRequestCapacity(email);
  if (!capacity.allowed) return MAGIC_LINK_SUCCESS_REDIRECT;

  if (
    !isAccountAdmissionOpen(env)
    && !(await accountExistsForSignIn(email))
  ) {
    return MAGIC_LINK_SUCCESS_REDIRECT;
  }

  return true;
}

/**
 * Google has already verified the address supplied to this callback. While
 * admission is closed, it may authenticate or link to an existing email but
 * must stop a first-time address before Auth.js creates a user, account link or
 * session. Missing email cannot establish the existing-account exception.
 */
export async function googleSignInDecision(
  email: string | null | undefined,
  env: AdmissionEnv = process.env,
): Promise<true | string> {
  if (isAccountAdmissionOpen(env)) return true;
  if (!email || !(await accountExistsForSignIn(email))) {
    return REGISTRATION_PAUSED_REDIRECT;
  }
  return true;
}

type SessionUserIdLookup = () => Promise<string | null>;

/**
 * Read the browser's database session without calling auth() recursively or
 * touching its lifetime. Auth.js's public raw-token helper reconstructs cookie
 * chunks; database lookup, not cookie presence, establishes authentication.
 */
export async function getGitHubSessionUserId(
  request: Pick<Request, "headers" | "url"> | undefined,
  options: { useSecureCookies?: boolean; cookieName?: string } = {},
): Promise<string | null> {
  if (!request) throw new Error("Missing GitHub callback request");
  // Match NextAuth's reqWithEnvURL and core's cookie choice exactly. Looking at
  // both default names could mistake a stale session for the one core will use.
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const secure = options.useSecureCookies ?? (new URL(url || request.url).protocol === "https:");
  const cookieName = options.cookieName ?? SESSION_COOKIE_OVERRIDE
    ?? `${secure ? "__Secure-" : ""}authjs.session-token`;
  // A bearer header is not a browser session and handle-login does not use it.
  const headers = new Headers({ cookie: request.headers.get("cookie") ?? "" });
  const token = await getToken({ req: { headers }, cookieName, raw: true });
  if (!token) return null;
  const result = await PgAdapter().getSessionAndUser!(token);
  // The adapter filters expiry today. If that contract changes, do not treat a
  // returned stale session as absent: core's linking branch still sees its user.
  if (result && !(result.session.expires.getTime() > Date.now())) {
    throw new Error("Invalid GitHub browser session");
  }
  return result?.user.id ?? null;
}

/**
 * Resolve the stable link before today's email, even when admission is open.
 * For a first link, an existing browser session is not permission to attach an
 * unrelated GitHub identity: only the verified-email target may receive it.
 */
export async function githubSignInDecision(
  input: {
    profile: unknown;
    providerAccountId: unknown;
    getSessionUserId?: SessionUserIdLookup;
  },
  env: AdmissionEnv = process.env,
): Promise<boolean | string> {
  const identity = getVerifiedGitHubIdentity(input.profile, input.providerAccountId);
  if (!identity) {
    recordGitHubVerificationEvent("invalid_proof");
    return false;
  }
  if (!input.getSessionUserId) {
    recordGitHubVerificationEvent("missing_request_context");
    return false;
  }
  const adapter = PgAdapter();
  const linkedUser = await adapter.getUserByAccount!({
    provider: "github",
    providerAccountId: identity.providerAccountId,
  });
  // An established link is authoritative after email changes; core still
  // rejects attempts to use somebody else's link from an authenticated session.
  if (linkedUser) {
    recordGitHubVerificationEvent("established_link");
    return true;
  }

  const sessionUserId = await input.getSessionUserId();
  if (sessionUserId) {
    const intendedUser = await adapter.getUserByEmail!(identity.email);
    const matchesTarget = intendedUser?.id === sessionUserId;
    if (!matchesTarget) recordGitHubVerificationEvent("first_link_session_target_mismatch");
    return matchesTarget;
  }
  if (isAccountAdmissionOpen(env)) return true;
  if (await accountExistsForSignIn(identity.email)) return true;
  recordGitHubVerificationEvent("registration_paused");
  return REGISTRATION_PAUSED_REDIRECT;
}

type SignInCallback = NonNullable<
  NonNullable<NextAuthConfig["callbacks"]>["signIn"]
>;

/**
 * One callback seam for every pre-write admission decision Auth.js exposes.
 */
export function createAdmissionSignInCallback(
  getSessionUserId?: SessionUserIdLookup,
): SignInCallback {
  return async ({ user, account, email, profile }) => {
    if (account?.provider === "github") {
      if (account.type !== "oauth") {
        recordGitHubVerificationEvent("invalid_proof");
        return false;
      }
      return githubSignInDecision({
        profile,
        providerAccountId: account.providerAccountId,
        getSessionUserId,
      });
    }

    if (
      account?.type === "email"
      && email?.verificationRequest === true
      && user.email
    ) {
      return magicLinkSignInDecision(user.email);
    }

    if (
      account?.provider === "google"
      && (account.type === "oauth" || account.type === "oidc")
    ) {
      return googleSignInDecision(user.email);
    }

    return true;
  };
}

// Missing request context is deliberately closed for GitHub; other providers
// retain their existing standalone callback behavior.
export const admissionSignInCallback = createAdmissionSignInCallback();

type Wait = (milliseconds: number) => Promise<void>;

/**
 * Keep the cheap synthetic path in the same broad latency class as delivery.
 * This is a bounded response floor, not a claim of cryptographic constant
 * time. Unknown and unrecognised runtimes get the production-safe behaviour.
 */
export async function waitForMagicLinkResponseFloor(
  startedAtMs: number,
  env: Pick<AdmissionEnv, "NODE_ENV"> = process.env,
  now: () => number = () => performance.now(),
  wait: Wait = (milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }),
): Promise<void> {
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return;

  const remaining = MAGIC_LINK_RESPONSE_FLOOR_MS - (now() - startedAtMs);
  if (remaining > 0) await wait(remaining);
}
