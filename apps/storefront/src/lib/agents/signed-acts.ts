/**
 * Signed agent acts: one compact JWS per binding act, verified and applied
 * at most once (docs/plans/agent-auth/held-keys.md, "How the store
 * verifies", "Refusals", the first slice). Both doors call submitAgentAct:
 * the MCP tool agent.act (a carve-out before the bearer gate in
 * app/api/mcp/route.ts) and POST /api/v1/agents/act. Neither reads
 * Authorization: a bearer key sent beside an act neither helps nor hurts it.
 *
 * The owner decided on 2026-11-10 to offer agent-held keys ("Yes offer the
 * keys"). Everything else here, the acts, numbers and wording included, is
 * an agent's proposal in that page or an agent's default where the page
 * left a number open (signed-act-config.ts).
 *
 * Order, as the page numbers it:
 *   1. The flag and the configured audience, else signed_acts_closed; with
 *      the flag off nothing below runs and no table is read.
 *   2. The statement's rules (signed-act-verify.ts), else act_malformed.
 *   3. Obviously stale by the app's clock, else act_stale.
 *   4. In-memory limits before any curve work, else act_limited.
 *   5. Look up (sub, kid) in any state, outside the transaction (production's
 *      pool holds one connection). An unknown key is verified against a
 *      fixed dummy key and shares act_unverified with a bad signature.
 *   6. The R rule and noble's strict verify. Then a per-key limit.
 *   7. One transaction, using only `tx`: lock the agent row (FOR NO KEY
 *      UPDATE, as mintKey does), then the signing key row.
 *   8. Re-check the key: revoked, past not_after, or pending past its window
 *      by the database's clock is signing_key_ended. This is the signing
 *      key's linearization point; the operator's removal takes the same
 *      locks. The clock is clock_timestamp(), read after both locks are
 *      held, so time spent waiting for them counts.
 *   9. The same instant: iat more than 60 s ahead, or now at or past exp,
 *      is act_stale.
 *  10. Insert the nonce, keyed on the thumbprint. A conflict is
 *      act_replayed, and a replay writes no event.
 *  11. Record a refusal from 8 or 9. Otherwise confirm a pending key (or
 *      refuse signing_key_in_use if its thumbprint is confirmed elsewhere,
 *      under a transaction-scoped advisory lock on the thumbprint so two
 *      agents cannot both confirm it), then apply the act inside a
 *      savepoint, rolling back to it on a refusal (status, cap, params).
 *      The nonce stays either way.
 *  12. Write the event, purge a few expired nonces, commit. A database
 *      failure rolls back the lot, consumes nothing and answers
 *      auth_unavailable.
 *
 * Refusals are detected without a failing statement (ON CONFLICT DO
 * NOTHING, checks before writes), because postgres.js rolls back a whole
 * transaction after any statement in it fails, even one the code caught.
 *
 * Nothing logs an act, a key, a parameter or a thrown error's message: a
 * failure logs its code only.
 */

import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { loggableErrorCode } from "./auth";
import { MAX_LIVE_AGENT_KEYS } from "./key-caps";
import {
  expiredAgentKeySql,
  expiresAtIso,
  keyExpiresAtSql,
  keyExpiryBinds,
  liveAgentKeySql,
  parseKeyExpiry,
  type KeyExpiry,
} from "./key-expiry";
import {
  authRefusal,
  authUnavailableRefusal,
  signedActLimitedRefusal,
  signedActRefusal,
  type AgentRefusal,
  type SignedActRefusalCode,
} from "./refusals";
import { SIGNED_ACT_REVOCATION_REASON } from "./revocation-reasons";
import {
  NONCE_PURGE_PER_ACT,
  NONCE_RETENTION_AFTER_EXP_SECONDS,
  PENDING_SIGNING_KEY_DAYS,
  signedActsConfig,
} from "./signed-act-config";
import { currentDisclosure, disclosureSha256, isCurrentDisclosureDigest } from "./signed-act-disclosures";
import { actLimiter, type ActLimiter, type LimitAnswer, type LimitScope } from "./signed-act-limits";
import {
  AGENT_ID_RE,
  DUMMY_VERIFICATION_KEY,
  EXIT_LABELLED_ACTS,
  isSignedActName,
  parseSignedAct,
  SIGNED_ACT_MAX_LIFETIME_SECONDS,
  SIGNED_ACT_SKEW_SECONDS,
  SIGNED_ACT_TYP,
  SIGNED_ACT_VERIFICATION,
  staleByAppClock,
  verifyActSignature,
  type ParsedSignedAct,
  type SignedActName,
} from "./signed-act-verify";

// ── Answers ──────────────────────────────────────────────────────────────

export type AgentActAnswer =
  | {
      ok: true;
      status: 200;
      /** One sentence saying what happened, for an MCP text result. */
      lead: string;
      body: Record<string, unknown>;
      /** A valid signature was checked (the daily count reads this as
       *  authenticated). Previews are not. */
      verified: boolean;
    }
  | {
      ok: false;
      status: number;
      message: string;
      refusal: AgentRefusal;
      verified: boolean;
      /** Retry-After, for act_limited. */
      retryAfterSeconds?: number;
    };

type RefusalCode = SignedActRefusalCode | "agent_suspended" | "agent_archived" | "auth_unavailable";

/** HTTP status per refusal, for both doors. */
export const SIGNED_ACT_STATUS: Readonly<Record<RefusalCode, number>> = {
  signed_acts_closed: 503,
  act_malformed: 400,
  act_stale: 400,
  act_limited: 429,
  act_unverified: 403,
  act_replayed: 409,
  signing_key_ended: 403,
  act_disclosure_stale: 409,
  act_params_invalid: 422,
  signing_key_in_use: 409,
  key_cap_reached: 409,
  agent_suspended: 403,
  agent_archived: 403,
  auth_unavailable: 503,
};

const MESSAGES: Readonly<Record<RefusalCode, string>> = {
  signed_acts_closed: "Signed acts are closed on this deployment. Nothing was read or changed.",
  act_malformed: "The act is malformed. Nothing was changed.",
  act_stale: "The act is outside its time window. Nothing was applied.",
  act_limited: "Too many acts from here just now. Nothing was applied.",
  act_unverified: "The act could not be verified. Nothing was changed.",
  act_replayed: "This act was already used. Nothing was changed.",
  signing_key_ended: "This signing key has ended. Nothing was applied.",
  act_disclosure_stale: "preview_sha256 is not a current disclosure. Nothing was applied.",
  act_params_invalid: "The act's params were refused. Nothing was applied.",
  signing_key_in_use: "This signing key is confirmed for another agent. Nothing was applied.",
  key_cap_reached: `This agent already has ${MAX_LIVE_AGENT_KEYS} live usage keys. Nothing was applied.`,
  agent_suspended: "The agent is suspended, which this act needs it not to be. Nothing was applied.",
  agent_archived: "The agent is archived, which this act needs it not to be. Nothing was applied.",
  auth_unavailable: "Signed acts are temporarily unavailable. Nothing was applied; repeating is safe.",
};

function refused(
  code: Exclude<RefusalCode, "act_limited" | "agent_suspended" | "agent_archived" | "auth_unavailable">,
  verified: boolean,
  extra: Parameters<typeof signedActRefusal>[1] = {},
): AgentActAnswer {
  const message = extra.detail ? `${MESSAGES[code]} (${extra.detail})` : MESSAGES[code];
  return { ok: false, status: SIGNED_ACT_STATUS[code], message, refusal: signedActRefusal(code, extra), verified };
}

/** act_limited's words, by which limit refused: only the per-address limit
 *  is about "here". */
const LIMITED_MESSAGES: Readonly<Record<LimitScope, string>> = {
  address: MESSAGES.act_limited,
  instance: "Too many acts reached this server just now, from all callers together. Nothing was applied.",
  key: "Too many acts signed by this key just now. Nothing was applied.",
};

function limited(limit: Extract<LimitAnswer, { allowed: false }>, verified: boolean): AgentActAnswer {
  return {
    ok: false,
    status: SIGNED_ACT_STATUS.act_limited,
    message: `${LIMITED_MESSAGES[limit.scope]} Retry in ${limit.retryAfterSeconds}s.`,
    refusal: signedActLimitedRefusal(limit.retryAfterSeconds),
    verified,
    retryAfterSeconds: limit.retryAfterSeconds,
  };
}

function unavailable(verified: boolean): AgentActAnswer {
  return {
    ok: false,
    status: SIGNED_ACT_STATUS.auth_unavailable,
    message: MESSAGES.auth_unavailable,
    refusal: authUnavailableRefusal(),
    verified,
  };
}

/** The answer while the path is closed, for a door that checks the switch
 *  before reading its body. */
export function signedActsClosedAnswer(): AgentActAnswer {
  return refused("signed_acts_closed", false);
}

// ── Previews ─────────────────────────────────────────────────────────────

const PARAMS_TEMPLATES: Readonly<Record<SignedActName, Record<string, string>>> = {
  "signer.check": {},
  "key.mint": {
    key_sha256: "<64 lower-case hex: SHA-256 of the key's UTF-8 text, made by you from a CSPRNG as ctcg_agt_ plus 22 base62 characters>",
    key_prefix: "<the key's first 12 characters: ctcg_agt_ plus 3>",
    expires: "<7d | 30d | 90d | 365d | never | YYYY-MM-DD, from tomorrow to 366 days ahead (UTC)>",
    name: "<a label of at most 80 characters, without control characters; empty means key>",
    preview_sha256: "<disclosure_sha256 from this preview>",
  },
  "key.revoke": {
    key_id: "<one of this agent's usage key ids> (send exactly one of key_id and kid)",
    kid: "<the signing key's own kid, to retire it>",
  },
};

const PREVIEW_FACTS: Readonly<Record<SignedActName, { effect: string; reversible: string; status_needed: string }>> = {
  "signer.check": {
    effect: "Returns the agent's own record. Confirms a pending signing key on its first validly signed act.",
    reversible: "Nothing to reverse: it changes no record but a pending key's confirmation.",
    status_needed: "any",
  },
  "key.mint": {
    effect: "Adds one usage key whose SHA-256 and prefix you sign. No secret is returned.",
    reversible: "The key can be revoked at any time by its holder (key.revoke or agent.revoke_key) or by the operator.",
    status_needed: "active",
  },
  "key.revoke": {
    effect: "Ends one usage key, or retires the signing key that signs the act.",
    reversible: "No: an ended key stays ended.",
    status_needed: "active or suspended for a usage key; any for retiring the signing key",
  },
};

function previewAnswer(name: SignedActName, audience: string, nowMs: number): AgentActAnswer {
  const disclosure = currentDisclosure(name);
  return {
    ok: true,
    status: 200,
    lead: `Preview of ${name}. Nothing was read or written.`,
    verified: false,
    body: {
      preview: name,
      writes: "nothing",
      effect: PREVIEW_FACTS[name].effect,
      reversible: PREVIEW_FACTS[name].reversible,
      agent_status_needed: PREVIEW_FACTS[name].status_needed,
      retention: "Each act is kept as an event until the agent is erased (not built yet, so indefinitely); see disclosure_text.",
      // The app's clock: a preview reads no database. Acts are judged by the
      // database's clock, which act_stale reports.
      server_time: new Date(nowMs).toISOString(),
      envelope: {
        typ: SIGNED_ACT_TYP,
        alg: "Ed25519 (EdDSA also accepted)",
        kid: "the RFC 7638 thumbprint of a key the operator bound to this agent",
        aud: audience,
        sub: "your agent id",
        max_lifetime_seconds: SIGNED_ACT_MAX_LIFETIME_SECONDS,
        clock_skew_seconds: SIGNED_ACT_SKEW_SECONDS,
        jti: "16 to 32 random bytes in base64url, never reused",
        preimage: "the JWS signing input as sent; no canonicalization",
      },
      act: name,
      params_template: { ...PARAMS_TEMPLATES[name] },
      disclosure_version: disclosure.version,
      disclosure_text: disclosure.text,
      disclosure_sha256: disclosureSha256(disclosure.text),
    },
  };
}

// ── Entry point ──────────────────────────────────────────────────────────

export interface AgentActContext {
  /** The client address the per-address limit keys on (actClientAddress). */
  clientAddress: string;
  env?: Readonly<Record<string, string | undefined>>;
  nowMs?: () => number;
  limiter?: ActLimiter;
}

const ARGUMENT_NAMES = new Set(["act", "preview"]);

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Run one act or preview. `args` is the tool's arguments or the REST body:
 * `{act: <JWS> | null, preview: <act name> | null}`, exactly one a string.
 */
export async function submitAgentAct(args: unknown, context: AgentActContext): Promise<AgentActAnswer> {
  const config = signedActsConfig(context.env ?? process.env);
  if (!config.open) return signedActsClosedAnswer();
  const nowMs = (context.nowMs ?? Date.now)();
  const limiter = context.limiter ?? actLimiter;

  if (!plainObject(args) || !Object.keys(args).every((name) => ARGUMENT_NAMES.has(name))) {
    return refused("act_malformed", false, { detail: "send an object with act or preview only" });
  }
  const act = args.act ?? null;
  const preview = args.preview ?? null;
  if ((act === null) === (preview === null) || (act !== null && typeof act !== "string") || (preview !== null && typeof preview !== "string")) {
    return refused("act_malformed", false, { detail: "send exactly one of act and preview, as a string" });
  }

  if (typeof preview === "string") {
    if (!isSignedActName(preview)) return refused("act_malformed", false, { detail: "preview must name signer.check, key.mint or key.revoke" });
    // No database or curve work: per address only, never an instance ceiling.
    const limit = limiter.preview(context.clientAddress);
    if (!limit.allowed) return limited(limit, false);
    return previewAnswer(preview, config.audience, nowMs);
  }

  // 2. The statement.
  const parsed = parseSignedAct(act, config.audience);
  if (!parsed.ok) return refused("act_malformed", false, { detail: parsed.detail });
  const signed = parsed.act;
  // 3. Obviously stale, by the app's clock.
  if (staleByAppClock(signed.payload, Math.floor(nowMs / 1000))) {
    return refused("act_stale", false, { server_time: new Date(nowMs).toISOString() });
  }
  // 4. Limits before any curve work.
  const exit = EXIT_LABELLED_ACTS.has(signed.payload.act);
  const before = limiter.beforeVerification(context.clientAddress, exit ? "exit" : "other");
  if (!before.allowed) return limited(before, false);

  // 5. (sub, kid) in any state, before the transaction.
  let key: { id: string; publicKey: Uint8Array } | null;
  try {
    key = await lookupSigningKey(signed.payload.sub, signed.header.kid);
  } catch (err) {
    console.error("[agent.act] key lookup failed", loggableErrorCode(err));
    return unavailable(false);
  }
  // 6. R rule and strict verify; an unknown key costs the same and answers the same.
  const valid = verifyActSignature(signed, key?.publicKey ?? DUMMY_VERIFICATION_KEY);
  if (!key || !valid) return refused("act_unverified", false);
  // Every act, exit acts included: an ended key's holder cannot write an
  // event per act without bound.
  const after = limiter.afterVerification(signed.header.kid);
  if (!after.allowed) return limited(after, true);

  // 7 to 12.
  try {
    return await transaction((tx) => applyVerifiedAct(tx, signed, key!.id, nowMs));
  } catch (err) {
    console.error("[agent.act] transaction failed", loggableErrorCode(err));
    return unavailable(true);
  }
}

async function lookupSigningKey(agentId: string, thumbprint: string): Promise<{ id: string; publicKey: Uint8Array } | null> {
  // sub matched AGENT_ID_RE in the parse, so the uuid cast cannot fail.
  if (!AGENT_ID_RE.test(agentId)) return null;
  const result = await query(
    `SELECT k.id, k.public_key, k.alg
       FROM agent_signing_keys k
       JOIN agents a ON a.id = k.agent_id
      WHERE k.agent_id = $1 AND k.thumbprint = $2 AND a.registered_via = 'operator'
      ORDER BY (k.revoked_at IS NULL) DESC, k.created_at DESC, k.id
      LIMIT 1`,
    [agentId, thumbprint],
  );
  const row = result.rows[0];
  if (!row || row.alg !== "Ed25519") return null;
  const bytes = new Uint8Array(row.public_key as Uint8Array);
  if (bytes.length !== 32) return null;
  return { id: String(row.id), publicKey: bytes };
}

// ── The transaction ──────────────────────────────────────────────────────

type Tx = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;

type ApplyResult =
  | { kind: "applied"; effect: Record<string, unknown>; body: Record<string, unknown>; lead: string }
  | {
      kind: "refused";
      code: Exclude<RefusalCode, "act_limited" | "auth_unavailable" | "signed_acts_closed">;
      detail?: string;
      suspendedAt?: string | null;
    };

interface AgentRow {
  id: string;
  public_handle: string;
  status: "active" | "suspended" | "archived";
  suspended_at: string | null;
}

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function agentStatus(value: unknown): AgentRow["status"] {
  return value === "active" || value === "suspended" ? value : "archived";
}

async function applyVerifiedAct(tx: Tx, signed: ParsedSignedAct, keyRowId: string, nowMs: number): Promise<AgentActAnswer> {
  const { payload, header } = signed;
  const eventId = randomUUID();

  // 7. The agent row, then the signing key row.
  const agentResult = await tx(
    `SELECT id, public_handle, status, suspended_at
       FROM agents
      WHERE id = $1 AND registered_via = 'operator'
      FOR NO KEY UPDATE`,
    [payload.sub],
  );
  const agentRaw = agentResult.rows[0];
  if (!agentRaw) return refused("act_unverified", false);
  const agent: AgentRow = {
    id: String(agentRaw.id),
    public_handle: String(agentRaw.public_handle),
    status: agentStatus(agentRaw.status),
    suspended_at: iso(agentRaw.suspended_at),
  };

  const keyResult = await tx(
    `SELECT id, thumbprint, confirmed_at, revoked_at, revoked_by_event, not_after, created_at
       FROM agent_signing_keys
      WHERE id = $1 AND agent_id = $2 AND thumbprint = $3
      FOR NO KEY UPDATE`,
    [keyRowId, agent.id, header.kid],
  );
  const keyRow = keyResult.rows[0];
  // Gone since the lookup (the agent was erased): as if never there.
  if (!keyRow) return refused("act_unverified", false);
  // The database's clock, read now that both locks are held: NOW() is the
  // transaction's start, taken before any wait for them. One instant for
  // the key's expiry, its pending window and the act's time window.
  const clockResult = await tx(
    `SELECT c.at AS db_now,
            EXTRACT(EPOCH FROM c.at)::float8 AS db_epoch,
            (k.not_after IS NOT NULL AND k.not_after <= c.at) AS expired,
            (k.confirmed_at IS NULL AND k.created_at <= c.at - make_interval(days => $2::int)) AS lapsed,
            k.created_at + make_interval(days => $2::int) AS lapses_at
       FROM agent_signing_keys k, (SELECT clock_timestamp() AS at) c
      WHERE k.id = $1`,
    [keyRowId, PENDING_SIGNING_KEY_DAYS],
  );
  const clock = clockResult.rows[0] ?? {};
  const serverTime = iso(clock.db_now) ?? new Date(nowMs).toISOString();
  const dbEpoch = Number(clock.db_epoch);

  // 8. The key, by the database's clock.
  let early: ApplyResult | null = null;
  let endedAt: string | null = null;
  let revokedByEvent: string | null = null;
  if (keyRow.revoked_at) {
    endedAt = iso(keyRow.revoked_at);
    revokedByEvent = keyRow.revoked_by_event ? String(keyRow.revoked_by_event) : null;
  } else if (clock.expired === true) {
    endedAt = iso(keyRow.not_after);
  } else if (clock.lapsed === true) {
    endedAt = iso(clock.lapses_at);
  }
  if (endedAt !== null) early = { kind: "refused", code: "signing_key_ended" };
  // 9. Time, by the database's clock.
  else if (payload.iat > dbEpoch + SIGNED_ACT_SKEW_SECONDS || dbEpoch >= payload.exp) {
    early = { kind: "refused", code: "act_stale" };
  }

  // 10. The nonce, keyed on the thumbprint. Kept until exp plus 60 s.
  const nonce = await tx(
    `INSERT INTO agent_act_nonces (thumbprint, jti, expires_at)
     VALUES ($1, $2, to_timestamp($3::bigint) + make_interval(secs => $4::int))
     ON CONFLICT (thumbprint, jti) DO NOTHING
     RETURNING jti`,
    [header.kid, payload.jti, payload.exp, NONCE_RETENTION_AFTER_EXP_SECONDS],
  );
  if (nonce.rows.length === 0) {
    await purgeNonces(tx);
    return refused("act_replayed", true);
  }

  // 11. A refusal from 8 or 9, or confirm and apply.
  let result: ApplyResult;
  const effect: Record<string, unknown> = {};
  if (early) {
    result = early;
  } else {
    let inUse = false;
    if (!keyRow.confirmed_at) {
      // Serialize confirmations of one thumbprint across agents, so the
      // check below and the update cannot race another agent's.
      await tx(`SELECT pg_advisory_xact_lock(hashtextextended('agent_signing_keys.thumbprint:' || $1, 0))`, [header.kid]);
      const elsewhere = await tx(
        `SELECT 1 FROM agent_signing_keys WHERE thumbprint = $1 AND confirmed_at IS NOT NULL AND id <> $2 LIMIT 1`,
        [header.kid, keyRowId],
      );
      if (elsewhere.rows.length > 0) {
        inUse = true;
      } else {
        await tx(`UPDATE agent_signing_keys SET confirmed_at = NOW() WHERE id = $1 AND confirmed_at IS NULL`, [keyRowId]);
        effect.signing_key_confirmed = header.kid;
      }
    }
    if (inUse) {
      result = { kind: "refused", code: "signing_key_in_use" };
    } else {
      await tx("SAVEPOINT agent_act_apply");
      result = await applyAct(tx, signed, agent, keyRowId, eventId, nowMs);
      await tx(result.kind === "applied" ? "RELEASE SAVEPOINT agent_act_apply" : "ROLLBACK TO SAVEPOINT agent_act_apply");
      if (result.kind === "applied") Object.assign(effect, result.effect);
    }
  }

  // 12. The event, a few expired nonces, commit (by returning).
  await tx(
    `INSERT INTO agent_act_events
       (id, agent_id, basis, act, outcome, refusal, act_jws, act_sha256, verification, thumbprint, effect)
     VALUES ($1, $2, 'signed-act', $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb)`,
    [
      eventId,
      agent.id,
      payload.act,
      result.kind === "applied" ? "applied" : "refused",
      result.kind === "applied" ? null : result.code,
      signed.jws,
      signed.sha256,
      JSON.stringify(SIGNED_ACT_VERIFICATION),
      header.kid,
      JSON.stringify(effect),
    ],
  );
  await purgeNonces(tx);

  const receipt = { event_id: eventId, act_sha256: signed.sha256 };
  if (result.kind === "applied") {
    return {
      ok: true,
      status: 200,
      lead: result.lead,
      verified: true,
      body: {
        act: payload.act,
        outcome: "applied",
        ...result.body,
        ...(effect.signing_key_confirmed ? { signing_key_confirmed: true } : {}),
        server_time: serverTime,
        receipt,
        verification: SIGNED_ACT_VERIFICATION,
      },
    };
  }
  if (result.code === "agent_suspended" || result.code === "agent_archived") {
    const refusal =
      result.code === "agent_suspended"
        ? authRefusal({ ok: false, status: 403, reason_code: "agent_suspended", error: "", suspended_at: result.suspendedAt ?? null })
        : authRefusal({ ok: false, status: 403, reason_code: "agent_archived", error: "" });
    return {
      ok: false,
      status: SIGNED_ACT_STATUS[result.code],
      message: MESSAGES[result.code],
      refusal: { ...refusal, receipt },
      verified: true,
    };
  }
  return refused(result.code, true, {
    receipt,
    ...(result.detail ? { detail: result.detail } : {}),
    ...(result.code === "act_stale" ? { server_time: serverTime } : {}),
    ...(result.code === "signing_key_ended" ? { ended_at: endedAt ?? undefined, revoked_by_event: revokedByEvent } : {}),
  });
}

async function purgeNonces(tx: Tx): Promise<void> {
  await tx(
    `DELETE FROM agent_act_nonces n
      USING (SELECT thumbprint, jti FROM agent_act_nonces
              WHERE expires_at < NOW()
              ORDER BY expires_at
              LIMIT $1
              FOR UPDATE SKIP LOCKED) old
      WHERE n.thumbprint = old.thumbprint AND n.jti = old.jti`,
    [NONCE_PURGE_PER_ACT],
  );
}

// ── The three acts ───────────────────────────────────────────────────────

const KEY_SHA256_RE = /^[0-9a-f]{64}$/;
const KEY_PREFIX_RE = /^ctcg_agt_[A-Za-z0-9]{3}$/;
const NAME_MAX = 80;
/** C0, DEL and C1. PostgreSQL text refuses NUL, which would fail a
 *  statement inside the act; the rest have no place in a label. */
const CONTROL_CHARACTER_RE = /\p{Cc}/u;

async function applyAct(
  tx: Tx,
  signed: ParsedSignedAct,
  agent: AgentRow,
  keyRowId: string,
  eventId: string,
  nowMs: number,
): Promise<ApplyResult> {
  const { params } = signed.payload;
  switch (signed.payload.act) {
    case "signer.check":
      return {
        kind: "applied",
        effect: {},
        lead: "Checked. This is the agent's own record; nothing else changed.",
        body: await agentRecord(tx, agent),
      };
    case "key.mint":
      return mint(tx, params, agent, eventId, nowMs);
    case "key.revoke":
      return "kid" in params
        ? retire(tx, params.kid, signed.header.kid, keyRowId, eventId)
        : revokeUsageKey(tx, params.key_id, agent);
  }
}

function statusRefusal(agent: AgentRow): ApplyResult {
  return agent.status === "suspended"
    ? { kind: "refused", code: "agent_suspended", suspendedAt: agent.suspended_at }
    : { kind: "refused", code: "agent_archived" };
}

async function mint(
  tx: Tx,
  params: Record<string, string>,
  agent: AgentRow,
  eventId: string,
  nowMs: number,
): Promise<ApplyResult> {
  if (agent.status !== "active") return statusRefusal(agent);
  if (!isCurrentDisclosureDigest("key.mint", params.preview_sha256)) return { kind: "refused", code: "act_disclosure_stale" };
  const expiry = parseKeyExpiry(params.expires, new Date(nowMs));
  if (!expiry.ok) return { kind: "refused", code: "act_params_invalid", detail: "expires" };
  if (!KEY_PREFIX_RE.test(params.key_prefix)) return { kind: "refused", code: "act_params_invalid", detail: "key_prefix" };
  // One phrase for a malformed hash and one already in agent_keys: the
  // signer built the hash, so this hides nothing from it.
  const HASH = "key_sha256 malformed or in use";
  if (!KEY_SHA256_RE.test(params.key_sha256)) return { kind: "refused", code: "act_params_invalid", detail: HASH };
  // Checked before any statement, so a refusal never rests on a failed one.
  if (CONTROL_CHARACTER_RE.test(params.name)) return { kind: "refused", code: "act_params_invalid", detail: "name" };
  const name = Array.from(params.name.trim());
  if (name.length > NAME_MAX) return { kind: "refused", code: "act_params_invalid", detail: "name" };

  const live = await tx(`SELECT count(*)::int AS n FROM agent_keys WHERE agent_id = $1 AND ${liveAgentKeySql("")}`, [agent.id]);
  if (Number(live.rows[0]?.n ?? 0) >= MAX_LIVE_AGENT_KEYS) return { kind: "refused", code: "key_cap_reached" };

  // A chosen date that has begun on the database's clock would fail the
  // table's CHECK; asked first, by the same NOW(), so nothing fails.
  const binds = keyExpiryBinds(expiry.expiry as KeyExpiry);
  const passed = await tx(`SELECT COALESCE((${keyExpiresAtSql(1, 2)}) <= NOW(), false) AS passed`, binds);
  if (passed.rows[0]?.passed === true) return { kind: "refused", code: "act_params_invalid", detail: "expires" };

  const inserted = await tx(
    `INSERT INTO agent_keys (agent_id, key_hash, key_prefix, name, expires_at, minted_by_event)
     VALUES ($1, $2, $3, $4, ${keyExpiresAtSql(5, 6)}, $7)
     ON CONFLICT (key_hash) DO NOTHING
     RETURNING id, key_prefix, name, expires_at`,
    [agent.id, params.key_sha256, params.key_prefix, name.join("") || "key", ...binds, eventId],
  );
  const row = inserted.rows[0];
  if (!row) return { kind: "refused", code: "act_params_invalid", detail: HASH };
  const key = {
    key_id: String(row.id),
    key_prefix: String(row.key_prefix),
    name: String(row.name),
    expires_at: expiresAtIso(row.expires_at),
    minted_by_event: eventId,
  };
  return {
    kind: "applied",
    effect: { minted_key_id: key.key_id, key_prefix: key.key_prefix, expires_at: key.expires_at },
    lead: `Minted. The usage key with prefix ${key.key_prefix} now authenticates; no secret is in this answer.`,
    body: { key },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function revokeUsageKey(tx: Tx, keyId: string, agent: AgentRow): Promise<ApplyResult> {
  if (agent.status === "archived") return statusRefusal(agent);
  const NOT_FOUND = "key_id names no usage key of this agent";
  if (!UUID_RE.test(keyId)) return { kind: "refused", code: "act_params_invalid", detail: NOT_FOUND };
  // agents, then agent_keys: the order mintKey and archive take.
  const found = await tx(
    `SELECT id, key_prefix, revoked_at FROM agent_keys WHERE id = $1 AND agent_id = $2 FOR NO KEY UPDATE`,
    [keyId, agent.id],
  );
  const row = found.rows[0];
  if (!row) return { kind: "refused", code: "act_params_invalid", detail: NOT_FOUND };
  if (row.revoked_at) {
    return {
      kind: "applied",
      effect: { revoked_key_id: String(row.id), already_revoked: true },
      lead: "Already revoked. Nothing changed.",
      body: { revoked: { key_id: String(row.id), key_prefix: String(row.key_prefix), already_revoked: true, revoked_at: iso(row.revoked_at) } },
    };
  }
  const updated = await tx(
    `UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = $2
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING revoked_at`,
    [keyId, SIGNED_ACT_REVOCATION_REASON],
  );
  const revokedAt = iso(updated.rows[0]?.revoked_at);
  return {
    kind: "applied",
    effect: { revoked_key_id: String(row.id), already_revoked: false },
    lead: `Revoked. The usage key with prefix ${String(row.key_prefix)} no longer authenticates.`,
    body: { revoked: { key_id: String(row.id), key_prefix: String(row.key_prefix), already_revoked: false, revoked_at: revokedAt } },
  };
}

async function retire(tx: Tx, kid: string, signingKid: string, keyRowId: string, eventId: string): Promise<ApplyResult> {
  if (kid !== signingKid) {
    return { kind: "refused", code: "act_params_invalid", detail: "kid: a signing key can retire only itself" };
  }
  const updated = await tx(
    `UPDATE agent_signing_keys
        SET revoked_at = NOW(), revoked_by_event = $2, revocation_kind = 'holder-retired'
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING revoked_at`,
    [keyRowId, eventId],
  );
  return {
    kind: "applied",
    effect: { retired_signing_key: kid },
    lead: "Retired. This signing key no longer acts; the usage keys it minted are unchanged.",
    body: { retired: { kid, revoked_at: iso(updated.rows[0]?.revoked_at), revocation_kind: "holder-retired" } },
  };
}

/** signer.check's answer: the agent's own record, read inside the act's
 *  transaction (so a confirmation this act made shows). */
async function agentRecord(tx: Tx, agent: AgentRow): Promise<Record<string, unknown>> {
  const signing = await tx(
    `SELECT k.thumbprint, k.not_after, k.confirmed_at, k.revoked_at, k.revocation_kind, k.created_at, e.basis AS bound_basis,
            (k.not_after IS NOT NULL AND k.not_after <= NOW()) AS expired,
            (k.confirmed_at IS NULL AND k.created_at <= NOW() - make_interval(days => $2::int)) AS lapsed
       FROM agent_signing_keys k
       LEFT JOIN agent_act_events e ON e.id = k.bound_by_event
      WHERE k.agent_id = $1
      ORDER BY k.created_at, k.id`,
    [agent.id, PENDING_SIGNING_KEY_DAYS],
  );
  const usage = await tx(
    `SELECT id, key_prefix, name, expires_at, created_at, minted_by_event, ${expiredAgentKeySql("")} AS expired
       FROM agent_keys
      WHERE agent_id = $1 AND revoked_at IS NULL
      ORDER BY created_at, id`,
    [agent.id],
  );
  return {
    agent: { id: agent.id, public_handle: agent.public_handle, status: agent.status },
    signing_keys: signing.rows.map((row) => ({
      kid: String(row.thumbprint),
      state: row.revoked_at
        ? "revoked"
        : row.expired === true
          ? "expired"
          : row.confirmed_at
            ? "confirmed"
            : row.lapsed === true
              ? "lapsed"
              : "pending",
      bound_by: row.bound_basis === "operator" ? "operator" : String(row.bound_basis ?? "unknown"),
      bound_at: iso(row.created_at),
      not_after: iso(row.not_after),
      confirmed_at: iso(row.confirmed_at),
      revoked_at: iso(row.revoked_at),
      revocation_kind: row.revocation_kind ?? null,
    })),
    usage_keys: usage.rows.map((row) => ({
      key_id: String(row.id),
      key_prefix: String(row.key_prefix),
      name: String(row.name),
      created_at: iso(row.created_at),
      expires_at: expiresAtIso(row.expires_at),
      state: row.expired === true ? "expired" : "live",
      minted_by: row.minted_by_event ? "signed-act" : "operator",
      minted_by_event: row.minted_by_event ? String(row.minted_by_event) : null,
    })),
  };
}
