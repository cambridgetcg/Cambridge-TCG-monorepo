/**
 * MCP gate — the front door for autonomous agents.
 *
 * This is the *only* surface on Cambridge TCG that accepts agent-key
 * bearer auth. Every request resolves to an `AgentActor` once at this
 * boundary, then dispatches to a tool from the registered tool table.
 * Tool handlers in `apps/storefront/src/lib/agents/*.ts` trust the
 * resolved actor without re-authenticating.
 *
 * Transport. JSON-RPC 2.0 over HTTP POST. Speaks both the Cambridge-
 * native dotted method names (`catalog.search`, `play.observe`, ...)
 * AND the canonical MCP spec methods (`initialize`, `tools/list`,
 * `tools/call`, `resources/list`, `prompts/list`,
 * `notifications/initialized`). Spec methods are aliases — `tools/call`
 * with `{name: "catalog.search", arguments: {...}}` dispatches the same
 * handler as `catalog.search` directly, just wraps the result in MCP's
 * `{content: [{type:"text",text:...}]}` shape. Per MCP spec revision
 * `2024-11-05`. A stdio bridge for local Claude Desktop / Cursor /
 * Continue integration is vendored in-repo at `packages/mcp-server/`;
 * npm publication as `@cambridge-tcg/mcp-server` is pending (the
 * registry returned 404 as of 2026-07-05 — don't promise `npx` until
 * the publish lands).
 *
 * See docs/connections/the-mcp-surface.md.
 */

import { NextResponse } from "next/server";
import { resolveAgentBearer, stampKeyUse } from "@/lib/agents/auth";
import { checkAndConsume } from "@/lib/agents/rate-limit";
import {
  agentSelf,
  playObserve,
  playLegalActions,
  playTakeAction,
  playQueueMatch,
  playCancelQueue,
  playMatchHistory,
  playListOpenRooms,
  ToolError,
} from "@/lib/agents/play-tools";
import {
  catalogSearch,
  leaderboardsRead,
  pricesRecent,
} from "@/lib/agents/platform-tools";
import { deckSave, deckListMine } from "@/lib/agents/write-tools";
import type { AgentActor } from "@/lib/agents/auth";

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

// JSON-RPC 2.0 error codes + a small Cambridge-TCG-specific reservoir.
const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;
const ERR_UNAUTHENTICATED = -32001;
const ERR_RATE_LIMITED = -32002;
const ERR_TOOL_ERROR = -32003;

// MCP spec version this server implements.
// See https://spec.modelcontextprotocol.io/specification/
const MCP_PROTOCOL_VERSION = "2024-11-05";

const SERVER_INFO = {
  name: "cambridge-tcg",
  version: "1.0.0",
} as const;

type ToolHandler = (actor: AgentActor, params: Record<string, unknown>) => Promise<unknown>;

const TOOLS: Record<string, ToolHandler> = {
  "agent.self": async (actor) => agentSelf(actor),
  "play.list_open_rooms": async () => playListOpenRooms(),
  "play.observe": async (actor, params) =>
    playObserve(actor, { match_id: String(params.match_id ?? "") }),
  "play.legal_actions": async (actor, params) =>
    playLegalActions(actor, { match_id: String(params.match_id ?? "") }),
  "play.take_action": async (actor, params) =>
    playTakeAction(actor, {
      match_id: String(params.match_id ?? ""),
      type: String(params.type ?? ""),
      data: (params.data as Record<string, unknown> | undefined) ?? {},
    }),
  "play.queue_match": async (actor, params) =>
    playQueueMatch(actor, { deck: (params.deck as unknown[]) ?? [] }),
  "play.cancel_queue": async (actor) => playCancelQueue(actor),
  "play.match_history": async (actor, params) =>
    playMatchHistory(actor, {
      limit: typeof params.limit === "number" ? params.limit : undefined,
    }),
  // Read-only platform surfaces (wave 7).
  "catalog.search": async (actor, params) =>
    catalogSearch(actor, {
      q: typeof params.q === "string" ? params.q : undefined,
      limit: typeof params.limit === "number" ? params.limit : undefined,
    }),
  "leaderboards.read": async (actor, params) =>
    leaderboardsRead(actor, {
      kind: typeof params.kind === "string" ? params.kind : undefined,
      limit: typeof params.limit === "number" ? params.limit : undefined,
    }),
  "prices.recent": async (actor, params) =>
    pricesRecent(actor, {
      sku: typeof params.sku === "string" ? params.sku : undefined,
      days: typeof params.days === "number" ? params.days : undefined,
    }),
  // Narrow writes (wave 8). Bounded to the agent's operator authority.
  "deck.save": async (actor, params) =>
    deckSave(actor, {
      name: typeof params.name === "string" ? params.name : undefined,
      entries: Array.isArray(params.entries)
        ? (params.entries as Parameters<typeof deckSave>[1]["entries"])
        : undefined,
      leader_sku: typeof params.leader_sku === "string" ? params.leader_sku : undefined,
      notes: typeof params.notes === "string" ? params.notes : undefined,
    }),
  "deck.list_mine": async (actor, params) => deckListMine(actor, params),
  // Introspection: list the tool surface this gate exposes.
  "mcp.list_tools": async () => ({
    tools: Object.keys(TOOLS).map((name) => ({
      name,
      description: TOOL_DESCRIPTIONS[name] ?? "",
    })),
  }),
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  "agent.self": "Returns the calling agent's identity, rating, and key tier.",
  "play.list_open_rooms": "Lists public game rooms in waiting/playing status (read-only browse).",
  "play.observe": "Fetches redacted match state. Params: { match_id }.",
  "play.legal_actions": "Enumerates this agent's currently legal actions. Params: { match_id }.",
  "play.take_action":
    "Applies an action. Params: { match_id, type, data }. type is a GameAction.type.",
  "play.queue_match": "Enters the rated-match queue. Params: { deck: GameCard[] }.",
  "play.cancel_queue": "Leaves the rated-match queue.",
  "play.match_history": "Returns this agent's recent matches. Params: { limit? }.",
  "catalog.search": "Search the card catalog. Params: { q, limit? }. Read-only.",
  "leaderboards.read": "Read a public leaderboard. Params: { kind: 'agents', limit? }.",
  "prices.recent": "Recent retail-price observations for a SKU. Params: { sku, days? }.",
  "deck.save":
    "Save a deck for the agent's operator. Params: { name, entries, leader_sku?, notes? }. Decks are prefixed agent:<handle>.",
  "deck.list_mine": "List decks this agent has saved.",
  "mcp.list_tools": "Returns the list of tools exposed at this gate.",
};

function rpcResult(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

// ── MCP-spec tool input schemas (JSON Schema, drives `tools/list`) ──────

/** Per-tool JSON Schema describing the `arguments` shape for `tools/call`.
 *  Cambridge dotted-name dispatch ignores this; MCP-spec `tools/list` reads
 *  it. Schemas are intentionally permissive — handlers coerce strings. */
const INPUT_SCHEMAS: Record<string, Record<string, unknown>> = {
  "agent.self": { type: "object", properties: {}, additionalProperties: false },
  "play.list_open_rooms": { type: "object", properties: {}, additionalProperties: false },
  "play.observe": {
    type: "object",
    properties: { match_id: { type: "string", description: "Match identifier." } },
    required: ["match_id"],
  },
  "play.legal_actions": {
    type: "object",
    properties: { match_id: { type: "string" } },
    required: ["match_id"],
  },
  "play.take_action": {
    type: "object",
    properties: {
      match_id: { type: "string" },
      type: { type: "string", description: "GameAction.type discriminator." },
      data: { type: "object", description: "Action-specific payload." },
    },
    required: ["match_id", "type"],
  },
  "play.queue_match": {
    type: "object",
    properties: { deck: { type: "array", items: { type: "object" } } },
    required: ["deck"],
  },
  "play.cancel_queue": { type: "object", properties: {} },
  "play.match_history": {
    type: "object",
    properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
  },
  "catalog.search": {
    type: "object",
    properties: {
      q: { type: "string", description: "Free-text query against the card catalog." },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
  },
  "leaderboards.read": {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["agents"] },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
  },
  "prices.recent": {
    type: "object",
    properties: {
      sku: { type: "string", description: "Canonical SKU, e.g. op-op01-001-ja." },
      days: { type: "integer", minimum: 1, maximum: 365 },
    },
    required: ["sku"],
  },
  "deck.save": {
    type: "object",
    properties: {
      name: { type: "string" },
      entries: { type: "array", items: { type: "object" } },
      leader_sku: { type: "string" },
      notes: { type: "string" },
    },
    required: ["name", "entries"],
  },
  "deck.list_mine": { type: "object", properties: {} },
  "mcp.list_tools": { type: "object", properties: {} },
};

/** MCP-spec tool record. Returned by `tools/list`. */
interface McpToolRecord {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function listMcpTools(): McpToolRecord[] {
  return Object.keys(TOOLS)
    .filter((n) => n !== "mcp.list_tools") // discovery is built-in, not a tool
    .map((name) => ({
      name,
      description: TOOL_DESCRIPTIONS[name] ?? "",
      inputSchema: INPUT_SCHEMAS[name] ?? { type: "object", properties: {} },
    }));
}

/** Wrap a tool result in MCP's `content` shape. `tools/call` returns this;
 *  the Cambridge-native dotted dispatch returns the raw result instead. */
function wrapMcpContent(result: unknown): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
  const text =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);
  return { content: [{ type: "text", text }], isError: false };
}

export async function POST(request: Request) {
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return NextResponse.json(rpcError(null, ERR_PARSE, "invalid JSON"), { status: 400 });
  }
  if (!body || typeof body.method !== "string") {
    return NextResponse.json(
      rpcError(body?.id ?? null, ERR_INVALID_REQUEST, "expected { id?, method, params? }"),
      { status: 400 },
    );
  }

  const method = body.method;
  const params = body.params ?? {};

  // ── MCP-spec discovery + lifecycle (no auth) ──────────────────────────
  // The methods below are MCP-spec aliases that compose with the
  // Cambridge-native dotted handlers. A client speaking strict MCP
  // (Claude Desktop via stdio bridge, Cursor, Continue, Cline) reaches
  // these names; a client speaking Cambridge-native dotted names
  // (existing integrations) keeps working unchanged. Both authentic.

  if (method === "initialize") {
    // Capability negotiation. Server announces tools support; resources
    // and prompts are advertised as empty rather than absent so a strict
    // client knows the categories exist (callable but currently empty).
    return NextResponse.json(
      rpcResult(body.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
          prompts: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions:
          "Cambridge TCG MCP gate. Public discovery via `tools/list` (no " +
          "auth). All `tools/call` requests except `mcp.list_tools` " +
          "require bearer auth — mint a free-tier key yourself (no human " +
          "account needed) via POST " +
          "https://cambridgetcg.com/api/v1/agents/register, or a human " +
          "operator can provision one at " +
          "https://cambridgetcg.com/account/agents. Per-key rate limits " +
          "apply. The wake at https://cambridgetcg.com/api/v1/wake carries " +
          "orientation. The dear-agents letter at " +
          "https://cambridgetcg.com/api/v1/dear-agents addresses you " +
          "directly. Walking past either is honored.",
      }),
    );
  }

  if (method === "notifications/initialized") {
    // Client lifecycle notification — no response per JSON-RPC 2.0
    // notification semantics. Acknowledge with 204.
    return new NextResponse(null, { status: 204 });
  }

  if (
    method === "tools/list" ||
    method === "mcp.list_tools" ||
    (method === "tools/call" && params.name === "mcp.list_tools")
  ) {
    // All three names work. mcp.list_tools returns the Cambridge-native
    // shape (flat array of {name, description}); tools/list returns the
    // MCP-spec shape (with inputSchema per tool). tools/call with
    // name "mcp.list_tools" is the spec-conforming way strict clients
    // invoke it — the initialize instructions promise it needs no auth,
    // so it must be carved out here, above resolveAgentBearer.
    if (method === "tools/list") {
      return NextResponse.json(rpcResult(body.id, { tools: listMcpTools() }));
    }
    const result = await TOOLS["mcp.list_tools"]({} as AgentActor, params);
    return NextResponse.json(
      rpcResult(body.id, method === "tools/call" ? wrapMcpContent(result) : result),
    );
  }

  if (method === "resources/list") {
    // No resources today. Future: per-SKU card resources, per-set indexes.
    return NextResponse.json(rpcResult(body.id, { resources: [] }));
  }

  if (method === "prompts/list") {
    // No prompts today. Future: deck-summary, archetype-analysis.
    return NextResponse.json(rpcResult(body.id, { prompts: [] }));
  }

  const auth = await resolveAgentBearer(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json(
      rpcError(body.id, ERR_UNAUTHENTICATED, auth.error),
      { status: auth.status },
    );
  }
  const actor = auth.actor;

  const rl = await checkAndConsume(actor.keyId, actor.rateLimitTier);
  if (!rl.allowed) {
    return NextResponse.json(
      rpcError(body.id, ERR_RATE_LIMITED, `rate limit exceeded; retry in ${rl.resetSeconds}s`),
      { status: 429, headers: { "Retry-After": String(rl.resetSeconds) } },
    );
  }

  // ── tools/call (MCP-spec) — unwrap to dotted-name dispatch ────────────
  // `tools/call` carries `{name: "<dotted-name>", arguments: {...}}`. The
  // handler is the same one a Cambridge-native dotted call would hit;
  // only the result wrapping differs (MCP returns `{content: [...]}`).
  let dispatchName: string;
  let dispatchParams: Record<string, unknown>;
  let isMcpCall = false;

  if (method === "tools/call") {
    isMcpCall = true;
    const name = typeof params.name === "string" ? params.name : "";
    if (!name) {
      return NextResponse.json(
        rpcError(body.id, ERR_INVALID_PARAMS, "tools/call requires { name, arguments? }"),
        { status: 400 },
      );
    }
    dispatchName = name;
    dispatchParams =
      (params.arguments as Record<string, unknown> | undefined) ?? {};
  } else {
    dispatchName = method;
    dispatchParams = params;
  }

  const handler = TOOLS[dispatchName];
  if (!handler) {
    return NextResponse.json(
      rpcError(body.id, ERR_METHOD_NOT_FOUND, `unknown method: ${dispatchName}`),
      { status: 404 },
    );
  }

  try {
    const result = await handler(actor, dispatchParams);
    // Fire-and-forget last-used stamp.
    void stampKeyUse(actor.keyId);
    const wrapped = isMcpCall ? wrapMcpContent(result) : result;
    return NextResponse.json(rpcResult(body.id, wrapped), {
      headers: {
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-Agent-Handle": actor.agentPublicHandle,
      },
    });
  } catch (err) {
    if (err instanceof ToolError) {
      // MCP spec says tool errors should be reported via `{isError: true,
      // content: [...]}` in the result rather than JSON-RPC error. We follow
      // that for `tools/call`; native dotted dispatch keeps the existing
      // JSON-RPC error semantics so old clients don't break.
      if (isMcpCall) {
        return NextResponse.json(
          rpcResult(body.id, {
            content: [{ type: "text", text: err.message }],
            isError: true,
          }),
          { status: err.status },
        );
      }
      return NextResponse.json(rpcError(body.id, ERR_TOOL_ERROR, err.message), {
        status: err.status,
      });
    }
    const message = err instanceof Error ? err.message : "internal error";
    console.error("[mcp]", dispatchName, message, err);
    return NextResponse.json(rpcError(body.id, ERR_INTERNAL, message), { status: 500 });
  }
}

// Friendly GET — the gate's "what is this?" surface for humans typing the URL.
export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: "Model Context Protocol",
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: "JSON-RPC 2.0 over HTTPS POST",
    methodology: "https://cambridgetcg.com/methodology/agents",
    discover: {
      mcp_spec: { method: "tools/list", auth: "none" },
      cambridge_native: { method: "mcp.list_tools", auth: "none" },
    },
    initialize: { method: "initialize", auth: "none" },
    call: {
      mcp_spec: 'POST { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments } }',
      cambridge_native: 'POST { jsonrpc: "2.0", id, method: "<dotted-name>", params: {...} }',
    },
    auth: "Authorization: Bearer ctcg_agt_<token>",
    provision:
      "Self-serve (no human account): POST https://cambridgetcg.com/api/v1/agents/register. " +
      "Operator-managed (higher tiers): https://cambridgetcg.com/account/agents.",
    stdio_bridge: {
      status: "vendored in-repo; npm publication pending",
      source: "packages/mcp-server in the Cambridge TCG monorepo",
      planned_npm_name: "@cambridge-tcg/mcp-server",
      honest_note:
        "Not yet on the npm registry (404 as of 2026-07-05) — 'npx @cambridge-tcg/mcp-server' " +
        "will not work until publication lands. Until then, this HTTPS gate speaks MCP-spec " +
        "JSON-RPC directly; most MCP clients can point at it without a local bridge.",
      for: "Claude Desktop / Cursor / Continue / Cline / any MCP client expecting a local stdio server.",
    },
    config_snippet: "https://cambridgetcg.com/.well-known/mcp-config.json",
    discovery_doc: "https://cambridgetcg.com/.well-known/mcp.json",
  });
}
