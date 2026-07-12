/**
 * Agent auth — bearer-token resolution at the MCP gate.
 *
 * The MCP route at `apps/storefront/src/app/api/mcp/route.ts` is the
 * one place on the platform that accepts agent-key authentication. It
 * resolves a request to an `AgentActor` once, at the boundary, and every
 * downstream tool handler trusts the resolved value without re-checking.
 * (Defence-in-depth would mean every handler re-resolves; the lesson from
 * S6 is that the boundary does the work *once*, well, in a place every
 * reader can audit.)
 *
 * Token format. Bearer tokens are minted at agent-registration time
 * (next wave) with the form `ctcg_agt_<22-char-base62-random>`. The raw
 * token is shown to the operator once and never stored; the platform
 * keeps only `sha256(token)` in `agent_keys.key_hash`. The prefix
 * (first 12 chars, e.g. `ctcg_agt_aB3`) is also stored so the operator
 * can identify keys in the admin/account UI without ever recovering the
 * full token.
 *
 * See docs/connections/the-agent-surface.md (the "auth boundary" entry).
 */

import crypto from "crypto";
import { query } from "@/lib/db";

export interface AgentActor {
  kind: "agent";
  agentId: string;
  agentPublicHandle: string;
  operatorUserId: string;
  registeredVia: "operator" | "self-serve";
  keyId: string;
  rateLimitTier: "free" | "standard" | "partner";
}

export type ResolvedAgentAuth =
  | { ok: true; actor: AgentActor }
  | { ok: false; status: 401 | 403; error: string };

const TOKEN_PREFIX = "ctcg_agt_";

export function hashAgentToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isAgentTokenLike(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX) && token.length >= TOKEN_PREFIX.length + 16;
}

/**
 * Resolve an `Authorization: Bearer <token>` header to an AgentActor.
 *
 * Substrate-honesty notes:
 *   - The lookup joins agents to agent_keys so a revoked key or a
 *     suspended/archived agent both fail at this single boundary.
 *   - last_used_at is updated outside the resolve path (fire-and-forget
 *     after a successful tool call) to avoid blocking the gate on a
 *     write when the gate's job is read-side authentication.
 */
export async function resolveAgentBearer(authHeader: string | null): Promise<ResolvedAgentAuth> {
  if (!authHeader) return { ok: false, status: 401, error: "missing Authorization header" };

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: "expected 'Bearer <token>' authorization" };

  const token = match[1].trim();
  if (!isAgentTokenLike(token)) {
    return { ok: false, status: 401, error: "token is not a Cambridge TCG agent key" };
  }

  const hash = hashAgentToken(token);

  const result = await query(
    `SELECT k.id           AS key_id,
            k.rate_limit_tier,
            a.id           AS agent_id,
            a.public_handle,
            a.operated_by_user_id,
            a.registered_via,
            a.status       AS agent_status
       FROM agent_keys k
       JOIN agents a ON a.id = k.agent_id
      WHERE k.key_hash = $1
        AND k.revoked_at IS NULL`,
    [hash],
  );

  if (result.rows.length === 0) {
    return { ok: false, status: 401, error: "unknown or revoked key" };
  }

  const row = result.rows[0];
  if (row.agent_status === "suspended") {
    return { ok: false, status: 403, error: "agent is suspended" };
  }
  if (row.agent_status === "archived") {
    return { ok: false, status: 403, error: "agent is archived" };
  }

  return {
    ok: true,
    actor: {
      kind: "agent",
      agentId: row.agent_id,
      agentPublicHandle: row.public_handle,
      operatorUserId: row.operated_by_user_id,
      registeredVia: row.registered_via,
      keyId: row.key_id,
      rateLimitTier: row.rate_limit_tier,
    },
  };
}

/** Fire-and-forget last-used stamp. Safe to ignore failures. */
export async function stampKeyUse(keyId: string): Promise<void> {
  try {
    await query(`UPDATE agent_keys SET last_used_at = NOW() WHERE id = $1`, [keyId]);
  } catch {
    // Intentional: don't fail the request because we couldn't write a timestamp.
  }
}
