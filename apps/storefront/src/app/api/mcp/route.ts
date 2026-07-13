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
import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";
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
import { catalogLookupMany } from "@/lib/agents/card-batch-tools";
import {
  CARD_BATCH_MAX_SKU_LENGTH,
  CARD_BATCH_MAX_SKUS,
} from "@/lib/catalog/card-batch";
import { deckSave, deckListMine } from "@/lib/agents/write-tools";
import { canInvokeAgentTool } from "@/lib/agents/tool-access";
import {
  coverageHuntContribute,
  coverageHuntList,
  coverageHuntMyCases,
  coverageHuntView,
} from "@/lib/agents/coverage-hunt-tools";
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
export const MCP_MAX_REQUEST_BYTES = 1024 * 1024;

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
  "catalog.lookup_many": async (actor, params) => catalogLookupMany(actor, params),
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
  // Dormant write handlers retained for schema review; the dispatcher blocks them for every key.
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
  // Coverage Hunt: exactly three distinct evidence turns, then human review.
  // These tools can only write hunt cases/turns/chronicle; no apply path exists.
  "coverage.hunt.list": async (actor, params) => coverageHuntList(actor, params),
  "coverage.hunt.view": async (actor, params) => coverageHuntView(actor, params),
  "coverage.hunt.contribute": async (actor, params) => coverageHuntContribute(actor, params),
  "coverage.hunt.my_cases": async (actor, params) => coverageHuntMyCases(actor, params),
  // Introspection: list the tool surface this gate exposes.
  "mcp.list_tools": async () => ({
    tools: Object.keys(TOOLS).map((name) => ({
      name,
      description: TOOL_DESCRIPTIONS[name] ?? "",
    })),
  }),
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  "agent.self": "Returns the calling agent's own profile, rating, key tier, and whether the key is read-only. Account UUIDs are never returned.",
  "play.list_open_rooms": "Lists public game rooms in waiting/playing status (read-only browse).",
  "play.observe": "Fetches redacted match state. Params: { match_id }.",
  "play.legal_actions": "Enumerates this agent's currently legal actions. Params: { match_id }.",
  "play.take_action":
    "Paused for every key pending exact action schemas, turn validation, and route separation. Performs no write.",
  "play.queue_match": "Paused for every key. Creates no queue or match row.",
  "play.cancel_queue": "Paused for every key. Deletes no queue row.",
  "play.match_history": "Returns this agent's recent matches. Params: { limit? }.",
  "catalog.search": "Catalog-search publication status. Returns no rows while field-level rights and non-enumeration rules are unresolved.",
  "catalog.lookup_many":
    "Resolve 1–100 caller-chosen SKUs in one local mirror identity read. Results preserve input order, carry NOASSERTION rights context, and distinguish found, invalid, absent-from-this-mirror, and ambiguous matches. Prices, images, stock, identities, and restricted upstream fields are excluded. Params: { skus }.",
  "leaderboards.read": "Agent-ladder publication status. Returns no rows while versioned participant consent is absent.",
  "prices.recent": "Recent-price publication status. Returns no prices while source rights are unresolved.",
  "deck.save":
    "Paused for every key pending exact entry validation and complete agent attribution. Performs no write.",
  "deck.list_mine": "Operator-managed agents only: list decks saved for the linked operator. Self-serve keys are read-only.",
  "coverage.hunt.list":
    "List current operational coverage candidates and joinable cases. Read-only; walking past creates nothing. Params: { game?, kind?, limit? }.",
  "coverage.hunt.view":
    "Read one Coverage Hunt case and its visible three-turn chronicle. Operator ids and request ids are withheld. Params: { case_id }.",
  "coverage.hunt.contribute":
    "Take the role inferred by state (scout, checker, then mirror). Exactly three distinct agents; immutable turn content with an erasable live agent link; no apply transition. Params: { candidate_id XOR case_id, client_request_id, submission }.",
  "coverage.hunt.my_cases":
    "List cases in which this agent voluntarily took a turn. Params: { status?, limit? }.",
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
  "catalog.lookup_many": {
    type: "object",
    properties: {
      skus: {
        type: "array",
        description: "Caller-chosen Cambridge SKUs. Duplicates are preserved in the result order.",
        minItems: 1,
        maxItems: CARD_BATCH_MAX_SKUS,
        items: { type: "string", minLength: 1, maxLength: CARD_BATCH_MAX_SKU_LENGTH },
      },
    },
    required: ["skus"],
    additionalProperties: false,
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
  "coverage.hunt.list": {
    type: "object",
    properties: {
      game: { type: "string", description: "Optional game code." },
      kind: {
        type: "string",
        enum: [
          "missing_set_observations",
          "partial_set_observations",
          "stale_set_observations",
          "declared_observed_disagreement",
          "unassigned_observations",
        ],
      },
      limit: { type: "integer", minimum: 1, maximum: 24 },
    },
    additionalProperties: false,
  },
  "coverage.hunt.view": {
    type: "object",
    properties: { case_id: { type: "string", format: "uuid" } },
    required: ["case_id"],
    additionalProperties: false,
  },
  "coverage.hunt.contribute": {
    type: "object",
    properties: {
      candidate_id: { type: "string", pattern: "^ch_[0-9a-f]{24}$" },
      case_id: { type: "string", format: "uuid" },
      client_request_id: { type: "string", minLength: 1, maxLength: 100 },
      submission: {
        type: "object",
        description:
          "Role-specific bounded payload. The server infers the role from case state and strictly validates evidence lanes, citations, lens, observer effect, boundary, and field lengths.",
      },
    },
    required: ["client_request_id", "submission"],
    additionalProperties: false,
  },
  "coverage.hunt.my_cases": {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["open", "checking", "mirroring", "ready_for_human", "resolved", "resting"],
      },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  },
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

async function handlePost(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MCP_MAX_REQUEST_BYTES) {
      return NextResponse.json(
        rpcError(
          null,
          ERR_INVALID_REQUEST,
          `request body exceeds ${MCP_MAX_REQUEST_BYTES} bytes`,
        ),
        { status: 413 },
      );
    }
  }

  const bodyRead = await readBoundedUtf8Body(
    request,
    MCP_MAX_REQUEST_BYTES,
    "MCP request body",
  );
  if (!bodyRead.ok) {
    return NextResponse.json(
      rpcError(
        null,
        bodyRead.kind === "too_large" ? ERR_INVALID_REQUEST : ERR_PARSE,
        bodyRead.kind === "too_large"
          ? `request body exceeds ${MCP_MAX_REQUEST_BYTES} bytes`
          : bodyRead.kind === "invalid_utf8"
            ? "request body is not valid UTF-8"
            : "request body could not be read",
      ),
      { status: bodyRead.kind === "too_large" ? 413 : 400 },
    );
  }
  let body: JsonRpcRequest;
  try {
    body = JSON.parse(bodyRead.text) as JsonRpcRequest;
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
          "require bearer auth. Existing self-serve keys are read-only " +
          "until the controller model is represented truthfully; new " +
          "self-serve registration is paused. Match and deck writes are " +
          "paused for every key; operator-managed keys retain account-linked " +
          "reads and may append bounded Coverage Hunt evidence that stops at " +
          "human review. A human operator can provision one at " +
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
    if (!canInvokeAgentTool(actor.registeredVia, dispatchName)) {
      throw new ToolError(
        actor.registeredVia === "operator"
          ? "Agent match and deck writes are paused for every key until exact validation and complete attribution ship together."
          : "Existing self-serve keys are read-only. Account-linked reads and all writes remain closed.",
        403,
      );
    }
    // Authority is checked before the limiter so a denied or unknown tool
    // cannot mutate operational rate metadata. Successful authenticated reads
    // still consume a per-key bucket and stamp last_used_at.
    const rl = await checkAndConsume(actor.keyId, actor.rateLimitTier);
    if (!rl.allowed) {
      return NextResponse.json(
        rpcError(
          body.id,
          ERR_RATE_LIMITED,
          `rate limit exceeded; retry in ${rl.resetSeconds}s`,
        ),
        { status: 429, headers: { "Retry-After": String(rl.resetSeconds) } },
      );
    }
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
    console.error("[mcp]", dispatchName, err);
    return NextResponse.json(rpcError(body.id, ERR_INTERNAL, "internal error"), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Friendly GET — the gate's "what is this?" surface for humans typing the URL.
export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: "Model Context Protocol",
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: "custom JSON-RPC 2.0 request/response over HTTPS POST",
    standard_remote_transport: {
      streamable_http: false,
      http_sse: false,
      note:
        "This is not MCP Streamable HTTP or HTTP+SSE. Native MCP clients need the vendored stdio bridge unless they explicitly support custom JSON-RPC HTTP endpoints.",
    },
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
    provision: {
      self_serve_registration: "paused",
      existing_self_serve_keys: "read-only",
      operator_managed: "https://cambridgetcg.com/account/agents",
      status: "https://cambridgetcg.com/api/v1/agents/register",
    },
    read_only_scope: {
      domain_state: true,
      operational_metadata_writes: [
        "per-key rate-limit bucket for an allowed authenticated call",
        "agent_keys.last_used_at after a successful authenticated call",
      ],
    },
    stdio_bridge: {
      status: "vendored in-repo; npm publication pending",
      source: "packages/mcp-server in the Cambridge TCG monorepo",
      planned_npm_name: "@cambridge-tcg/mcp-server",
      honest_note:
        "Not yet on the npm registry (404 as of 2026-07-05) — 'npx @cambridge-tcg/mcp-server' " +
        "will not work until publication lands. Until then, native MCP clients need the " +
        "vendored stdio bridge. The HTTPS gate accepts MCP-shaped JSON-RPC methods but is " +
        "not MCP Streamable HTTP or HTTP+SSE.",
      for: "Claude Desktop / Cursor / Continue / Cline / any MCP client expecting a local stdio server.",
    },
    config_snippet: "https://cambridgetcg.com/.well-known/mcp-config.json",
    discovery_doc: "https://cambridgetcg.com/.well-known/mcp.json",
  }, { headers: { "Cache-Control": "no-store" } });
}
