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
 *
 * Each write runs in one transaction that locks the rows it checks before
 * it writes, so a cap or ownership check cannot race the write it guards.
 * Locks are taken in the order users, then agents, then agent_keys. The
 * session is resolved before the transaction opens: production's pool
 * holds one connection (packages/db/src/index.ts), so `auth()` or a root
 * `query()` inside a callback would wait on the connection the
 * transaction holds. Inside, only `tx` is used.
 *
 * Minting is narrower than revoking and archiving: a key can be minted
 * only for an active agent this account operates that was registered
 * through this page. The shared steward account also operates the legacy
 * self-serve agents, and must not reissue authority for them; revoking
 * and archiving stay open there because they only reduce authority.
 */

"use server";

import { auth } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { createAgentWithKey, mintRawToken, HANDLE_RE } from "./creation";
import { ARCHIVE_REVOCATION_REASON } from "./revocation-reasons";

export type OperatorActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireUser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in required." };
  return { ok: true, userId: session.user.id };
}

/** Agent and key ids are UUIDs; the same pattern as MEMBER_KEY_ID_RE in
 * lib/datafeed/member-keys.ts. Anything else is answered as not found
 * without a query (Postgres would otherwise reject the cast). */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

const MAX_ACTIVE_AGENTS = 10;
const MAX_LIVE_KEYS = 5;
const DESCRIPTION_MAX = 500; // the form's maxLength
const REVOKE_REASON_MAX = 200;

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
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > DESCRIPTION_MAX) {
    return { ok: false, error: `Description too long (max ${DESCRIPTION_MAX}).` };
  }

  // Shared minting core (lib/agents/creation.ts) — agent + first key in
  // one transaction. The paused self-serve route does not import or call
  // this core; this is the only active creation path. Soft cap: one
  // operator → 10 agents, checked inside that transaction.
  const outcome = await createAgentWithKey({
    operatedByUserId: user.userId,
    publicHandle: handle,
    displayName,
    modelTag,
    description: description || null,
    registeredVia: "operator",
    tier: "free",
    maxActiveAgentsForOperator: MAX_ACTIVE_AGENTS,
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
  if (!isId(input.agent_id)) return { ok: false, error: "Agent not found." };
  const name = (typeof input.name === "string" ? input.name.trim() : "") || "key";
  if (name.length > 80) return { ok: false, error: "Key name too long (max 80)." };
  const agentId = input.agent_id;

  const { token, prefix, hash } = mintRawToken();
  const outcome = await transaction(async (tx) => {
    // Ownership, status and door under a row lock, so a concurrent mint or
    // archive of this agent is ordered with this one: a mint after an
    // archive finds no active row, and an archive after a mint revokes
    // the new key with the rest.
    const agent = await tx(
      `SELECT id FROM agents
        WHERE id = $1 AND operated_by_user_id = $2
          AND status = 'active' AND registered_via = 'operator'
        FOR NO KEY UPDATE`,
      [agentId, user.userId],
    );
    if (agent.rows.length === 0) return { kind: "refused" as const };

    // Soft cap: 5 live keys per agent.
    const live = await tx(
      `SELECT count(*)::int AS n FROM agent_keys
        WHERE agent_id = $1 AND revoked_at IS NULL`,
      [agentId],
    );
    if (Number(live.rows[0]?.n ?? 0) >= MAX_LIVE_KEYS) return { kind: "cap_reached" as const };

    const insert = await tx(
      `INSERT INTO agent_keys (agent_id, key_hash, key_prefix, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [agentId, hash, prefix, name],
    );
    return { kind: "minted" as const, keyId: insert.rows[0].id as string };
  });

  if (outcome.kind === "refused") {
    return { ok: false, error: "Keys can be minted only for your active operator-managed agents." };
  }
  if (outcome.kind === "cap_reached") {
    return { ok: false, error: `This agent already has ${MAX_LIVE_KEYS} active keys. Revoke one first.` };
  }
  return {
    ok: true,
    data: { key_id: outcome.keyId, token, key_prefix: prefix },
  };
}

export interface RevokeKeyInput {
  key_id: string;
  reason?: string;
}

/** Trimmed and cut to 200 characters (whole code points). A confirmed
 * revocation is never refused for the length of its note. */
function revokeReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null;
  return Array.from(reason.trim()).slice(0, REVOKE_REASON_MAX).join("").trim() || null;
}

/**
 * Revoke one of this account's keys. Idempotent: a key that is already
 * revoked answers `already_revoked: true` and its first revocation (time
 * and reason) is left as it was.
 */
export async function revokeKey(
  input: RevokeKeyInput,
): Promise<OperatorActionResult<{ revoked: true; already_revoked: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!isId(input.key_id)) return { ok: false, error: "Key not found." };
  const keyId = input.key_id;
  const reason = revokeReason(input.reason);

  const outcome = await transaction(async (tx) => {
    const key = await tx(
      `SELECT k.id, k.revoked_at
         FROM agent_keys k
         JOIN agents a ON a.id = k.agent_id
        WHERE k.id = $1 AND a.operated_by_user_id = $2
        FOR NO KEY UPDATE OF k`,
      [keyId, user.userId],
    );
    if (key.rows.length === 0) return { kind: "not_found" as const };
    if (key.rows[0].revoked_at) return { kind: "already_revoked" as const };
    await tx(
      `UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = $2
        WHERE id = $1 AND revoked_at IS NULL`,
      [keyId, reason],
    );
    return { kind: "revoked" as const };
  });

  if (outcome.kind === "not_found") return { ok: false, error: "Key not found." };
  return {
    ok: true,
    data: { revoked: true, already_revoked: outcome.kind === "already_revoked" },
  };
}

export async function archiveAgent(input: { agent_id: string }): Promise<OperatorActionResult<{ archived: true }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!isId(input.agent_id)) return { ok: false, error: "Agent not found." };
  const agentId = input.agent_id;

  // Status and key revocation commit together: an archived agent never
  // keeps a live key, and a failed revocation leaves the agent unarchived.
  const archived = await transaction(async (tx) => {
    const r = await tx(
      `UPDATE agents
          SET status = 'archived', archived_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND operated_by_user_id = $2 AND status <> 'archived'
        RETURNING id`,
      [agentId, user.userId],
    );
    if (r.rows.length === 0) return false;
    await tx(
      `UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = $2
        WHERE agent_id = $1 AND revoked_at IS NULL`,
      [agentId, ARCHIVE_REVOCATION_REASON],
    );
    return true;
  });
  if (!archived) return { ok: false, error: "Agent not found or already archived." };

  return { ok: true, data: { archived: true } };
}
