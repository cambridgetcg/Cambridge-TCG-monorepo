import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

type Rows = Record<string, unknown>[];

/** Answers each query by its SQL text; the windowed SQL itself runs in route.integration.test.ts. */
function answer(pools: Rows, failures: Rows = []) {
  mockQuery.mockImplementation(async (sql: string) => {
    const rows: Rows =
      sql.includes("has_auditable_draws") ? pools
      : sql.includes("FROM fairness_digests") && sql.includes("ORDER BY id DESC") ? [{ id: "1", root: "a".repeat(64), chain_hash: "b".repeat(64), leaf_count: 1, created_at: "2026-04-25 17:10:06.707725+00" }]
      : sql.includes("FROM fairness_digests") ? [{ total: 1, last_7d: 0, last_24h: 0, leaves_7d: 0 }]
      : sql.includes("LIMIT 10") ? failures
      : sql.includes("date_trunc") ? []
      : sql.includes("FROM fairness_audits") ? [{ total: 0, passed: 0, failed: 0 }]
      : sql.includes("COUNT(*)::int AS n FROM fairness_alerts") ? [{ n: 0 }]
      : [];
    return { rows, rowCount: rows.length };
  });
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /api/verify/health", () => {
  it("lists failures only from the same look-back window as the other audit figures", async () => {
    answer([{ has_undigested_draws: false, has_auditable_draws: false }]);
    await GET();
    const calls = mockQuery.mock.calls.map(([sql, params]) => ({ sql: String(sql), params }));
    // The failures list, not the stats query (which also says NOT all_ok, inside FILTER).
    const failures = calls.find(({ sql }) => sql.includes("FROM fairness_audits") && sql.includes("LIMIT 10"));
    expect(failures?.sql).toContain("run_at >= NOW() - make_interval(days => $1)");
    expect(failures?.params).toEqual([7]);
    const stats = calls.find(({ sql }) => sql.includes("FROM fairness_audits") && sql.includes("FILTER (WHERE all_ok)"));
    expect(stats?.sql).toContain("run_at >= NOW() - make_interval(days => $1)");
    expect(stats?.params).toEqual(failures?.params);
  });

  it("says whether anything waits for the digest job or the self-audit, without counts or ids", async () => {
    answer([{ has_undigested_draws: false, has_auditable_draws: false }]);
    const body = await (await GET()).json();
    expect(body.digest.has_undigested_draws).toBe(false);
    expect(body.self_audit.has_auditable_draws).toBe(false);
    expect(body.self_audit).toMatchObject({ lookback_days: 7, total: 0, passed: 0, failed: 0, recent_failures: [] });
    expect(JSON.stringify(body)).not.toContain("subject_id");

    answer([{ has_undigested_draws: true, has_auditable_draws: true }]);
    const busy = await (await GET()).json();
    expect(busy.digest.has_undigested_draws).toBe(true);
    expect(busy.self_audit.has_auditable_draws).toBe(true);
  });

  it("answers null, meaning unknown, when the flags are missing or not booleans", async () => {
    answer([]);
    const missing = await (await GET()).json();
    expect(missing.digest.has_undigested_draws).toBeNull();
    expect(missing.self_audit.has_auditable_draws).toBeNull();

    answer([{ has_undigested_draws: "t", has_auditable_draws: 0 }]);
    const odd = await (await GET()).json();
    expect(odd.digest.has_undigested_draws).toBeNull();
    expect(odd.self_audit.has_auditable_draws).toBeNull();
  });

  it("selects no subject id in the failures list and keeps the public cache header", async () => {
    answer([{ has_undigested_draws: false, has_auditable_draws: false }], [
      { source: "bounty_pull", reason: "outcome mismatch", run_at: "2026-11-16 19:47:17.062313+00" },
    ]);
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    const body = await response.json();
    expect(body.self_audit.recent_failures).toEqual([
      { source: "bounty_pull", reason: "outcome mismatch", run_at: "2026-11-16 19:47:17.062313+00" },
    ]);
    for (const [sql] of mockQuery.mock.calls) {
      if (String(sql).includes("FROM fairness_audits")) expect(String(sql)).not.toContain("subject_id");
    }
  });
});
