import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeHeartbeat } from "@/lib/heartbeat";
import { DAILY_CHECK, SCHEDULED_JOBS, readHealth, within } from "./job-health";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const NOW = "2026-11-25 08:40:00.123456+00";
const ago = (hours: number) => new Date(Date.parse("2026-11-25T08:40:00.123Z") - hours * 3_600_000).toISOString();
const rows = (...jobs: Record<string, unknown>[]) => vi.fn().mockResolvedValue({ rows: (jobs.length ? jobs : [{ job: null }]).map(job => ({ clock: NOW, ...job })) });
const state = async (run: ReturnType<typeof rows>, job: string) => (await readHealth(run)).jobs.find(entry => entry.job === job)?.state;

beforeEach(() => {
  for (const flag of ["DATA_COLLECT_CARDMARKET", "DATA_COLLECT_CARDRUSH", "DATA_COLLECT_TCGPLAYER", "DATA_DERIVE_MARKET", "TRAFFIC_PULL"]) vi.stubEnv(flag, "on");
});
afterEach(() => vi.unstubAllEnvs());

describe("job health", () => {
  it("lists every cron in vercel.json, and the daily check beside them, as the heartbeat does", () => {
    const { crons } = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect([...SCHEDULED_JOBS.map(job => job.path), DAILY_CHECK.path].sort()).toEqual(crons.map(cron => cron.path).sort());
    expect(computeHeartbeat().cron_schedule.map(({ path, schedule }) => ({ path, schedule }))).toEqual(crons);
  });

  it("tells on time, behind, silent and switched off apart", async () => {
    expect(await state(rows({ job: "derive/market", last_ran: ago(1.7), last_seen: ago(1.7) }), "derive/market")).toBe("ok");
    // This morning's 07:00 run missed or failed: seen at 08:40 the same day.
    expect(await state(rows({ job: "derive/market", last_ran: ago(25.7), last_seen: ago(1.7) }), "derive/market")).toBe("failing");
    expect(await state(rows({ job: "derive/market", last_ran: ago(25.7), last_seen: ago(25.7) }), "derive/market")).toBe("late");
    expect(await state(rows(), "sweep/maintenance")).toBe("late");
    vi.stubEnv("DATA_DERIVE_MARKET", "");
    expect(await state(rows(), "derive/market")).toBe("off");
  });

  it("reads times as Postgres text and as dates, and says when the daily check last ran and whether it could", async () => {
    const run = rows({ job: "check/daily", last_ran: null, last_seen: "2026-11-24 08:40:21+00", last_outcome: "unavailable:mail-refused" }, { job: "pull/traffic", last_ran: new Date(ago(1)), last_seen: new Date(ago(1)), last_outcome: null });
    const health = await readHealth(run);
    expect(health.clock).toBe("2026-11-25T08:40:00.123Z");
    expect(health.daily_check).toEqual({ at: "2026-11-24T08:40:21.000Z", outcome: "unavailable" });
    expect(health.jobs.find(job => job.job === "pull/traffic")).toEqual({ job: "pull/traffic", state: "ok", last_ran_at: ago(1), last_seen_at: ago(1) });
    expect((await readHealth(rows())).daily_check).toBeNull();
  });

  it("gives up on work that does not settle", async () => {
    await expect(within(5, new Promise(() => {}))).rejects.toThrow("no answer in time");
    await expect(within(50, Promise.resolve(7))).resolves.toBe(7);
  });
});
