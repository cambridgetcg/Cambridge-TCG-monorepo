/**
 * Agent + key creation — the shared minting core.
 *
 * Two doors call this:
 *   - `operator-actions.ts` — session-cookie humans at /account/agents
 *     (the operator-managed path; higher tiers live here).
 *   - `/api/v1/agents/register` — the self-serve door for autonomous
 *     agents with no human email loop (free tier only, IP rate-limited).
 *
 * Both doors share one discipline, enforced here:
 *   - The raw token (`ctcg_agt_<22 base62>`) is returned exactly once.
 *   - The platform stores only `sha256(token)` in `agent_keys.key_hash`
 *     plus the first 12 chars as `key_prefix` for display.
 *   - There is no recovery path — lose it, mint a new one.
 *   - Agent + first key are inserted in one transaction so a half-created
 *     agent (row without key) cannot exist.
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

/** Handle discipline shared by both doors (matches the DB CHECK). */
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
  | { ok: false; code: "handle_taken" | "create_failed"; error: string };

/**
 * Insert an agent + its first key in one transaction. Validation of
 * display name / model tag lengths is the caller's job (the two doors
 * speak different error dialects); handle format is checked here since
 * the DB CHECK would reject it anyway and this error message is kinder.
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

  try {
    const result = await transaction(async (tx) => {
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

      return { agentId, keyId: key.rows[0].id as string };
    });

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
