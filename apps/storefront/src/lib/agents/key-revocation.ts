/**
 * agent.revoke_key — the holder's own door out.
 *
 * Possession of a key is enough to end that key, and only that key. There
 * is no agent status check (a suspended or archived agent's holder can still
 * end it), no rate limit and no last_used_at stamp: ending authority is never
 * held behind a quota or a review. Without `confirm: true` the call is a
 * preview that writes nothing. Agents commonly call each listed tool with
 * `{}` to learn what it does, and an irreversible act must not happen by
 * exploration.
 *
 * Linearization point: the single UPDATE statement in REVOKE_SQL. After it
 * commits, the gate's lookup (`revoked_at IS NULL`) refuses the key. A
 * repeat, a string that was never a key, and the loser of two concurrent
 * calls all get the same not-active answer, which is also the true end
 * state, so this tool tells nobody which strings were ever keys.
 *
 * Answers never carry revoked_reason, who revoked a key, the agent's
 * handle or id, or anything about its operator. A preview or a performed
 * revocation of a live key says whether its agent is suspended or archived
 * (this_key_future_authority, replacement): the gate's 403 already tells any
 * holder of a live key that much, so this adds no oracle. The not-active
 * answer carries nothing about any agent.
 *
 * Designed against XENIA Covenant 0.1 candidate duty
 * exit.revocation-is-immediate (xenia d4727ec); Cambridge TCG has not adopted
 * the Covenant; no adoption record; unassessed.
 */

import { query } from "@/lib/db";
import { hashAgentToken, isAgentToken, loggableErrorCode } from "./auth";
import { HOLDER_REVOCATION_REASON } from "./revocation-reasons";
import {
  KEY_EXIT_COMPLETENESS,
  KEY_EXIT_CREDENTIAL_NOTE,
  KEY_EXIT_DOCS,
  KEY_EXIT_EVIDENCE_STATE,
  KEY_EXIT_INVENTORY_VERSION,
  KEY_EXIT_LINEARIZATION,
  KEY_EXIT_RECEIPT_NOTE,
  KEY_EXIT_RETAINED,
  KEY_EXIT_STATIC_STATES,
  KEY_EXIT_THIRD_PARTY_COPIES,
  KEY_EXIT_UNKNOWN_LAYERS,
  keyExitNextActions,
  keyReplacementText,
  type KeyAgentStatus,
} from "./key-exit-inventory";

type RegisteredVia = "operator" | "self-serve";

// a.status is read, never filtered on: it only chooses the replacement text
// and the preview's this_key_future_authority.
const PREVIEW_SQL = `SELECT k.key_prefix,
            a.registered_via,
            a.status,
            (SELECT count(*)::int
               FROM agent_keys k2
              WHERE k2.agent_id = k.agent_id
                AND k2.revoked_at IS NULL
                AND k2.id <> k.id) AS other_live_keys
       FROM agent_keys k
       JOIN agents a ON a.id = k.agent_id
      WHERE k.key_hash = $1
        AND k.revoked_at IS NULL`;

// The CTE's outer SELECT sees the snapshot from before the UPDATE, so the
// count excludes the key being revoked by id rather than by revoked_at.
const REVOKE_SQL = `WITH r AS (
       UPDATE agent_keys
          SET revoked_at = NOW(), revoked_reason = $2
        WHERE key_hash = $1 AND revoked_at IS NULL
        RETURNING id, agent_id, key_prefix, revoked_at
     )
     SELECT r.key_prefix, r.revoked_at, a.registered_via, a.status,
            (SELECT count(*)::int
               FROM agent_keys k2
              WHERE k2.agent_id = r.agent_id
                AND k2.revoked_at IS NULL
                AND k2.id <> r.id) AS other_live_keys
       FROM r JOIN agents a ON a.id = r.agent_id`;

type FutureAuthority = "ended" | "active" | "suspended_with_agent" | "archived_with_agent";

function keyExitFacts(input: {
  futureAuthority: FutureAuthority;
  otherLiveKeys: number;
  registeredVia: RegisteredVia;
  agentStatus: KeyAgentStatus;
}) {
  return {
    inventory_version: KEY_EXIT_INVENTORY_VERSION,
    evidence_state: KEY_EXIT_EVIDENCE_STATE,
    completeness: KEY_EXIT_COMPLETENESS,
    reversible: false as const,
    replacement: keyReplacementText(input.registeredVia, input.agentStatus),
    linearization: KEY_EXIT_LINEARIZATION,
    states: {
      this_key_future_authority: input.futureAuthority,
      other_keys: { live_count: input.otherLiveKeys, changed: false as const },
      ...KEY_EXIT_STATIC_STATES,
    },
    retained: KEY_EXIT_RETAINED.map((entry) => ({ ...entry, fields: [...entry.fields] })),
    unknown_layers: [...KEY_EXIT_UNKNOWN_LAYERS],
    third_party_copies: KEY_EXIT_THIRD_PARTY_COPIES,
    credential_note: KEY_EXIT_CREDENTIAL_NOTE,
    next_actions: keyExitNextActions(),
    docs: KEY_EXIT_DOCS,
  };
}

type KeyExitFacts = ReturnType<typeof keyExitFacts>;

export type KeyRevocationOutcome =
  | ({
      performed: true;
      revoked: true;
      key_state: "revoked";
      key_prefix: string;
      revoked_at: string;
      other_live_keys: number;
      receipt_reference: { key_prefix: string; revoked_at: string; note: string };
    } & KeyExitFacts)
  | ({
      performed: false;
      revoked: false;
      key_state: "active";
      key_prefix: string;
      other_live_keys: number;
      would_end: string;
      to_act: string;
    } & KeyExitFacts)
  | {
      performed: false;
      revoked: false;
      key_state: "not_active";
      message: string;
      docs: string;
    }
  | {
      performed: false | "unknown";
      key_state: "unknown";
      retryable: true;
      message: string;
      docs: string;
    };

function notActive(): KeyRevocationOutcome {
  return {
    performed: false,
    revoked: false,
    key_state: "not_active",
    message:
      "This string does not authenticate here (unknown, or already revoked). Nothing was changed. Repeating is safe.",
    docs: KEY_EXIT_DOCS,
  };
}

function iso(value: unknown): string {
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

function registeredVia(value: unknown): RegisteredVia {
  return value === "operator" ? "operator" : "self-serve";
}

/** agents_status_values (migration 0090) admits only these three. Anything
 *  else is read as archived, which offers no replacement and no authority. */
function agentStatus(value: unknown): KeyAgentStatus {
  return value === "active" || value === "suspended" ? value : "archived";
}

/** A live key's authority while its agent is in this status. */
function previewAuthority(status: KeyAgentStatus): FutureAuthority {
  if (status === "active") return "active";
  return status === "suspended" ? "suspended_with_agent" : "archived_with_agent";
}

/**
 * End the presented key, or preview doing so. `confirm` must be exactly
 * `true` to act; any other value, including "true" or 1, previews.
 */
export async function revokePresentedKey(
  token: string,
  options: { confirm?: unknown } = {},
): Promise<KeyRevocationOutcome> {
  const confirm = options.confirm === true;
  // The route parses the header first; this keeps a direct caller from
  // spending a lookup on a string that cannot be a key.
  if (!isAgentToken(token)) return notActive();
  const hash = hashAgentToken(token);

  try {
    if (!confirm) {
      const preview = await query(PREVIEW_SQL, [hash]);
      const row = preview.rows[0];
      if (!row) return notActive();
      const via = registeredVia(row.registered_via);
      const status = agentStatus(row.status);
      const otherLiveKeys = Number(row.other_live_keys ?? 0);
      return {
        performed: false,
        revoked: false,
        key_state: "active",
        key_prefix: String(row.key_prefix),
        other_live_keys: otherLiveKeys,
        would_end: "This key's future authority here. Nothing else changes.",
        to_act: "Call agent.revoke_key again with confirm: true.",
        ...keyExitFacts({
          futureAuthority: previewAuthority(status),
          otherLiveKeys,
          registeredVia: via,
          agentStatus: status,
        }),
      };
    }

    const revoked = await query(REVOKE_SQL, [hash, HOLDER_REVOCATION_REASON]);
    const row = revoked.rows[0];
    if (!row) return notActive();
    const via = registeredVia(row.registered_via);
    const status = agentStatus(row.status);
    const otherLiveKeys = Number(row.other_live_keys ?? 0);
    const keyPrefix = String(row.key_prefix);
    const revokedAt = iso(row.revoked_at);
    return {
      performed: true,
      revoked: true,
      key_state: "revoked",
      key_prefix: keyPrefix,
      revoked_at: revokedAt,
      other_live_keys: otherLiveKeys,
      receipt_reference: {
        key_prefix: keyPrefix,
        revoked_at: revokedAt,
        note: KEY_EXIT_RECEIPT_NOTE,
      },
      ...keyExitFacts({
        futureAuthority: "ended",
        otherLiveKeys,
        registeredVia: via,
        agentStatus: status,
      }),
    };
  } catch (err) {
    // The error's parameters include the key hash: log its code only.
    console.error("[agent.revoke_key]", loggableErrorCode(err));
    if (!confirm) {
      return {
        performed: false,
        key_state: "unknown",
        retryable: true,
        message: "Key state is unknown. Nothing was changed. Repeating is safe.",
        docs: KEY_EXIT_DOCS,
      };
    }
    return {
      performed: "unknown",
      key_state: "unknown",
      retryable: true,
      message: "Revocation state is unknown. Repeating is safe; it cannot revoke anything else.",
      docs: KEY_EXIT_DOCS,
    };
  }
}
