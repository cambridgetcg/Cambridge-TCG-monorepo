import { describe, it, expect } from "vitest";

describe("admin/db — export shape", () => {
  it("exports sfQuery, wsQuery, storefrontDb, wholesaleDb as functions", async () => {
    const mod = await import("../db");
    expect(typeof mod.sfQuery).toBe("function");
    expect(typeof mod.wsQuery).toBe("function");
    expect(typeof mod.storefrontDb).toBe("function");
    expect(typeof mod.wholesaleDb).toBe("function");
  });

  // Skipped — full DB integration belongs to a later phase with a
  // test-database fixture, not scaffolding. Documented as gap.
  it.skip("sfQuery returns rows from storefront RDS (live integration)", async () => {
    const { sfQuery } = await import("../db");
    const r = await sfQuery<{ ok: number }>("SELECT 1 AS ok");
    expect(r.rows[0]?.ok).toBe(1);
  });

  it.skip("wsQuery returns rows from wholesale RDS (live integration)", async () => {
    const { wsQuery } = await import("../db");
    const r = await wsQuery<{ ok: number }>("SELECT 1 AS ok");
    expect(r.rows[0]?.ok).toBe(1);
  });
});
