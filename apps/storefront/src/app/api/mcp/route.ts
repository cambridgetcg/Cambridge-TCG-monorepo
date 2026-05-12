/**
 * MCP gate — the front door for autonomous agents.
 *
 * This is the *only* surface on Cambridge TCG that accepts agent-key
 * bearer auth. Every request resolves to an `AgentActor` once at this
 * boundary, then dispatches to a tool from the registered tool table.
 * Tool handlers in `apps/storefront/src/lib/agents/*.ts` trust the
 * resolved actor without re-authenticating.
 *
 * Transport. The protocol is JSON-RPC-shaped (single POST endpoint,
 * `{ id, method, params }` body, `{ id, result | error }` response) and
 * compatible with MCP semantics, but does not yet do MCP's full session
 * negotiation. Full MCP over stdio/SSE is a wave-3 concern; HTTP+JSON
 * gives 90% of the value with 10% of the spec.
 *
 * See docs/connections/the-agent-surface.md.
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
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
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
  return { id: id ?? null, result };
}

function rpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
): JsonRpcResponse {
  return { id: id ?? null, error: { code, message } };
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

  // mcp.list_tools is callable without auth — it's the discovery surface.
  if (method === "mcp.list_tools") {
    const result = await TOOLS[method]({} as AgentActor, params);
    return NextResponse.json(rpcResult(body.id, result));
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

  const handler = TOOLS[method];
  if (!handler) {
    return NextResponse.json(
      rpcError(body.id, ERR_METHOD_NOT_FOUND, `unknown method: ${method}`),
      { status: 404 },
    );
  }

  try {
    const result = await handler(actor, params);
    // Fire-and-forget last-used stamp.
    void stampKeyUse(actor.keyId);
    return NextResponse.json(rpcResult(body.id, result), {
      headers: {
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-Agent-Handle": actor.agentPublicHandle,
      },
    });
  } catch (err) {
    if (err instanceof ToolError) {
      return NextResponse.json(rpcError(body.id, ERR_TOOL_ERROR, err.message), {
        status: err.status,
      });
    }
    const message = err instanceof Error ? err.message : "internal error";
    console.error("[mcp]", method, message, err);
    return NextResponse.json(rpcError(body.id, ERR_INTERNAL, message), { status: 500 });
  }
}

// Friendly GET — the gate's "what is this?" surface for humans typing the URL.
export async function GET() {
  return NextResponse.json({
    name: "Cambridge TCG MCP gate",
    version: "0.1",
    transport: "JSON-RPC-shaped HTTP POST",
    methodology: "https://cambridgetcg.com/methodology/agents",
    discover: { method: "mcp.list_tools", auth: "none" },
    auth: "Authorization: Bearer ctcg_agt_<token>",
  });
}
