import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query, transaction } from "@/lib/db";
import { TRAFFIC_PULL_BUDGET_MS } from "@/lib/traffic/pull";
import { GET, maxDuration } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));

const env = { secret: process.env.CRON_SECRET, flag: process.env.TRAFFIC_PULL, token: process.env.VERCEL_TOKEN };
const network = vi.fn<typeof fetch>();
const call = (authorization = "Bearer test-cron-secret") =>
  GET(new Request("https://cambridgetcg.example/api/cron/traffic-pull", { headers: { authorization } }));
const page = (events: Record<string, unknown>[]) => new Response(JSON.stringify({ events, pagination: { hasMore: false, nextCursor: null } }), { status: 200 });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", network);
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.VERCEL_TOKEN = "test-token-not-real";
  delete process.env.TRAFFIC_PULL;
  vi.mocked(transaction).mockImplementation((async (work: (tx: typeof query) => Promise<unknown>) => work(query)) as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of [["CRON_SECRET", env.secret], ["TRAFFIC_PULL", env.flag], ["VERCEL_TOKEN", env.token]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("traffic pull cron", () => {
  it("authenticates before anything else, even with the flag on", async () => {
    process.env.TRAFFIC_PULL = "on";
    expect((await call("Bearer wrong")).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call()).status).toBe(503);
    expect(network).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "off", "ON", "true", "1", " on"])("is disabled for TRAFFIC_PULL=%j and touches neither Vercel nor the database", async (flag) => {
    if (flag !== undefined) process.env.TRAFFIC_PULL = flag;
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ran: false, reason: "disabled" });
    expect(network).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("without VERCEL_TOKEN answers 503 and reads nothing", async () => {
    process.env.TRAFFIC_PULL = "on";
    delete process.env.VERCEL_TOKEN;
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, ran: false, reason: "token-missing", error: { code: "NOT_CONFIGURED" } });
    expect(network).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("before migration 0148 answers 503 NOT_PROVISIONED and asks Vercel nothing", async () => {
    process.env.TRAFFIC_PULL = "on";
    vi.mocked(query).mockRejectedValue(Object.assign(new Error("relation \"traffic_pulls\" does not exist"), { code: "42P01" }));
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ran: false, error: { code: "NOT_PROVISIONED" } });
    expect(network).not.toHaveBeenCalled();
  });

  it("on, counts the uncounted hours and sends the token only to Vercel", async () => {
    process.env.TRAFFIC_PULL = "on";
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    network.mockImplementation(async (_url, init) => JSON.parse(String(init!.body)).event === "vercel.log" ? page([])
      : page([{ requestId: "r1", requestHostname: "cambridgetcg.com", requestPath: "/api/cron/maintenance", httpStatus: 200, clientUserAgent: "vercel-cron/1.0" }]));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, ran: true, report: { stoppedBy: null, pending: 0 } });
    // A first run (no pull row yet) counts the previous hour only: its requests, then its error lines.
    expect(body.report.hours).toEqual([expect.objectContaining({ status: "ok", records: 1, rows: 1 })]);
    expect(network).toHaveBeenCalledTimes(2);
    for (const [url, init] of network.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.vercel\.com\/v1\/observability\/events\?teamId=/);
      expect(new Headers(init!.headers).get("authorization")).toBe("Bearer test-token-not-real");
    }
    expect(JSON.stringify(body)).not.toContain("test-token-not-real");
    expect(log.mock.calls.flat().join(" ")).not.toContain("test-token-not-real");
    log.mockRestore();
  });

  it("answers 503 PULL_FAILED when Vercel refuses the token, and says which hour", async () => {
    process.env.TRAFFIC_PULL = "on";
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    network.mockResolvedValue(new Response("", { status: 403 }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, ran: true, error: { code: "PULL_FAILED" }, report: { stoppedBy: "token-refused", pending: 0 } });
    expect(body.report.hours).toEqual([expect.objectContaining({ status: "failed", code: "token-refused" })]);
    expect(network).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain("test-token-not-real");
    error.mockRestore();
  });

  it("keeps its 240 s budget inside a 300 s function, and is scheduled hourly at :07", () => {
    expect(maxDuration).toBe(300);
    expect(maxDuration * 1000).toBeGreaterThan(TRAFFIC_PULL_BUDGET_MS + 30_000);
    const vercel = JSON.parse(readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toContainEqual({ path: "/api/cron/traffic-pull", schedule: "7 * * * *" });
  });
});
