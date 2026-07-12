import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "./route";

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
