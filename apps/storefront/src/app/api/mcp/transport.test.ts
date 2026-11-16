import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The same mocks as route.test.ts: the gate runs for real, the key lookup,
// the limiter and the tools are replaced.
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
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
  revokePresentedKey: vi.fn(),
}));
vi.mock("@/lib/agents/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/auth")>()),
  resolveAgentBearer: mocks.resolveAgentBearer,
  stampKeyUse: mocks.stampKeyUse,
}));
vi.mock("@/lib/agents/key-revocation", () => ({ revokePresentedKey: mocks.revokePresentedKey }));
vi.mock("@/lib/agents/rate-limit", () => ({ checkAndConsume: mocks.checkAndConsume }));
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
    ToolError, agentSelf: mocks.agentSelf, playObserve: vi.fn(), playLegalActions: vi.fn(),
    playTakeAction: vi.fn(), playQueueMatch: vi.fn(), playCancelQueue: vi.fn(),
    playMatchHistory: vi.fn(), playListOpenRooms: vi.fn(),
  };
});
vi.mock("@/lib/agents/platform-tools", () => ({ catalogSearch: vi.fn(), leaderboardsRead: vi.fn(), pricesRecent: vi.fn() }));
vi.mock("@/lib/agents/write-tools", () => ({ deckSave: vi.fn(), deckListMine: vi.fn() }));
vi.mock("@/lib/agents/card-batch-tools", () => ({ catalogLookupMany: vi.fn() }));
vi.mock("@/lib/agents/coverage-hunt-tools", () => ({
  coverageHuntContribute: vi.fn(), coverageHuntList: vi.fn(), coverageHuntMyCases: vi.fn(), coverageHuntView: vi.fn(),
}));

import { query } from "@/lib/db";
import { ToolError } from "@/lib/agents/play-tools";
import { GET, POST } from "./route";

// Built at runtime so no literal key-shaped string sits in the repository.
const KEY = "ctcg_agt_" + "Ab1".repeat(7) + "Z";
const actor = {
  agentId: "agent-1", operatorUserId: "user-1", keyId: "key-1", agentPublicHandle: "agent-one",
  rateLimitTier: "free", registeredVia: "operator", keyExpiresAt: null,
} as const;
const URL_ = "https://cambridgetcg.example/api/mcp";

// What each caller sent in the SDK harness run of 2026-11-11
// (scripts/mcp-sdk-harness/sdk-vs-route.test.ts), less the key and the
// connection headers. SDK 1.32.2 and SDK 2.4.0 in its default mode sent the
// same headers; SDK 2.4.0 in auto mode added a server/discover probe first.
const CALLERS = {
  plain: { "content-type": "application/json" },
  bridge: {
    "content-type": "application/json",
    "user-agent": "@cambridge-tcg/mcp-server/0.1.0 (Node v22.23.1)",
    accept: "*/*",
    "accept-language": "*",
    "sec-fetch-mode": "cors",
    "accept-encoding": "gzip, deflate",
  },
  sdk: {
    accept: "application/json, text/event-stream",
    "accept-encoding": "gzip, deflate",
    "accept-language": "*",
    "content-type": "application/json",
    "sec-fetch-mode": "cors",
    "user-agent": "node",
  },
} as const;
type Caller = keyof typeof CALLERS;
const PROBE = {
  jsonrpc: "2.0",
  id: "server-discover-probe-1",
  method: "server/discover",
  params: {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "harness", version: "0" },
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  },
};

function post(
  caller: Caller,
  message: Record<string, unknown>,
  options: { key?: boolean; version?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...CALLERS[caller], ...options.headers };
  if (options.key !== false) headers.authorization = `Bearer ${KEY}`;
  if (options.version) headers["mcp-protocol-version"] = options.version;
  return POST(new Request(URL_, { method: "POST", headers, body: JSON.stringify(message) }));
}

/** What an SDK client sends after initialize, with the revision it negotiated. */
const sdk = (message: Record<string, unknown>, options: { key?: boolean; version?: string } = {}) =>
  post("sdk", message, { version: "2025-11-25", ...options });

const call = (id: number, name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args },
});
const initialize = (protocolVersion?: string) => ({
  jsonrpc: "2.0", id: 0, method: "initialize",
  params: { ...(protocolVersion ? { protocolVersion } : {}), capabilities: {}, clientInfo: { name: "harness", version: "0" } },
});

async function answer(response: Response) {
  return { status: response.status, text: await response.text(), headers: response.headers };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  afterTasks.length = 0;
  mocks.resolveAgentBearer.mockImplementation(async (header: string | null) =>
    header === `Bearer ${KEY}`
      ? { ok: true, actor }
      : { ok: false, status: 401, reason_code: "missing_credentials", error: "missing Authorization header" });
  mocks.checkAndConsume.mockResolvedValue({ allowed: true, remaining: 9, resetSeconds: 30 });
  mocks.canInvokeAgentTool.mockImplementation((_via: string, name: string) => name !== "deck.save");
  mocks.agentSelf.mockResolvedValue({ public_handle: "agent-one" });
});
afterEach(() => vi.unstubAllEnvs());

// The bridge and plain JSON-RPC callers: every answer here is the one main
// (28a02a2a) gave, byte for byte; this block was run against main's route
// before the change and passed unchanged.
describe.each(["plain", "bridge"] as const)("a %s caller gets main's answers", (caller) => {
  it("initialize names 2024-11-05 whatever revision was asked for", async () => {
    for (const asked of ["2025-11-25", "2025-06-18", undefined]) {
      const body = JSON.parse((await answer(await post(caller, initialize(asked)))).text);
      expect(body.result.protocolVersion).toBe("2024-11-05");
    }
  });

  it("notifications/initialized is 204 with no body; other notifications go through the gate", async () => {
    const initialized = await answer(await post(caller, { jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(initialized).toMatchObject({ status: 204, text: "" });
    const cancelled = await answer(await post(caller, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 3 } }));
    expect(cancelled.status).toBe(404);
    expect(cancelled.text).toBe(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "unknown method: notifications/cancelled" } }));
    const keyless = await post(caller, { jsonrpc: "2.0", method: "notifications/cancelled" }, { key: false });
    expect(keyless.status).toBe(401);
  });

  it("ping, server/discover, resources/templates/list and an unknown tool are unknown methods, after the key", async () => {
    for (const [message, name] of [
      [{ jsonrpc: "2.0", id: 4, method: "ping" }, "ping"],
      [PROBE, "server/discover"],
      [{ jsonrpc: "2.0", id: 6, method: "resources/templates/list" }, "resources/templates/list"],
      [call(5, "no.such.tool"), "no.such.tool"],
    ] as const) {
      const keyed = await answer(await post(caller, message));
      expect(keyed.status, name).toBe(404);
      expect(keyed.text, name).toBe(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `unknown method: ${name}` } }));
      const keyless = await answer(await post(caller, message, { key: false }));
      expect(keyless.status, name).toBe(401);
      expect(keyless.headers.get("www-authenticate"), name).toBe('Bearer realm="cambridgetcg-mcp"');
    }
  });

  it("a refused tools/call keeps its HTTP status: 403, 429, 404, 503", async () => {
    const refused = await answer(await post(caller, call(6, "deck.save", { name: "x", entries: [] })));
    expect(refused.status).toBe(403);
    expect(JSON.parse(refused.text).result).toMatchObject({ isError: true, _meta: { "cambridgetcg.com/refusal": { reason_code: "tool_not_permitted" } } });

    mocks.checkAndConsume.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 17 });
    const limited = await answer(await post(caller, call(7, "agent.self")));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("17");

    mocks.agentSelf.mockRejectedValueOnce(new ToolError("match not found", 404));
    expect((await post(caller, call(8, "agent.self"))).status).toBe(404);

    const closed = await answer(await post(caller, call(9, "agent.act", { act: null, preview: "signer.check" }), { key: false }));
    expect(closed.status).toBe(503);
    expect(JSON.parse(closed.text).result._meta["cambridgetcg.com/refusal"].reason_code).toBe("signed_acts_closed");
  });

  it("GET without an event-stream Accept is the JSON description", async () => {
    const headers = { ...CALLERS[caller] };
    const response = await GET(new Request(URL_, { headers }));
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe("cambridge-tcg");
  });
});

describe("standard MCP clients (SDK 1.32.2; SDK 2.4.0 default and auto)", () => {
  it("initialize echoes an answered revision, keeps 2024-11-05 for none, else answers the newest not newer than asked", async () => {
    for (const [asked, answered] of [
      ["2025-11-25", "2025-11-25"],
      ["2025-06-18", "2025-06-18"],
      ["2024-11-05", "2024-11-05"],
      [undefined, "2024-11-05"],
      ["2025-03-26", "2024-11-05"],
      ["2026-07-28", "2025-11-25"],
    ] as const) {
      const body = JSON.parse((await answer(await post("sdk", initialize(asked)))).text);
      expect(body.result.protocolVersion, String(asked)).toBe(answered);
    }
  });

  it("the initialize answer differs from a plain caller's only in protocolVersion", async () => {
    const standard = JSON.parse((await answer(await post("sdk", initialize("2025-11-25")))).text);
    const plain = JSON.parse((await answer(await post("plain", initialize("2025-11-25")))).text);
    expect({ ...standard, result: { ...standard.result, protocolVersion: "2024-11-05" } }).toEqual(plain);
  });

  it("accepts any notification with 202 and no body, before any key", async () => {
    for (const method of ["notifications/initialized", "notifications/cancelled", "notifications/roots/list_changed"]) {
      for (const key of [true, false]) {
        const response = await answer(await sdk({ jsonrpc: "2.0", method }, { key }));
        expect(response, method).toMatchObject({ status: 202, text: "" });
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      }
    }
    // notifications/initialized before the client knows a revision: no header.
    expect((await post("sdk", { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect(mocks.resolveAgentBearer).not.toHaveBeenCalled();
  });

  it("answers only notifications/ names with 202: an id-less tool call is still answered", async () => {
    mocks.revokePresentedKey.mockResolvedValue({ performed: false, revoked: false, key_state: "active", key_prefix: "ctcg_agt_Ab1" });
    const revoke = await answer(await sdk({ jsonrpc: "2.0", method: "agent.revoke_key", params: {} }));
    expect(revoke.status).toBe(200);
    expect(JSON.parse(revoke.text)).toMatchObject({ id: null, result: { key_state: "active" } });
    const act = await answer(await sdk({ jsonrpc: "2.0", method: "agent.act", params: { act: null, preview: "key.mint" } }));
    expect(act.status).toBe(503);
    expect(JSON.parse(act.text).error.data.reason_code).toBe("signed_acts_closed");
    // A notifications/ name with an id is a request, and goes through the gate.
    expect((await sdk({ jsonrpc: "2.0", id: 3, method: "notifications/initialized" })).status).toBe(204);
  });

  it("answers ping with an empty result, before any key", async () => {
    for (const key of [true, false]) {
      const response = await answer(await sdk({ jsonrpc: "2.0", id: 4, method: "ping" }, { key }));
      expect(response.status).toBe(200);
      expect(response.text).toBe(JSON.stringify({ jsonrpc: "2.0", id: 4, result: {} }));
    }
    expect(mocks.resolveAgentBearer).not.toHaveBeenCalled();
  });

  it("lists no resource templates, before any key, since initialize advertises resources", async () => {
    for (const key of [true, false]) {
      const response = await answer(await sdk({ jsonrpc: "2.0", id: 6, method: "resources/templates/list" }, { key }));
      expect(response.status).toBe(200);
      expect(response.text).toBe(JSON.stringify({ jsonrpc: "2.0", id: 6, result: { resourceTemplates: [] } }));
    }
    expect(mocks.resolveAgentBearer).not.toHaveBeenCalled();
  });

  it("answers an id-less ping as before: it is not a notifications/ name, so it goes through the gate", async () => {
    const keyed = await answer(await sdk({ jsonrpc: "2.0", method: "ping" }));
    expect(keyed.status).toBe(404);
    expect(keyed.text).toBe(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "unknown method: ping" } }));
    expect((await sdk({ jsonrpc: "2.0", method: "ping" }, { key: false })).status).toBe(401);
  });

  it("answers the 2026-07-28 probe with 400 -32022 listing the offered revisions, with or without a key", async () => {
    for (const key of [true, false]) {
      const response = await answer(await post("sdk", PROBE, {
        key, version: "2026-07-28", headers: { "mcp-method": "server/discover" },
      }));
      expect(response.status).toBe(400);
      expect(JSON.parse(response.text)).toEqual({
        jsonrpc: "2.0",
        id: "server-discover-probe-1",
        error: { code: -32022, message: "Unsupported protocol version", data: { supported: ["2025-11-25", "2025-06-18"], requested: "2026-07-28" } },
      });
    }
    expect(mocks.resolveAgentBearer).not.toHaveBeenCalled();
  });

  it("answers a probe that carries an answered revision header without naming that revision as unsupported", async () => {
    const response = await answer(await sdk({ jsonrpc: "2.0", id: "p", method: "server/discover", params: {} }, { version: "2025-11-25" }));
    expect(response.status).toBe(400);
    expect(JSON.parse(response.text)).toEqual({
      jsonrpc: "2.0", id: "p",
      error: { code: -32022, message: "Unsupported protocol version", data: { supported: ["2025-11-25", "2025-06-18"] } },
    });
  });

  it("refuses any other revision it does not answer with the same 400, and accepts the three it does", async () => {
    for (const version of ["2025-03-26", "2026-07-28", "1900-01-01"]) {
      const response = await answer(await sdk({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { version }));
      expect(response.status, version).toBe(400);
      expect(JSON.parse(response.text).error).toMatchObject({ code: -32022, data: { supported: ["2025-11-25", "2025-06-18"], requested: version } });
      // A tools/call keeps the 400 too: only a refused call is sent with 200,
      // and an unsupported revision is the transport's refusal, not the tool's.
      for (const key of [true, false]) {
        const toolCall = await answer(await sdk(call(2, "agent.self"), { version, key }));
        expect(toolCall.status, `tools/call ${version}`).toBe(400);
        expect(JSON.parse(toolCall.text).error, `tools/call ${version}`).toMatchObject({ code: -32022, data: { requested: version } });
      }
    }
    expect(mocks.resolveAgentBearer).not.toHaveBeenCalled();
    for (const version of ["2025-11-25", "2025-06-18", "2024-11-05"]) {
      expect((await sdk({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { version })).status, version).toBe(200);
    }
  });

  it("sends a refused tools/call with 200 and the body a plain caller gets", async () => {
    const cases: Array<[string, () => void, Record<string, unknown>, number]> = [
      ["tool_not_permitted", () => {}, call(6, "deck.save", { name: "x", entries: [] }), 403],
      ["rate_limited", () => { mocks.checkAndConsume.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 17 }); }, call(7, "agent.self"), 429],
      ["tool 404", () => { mocks.agentSelf.mockRejectedValueOnce(new ToolError("match not found", 404)); }, call(8, "agent.self"), 404],
      ["tool 409", () => { mocks.agentSelf.mockRejectedValueOnce(new ToolError("out of order", 409)); }, call(8, "agent.self"), 409],
      ["tool 422", () => { mocks.agentSelf.mockRejectedValueOnce(new ToolError("bad params", 422)); }, call(8, "agent.self"), 422],
      ["agent_suspended", () => { mocks.resolveAgentBearer.mockResolvedValueOnce({ ok: false, status: 403, reason_code: "agent_suspended", error: "agent is suspended", suspended_at: null }); }, call(8, "agent.self"), 403],
      // A closed door is a refusal: its 503 is sent with 200 too.
      ["signed_acts_closed", () => {}, call(9, "agent.act", { act: null, preview: "signer.check" }), 503],
      ["missing name", () => {}, { jsonrpc: "2.0", id: 10, method: "tools/call", params: {} }, 400],
    ];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [label, arrange, message, decided] of cases) {
      arrange();
      const plain = await answer(await post("plain", message));
      arrange();
      const standard = await answer(await sdk(message));
      expect(plain.status, label).toBe(decided);
      expect(standard.status, label).toBe(200);
      expect(standard.text, label).toBe(plain.text);
      expect(standard.headers.get("retry-after"), label).toBe(plain.headers.get("retry-after"));
      expect(standard.headers.get("cache-control"), label).toBe("private, no-store");
    }
    consoleError.mockRestore();
  });

  it("keeps 401 with its challenge, a fault's 500 and an outage's 503", async () => {
    const keyless = await answer(await sdk(call(2, "agent.self"), { key: false }));
    expect(keyless.status).toBe(401);
    expect(keyless.headers.get("www-authenticate")).toBe('Bearer realm="cambridgetcg-mcp"');
    expect(JSON.parse(keyless.text).error.data.reason_code).toBe("missing_credentials");

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.agentSelf.mockRejectedValueOnce(new Error("boom"));
    expect((await sdk(call(2, "agent.self"))).status).toBe(500);

    // An outage is not a refusal: it keeps its 503, the status that
    // status-based monitoring reads, with the same body a plain caller gets.
    mocks.resolveAgentBearer.mockRejectedValue(Object.assign(new Error("x"), { code: "ECONNREFUSED" }));
    const plainDown = await answer(await post("plain", call(8, "agent.self")));
    const standardDown = await answer(await sdk(call(8, "agent.self")));
    expect(plainDown.status).toBe(503);
    expect(standardDown).toMatchObject({ status: 503, text: plainDown.text });
    expect(JSON.parse(standardDown.text).error.data.reason_code).toBe("auth_unavailable");

    mocks.revokePresentedKey.mockResolvedValue({ performed: "unknown", key_state: "unknown", retryable: true, message: "Revocation state is unknown.", docs: "https://cambridgetcg.example/docs" });
    const revokeDown = await answer(await sdk(call(9, "agent.revoke_key", { confirm: true })));
    expect(revokeDown.status).toBe(503);
    expect(JSON.parse(revokeDown.text).result.isError).toBe(true);
    consoleError.mockRestore();
  });

  it("names an unknown tool -32602, as the 2025-11-25 tools page shows", async () => {
    const response = await answer(await sdk(call(5, "no.such.tool")));
    expect(response.status).toBe(200);
    expect(response.text).toBe(JSON.stringify({ jsonrpc: "2.0", id: 5, error: { code: -32602, message: "unknown tool: no.such.tool" } }));
  });

  it("leaves a successful call and a dotted method as a plain caller gets them", async () => {
    const plain = await answer(await post("plain", call(2, "agent.self")));
    const standard = await answer(await sdk(call(2, "agent.self")));
    expect(standard).toMatchObject({ status: 200, text: plain.text });
    expect(standard.headers.get("x-agent-key-expires")).toBe("never");
    // Only tools/call is sent with 200: a dotted method keeps its status.
    mocks.checkAndConsume.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 17 });
    expect((await sdk({ jsonrpc: "2.0", id: 3, method: "agent.self" })).status).toBe(429);
  });

  it("answers a GET that asks for an event stream with 405 and Allow, and any other GET as before", async () => {
    const gets: Record<string, string>[] = [
      { accept: "text/event-stream", "mcp-protocol-version": "2025-11-25", authorization: `Bearer ${KEY}` },
      { accept: "text/event-stream" },
    ];
    for (const headers of gets) {
      const response = await GET(new Request(URL_, { headers }));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
    }
    for (const accept of ["application/json", "text/html,application/xhtml+xml,*/*;q=0.8", "*/*"]) {
      expect((await GET(new Request(URL_, { headers: { accept } }))).status, accept).toBe(200);
    }
    // Only Accept decides: a GET that carries MCP-Protocol-Version but asks
    // for JSON still gets the description.
    const versioned = await GET(new Request(URL_, { headers: { accept: "application/json", "mcp-protocol-version": "2025-11-25" } }));
    expect(versioned.status).toBe(200);
    expect((await versioned.json()).name).toBe("cambridge-tcg");
  });
});

describe("a web page on another site", () => {
  it("is refused with 403 before the body is read, on POST and GET, whatever the caller", async () => {
    for (const caller of ["plain", "bridge", "sdk"] as const) {
      const response = await answer(await post(caller, call(1, "agent.self"), { headers: { origin: "https://elsewhere.example" } }));
      expect(response.status, caller).toBe(403);
      expect(JSON.parse(response.text)).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32600 } });
    }
    const refusedGet = await GET(new Request(URL_, { headers: { origin: "https://elsewhere.example" } }));
    expect(refusedGet.status).toBe(403);
    expect(refusedGet.headers.get("cache-control")).toBe("no-store");
    expect(mocks.resolveAgentBearer).not.toHaveBeenCalled();
  });

  it("refuses a null origin too, which any page on another site can choose to send", async () => {
    // Fetch standard, "append a request Origin header": a POST in no-cors
    // mode with referrer policy "no-referrer" (or "same-origin", cross-site)
    // is sent with Origin: null.
    for (const caller of ["plain", "bridge", "sdk"] as const) {
      const response = await answer(await post(caller, { jsonrpc: "2.0", id: 1, method: "tools/list" }, { headers: { origin: "null" } }));
      expect(response.status, caller).toBe(403);
      expect(JSON.parse(response.text)).toMatchObject({ id: null, error: { code: -32600 } });
    }
    expect((await GET(new Request(URL_, { headers: { origin: " null " } }))).status).toBe(403);
  });

  it("lets this deployment's own origin and a desktop webview through", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cambridgetcg.com");
    for (const origin of ["https://cambridgetcg.com", "vscode-webview://abc"]) {
      expect((await post("sdk", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { headers: { origin } })).status, origin).toBe(200);
    }
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3001");
    expect((await post("plain", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { headers: { origin: "http://127.0.0.1:3001" } })).status).toBe(200);
    expect((await post("plain", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { headers: { origin: "https://cambridgetcg.com" } })).status).toBe(403);
  });
});

describe("the daily count records what the gate decided", () => {
  async function counted() {
    for (const task of afterTasks.splice(0)) await task();
    return vi.mocked(query).mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO mcp_daily"))
      .flatMap(([, params]) => (JSON.parse(String((params as unknown[])[0])) as { method: string; tool: string; authenticated: boolean; outcome: string; count: number }[])
        .flatMap((row) => Array.from({ length: row.count }, () => [row.method, row.tool, row.authenticated, row.outcome])));
  }

  it("counts transport answers under words that already exist, and refusals sent with 200 as refusals", async () => {
    vi.stubEnv("OPS_MCP_DAILY", "on");
    await post("sdk", { jsonrpc: "2.0", method: "notifications/initialized" });
    await sdk({ jsonrpc: "2.0", method: "notifications/cancelled" });
    await sdk({ jsonrpc: "2.0", id: 1, method: "ping" });
    await post("sdk", PROBE, { version: "2026-07-28" });
    await sdk(call(2, "deck.save", { name: "x", entries: [] }));
    mocks.checkAndConsume.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 17 });
    await sdk(call(3, "agent.self"));
    await sdk(call(4, "no.such.tool"));
    await sdk(call(5, "agent.self"));
    await post("plain", call(6, "agent.self"), { headers: { origin: "https://elsewhere.example" } });
    expect(await counted()).toEqual([
      ["notifications/initialized", "none", false, "notification"],
      ["other", "none", false, "notification"],
      ["other", "none", false, "ok"],
      ["other", "none", false, "invalid-request"],
      ["tools/call", "deck.save", true, "forbidden"],
      ["tools/call", "agent.self", true, "rate-limited"],
      ["tools/call", "unknown", true, "not-found"],
      ["tools/call", "agent.self", true, "ok"],
      ["invalid", "none", false, "forbidden"],
    ]);
  });
});
