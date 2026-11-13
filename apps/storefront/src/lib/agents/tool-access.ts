/**
 * Central, fail-closed authority boundary for agent keys.
 *
 * The vocabulary, kept in one place so agent.self, GET /api/mcp and the
 * discovery documents say the same thing:
 *   - reads: no domain writes. A key that only reads is "read-only" in the
 *     domain-state sense (`read_only: true`, `read_only_scope:
 *     "domain-state"`). A self-serve agent's controller is labelled
 *     "bearer-key-holder"; the schema does not represent that holder, whose
 *     only in-band control is ending its own key (SELF_SERVE_CONTROLLER_NOTE).
 *   - review_submissions: Coverage Hunt evidence (operator-managed keys
 *     only). Append-only, stops at human review, never applies a catalog
 *     change. Not a domain write.
 *   - self_lifecycle: agent.revoke_key, which ends the presented key only.
 *     Neither a domain write nor a review submission. Available to every
 *     key whatever its registration or its agent's status, so the MCP route
 *     runs it in a carve-out before the gate; canInvokeAgentTool never
 *     admits it, so the normal dispatch path can never run it.
 *   - signed_acts: agent.act, which takes a signed statement instead of a
 *     bearer key (lib/agents/signed-acts.ts). Its own carve-out in the MCP
 *     route runs it before the gate, apart from self_lifecycle (that
 *     carve-out would end the presented bearer key). canInvokeAgentTool
 *     never admits it. Signing keys are bound only to operator-managed
 *     agents, and the path is closed unless AGENT_SIGNED_ACTS is on, so a
 *     grant lists it only for those agents and only while this deployment
 *     has it open.
 *   - domain_writes: none while AGENT_DOMAIN_WRITE_TOOLS_ENABLED is false.
 */

import { signedActsOpen } from "./signed-act-config";

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

/** Tools that take a signed act rather than a bearer key. Run by the MCP
 *  route's signed-act carve-out, never by canInvokeAgentTool's path, and
 *  never in SELF_LIFECYCLE_TOOLS. */
export const SIGNED_ACT_TOOLS: ReadonlySet<string> = new Set(["agent.act"]);

/** The first two lines below, as /.well-known/mcp.json has published them
 *  since 2026-11-06. agent.self's recorded_about_this_key quotes them back
 *  (self-record.ts), so each item it reads says where it is listed. */
export const LISTED_BUCKETS = "per-key rate-limit bucket for allowed authenticated calls";
export const LISTED_LAST_USED = "agent key last-used timestamp after successful authenticated calls";
/** The seven-day deletion every counted call runs, whoever's buckets they are. */
export const LISTED_BUCKET_PRUNE =
  "deletion of rate-limit buckets older than seven days, any key's, by each allowed authenticated call, even one then refused";

/** Operational metadata a key can cause the gate to write. None of it is
 *  domain state; the same list holds for every registration kind. This is
 *  the one list: agent.self, GET /api/mcp and the discovery documents
 *  publish it through operationalMetadataWrites (operational-metadata.ts),
 *  which adds the daily MCP count's line while that count is on. */
export const AGENT_OPERATIONAL_METADATA_WRITES: readonly string[] = [
  LISTED_BUCKETS,
  LISTED_LAST_USED,
  "agent_keys.revoked_at and revoked_reason for this key when its holder calls agent.revoke_key with confirm: true",
  // rate-limit.ts checkAndConsume prunes in the statement that counts the
  // call, before the call can be refused (rate_limited, by its tool, or by
  // an exception). Listed since 2026-11-13.
  LISTED_BUCKET_PRUNE,
];

export interface AgentToolGrant {
  reads: string[];
  review_submissions: string[];
  self_lifecycle: string[];
  /** Tools authenticated by a signed act from a bound signing key: for
   *  operator-managed agents, and empty while this deployment has signed
   *  acts closed (AGENT_SIGNED_ACTS), when agent.act only answers
   *  signed_acts_closed. */
  signed_acts: string[];
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

/** Whether a tool only reads, so a failed call to it cannot have changed
 *  anything it was asked to change (the refusal's effect is never unknown).
 *  Any other name, an unknown one included, is treated as one that could
 *  write. */
export function isReadOnlyAgentTool(tool: string): boolean {
  return AVAILABLE_READ_TOOLS.has(tool) || OPERATOR_MANAGED_READ_TOOLS.has(tool);
}

/** What a key of this registration kind may do, derived from the sets above
 *  and, for signed_acts, from whether this deployment has them open. */
export function describeAgentToolGrant(
  registeredVia: "operator" | "self-serve",
  env: Readonly<Record<string, string | undefined>> = process.env,
): AgentToolGrant {
  const operator = registeredVia === "operator";
  return {
    reads: [
      ...AVAILABLE_READ_TOOLS,
      ...(operator ? OPERATOR_MANAGED_READ_TOOLS : []),
    ],
    review_submissions: operator ? [...OPERATOR_MANAGED_REVIEW_TOOLS] : [],
    self_lifecycle: [...SELF_LIFECYCLE_TOOLS],
    signed_acts: operator && signedActsOpen(env) ? [...SIGNED_ACT_TOOLS] : [],
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
 * Agent-held signing keys (docs/plans/agent-auth/held-keys.md), as GET
 * /api/mcp and the discovery documents publish them. The words hold whether
 * or not a deployment has opened the path; GET /api/mcp, which is never
 * cached, adds whether this one has. The owner decided to offer the keys
 * (2026-11-10); the wording is an agent's.
 */
export const AGENT_SIGNED_ACTS = {
  tool: "agent.act",
  rest_twin: "POST https://cambridgetcg.com/api/v1/agents/act",
  auth: "one signed act (a compact JWS, typ ctcg-act.v1, Ed25519) from a key the agent's operator bound at /account/agents; Authorization is not read",
  scope: "operator-managed agents only; acts signer.check, key.mint and key.revoke, each with a preview that writes nothing",
  availability: "closed unless the deployment opens it; closed, it answers signed_acts_closed and reads nothing",
  proves: "control of the key over the signed bytes; not identity, consent, or authority to act for anyone else",
  docs: "https://cambridgetcg.com/methodology/agents#signed-acts",
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

/** Who a self-serve agent's "controller" is, and what that holder can do.
 *  mcp.json and mcp-config.json open controller_model with it, and
 *  cambridge-tcg.json serves it as holder_scope beside controller
 *  "bearer-key-holder", so the three documents say the same thing. */
export const SELF_SERVE_CONTROLLER_NOTE =
  "A self-serve agent's controller is labelled as its bearer-key holder; the schema does not represent that holder. " +
  "The bearer-key holder can end its own key in-band with agent.revoke_key, and that is its only in-band control: " +
  "agent archival, profile erasure and profile changes are not holder-authenticated, and possession of a key is not proof of identity.";

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

/**
 * agent.act's input schema. Both members take ["string", "null"], so a
 * client that marks every property required can still send one of them as
 * null, the lesson of agent.revoke_key's schema above. Send exactly one as
 * a string: `act`, a compact JWS, or `preview`, an act name.
 */
export const AGENT_ACT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    act: {
      type: ["string", "null"],
      description:
        "A signed act: a compact JWS (header.payload.signature) of at most 8 KiB, typ ctcg-act.v1, signed with a key the operator bound to this agent. null to ask for a preview instead.",
    },
    preview: {
      type: ["string", "null"],
      description:
        "An act name (signer.check, key.mint or key.revoke) to preview: writes nothing and needs no key. null when sending an act.",
    },
  },
  additionalProperties: false,
} as const;
