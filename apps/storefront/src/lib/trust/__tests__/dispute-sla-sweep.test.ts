import { describe, it, expect } from "vitest";
import { getDisputeStep, isDisputeTerminal } from "../dispute-timeline";

// The export-shape tests dynamically import ../dispute-sla-sweep → ../db →
// lib/db, which constructs the pg client at module load and throws without
// DATABASE_URL. Shape checks don't open a connection, so a placeholder is
// enough to keep the suite env-less.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

describe("dispute-sla-sweep — export shape", () => {
  it("exports runDisputeSlaSweep as a function", async () => {
    const mod = await import("../dispute-sla-sweep");
    expect(typeof mod.runDisputeSlaSweep).toBe("function");
  });

  it("exports escalateStaleDisputes + a sane default SLA window", async () => {
    const mod = await import("../db");
    expect(typeof mod.escalateStaleDisputes).toBe("function");
    expect(mod.DEFAULT_DISPUTE_SLA_HOURS).toBe(72);
  });
});

describe("dispute timeline — the 'escalated' status", () => {
  it("is in-progress, not terminal (an admin must still resolve it)", () => {
    expect(isDisputeTerminal("escalated")).toBe(false);
  });

  it("sits past 'opened' on the timeline", () => {
    expect(getDisputeStep("escalated")).toBeGreaterThanOrEqual(1);
    expect(getDisputeStep("open")).toBe(0);
  });
});

// Live DB integration — seed a stale 'open' dispute, run the sweep, assert it
// flips to 'escalated' and stamps escalated_at while NEVER touching escrow —
// belongs to a test-database fixture phase, mirroring admin/db.test.ts.
// Documented gap, intentionally not scaffolded here.
