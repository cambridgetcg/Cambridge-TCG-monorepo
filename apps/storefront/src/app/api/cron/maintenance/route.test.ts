import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The sweeps themselves are not run here: the settled results are given.
const never = vi.hoisted(() => () => new Promise<never>(() => {}));
const inserts = vi.hoisted(() => [] as unknown[][]);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  query: (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("INSERT INTO ops_job_outcomes")) inserts.push(params);
    return /ops_job_outcomes/.test(sql) ? Promise.resolve({ rows: [] }) : never();
  },
  transaction: never,
}));
import { GET } from "./route";

const SWEEPS = 40;
async function run(hour: number, settled: Record<number, PromiseSettledResult<unknown>> = {}) {
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 25, hour, 5)));
  // A value every log line can read: no counts, no lists of failures.
  const value = new Proxy({ ok: true, skipped: true }, { get: (target, key) => key === "then" ? undefined : Reflect.get(target, key) ?? (/failures|errors/i.test(String(key)) ? [] : 0) });
  vi.spyOn(Promise, "allSettled").mockImplementationOnce((async (sweeps: Iterable<unknown>) => {
    const list = [...sweeps];
    for (const sweep of list) Promise.resolve(sweep).catch(() => undefined);
    expect(list).toHaveLength(SWEEPS);
    return list.map((_, index) => settled[index] ?? { status: "fulfilled", value });
  }) as typeof Promise.allSettled);
  const response = await GET(new Request("https://cambridgetcg.example/api/cron/maintenance", { headers: { authorization: "Bearer test-cron-secret" } }));
  return { status: response.status, body: await response.json(), recorded: inserts.splice(0).map(params => [params[3], params[4], JSON.parse(params[5] as string)]) };
}
const rejected = { status: "rejected", reason: new Error("connect ECONNREFUSED person@example.test") } as const;

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.stubEnv("CRON_SECRET", "test-cron-secret"); vi.spyOn(console, "error").mockImplementation(() => undefined); vi.spyOn(console, "log").mockImplementation(() => undefined); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("the minute cron", () => {
  it("answers 200 and records nothing when every sweep was fulfilled", async () => {
    expect(await run(1)).toMatchObject({ status: 200, recorded: [] });
  });

  it("answers 500 and names each rejected sweep, whichever it is, and no word of its error", async () => {
    for (let index = 0; index < SWEEPS; index++) {
      const { status, body, recorded } = await run(2 + index, { [index]: rejected });
      expect([index, status, recorded.length, Object.keys((recorded[0]?.[2] as { rejected?: object })?.rejected ?? {}).length]).toEqual([index, 500, 1, 1]);
      expect(JSON.stringify([body, recorded])).not.toContain("example.test");
    }
  });

  it("calls a reservation sweep that answered a failure rejected", async () => {
    expect(await run(60, { 32: { status: "fulfilled", value: { ok: false, message: "away" } } })).toMatchObject({ status: 500, body: { stockReservations: "rejected" }, recorded: [[500, "unavailable:sweep-rejected", { rejected: { stockReservations: true } }]] });
  });
});
