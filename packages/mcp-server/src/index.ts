#!/usr/bin/env node
/**
 * @cambridge-tcg/mcp-server — MCP stdio bridge for Cambridge TCG.
 *
 * Pipes a local MCP client (Claude Desktop, Cursor, Continue, Cline, Zed,
 * any client expecting a local stdio MCP server) to the remote HTTPS MCP
 * gate at https://cambridgetcg.com/api/mcp. Newline-delimited JSON-RPC 2.0
 * messages on stdin become HTTPS POSTs; responses are written to stdout.
 *
 * Usage after building this vendored package from a repository clone:
 *
 *     {
 *       "mcpServers": {
 *         "cambridge-tcg": {
 *           "command": "node",
 *           "args": ["/path/to/Cambridge-TCG-monorepo/packages/mcp-server/dist/index.js"],
 *           "env": {
 *             "CTCG_AGENT_TOKEN": "ctcg_agt_<your-token>"
 *           }
 *         }
 *       }
 *     }
 *
 * Provision an agent token at https://cambridgetcg.com/account/agents.
 * Token can also be passed as the first CLI argument:
 *
 *     node dist/index.js ctcg_agt_<your-token>
 *
 * Without a token, public discovery (`tools/list`, `initialize`) works;
 * `tools/call` requests will return an unauthenticated error from the
 * server — the bridge surfaces it to the client unchanged.
 *
 * The bridge creates no local behavioral profile. Its HTTPS request can still
 * appear in client, DNS, proxy, hosting, and security logs. Allowed bearer
 * calls also write bounded server-side rate and last-used metadata.
 *
 * License: CC0-1.0.
 */

import { createInterface } from "node:readline";

// ── Config ──────────────────────────────────────────────────────────────

const ENDPOINT =
  process.env.CTCG_MCP_ENDPOINT?.trim() ||
  "https://cambridgetcg.com/api/mcp";

const TOKEN =
  process.env.CTCG_AGENT_TOKEN?.trim() ||
  process.argv[2]?.trim() ||
  "";

const USER_AGENT =
  process.env.CTCG_USER_AGENT?.trim() ||
  `@cambridge-tcg/mcp-server/0.1.0 (Node ${process.version})`;

// stderr diagnostics for the client (Claude Desktop shows these in logs).
function diag(line: string): void {
  process.stderr.write(`[ctcg-mcp] ${line}\n`);
}

// ── JSON-RPC types (minimal) ────────────────────────────────────────────

interface JsonRpcMessage {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Bridge ──────────────────────────────────────────────────────────────

function writeOut(msg: JsonRpcMessage): void {
  // MCP stdio = newline-delimited JSON, one message per line. No pretty
  // printing — embedded newlines break the framing.
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function forward(req: JsonRpcMessage): Promise<JsonRpcMessage | null> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": USER_AGENT,
  };
  if (TOKEN) {
    headers.authorization = `Bearer ${TOKEN}`;
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(req),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diag(`network error on ${req.method ?? "?"}: ${message}`);
    return {
      jsonrpc: "2.0",
      id: req.id ?? null,
      error: {
        code: -32603,
        message: `Network error reaching ${ENDPOINT}: ${message}`,
      },
    };
  }

  // 204 = notification acknowledgement (no body). MCP notifications expect
  // no response from the bridge.
  if (response.status === 204) {
    return null;
  }

  let body: JsonRpcMessage;
  try {
    body = (await response.json()) as JsonRpcMessage;
  } catch (err) {
    const text = await response.text().catch(() => "<unreadable>");
    diag(
      `non-JSON response (status ${response.status}) on ${req.method ?? "?"}: ${text.slice(0, 200)}`,
    );
    return {
      jsonrpc: "2.0",
      id: req.id ?? null,
      error: {
        code: -32603,
        message: `Server returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`,
      },
    };
  }

  // Ensure jsonrpc field is present (server should send it but be tolerant).
  if (!body.jsonrpc) {
    body.jsonrpc = "2.0";
  }
  return body;
}

// ── Main loop ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (TOKEN) {
    diag(`bridge ready (endpoint=${ENDPOINT}, auth=bearer)`);
  } else {
    diag(
      `bridge ready (endpoint=${ENDPOINT}, auth=none — tools/call will return unauthenticated)`,
    );
  }

  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  // Sequential per-line processing keeps message ordering deterministic.
  // MCP allows concurrent requests, but stdio framing benefits from order
  // and the remote endpoint is plenty fast for the few-per-second cadence
  // of a typical MCP session.
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let req: JsonRpcMessage;
    try {
      req = JSON.parse(trimmed) as JsonRpcMessage;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      diag(`unparseable line: ${trimmed.slice(0, 200)} — ${message}`);
      writeOut({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: `Parse error: ${message}` },
      });
      continue;
    }

    // Notifications (no id) get no response; forward, drop response.
    const isNotification = req.id === undefined || req.id === null;

    const res = await forward(req);
    if (isNotification) {
      continue;
    }
    if (res) {
      writeOut(res);
    }
  }

  diag("stdin closed; exiting");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  diag(`fatal: ${message}`);
  process.exit(1);
});
