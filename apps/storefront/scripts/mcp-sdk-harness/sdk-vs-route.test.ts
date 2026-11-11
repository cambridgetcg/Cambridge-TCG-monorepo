/**
 * The MCP SDK harness: the real /api/mcp route, served on 127.0.0.1 with the
 * database, the key lookup, the rate limiter and the tool handlers mocked as
 * route.test.ts mocks them, driven by the official MCP SDK clients and by the
 * stdio bridge itself. Nothing here reaches cambridgetcg.com or a database.
 *
 * It runs by hand, not in the app's suite. The SDKs are not dependencies of
 * this app: adding @modelcontextprotocol/sdk 1.32.2 and
 * @modelcontextprotocol/client 2.4.0 as devDependencies would add about 40
 * packages to pnpm-lock.yaml, an HTTP server stack among them (express 5,
 * hono, cors), installed on every build for one test. Install them outside
 * the repository once and point MCP_SDK_DIR at that node_modules:
 *
 *   mkdir -p /tmp/mcp-sdks && cd /tmp/mcp-sdks && npm init -y > /dev/null
 *   npm install @modelcontextprotocol/sdk@1.32.2 @modelcontextprotocol/client@2.4.0
 *   cd <repository>/apps/storefront
 *   MCP_SDK_DIR=/tmp/mcp-sdks/node_modules pnpm exec vitest run --config scripts/mcp-sdk-harness/vitest.config.mts
 *
 * route.test.ts replays, request by request, what each SDK and the bridge sent
 * here, so the app's suite holds the same answers without the SDKs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));
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
vi.mock("@/lib/agents/key-revocation", () => ({ revokePresentedKey: vi.fn() }));
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

import { GET, POST } from "@/app/api/mcp/route";

const SDK_DIR = process.env.MCP_SDK_DIR?.trim() ?? "";
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../..");
const BRIDGE = path.resolve(app, "../../packages/mcp-server/src/index.ts");
const TSX = path.join(app, "node_modules/.bin/tsx");
const REFUSAL = "cambridgetcg.com/refusal";

// Built here, never a real key.
const TOKEN = "ctcg_agt_" + "Hn4".repeat(7) + "W";
const actor = {
  agentId: "agent-1", operatorUserId: "user-1", keyId: "key-1", agentPublicHandle: "agent-one",
  rateLimitTier: "free", registeredVia: "operator", keyExpiresAt: null,
} as const;

type Json = Record<string, unknown>;
type Seen = { who: string; method: string; rpc?: string; id: boolean; accept: string | null; version: string | null; status: number };
interface SdkClient {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(params: { name: string; arguments: Json }): Promise<{ isError?: boolean; _meta?: Json; content?: unknown }>;
  ping(): Promise<unknown>;
  onerror?: (error: unknown) => void;
}
type ClientClass = new (info: { name: string; version: string }, options?: Json) => SdkClient;
type TransportClass = new (url: URL, options: Json) => unknown;

const log: Seen[] = [];
let who = "";
let server: http.Server;
let base = "";

/** What each case saw, printed as it ends. */
function report(result: Json) {
  console.log(JSON.stringify(result, null, 1));
}

function version(pkg: string): string {
  return (JSON.parse(readFileSync(path.join(SDK_DIR, pkg, "package.json"), "utf8")) as { version: string }).version;
}

async function sdk1(): Promise<{ Client: ClientClass; Transport: TransportClass; version: string }> {
  const client = await import(/* @vite-ignore */ path.join(SDK_DIR, "@modelcontextprotocol/sdk/dist/esm/client/index.js"));
  const transport = await import(/* @vite-ignore */ path.join(SDK_DIR, "@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js"));
  return { Client: client.Client, Transport: transport.StreamableHTTPClientTransport, version: version("@modelcontextprotocol/sdk") };
}

async function sdk2(): Promise<{ Client: ClientClass; Transport: TransportClass; version: string }> {
  const client = await import(/* @vite-ignore */ path.join(SDK_DIR, "@modelcontextprotocol/client/dist/index.mjs"));
  return { Client: client.Client, Transport: client.StreamableHTTPClientTransport, version: version("@modelcontextprotocol/client") };
}

beforeAll(async () => {
  if (!SDK_DIR) throw new Error("Set MCP_SDK_DIR to a node_modules holding both SDKs (see the comment at the top of this file).");
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
    const url = `${base}${req.url}`;
    let rpc: string | undefined;
    let id = false;
    try {
      const message = JSON.parse(body) as Json;
      rpc = typeof message.method === "string" ? message.method : undefined;
      id = "id" in message;
    } catch {}
    let response: Response;
    if (req.url?.startsWith("/api/mcp")) {
      if (req.method === "POST") response = await POST(new Request(url, { method: "POST", headers, body }));
      else if (req.method === "GET") response = await GET(new Request(url, { method: "GET", headers }));
      else response = new Response(null, { status: 405 }); // what Next answers for a method the route does not export
    } else {
      response = new Response("not found", { status: 404 });
    }
    log.push({ who, method: req.method ?? "", rpc, id, accept: headers.get("accept"), version: headers.get("mcp-protocol-version"), status: response.status });
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
});

beforeEach(() => {
  mocks.resolveAgentBearer.mockImplementation(async (header: string | null) =>
    header === `Bearer ${TOKEN}`
      ? { ok: true, actor }
      : { ok: false, status: 401, reason_code: "missing_credentials", error: "missing Authorization header" });
  mocks.checkAndConsume.mockResolvedValue({ allowed: true, remaining: 9, resetSeconds: 30 });
  mocks.canInvokeAgentTool.mockImplementation((_via: string, name: string) => name !== "deck.save");
  mocks.agentSelf.mockResolvedValue({ public_handle: "agent-one" });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function caught(run: () => Promise<unknown>): Promise<{ code?: unknown; data?: unknown; message: string }> {
  try {
    await run();
  } catch (error) {
    const e = error as { code?: unknown; data?: unknown; message?: unknown };
    return { code: e.code, data: e.data, message: String(e.message) };
  }
  throw new Error("expected the call to throw");
}

function lines(label: string) {
  return log.filter((entry) => entry.who === label).map((entry) => `${entry.method} ${entry.rpc ?? ""}${entry.id ? "" : " (no id)"} accept=${entry.accept} version=${entry.version} -> ${entry.status}`);
}

async function connected(label: string, Client: ClientClass, Transport: TransportClass, options: Json, key: boolean) {
  who = label;
  const errors: string[] = [];
  const client = new Client({ name: "sdk-harness", version: "0" }, options);
  client.onerror = (error) => errors.push(String((error as Error)?.message ?? error).slice(0, 160));
  const transport = new Transport(new URL(`${base}/api/mcp`), {
    requestInit: { headers: key ? { Authorization: `Bearer ${TOKEN}` } : {} },
  });
  await client.connect(transport);
  return { client, errors };
}

/** Everything the brief asks of a keyed client, then a wait for any GET loop. */
async function keyed(label: string, Client: ClientClass, Transport: TransportClass, options: Json, sdkVersion: string) {
  const { client, errors } = await connected(label, Client, Transport, options, true);
  const tools = await client.listTools();
  const self = await client.callTool({ name: "agent.self", arguments: {} });
  const refused = await client.callTool({ name: "deck.save", arguments: { name: "x", entries: [] } });
  const unknown = await caught(() => client.callTool({ name: "no.such.tool", arguments: {} }));
  mocks.checkAndConsume.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 17 });
  const limited = await caught(() => client.callTool({ name: "agent.self", arguments: {} }));
  const ping = await client.ping();
  await sleep(2_500);
  await client.close();

  const mine = log.filter((entry) => entry.who === label);
  const gets = mine.filter((entry) => entry.method === "GET");
  const result = {
    label, sdk: sdkVersion, tools: tools.tools.length, selfIsError: self.isError,
    refused: { isError: refused.isError, reason_code: (refused._meta?.[REFUSAL] as Json | undefined)?.reason_code },
    unknownTool: unknown.code, rateLimited: { code: limited.code, reason_code: (limited.data as Json | undefined)?.reason_code },
    ping, gets: gets.map((entry) => entry.status), errors, requests: lines(label),
  };
  report(result);

  expect(tools.tools.map((tool) => tool.name)).toContain("agent.self");
  expect(self.isError).toBe(false);
  // The typed refusal reaches the client, in _meta, without a throw.
  expect(refused.isError).toBe(true);
  expect(refused._meta?.[REFUSAL]).toMatchObject({ reason_code: "tool_not_permitted", terminal: true });
  expect(unknown.code).toBe(-32602);
  expect(limited.code).toBe(-32002);
  expect(limited.data).toMatchObject({ reason_code: "rate_limited", retry_after_seconds: 17 });
  expect(ping).toEqual({});
  // The revision the client asked for, then 202 and one GET answered 405: no loop.
  expect(mine.find((entry) => entry.rpc === "tools/list")?.version).toBe("2025-11-25");
  expect(mine.find((entry) => entry.rpc === "notifications/initialized")?.status).toBe(202);
  expect(gets.map((entry) => entry.status)).toEqual([405]);
  expect(errors).toEqual([]);
  return mine;
}

/** A client with no key: discovery works, a tool call reports the 401 and its refusal. */
async function keyless(label: string, Client: ClientClass, Transport: TransportClass, options: Json, sdkVersion: string) {
  const { client, errors } = await connected(label, Client, Transport, options, false);
  const tools = await client.listTools();
  const call = await caught(() => client.callTool({ name: "agent.self", arguments: {} }));
  await client.close();
  report({ label, sdk: sdkVersion, tools: tools.tools.length, callThrew: call.message.slice(0, 200), errors, requests: lines(label) });
  expect(tools.tools.length).toBeGreaterThan(0);
  expect(JSON.stringify(call)).toContain("401");
  expect(JSON.stringify(call)).toContain("missing_credentials");
  return log.filter((entry) => entry.who === label);
}

describe("@modelcontextprotocol/sdk 1.x (StreamableHTTPClientTransport)", () => {
  it("connects with a key, lists, calls, reads a refusal, pings, and opens no GET loop", async () => {
    const { Client, Transport, version: sdkVersion } = await sdk1();
    await keyed("sdk1-key", Client, Transport, {}, sdkVersion);
  });

  it("connects with no key; a tool call reports the 401", async () => {
    const { Client, Transport, version: sdkVersion } = await sdk1();
    await keyless("sdk1-nokey", Client, Transport, {}, sdkVersion);
  });
});

describe("@modelcontextprotocol/client 2.x", () => {
  it("in its default mode, as SDK 1.x", async () => {
    const { Client, Transport, version: sdkVersion } = await sdk2();
    const seen = await keyed("sdk2-default-key", Client, Transport, {}, sdkVersion);
    expect(seen.some((entry) => entry.rpc === "server/discover")).toBe(false);
  });

  it("in auto mode, falls back from the server/discover probe to initialize", async () => {
    const { Client, Transport, version: sdkVersion } = await sdk2();
    const seen = await keyed("sdk2-auto-key", Client, Transport, { versionNegotiation: { mode: "auto" } }, sdkVersion);
    expect(seen[0]).toMatchObject({ rpc: "server/discover", version: "2026-07-28", status: 400 });
    expect(seen[1]).toMatchObject({ rpc: "initialize", status: 200 });
  });

  it("in auto mode with no key, falls back and connects (the probe no longer needs a key)", async () => {
    const { Client, Transport, version: sdkVersion } = await sdk2();
    const seen = await keyless("sdk2-auto-nokey", Client, Transport, { versionNegotiation: { mode: "auto" } }, sdkVersion);
    expect(seen[0]).toMatchObject({ rpc: "server/discover", status: 400 });
  });
});

describe("the stdio bridge (packages/mcp-server), run as a process", () => {
  it("gets the answers it got before: 2024-11-05, 204, the refusal status, -32601", async () => {
    who = "bridge";
    const messages = [
      { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "harness", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "deck.save", arguments: { name: "x", entries: [] } } },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "no.such.tool", arguments: {} } },
      { jsonrpc: "2.0", id: 4, method: "ping" },
    ];
    const child = spawn(TSX, [BRIDGE], {
      env: { ...process.env, CTCG_MCP_ENDPOINT: `${base}/api/mcp`, CTCG_AGENT_TOKEN: TOKEN },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdin.end();
    await new Promise((resolve) => child.on("exit", resolve));
    const answers = stdout.trim().split("\n").map((line) => JSON.parse(line) as Json & { result?: Json; error?: Json });
    report({ label: "bridge", answers: answers.map((answer) => answer.error ?? Object.keys(answer.result ?? {})), stderr: stderr.trim().split("\n"), requests: lines("bridge") });

    expect(answers.map((answer) => answer.id)).toEqual([0, 1, 2, 3, 4]);
    expect(answers[0].result?.protocolVersion).toBe("2024-11-05");
    expect(answers[2].result).toMatchObject({ isError: true, _meta: { [REFUSAL]: { reason_code: "tool_not_permitted" } } });
    expect(answers[3].error).toMatchObject({ code: -32601 });
    expect(answers[4].error).toMatchObject({ code: -32601 });
    expect(log.filter((entry) => entry.who === "bridge").map((entry) => entry.status)).toEqual([200, 204, 200, 403, 404, 404]);
    expect(stderr).not.toContain("non-JSON");
  });
});
