import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
const clock = new Date().toISOString();

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const flag of ["DATA_COLLECT_CARDMARKET", "DATA_COLLECT_CARDRUSH", "DATA_COLLECT_TCGPLAYER", "DATA_DERIVE_MARKET", "TRAFFIC_PULL"]) vi.stubEnv(flag, "");
});

const onTime = ["reconcile/stripe", "retention/prism-beta", "sweep/maintenance"].map((job) => ({ clock, job, last_ran: clock, last_seen: clock, last_outcome: "ran" }));

describe("/api/v1/health", () => {
  it("says ok only when the database answered and the jobs are on time, and is never cached", async () => {
    vi.mocked(query).mockResolvedValue({ rows: onTime, rowCount: 3 });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data } = await response.json();
    expect(data).toMatchObject({ status: "ok", database: { answered: true, clock }, daily_check: null });
    expect(data.jobs.map((job: { state: string }) => job.state)).toEqual(["off", "off", "off", "off", "off", "ok", "ok", "ok"]);
  });

  it("says degraded when a job is behind", async () => {
    vi.mocked(query).mockResolvedValue({ rows: onTime.slice(1), rowCount: 2 });
    expect((await (await GET()).json()).data).toMatchObject({ status: "degraded", jobs: expect.arrayContaining([expect.objectContaining({ job: "reconcile/stripe", state: "late" })]) });
  });

  it("answers 503 when the database does not, without its error text", async () => {
    vi.mocked(query).mockRejectedValue(new Error("connect ECONNREFUSED 10.1.2.3:5432"));
    const response = await GET();
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text).error.details).toEqual({ status: "down", recommendation: "wait-300s", database: { answered: false } });
    expect(text).not.toContain("10.1.2.3");
  });

  it("does not wait on a database that hangs", async () => {
    vi.useFakeTimers();
    vi.mocked(query).mockReturnValue(new Promise(() => {}));
    const pending = GET();
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await pending).status).toBe(503);
    vi.useRealTimers();
  });
});
