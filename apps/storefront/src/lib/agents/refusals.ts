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

export const AGENT_DOCS_URL = "https://cambridgetcg.com/methodology/agents";
export const MCP_REFUSAL_META_KEY = "cambridgetcg.com/refusal";

export type AgentRefusalCode =
  | AgentAuthFailure["reason_code"]
  | "tool_not_permitted"
  | "rate_limited"
  | "auth_unavailable";

export interface RefusalNextAction {
  action: "read_docs" | "request_review" | "retry";
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
