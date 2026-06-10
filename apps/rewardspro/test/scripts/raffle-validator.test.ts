/**
 * Raffle validator contract.
 *
 *   1. Pure synthetic — every mutation method, every allow-list path
 *      verified against hand-crafted file inputs.
 *   2. Comment skip — ensure docstrings mentioning the patterns aren't
 *      flagged.
 *   3. Golden — `validateRaffleContract()` runs against the real `app/`
 *      tree. Aspirational: surfaces the known
 *      `raffle-instant-win.server.ts:272` violation.
 */
import { describe, it, expect } from "vitest";
import {
  validate,
  validateRaffleContract,
} from "../../scripts/raffle-validator";
import { raffleContract } from "../../scripts/raffle-contract";

describe("validate() — pure validator with synthetic inputs", () => {
  it("flags `prisma.raffleEntry.update(...)` outside the canonical owner", () => {
    const r = validate(
      [
        {
          path: "app/services/foo.server.ts",
          content: "await prisma.raffleEntry.update({ where: {...}, data: {...} });",
        },
      ],
      raffleContract
    );
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].table).toBe("raffleEntry");
    expect(r.violations[0].method).toBe("update");
    expect(r.violations[0].reason).toContain("TOCTOU");
  });

  it("flags `prisma.raffleWinner.create()` outside drawing / prize-delivery", () => {
    const r = validate(
      [
        {
          path: "app/services/sneaky.server.ts",
          content: "await prisma.raffleWinner.create({ data: {...} });",
        },
      ],
      raffleContract
    );
    expect(r.ok).toBe(false);
    expect(r.violations[0].table).toBe("raffleWinner");
    expect(r.violations[0].method).toBe("create");
  });

  it("does NOT flag the canonical owner (`raffle-entry.server.ts` writing raffleEntry)", () => {
    const r = validate(
      [
        {
          path: "app/services/raffle-entry.server.ts",
          content: "await prisma.raffleEntry.update({...});",
        },
      ],
      raffleContract
    );
    expect(r.ok).toBe(true);
  });

  it("does NOT flag raffle-prize-delivery updating raffleWinner.deliveryStatus", () => {
    // `raffle-prize-delivery.server.ts` is in the allow-list for raffleWinner
    // because it legitimately updates `deliveryStatus` post-draw.
    const r = validate(
      [
        {
          path: "app/services/raffle-prize-delivery.server.ts",
          content: "await prisma.raffleWinner.update({...});",
        },
      ],
      raffleContract
    );
    expect(r.ok).toBe(true);
  });

  it("catches `tx.raffleEntry.update(...)` inside a transaction in a non-canonical file", () => {
    // Being inside a $transaction callback doesn't authorize mutation;
    // it's still a write to a protected table.
    const r = validate(
      [
        {
          path: "app/services/random.server.ts",
          content: `await prisma.$transaction(async (tx) => {\n  await tx.raffleEntry.update({...});\n});`,
        },
      ],
      raffleContract
    );
    expect(r.ok).toBe(false);
    expect(r.violations[0].table).toBe("raffleEntry");
  });

  it("catches every Prisma mutation method (update / create / upsert / delete / *Many)", () => {
    const methods = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];
    for (const m of methods) {
      const r = validate(
        [
          {
            path: "app/services/foo.server.ts",
            content: `prisma.raffleEntry.${m}({...})`,
          },
        ],
        raffleContract
      );
      expect(r.ok, `expected mutation method ${m} to be flagged`).toBe(false);
      expect(r.violations[0].method).toBe(m);
    }
  });

  it("does NOT flag read methods (`findFirst`, `findMany`, `findUnique`, `aggregate`, `count`)", () => {
    const reads = ["findFirst", "findMany", "findUnique", "aggregate", "count"];
    for (const m of reads) {
      const r = validate(
        [
          {
            path: "app/services/foo.server.ts",
            content: `prisma.raffleEntry.${m}({...})`,
          },
        ],
        raffleContract
      );
      expect(r.ok, `read method ${m} should NOT be flagged`).toBe(true);
    }
  });

  it("skips comment lines that mention forbidden patterns", () => {
    const r = validate(
      [
        {
          path: "app/services/foo.server.ts",
          content:
            `// don't write \`prisma.raffleEntry.update(...)\` here\n` +
            `* doc the rule about prisma.raffleEntry.create(...)`,
        },
      ],
      raffleContract
    );
    expect(r.ok).toBe(true);
  });

  it("groups multiple violations from the same file together in `byFile` style", () => {
    const r = validate(
      [
        {
          path: "app/services/sneaky.server.ts",
          content:
            `await prisma.raffleEntry.update({...});\n` +
            `await prisma.raffleWinner.create({...});`,
        },
      ],
      raffleContract
    );
    expect(r.violations).toHaveLength(2);
    const tables = r.violations.map((v) => v.table).sort();
    expect(tables).toEqual(["raffleEntry", "raffleWinner"]);
  });
});

describe("validateRaffleContract() — golden run against the real app/ tree", () => {
  const report = validateRaffleContract();

  it("scans many files (the rewards module is large)", () => {
    expect(report.filesScanned).toBeGreaterThan(50);
  });

  it("the known raffle-instant-win bypass on raffleEntry currently exists (aspirational)", () => {
    // raffle-instant-win.server.ts:272 mutates raffleEntry directly — the
    // bug class this validator is designed to surface. When fixed (route
    // the increment through raffle-entry.server.ts), this assertion
    // FAILS and forces reconciliation. Same celebrate-fix pattern as
    // ledger-validator's known violation.
    const bypass = report.violations.find(
      (v) =>
        v.path.endsWith("raffle-instant-win.server.ts") &&
        v.table === "raffleEntry"
    );
    expect(
      bypass,
      "expected the known raffleEntry mutation in raffle-instant-win.server.ts"
    ).toBeTruthy();
  });

  it("at least one violation surfaces — the validator earns its place on first run", () => {
    expect(report.violations.length).toBeGreaterThan(0);
  });
});
