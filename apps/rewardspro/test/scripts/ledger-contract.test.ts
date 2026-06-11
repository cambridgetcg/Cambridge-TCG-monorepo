/**
 * Contract shape — pin the rewards canonical so a future edit can't
 * silently weaken it (e.g., add a forbidden pattern but forget the
 * matching reason, or add an allowed source without justifying).
 */
import { describe, it, expect } from "vitest";
import { ledgerContract } from "../../scripts/ledger-contract";

describe("ledgerContract — typed canonical for the rewards module", () => {
  it("declares exactly three ledger operations: earn / spend / adjust", () => {
    expect(ledgerContract.operations.map((o) => o.name).sort()).toEqual([
      "adjustPoints",
      "earnPoints",
      "spendPoints",
    ]);
  });

  it("each operation has a direction and a non-empty ledgerSource label", () => {
    for (const op of ledgerContract.operations) {
      expect(["credit", "debit", "either"]).toContain(op.direction);
      expect(op.ledgerSource.length).toBeGreaterThan(0);
    }
  });

  it("declares the two forbidden mutation patterns enforced in v1 (increment + decrement)", () => {
    // Direct-assignment was dropped in v1 — see contract.ts for why.
    // It can be added back when an AST-aware validator replaces the
    // regex scanner.
    expect(ledgerContract.forbidden.map((f) => f.name).sort()).toEqual([
      "direct-decrement",
      "direct-increment",
    ]);
  });

  it("every forbidden pattern includes a reason that names a ledger function", () => {
    const reasons = ledgerContract.forbidden.map((f) => f.reason).join("\n");
    expect(reasons).toContain("earnPoints()");
    expect(reasons).toContain("spendPoints()");
  });

  it("the ledger module itself is the only allowed source for direct mutations", () => {
    expect(ledgerContract.allowedSources).toEqual([
      "app/services/points-ledger.server.ts",
    ]);
  });

  it("forbidden regexes match real Prisma update syntax and don't cross-match", () => {
    const inc = ledgerContract.forbidden.find((f) => f.name === "direct-increment")!.pattern;
    const dec = ledgerContract.forbidden.find((f) => f.name === "direct-decrement")!.pattern;

    // Real-world Prisma update syntax — must match.
    expect(inc.test("pointsBalance: { increment: points }")).toBe(true);
    expect(inc.test("pointsBalance: { increment: amount },")).toBe(true);
    expect(dec.test("pointsBalance: { decrement: amt }")).toBe(true);

    // The increment pattern shouldn't catch the decrement form, and vice versa.
    expect(inc.test("pointsBalance: { decrement: amount }")).toBe(false);
    expect(dec.test("pointsBalance: { increment: amount }")).toBe(false);
  });
});
