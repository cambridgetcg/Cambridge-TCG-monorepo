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
  return {
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
import { POST as postAct } from "@/app/api/v1/agents/act/route";
import { isAgentToken, parseAgentBearer } from "@/lib/agents/auth";
import {
  authRefusal,
  authUnavailableRefusal,
  caseRestedSideEffects,
  internalErrorRefusal,
  MCP_REFUSAL_META_KEY,
  rateLimitedRefusal,
  signedActLimitedRefusal,
  signedActRefusal,
  signedActSideEffects,
  TOOL_REFUSAL_CODES,
  toolNotPermittedRefusal,
  toolRefusal,
  type AgentRefusal,
  type SignedActRefusalCode,
} from "@/lib/agents/refusals";
import { SIGNED_ACT_MAX_BODY_BYTES } from "@/lib/agents/signed-act-config";
import { SIGNED_ACT_MAX_LENGTH, SIGNED_ACT_NAMES } from "@/lib/agents/signed-act-verify";
import { SIGNED_ACT_STATUS } from "@/lib/agents/signed-acts";
import { AGENT_ACT_INPUT_SCHEMA } from "@/lib/agents/tool-access";
import { MCP_MAX_REQUEST_BYTES, POST } from "./route";

// Built at runtime so no literal key-shaped string sits in the repository.
const AGENT_TOKEN = "ctcg_agt_" + "Ab1".repeat(7) + "Z";

const SIGNED_ACT_CODES: Exclude<SignedActRefusalCode, "act_limited">[] = [
  "signed_acts_closed",
  "act_malformed",
  "act_stale",
  "act_unverified",
  "act_replayed",
  "signing_key_ended",
  "act_disclosure_stale",
  "act_params_invalid",
  "signing_key_in_use",
  "key_cap_reached",
];

type JsonSchema = {
  required?: string[];
  properties: Record<string, JsonSchema & { enum?: string[]; const?: unknown }>;
  items?: JsonSchema;
  enum?: string[];
};

async function spec() {
  return (await getOpenApi()).json();
}

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    key_id: "key-1",
    rate_limit_tier: "free",
    expires_at: null,
    key_expired: false,
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
  expect(schema.properties.effect.enum).toContain(refusal.effect);
  const sideEffect = schema.properties.side_effects.items!;
  for (const entry of refusal.side_effects ?? []) {
    for (const key of Object.keys(entry)) expect(sideEffect.properties, key).toHaveProperty(key);
    expect(sideEffect.properties.change.enum).toContain(entry.change);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Signed acts closed, as in production.
  vi.stubEnv("AGENT_SIGNED_ACTS", "");
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
      authRefusal({ ok: false, status: 401, reason_code: "key_expired", error: "" }),
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
      // agent.act and POST /api/v1/agents/act, with every extra a refusal
      // can carry (signed-acts.ts adds receipt to the two status codes).
      ...SIGNED_ACT_CODES.map((code) =>
        signedActRefusal(code, {
          detail: "a fixed phrase",
          server_time: "2026-11-10T12:00:00.000Z",
          ended_at: "2026-11-10T12:00:00.000Z",
          revoked_by_event: null,
          receipt: { event_id: "e-1", act_sha256: "0".repeat(64) },
        }),
      ),
      signedActLimitedRefusal(13),
      // A tool's own refusals, with every extra one can carry.
      ...TOOL_REFUSAL_CODES.map((code) =>
        toolRefusal(code, {
          caseId: "11111111-1111-4111-8111-111111111111",
          matchId: "m-1",
          retryAfterSeconds: 60,
          sideEffects: caseRestedSideEffects("11111111-1111-4111-8111-111111111111"),
        }),
      ),
      // An unexpected exception, for each effect it can carry.
      internalErrorRefusal("coverage.hunt.contribute", { case_id: "11111111-1111-4111-8111-111111111111" }, "unknown"),
      internalErrorRefusal("coverage.hunt.contribute", {}, "unknown"),
      internalErrorRefusal("agent.self", {}, "not_applied"),
      internalErrorRefusal("coverage.hunt.contribute", {}, "not_attempted"),
      authUnavailableRefusal("unknown"),
      signedActRefusal("act_params_invalid", { side_effects: signedActSideEffects(true) }),
    ];
    for (const refusal of built) expectDocumentedRefusal(refusal, schema);
    for (const code of ["agent_suspended", "agent_archived"] as const) {
      const status = authRefusal({ ok: false, status: 403, reason_code: code, error: "", suspended_at: null } as never);
      expectDocumentedRefusal({ ...status, receipt: { event_id: "e-1", act_sha256: "0".repeat(64) } }, schema);
    }
    expect([...schema.properties.reason_code.enum!].sort()).toEqual(
      [...new Set(built.map((refusal) => refusal.reason_code))].sort(),
    );
    expect([...schema.properties.effect.enum!].sort()).toEqual(
      [...new Set(built.map((refusal) => refusal.effect))].sort(),
    );
    expect([...schema.properties.side_effects.items!.properties.change.enum!].sort()).toEqual(
      [...new Set(built.flatMap((refusal) => (refusal.side_effects ?? []).map((entry) => entry.change)))].sort(),
    );
    expect([...schema.properties.next_actions.items!.properties.action.enum!].sort()).toEqual(
      [...new Set(built.flatMap((refusal) => refusal.next_actions.map((next) => next.action)))].sort(),
    );
    const exits = built.filter((refusal) => refusal.exit_paths).map((r) => r.reason_code);
    expect(exits).toEqual(["agent_suspended", "agent_archived"]);
  });

  it("claims a refusal and act_recorded only where the gate gives them", async () => {
    const document = await spec();
    const schema = document.components.schemas.AgentRefusal as JsonSchema & { description: string };
    const sideEffects = schema.properties.side_effects as JsonSchema & { description: string };
    // A replay is refused inside the transaction but records no event.
    expect(sideEffects.description).toContain("a validly signed act refused after the store recorded its jti is recorded as an event");
    expect(sideEffects.description).toContain("act_replayed, whose jti was already used, records nothing");
    expect(sideEffects.description).not.toContain("refused inside the store's transaction is recorded");
    // The transport's own answers carry no AgentRefusal, and it says so.
    const post = document.paths["/api/mcp"].post as { description: string };
    expect(post.description).toContain("the transport's own answers carry none (a cross-site 403, unreadable or invalid JSON, a body without a method, 413, an unknown method, tools/call without a name, -32022)");
    expect(post.description).not.toContain("A refusal, the gate's or a tool's, carries an AgentRefusal");
  });

  it("defines retryable by the values the gate sends", async () => {
    const document = await spec();
    const retryable = (document.components.schemas.AgentRefusal as JsonSchema).properties.retryable as JsonSchema & { description: string };
    expect(retryable.description).toMatch(/^Whether the same call, sent again unchanged, may succeed once time passes, with nothing else changing first/);
    expect(retryable.description).not.toContain("answered differently");
    // case_expired is answered differently when sent again (case_terminal),
    // and storage_not_ready once a migration runs; neither is retryable.
    expect(toolRefusal("case_expired").retryable).toBe(false);
    expect(toolRefusal("storage_not_ready").retryable).toBe(false);
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

  it("answers a standard MCP client with the Streamable HTTP statuses it documents", async () => {
    const document = await spec();
    const post = document.paths["/api/mcp"].post;
    const get = document.paths["/api/mcp"].get;
    const responses = post.responses as Record<string, { description: string }>;
    // What SDK 1.32.2 and 2.4.0 send (scripts/mcp-sdk-harness).
    const standard = (message: Record<string, unknown>, headers: Record<string, string> = {}) =>
      POST(new Request("https://cambridgetcg.example/api/mcp", {
        method: "POST",
        headers: { accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-11-25", ...headers },
        body: JSON.stringify(message),
      }));

    expect((await standard({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect(responses).toHaveProperty("202");
    const ping = await standard({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(ping.status).toBe(200);
    expect((await ping.json()).result).toEqual({});

    const probe = await standard({ jsonrpc: "2.0", id: "p", method: "server/discover", params: {} }, { "mcp-protocol-version": "2026-07-28" });
    const probeBody = await probe.json();
    expect(probe.status).toBe(400);
    expect(probeBody.error.code).toBe(-32022);
    expect(responses["400"].description).toContain("-32022");
    expect(probeBody.error.data.supported.map((revision: string) => `"${revision}"`).join(", "))
      .toBe(responses["400"].description.match(/supported: \[([^\]]*)\]/)?.[1]);
    expect(document.components.schemas.McpJsonRpcResponse.properties.error.properties.code.description).toContain("-32022");
    expect(post.parameters.map((parameter: { name: string }) => parameter.name)).toContain("MCP-Protocol-Version");

    // A refused tools/call is sent with 200, the body unchanged.
    mocks.query.mockResolvedValue({ rows: [keyRow({ registered_via: "self-serve" })] });
    const refused = await standard(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "deck.list_mine", arguments: {} } },
      { authorization: `Bearer ${AGENT_TOKEN}` },
    );
    expect(refused.status).toBe(200);
    expect((await refused.json()).result._meta[MCP_REFUSAL_META_KEY].reason_code).toBe("tool_not_permitted");
    expect(post.description).toContain("a refused tools/call is sent with 200");

    // A web page on another site, on either method; an event-stream GET.
    const crossSite = await standard({ jsonrpc: "2.0", id: 3, method: "tools/list" }, { origin: "https://elsewhere.example" });
    expect(crossSite.status).toBe(403);
    expect(responses["403"].description).toContain("A web page on another site");
    const { GET } = await import("./route");
    expect((await GET(new Request("https://cambridgetcg.example/api/mcp", { headers: { origin: "https://elsewhere.example" } }))).status).toBe(403);
    expect(get.responses).toHaveProperty("403");
    const stream = await GET(new Request("https://cambridgetcg.example/api/mcp", { headers: { accept: "text/event-stream" } }));
    expect(stream.status).toBe(405);
    expect(get.responses["405"].headers.Allow.description).toBe(stream.headers.get("allow"));
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

  it("answers an expired key, through the real gate, with the documented 401 and its error_description", async () => {
    const { responses, refusal } = await documented();
    expect(responses["401"].headers).toHaveProperty("WWW-Authenticate");
    // Expired and suspended: expiry is answered first.
    mocks.query.mockResolvedValueOnce({
      rows: [keyRow({ expires_at: new Date("2026-11-01T00:00:00Z"), key_expired: true, agent_status: "suspended" })],
    });
    const response = await POST(request("agent.self", {}, `Bearer ${AGENT_TOKEN}`));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="cambridgetcg-mcp", error="invalid_token", error_description="The access token expired"',
    );
    expect(response.headers.get("x-agent-key-expires")).toBeNull();
    expect(body.error.code).toBe(-32001);
    expect(body.error.data.reason_code).toBe("key_expired");
    expect(refusal.properties.reason_code.enum).toContain("key_expired");
    expectDocumentedRefusal(body.error.data, refusal);
    expect(mocks.checkAndConsume).not.toHaveBeenCalled();
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
    expect(responses["200"].headers).toHaveProperty("X-Agent-Key-Expires");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("29");
    expect(response.headers.get("x-agent-key-expires")).toBe("never");

    mocks.query.mockResolvedValueOnce({ rows: [keyRow({ expires_at: new Date("2027-01-28T00:00:00Z") })] });
    const dated = await POST(request("agent.self", {}, `Bearer ${AGENT_TOKEN}`));
    expect(dated.status).toBe(200);
    expect(dated.headers.get("x-agent-key-expires")).toBe("2027-01-28T00:00:00.000Z");
  });

  it("previews agent.revoke_key as a 200 without a confirm, and its unknown state as a 503", async () => {
    const { responses } = await documented();
    mocks.query.mockResolvedValueOnce({
      rows: [{ key_prefix: AGENT_TOKEN.slice(0, 12), expires_at: null, key_expired: false, registered_via: "operator", status: "active", other_live_keys: 0 }],
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

describe("OpenAPI describes signed acts as the act door answers them", () => {
  async function actPath() {
    const document = await spec();
    return {
      post: document.paths["/api/v1/agents/act"].post,
      mcp: document.paths["/api/mcp"].post.responses as Record<string, { description: string }>,
      refusal: document.components.schemas.AgentRefusal as JsonSchema,
    };
  }

  it("takes the tool's arguments as its body, under the act's size limits, with no key", async () => {
    const { post } = await actPath();
    const body = post.requestBody.content["application/json"].schema;
    expect(post.security).toEqual([{}]);
    expect(post["x-max-request-bytes"]).toBe(SIGNED_ACT_MAX_BODY_BYTES);
    expect(Object.keys(body.properties).sort()).toEqual(Object.keys(AGENT_ACT_INPUT_SCHEMA.properties).sort());
    expect(body.additionalProperties).toBe(false);
    expect(body.properties.act.maxLength).toBe(SIGNED_ACT_MAX_LENGTH);
    expect(body.properties.preview.enum).toEqual([...SIGNED_ACT_NAMES, null]);
    expect(post.description).toContain("production has not");
  });

  it("lists every status a signed-act refusal carries, on both doors, naming the code", async () => {
    const { post, mcp } = await actPath();
    for (const [code, status] of Object.entries(SIGNED_ACT_STATUS)) {
      expect(post.responses, code).toHaveProperty(String(status));
      expect(mcp, code).toHaveProperty(String(status));
      expect(post.responses[String(status)].description, code).toContain(code);
      if (!["agent_suspended", "agent_archived", "auth_unavailable"].includes(code)) {
        expect(mcp[String(status)].description, code).toContain(code);
      }
    }
    expect(post.responses["429"].headers).toHaveProperty("Retry-After");
    expect(post.responses).toHaveProperty("413");
  });

  it("answers closed, as documented, on the REST door and through the gate, reading nothing", async () => {
    const { post, refusal } = await actPath();
    const rest = await postAct(
      new Request("https://cambridgetcg.com/api/v1/agents/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ act: null, preview: "key.mint" }),
      }),
    );
    const restBody = await rest.json();
    expect(rest.status).toBe(503);
    expect(post.responses["503"].description).toContain("signed_acts_closed");
    expect(Object.keys(restBody).sort()).toEqual(["error", "refusal"]);
    expectDocumentedRefusal(restBody.refusal, refusal);
    expect(restBody.refusal.reason_code).toBe("signed_acts_closed");

    const mcp = await POST(request("tools/call", { name: "agent.act", arguments: { act: null, preview: "signer.check" } }));
    const mcpBody = await mcp.json();
    expect(mcp.status).toBe(503);
    expect(mcpBody.result.isError).toBe(true);
    expectDocumentedRefusal(mcpBody.result._meta[MCP_REFUSAL_META_KEY], refusal);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
