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

export function keyRevocationLabel(reason: string | null): string {
  if (reason === HOLDER_REVOCATION_REASON) return "revoked by the key holder";
  if (reason === ARCHIVE_REVOCATION_REASON) return "revoked when the agent was archived";
  if (reason?.startsWith("admin")) return "revoked by Cambridge TCG staff";
  return "revoked from this page";
}
