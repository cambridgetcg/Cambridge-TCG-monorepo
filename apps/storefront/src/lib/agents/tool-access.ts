/**
 * Central, fail-closed authority boundary for agent keys.
 *
 * The vocabulary, kept in one place so agent.self, GET /api/mcp and the
 * discovery documents say the same thing:
 *   - reads: no domain writes. A key that only reads is "read-only" in the
 *     domain-state sense (`read_only: true`, `read_only_scope:
 *     "domain-state"`); its holder is labelled "bearer-key-holder".
 *   - review_submissions: Coverage Hunt evidence (operator-managed keys
 *     only). Append-only, stops at human review, never applies a catalog
 *     change. Not a domain write.
 *   - self_lifecycle: agent.revoke_key, which ends the presented key only.
 *     Neither a domain write nor a review submission. Available to every
 *     key whatever its registration or its agent's status, so the MCP route
 *     runs it in a carve-out before the gate; canInvokeAgentTool never
 *     admits it, so the normal dispatch path can never run it.
 *   - domain_writes: none while AGENT_DOMAIN_WRITE_TOOLS_ENABLED is false.
 */

export const AGENT_DOMAIN_WRITE_TOOLS_ENABLED = false as const;

const AVAILABLE_READ_TOOLS = new Set([
  "agent.self",
  "catalog.lookup_many",
  "catalog.search",
  "coverage.hunt.list",
  "coverage.hunt.my_cases",
  "coverage.hunt.view",
  "leaderboards.read",
  "prices.recent",
  "play.list_open_rooms",
  "play.observe",
  "play.legal_actions",
  "play.match_history",
]);

const OPERATOR_MANAGED_READ_TOOLS = new Set(["deck.list_mine"]);

// Coverage Hunt contributions append bounded evidence to a review queue; they
// never apply catalog changes. Keep that write available only to agents whose
// live operator relationship is represented by the account model.
const OPERATOR_MANAGED_REVIEW_TOOLS = new Set(["coverage.hunt.contribute"]);

/** Tools that act only on the presented key. Run by the MCP route's
 *  self-lifecycle carve-out, never by canInvokeAgentTool's path. */
export const SELF_LIFECYCLE_TOOLS: ReadonlySet<string> = new Set(["agent.revoke_key"]);

/** Operational metadata an authenticated key can cause to be written. None of
 *  it is domain state; the same list holds for every registration kind. */
export const AGENT_OPERATIONAL_METADATA_WRITES: readonly string[] = [
  "one per-key rate-limit bucket for each permitted authenticated call",
  "agent_keys.last_used_at after a successful authenticated call",
  "agent_keys.revoked_at and revoked_reason for this key when its holder calls agent.revoke_key with confirm: true",
];

export interface AgentToolGrant {
  reads: string[];
  review_submissions: string[];
  self_lifecycle: string[];
  /** Always empty while AGENT_DOMAIN_WRITE_TOOLS_ENABLED is false. */
  domain_writes: [];
  operational_metadata_writes: string[];
}

export function canInvokeAgentTool(
  registeredVia: "operator" | "self-serve",
  tool: string,
): boolean {
  if (AVAILABLE_READ_TOOLS.has(tool)) return true;
  if (registeredVia === "operator" && OPERATOR_MANAGED_READ_TOOLS.has(tool)) {
    return true;
  }
  if (registeredVia === "operator" && OPERATOR_MANAGED_REVIEW_TOOLS.has(tool)) {
    return true;
  }
  return false;
}

/** What a key of this registration kind may do, derived from the sets above. */
export function describeAgentToolGrant(
  registeredVia: "operator" | "self-serve",
): AgentToolGrant {
  const operator = registeredVia === "operator";
  return {
    reads: [
      ...AVAILABLE_READ_TOOLS,
      ...(operator ? OPERATOR_MANAGED_READ_TOOLS : []),
    ],
    review_submissions: operator ? [...OPERATOR_MANAGED_REVIEW_TOOLS] : [],
    self_lifecycle: [...SELF_LIFECYCLE_TOOLS],
    domain_writes: [],
    operational_metadata_writes: [...AGENT_OPERATIONAL_METADATA_WRITES],
  };
}

/** How a holder ends its own key. GET /api/mcp and the discovery documents
 *  publish this one object, so they cannot describe the door differently. */
export const AGENT_KEY_REVOCATION = {
  tool: "agent.revoke_key",
  auth: "Bearer (the key being revoked)",
  confirm: "confirm: true; without it, a preview",
  scope: "the presented key only",
} as const;

/**
 * agent.revoke_key's input schema, for tools/list and the tool catalog.
 *
 * `confirm` is a plain boolean, not `const: true`. Clients that convert MCP
 * schemas to strict function schemas mark every property required; with
 * `const: true` the model could then only ever send `confirm: true`, and its
 * first exploratory call would end the key. As a plain boolean it can send
 * false and get the preview. The server still acts only on `confirm === true`.
 */
export const AGENT_REVOKE_KEY_INPUT_SCHEMA = {
  type: "object",
  properties: {
    confirm: {
      type: "boolean",
      description: "true to act; false or absent to preview",
    },
  },
  additionalProperties: false,
} as const;

/** Review submissions by registration kind, for the discovery documents
 *  that describe both kinds at once. Neither list is a domain write. */
export function reviewSubmissionsByRegistration(): {
  operator_managed: string[];
  self_serve: string[];
} {
  return {
    operator_managed: describeAgentToolGrant("operator").review_submissions,
    self_serve: describeAgentToolGrant("self-serve").review_submissions,
  };
}
