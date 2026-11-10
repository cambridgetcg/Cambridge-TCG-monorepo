/**
 * The operator's side of agent-held signing keys: server actions for
 * /account/agents (docs/plans/agent-auth/held-keys.md, the first slice).
 * No UI here; the page and its paste form call these.
 *
 *   - bindSigningKey: bind a pasted public JWK to one of the signed-in
 *     account's active operator-managed agents. The key is pending until its
 *     first validly signed act (signed-acts.ts) confirms it; pasted again
 *     after its pending window lapsed, the lapsed row is deleted, as the
 *     sweep would delete it, and the key bound afresh; its expiry is
 *     stated as a wire value (key-expiry.ts, never included); an agent holds
 *     at most two live signing keys, so a replacement can precede removal.
 *   - removeSigningKey: end one of the account's signing keys, any agent
 *     status (it only reduces authority). Idempotent.
 *   - listSigningKeys: an agent's signing keys, and which usage keys a
 *     signed act minted (agent_keys.minted_by_event).
 *
 * The same discipline as mintKey in operator-actions.ts: the session is
 * resolved before the transaction opens (production's pool holds one
 * connection), only `tx` is used inside, and locks go agents, then
 * agent_signing_keys, the order the act path takes, so a removal and an act
 * on one key are ordered: an act after a removal finds the key ended. Every
 * write records an event (basis "operator") in agent_act_events.
 *
 * The paste is never stored, logged or echoed: a JWK with a private "d"
 * member is refused before anything else is read, and the operator is told
 * to make a new key. The binding never says whether a key is in use by
 * another agent; only the key's own holder learns that, at its first act.
 *
 * While AGENT_SIGNED_ACTS is off (signed-act-config.ts), every action here
 * answers before touching the database, and nothing reads or writes the
 * signed-act tables.
 */

"use server";

import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { MAX_LIVE_SIGNING_KEYS } from "./key-caps";
import {
  expiresAtIso,
  keyExpiresAtSql,
  keyExpiryBinds,
  parseKeyExpiry,
  KEY_EXPIRY_DATE_PASSED_ERROR,
} from "./key-expiry";
import { PENDING_SIGNING_KEY_DAYS, signedActsOpen } from "./signed-act-config";
import { checkBindingJwk } from "./signed-act-verify";

export type SigningKeyActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type SigningKeyState = "pending" | "confirmed" | "expired" | "lapsed" | "removed" | "retired";

export interface SigningKeyRow {
  id: string;
  /** The RFC 7638 thumbprint: the kid the agent's acts carry. */
  kid: string;
  state: SigningKeyState;
  created_at: string;
  /** ISO 8601, or null: no expiry. */
  not_after: string | null;
  confirmed_at: string | null;
  /** A pending key lapses at this instant unless an act confirms it. */
  pending_until: string | null;
  revoked_at: string | null;
}

export interface SignedMintRow {
  key_id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  /** The act's event and the signing key (kid) that signed it. */
  minted_by_event: string;
  minted_by_kid: string | null;
}

const CLOSED = "Agent-held signing keys are not open on this deployment.";
const AGENT_REFUSED = "Signing keys can be bound only to your active operator-managed agents.";
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

async function requireUser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in required." };
  return { ok: true, userId: session.user.id };
}

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Live: not revoked, not past not_after, and confirmed or still inside its
 *  pending window; by the database's clock. Pass the table's alias. */
function liveSigningKeySql(alias: string): string {
  return `(${alias}.revoked_at IS NULL
           AND (${alias}.not_after IS NULL OR ${alias}.not_after > NOW())
           AND (${alias}.confirmed_at IS NOT NULL OR ${alias}.created_at > NOW() - make_interval(days => ${PENDING_SIGNING_KEY_DAYS})))`;
}

export interface BindSigningKeyInput {
  agent_id: string;
  /** The pasted public JWK, as text. */
  public_jwk: string;
  /** The key's expiry as a wire value (parseKeyExpiry); required. */
  key_expiry?: string;
}

export async function bindSigningKey(input: BindSigningKeyInput): Promise<
  SigningKeyActionResult<{
    signing_key_id: string;
    kid: string;
    state: "pending";
    not_after: string | null;
    pending_until: string;
  }>
> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!signedActsOpen()) return { ok: false, error: CLOSED };
  // The paste first: a private key is refused before anything else is read.
  const jwk = checkBindingJwk(input?.public_jwk);
  if (!jwk.ok) return { ok: false, error: jwk.error };
  if (!isId(input.agent_id)) return { ok: false, error: AGENT_REFUSED };
  const expiry = parseKeyExpiry(input.key_expiry);
  if (!expiry.ok) return { ok: false, error: expiry.error };
  const agentId = input.agent_id;
  const binds = keyExpiryBinds(expiry.expiry);
  const eventId = randomUUID();

  const outcome = await transaction(async (tx) => {
    const agent = await tx(
      `SELECT id FROM agents
        WHERE id = $1 AND operated_by_user_id = $2
          AND status = 'active' AND registered_via = 'operator'
        FOR NO KEY UPDATE`,
      [agentId, user.userId],
    );
    if (agent.rows.length === 0) return { kind: "refused" as const };

    // Only this agent's own rows: the binding never looks at other agents'.
    // A pending key past its window is bound no longer (by the same NOW() as
    // the live count below), so it does not block a new binding.
    const own = await tx(
      `SELECT id, revoked_at, confirmed_at,
              (revoked_at IS NULL AND confirmed_at IS NULL
               AND created_at <= NOW() - make_interval(days => ${PENDING_SIGNING_KEY_DAYS})) AS lapsed
         FROM agent_signing_keys
        WHERE agent_id = $1 AND thumbprint = $2`,
      [agentId, jwk.thumbprint],
    );
    const lapsed = own.rows.filter((row) => row.lapsed === true).map((row) => String(row.id));
    if (own.rows.some((row) => !row.revoked_at && row.lapsed !== true)) return { kind: "already_bound" as const };
    // A confirmed thumbprint stays unique until the agent is erased, so a key
    // this agent confirmed and then ended could never be confirmed again.
    if (own.rows.some((row) => row.confirmed_at)) return { kind: "ended_here" as const };

    const live = await tx(
      `SELECT count(*)::int AS n FROM agent_signing_keys k WHERE k.agent_id = $1 AND ${liveSigningKeySql("k")}`,
      [agentId],
    );
    if (Number(live.rows[0]?.n ?? 0) >= MAX_LIVE_SIGNING_KEYS) return { kind: "cap_reached" as const };

    // A chosen date that has begun on the database's clock: asked first, by
    // the same NOW() as the insert, so nothing fails inside the transaction.
    const passed = await tx(`SELECT COALESCE((${keyExpiresAtSql(1, 2)}) <= NOW(), false) AS passed`, binds);
    if (passed.rows[0]?.passed === true) return { kind: "date_passed" as const };

    // The lapsed row goes, as the sweep would have taken it, so the new row
    // fits the one-unrevoked-row-per-key index; its bind event stays.
    if (lapsed.length > 0) {
      await tx(
        `DELETE FROM agent_signing_keys
          WHERE id = ANY($1::uuid[]) AND agent_id = $2 AND confirmed_at IS NULL AND revoked_at IS NULL`,
        [lapsed, agentId],
      );
    }
    await tx(
      `INSERT INTO agent_act_events (id, agent_id, basis, act, outcome, thumbprint, effect)
       VALUES ($1, $2, 'operator', 'signing_key.bind', 'applied', $3, $4::jsonb)`,
      [eventId, agentId, jwk.thumbprint, JSON.stringify({ bound_kid: jwk.thumbprint })],
    );
    const inserted = await tx(
      `INSERT INTO agent_signing_keys (agent_id, thumbprint, public_key, alg, not_after, bound_by_event)
       VALUES ($1, $2, $3, 'Ed25519', ${keyExpiresAtSql(4, 5)}, $6)
       RETURNING id, not_after, created_at + make_interval(days => ${PENDING_SIGNING_KEY_DAYS}) AS pending_until`,
      [agentId, jwk.thumbprint, Buffer.from(jwk.publicKey), ...binds, eventId],
    );
    const row = inserted.rows[0];
    return {
      kind: "bound" as const,
      id: String(row.id),
      notAfter: expiresAtIso(row.not_after),
      pendingUntil: iso(row.pending_until) ?? "",
    };
  });

  switch (outcome.kind) {
    case "refused":
      return { ok: false, error: AGENT_REFUSED };
    case "already_bound":
      return { ok: false, error: "This key is already bound to this agent." };
    case "ended_here":
      return { ok: false, error: "This key was bound to this agent before and has ended. Make a new key pair." };
    case "cap_reached":
      return {
        ok: false,
        error: `This agent already has ${MAX_LIVE_SIGNING_KEYS} live signing keys. Remove one first.`,
      };
    case "date_passed":
      return { ok: false, error: KEY_EXPIRY_DATE_PASSED_ERROR };
    case "bound":
      return {
        ok: true,
        data: {
          signing_key_id: outcome.id,
          kid: jwk.thumbprint,
          state: "pending",
          not_after: outcome.notAfter,
          pending_until: outcome.pendingUntil,
        },
      };
  }
}

export async function removeSigningKey(input: {
  signing_key_id: string;
}): Promise<SigningKeyActionResult<{ removed: true; already_removed: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!signedActsOpen()) return { ok: false, error: CLOSED };
  if (!isId(input?.signing_key_id)) return { ok: false, error: "Signing key not found." };
  const keyId = input.signing_key_id;
  const eventId = randomUUID();

  const outcome = await transaction(async (tx) => {
    // Which agent, then that agent's row lock, then the key's: the act
    // path's order. Any status: removing only reduces authority.
    const owner = await tx(
      `SELECT k.agent_id FROM agent_signing_keys k
         JOIN agents a ON a.id = k.agent_id
        WHERE k.id = $1 AND a.operated_by_user_id = $2`,
      [keyId, user.userId],
    );
    const agentId = owner.rows[0]?.agent_id as string | undefined;
    if (!agentId) return { kind: "not_found" as const };
    await tx(`SELECT id FROM agents WHERE id = $1 FOR NO KEY UPDATE`, [agentId]);
    const key = await tx(
      `SELECT id, thumbprint, revoked_at FROM agent_signing_keys WHERE id = $1 AND agent_id = $2 FOR NO KEY UPDATE`,
      [keyId, agentId],
    );
    const row = key.rows[0];
    if (!row) return { kind: "not_found" as const };
    if (row.revoked_at) return { kind: "already_removed" as const };
    await tx(
      `INSERT INTO agent_act_events (id, agent_id, basis, act, outcome, thumbprint, effect)
       VALUES ($1, $2, 'operator', 'signing_key.remove', 'applied', $3, $4::jsonb)`,
      [eventId, agentId, row.thumbprint, JSON.stringify({ removed_kid: row.thumbprint })],
    );
    await tx(
      `UPDATE agent_signing_keys
          SET revoked_at = NOW(), revoked_by_event = $2, revocation_kind = 'operator-removed'
        WHERE id = $1 AND revoked_at IS NULL`,
      [keyId, eventId],
    );
    return { kind: "removed" as const };
  });

  if (outcome.kind === "not_found") return { ok: false, error: "Signing key not found." };
  return { ok: true, data: { removed: true, already_removed: outcome.kind === "already_removed" } };
}

export async function listSigningKeys(input: { agent_id: string }): Promise<
  SigningKeyActionResult<
    | { open: false }
    | { open: true; signing_keys: SigningKeyRow[]; signed_mints: SignedMintRow[]; max_live_signing_keys: number }
  >
> {
  const user = await requireUser();
  if (!user.ok) return user;
  // Closed: nothing is read, and the page shows its form disabled.
  if (!signedActsOpen()) return { ok: true, data: { open: false } };
  if (!isId(input?.agent_id)) return { ok: false, error: "Agent not found." };
  const agentId = input.agent_id;

  return transaction(async (tx) => {
    const agent = await tx(`SELECT id FROM agents WHERE id = $1 AND operated_by_user_id = $2`, [agentId, user.userId]);
    if (agent.rows.length === 0) return { ok: false as const, error: "Agent not found." };
    const keys = await tx(
      `SELECT k.id, k.thumbprint, k.created_at, k.not_after, k.confirmed_at, k.revoked_at, k.revocation_kind,
              k.created_at + make_interval(days => ${PENDING_SIGNING_KEY_DAYS}) AS pending_until,
              (k.not_after IS NOT NULL AND k.not_after <= NOW()) AS expired,
              (k.confirmed_at IS NULL AND k.created_at <= NOW() - make_interval(days => ${PENDING_SIGNING_KEY_DAYS})) AS lapsed
         FROM agent_signing_keys k
        WHERE k.agent_id = $1
        ORDER BY k.created_at DESC, k.id`,
      [agentId],
    );
    const mints = await tx(
      `SELECT k.id, k.key_prefix, k.name, k.created_at, k.expires_at, k.revoked_at, k.minted_by_event, e.thumbprint AS minted_by_kid
         FROM agent_keys k
         JOIN agent_act_events e ON e.id = k.minted_by_event
        WHERE k.agent_id = $1
        ORDER BY k.created_at DESC, k.id`,
      [agentId],
    );
    return {
      ok: true as const,
      data: {
        open: true as const,
        max_live_signing_keys: MAX_LIVE_SIGNING_KEYS,
        signing_keys: keys.rows.map((row): SigningKeyRow => {
          const state: SigningKeyState = row.revoked_at
            ? row.revocation_kind === "holder-retired"
              ? "retired"
              : "removed"
            : row.expired === true
              ? "expired"
              : row.confirmed_at
                ? "confirmed"
                : row.lapsed === true
                  ? "lapsed"
                  : "pending";
          return {
            id: String(row.id),
            kid: String(row.thumbprint),
            state,
            created_at: iso(row.created_at) ?? "",
            not_after: expiresAtIso(row.not_after),
            confirmed_at: iso(row.confirmed_at),
            pending_until: row.confirmed_at ? null : iso(row.pending_until),
            revoked_at: iso(row.revoked_at),
          };
        }),
        signed_mints: mints.rows.map((row): SignedMintRow => ({
          key_id: String(row.id),
          key_prefix: String(row.key_prefix),
          name: String(row.name),
          created_at: iso(row.created_at) ?? "",
          expires_at: expiresAtIso(row.expires_at),
          revoked_at: iso(row.revoked_at),
          minted_by_event: String(row.minted_by_event),
          minted_by_kid: row.minted_by_kid ? String(row.minted_by_kid) : null,
        })),
      },
    };
  });
}
