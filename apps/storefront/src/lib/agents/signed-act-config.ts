/**
 * Signed agent acts: the switch, the audience and the numbers the design
 * page left open ("numbers in the PR"), in one place.
 *
 * The path is closed unless AGENT_SIGNED_ACTS is exactly "on" AND
 * AGENT_SIGNED_ACTS_AUDIENCE holds this deployment's origin (production
 * https://cambridgetcg.com; each preview deployment its own). The audience
 * is never derived from the request's Host. Closed, the MCP tool agent.act
 * and POST /api/v1/agents/act answer signed_acts_closed before reading the
 * act, and the operator's binding refuses: nothing reads or writes the
 * signed-act tables. Turning it on in production needs the owner's word
 * (docs/plans/agent-auth/held-keys.md, D4), which has not been given.
 *
 * Every number here is an agent's choice; the page proposed the shape
 * (limits per client address, a ceiling per instance, exit-labelled acts
 * under their own ceiling, per-key limits after verification) and left the
 * numbers to the pull request.
 */

export const SIGNED_ACTS_FLAG = "AGENT_SIGNED_ACTS";
export const SIGNED_ACTS_AUDIENCE_ENV = "AGENT_SIGNED_ACTS_AUDIENCE";

type Env = Readonly<Record<string, string | undefined>>;

export type SignedActsConfig = { open: true; audience: string } | { open: false };

/** An http(s) origin with nothing after it: scheme, host and optional port. */
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

export function signedActsConfig(env: Env = process.env): SignedActsConfig {
  if (env[SIGNED_ACTS_FLAG] !== "on") return { open: false };
  // Trimmed: Vercel sometimes stores values with trailing whitespace.
  const audience = (env[SIGNED_ACTS_AUDIENCE_ENV] ?? "").trim();
  if (!isOrigin(audience)) return { open: false };
  return { open: true, audience };
}

export function signedActsOpen(env: Env = process.env): boolean {
  return signedActsConfig(env).open;
}

/** In-memory limits, per server instance, never stored. A flood spread
 *  across instances gets further than these numbers. */
export const SIGNED_ACT_LIMITS = {
  /** Fixed windows of this many seconds. */
  windowSeconds: 60,
  /** Per client address (an IPv4 address or an IPv6 /64) per window,
   *  counted apart for exit-labelled acts, for the other acts and for
   *  previews. */
  perAddress: 20,
  /** Non-exit acts per instance per window. Previews are not counted. */
  perInstance: 600,
  /** Exit-labelled acts (key.revoke) per instance per window: their own
   *  ceiling, so a flood of other acts cannot starve them, nor they others.
   *  A verify costs about 1.6 ms, so this is a few percent of one core. */
  exitPerInstance: 1200,
  /** After verification, acts per signing key per window, exit acts
   *  included. */
  perKey: 30,
  /** Addresses tracked per class per window; past this, new ones share one
   *  overflow bucket in that class. */
  maxTrackedAddresses: 10_000,
} as const;

/** A pending signing key (bound, never confirmed by a signed act) lapses
 *  after this many days; the maintenance sweep is to delete it. */
export const PENDING_SIGNING_KEY_DAYS = 7;

/** A nonce is kept until the act's exp plus this many seconds. */
export const NONCE_RETENTION_AFTER_EXP_SECONDS = 60;

/** Expired nonces deleted inside each act's transaction. */
export const NONCE_PURGE_PER_ACT = 16;

/** The request body the REST door reads, at most. An act is at most 8 KiB. */
export const SIGNED_ACT_MAX_BODY_BYTES = 16 * 1024;
