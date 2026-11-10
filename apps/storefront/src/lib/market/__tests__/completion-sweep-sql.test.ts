import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { runTradeCompletionSweep } from "../completion";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("runTradeCompletionSweep candidate SELECT", () => {
  // postgres.js sends untyped parameters. A CASE whose every branch is a bare
  // $n resolves to text, so COALESCE(dispute_window_hours, CASE …) failed with
  // 42804 "COALESCE types integer and text cannot be matched" on every tick
  // in production (seen 2026-11-06). Each tier default must carry its type.
  it("casts every tier-default window parameter to int", async () => {
    await runTradeCompletionSweep();

    const [sql, params] = vi.mocked(query).mock.calls[0] as [string, unknown[]];
    const tierCase = sql.match(/CASE t\.escrow_tier([\s\S]*?)END/);
    expect(tierCase).not.toBeNull();
    const branchParams = tierCase![1].match(/\$\d+(::\w+)?/g) ?? [];
    expect(branchParams).toEqual(["$1::int", "$2::int", "$3::int"]);
    expect(params.slice(0, 3)).toEqual([48, 72, 168]);
  });
});
