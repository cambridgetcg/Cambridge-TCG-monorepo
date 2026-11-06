/**
 * The MCP gate's daily counts (mcp_daily, migration 0148): requests per UTC
 * day by JSON-RPC method, tool, whether the request authenticated, and how
 * the gate answered. It is the one thing request logs cannot show, since the
 * method and tool are in the body.
 *
 * Off unless OPS_MCP_DAILY is exactly "on", and that waits for the /privacy
 * note that names it. On, each request adds one to one row after its
 * response is sent (next/server after): nothing about it changes how the
 * request is answered, and a write that fails is dropped, never the
 * request. Every word comes from vocabulary.ts: a method or tool name the
 * gate does not know is counted as other or unknown and the name itself is
 * not kept. No key, agent or account id is written, so the counts cannot say
 * which key called which tool; a key's own minute counts stay in
 * agent_rate_buckets.
 */

import { after } from "next/server";
import { MCP_METHODS, MCP_TOOLS, includes, type McpMethod, type McpOutcome, type McpTool } from "./vocabulary";
import { expiredRowsSql, retentionLabel } from "./retention";

export const MCP_DAILY_FLAG = "OPS_MCP_DAILY";

export function mcpDailyOn(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[MCP_DAILY_FLAG] === "on";
}

/** What the gate saw of one request, filled in as it handles it. */
export interface McpRequestSeen {
  method: McpMethod;
  tool: McpTool;
  authenticated: boolean;
  /** Set where the status alone would not tell (a bearer refused with 403
   * reads unauthenticated; a tool refusing with 403 reads forbidden). */
  outcome?: McpOutcome;
}

export function unseenMcpRequest(): McpRequestSeen {
  return { method: "invalid", tool: "none", authenticated: false };
}

const SPEC_METHODS: readonly McpMethod[] = MCP_METHODS.filter(method => !["native", "other", "invalid"].includes(method));

/** The method and tool words for a request's method and, for tools/call, the
 * tool name it gives. `isTool` says whether the gate has a tool by that name. */
export function mcpMethodAndTool(method: string, toolName: unknown, isTool: (name: string) => boolean): Pick<McpRequestSeen, "method" | "tool"> {
  if (includes(SPEC_METHODS, method)) {
    if (method !== "tools/call") return { method, tool: "none" };
    if (typeof toolName !== "string" || !toolName) return { method, tool: "none" };
    return { method, tool: isTool(toolName) && includes(MCP_TOOLS, toolName) ? toolName : "unknown" };
  }
  if (isTool(method)) return { method: "native", tool: includes(MCP_TOOLS, method) ? method : "unknown" };
  return { method: "other", tool: "none" };
}

export function mcpOutcome(seen: McpRequestSeen, status: number): McpOutcome {
  if (seen.outcome) return seen.outcome;
  if (status === 204) return "notification";
  if (status >= 200 && status < 300) return "ok";
  if (status === 400 || status === 413) return "invalid-request";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "error";
  return "tool-error";
}

type RunQuery = (sql: string, params?: unknown[]) => Promise<unknown>;

/** One statement: today's row for these words gains one, and rows past
 * retention (13 months) go, as agent_rate_buckets prunes itself. */
export const MCP_DAILY_UPSERT = `WITH expired AS (
    DELETE FROM mcp_daily WHERE ${expiredRowsSql("mcp_daily")}
  )
  INSERT INTO mcp_daily (day, method, tool, authenticated, outcome, count)
  VALUES ((now() AT TIME ZONE 'UTC')::date, $1, $2, $3, $4, 1)
  ON CONFLICT (day, method, tool, authenticated, outcome) DO UPDATE SET count = mcp_daily.count + 1`;

export async function recordMcpDaily(row: { method: McpMethod; tool: McpTool; authenticated: boolean; outcome: McpOutcome }, runQuery?: RunQuery): Promise<boolean> {
  try {
    const run = runQuery ?? (await import("@/lib/db")).query as RunQuery;
    await run(MCP_DAILY_UPSERT, [row.method, row.tool, row.authenticated, row.outcome]);
    return true;
  } catch {
    // Before 0148, or the database is busy: the count is dropped, quietly.
    // A log line per request would be a per-request record of its own.
    return false;
  }
}

/** Counts one answered request, after its response, while the flag is on.
 * Outside a request (a script, a test without a request scope) after()
 * throws, and nothing is counted. */
export function countMcpRequest(seen: McpRequestSeen, status: number, schedule: (task: () => Promise<unknown>) => void = after): void {
  if (!mcpDailyOn()) return;
  const row = { method: seen.method, tool: seen.tool, authenticated: seen.authenticated, outcome: mcpOutcome(seen, status) };
  try {
    schedule(() => recordMcpDaily(row));
  } catch {
    // No request scope: the request is answered as ever, uncounted.
  }
}

/** The line the gate's published operational-metadata lists add while
 * counting is on (GET /api/mcp, /.well-known/mcp.json, mcp-config.json). */
export const MCP_DAILY_NOTE =
  `an aggregate count per UTC day of requests by JSON-RPC method, tool, authenticated or not, and outcome, with no key, agent or account id (kept ${retentionLabel("mcp_daily")})`;

export function mcpDailyWrites(env?: Readonly<Record<string, string | undefined>>): string[] {
  return mcpDailyOn(env) ? [MCP_DAILY_NOTE] : [];
}
