/**
 * Validator contract.
 *
 *   1. Pure synthetic — `validate(files, contract)` against tiny
 *      hand-crafted inputs. Every forbidden pattern triggers; the
 *      ledger module's own writes don't trigger.
 *   2. Comment-line skip — pattern matches inside `//` or `*` comments
 *      should not count as violations.
 *   3. Golden — `validateLedgerContract()` runs against the real `app/`
 *      tree and surfaces the known violation in `raffle-instant-win.server.ts`.
 *      Aspirational: when the bug is fixed, this test fails and is
 *      reconciled to assert clean state.
 */
import { describe, it, expect } from "vitest";
import {
  validate,
  validateLedgerContract,
} from "../../scripts/ledger-validator";
import { ledgerContract } from "../../scripts/ledger-contract";

describe("validate() — pure validator with synthetic inputs", () => {
  it("flags `pointsBalance: { increment: ... }` outside the ledger module", () => {
    const r = validate(
      [{ path: "app/services/foo.server.ts", content: "data: { pointsBalance: { increment: 10 } }" }],
      ledgerContract
    );
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].pattern).toBe("direct-increment");
    expect(r.violations[0].path).toBe("app/services/foo.server.ts");
    expect(r.violations[0].reason).toContain("earnPoints()");
  });

  it("flags `pointsBalance: { decrement: ... }` outside the ledger module", () => {
    const r = validate(
      [{ path: "app/services/bar.server.ts", content: "data: { pointsBalance: { decrement: amt } }" }],
      ledgerContract
    );
    expect(r.violations[0].pattern).toBe("direct-decrement");
    expect(r.violations[0].reason).toContain("spendPoints()");
  });

  it("does NOT flag direct assignment in v1 — known limitation, see contract.ts", () => {
    // v1 doesn't enforce direct-assignment because regex can't
    // distinguish DB writes from response payloads / spreads. When
    // an AST-aware validator replaces this one, this test flips.
    const r = validate(
      [{ path: "app/services/baz.server.ts", content: "data: { pointsBalance: 0 }" }],
      ledgerContract
    );
    expect(r.ok).toBe(true);
  });

  it("does NOT flag the ledger module itself (allowed source)", () => {
    const r = validate(
      [
        {
          path: "app/services/points-ledger.server.ts",
          content: "data: { pointsBalance: { increment: input.amount } }",
        },
      ],
      ledgerContract
    );
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("skips comment lines that mention the forbidden patterns (no false positive on docstrings)", () => {
    const r = validate(
      [
        {
          path: "app/services/note.server.ts",
          content:
            `// don't write \`pointsBalance: { increment: 5 }\` here — use the ledger\n` +
            `* this docs the rule about pointsBalance: { decrement }`,
        },
      ],
      ledgerContract
    );
    expect(r.ok).toBe(true);
  });

  it("an increment is flagged exactly once (not double-counted)", () => {
    const r = validate(
      [{ path: "x.ts", content: "pointsBalance: { increment: 10 }" }],
      ledgerContract
    );
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].pattern).toBe("direct-increment");
  });

  it("reports filesScanned excluding the ledger module", () => {
    const r = validate(
      [
        { path: "app/services/points-ledger.server.ts", content: "" }, // skipped
        { path: "app/services/a.server.ts", content: "" },
        { path: "app/services/b.server.ts", content: "" },
      ],
      ledgerContract
    );
    expect(r.filesScanned).toBe(2);
  });
});

describe("validateLedgerContract() — golden run against the real app/ tree", () => {
  const report = validateLedgerContract();

  it("scans many files (the rewards module is large)", () => {
    expect(report.filesScanned).toBeGreaterThan(50);
  });

  it("the known raffle-instant-win violation currently exists (aspirational — celebrate-fix when removed)", () => {
    // raffle-instant-win.server.ts:355 directly increments pointsBalance
    // outside a transaction, paired with a PointsLedger entry that has
    // `balance: 0, // Will be calculated` (incomplete). This is the
    // exact bug class the validator is designed to catch.
    //
    // When this bug is fixed (route the increment through earnPoints()
    // inside a transaction, recording the post-commit balance), this
    // assertion FAILS and forces reconciliation — same celebrate-fix
    // pattern as the design-system chain's celebrate-adoption tests.
    const raffle = report.violations.find(
      (v) =>
        v.path.endsWith("raffle-instant-win.server.ts") &&
        v.pattern === "direct-increment"
    );
    expect(
      raffle,
      "expected the known direct-increment violation in raffle-instant-win.server.ts"
    ).toBeTruthy();
  });

  it("at least one violation surfaces — the validator earns its place", () => {
    expect(report.violations.length).toBeGreaterThan(0);
  });
});
