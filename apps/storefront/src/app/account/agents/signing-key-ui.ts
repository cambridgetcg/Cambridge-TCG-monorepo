/**
 * Agent-held signing keys on /account/agents: what the paste form checks in
 * the browser, and how the list words a signing key's state
 * (docs/plans/agent-auth/held-keys.md, the first slice).
 *
 * The server (lib/agents/signing-key-actions.ts and signed-act-verify.ts)
 * has the last word on every paste. This module only keeps a private key
 * from leaving the browser: a paste that holds one is refused here, before
 * any request, and the field is cleared. It imports nothing that pulls the
 * verifier or node:crypto into the client bundle.
 *
 * The state words, the expiry hints and the warnings are an agent's
 * wording, not the owner's; the owner decided only to offer the keys.
 */

import type { SigningKeyRow, SigningKeyState } from "@/lib/agents/signing-key-actions";

/** The form field that carries the paste. */
export const SIGNING_KEY_JWK_FIELD = "public_jwk";

/** What the operator is told when the paste holds a private key. The
 *  server's text for the same refusal (BINDING_JWK_ERRORS["private key"]
 *  in signed-act-verify.ts) is the same; a test holds them together. */
export const PRIVATE_KEY_PASTE_ERROR =
  "That is a private key (it has a \"d\" member). It was not stored or logged. Treat it as exposed: make a new key pair and paste only its public JWK.";

/**
 * Whether a paste holds, or looks like it holds, a private key: a JWK
 * member named "d" (parsed, or spelled out in text that does not parse), or
 * a PEM private key block. Generous on purpose: a false alarm costs a
 * re-paste, a miss sends the private half over the network.
 */
export function pasteHoldsPrivateKey(paste: string): boolean {
  if (/PRIVATE KEY/i.test(paste)) return true;
  if (/["']d["']\s*:/.test(paste)) return true;
  try {
    const value: unknown = JSON.parse(paste);
    return typeof value === "object" && value !== null && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "d");
  } catch {
    return false;
  }
}

/** Live: may sign now (confirmed) or after its first act (pending). */
export function isLiveSigningKey(key: Pick<SigningKeyRow, "state">): boolean {
  return key.state === "pending" || key.state === "confirmed";
}

/** The state as the list words it. */
export const SIGNING_KEY_STATE_LABEL: Readonly<Record<SigningKeyState, string>> = {
  pending: "pending",
  confirmed: "confirmed",
  expired: "expired",
  lapsed: "lapsed (never confirmed)",
  removed: "removed from this page",
  retired: "retired by its holder",
};

/** "1 confirmed, 1 pending, 2 ended", leaving out a state no key is in. */
export function signingKeyCountsLabel(keys: readonly Pick<SigningKeyRow, "state">[]): string {
  const confirmed = keys.filter((key) => key.state === "confirmed").length;
  const pending = keys.filter((key) => key.state === "pending").length;
  const ended = keys.length - confirmed - pending;
  const parts: string[] = [];
  if (confirmed > 0) parts.push(`${confirmed} confirmed`);
  if (pending > 0) parts.push(`${pending} pending`);
  if (ended > 0) parts.push(`${ended} ended`);
  return parts.length > 0 ? parts.join(", ") : "none";
}

/** Under the expiry select: a signing key is bound, not minted. */
export const SIGNING_KEY_PRESET_HINT =
  "Counted from when the key is bound, and never extended. To keep going after it ends, bind a new key.";
export const SIGNING_KEY_DATE_HINT = "Fixed at binding and never extended. To keep going after it ends, bind a new key.";
/** Shown when never is chosen. What a signing key can do is narrower than
 *  a usage key: it signs this agent's acts (check, mint, revoke). */
export const SIGNING_KEY_NEVER_WARNING =
  "This key can sign this agent's acts until you remove it or its holder retires it. If its private half leaks, whoever holds it can mint usage keys for this agent until then.";
