import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MCP_DAILY_NOTE, MCP_DAILY_UPSERT, countMcpRequest, mcpDailyOn, mcpDailyWrites, mcpMethodAndTool, mcpOutcome, recordMcpDaily, unseenMcpRequest,
} from "./mcp-daily";
import { pruneObservability, retentionCutoffSql } from "./retention";

const tools = new Set(["agent.self", "mcp.list_tools", "deck.save"]);
const isTool = (name: string) => tools.has(name);

afterEach(() => vi.unstubAllEnvs());

describe("MCP daily count words", () => {
  it("is on only for exactly on", () => {
    expect([undefined, "", "on", "ON", " on", "on ", "true", "1"].map((value) => mcpDailyOn({ OPS_MCP_DAILY: value }))).toEqual([false, false, true, false, false, false, false, false]);
  });

  it("keeps spec methods and gate tools, and drops every other name", () => {
    expect(mcpMethodAndTool("initialize", undefined, isTool)).toEqual({ method: "initialize", tool: "none" });
    expect(mcpMethodAndTool("tools/call", "agent.self", isTool)).toEqual({ method: "tools/call", tool: "agent.self" });
    expect(mcpMethodAndTool("tools/call", "../../etc/passwd", isTool)).toEqual({ method: "tools/call", tool: "unknown" });
    expect(mcpMethodAndTool("tools/call", { name: "x" }, isTool)).toEqual({ method: "tools/call", tool: "none" });
    expect(mcpMethodAndTool("deck.save", undefined, isTool)).toEqual({ method: "native", tool: "deck.save" });
    expect(mcpMethodAndTool("mcp.list_tools", undefined, isTool)).toEqual({ method: "native", tool: "mcp.list_tools" });
    // A tool the gate has but the counted list does not is unknown, never its name.
    expect(mcpMethodAndTool("agent.new_tool", undefined, (name) => name === "agent.new_tool")).toEqual({ method: "native", tool: "unknown" });
    expect(mcpMethodAndTool("DROP TABLE agents", undefined, isTool)).toEqual({ method: "other", tool: "none" });
  });

  it("reads the outcome from the status unless the gate named it", () => {
    const seen = unseenMcpRequest();
    expect([200, 204, 400, 413, 401, 403, 404, 429, 500, 418].map((status) => mcpOutcome(seen, status)))
      .toEqual(["ok", "notification", "invalid-request", "invalid-request", "unauthenticated", "forbidden", "not-found", "rate-limited", "error", "tool-error"]);
    expect(mcpOutcome({ ...seen, outcome: "unauthenticated" }, 403)).toBe("unauthenticated");
    expect(mcpOutcome({ ...seen, outcome: "tool-error" }, 404)).toBe("tool-error");
  });
});

describe("countMcpRequest", () => {
  it("schedules nothing while off, and one upsert after the response while on", async () => {
    const schedule = vi.fn();
    countMcpRequest({ method: "tools/list", tool: "none", authenticated: false }, 200, schedule);
    expect(schedule).not.toHaveBeenCalled();
    vi.stubEnv("OPS_MCP_DAILY", "on");
    countMcpRequest({ method: "tools/call", tool: "agent.self", authenticated: true }, 429, schedule);
    expect(schedule).toHaveBeenCalledOnce();
  });

  it("drops the count, never the request, outside a request scope or when the write fails", async () => {
    vi.stubEnv("OPS_MCP_DAILY", "on");
    expect(() => countMcpRequest(unseenMcpRequest(), 400, () => { throw new Error("`after` was called outside a request scope"); })).not.toThrow();
    const run = vi.fn().mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "42P01" }));
    expect(await recordMcpDaily({ method: "initialize", tool: "none", authenticated: false, outcome: "ok" }, run)).toBe(false);
    run.mockResolvedValue({ rows: [] });
    expect(await recordMcpDaily({ method: "initialize", tool: "none", authenticated: false, outcome: "ok" }, run)).toBe(true);
    expect(run.mock.calls.at(-1)).toEqual([MCP_DAILY_UPSERT, ["initialize", "none", false, "ok"]]);
  });

  it("writes one statement that prunes past 13 months and adds one to today's row, with no key column", () => {
    expect(MCP_DAILY_UPSERT).toContain(`DELETE FROM mcp_daily WHERE day < ${retentionCutoffSql("mcp_daily")}`);
    expect(MCP_DAILY_UPSERT).toContain("ON CONFLICT (day, method, tool, authenticated, outcome) DO UPDATE SET count = mcp_daily.count + 1");
    expect(MCP_DAILY_UPSERT).not.toMatch(/key|agent|user/i);
  });

  it("names itself in the published metadata lists only while on", () => {
    expect(mcpDailyWrites({})).toEqual([]);
    expect(mcpDailyWrites({ OPS_MCP_DAILY: "on" })).toEqual([MCP_DAILY_NOTE]);
    expect(MCP_DAILY_NOTE).toContain("kept 13 months");
  });
});

describe("pruneObservability", () => {
  it("deletes past each table's period in one statement and counts what went", async () => {
    const run = vi.fn().mockResolvedValue({ rows: [{ ops_job_outcomes: 2, mcp_daily: 0, traffic_hourly: 40, traffic_pulls: 1, error_daily: 0 }] });
    expect(await pruneObservability(run)).toEqual({ ops_job_outcomes: 2, mcp_daily: 0, traffic_hourly: 40, traffic_pulls: 1, error_daily: 0 });
    const sql = run.mock.calls[0]![0] as string;
    expect(sql).toContain("DELETE FROM traffic_hourly WHERE hour < now() - interval '35 days'");
    expect(sql).toContain("DELETE FROM traffic_pulls WHERE window_start < now() - interval '35 days'");
    expect(sql).toContain("DELETE FROM ops_job_outcomes WHERE started_at < now() - interval '13 months'");
    expect(sql).toContain("DELETE FROM error_daily WHERE day < ((now() AT TIME ZONE 'UTC')::date - interval '13 months')::date");
    expect(run).toHaveBeenCalledOnce();
  });
});
