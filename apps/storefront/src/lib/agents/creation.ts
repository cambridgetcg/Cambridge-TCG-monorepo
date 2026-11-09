/**
 * Agent + key creation — the shared minting core.
 *
 * The active caller is `operator-actions.ts`: a signed-in human at
 * /account/agents. The earlier self-serve route no longer imports this module;
 * it returns 503 before body or database access.
 *
 * The active operator-managed door uses this discipline:
 *   - The raw token (`ctcg_agt_<22 base62>`) is returned exactly once.
 *   - The platform stores only `sha256(token)` in `agent_keys.key_hash`
 *     plus the first 12 chars as `key_prefix` for display.
 *   - There is no recovery path — lose it, mint a new one.
 *   - Agent + first key are inserted in one transaction so a half-created
 *     agent (row without key) cannot exist.
 *   - An optional per-operator cap is checked inside that same transaction,
 *     behind a lock on the operator's users row, so two concurrent creates
 *     cannot both pass it.
 *
 * Substrate honesty: handle uniqueness is the DB's UNIQUE constraint on
 * agents.public_handle; this module surfaces the conflict as a typed
 * outcome rather than swallowing it.
 */

import crypto from "crypto";
import { transaction } from "@/lib/db";
import { hashAgentToken } from "./auth";

export const TOKEN_PREFIX = "ctcg_agt_";
const TOKEN_RANDOM_LEN = 22; // base62 length
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Handle discipline for created agents (matches the DB CHECK). */
export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;

export function randomBase62(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += BASE62[bytes[i] % 62];
  return out;
}

export function mintRawToken(): { token: string; prefix: string; hash: string } {
  const random = randomBase62(TOKEN_RANDOM_LEN);
  const token = `${TOKEN_PREFIX}${random}`;
  const prefix = token.slice(0, 12);
  const hash = hashAgentToken(token);
  return { token, prefix, hash };
}

export interface CreateAgentWithKeyInput {
  operatedByUserId: string;
  publicHandle: string;
  displayName: string;
  modelTag: string;
  description?: string | null;
  keyName?: string;
  /** Column added by migration 0112. 'operator' (default) or 'self-serve'. */
  registeredVia?: "operator" | "self-serve";
  tier?: "free" | "standard" | "partner";
  /**
   * When set, refuse with `agent_cap_reached` if the operator already has
   * this many non-archived agents. Checked inside the creating transaction.
   */
  maxActiveAgentsForOperator?: number;
}

export type CreateAgentWithKeyOutcome =
  | {
      ok: true;
      agent_id: string;
      public_handle: string;
      key_id: string;
      token: string;
      key_prefix: string;
    }
  | { ok: false; code: "handle_taken" | "create_failed" | "agent_cap_reached"; error: string };

/**
 * Insert an agent + its first key in one transaction. Validation of
 * display name / model tag lengths is the caller's job; handle format is checked here since
 * the DB CHECK would reject it anyway and this error message is kinder.
 *
 * Callers resolve the session before calling: production's pool holds one
 * connection (packages/db/src/index.ts), so `auth()` or a root `query()`
 * awaited inside the callback below would wait on the connection the
 * transaction already holds. Only `tx` is used in there. Lock order is
 * users, then agents, then agent_keys, as elsewhere for agent writes.
 */
export async function createAgentWithKey(
  input: CreateAgentWithKeyInput,
): Promise<CreateAgentWithKeyOutcome> {
  const handle = input.publicHandle.trim().toLowerCase();
  if (!HANDLE_RE.test(handle)) {
    return {
      ok: false,
      code: "create_failed",
      error: "Handle must be 3–32 chars, lowercase, alphanumeric or dashes.",
    };
  }

  const { token, prefix, hash } = mintRawToken();

  const cap = input.maxActiveAgentsForOperator;

  try {
    const result = await transaction(async (tx) => {
      if (cap !== undefined) {
        // Serialises concurrent creates for this operator: the count below
        // runs after any earlier create has committed, so the cap cannot
        // race. NO KEY UPDATE still lets other rows reference the user.
        const owner = await tx(
          `SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE`,
          [input.operatedByUserId],
        );
        if (owner.rows.length === 0) return { kind: "no_operator" as const };
        const active = await tx(
          `SELECT count(*)::int AS n FROM agents
            WHERE operated_by_user_id = $1 AND status <> 'archived'`,
          [input.operatedByUserId],
        );
        if (Number(active.rows[0]?.n ?? 0) >= cap) return { kind: "cap_reached" as const };
      }

      const insert = await tx(
        `INSERT INTO agents
           (operated_by_user_id, public_handle, display_name, model_tag, description, registered_via)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          input.operatedByUserId,
          handle,
          input.displayName,
          input.modelTag,
          input.description ?? null,
          input.registeredVia ?? "operator",
        ],
      );
      const agentId = insert.rows[0].id as string;

      const key = await tx(
        `INSERT INTO agent_keys (agent_id, key_hash, key_prefix, name, rate_limit_tier)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [agentId, hash, prefix, input.keyName ?? "default", input.tier ?? "free"],
      );

      return { kind: "created" as const, agentId, keyId: key.rows[0].id as string };
    });

    if (result.kind === "cap_reached") {
      return {
        ok: false,
        code: "agent_cap_reached",
        error: `You already operate ${cap} active agents. Archive one first.`,
      };
    }
    if (result.kind === "no_operator") {
      return { ok: false, code: "create_failed", error: "Failed to create agent." };
    }

    return {
      ok: true,
      agent_id: result.agentId,
      public_handle: handle,
      key_id: result.keyId,
      token,
      key_prefix: prefix,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "create failed";
    if (message.includes("agents_public_handle_key") || message.includes("duplicate key")) {
      return { ok: false, code: "handle_taken", error: "That handle is already taken." };
    }
    console.error("[agents] createAgentWithKey failed:", err);
    return { ok: false, code: "create_failed", error: "Failed to create agent." };
  }
}
