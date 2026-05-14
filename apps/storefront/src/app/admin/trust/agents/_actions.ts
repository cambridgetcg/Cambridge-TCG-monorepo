"use server";

/**
 * Agents — admin server actions.
 *
 *   suspendAgent     — flip status to 'suspended' with a reason. Keys
 *                      keep authenticating but matchmaking refuses.
 *   unsuspendAgent   — flip back to 'active'.
 *   archiveAgent     — permanent retirement. Revokes all keys.
 *   revokeKey        — single-key revocation by id.
 *
 * Every mutation runs through adminAction() so it auth-checks, logs to
 * admin_actions_log, and revalidates the listing page. The reason is
 * required for suspend (transparency Ring 1 — the operator can see the
 * suspension reason on their /account/agents page).
 */

import { adminAction, ActionInputError } from "@/lib/admin/actions";
import { sfQuery } from "@/lib/admin/db";

export interface AgentMutationInput {
  id: string;
  reason: string;
}

export async function suspendAgent(input: AgentMutationInput) {
  return adminAction({
    action: "agent.suspend",
    targetKind: "agent",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/admin/trust/agents",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason required to suspend an agent.");
      }
      const r = await sfQuery<{ id: string; public_handle: string }>(
        `UPDATE agents
            SET status = 'suspended',
                suspended_at = NOW(),
                suspended_reason = $2,
                updated_at = NOW()
          WHERE id = $1 AND status = 'active'
          RETURNING id::text, public_handle`,
        [input.id, input.reason.trim()],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError("Agent not found or not active.");
      }
      return { id: input.id, public_handle: r.rows[0].public_handle, action: "suspend" as const };
    },
  });
}

export async function unsuspendAgent(input: AgentMutationInput) {
  return adminAction({
    action: "agent.unsuspend",
    targetKind: "agent",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/admin/trust/agents",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason required to lift suspension.");
      }
      const r = await sfQuery<{ id: string; public_handle: string }>(
        `UPDATE agents
            SET status = 'active',
                suspended_at = NULL,
                suspended_reason = NULL,
                updated_at = NOW()
          WHERE id = $1 AND status = 'suspended'
          RETURNING id::text, public_handle`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError("Agent not found or not suspended.");
      }
      return { id: input.id, public_handle: r.rows[0].public_handle, action: "unsuspend" as const };
    },
  });
}

export async function adminArchiveAgent(input: AgentMutationInput) {
  return adminAction({
    action: "agent.archive",
    targetKind: "agent",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/admin/trust/agents",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason required to archive an agent.");
      }
      const r = await sfQuery<{ id: string }>(
        `UPDATE agents
            SET status = 'archived',
                archived_at = NOW(),
                updated_at = NOW()
          WHERE id = $1 AND status <> 'archived'
          RETURNING id::text`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError("Agent not found or already archived.");
      }
      // Revoke all live keys.
      await sfQuery(
        `UPDATE agent_keys
            SET revoked_at = NOW(),
                revoked_reason = $2
          WHERE agent_id = $1 AND revoked_at IS NULL`,
        [input.id, `admin archive: ${input.reason.trim()}`],
      );
      return { id: input.id, action: "archive" as const };
    },
  });
}

export async function adminRevokeKey(input: { key_id: string; reason: string }) {
  return adminAction({
    action: "agent_key.revoke",
    targetKind: "agent_key",
    targetId: input.key_id,
    reason: input.reason,
    revalidate: "/admin/trust/agents",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason required.");
      }
      const r = await sfQuery<{ id: string }>(
        `UPDATE agent_keys
            SET revoked_at = NOW(),
                revoked_reason = $2
          WHERE id = $1 AND revoked_at IS NULL
          RETURNING id::text`,
        [input.key_id, input.reason.trim()],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError("Key not found or already revoked.");
      }
      return { id: input.key_id, action: "revoke_key" as const };
    },
  });
}
