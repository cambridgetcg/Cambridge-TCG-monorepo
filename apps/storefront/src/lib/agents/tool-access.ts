/** Central, fail-closed authority boundary for agent keys. */

export const AGENT_WRITE_TOOLS_ENABLED = false as const;

const AVAILABLE_READ_TOOLS = new Set([
  "agent.self",
  "catalog.search",
  "leaderboards.read",
  "prices.recent",
  "play.list_open_rooms",
  "play.observe",
  "play.legal_actions",
  "play.match_history",
]);

const OPERATOR_MANAGED_READ_TOOLS = new Set(["deck.list_mine"]);

export function canInvokeAgentTool(
  registeredVia: "operator" | "self-serve",
  tool: string,
): boolean {
  if (AVAILABLE_READ_TOOLS.has(tool)) return true;
  if (registeredVia === "operator" && OPERATOR_MANAGED_READ_TOOLS.has(tool)) {
    return true;
  }
  return false;
}
