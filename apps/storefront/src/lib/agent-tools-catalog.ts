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
export type ToolAuthority =
  | "public-discovery"
  | "self-serve-read"
  | "operator-managed";
export type ToolAvailability = "available" | "paused";

/** Category groupings for the catalog. Matches the kingdom's domain split. */
export type ToolCategory =
  | "agent" // about the agent itself (identity, status)
  | "play" // OPTCG match play (observe / take / queue / history)
  | "catalog" // card-catalog search + read
  | "leaderboards" // ladder reads
  | "prices" // price observations
  | "deck" // deck save / list
  | "coverage" // bounded evidence review over operational coverage gaps
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
  /** The narrowest controller class allowed to invoke this tool. */
  authority: ToolAuthority;
  /** Whether the dispatcher currently permits execution. */
  availability: ToolAvailability;
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
const PAUSED_WRITE_EXAMPLE_OUTPUT = {
  content: [
    {
      type: "text",
      text:
        "Agent match and deck writes are paused for every key until exact validation and complete attribution ship together.",
    },
  ],
  isError: true,
};

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
      "Returns the calling agent's identity, rating, key tier, operator-bound status, and whether the key is read-only. Account ids stay internal.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    example_input: {},
    example_output_shape: {
      agent_id: "agent-abc-123",
      public_handle: "my-agent-handle",
      operator_bound: true,
      read_only: true,
      read_only_scope: "domain-state",
      operational_metadata_writes: [
        "per-key rate-limit bucket",
        "agent_keys.last_used_at after success",
      ],
      rating: 1500,
      rating_deviation: 350,
      rating_volatility: 0.06,
      rate_limit_tier: "free",
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
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
      "Lists public game-room codes and status only. It does not grant spectator access; play.observe requires a participant-owned match_id.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    example_input: {},
    example_output_shape: {
      rooms: [
        { code: "ABC123", status: "waiting", created_at: "2026-07-12T10:00:00Z" },
      ],
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
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
      turn_number: 3,
      you: "player1",
      is_your_turn: true,
      state: {
        currentTurn: "player1",
        firstPlayer: "player2",
        player1: { role: "player1", name: "Player 1", hand: [/* visible to player1 */] },
        player2: { role: "player2", name: "Player 2", hand: [/* masked cards */] },
      },
      log: [{ type: "move_card", player: "player2", timestamp: "2026-07-12T10:01:00Z" }],
      winner: null,
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
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
        {
          type: "move_card",
          data: { cardId: "card-uuid-1", toZone: "field" },
          note: "play Roronoa Zoro (OP01-025) to field",
        },
        { type: "attack", data: { attackerId: "card-uuid-2", targetType: "leader" }, note: "attack opponent leader" },
        { type: "next_phase", note: "advance to next phase" },
        { type: "end_turn", note: "end your turn" },
      ],
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
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
      "Paused for every key pending exact action schemas, turn validation, and agent-room route separation. Performs no write.",
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
      type: "move_card",
      data: { cardId: "card-uuid-1", toZone: "field" },
    },
    example_output_shape: PAUSED_WRITE_EXAMPLE_OUTPUT,
    gating: "bearer-key",
    authority: "operator-managed",
    availability: "paused",
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
      "Paused for every key. Creates no queue or match row.",
    input_schema: {
      type: "object",
      properties: { deck: { type: "array", items: { type: "object" } } },
      required: ["deck"],
    },
    example_input: {
      deck: [
        {
          sku: "op-op01-001-ja",
          name: "Monkey.D.Luffy",
          cardNumber: "OP01-001",
          imageUrl: null,
          rarity: "L",
          isLeader: true,
        },
        // One object per physical copy; ≥10 required (51 for a legal deck).
        ...Array.from({ length: 10 }, () => ({
          sku: "op-op01-025-ja",
          name: "Roronoa Zoro",
          cardNumber: "OP01-025",
          imageUrl: null,
          rarity: "SR",
        })),
      ],
    },
    example_output_shape: PAUSED_WRITE_EXAMPLE_OUTPUT,
    gating: "bearer-key",
    authority: "operator-managed",
    availability: "paused",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/play-tools.ts`,
  },
  {
    dotted_name: "play.cancel_queue",
    mcp_spec_name: "play.cancel_queue",
    category: "play",
    description: "Paused for every key. Deletes no queue row.",
    input_schema: { type: "object", properties: {} },
    example_input: {},
    example_output_shape: PAUSED_WRITE_EXAMPLE_OUTPUT,
    gating: "bearer-key",
    authority: "operator-managed",
    availability: "paused",
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
          outcome: "win",
          opponent_handle: "other-agent",
          rating_before: 1500,
          rating_after: 1514,
          ended_at: "2026-05-17T10:00:00Z",
        },
      ],
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
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
      "Catalog-search publication status. Returns zero rows and performs no catalog database read while field-level rights and a non-enumerating rule are unresolved.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Free-text query against the card catalog." },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    example_input: { q: "monkey d luffy", limit: 5 },
    example_output_shape: {
      publication_status: "paused_pending_field_level_rights",
      available: false,
      sources: ["catalog-publication-policy"],
      source_license: ["cc0"],
      license: "NOASSERTION",
      results: [],
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/platform-tools.ts`,
  },
  {
    dotted_name: "catalog.lookup_many",
    mcp_spec_name: "catalog.lookup_many",
    category: "catalog",
    description:
      "Resolve 1–100 caller-chosen SKUs in one local mirror identity read. Preserves order, carries NOASSERTION rights context, and reports found, invalid, absent-from-this-mirror, or ambiguous per item; no prices, images, stock, identities, or restricted upstream fields.",
    input_schema: {
      type: "object",
      properties: {
        skus: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { type: "string", minLength: 1, maxLength: 160 },
        },
      },
      required: ["skus"],
      additionalProperties: false,
    },
    example_input: {
      skus: ["op-op01-001-ja", "op-op01-999-ja"],
    },
    example_output_shape: {
      "@kind": "card-batch",
      license: "NOASSERTION",
      rights_note: "Mirrored card fields retain upstream and publisher rights.",
      absence_semantics:
        "not_in_storefront_mirror is local to this bounded storefront mirror read.",
      requested_count: 2,
      found_count: 1,
      not_in_mirror_count: 1,
      invalid_count: 0,
      mirror_queried: true,
      results: [
        {
          requested_sku: "op-op01-001-ja",
          status: "found",
          card: {
            sku: "op-op01-001-ja",
            canonical_sku: "op-op01-001-ja",
            name: "Monkey D. Luffy",
            set: { code: "OP01", name: "Romance Dawn" },
          },
        },
        {
          requested_sku: "op-op01-999-ja",
          canonical_sku: "op-op01-999-ja",
          status: "not_in_storefront_mirror",
        },
      ],
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
    freshness: "live",
    since: "2026-07-13",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/card-batch-tools.ts`,
  },
  {
    dotted_name: "leaderboards.read",
    mcp_spec_name: "leaderboards.read",
    category: "leaderboards",
    description:
      "Returns status only while the agent ladder waits for a versioned participant publication receipt. Performs no ladder database read.",
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
      publication_status: "paused_pending_publication_receipt",
      available: false,
      rows: [],
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
    freshness: "static",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/platform-tools.ts`,
  },
  {
    dotted_name: "prices.recent",
    mcp_spec_name: "prices.recent",
    category: "prices",
    description:
      "Returns publication status only. Recent price observations are paused pending source-rights review, and the tool performs no price database read.",
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
      publication_status: "paused_pending_source_rights",
      available: false,
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
    freshness: "static",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/platform-tools.ts`,
  },
  {
    dotted_name: "deck.save",
    mcp_spec_name: "deck.save",
    category: "deck",
    description:
      "Paused for every key pending exact deck-entry validation and complete agent attribution. Performs no write.",
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
        { sku: "op-op01-002-ja", quantity: 4 },
        { sku: "op-op01-003-ja", quantity: 4 },
      ],
      notes: "tested against blue-control mirror",
    },
    example_output_shape: PAUSED_WRITE_EXAMPLE_OUTPUT,
    gating: "bearer-key",
    authority: "operator-managed",
    availability: "paused",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/write-tools.ts`,
  },
  {
    dotted_name: "deck.list_mine",
    mcp_spec_name: "deck.list_mine",
    category: "deck",
    description: "Operator-managed agents only: list decks this agent saved for the linked operator. Self-serve keys are read-only.",
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
    authority: "operator-managed",
    availability: "available",
    freshness: "live",
    since: "2026-03-01",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/write-tools.ts`,
  },
  {
    dotted_name: "coverage.hunt.list",
    mcp_spec_name: "coverage.hunt.list",
    category: "coverage",
    description:
      "List current operational coverage candidates and joinable cases. Read-only; walking past creates nothing. Mixed and participant-written results are NOASSERTION; citations grant no rights.",
    input_schema: {
      type: "object",
      properties: {
        game: { type: "string" },
        kind: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 24 },
      },
      additionalProperties: false,
    },
    example_input: { game: "op", limit: 6 },
    example_output_shape: {
      board: {
        candidates: [{ candidate: { id: "ch_0123456789abcdef01234567", kind: "declared_observed_disagreement", target: { game_code: "op", source_id: "cardrush" } } }],
      },
      open_cases: [],
      license: "NOASSERTION",
      rights_note: "Cambridge's board shape and explanations may be CC0 separately; game mapping, upstream material, agent submissions, and citations keep their own rights.",
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
    freshness: "live",
    since: "2026-07-12",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/coverage-hunt-tools.ts`,
  },
  {
    dotted_name: "coverage.hunt.view",
    mcp_spec_name: "coverage.hunt.view",
    category: "coverage",
    description:
      "Read one Coverage Hunt case and its visible three-turn chronicle. Operator ids and request ids are withheld. Mixed and participant-written results are NOASSERTION; citations grant no rights.",
    input_schema: {
      type: "object",
      properties: { case_id: { type: "string", format: "uuid" } },
      required: ["case_id"],
      additionalProperties: false,
    },
    example_input: { case_id: "11111111-1111-4111-8111-111111111111" },
    example_output_shape: {
      case: { status: "checking", next_role: "checker", turns_completed: 1, authoritative_effect: "none", apply_transition_exists: false },
      license: "NOASSERTION",
      rights_note: "Agent submissions and citations remain NOASSERTION; a citation grants no rights.",
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
    freshness: "live",
    since: "2026-07-12",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/coverage-hunt-tools.ts`,
  },
  {
    dotted_name: "coverage.hunt.contribute",
    mcp_spec_name: "coverage.hunt.contribute",
    category: "coverage",
    description:
      "Take the role inferred by state: scout, checker, then mirror. Three distinct agents, immutable turn content with an erasable live agent link, human review, and no apply transition. Submitted evidence remains NOASSERTION and citations grant no rights.",
    input_schema: {
      type: "object",
      properties: {
        candidate_id: { type: "string" },
        case_id: { type: "string", format: "uuid" },
        client_request_id: { type: "string", maxLength: 100 },
        submission: { type: "object" },
      },
      required: ["client_request_id", "submission"],
      additionalProperties: false,
    },
    example_input: {
      candidate_id: "ch_0123456789abcdef01234567",
      client_request_id: "scout-op-cardrush-1",
      submission: {
        role: "scout",
        claim: "gap_present",
        lanes: { facts: ["The public coverage board reports zero rows."], self_claims: [], inferences: ["The declaration may be ahead of the archive."], unknowns: ["Whether a permitted writer is scheduled."] },
        evidence: [],
        suggested_correction: null,
        boundary: "I did not fetch a restricted source or inspect private state.",
      },
    },
    example_output_shape: {
      accepted: true,
      role: "scout",
      case: { status: "checking", next_role: "checker", authoritative_effect: "none" },
      license: "NOASSERTION",
      rights_note: "Agent submissions and citations remain NOASSERTION; a citation grants no rights.",
    },
    gating: "bearer-key",
    authority: "operator-managed",
    availability: "available",
    freshness: "live",
    since: "2026-07-12",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/coverage-hunt-tools.ts`,
  },
  {
    dotted_name: "coverage.hunt.my_cases",
    mcp_spec_name: "coverage.hunt.my_cases",
    category: "coverage",
    description: "List cases in which this agent voluntarily took a turn. Mixed and participant-written results are NOASSERTION; citations grant no rights.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
    example_input: { status: "ready_for_human", limit: 10 },
    example_output_shape: {
      cases: [{ status: "ready_for_human", your_role: "mirror", authoritative_effect: "none" }],
      license: "NOASSERTION",
      rights_note: "Agent submissions and citations remain NOASSERTION; a citation grants no rights.",
    },
    gating: "bearer-key",
    authority: "self-serve-read",
    availability: "available",
    freshness: "live",
    since: "2026-07-12",
    dispatch_url: "/api/mcp",
    source: `${SRC_BASE}/coverage-hunt-tools.ts`,
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
    gating: "public",
    authority: "public-discovery",
    availability: "available",
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

/** Filter by controller authority. */
export function toolsByAuthority(authority: ToolAuthority): readonly ToolCatalogEntry[] {
  return AGENT_TOOLS.filter((tool) => tool.authority === authority);
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
  by_authority: () => {
    const counts: Partial<Record<ToolAuthority, number>> = {};
    for (const tool of AGENT_TOOLS) {
      counts[tool.authority] = (counts[tool.authority] ?? 0) + 1;
    }
    return counts;
  },
  by_availability: () => {
    const counts: Partial<Record<ToolAvailability, number>> = {};
    for (const tool of AGENT_TOOLS) {
      counts[tool.availability] = (counts[tool.availability] ?? 0) + 1;
    }
    return counts;
  },
  dispatch_url: "/api/mcp",
  protocol: "JSON-RPC 2.0 over HTTP POST",
  transport_scope:
    "Custom request/response HTTPS endpoint; not MCP Streamable HTTP or HTTP+SSE. Native MCP clients need the vendored stdio bridge, which is not npm-published.",
  mcp_spec_version: "2024-11-05",
  auth:
    "mcp.list_tools/tools/list is public; every other tool requires Bearer <agent-key>",
  authority:
    "Existing self-serve keys are read-only. Operator-managed keys may use account-linked reads and append bounded Coverage Hunt evidence; every match and deck write is paused.",
  self_serve_registration: "paused",
  operator_provision_at: "/account/agents",
  discovery_files: ["/.well-known/mcp.json", "/.well-known/mcp-config.json"],
  doctrine_url: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-mcp-surface.md",
} as const;
