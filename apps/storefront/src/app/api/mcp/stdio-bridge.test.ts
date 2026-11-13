import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

// The stdio bridge (packages/mcp-server), run as a process against a stub
// server on 127.0.0.1. The gate never sends the bridge a 202 (the bridge is
// not a standard MCP client), so neither the route's tests nor the SDK
// harness would notice if the bridge stopped treating 202 like 204; this
// does. Nothing here reaches cambridgetcg.com.

const BRIDGE = path.resolve(__dirname, "../../../../../../packages/mcp-server/src/index.ts");
const TSX_CLI = path.resolve(__dirname, "../../../../node_modules/tsx/dist/cli.mjs");

let server: http.Server;
let endpoint = "";
const seen: Array<{ method: string; status: number }> = [];

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const message = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { id?: unknown; method: string };
    // What a Streamable HTTP server answers: 202 and no body for a
    // notification, one JSON object for a request.
    if (message.id === undefined) {
      seen.push({ method: message.method, status: 202 });
      res.writeHead(202).end();
      return;
    }
    seen.push({ method: message.method, status: 200 });
    res.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {} }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
});

describe("the stdio bridge", () => {
  it("treats a 202 like a 204: nothing on stdout and no diagnostic", async () => {
    // A minimal environment: no key or endpoint from the caller's shell can
    // reach the bridge, which talks only to the stub.
    const env = { PATH: process.env.PATH ?? "", CTCG_MCP_ENDPOINT: endpoint } as unknown as NodeJS.ProcessEnv;
    const child = spawn(process.execPath, [TSX_CLI, BRIDGE], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
    child.stdin.end();
    const code = await new Promise((resolve) => child.on("exit", resolve));

    expect(code).toBe(0);
    expect(seen).toEqual([
      { method: "notifications/initialized", status: 202 },
      { method: "ping", status: 200 },
    ]);
    // Only the request's answer reaches the client.
    expect(stdout).toBe(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })}\n`);
    // The bridge's own start and stop lines, and nothing about the 202.
    expect(stderr).not.toContain("non-JSON");
    expect(stderr.trim().split("\n").filter((line) => !/bridge ready|stdin closed/.test(line))).toEqual([]);
  }, 30_000);
});
