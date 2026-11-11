import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// agent.act at the MCP gate: its own carve-out before resolveAgentBearer,
// never through canInvokeAgentTool or the self-lifecycle carve-out, with
// Authorization ignored (docs/plans/agent-auth/held-keys.md, Transport).

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
const afterTasks = vi.hoisted(() => [] as (() => Promise<unknown>)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => { afterTasks.push(task); },
}));

const mocks = vi.hoisted(() => ({
  resolveAgentBearer: vi.fn(),
  canInvokeAgentTool: vi.fn(),
  revokePresentedKey: vi.fn(),
  submitAgentAct: vi.fn(),
}));

vi.mock("@/lib/agents/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/auth")>()),
  resolveAgentBearer: mocks.resolveAgentBearer,
}));
vi.mock("@/lib/agents/key-revocation", () => ({ revokePresentedKey: mocks.revokePresentedKey }));
vi.mock("@/lib/agents/tool-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/tool-access")>()),
  canInvokeAgentTool: mocks.canInvokeAgentTool,
}));
vi.mock("@/lib/agents/signed-acts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/signed-acts")>();
  mocks.submitAgentAct.mockImplementation(actual.submitAgentAct);
  return { ...actual, submitAgentAct: mocks.submitAgentAct };
});

import { query, transaction } from "@/lib/db";
import { GET, POST } from "./route";
import { SELF_LIFECYCLE_TOOLS, SIGNED_ACT_TOOLS, describeAgentToolGrant } from "@/lib/agents/tool-access";
import { signedActRefusal, signedActLimitedRefusal, MCP_REFUSAL_META_KEY } from "@/lib/agents/refusals";

const BEARER = "Bearer ctcg_agt_" + "Ab1".repeat(7) + "Z";

function request(method: string, params: Record<string, unknown> = {}, authorization: string | null = null, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { "content-type": "application/json", ...headers };
  if (authorization) all.authorization = authorization;
  return new Request("https://cambridgetcg.example/api/mcp", {
    method: "POST",
    headers: all,
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("AGENT_SIGNED_ACTS", "");
  vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "");
  afterTasks.length = 0;
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockReset();
  mocks.resolveAgentBearer.mockReset();
  mocks.canInvokeAgentTool.mockReset();
  mocks.revokePresentedKey.mockReset();
  mocks.submitAgentAct.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("agent.act while closed (the default)", () => {
  it("answers signed_acts_closed under tools/call and dotted dispatch, with or without a bearer, touching nothing", async () => {
    for (const authorization of [null, BEARER, "Bearer nonsense"]) {
      const call = await POST(request("tools/call", { name: "agent.act", arguments: { act: "a.b.c", preview: null } }, authorization));
      expect(call.status).toBe(503);
      const callBody = await call.json();
      expect(callBody.result.isError).toBe(true);
      expect(callBody.result._meta[MCP_REFUSAL_META_KEY]).toEqual(signedActRefusal("signed_acts_closed"));
      expect(callBody.result.content[0].text).toContain("Signed acts are closed");

      const dotted = await POST(request("agent.act", { preview: "key.mint" }, authorization));
      expect(dotted.status).toBe(503);
      expect((await dotted.json()).error.data.reason_code).toBe("signed_acts_closed");
    }
    expect(mocks.resolveAgentBearer).not.toHaveBeenCalled();
    expect(mocks.canInvokeAgentTool).not.toHaveBeenCalled();
    expect(mocks.revokePresentedKey).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("is listed with a ['string', 'null'] schema, in a tool set of its own", async () => {
    const listed = await (await POST(request("tools/list"))).json();
    const tool = listed.result.tools.find((entry: { name: string }) => entry.name === "agent.act");
    expect(tool.inputSchema).toMatchObject({
      type: "object",
      properties: { act: { type: ["string", "null"] }, preview: { type: ["string", "null"] } },
      additionalProperties: false,
    });
    expect(tool.inputSchema.required).toBeUndefined();
    expect(tool.description).toContain("Authorization is ignored");
    expect(tool.description).toContain("signed_acts_closed");
    expect(SIGNED_ACT_TOOLS.has("agent.act")).toBe(true);
    expect(SELF_LIFECYCLE_TOOLS.has("agent.act")).toBe(false);
    // Closed, no grant lists it: an operator-managed agent cannot use it here.
    expect(describeAgentToolGrant("operator").signed_acts).toEqual([]);
    expect(describeAgentToolGrant("self-serve").signed_acts).toEqual([]);
    const native = await (await POST(request("mcp.list_tools"))).json();
    expect(native.result.tools.map((entry: { name: string }) => entry.name)).toContain("agent.act");
  });

  it("never names Yu, or the owner, in initialize, tools/list or GET /api/mcp", async () => {
    // Who decided is for the documents (public-claims-contract.test.ts);
    // what the gate serves to agents says only what the tool does.
    const served = [
      JSON.stringify((await (await POST(request("initialize"))).json()).result),
      JSON.stringify((await (await POST(request("tools/list"))).json()).result),
      JSON.stringify((await (await POST(request("mcp.list_tools"))).json()).result),
      JSON.stringify(await (await GET()).json()),
    ];
    for (const text of served) {
      expect(text).toContain("agent.act");
      expect(text.match(/\bYu\b|\bthe owner\b/i)?.[0]).toBeUndefined();
    }
  });

  it("names agent.act beside mcp.list_tools as the calls that need no bearer", async () => {
    const init = await (await POST(request("initialize"))).json();
    expect(init.result.instructions).toContain("except `mcp.list_tools` and `agent.act` require bearer auth");
  });
});

describe("agent.act while open", () => {
  beforeEach(() => {
    vi.stubEnv("AGENT_SIGNED_ACTS", "on");
    vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "https://cambridgetcg.com");
  });

  it("lists agent.act in an operator-managed agent's grant only while this deployment is open", () => {
    expect(describeAgentToolGrant("operator").signed_acts).toEqual(["agent.act"]);
    expect(describeAgentToolGrant("self-serve").signed_acts).toEqual([]);
    vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "");
    expect(describeAgentToolGrant("operator").signed_acts).toEqual([]);
  });

  it("passes only the tool's arguments and the client address; Authorization changes nothing", async () => {
    const answers = [];
    for (const authorization of [null, BEARER]) {
      const response = await POST(request(
        "tools/call",
        { name: "agent.act", act: "beside-the-name", arguments: { preview: "key.mint", act: null } },
        authorization,
        { "x-real-ip": "172.64.1.2", "cf-connecting-ip": "203.0.113.5" },
      ));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result.isError).toBe(false);
      expect(body.result.content[0].text.startsWith("Preview of key.mint. Nothing was read or written.")).toBe(true);
      const { server_time: _time, ...rest } = JSON.parse(body.result.content[0].text.split("\n\n").slice(1).join("\n\n"));
      answers.push(rest);
    }
    expect(answers[0]).toEqual(answers[1]);
    for (const [args, context] of mocks.submitAgentAct.mock.calls) {
      expect(args).toEqual({ preview: "key.mint", act: null });
      expect(context).toEqual({ clientAddress: "203.0.113.5" });
    }
    expect(mocks.resolveAgentBearer).not.toHaveBeenCalled();
    expect(mocks.canInvokeAgentTool).not.toHaveBeenCalled();
  });

  it("carries a refusal in the typed shape, with Retry-After when limited", async () => {
    mocks.submitAgentAct.mockResolvedValueOnce({
      ok: false, status: 429, message: "Too many acts.", refusal: signedActLimitedRefusal(17), verified: false, retryAfterSeconds: 17,
    });
    const response = await POST(request("tools/call", { name: "agent.act", arguments: { act: "x", preview: null } }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect((await response.json()).result._meta[MCP_REFUSAL_META_KEY]).toMatchObject({ reason_code: "act_limited", retry_after_seconds: 17 });
  });

  it("counts agent.act by its own word, authenticated only when a signature verified", async () => {
    vi.stubEnv("OPS_MCP_DAILY", "on");
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.submitAgentAct.mockResolvedValueOnce({ ok: true, status: 200, lead: "Checked.", body: { act: "signer.check" }, verified: true });
    await POST(request("tools/call", { name: "agent.act", arguments: { act: "x", preview: null } }));
    mocks.submitAgentAct.mockResolvedValueOnce({ ok: false, status: 403, message: "no", refusal: signedActRefusal("act_unverified"), verified: false });
    await POST(request("agent.act", { act: "x" }));
    vi.stubEnv("AGENT_SIGNED_ACTS", "");
    await POST(request("tools/call", { name: "agent.act", arguments: { act: "x" } }, BEARER));
    for (const task of afterTasks.splice(0)) await task();
    const counted = vi.mocked(query).mock.calls
      .filter(([sql]) => String(sql).includes("INSERT INTO mcp_daily"))
      .flatMap(([, params]) => (JSON.parse(String((params as unknown[])[0])) as { method: string; tool: string; authenticated: boolean; outcome: string; count: number }[])
        .flatMap((row) => Array.from({ length: row.count }, () => [row.method, row.tool, row.authenticated, row.outcome])));
    expect(counted).toEqual([
      ["tools/call", "agent.act", true, "ok"],
      ["native", "agent.act", false, "forbidden"],
      ["tools/call", "agent.act", false, "forbidden"],
    ]);
  });
});
