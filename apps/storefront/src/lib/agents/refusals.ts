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
 *
 * Since 2026-11-13 the same shape covers what a tool handler refuses
 * (ToolError, tool-error.ts) and an unexpected exception at the gate
 * (internalErrorRefusal), and every refusal says what became of the change
 * the call asked for (`effect`), and what it changed anyway, if anything
 * (`side_effects`). Chosen by an AI agent on 2026-11-13 as defaults for
 * review; the owner has not decided them.
 */

import type { AgentAuthFailure } from "./auth";
import { KEY_EXPIRED_REPLACEMENT_CASE } from "./key-exit-inventory";

export const AGENT_DOCS_URL = "https://cambridgetcg.com/methodology/agents";
export const MCP_REFUSAL_META_KEY = "cambridgetcg.com/refusal";
/** Where the methodology page lists the refusals and what effect means. */
export const REFUSALS_DOCS_URL = `${AGENT_DOCS_URL}#refusals`;

/**
 * What became of the change the refused call asked for. On every refusal.
 *   - not_attempted: refused before the tool's own work began (the gate's
 *     checks, a closed door); nothing the call asked for was tried.
 *   - not_applied: the tool ran and made none of the change the call asked
 *     for. A call that only reads asks for no change, so its refusals are
 *     never unknown. side_effects lists anything it changed anyway.
 *   - unknown: the change may or may not have been made. Read the state
 *     before sending it again.
 */
export type RefusalEffect = "not_attempted" | "not_applied" | "unknown";

/** Something a refused call changed although it was refused, named once as
 *  a code and once in plain words. */
export type RefusalSideEffectCode =
  | "case_marked_resting"
  | "chronicle_row_added"
  | "act_recorded"
  | "signing_key_confirmed";

export interface RefusalSideEffect {
  change: RefusalSideEffectCode;
  text: string;
}

/** What a tool handler refuses with (ToolError). Coverage Hunt's own code
 *  words are kept where it has them (coverage-hunt/validation.ts). */
export const TOOL_REFUSAL_CODES = [
  "invalid_input",
  "case_not_found",
  "candidate_not_found",
  "case_expired",
  "case_terminal",
  "wrong_turn",
  "agent_already_participated",
  "evidence_not_found",
  "not_ready_for_human",
  "daily_limit",
  "key_not_live",
  "match_not_found",
  "not_a_participant",
  "match_state_missing",
  "match_not_playing",
  "agent_not_active",
  "writes_paused",
  "source_unavailable",
  "storage_not_ready",
  "internal_error",
] as const;

export type ToolRefusalCode = (typeof TOOL_REFUSAL_CODES)[number];

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
  | ToolRefusalCode
  | "tool_not_permitted"
  | "rate_limited"
  | "auth_unavailable";

export interface RefusalNextAction {
  action: "read_docs" | "request_review" | "retry" | "sign_new_act" | "fetch_preview" | "call_tool";
  href?: string;
  after_seconds?: number;
  /** call_tool: the tool to call, by its MCP name. */
  tool?: string;
  /** call_tool: arguments known from the refused call, when the tool needs
   *  them (a case id the caller sent or the store named). */
  arguments?: Record<string, string>;
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
  /** What became of the change the call asked for (RefusalEffect). */
  effect: RefusalEffect;
  /** What the refused call changed anyway. Absent when it changed nothing
   *  beyond the operational metadata the gate publishes (a rate-limit
   *  bucket, the daily count). */
  side_effects?: RefusalSideEffect[];
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

/** A refusal of the key or its agent. At the gate nothing was attempted
 *  (the default); agent.act passes not_applied for an act its agent's
 *  status refused. */
export function authRefusal(failure: AgentAuthFailure, effect: RefusalEffect = "not_attempted"): AgentRefusal {
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
      effect,
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
      effect,
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
      effect,
    };
  }
  return {
    reason_code: failure.reason_code,
    retryable: false,
    terminal: false,
    next_actions: [{ action: "read_docs", href: AGENT_DOCS_URL, optional: true }],
    docs: AGENT_DOCS_URL,
    effect,
  };
}

export function toolNotPermittedRefusal(): AgentRefusal {
  return {
    reason_code: "tool_not_permitted",
    retryable: false,
    terminal: true,
    next_actions: [],
    docs: AGENT_DOCS_URL,
    effect: "not_attempted",
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
    effect: "not_attempted",
  };
}

/** The key lookup failed. At the gate nothing was attempted (the default).
 *  agent.act passes not_applied when its lookup failed before any write,
 *  and unknown when its transaction failed, with a second action that reads
 *  the agent's record. */
export function authUnavailableRefusal(effect: RefusalEffect = "not_attempted"): AgentRefusal {
  return {
    reason_code: "auth_unavailable",
    retryable: true,
    terminal: false,
    next_actions: [
      { action: "retry", optional: true },
      ...(effect === "unknown"
        ? [
            {
              action: "sign_new_act" as const,
              text: "Whether the act was applied is not known. A signer.check act reads the agent's keys; the same act sent again applies at most once, and is refused as act_replayed if it was recorded.",
              optional: true as const,
            },
          ]
        : []),
    ],
    docs: AGENT_DOCS_URL,
    effect,
  };
}

/** Closed doors: a refusal whose 503 is a decision, not an outage, so a
 *  standard MCP client is sent it with 200 (mcp-transport.ts). */
export function isClosedDoorRefusal(refusal: Pick<AgentRefusal, "reason_code">): boolean {
  return refusal.reason_code === "signed_acts_closed" || refusal.reason_code === "writes_paused";
}

// ── Tool refusals ────────────────────────────────────────────────────────

/** What the refused call carried that a next action can use. */
export interface ToolRefusalContext {
  /** Defaults to not_applied: the handler ran. */
  effect?: RefusalEffect;
  /** daily_limit: seconds until the limit's day turns. */
  retryAfterSeconds?: number;
  sideEffects?: RefusalSideEffect[];
  /** A Coverage Hunt case the call named, or the store named in its answer. */
  caseId?: string;
  /** A match the call named. */
  matchId?: string;
}

interface ToolRefusalRule {
  retryable: boolean;
  /** Null for a terminal refusal: no next action. */
  next: ((context: ToolRefusalContext) => RefusalNextAction[]) | null;
}

const callTool = (tool: string, text: string, args?: Record<string, string>): RefusalNextAction => ({
  action: "call_tool",
  tool,
  ...(args ? { arguments: args } : {}),
  text,
  optional: true,
});

const LIST_CASES = callTool(
  "coverage.hunt.list",
  "Lists the cases open now and the candidates on the board; walking past creates nothing.",
);

/** coverage.hunt.view for the case, when its id is known; otherwise the list. */
function viewCase(context: ToolRefusalContext, text: string): RefusalNextAction {
  return context.caseId ? callTool("coverage.hunt.view", text, { case_id: context.caseId }) : LIST_CASES;
}

const MATCH_HISTORY = callTool("play.match_history", "Lists this agent's matches and their ids.");

const CHECK_ARGUMENTS: RefusalNextAction = {
  action: "read_docs",
  href: REFUSALS_DOCS_URL,
  text: "Change the arguments before sending again: the same ones are refused the same way. Each tool's inputSchema is in tools/list.",
  optional: true,
};

/** Each tool refusal's retryable and next actions. retryable says whether
 *  the same call, sent again unchanged, may succeed once time passes with
 *  nothing else changing first (a limit resets, an outage ends); false when
 *  the call, the agent, the store's data or the deployment must change
 *  first, or when the state should be read before sending again. The gate's
 *  own values follow the same rule. */
const TOOL_REFUSAL_RULES: Record<ToolRefusalCode, ToolRefusalRule> = {
  invalid_input: { retryable: false, next: () => [CHECK_ARGUMENTS] },
  case_not_found: { retryable: false, next: () => [LIST_CASES] },
  candidate_not_found: {
    retryable: false,
    next: () => [callTool("coverage.hunt.list", "The board changes as coverage changes; it lists the candidates on it now.")],
  },
  case_expired: {
    retryable: false,
    // coverage.hunt.view returns the case's status and turns, not its
    // chronicle; side_effects is what names the chronicle row.
    next: (context) =>
      context.sideEffects?.length
        ? [viewCase(context, "Shows the case as it stands now: resting, with its turns."), LIST_CASES]
        : [LIST_CASES],
  },
  case_terminal: { retryable: false, next: () => [LIST_CASES] },
  wrong_turn: {
    retryable: false,
    next: (context) => [viewCase(context, "Shows the case's status and the role it waits for, if any.")],
  },
  agent_already_participated: {
    retryable: false,
    next: () => [callTool("coverage.hunt.list", "Each case needs three different agents; the list shows cases this agent has not joined.")],
  },
  evidence_not_found: {
    retryable: false,
    next: (context) => [viewCase(context, "Shows the scout's evidence labels, which evidence_selected must name.")],
  },
  // Reached only through the human review page, never at the MCP gate.
  not_ready_for_human: { retryable: false, next: null },
  daily_limit: {
    retryable: true,
    next: (context) => [
      {
        action: "retry",
        ...(context.retryAfterSeconds === undefined ? {} : { after_seconds: context.retryAfterSeconds }),
        text: "The limit counts the new cases this agent scouted since 00:00 UTC. Taking a checker or mirror turn on an open case does not count against it.",
        optional: true,
      },
    ],
  },
  key_not_live: {
    retryable: false,
    next: () => [
      {
        action: "read_docs",
        href: `${AGENT_DOCS_URL}#ending-a-key`,
        text: "This key was revoked or has expired before the write could start, so nothing was written. It will not work again; a new key comes from whoever minted this one.",
        optional: true,
      },
    ],
  },
  match_not_found: { retryable: false, next: () => [MATCH_HISTORY] },
  not_a_participant: { retryable: false, next: () => [MATCH_HISTORY] },
  match_state_missing: { retryable: false, next: () => [MATCH_HISTORY] },
  match_not_playing: {
    retryable: false,
    next: (context) =>
      context.matchId
        ? [callTool("play.observe", "Shows the match as it stands.", { match_id: context.matchId })]
        : [MATCH_HISTORY],
  },
  agent_not_active: { retryable: false, next: null },
  writes_paused: { retryable: false, next: null },
  source_unavailable: {
    retryable: true,
    next: () => [{ action: "retry", text: "A source this tool reads did not answer; nothing was invented in its place.", optional: true }],
  },
  storage_not_ready: {
    retryable: false,
    next: () => [
      {
        action: "read_docs",
        href: REFUSALS_DOCS_URL,
        text: "Coverage Hunt's tables are missing on this deployment, so nothing was accepted. Sending again cannot help until they exist.",
        optional: true,
      },
    ],
  },
  internal_error: {
    retryable: false,
    next: () => [callTool("agent.self", "Shows whether this key and its agent still work.")],
  },
};

/** The typed refusal a tool handler's ToolError carries. */
export function toolRefusal(code: ToolRefusalCode, context: ToolRefusalContext = {}): AgentRefusal {
  const rule = TOOL_REFUSAL_RULES[code];
  const next = rule.next ? rule.next(context) : [];
  return {
    reason_code: code,
    retryable: rule.retryable,
    terminal: rule.next === null,
    next_actions: next,
    docs: AGENT_DOCS_URL,
    effect: context.effect ?? "not_applied",
    ...(context.sideEffects?.length ? { side_effects: context.sideEffects.map((entry) => ({ ...entry })) } : {}),
    ...(context.retryAfterSeconds === undefined ? {} : { retry_after_seconds: context.retryAfterSeconds }),
  };
}

/** What a contribution changed when it found its case past its 72-hour
 *  limit: the store marks the case resting and writes a chronicle row,
 *  commits both, and then refuses the turn (coverage-hunt/db.ts). */
export function caseRestedSideEffects(caseId: string): RefusalSideEffect[] {
  return [
    {
      change: "case_marked_resting",
      text: `This call marked case ${caseId} resting, because it had passed its 72-hour limit. The case takes no more turns.`,
    },
    {
      change: "chronicle_row_added",
      text: "A system row saying the case is now resting was added to the case's chronicle.",
    },
  ];
}

/**
 * An unexpected exception at the gate. The answer names no part of it; the
 * server's log keeps it. `effect` is the caller's to choose: not_attempted
 * when the tool had not started (the rate limiter failed), not_applied for
 * a tool that only reads, unknown for one that could write. Repeating is
 * offered only when nothing can have changed; otherwise the next action
 * reads the state the call could have changed.
 */
export function internalErrorRefusal(
  tool: string,
  args: Record<string, unknown>,
  effect: RefusalEffect,
): AgentRefusal {
  if (effect !== "unknown") {
    return {
      reason_code: "internal_error",
      retryable: true,
      terminal: false,
      next_actions: [
        {
          action: "retry",
          text: "Nothing this call asked for was changed, so sending it again is harmless; it may fail the same way.",
          optional: true,
        },
      ],
      docs: AGENT_DOCS_URL,
      effect,
    };
  }
  let read: RefusalNextAction;
  if (tool === "coverage.hunt.contribute") {
    const caseId = typeof args.case_id === "string" && args.case_id.length <= 64 ? args.case_id : undefined;
    const text =
      "Shows whether this turn was recorded. Sending the same client_request_id again is safe: a recorded turn comes back as its receipt (idempotent: true) and is never recorded twice.";
    read = caseId
      ? callTool("coverage.hunt.view", text, { case_id: caseId })
      : callTool("coverage.hunt.my_cases", text);
  } else {
    read = callTool("agent.self", "Shows whether this key and its agent still work. This tool's writes are paused, so it is unlikely anything changed.");
  }
  return {
    reason_code: "internal_error",
    retryable: false,
    terminal: false,
    next_actions: [read],
    docs: AGENT_DOCS_URL,
    effect,
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
    text: "This send changed nothing, and it cannot say whether this act was applied when it was first sent. A signer.check act, signed with a new jti, reads the agent's keys. Each act is used once, applied or refused: to act again, sign a new act with a new jti.",
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
  "detail" | "server_time" | "ended_at" | "revoked_by_event" | "receipt" | "side_effects"
>;

/** A signed-act refusal in the typed shape. None is retryable but
 *  act_limited (signedActLimitedRefusal) and auth_unavailable. A closed door
 *  read nothing (not_attempted). act_replayed is unknown: this send changed
 *  nothing, but the act's jti was used by an earlier send, which this answer
 *  cannot see, and that send may have applied it (a caller resending after
 *  auth_unavailable's unknown lands here). Every other refusal came from the
 *  act's own checks and applied none of it (not_applied), though a refusal
 *  recorded after a valid signature lists what it changed
 *  (signedActSideEffects). */
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
    effect: code === "signed_acts_closed" ? "not_attempted" : code === "act_replayed" ? "unknown" : "not_applied",
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
    effect: "not_applied",
  };
}

/** What a validly signed act refused after the store recorded its jti
 *  changed anyway (signed-acts.ts, steps 10 to 12): the store recorded it as
 *  an event and spent its jti, and, when the signing key was pending and the
 *  refusal came after the confirmation step, confirmed it. act_replayed,
 *  refused at step 10 because the jti was already used, records nothing. */
export function signedActSideEffects(confirmedSigningKey: boolean): RefusalSideEffect[] {
  return [
    {
      change: "act_recorded",
      text: "The store recorded this refused act as an event (receipt.event_id) and its jti is used up: the same act sent again is refused as act_replayed.",
    },
    ...(confirmedSigningKey
      ? [
          {
            change: "signing_key_confirmed" as const,
            text: "This act confirmed the pending signing key that signed it, although the act itself was refused. The key is confirmed now and no longer lapses.",
          },
        ]
      : []),
  ];
}
