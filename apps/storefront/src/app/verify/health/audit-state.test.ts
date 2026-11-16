import { describe, expect, it } from "vitest";
import { STALE_TIP_MINUTES, auditState, tipLooksStale, tipState } from "./audit-state";

describe("auditState", () => {
  it("reads a window with audits by its failures alone", () => {
    expect(auditState({ total: 12, failed: 0, has_auditable_draws: true })).toBe("passing");
    expect(auditState({ total: 12, failed: 1, has_auditable_draws: true })).toBe("failing");
    // Old rows still in the window count, even with nothing left to sample.
    expect(auditState({ total: 10_004, failed: 10_004, has_auditable_draws: false })).toBe("failing");
    expect(auditState({ total: 3, failed: 0, has_auditable_draws: false })).toBe("passing");
  });

  it("calls an empty window nothing to audit only when there is no draw to sample", () => {
    expect(auditState({ total: 0, failed: 0, has_auditable_draws: false })).toBe("nothing-to-audit");
    expect(auditState({ total: 0, failed: 0, has_auditable_draws: true })).toBe("not-running");
  });

  it("leaves an empty window unknown when the answer has no flag", () => {
    expect(auditState({ total: 0, failed: 0 })).toBe("unknown");
    expect(auditState({ total: 0, failed: 0, has_auditable_draws: null })).toBe("unknown");
  });
});

describe("tipState", () => {
  const old = STALE_TIP_MINUTES + 1;

  it("has no tip without a digest", () => {
    expect(tipState(null, { has_undigested_draws: true })).toBe("none");
  });

  it("never calls a tip stale when no draw is waiting, however old", () => {
    expect(tipState(295_000, { has_undigested_draws: false })).toBe("idle");
    expect(tipState(5, { has_undigested_draws: false })).toBe("idle");
    expect(tipLooksStale("idle")).toBe(false);
  });

  it("calls an old tip overdue when a draw is waiting, and old when that is unknown", () => {
    expect(tipState(old, { has_undigested_draws: true })).toBe("overdue");
    expect(tipState(old, {})).toBe("old");
    expect(tipState(old, { has_undigested_draws: null })).toBe("old");
    expect(tipLooksStale("overdue")).toBe(true);
    expect(tipLooksStale("old")).toBe(true);
  });

  it("keeps a recent tip, or one whose age could not be read, unflagged", () => {
    expect(tipState(STALE_TIP_MINUTES, { has_undigested_draws: true })).toBe("recent");
    expect(tipState(Number.NaN, { has_undigested_draws: true })).toBe("recent");
    expect(tipLooksStale("recent")).toBe(false);
  });
});
