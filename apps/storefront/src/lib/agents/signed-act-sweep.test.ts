import { describe, expect, it, vi } from "vitest";
import { runSignedActSweep, SIGNED_ACT_SWEEP_JOB, SIGNED_ACT_SWEEP_SQL } from "./signed-act-sweep";

const OPEN = { AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: "https://cambridgetcg.com" };
const at = (minute: number) => new Date(Date.UTC(2026, 10, 10, 12, minute, 5));

function database(answer: () => Promise<{ rows: Record<string, unknown>[] }>) {
  return vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (sql) => {
    if (sql.startsWith("WITH nonces AS")) return answer();
    return { rows: [] };
  });
}

describe("runSignedActSweep", () => {
  it("runs only in minute 23, and only while signed acts are open, reading nothing otherwise", async () => {
    const run = database(async () => ({ rows: [{ nonces: 1, pending_keys: 0 }] }));

    expect(await runSignedActSweep(at(22), run, OPEN)).toEqual({ ranInWindow: false });
    for (const closed of [{}, { AGENT_SIGNED_ACTS: "on" }, { AGENT_SIGNED_ACTS: "ON", AGENT_SIGNED_ACTS_AUDIENCE: "https://cambridgetcg.com" }]) {
      expect(await runSignedActSweep(at(23), run, closed)).toEqual({ ranInWindow: true, open: false });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("deletes expired nonces and week-old unconfirmed keys, never a confirmed one, and records the counts", async () => {
    const run = database(async () => ({ rows: [{ nonces: 7, pending_keys: 2 }] }));

    expect(await runSignedActSweep(at(23), run, OPEN)).toEqual({
      ranInWindow: true,
      open: true,
      provisioned: true,
      deleted: { nonces: 7, pendingKeys: 2 },
    });
    expect(SIGNED_ACT_SWEEP_SQL).toContain("DELETE FROM agent_act_nonces WHERE expires_at < now()");
    expect(SIGNED_ACT_SWEEP_SQL).toContain("WHERE confirmed_at IS NULL");
    expect(SIGNED_ACT_SWEEP_SQL).toContain("make_interval(days => 7)");
    const insert = run.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO ops_job_outcomes"));
    expect(insert?.[1]).toEqual([SIGNED_ACT_SWEEP_JOB, expect.any(String), expect.any(String), 200, "ran", JSON.stringify({ nonces: 7, pendingKeys: 2 })]);
  });

  it("says when 0152 is not applied, records a failure, and throws what else the database throws", async () => {
    const missing = database(async () => {
      throw Object.assign(new Error('relation "agent_act_nonces" does not exist'), { code: "42P01" });
    });
    expect(await runSignedActSweep(at(23), missing, OPEN)).toEqual({ ranInWindow: true, open: true, provisioned: false });
    expect(missing.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO ops_job_outcomes"))).toBe(false);

    const busy = database(async () => {
      throw Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
    });
    await expect(runSignedActSweep(at(23), busy, OPEN)).rejects.toThrow("lock timeout");
    const insert = busy.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO ops_job_outcomes"));
    expect(insert?.[1]).toEqual([SIGNED_ACT_SWEEP_JOB, expect.any(String), expect.any(String), 500, "unavailable:failed", "{}"]);
  });
});
