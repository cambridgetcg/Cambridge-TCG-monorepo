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
 * wording, not the owner's; the owner decided only that agent-held keys are
 * offered.
 */

import type { SigningKeyRow, SigningKeyState } from "@/lib/agents/signing-key-actions";
import { looksLikePrivateKey, PRIVATE_KEY_PASTE_ERROR } from "@/lib/agents/private-key-paste";

/** The form field that carries the paste. */
export const SIGNING_KEY_JWK_FIELD = "public_jwk";

/** What the operator is told when the paste looks like a private key: the
 *  server's words for the same refusal (BINDING_JWK_ERRORS["private key"]). */
export { PRIVATE_KEY_PASTE_ERROR };

/**
 * Whether a paste looks like a private key: a "d" member in any spelling,
 * or PEM private-key armour. The server's binding runs the same check
 * (private-key-paste.ts), so the browser refuses exactly what the server
 * would refuse as a private key, and refuses it before anything is sent.
 */
export function pasteHoldsPrivateKey(paste: string): boolean {
  return looksLikePrivateKey(paste);
}

/** A thumbprint's first eight characters, as the removal dialog and the
 *  usage keys a signed act minted name the signing key. */
export function signingKeyShortKid(kid: string): string {
  return `${kid.slice(0, 8)}…`;
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
