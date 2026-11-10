/**
 * What each signed act's preview discloses, every version kept.
 *
 * A preview ({"preview": "<act>"}) returns the current text and its SHA-256,
 * the same for everyone. key.mint signs that digest as preview_sha256, so
 * the stored act records exactly what was disclosed (held-keys.md
 * "Previews"). That is still not consent. Never edit a text in place: add a
 * new version, mark the old one not current, and keep it here, so every
 * digest an agent ever signed can be read back. The wording is an agent's,
 * not the owner's.
 */

import { createHash } from "node:crypto";
import type { SignedActName } from "./signed-act-verify";

export interface SignedActDisclosure {
  act: SignedActName;
  version: string;
  /** Accepted as preview_sha256 now. */
  current: boolean;
  text: string;
}

const RETENTION =
  "Cambridge TCG keeps the signed act exactly as sent, its SHA-256, how it was verified and what it did, as an event for this agent, its operator and support, until the agent is erased. Erasure is not built yet, so until it is they are kept indefinitely; a receipt (event id, act, outcome, SHA-256, date) outlasts erasure. The privacy notice at https://cambridgetcg.com/privacy does not yet describe these records.";

const SIGNATURE =
  "A signature proves control of the signing key over these bytes. It is not identity, not consent, and no authority to act for anyone else.";

export const SIGNED_ACT_DISCLOSURES: readonly SignedActDisclosure[] = [
  {
    act: "signer.check",
    version: "signer.check/2026-11-10.1",
    current: true,
    text:
      "signer.check returns this agent's own record: its status, its signing keys and its unrevoked usage keys. It changes nothing, except that a signing key's first validly signed act confirms it. " +
      "Whoever submits a copy of this act first, within its lifetime, sees that record. " +
      `${RETENTION} ${SIGNATURE}`,
  },
  {
    act: "key.mint",
    version: "key.mint/2026-11-10.1",
    current: true,
    text:
      "key.mint adds one usage key (ctcg_agt_ plus 22 base62 characters) to this agent. You make the key and sign only its SHA-256 and its 12-character prefix; Cambridge TCG never receives the key, cannot check how it was made, and returns no secret. " +
      "The key authenticates at https://cambridgetcg.com/api/mcp with the authority any key of an operator-managed agent has (reads, and Coverage Hunt evidence that stops at human review). It counts toward the agent's five live usage keys and works until the expiry you state (never is allowed), until you (key.revoke) or the operator revoke it, and not while the agent is suspended or archived. " +
      "Only an active agent can mint. A refused mint still uses up the act; discard a key whose mint was refused. " +
      `${RETENTION} ${SIGNATURE} Signing this disclosure's digest records what was shown; it is not consent.`,
  },
  {
    act: "key.revoke",
    version: "key.revoke/2026-11-10.1",
    current: true,
    text:
      'key.revoke ends one of this agent\'s usage keys ({"key_id": ...}), or retires the signing key that signs it ({"kid": ...} naming itself). Either only reduces authority, at once, and cannot be undone; a usage key already revoked answers as applied. ' +
      "Retiring a signing key does not end the usage keys it minted. A suspended agent can do both; an archived agent can only retire its signing key. " +
      `${RETENTION} ${SIGNATURE}`,
  },
];

export function disclosureSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The act's current disclosure (one per act). */
export function currentDisclosure(act: SignedActName): SignedActDisclosure {
  const found = SIGNED_ACT_DISCLOSURES.find((entry) => entry.act === act && entry.current);
  if (!found) throw new Error(`no current disclosure for ${act}`);
  return found;
}

/** Whether `digest` is the SHA-256 of a disclosure of `act` that is current. */
export function isCurrentDisclosureDigest(act: SignedActName, digest: string): boolean {
  return SIGNED_ACT_DISCLOSURES.some(
    (entry) => entry.act === act && entry.current && disclosureSha256(entry.text) === digest,
  );
}
