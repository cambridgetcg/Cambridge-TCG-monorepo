/**
 * Typed refusals at the MCP gate.
 *
 * Cambridge's own shape, informed by the informative error shape in the
 * XENIA README and designed against XENIA Covenant 0.1 candidate duty
 * legibility.refusals-are-typed (xenia d4727ec); Cambridge TCG has not
 * adopted the Covenant; no adoption record; unassessed. No XENIA name or
 * duty id goes on the wire.
 *
 * One invariant holds for every refusal: a terminal one offers no next
 * action, and a non-terminal one offers at least one, each marked optional.
 * Retrying a terminal no cannot help, so nothing suggests it.
 *
 * Carriers (see app/api/mcp/route.ts): JSON-RPC `error.data`, or for a
 * `tools/call` tool result with `isError: true`, `_meta` under
 * "cambridgetcg.com/refusal".
 */

import type { AgentAuthFailure } from "./auth";
import { KEY_EXPIRED_REPLACEMENT_CASE } from "./key-exit-inventory";

export const AGENT_DOCS_URL = "https://cambridgetcg.com/methodology/agents";
export const MCP_REFUSAL_META_KEY = "cambridgetcg.com/refusal";

/** Refusals of signed agent acts (agent.act, POST /api/v1/agents/act;
 *  docs/plans/agent-auth/held-keys.md "Refusals"). agent_suspended,
 *  agent_archived and auth_unavailable are shared with the gate. */
export type SignedActRefusalCode =
  | "signed_acts_closed"
  | "act_malformed"
  | "act_stale"
  | "act_limited"
  | "act_unverified"
  | "act_replayed"
  | "signing_key_ended"
  | "act_disclosure_stale"
  | "act_params_invalid"
  | "signing_key_in_use"
  | "key_cap_reached";

export type AgentRefusalCode =
  | AgentAuthFailure["reason_code"]
  | SignedActRefusalCode
  | "tool_not_permitted"
  | "rate_limited"
  | "auth_unavailable";

export interface RefusalNextAction {
  action: "read_docs" | "request_review" | "retry" | "sign_new_act" | "fetch_preview";
  href?: string;
  after_seconds?: number;
  /** What following the action can and cannot be expected to do. */
  text?: string;
  optional: true;
}

export interface RefusalExitPath {
  tool: "agent.revoke_key";
  note: string;
}

export interface AgentRefusal {
  reason_code: AgentRefusalCode;
  retryable: boolean;
  terminal: boolean;
  next_actions: RefusalNextAction[];
  docs: string;
  exit_paths?: RefusalExitPath[];
  suspended_at?: string | null;
  retry_after_seconds?: number;
  /** Signed acts: which rule an act broke, as a fixed phrase. */
  detail?: string;
  /** Signed acts: the clock the act was judged by (ISO 8601). */
  server_time?: string;
  /** signing_key_ended: when the key ended, and the event that revoked it
   *  (null when it expired or lapsed unconfirmed). */
  ended_at?: string;
  revoked_by_event?: string | null;
  /** Signed acts the store recorded: the event and the act's SHA-256. */
  receipt?: { event_id: string; act_sha256: string };
}

function revokeExit(): RefusalExitPath[] {
  return [{ tool: "agent.revoke_key", note: "ends this key; not a recovery" }];
}

export function authRefusal(failure: AgentAuthFailure): AgentRefusal {
  if (failure.reason_code === "agent_suspended") {
    return {
      reason_code: "agent_suspended",
      retryable: false,
      terminal: false,
      suspended_at: failure.suspended_at,
      next_actions: [
        {
          action: "request_review",
          href: "mailto:support@cambridgetcg.com?subject=Agent%20suspension%20review",
          text: "You may write to support@cambridgetcg.com. No review procedure is written down yet.",
          optional: true,
        },
      ],
      docs: AGENT_DOCS_URL,
      exit_paths: revokeExit(),
    };
  }
  if (failure.reason_code === "agent_archived") {
    // Archiving revokes an agent's keys, so this is normally unreachable;
    // the exit path stays listed in case a live key outlived the archive.
    return {
      reason_code: "agent_archived",
      retryable: false,
      terminal: true,
      next_actions: [],
      docs: AGENT_DOCS_URL,
      exit_paths: revokeExit(),
    };
  }
  if (failure.reason_code === "key_expired") {
    // Not terminal: whoever minted the key can mint another. It carries no
    // expiry time, prefix, registration kind or agent status.
    return {
      reason_code: "key_expired",
      retryable: false,
      terminal: false,
      next_actions: [
        {
          action: "read_docs",
          href: `${AGENT_DOCS_URL}#key-expiry`,
          // agent.revoke_key gives an expired key the same sentence.
          text: KEY_EXPIRED_REPLACEMENT_CASE.text,
          optional: true,
        },
      ],
      docs: AGENT_DOCS_URL,
    };
  }
  return {
    reason_code: failure.reason_code,
    retryable: false,
    terminal: false,
    next_actions: [{ action: "read_docs", href: AGENT_DOCS_URL, optional: true }],
    docs: AGENT_DOCS_URL,
  };
}

export function toolNotPermittedRefusal(): AgentRefusal {
  return {
    reason_code: "tool_not_permitted",
    retryable: false,
    terminal: true,
    next_actions: [],
    docs: AGENT_DOCS_URL,
  };
}

export function rateLimitedRefusal(retryAfterSeconds: number): AgentRefusal {
  return {
    reason_code: "rate_limited",
    retryable: true,
    terminal: false,
    retry_after_seconds: retryAfterSeconds,
    next_actions: [{ action: "retry", after_seconds: retryAfterSeconds, optional: true }],
    docs: AGENT_DOCS_URL,
  };
}

export function authUnavailableRefusal(): AgentRefusal {
  return {
    reason_code: "auth_unavailable",
    retryable: true,
    terminal: false,
    next_actions: [{ action: "retry", optional: true }],
    docs: AGENT_DOCS_URL,
  };
}

// ── Signed acts ──────────────────────────────────────────────────────────

export const SIGNED_ACTS_DOCS_URL = `${AGENT_DOCS_URL}#signed-acts`;

/** What each signed-act refusal offers next. None is terminal: each has at
 *  least one optional action. */
const SIGNED_ACT_NEXT: Record<Exclude<SignedActRefusalCode, "act_limited">, RefusalNextAction> = {
  signed_acts_closed: {
    action: "read_docs",
    href: SIGNED_ACTS_DOCS_URL,
    text: "Signed acts are not open on this deployment. Bearer keys work as before.",
    optional: true,
  },
  act_malformed: { action: "read_docs", href: SIGNED_ACTS_DOCS_URL, optional: true },
  act_stale: {
    action: "sign_new_act",
    text: "Sign a new act whose iat is the current time (server_time is this server's clock) and whose exp is at most 300 seconds later.",
    optional: true,
  },
  act_unverified: { action: "read_docs", href: SIGNED_ACTS_DOCS_URL, optional: true },
  act_replayed: {
    action: "sign_new_act",
    text: "Each act is used once, applied or refused. Sign a new act with a new jti.",
    optional: true,
  },
  signing_key_ended: {
    action: "read_docs",
    href: SIGNED_ACTS_DOCS_URL,
    text: "This signing key no longer acts. Ask the agent's operator to bind a new one at https://cambridgetcg.com/account/agents.",
    optional: true,
  },
  act_disclosure_stale: {
    action: "fetch_preview",
    text: "Fetch this act's preview, read its disclosure_text, and sign its current disclosure_sha256 as preview_sha256.",
    optional: true,
  },
  act_params_invalid: { action: "read_docs", href: SIGNED_ACTS_DOCS_URL, optional: true },
  signing_key_in_use: {
    action: "read_docs",
    href: SIGNED_ACTS_DOCS_URL,
    text: "Ask the agent's operator to bind a key made for this agent alone.",
    optional: true,
  },
  key_cap_reached: {
    action: "read_docs",
    href: SIGNED_ACTS_DOCS_URL,
    text: "Revoke one of this agent's usage keys first (key.revoke, or the operator at https://cambridgetcg.com/account/agents).",
    optional: true,
  },
};

export type SignedActRefusalExtra = Pick<
  AgentRefusal,
  "detail" | "server_time" | "ended_at" | "revoked_by_event" | "receipt"
>;

/** A signed-act refusal in the typed shape. None is retryable but
 *  act_limited (signedActLimitedRefusal) and auth_unavailable. */
export function signedActRefusal(
  code: Exclude<SignedActRefusalCode, "act_limited">,
  extra: SignedActRefusalExtra = {},
): AgentRefusal {
  return {
    reason_code: code,
    retryable: false,
    terminal: false,
    next_actions: [{ ...SIGNED_ACT_NEXT[code] }],
    docs: AGENT_DOCS_URL,
    ...extra,
  };
}

export function signedActLimitedRefusal(retryAfterSeconds: number): AgentRefusal {
  return {
    reason_code: "act_limited",
    retryable: true,
    terminal: false,
    retry_after_seconds: retryAfterSeconds,
    next_actions: [{ action: "retry", after_seconds: retryAfterSeconds, optional: true }],
    docs: AGENT_DOCS_URL,
  };
}
