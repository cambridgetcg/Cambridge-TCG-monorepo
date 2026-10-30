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
 * Token format. Bearer tokens are minted by `lib/agents/creation.ts`
 * (today only through the operator door at /account/agents) with the form
 * `ctcg_agt_<22-char-base62-random>`; every minted key has had that shape.
 * The raw token is shown to the operator once and never stored; the
 * platform keeps only `sha256(token)` in `agent_keys.key_hash`. The prefix
 * (first 12 chars, e.g. `ctcg_agt_aB3`) is also stored so the operator
 * can identify keys in the admin/account UI without ever recovering the
 * full token.
 *
 * Possession of a key authorises calls; it is not proof of identity,
 * authorship or control of the agent profile.
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

/** Why the gate refused a credential. Unknown and revoked keys share one
 *  code (and one 401) so the gate never says which strings were ever keys. */
export type AgentAuthReasonCode =
  | "missing_credentials"
  | "malformed_credentials"
  | "unknown_or_revoked_key"
  | "agent_suspended"
  | "agent_archived";

export type AgentAuthFailure =
  | {
      ok: false;
      status: 401;
      reason_code: "missing_credentials" | "malformed_credentials" | "unknown_or_revoked_key";
      error: string;
    }
  | {
      ok: false;
      status: 403;
      reason_code: "agent_suspended";
      error: string;
      suspended_at: string | null;
    }
  | { ok: false; status: 403; reason_code: "agent_archived"; error: string };

export type ResolvedAgentAuth = { ok: true; actor: AgentActor } | AgentAuthFailure;

const AGENT_TOKEN_RE = /^ctcg_agt_[A-Za-z0-9]{22}$/;

export function hashAgentToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Exactly the minted shape: `ctcg_agt_` plus 22 base62 characters. */
export function isAgentToken(token: string): boolean {
  return AGENT_TOKEN_RE.test(token);
}

export type ParsedAgentBearer =
  | { kind: "missing" }
  | { kind: "malformed" }
  | { kind: "token"; token: string };

/**
 * Parse an Authorization header without touching the database. The scheme
 * is case-insensitive; the token must be exactly the minted shape, so a
 * member key, a truncated key or a long string never costs a lookup.
 * Shared by the gate and the agent.revoke_key carve-out.
 */
export function parseAgentBearer(header: string | null | undefined): ParsedAgentBearer {
  if (!header) return { kind: "missing" };
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match || !isAgentToken(match[1])) return { kind: "malformed" };
  return { kind: "token", token: match[1] };
}

/** A thrown value's code or name, for logs. Never its message or the query's
 *  parameters: a lookup error can carry the key hash. */
export function loggableErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const { code, name } = err as { code?: unknown; name?: unknown };
    if (typeof code === "string" && code) return code;
    if (typeof name === "string" && name) return name;
  }
  return "unknown";
}

/** The 401 for a header refused before any lookup. */
export function unparsedBearerFailure(kind: "missing" | "malformed"): AgentAuthFailure {
  return kind === "missing"
    ? {
        ok: false,
        status: 401,
        reason_code: "missing_credentials",
        error: "missing Authorization header",
      }
    : {
        ok: false,
        status: 401,
        reason_code: "malformed_credentials",
        error: "expected 'Authorization: Bearer ctcg_agt_<22 base62 characters>'",
      };
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Resolve an `Authorization: Bearer <token>` header to an AgentActor.
 *
 * Substrate-honesty notes:
 *   - The lookup joins agents to agent_keys so a revoked key or a
 *     suspended/archived agent both fail at this single boundary.
 *   - A database failure throws; the route answers it as a typed 503.
 *   - last_used_at is updated outside the resolve path (fire-and-forget
 *     after a successful tool call) to avoid blocking the gate on a
 *     write when the gate's job is read-side authentication.
 */
export async function resolveAgentBearer(authHeader: string | null): Promise<ResolvedAgentAuth> {
  const parsed = parseAgentBearer(authHeader);
  if (parsed.kind !== "token") return unparsedBearerFailure(parsed.kind);

  const hash = hashAgentToken(parsed.token);

  const result = await query(
    `SELECT k.id           AS key_id,
            k.rate_limit_tier,
            a.id           AS agent_id,
            a.public_handle,
            a.operated_by_user_id,
            a.registered_via,
            a.status       AS agent_status,
            a.suspended_at
       FROM agent_keys k
       JOIN agents a ON a.id = k.agent_id
      WHERE k.key_hash = $1
        AND k.revoked_at IS NULL`,
    [hash],
  );

  if (result.rows.length === 0) {
    return {
      ok: false,
      status: 401,
      reason_code: "unknown_or_revoked_key",
      error: "unknown or revoked key",
    };
  }

  const row = result.rows[0];
  if (row.agent_status === "suspended") {
    return {
      ok: false,
      status: 403,
      reason_code: "agent_suspended",
      error: "agent is suspended",
      suspended_at: iso(row.suspended_at),
    };
  }
  if (row.agent_status === "archived") {
    return {
      ok: false,
      status: 403,
      reason_code: "agent_archived",
      error: "agent is archived",
    };
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

/** Fire-and-forget last-used stamp. Safe to ignore failures. A stamp that
 *  arrives after the key's revocation committed changes nothing. */
export async function stampKeyUse(keyId: string): Promise<void> {
  try {
    await query(
      `UPDATE agent_keys SET last_used_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
      [keyId],
    );
  } catch {
    // Intentional: don't fail the request because we couldn't write a timestamp.
  }
}
