/**
 * Who ended a key, as a category for the operator's key list.
 *
 * `agent_keys.revoked_reason` holds free text from several hands: the
 * operator's own note from this page, staff reasons (stored with an
 * "admin" prefix by app/admin/trust/agents/_actions.ts) and fixed
 * sentinels. The page maps it on the server and sends only the label, so
 * the raw text never reaches the browser. The mapping reads a prefix the
 * operator could also type; a self-written note can mislabel only the
 * operator's own view.
 */

import { expiresAtIso } from "@/lib/agents/key-expiry";
import {
  ARCHIVE_REVOCATION_REASON,
  HOLDER_REVOCATION_REASON,
  SIGNED_ACT_REVOCATION_REASON,
} from "@/lib/agents/revocation-reasons";
import type { KeyRow } from "./page";

export function keyRevocationLabel(reason: string | null): string {
  if (reason === HOLDER_REVOCATION_REASON) return "revoked by the key holder";
  // A signed key.revoke act from one of the agent's signing keys
  // (lib/agents/signed-acts.ts), not this page.
  if (reason === SIGNED_ACT_REVOCATION_REASON) return "revoked by a signed act";
  if (reason === ARCHIVE_REVOCATION_REASON) return "revoked when the agent was archived";
  if (reason?.startsWith("admin")) return "revoked by Cambridge TCG staff";
  return "revoked from this page";
}

/** A key row as page.tsx selects it, stored reason included. The driver
 *  returns a timestamptz as a Date. */
export interface StoredKeyRow extends Omit<KeyRow, "revoked_by" | "expires_at" | "minted_by_signed_act"> {
  revoked_reason: string | null;
  expires_at: string | Date | null;
}

/**
 * The key rows page.tsx hands to the client component. Each field is
 * named here, so the stored reason, and any column a later edit adds to
 * the query, stays on the server unless it is listed below.
 *
 * `signedMints` holds the ids of usage keys a signed key.mint act created
 * (agent_keys.minted_by_event, read only while signed acts are open); a
 * key not in it is not marked.
 */
export function toKeyRows(rows: readonly StoredKeyRow[], signedMints: ReadonlySet<string> = new Set()): KeyRow[] {
  return rows.map((row) => ({
    id: row.id,
    agent_id: row.agent_id,
    key_prefix: row.key_prefix,
    name: row.name,
    rate_limit_tier: row.rate_limit_tier,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_at ? keyRevocationLabel(row.revoked_reason) : null,
    // An ISO 8601 string, whatever the driver returned, so the client's
    // type is the value it gets.
    expires_at: expiresAtIso(row.expires_at),
    // Computed by the page's SQL; only an explicit true reads as expired.
    expired: row.expired === true,
    minted_by_signed_act: signedMints.has(row.id),
    created_at: row.created_at,
  }));
}
