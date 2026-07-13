/** Central, fail-closed authority boundary for agent keys. */

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
