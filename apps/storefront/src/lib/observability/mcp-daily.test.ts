import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MCP_DAILY_NOTE, MCP_DAILY_UPSERT, countMcpRequest, flushMcpDaily, mcpDailyOn, mcpDailyWrites, mcpMethodAndTool, mcpOutcome, recordMcpDaily, unseenMcpRequest,
} from "./mcp-daily";
import { pruneObservability, retentionCutoffSql, runObservabilityRetentionSweep } from "./retention";

const tools = new Set(["agent.self", "mcp.list_tools", "deck.save"]);
const isTool = (name: string) => tools.has(name);

// Counts wait in the module between requests; each test starts with none.
afterEach(async () => { vi.unstubAllEnvs(); await flushMcpDaily(async () => ({ rows: [] })); });

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
    // The uncounted request left nothing waiting to be written.
    await flushMcpDaily(run);
    expect(run).not.toHaveBeenCalled();
    const row = { day: "2026-11-06", method: "initialize", tool: "none", authenticated: false, outcome: "ok", count: 1 } as const;
    expect(await recordMcpDaily([row], run)).toBe(false);
    run.mockResolvedValue({ rows: [] });
    expect(await recordMcpDaily([row], run)).toBe(true);
    expect(run.mock.calls.at(-1)).toEqual([MCP_DAILY_UPSERT, [JSON.stringify([row])]]);
  });

  it("holds an instance to one counting statement at a time, however many requests it answers", async () => {
    vi.stubEnv("OPS_MCP_DAILY", "on");
    const now = new Date("2026-11-06T10:00:00Z");
    let release: () => void = () => undefined;
    const statements: unknown[][] = [];
    const run = vi.fn(async (_sql: string, params?: unknown[]) => {
      statements.push(JSON.parse(String(params![0])));
      if (statements.length === 1) await new Promise<void>((resolve) => { release = resolve; });
      return { rows: [] };
    });
    const tasks: (() => Promise<unknown>)[] = [];
    const schedule = (task: () => Promise<unknown>) => { tasks.push(task); };
    countMcpRequest({ method: "tools/list", tool: "none", authenticated: false }, 200, schedule, now);
    const first = flushMcpDaily(run);
    // A flood while the first write runs: it joins the next statement.
    for (let i = 0; i < 50; i += 1) countMcpRequest({ method: "invalid", tool: "none", authenticated: false }, 400, schedule, now);
    countMcpRequest({ method: "tools/list", tool: "none", authenticated: false }, 200, schedule, now);
    expect(flushMcpDaily(run)).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(run).toHaveBeenCalledTimes(2);
    expect(statements).toEqual([
      [{ day: "2026-11-06", method: "tools/list", tool: "none", authenticated: false, outcome: "ok", count: 1 }],
      [{ day: "2026-11-06", method: "invalid", tool: "none", authenticated: false, outcome: "invalid-request", count: 50 },
        { day: "2026-11-06", method: "tools/list", tool: "none", authenticated: false, outcome: "ok", count: 1 }],
    ]);
    // Every scheduled task finds nothing left to write.
    for (const task of tasks) await task();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("writes one statement that prunes past 13 months and adds each count to its day's row, with no key column", () => {
    expect(MCP_DAILY_UPSERT).toContain(`DELETE FROM mcp_daily WHERE day < ${retentionCutoffSql("mcp_daily")}`);
    expect(MCP_DAILY_UPSERT).toContain("ON CONFLICT (day, method, tool, authenticated, outcome) DO UPDATE SET count = mcp_daily.count + EXCLUDED.count");
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

describe("runObservabilityRetentionSweep", () => {
  const at = (minute: number) => new Date(`2026-11-06T10:${String(minute).padStart(2, "0")}:00Z`);
  it("runs at minute 23 only, whichever flags are on, and says what went", async () => {
    const run = vi.fn().mockResolvedValue({ rows: [{ ops_job_outcomes: 0, mcp_daily: 1, traffic_hourly: 3, traffic_pulls: 1, error_daily: 0 }] });
    expect(await runObservabilityRetentionSweep(at(22), run)).toEqual({ ranInWindow: false });
    expect(run).not.toHaveBeenCalled();
    expect(await runObservabilityRetentionSweep(at(23), run)).toEqual({ ranInWindow: true, provisioned: true, deleted: { ops_job_outcomes: 0, mcp_daily: 1, traffic_hourly: 3, traffic_pulls: 1, error_daily: 0 } });
  });

  it("finds nothing to sweep before 0148, and lets other errors through", async () => {
    const missing = vi.fn().mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "42P01" }));
    expect(await runObservabilityRetentionSweep(at(23), missing)).toEqual({ ranInWindow: true, provisioned: false });
    await expect(runObservabilityRetentionSweep(at(23), vi.fn().mockRejectedValue(new Error("busy")))).rejects.toThrow("busy");
  });
});
