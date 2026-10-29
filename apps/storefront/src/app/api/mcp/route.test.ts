import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));

const mocks = vi.hoisted(() => ({
  resolveAgentBearer: vi.fn(),
  stampKeyUse: vi.fn(),
  checkAndConsume: vi.fn(),
  canInvokeAgentTool: vi.fn(),
  agentSelf: vi.fn(),
}));

vi.mock("@/lib/agents/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/auth")>()),
  resolveAgentBearer: mocks.resolveAgentBearer,
  stampKeyUse: mocks.stampKeyUse,
}));
vi.mock("@/lib/agents/rate-limit", () => ({
  checkAndConsume: mocks.checkAndConsume,
}));
vi.mock("@/lib/agents/tool-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/tool-access")>()),
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

import { MCP_MAX_REQUEST_BYTES, POST } from "./route";

const actor = {
  agentId: "agent-1",
  operatorUserId: "user-1",
  keyId: "key-1",
  agentPublicHandle: "agent-one",
  rateLimitTier: "free",
  registeredVia: "operator",
} as const;

function request(
  method: string,
  params: Record<string, unknown> = {},
  authorization: string | null = "Bearer token",
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization !== null) headers.authorization = authorization;
  return new Request("https://cambridgetcg.example/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

type Refusal = {
  reason_code: string;
  retryable: boolean;
  terminal: boolean;
  next_actions: Array<{ optional: boolean }>;
  docs: string;
  exit_paths?: Array<{ tool: string }>;
};

/** terminal ⇒ no next action; non-terminal ⇒ at least one, all optional. */
function expectRefusalInvariant(refusal: Refusal) {
  expect(typeof refusal.reason_code).toBe("string");
  expect(typeof refusal.retryable).toBe("boolean");
  expect(refusal.docs).toBe("https://cambridgetcg.com/methodology/agents");
  if (refusal.terminal) {
    expect(refusal.next_actions).toEqual([]);
  } else {
    expect(refusal.next_actions.length).toBeGreaterThan(0);
  }
  for (const action of refusal.next_actions) expect(action.optional).toBe(true);
  expect(JSON.stringify(refusal)).not.toMatch(/xenia|covenant/i);
}

beforeEach(() => {
  vi.clearAllMocks();
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

describe("MCP typed refusals", () => {
  it("answers an unknown or revoked key with a typed 401 and a bearer challenge", async () => {
    mocks.resolveAgentBearer.mockResolvedValue({
      ok: false,
      status: 401,
      reason_code: "unknown_or_revoked_key",
      error: "unknown or revoked key",
    });

    for (const method of ["agent.self", "tools/call"]) {
      const response = await POST(request(method, { name: "agent.self", arguments: {} }));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        'Bearer realm="cambridgetcg-mcp", error="invalid_token"',
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(body.error).toEqual({
        code: -32001,
        message: "unknown or revoked key",
        data: {
          reason_code: "unknown_or_revoked_key",
          retryable: false,
          terminal: false,
          next_actions: [
            {
              action: "read_docs",
              href: "https://cambridgetcg.com/methodology/agents",
              optional: true,
            },
          ],
          docs: "https://cambridgetcg.com/methodology/agents",
        },
      });
      expectRefusalInvariant(body.error.data);
    }
  });

  it("sends the bare challenge when no bearer token was presented", async () => {
    mocks.resolveAgentBearer.mockResolvedValue({
      ok: false,
      status: 401,
      reason_code: "missing_credentials",
      error: "missing Authorization header",
    });
    const missing = await POST(request("agent.self", {}, null));
    expect(missing.headers.get("www-authenticate")).toBe('Bearer realm="cambridgetcg-mcp"');
    expect((await missing.json()).error.data.reason_code).toBe("missing_credentials");

    mocks.resolveAgentBearer.mockResolvedValue({
      ok: false,
      status: 401,
      reason_code: "malformed_credentials",
      error: "expected bearer",
    });
    const basic = await POST(request("agent.self", {}, "Basic abc"));
    expect(basic.headers.get("www-authenticate")).toBe('Bearer realm="cambridgetcg-mcp"');
    const malformed = await POST(request("agent.self", {}, "Bearer not-a-key"));
    expect(malformed.headers.get("www-authenticate")).toBe(
      'Bearer realm="cambridgetcg-mcp", error="invalid_token"',
    );
  });

  it("offers an optional review and the key's own exit to a suspended agent", async () => {
    mocks.resolveAgentBearer.mockResolvedValue({
      ok: false,
      status: 403,
      reason_code: "agent_suspended",
      error: "agent is suspended",
      suspended_at: "2026-10-20T09:30:00.000Z",
    });

    const response = await POST(request("agent.self"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBeNull();
    expect(body.error.code).toBe(-32001);
    expect(body.error.data).toEqual({
      reason_code: "agent_suspended",
      retryable: false,
      terminal: false,
      suspended_at: "2026-10-20T09:30:00.000Z",
      next_actions: [
        {
          action: "request_review",
          href: "mailto:support@cambridgetcg.com?subject=Agent%20suspension%20review",
          optional: true,
        },
      ],
      docs: "https://cambridgetcg.com/methodology/agents",
      exit_paths: [{ tool: "agent.revoke_key", note: "ends this key; not a recovery" }],
    });
    expectRefusalInvariant(body.error.data);
  });

  it("marks an archived agent terminal with no next action", async () => {
    mocks.resolveAgentBearer.mockResolvedValue({
      ok: false,
      status: 403,
      reason_code: "agent_archived",
      error: "agent is archived",
    });

    const body = await (await POST(request("agent.self"))).json();

    expect(body.error.data).toMatchObject({
      reason_code: "agent_archived",
      terminal: true,
      next_actions: [],
      exit_paths: [{ tool: "agent.revoke_key" }],
    });
    expectRefusalInvariant(body.error.data);
  });

  it("types a denied tool as terminal without suggesting the revoke exit", async () => {
    mocks.canInvokeAgentTool.mockReturnValue(false);

    const dotted = await POST(request("deck.save"));
    const dottedBody = await dotted.json();
    expect(dotted.status).toBe(403);
    expect(dottedBody.error.code).toBe(-32003);
    expect(dottedBody.error.data).toEqual({
      reason_code: "tool_not_permitted",
      retryable: false,
      terminal: true,
      next_actions: [],
      docs: "https://cambridgetcg.com/methodology/agents",
    });
    expect(dottedBody.error.data).not.toHaveProperty("exit_paths");

    const call = await POST(request("tools/call", { name: "deck.save", arguments: {} }));
    const callBody = await call.json();
    expect(call.status).toBe(403);
    expect(callBody.error).toBeUndefined();
    expect(callBody.result.isError).toBe(true);
    expect(callBody.result._meta["cambridgetcg.com/refusal"]).toEqual(dottedBody.error.data);
    expectRefusalInvariant(callBody.result._meta["cambridgetcg.com/refusal"]);
  });

  it("leaves ordinary tool errors without a refusal", async () => {
    const { ToolError } = await import("@/lib/agents/play-tools");
    mocks.agentSelf.mockRejectedValue(new ToolError("match not found", 404));

    const body = await (
      await POST(request("tools/call", { name: "agent.self", arguments: {} }))
    ).json();

    expect(body.result.isError).toBe(true);
    expect(body.result).not.toHaveProperty("_meta");
  });

  it("types a rate-limited call as retryable after the reset", async () => {
    mocks.checkAndConsume.mockResolvedValue({ allowed: false, remaining: 0, resetSeconds: 17 });

    const response = await POST(request("agent.self"));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(body.error.code).toBe(-32002);
    expect(body.error.data).toEqual({
      reason_code: "rate_limited",
      retryable: true,
      terminal: false,
      retry_after_seconds: 17,
      next_actions: [{ action: "retry", after_seconds: 17, optional: true }],
      docs: "https://cambridgetcg.com/methodology/agents",
    });
    expect(mocks.agentSelf).not.toHaveBeenCalled();
  });

  it("answers an auth lookup failure with a JSON-RPC 503 and logs no error detail", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.resolveAgentBearer.mockRejectedValue(
      Object.assign(new Error("password authentication failed for key hash"), {
        code: "28P01",
      }),
    );

    try {
      for (const method of ["agent.self", "tools/call"]) {
        const response = await POST(request(method, { name: "agent.self", arguments: {} }));
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(body.jsonrpc).toBe("2.0");
        expect(body.error.code).toBe(-32603);
        expect(body.error.data).toEqual({
          reason_code: "auth_unavailable",
          retryable: true,
          terminal: false,
          next_actions: [{ action: "retry", optional: true }],
          docs: "https://cambridgetcg.com/methodology/agents",
        });
        expect(JSON.stringify(body)).not.toContain("password");
      }
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("password");
      expect(consoleError).toHaveBeenCalledWith("[mcp] auth lookup failed", "28P01");
      expect(mocks.checkAndConsume).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
