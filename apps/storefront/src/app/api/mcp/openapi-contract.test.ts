import { beforeEach, describe, expect, it, vi } from "vitest";

// The gate runs for real here: the bearer parser, the key lookup and the
// refusal builders. Only the database, the rate limiter and the tool
// handlers are replaced, so each answer below is what /api/openapi.json
// promises a client will see.
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  checkAndConsume: vi.fn(),
  agentSelf: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: vi.fn() }));
vi.mock("@/lib/agents/rate-limit", () => ({ checkAndConsume: mocks.checkAndConsume }));
vi.mock("@/lib/agents/play-tools", () => {
  class ToolError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  }
  return {
    ToolError,
    agentSelf: mocks.agentSelf,
    playObserve: vi.fn(),
    playLegalActions: vi.fn(),
    playTakeAction: vi.fn(),
    playQueueMatch: vi.fn(),
    playCancelQueue: vi.fn(),
    playMatchHistory: vi.fn(),
    playListOpenRooms: vi.fn(),
  };
});
vi.mock("@/lib/agents/platform-tools", () => ({
  catalogSearch: vi.fn(),
  leaderboardsRead: vi.fn(),
  pricesRecent: vi.fn(),
}));
vi.mock("@/lib/agents/write-tools", () => ({ deckSave: vi.fn(), deckListMine: vi.fn() }));
vi.mock("@/lib/agents/card-batch-tools", () => ({ catalogLookupMany: vi.fn() }));
vi.mock("@/lib/agents/coverage-hunt-tools", () => ({
  coverageHuntContribute: vi.fn(),
  coverageHuntList: vi.fn(),
  coverageHuntMyCases: vi.fn(),
  coverageHuntView: vi.fn(),
}));

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { isAgentToken, parseAgentBearer } from "@/lib/agents/auth";
import {
  authRefusal,
  authUnavailableRefusal,
  MCP_REFUSAL_META_KEY,
  rateLimitedRefusal,
  toolNotPermittedRefusal,
  type AgentRefusal,
} from "@/lib/agents/refusals";
import { MCP_MAX_REQUEST_BYTES, POST } from "./route";

// Built at runtime so no literal key-shaped string sits in the repository.
const AGENT_TOKEN = "ctcg_agt_" + "Ab1".repeat(7) + "Z";

type JsonSchema = {
  required?: string[];
  properties: Record<string, JsonSchema & { enum?: string[]; const?: unknown }>;
  items?: JsonSchema;
};

async function spec() {
  return (await getOpenApi()).json();
}

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    key_id: "key-1",
    rate_limit_tier: "free",
    agent_id: "agent-1",
    public_handle: "agent-one",
    operated_by_user_id: "user-1",
    registered_via: "operator",
    agent_status: "active",
    suspended_at: null,
    ...overrides,
  };
}

function request(method: string, params: Record<string, unknown> = {}, authorization?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization !== undefined) headers.authorization = authorization;
  return new Request("https://cambridgetcg.example/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

/** The refusal fits the documented AgentRefusal: no undocumented field, every
 *  required one, a documented reason and action, terminal XOR next actions. */
function expectDocumentedRefusal(refusal: AgentRefusal, schema: JsonSchema) {
  for (const key of Object.keys(refusal)) expect(schema.properties, key).toHaveProperty(key);
  for (const key of schema.required ?? []) expect(refusal, key).toHaveProperty(key);
  expect(schema.properties.reason_code.enum).toContain(refusal.reason_code);
  expect(refusal.next_actions.length === 0).toBe(refusal.terminal);
  const action = schema.properties.next_actions.items!;
  for (const next of refusal.next_actions) {
    for (const key of Object.keys(next)) expect(action.properties, key).toHaveProperty(key);
    expect(action.properties.action.enum).toContain(next.action);
    expect(next.optional).toBe(action.properties.optional.const);
  }
  for (const exit of refusal.exit_paths ?? []) {
    expect(exit.tool).toBe(schema.properties.exit_paths.items!.properties.tool.const);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.checkAndConsume.mockResolvedValue({ allowed: true, remaining: 29, resetSeconds: 41 });
  mocks.agentSelf.mockResolvedValue({ public_handle: "agent-one" });
});

describe("OpenAPI describes the agent key", () => {
  it("declares AgentKey with the shape the gate parses, and keeps discovery public", async () => {
    const document = await spec();
    const scheme = document.components.securitySchemes.AgentKey;
    expect(scheme).toMatchObject({ type: "http", scheme: "bearer" });
    expect(scheme["x-provisioning"]).toBe("https://cambridgetcg.com/account/agents");

    const pattern = new RegExp(scheme["x-token-pattern"]);
    for (const token of [
      AGENT_TOKEN,
      "ctcg_agt_" + "a".repeat(22),
      "ctcg_agt_" + "a".repeat(21),
      "ctcg_agt_" + "a".repeat(23),
      "ctcg_agt_" + "a".repeat(21) + "_",
      "ctcg_agt_" + "a".repeat(21) + "-",
      "CTCG_AGT_" + "a".repeat(22),
      "ctcg_member_" + "a".repeat(43),
    ]) {
      expect(pattern.test(token), token.length.toString()).toBe(isAgentToken(token));
    }
    expect(parseAgentBearer("bearer " + AGENT_TOKEN)).toEqual({ kind: "token", token: AGENT_TOKEN });

    const post = document.paths["/api/mcp"].post;
    expect(post.security).toEqual([{}, { AgentKey: [] }]);
    expect(post["x-max-request-bytes"]).toBe(MCP_MAX_REQUEST_BYTES);
    expect(post.description).not.toContain("read/status tools only");
    // The member data key scheme stays its own realm.
    expect(document.components.securitySchemes.MemberDataKey.description).toContain("agent key");
  });

  it("documents every refusal the gate can build, and no other", async () => {
    const schema: JsonSchema = (await spec()).components.schemas.AgentRefusal;
    const built = [
      authRefusal({ ok: false, status: 401, reason_code: "missing_credentials", error: "" }),
      authRefusal({ ok: false, status: 401, reason_code: "malformed_credentials", error: "" }),
      authRefusal({ ok: false, status: 401, reason_code: "unknown_or_revoked_key", error: "" }),
      authRefusal({
        ok: false,
        status: 403,
        reason_code: "agent_suspended",
        error: "",
        suspended_at: "2026-10-29T12:00:00.000Z",
      }),
      authRefusal({ ok: false, status: 403, reason_code: "agent_archived", error: "" }),
      toolNotPermittedRefusal(),
      rateLimitedRefusal(7),
      authUnavailableRefusal(),
    ];
    for (const refusal of built) expectDocumentedRefusal(refusal, schema);
    expect([...schema.properties.reason_code.enum!].sort()).toEqual(
      built.map((refusal) => refusal.reason_code).sort(),
    );
    const exits = built.filter((refusal) => refusal.exit_paths).map((r) => r.reason_code);
    expect(exits).toEqual(["agent_suspended", "agent_archived"]);
  });
});

describe("the gate answers with the statuses and carriers OpenAPI lists", () => {
  async function documented() {
    const document = await spec();
    return {
      responses: document.paths["/api/mcp"].post.responses as Record<string, { headers?: Record<string, unknown> }>,
      refusal: document.components.schemas.AgentRefusal as JsonSchema,
    };
  }

  it("serves discovery without a key, under the empty security alternative", async () => {
    const { responses } = await documented();
    for (const method of ["initialize", "tools/list", "resources/list", "prompts/list"]) {
      const response = await POST(request(method));
      expect(response.status, method).toBe(200);
      expect(responses).toHaveProperty("200");
    }
    expect((await POST(request("notifications/initialized"))).status).toBe(204);
    expect(responses).toHaveProperty("204");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("answers missing, malformed and unknown keys with a documented 401 and challenge", async () => {
    const { responses, refusal } = await documented();
    expect(responses["401"].headers).toHaveProperty("WWW-Authenticate");
    const cases: Array<[string | undefined, string, string]> = [
      [undefined, "missing_credentials", 'Bearer realm="cambridgetcg-mcp"'],
      ["Bearer ctcg_agt_short", "malformed_credentials", 'Bearer realm="cambridgetcg-mcp", error="invalid_token"'],
      [`Bearer ${AGENT_TOKEN}`, "unknown_or_revoked_key", 'Bearer realm="cambridgetcg-mcp", error="invalid_token"'],
    ];
    for (const [authorization, reason, challenge] of cases) {
      const response = await POST(request("tools/call", { name: "agent.self", arguments: {} }, authorization));
      const body = await response.json();
      expect(response.status, reason).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(challenge);
      expect(body.error.code).toBe(-32001);
      expect(body.error.data.reason_code).toBe(reason);
      expectDocumentedRefusal(body.error.data, refusal);
    }
    // Only the well-formed token cost a lookup.
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("answers a suspended agent with a documented 403 that lists the key's own exit", async () => {
    const { responses, refusal } = await documented();
    mocks.query.mockResolvedValueOnce({
      rows: [keyRow({ agent_status: "suspended", suspended_at: new Date("2026-10-29T12:00:00Z") })],
    });
    const response = await POST(request("agent.self", {}, `Bearer ${AGENT_TOKEN}`));
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(responses).toHaveProperty("403");
    expect(body.error.code).toBe(-32001);
    expect(body.error.data).toMatchObject({ reason_code: "agent_suspended", suspended_at: "2026-10-29T12:00:00.000Z" });
    expectDocumentedRefusal(body.error.data, refusal);
  });

  it("carries tool_not_permitted in error.data for dotted calls and in _meta under tools/call", async () => {
    const { refusal } = await documented();
    mocks.query.mockResolvedValue({ rows: [keyRow({ registered_via: "self-serve" })] });

    const dotted = await POST(request("deck.list_mine", {}, `Bearer ${AGENT_TOKEN}`));
    const dottedBody = await dotted.json();
    expect(dotted.status).toBe(403);
    expect(dottedBody.error.code).toBe(-32003);
    expect(dottedBody.error.data.reason_code).toBe("tool_not_permitted");
    expectDocumentedRefusal(dottedBody.error.data, refusal);

    const mcp = await POST(request("tools/call", { name: "deck.list_mine", arguments: {} }, `Bearer ${AGENT_TOKEN}`));
    const mcpBody = await mcp.json();
    // A JSON-RPC result, not an error, sent with the HTTP status of the refusal.
    expect(mcp.status).toBe(403);
    expect(mcpBody.error).toBeUndefined();
    expect(mcpBody.result.isError).toBe(true);
    expect(mcpBody.result._meta[MCP_REFUSAL_META_KEY].reason_code).toBe("tool_not_permitted");
    expectDocumentedRefusal(mcpBody.result._meta[MCP_REFUSAL_META_KEY], refusal);
    expect(mocks.checkAndConsume).not.toHaveBeenCalled();
  });

  it("answers a spent minute with a documented 429 and Retry-After", async () => {
    const { responses, refusal } = await documented();
    expect(responses["429"].headers).toHaveProperty("Retry-After");
    mocks.query.mockResolvedValueOnce({ rows: [keyRow()] });
    mocks.checkAndConsume.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 17 });
    const response = await POST(request("agent.self", {}, `Bearer ${AGENT_TOKEN}`));
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(body.error.code).toBe(-32002);
    expect(body.error.data).toMatchObject({ reason_code: "rate_limited", retry_after_seconds: 17 });
    expectDocumentedRefusal(body.error.data, refusal);
  });

  it("answers a failed key lookup with a documented, retryable 503", async () => {
    const { responses, refusal } = await documented();
    expect(responses).toHaveProperty("503");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockRejectedValueOnce(Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }));
    const response = await POST(request("agent.self", {}, `Bearer ${AGENT_TOKEN}`));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.error.code).toBe(-32603);
    expect(body.error.data).toMatchObject({ reason_code: "auth_unavailable", retryable: true });
    expectDocumentedRefusal(body.error.data, refusal);
    error.mockRestore();
  });

  it("sends the documented headers on an authenticated result", async () => {
    const { responses } = await documented();
    mocks.query.mockResolvedValueOnce({ rows: [keyRow()] });
    const response = await POST(request("tools/call", { name: "agent.self", arguments: {} }, `Bearer ${AGENT_TOKEN}`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(false);
    for (const header of Object.keys(responses["200"].headers ?? {})) {
      expect(response.headers.get(header), header).not.toBeNull();
    }
    expect(response.headers.get("x-ratelimit-remaining")).toBe("29");
  });

  it("previews agent.revoke_key as a 200 without a confirm, and its unknown state as a 503", async () => {
    const { responses } = await documented();
    mocks.query.mockResolvedValueOnce({
      rows: [{ key_prefix: AGENT_TOKEN.slice(0, 12), registered_via: "operator", status: "active", other_live_keys: 0 }],
    });
    const preview = await POST(request("agent.revoke_key", {}, `Bearer ${AGENT_TOKEN}`));
    expect(preview.status).toBe(200);
    expect((await preview.json()).result).toMatchObject({
      performed: false,
      key_state: "active",
      states: { this_key_future_authority: "active" },
    });

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "57014" }));
    const unknown = await POST(request("agent.revoke_key", { confirm: true }, `Bearer ${AGENT_TOKEN}`));
    const unknownBody = await unknown.json();
    expect(unknown.status).toBe(503);
    expect(responses).toHaveProperty("503");
    expect(unknownBody.error.code).toBe(-32603);
    expect(unknownBody.error.data).toMatchObject({ key_state: "unknown", retryable: true });
    error.mockRestore();
  });
});
