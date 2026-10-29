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

import {
  ARCHIVE_REVOCATION_REASON,
  HOLDER_REVOCATION_REASON,
} from "@/lib/agents/revocation-reasons";
import type { KeyRow } from "./page";

export function keyRevocationLabel(reason: string | null): string {
  if (reason === HOLDER_REVOCATION_REASON) return "revoked by the key holder";
  if (reason === ARCHIVE_REVOCATION_REASON) return "revoked when the agent was archived";
  if (reason?.startsWith("admin")) return "revoked by Cambridge TCG staff";
  return "revoked from this page";
}

/** A key row as page.tsx selects it, stored reason included. */
export interface StoredKeyRow extends Omit<KeyRow, "revoked_by"> {
  revoked_reason: string | null;
}

/**
 * The key rows page.tsx hands to the client component. Each field is
 * named here, so the stored reason, and any column a later edit adds to
 * the query, stays on the server unless it is listed below.
 */
export function toKeyRows(rows: readonly StoredKeyRow[]): KeyRow[] {
  return rows.map((row) => ({
    id: row.id,
    agent_id: row.agent_id,
    key_prefix: row.key_prefix,
    name: row.name,
    rate_limit_tier: row.rate_limit_tier,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_at ? keyRevocationLabel(row.revoked_reason) : null,
    created_at: row.created_at,
  }));
}
