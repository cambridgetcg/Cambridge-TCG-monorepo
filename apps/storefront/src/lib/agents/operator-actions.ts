/**
 * Operator-facing agent management — server actions for /account/agents.
 *
 * These actions run on the storefront with a session-cookie-authenticated
 * user. They mutate the operator's *own* agents only; the auth assertion
 * is `session.user.id === agents.operated_by_user_id` for every write.
 *
 * Key generation discipline:
 *   - The raw token is shown to the operator exactly once, when it is
 *     minted (via the action's return value).
 *   - The platform stores only `sha256(token)` in `agent_keys.key_hash`
 *     and the first 12 characters as `key_prefix` for display.
 *   - There is no recovery path. If the operator loses the token, they
 *     mint a new one and revoke the old.
 *
 * Substrate honesty: handle uniqueness is checked at the DB layer via
 * the UNIQUE constraint on agents.public_handle. The action surfaces
 * the conflict cleanly rather than swallowing it.
 */

"use server";

import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { createAgentWithKey, mintRawToken, HANDLE_RE } from "./creation";

export type OperatorActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireUser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in required." };
  return { ok: true, userId: session.user.id };
}

export interface CreateAgentInput {
  public_handle: string;
  display_name: string;
  model_tag: string;
  description?: string;
}

export async function createAgent(
  input: CreateAgentInput,
): Promise<OperatorActionResult<{ agent_id: string; public_handle: string; token: string; key_prefix: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const handle = input.public_handle.trim().toLowerCase();
  if (!HANDLE_RE.test(handle)) {
    return { ok: false, error: "Handle must be 3–32 chars, lowercase, alphanumeric or dashes." };
  }
  const displayName = input.display_name.trim();
  if (!displayName) return { ok: false, error: "Display name required." };
  if (displayName.length > 80) return { ok: false, error: "Display name too long (max 80)." };
  const modelTag = input.model_tag.trim();
  if (!modelTag) return { ok: false, error: "Model tag required." };
  if (modelTag.length > 80) return { ok: false, error: "Model tag too long (max 80)." };

  // Soft cap: one operator → 10 agents. Prevents accidental fan-out.
  const countRow = await query(
    `SELECT count(*)::int AS n FROM agents
      WHERE operated_by_user_id = $1 AND status <> 'archived'`,
    [user.userId],
  );
  if ((countRow.rows[0]?.n as number) >= 10) {
    return { ok: false, error: "You already operate 10 active agents. Archive one first." };
  }

  // Shared minting core (lib/agents/creation.ts) — agent + first key in
  // one transaction. The paused self-serve route does not import or call
  // this core; this is the only active creation path.
  const outcome = await createAgentWithKey({
    operatedByUserId: user.userId,
    publicHandle: handle,
    displayName,
    modelTag,
    description: input.description ?? null,
    registeredVia: "operator",
    tier: "free",
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };

  return {
    ok: true,
    data: {
      agent_id: outcome.agent_id,
      public_handle: outcome.public_handle,
      token: outcome.token,
      key_prefix: outcome.key_prefix,
    },
  };
}

export interface MintKeyInput {
  agent_id: string;
  name: string;
}

export async function mintKey(
  input: MintKeyInput,
): Promise<OperatorActionResult<{ key_id: string; token: string; key_prefix: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const name = input.name.trim() || "key";
  if (name.length > 80) return { ok: false, error: "Key name too long (max 80)." };

  // Ownership check.
  const r = await query(
    `SELECT id FROM agents WHERE id = $1 AND operated_by_user_id = $2`,
    [input.agent_id, user.userId],
  );
  if (r.rows.length === 0) return { ok: false, error: "Agent not found." };

  // Soft cap: 5 active keys per agent.
  const activeKeys = await query(
    `SELECT count(*)::int AS n FROM agent_keys
      WHERE agent_id = $1 AND revoked_at IS NULL`,
    [input.agent_id],
  );
  if ((activeKeys.rows[0]?.n as number) >= 5) {
    return { ok: false, error: "This agent already has 5 active keys. Revoke one first." };
  }

  const { token, prefix, hash } = mintRawToken();
  const insert = await query(
    `INSERT INTO agent_keys (agent_id, key_hash, key_prefix, name)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.agent_id, hash, prefix, name],
  );
  return {
    ok: true,
    data: { key_id: insert.rows[0].id as string, token, key_prefix: prefix },
  };
}

export interface RevokeKeyInput {
  key_id: string;
  reason?: string;
}

export async function revokeKey(input: RevokeKeyInput): Promise<OperatorActionResult<{ revoked: true }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const r = await query(
    `UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = $3
       FROM agents
      WHERE agent_keys.id = $1
        AND agents.id = agent_keys.agent_id
        AND agents.operated_by_user_id = $2
        AND agent_keys.revoked_at IS NULL
      RETURNING agent_keys.id`,
    [input.key_id, user.userId, input.reason?.trim() || null],
  );
  if (r.rows.length === 0) return { ok: false, error: "Key not found or already revoked." };
  return { ok: true, data: { revoked: true } };
}

export async function archiveAgent(input: { agent_id: string }): Promise<OperatorActionResult<{ archived: true }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const r = await query(
    `UPDATE agents
        SET status = 'archived', archived_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND operated_by_user_id = $2 AND status <> 'archived'
      RETURNING id`,
    [input.agent_id, user.userId],
  );
  if (r.rows.length === 0) return { ok: false, error: "Agent not found or already archived." };

  // Revoke all live keys when archiving.
  await query(
    `UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = 'agent archived'
      WHERE agent_id = $1 AND revoked_at IS NULL`,
    [input.agent_id],
  );

  return { ok: true, data: { archived: true } };
}
