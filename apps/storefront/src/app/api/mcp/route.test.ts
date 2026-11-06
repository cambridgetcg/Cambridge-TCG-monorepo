import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
// after() runs a task once the response is sent; here the test runs it.
const afterTasks = vi.hoisted(() => [] as (() => Promise<unknown>)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => { afterTasks.push(task); },
}));

const mocks = vi.hoisted(() => ({
  resolveAgentBearer: vi.fn(),
  stampKeyUse: vi.fn(),
  checkAndConsume: vi.fn(),
  canInvokeAgentTool: vi.fn(),
  agentSelf: vi.fn(),
}));

vi.mock("@/lib/agents/auth", () => ({
  resolveAgentBearer: mocks.resolveAgentBearer,
  stampKeyUse: mocks.stampKeyUse,
}));
vi.mock("@/lib/agents/rate-limit", () => ({
  checkAndConsume: mocks.checkAndConsume,
}));
vi.mock("@/lib/agents/tool-access", () => ({
  canInvokeAgentTool: mocks.canInvokeAgentTool,
}));
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
vi.mock("@/lib/agents/write-tools", () => ({
  deckSave: vi.fn(),
  deckListMine: vi.fn(),
}));
vi.mock("@/lib/agents/card-batch-tools", () => ({
  catalogLookupMany: vi.fn(),
}));
vi.mock("@/lib/agents/coverage-hunt-tools", () => ({
  coverageHuntContribute: vi.fn(),
  coverageHuntList: vi.fn(),
  coverageHuntMyCases: vi.fn(),
  coverageHuntView: vi.fn(),
}));

import { query } from "@/lib/db";
import { MCP_MAX_REQUEST_BYTES, GET, POST } from "./route";

const actor = {
  agentId: "agent-1",
  operatorUserId: "user-1",
  keyId: "key-1",
  agentPublicHandle: "agent-one",
  rateLimitTier: "free",
  registeredVia: "operator",
} as const;

function request(method: string, params: Record<string, unknown> = {}) {
  return new Request("https://cambridgetcg.example/api/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  mocks.resolveAgentBearer.mockResolvedValue({ ok: true, actor });
  mocks.checkAndConsume.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetSeconds: 30,
  });
  mocks.canInvokeAgentTool.mockReturnValue(true);
});

describe("MCP authority and error boundary", () => {
  it("rejects a denied tool before mutating operational metadata", async () => {
    mocks.canInvokeAgentTool.mockReturnValue(false);

    const response = await POST(
      request("tools/call", { name: "deck.save", arguments: {} }),
    );

    expect(response.status).toBe(403);
    expect(mocks.checkAndConsume).not.toHaveBeenCalled();
    expect(mocks.stampKeyUse).not.toHaveBeenCalled();
  });

  it("does not return unexpected exception text", async () => {
    mocks.agentSelf.mockRejectedValue(
      new Error("database host and credential fragment must stay private"),
    );

    const response = await POST(request("agent.self"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toEqual({ code: -32603, message: "internal error" });
    expect(JSON.stringify(body)).not.toContain("credential fragment");
  });
});

describe("POST /api/mcp request bounds", () => {
  it("stops an oversized chunked-style body before JSON parsing or auth", async () => {
    const request = new Request("https://example.test/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(MCP_MAX_REQUEST_BYTES + 1),
    });
    expect(request.headers.get("content-length")).toBeNull();

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatchObject({
      code: -32600,
      message: `request body exceeds ${MCP_MAX_REQUEST_BYTES} bytes`,
    });
  });
});

describe("MCP initialize", () => {
  it("points at the site's llms.txt, not at the wake or the dear-agents letter", async () => {
    const response = await POST(request("initialize"));
    const body = await response.json();
    const text = body.result.instructions as string;
    expect(text).toContain("https://cambridgetcg.com/llms.txt");
    expect(text).not.toMatch(/\/api\/v1\/wake/);
    expect(text).not.toMatch(/dear-agents/);
    expect(text).toContain("Per-key rate limits apply.");
    expect(text).toContain("A human operator can provision one at https://cambridgetcg.com/account/agents.");
  });
});

describe("MCP daily counts (mcp_daily, OPS_MCP_DAILY)", () => {
  afterEach(() => vi.unstubAllEnvs());
  /** Runs the after() tasks and returns each upsert's words. */
  async function counted() {
    for (const task of afterTasks.splice(0)) await task();
    return vi.mocked(query).mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO mcp_daily")).map(([, params]) => params);
  }
  const raw = (body: string, authorization = "Bearer token") => new Request("https://cambridgetcg.example/api/mcp", {
    method: "POST", headers: { authorization, "content-type": "application/json" }, body,
  });

  it("counts nothing while the flag is off, and lists no counter", async () => {
    for (const value of [undefined, "", "ON", "true", " on"]) {
      vi.stubEnv("OPS_MCP_DAILY", value as string);
      await POST(request("tools/call", { name: "agent.self", arguments: {} }));
    }
    expect(afterTasks).toEqual([]);
    expect(await counted()).toEqual([]);
    const body = await (await GET()).json();
    expect(body.read_only_scope.operational_metadata_writes.join(" ")).not.toContain("aggregate count");
  });

  it("counts each request once, after its response, by method, tool, authentication and outcome, with no key", async () => {
    vi.stubEnv("OPS_MCP_DAILY", "on");
    mocks.agentSelf.mockResolvedValue({ public_handle: "agent-one" });
    const answers = [
      await POST(request("initialize")),
      await POST(request("tools/list")),
      await POST(request("notifications/initialized")),
      await POST(request("tools/call", { name: "mcp.list_tools" })),
      await POST(request("tools/call", { name: "agent.self", arguments: {} })),
      await POST(request("agent.self")),
      await POST(request("tools/call", { name: "secret.probe-name" })),
      await POST(request("made-up/method")),
      await POST(raw("{not json")),
    ];
    expect(answers.map((response) => response.status)).toEqual([200, 200, 204, 200, 200, 200, 404, 404, 400]);
    expect(await counted()).toEqual([
      ["initialize", "none", false, "ok"],
      ["tools/list", "none", false, "ok"],
      ["notifications/initialized", "none", false, "notification"],
      ["tools/call", "mcp.list_tools", false, "ok"],
      ["tools/call", "agent.self", true, "ok"],
      ["native", "agent.self", true, "ok"],
      ["tools/call", "unknown", true, "not-found"],
      ["other", "none", true, "not-found"],
      ["invalid", "none", false, "invalid-request"],
    ]);
    // One statement a request, and nothing of the caller's own: no key or
    // agent id, no handle, no unknown name.
    const statements = JSON.stringify(vi.mocked(query).mock.calls);
    for (const leak of ["key-1", "agent-1", "agent-one", "user-1", "secret.probe-name", "made-up/method"]) expect(statements).not.toContain(leak);
    expect(vi.mocked(query).mock.calls.every(([sql]) => String(sql).includes("INSERT INTO mcp_daily"))).toBe(true);
  });

  it("counts refusals by what they were", async () => {
    vi.stubEnv("OPS_MCP_DAILY", "on");
    mocks.resolveAgentBearer.mockResolvedValueOnce({ ok: false, status: 403, error: "agent suspended" });
    await POST(request("tools/call", { name: "agent.self" }));
    mocks.canInvokeAgentTool.mockReturnValueOnce(false);
    await POST(request("tools/call", { name: "deck.save" }));
    mocks.checkAndConsume.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 12 });
    await POST(request("agent.self"));
    mocks.agentSelf.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await POST(request("agent.self"));
    expect(await counted()).toEqual([
      ["tools/call", "agent.self", false, "unauthenticated"],
      ["tools/call", "deck.save", true, "forbidden"],
      ["native", "agent.self", true, "rate-limited"],
      ["native", "agent.self", true, "error"],
    ]);
  });

  it("answers the same when the count cannot be written, and lists the counter while it is on", async () => {
    vi.stubEnv("OPS_MCP_DAILY", "on");
    vi.mocked(query).mockRejectedValue(Object.assign(new Error('relation "mcp_daily" does not exist'), { code: "42P01" }));
    const response = await POST(request("tools/list"));
    expect(response.status).toBe(200);
    expect((await response.json()).result.tools.length).toBeGreaterThan(0);
    await expect(counted()).resolves.toHaveLength(1);
    const body = await (await GET()).json();
    expect(body.read_only_scope.operational_metadata_writes.join(" ")).toContain("aggregate count per UTC day");
    expect(body.read_only_scope.operational_metadata_writes.join(" ")).toContain("no key, agent or account id");
  });

  it("knows every tool the gate has", async () => {
    const { MCP_TOOLS } = await import("@/lib/observability/vocabulary");
    const listed = await (await POST(request("mcp.list_tools"))).json();
    for (const tool of listed.result.tools as { name: string }[]) expect(MCP_TOOLS).toContain(tool.name);
  });
});
