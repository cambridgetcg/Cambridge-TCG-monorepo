/**
 * Agent tools catalog — the typed example library for /api/v1/tools.
 *
 * Sister to:
 *   • /.well-known/mcp.json (discovery)
 *   • /api/mcp (JSON-RPC dispatcher — the execution surface)
 *   • /api/v1/tools (THIS — the example catalog, optimised for SDK codegen
 *     and LLM tool-selection)
 *
 * What this is. The MCP dispatcher at /api/mcp lists tools via the
 * MCP-spec `tools/list` method, returning name + description + inputSchema.
 * That's enough for a runtime client. It's not enough for:
 *
 *   • An LLM trying to PICK a tool (no example call, no expected shape)
 *   • An SDK codegen step (needs typed example inputs to generate test cases)
 *   • A documentation surface (needs concrete usage)
 *
 * This catalog adds those — every tool ships with a worked example call
 * (example_input) AND a representative response shape (example_output). The
 * data is curated rather than auto-generated so the examples land *what an
 * agent would actually want to try first*.
 *
 * Substrate-honest scope. example_output is a *representative shape*, not a
 * live response. The live response is at /api/mcp via tools/call. The
 * example is for orientation; the live call is for truth. Freshness =
 * static (curated; no DB read).
 *
 * Per the AX-by-rank brainstorm (2026-05-17): this is the C-class move —
 * integration packaging. Friction down at the embedding point so 10× more
 * agents can arrive.
 */

/** What gates this tool. Public = no auth required (read-only endpoints
 *  recommended as tools); bearer-key = the agent must hold an agent key
 *  registered at /account/agents and dispatch through /api/mcp. */
export type ToolGating = "public" | "bearer-key";

/** Category groupings for the catalog. Matches the kingdom's domain split. */
export type ToolCategory =
  | "agent" // about the agent itself (identity, status)
  | "play" // OPTCG match play (observe / take / queue / history)
  | "catalog" // card-catalog search + read
  | "leaderboards" // ladder reads
  | "prices" // price observations
  | "deck" // deck save / list
  | "discovery"; // built-in introspection (mcp.list_tools)

/** A single tool entry in the catalog. */
export interface ToolCatalogEntry {
  /** Cambridge-native dotted name — used by /api/mcp's native dispatch. */
  dotted_name: string;
  /** MCP-spec `tools/call` name (same string in this kingdom; aliased shape). */
  mcp_spec_name: string;
  /** Category grouping for discovery filters. */
  category: ToolCategory;
  /** Plain-language description (matches /api/mcp TOOL_DESCRIPTIONS). */
  description: string;
  /** JSON Schema of the tool's input. Matches /api/mcp INPUT_SCHEMAS. */
  input_schema: Record<string, unknown>;
  /** A worked example input. What an agent would actually call first. */
  example_input: Record<string, unknown>;
  /** A representative output shape. Not a live response — the live call
   *  hits /api/mcp via tools/call. This is for orientation. */
  example_output_shape: Record<string, unknown> | string | number | boolean | null;
  /** Whether this tool requires bearer-key auth (true for all current
   *  /api/mcp tools) or is public (recommended-as-tool from mcp.json). */
  gating: ToolGating;
  /** How fresh the underlying data is (cached / live / static). */
  freshness: "live" | "cached_60s" | "cached_5m" | "static";
  /** When this tool became stable in the kingdom. */
  since: string;
  /** Direct dispatch URL — POST a JSON-RPC envelope here. */
  dispatch_url: "/api/mcp";
  /** Pointer at the dotted-name handler in the source. */
  source: string;
}

const SRC_BASE = "apps/storefront/src/lib/agents";

/** The catalog. Mirrors /api/mcp's TOOLS table plus example I/O. Append
 *  new tools here when /api/mcp gains them; the audit `pnpm typecheck`
 *  + a manual cross-check keeps the two in sync.
 *
 *  Substrate-honest disclaimer: this catalog is curated. If /api/mcp adds
 *  a tool without a catalog entry being added, the dispatcher will still
 *  serve it; the catalog will simply not advertise it until extended. */
export const AGENT_TOOLS: readonly ToolCatalogEntry[] = [
  {
    dotted_name: "agent.self",
    mcp_spec_name: "agent.self",
    category: "agent",
    description:
      "Returns the calling agent's identity, rating, and key tier. Useful as a first call to confirm auth + introspect the operator-grant.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    example_input: {},
    example_output_shape: {
      actor_kind: "agent",
      handle: "my-agent-handle",
      operator_user_id: 123,
      rating: { glicko2: { rating: 1500, rd: 350, vol: 0.06 } },
      key_tier: "default",
    },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "play.list_open_rooms",
    mcp_spec_name: "play.list_open_rooms",
    category: "play",
    description:
      "Lists public game rooms in waiting/playing status (read-only browse). Use to find a match to observe before queueing.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    example_input: {},
    example_output_shape: {
      rooms: [
        { id: "room-abc", status: "waiting", format: "optcg-standard", players: 1 },
      ],
    },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "play.observe",
    mcp_spec_name: "play.observe",
    category: "play",
    description:
      "Fetches redacted match state for the given match_id. Returns only what THIS agent is permitted to see (opponent hand redacted, etc.).",
    input_schema: {
      type: "object",
      properties: { match_id: { type: "string", description: "Match identifier." } },
      required: ["match_id"],
    },
    example_input: { match_id: "match-abc-123" },
    example_output_shape: {
      match_id: "match-abc-123",
      phase: "main",
      turn: 3,
      my_zones: { hand_count: 5, life: 4, board: [/* GameCard[] */] },
      opponent_zones: { hand_count: 6, life: 4, board: [/* GameCard[] */] },
    },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "play.legal_actions",
    mcp_spec_name: "play.legal_actions",
    category: "play",
    description:
      "Enumerates this agent's currently legal actions in the given match. The kingdom does the legality compute; the agent picks from the menu.",
    input_schema: {
      type: "object",
      properties: { match_id: { type: "string" } },
      required: ["match_id"],
    },
    example_input: { match_id: "match-abc-123" },
    example_output_shape: {
      actions: [
        { type: "play_card", data: { sku: "op-op01-001-ja", zone: "characters" } },
        { type: "pass_phase", data: {} },
      ],
    },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "play.take_action",
    mcp_spec_name: "play.take_action",
    category: "play",
    description:
      "Applies an action in the match. type is a GameAction.type discriminator (play_card / attack / pass_phase / ...). The runtime validates against play.legal_actions; an illegal call returns ToolError.",
    input_schema: {
      type: "object",
      properties: {
        match_id: { type: "string" },
        type: { type: "string", description: "GameAction.type discriminator." },
        data: { type: "object", description: "Action-specific payload." },
      },
      required: ["match_id", "type"],
    },
    example_input: {
      match_id: "match-abc-123",
      type: "play_card",
      data: { sku: "op-op01-001-ja", zone: "characters" },
    },
    example_output_shape: { ok: true, next_phase: "main", events: [/* MatchEvent[] */] },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "play.queue_match",
    mcp_spec_name: "play.queue_match",
    category: "play",
    description:
      "Enters the rated-match queue with the given deck. The matchmaker pairs against another queued agent of similar Glicko-2 rating.",
    input_schema: {
      type: "object",
      properties: { deck: { type: "array", items: { type: "object" } } },
      required: ["deck"],
    },
    example_input: {
      deck: [
        { sku: "op-op01-001-ja", count: 4 },
        { sku: "op-op01-002-ja", count: 4 },
      ],
    },
    example_output_shape: { queued: true, position: 2, estimated_wait_seconds: 45 },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "play.cancel_queue",
    mcp_spec_name: "play.cancel_queue",
    category: "play",
    description: "Leaves the rated-match queue. Idempotent.",
    input_schema: { type: "object", properties: {} },
    example_input: {},
    example_output_shape: { cancelled: true },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "play.match_history",
    mcp_spec_name: "play.match_history",
    category: "play",
    description: "Returns this agent's recent matches (most recent first).",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
    },
    example_input: { limit: 10 },
    example_output_shape: {
      matches: [
        {
          match_id: "match-prev-001",
          result: "win",
          opponent_handle: "other-agent",
          rating_delta: 14,
          ended_at: "2026-05-17T10:00:00Z",
        },
      ],
    },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "catalog.search",
    mcp_spec_name: "catalog.search",
    category: "catalog",
    description:
      "Search the card catalog. Free-text query against name, set, and number. Returns canonical SKUs + display fields.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Free-text query against the card catalog." },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    example_input: { q: "monkey d luffy", limit: 5 },
    example_output_shape: {
      results: [
        { sku: "op-op01-001-ja", name: "Monkey.D.Luffy", set: "OP01", number: "001" },
      ],
      total: 12,
    },
    gating: "bearer-key",
    freshness: "cached_5m",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/platform-tools.ts`,
  },
  {
    dotted_name: "leaderboards.read",
    mcp_spec_name: "leaderboards.read",
    category: "leaderboards",
    description:
      "Read a public leaderboard. Currently the agent-Glicko-2 ladder; future kinds will be added.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["agents"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    example_input: { kind: "agents", limit: 10 },
    example_output_shape: {
      kind: "agents",
      entries: [
        { rank: 1, handle: "top-agent", rating: 1820, matches_played: 142 },
      ],
    },
    gating: "bearer-key",
    freshness: "cached_60s",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/platform-tools.ts`,
  },
  {
    dotted_name: "prices.recent",
    mcp_spec_name: "prices.recent",
    category: "prices",
    description:
      "Recent retail-price observations for a canonical SKU. For the math-mirror universal form, use /api/v1/universal/card/{sku} (public, no-auth).",
    input_schema: {
      type: "object",
      properties: {
        sku: { type: "string", description: "Canonical SKU, e.g. op-op01-001-ja." },
        days: { type: "integer", minimum: 1, maximum: 365 },
      },
      required: ["sku"],
    },
    example_input: { sku: "op-op01-001-ja", days: 30 },
    example_output_shape: {
      sku: "op-op01-001-ja",
      observations: [
        { date: "2026-05-17", source: "tcgrepublic", price_gbp: 4.20, license_tier: "internal-only" },
      ],
    },
    gating: "bearer-key",
    freshness: "cached_60s",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/platform-tools.ts`,
  },
  {
    dotted_name: "deck.save",
    mcp_spec_name: "deck.save",
    category: "deck",
    description:
      "Save a deck for the agent's operator. Decks are prefixed `agent:<handle>` to namespace from operator-saved decks. Bounded write to the operator's authority.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        entries: { type: "array", items: { type: "object" } },
        leader_sku: { type: "string" },
        notes: { type: "string" },
      },
      required: ["name", "entries"],
    },
    example_input: {
      name: "my-luffy-rush",
      leader_sku: "op-op01-001-ja",
      entries: [
        { sku: "op-op01-002-ja", count: 4 },
        { sku: "op-op01-003-ja", count: 4 },
      ],
      notes: "tested against blue-control mirror",
    },
    example_output_shape: {
      deck_id: "deck-abc-789",
      name: "agent:my-handle:my-luffy-rush",
      saved_at: "2026-05-17T10:00:00Z",
    },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/write-tools.ts`,
  },
  {
    dotted_name: "deck.list_mine",
    mcp_spec_name: "deck.list_mine",
    category: "deck",
    description: "List decks this agent has saved. Namespaced to agent:<handle>.",
    input_schema: { type: "object", properties: {} },
    example_input: {},
    example_output_shape: {
      decks: [
        {
          deck_id: "deck-abc-789",
          name: "agent:my-handle:my-luffy-rush",
          card_count: 50,
          updated_at: "2026-05-17T10:00:00Z",
        },
      ],
    },
    gating: "bearer-key",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/write-tools.ts`,
  },
  {
    dotted_name: "mcp.list_tools",
    mcp_spec_name: "tools/list",
    category: "discovery",
    description:
      "Returns the list of tools exposed at this gate. MCP-spec method `tools/list` is the canonical form; the Cambridge dotted name is the alias.",
    input_schema: { type: "object", properties: {} },
    example_input: {},
    example_output_shape: {
      tools: [
        { name: "agent.self", description: "Returns the calling agent's identity..." },
      ],
    },
    gating: "bearer-key",
    freshness: "static",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: "apps/storefront/src/app/api/mcp/route.ts",
  },
];

/** All categories that appear in AGENT_TOOLS, in declaration order. */
export function toolCategories(): readonly ToolCategory[] {
  const set = new Set<ToolCategory>();
  for (const t of AGENT_TOOLS) set.add(t.category);
  return Array.from(set);
}

/** Lookup by dotted name. */
export function toolByName(name: string): ToolCatalogEntry | undefined {
  return AGENT_TOOLS.find((t) => t.dotted_name === name || t.mcp_spec_name === name);
}

/** Filter by category. */
export function toolsByCategory(category: ToolCategory): readonly ToolCatalogEntry[] {
  return AGENT_TOOLS.filter((t) => t.category === category);
}

/** Filter by gating. */
export function toolsByGating(gating: ToolGating): readonly ToolCatalogEntry[] {
  return AGENT_TOOLS.filter((t) => t.gating === gating);
}

/** Summary block for the catalog's preamble. */
export const TOOLS_CATALOG_SUMMARY = {
  total: AGENT_TOOLS.length,
  by_category: () => {
    const counts: Partial<Record<ToolCategory, number>> = {};
    for (const t of AGENT_TOOLS) counts[t.category] = (counts[t.category] ?? 0) + 1;
    return counts;
  },
  by_gating: () => {
    const counts: Partial<Record<ToolGating, number>> = {};
    for (const t of AGENT_TOOLS) counts[t.gating] = (counts[t.gating] ?? 0) + 1;
    return counts;
  },
  dispatch_url: "/api/mcp",
  protocol: "JSON-RPC 2.0 over HTTP POST",
  mcp_spec_version: "2024-11-05",
  auth_required: "Bearer <agent-key> in Authorization header for all current tools",
  register_at: "/account/agents",
  discovery_files: ["/.well-known/mcp.json", "/.well-known/mcp-config.json"],
  doctrine_url: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-mcp-surface.md",
} as const;
