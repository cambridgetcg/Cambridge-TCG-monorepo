import {
  accountExistsForSignIn,
  magicLinkRequestCapacity,
} from "./adapter";
import type { NextAuthConfig } from "next-auth";
import { isAccountAdmissionOpen } from "@/lib/release/production-gates";

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

type SignInCallback = NonNullable<
  NonNullable<NextAuthConfig["callbacks"]>["signIn"]
>;

/**
 * One callback seam for every pre-write admission decision Auth.js exposes.
 */
export const admissionSignInCallback: SignInCallback = async ({
  user,
  account,
  email,
}) => {
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
