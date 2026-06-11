/**
 * Pins the race-safety properties of points-ledger.server.ts.
 *
 * Every gamification service (raffle-entry, mystery-box-open,
 * mission-stats, challenge-claim) earns or spends through this module.
 * Before 2026-04-23, `earnPoints`, `spendPoints`, `clawbackPoints`, and
 * `expirePoints` each had a read-then-write pattern that lost updates
 * under Prisma's default READ COMMITTED isolation. A concurrent earn+earn,
 * spend+spend, or earn+spend on the same customer would silently drop one
 * of the operations — customer balances would drift from the sum of their
 * ledger entries, and the system's financial integrity would degrade
 * invisibly over time.
 *
 * These tests are source-level contracts: they fail if anyone reintroduces
 * the lost-update pattern, even before a runtime race could catch it.
 * Runtime race tests would need a real DB + concurrent connections; what
 * matters more is that the STRUCTURAL PROPERTY is preserved.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const LEDGER = fs.readFileSync(
  path.resolve(__dirname, "../../app/services/points-ledger.server.ts"),
  "utf-8"
);

/** Extract the body of a top-level function, including arbitrarily
 *  complex return-type annotations. Handles:
 *     fn(x: T): R { ... }
 *     fn(x: { a: string }): R { ... }          // object type in param
 *     fn(x: T): Promise<R> { ... }             // simple generic
 *     fn(x: T): Promise<{ a: string }> { ... } // generic with inline obj type
 *  by tracking BOTH brace depth AND angle-bracket depth. A `{` inside
 *  `<...>` is part of a type annotation, not the function body. */
function body(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`function ${header} not found`);

  // Phase 1: skip the parameter list to find the closing ).
  let parenDepth = 0;
  let seenParen = false;
  let i = start;
  for (; i < source.length; i++) {
    if (source[i] === "(") { parenDepth++; seenParen = true; }
    else if (source[i] === ")") {
      parenDepth--;
      if (seenParen && parenDepth === 0) { i++; break; }
    }
  }

  // Phase 2: walk past the return-type annotation. The body opens on a
  // `{` that's at both brace-depth 0 AND angle-depth 0.
  let angleDepth = 0;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === "<") angleDepth++;
    else if (c === ">") {
      if (angleDepth > 0) angleDepth--;
      // `=>` (arrow) and `>=`/`>>` aren't expected in this position.
    } else if (c === "{" && angleDepth === 0) {
      break;
    }
  }

  // Phase 3: brace-count from the body open to its matching close.
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function: ${header}`);
}

describe("earnPoints — atomic increment inside transaction", () => {
  let fn: string;
  beforeAll(() => { fn = body(LEDGER, "export async function earnPoints"); });

  it("uses increment (not manual balance arithmetic)", () => {
    // The smoking gun of the old bug was `newBalance = current + amount`
    // computed in userland. The only race-safe pattern is `{ increment }`.
    expect(fn).toMatch(/pointsBalance:\s*\{\s*increment:/);
    expect(fn).toMatch(/lifetimePoints:\s*\{\s*increment:/);
  });

  it("does NOT compute balance via read-then-add", () => {
    expect(fn).not.toMatch(/const\s+currentBalance\s*=\s*Number\(/);
    expect(fn).not.toMatch(/newBalance\s*=\s*currentBalance\s*\+/);
  });

  it("customer update is inside prisma.$transaction", () => {
    // The atomic update must live inside a transaction alongside the
    // ledger insert, so a ledger-insert failure rolls back the balance
    // change and vice versa.
    expect(fn).toMatch(/prisma\.\$transaction/);
    const txBody = fn.match(/prisma\.\$transaction\(async[\s\S]*\)/);
    expect(txBody).not.toBeNull();
    expect(txBody![0]).toMatch(/tx\.customer\.update/);
    expect(txBody![0]).toMatch(/tx\.pointsLedger\.create/);
  });

  it("ledger entry's `balance` is read from the UPDATE's post-commit value", () => {
    // The ledger row's `balance` column must reflect what was committed,
    // not a pre-update value. Callers later audit against it.
    expect(fn).toMatch(/Number\(updated\.pointsBalance\)/);
  });
});

describe("spendPoints — conditional decrement with balance gate", () => {
  let fn: string;
  beforeAll(() => { fn = body(LEDGER, "export async function spendPoints"); });

  it("uses updateMany with a pointsBalance gte guard", () => {
    // The WHERE + UPDATE + decrement happen in ONE SQL statement that the
    // DB serializes. A race between two spends results in one succeeding
    // and the other seeing count === 0, which we translate to "Insufficient".
    expect(fn).toMatch(/updateMany/);
    expect(fn).toMatch(/pointsBalance:\s*\{\s*gte:\s*input\.amount\s*\}/);
    expect(fn).toMatch(/pointsBalance:\s*\{\s*decrement:\s*input\.amount\s*\}/);
  });

  it("insufficient-balance throws with a specific message (not silent)", () => {
    expect(fn).toMatch(/Insufficient points balance/);
  });

  it("the old read-then-compute pattern is gone", () => {
    // These were the structural fingerprints of the lost-update bug.
    expect(fn).not.toMatch(/const\s+currentBalance\s*=\s*Number\(customer\.pointsBalance\)/);
    expect(fn).not.toMatch(/newBalance\s*=\s*currentBalance\s*-\s*input\.amount/);
  });

  it("ledger entry's balance is read from committed state inside the tx", () => {
    expect(fn).toMatch(/tx\.customer\.findUnique/);
    expect(fn).toMatch(/Number\(committed!\.pointsBalance\)/);
  });

  it("the broken 'serializable isolation' comment is gone", () => {
    // A sticky lie in the old code. Prisma doesn't run at SERIALIZABLE
    // by default; the comment let the race sit in place unchallenged.
    expect(fn).not.toMatch(/serializable isolation prevents TOCTOU/i);
  });
});

describe("clawbackPoints — refund dedup inside the transaction", () => {
  let fn: string;
  beforeAll(() => { fn = body(LEDGER, "export async function clawbackPoints"); });

  it("checks existing REFUND_CLAWBACK inside the transaction, not outside", () => {
    // The old code did the "already clawed back?" check OUTSIDE the
    // transaction, so two concurrent webhook deliveries for the same
    // refund both saw "not yet" and both debited the customer.
    const tx = fn.match(/prisma\.\$transaction\(async[\s\S]*\)\s*;/);
    expect(tx).not.toBeNull();
    expect(tx![0]).toMatch(/tx\.pointsLedger\.findFirst/);
    expect(tx![0]).toMatch(/type:\s*["']REFUND_CLAWBACK["']/);
  });

  it("uses atomic conditional decrement (updateMany with gte)", () => {
    expect(fn).toMatch(/updateMany/);
    expect(fn).toMatch(/pointsBalance:\s*\{\s*gte:\s*clawbackAmount\s*\}/);
  });

  it("clamps to zero via a second updateMany gated by lte (no clobber)", () => {
    // If the customer's balance fell below the clawback amount between
    // our reads, we clamp to zero — but the gate prevents clobbering a
    // concurrent earn that raised the balance.
    expect(fn).toMatch(/pointsBalance:\s*\{\s*lte:\s*clawbackAmount\s*\}/);
    expect(fn).toMatch(/pointsBalance:\s*0/);
  });

  it("returns a structured result with discriminated statuses", () => {
    // The status union lets the outer caller (webhook handler) react
    // distinctly to 'already_clawed_back' vs 'zero_balance' vs success.
    for (const status of [
      "already_clawed_back",
      "customer_not_found",
      "zero_balance",
      "clawed_back",
    ]) {
      expect(fn).toContain(`"${status}"`);
    }
  });
});

describe("expirePoints — atomic decrement in the per-customer loop", () => {
  let fn: string;
  beforeAll(() => { fn = body(LEDGER, "export async function expirePoints"); });

  it("decrement the balance using updateMany with gte guard", () => {
    // Previously: read pointsBalance, write max(0, current - expired).
    // A customer who earned points DURING the expiration job would lose
    // those earns when the expiration write overwrote the balance. Now
    // the decrement is atomic.
    expect(fn).toMatch(/pointsBalance:\s*\{\s*gte:\s*expiredAmount\s*\}/);
    expect(fn).toMatch(/pointsBalance:\s*\{\s*decrement:\s*expiredAmount\s*\}/);
  });

  it("no manual `const currentBalance = Number(customer.pointsBalance)` read", () => {
    expect(fn).not.toMatch(/const\s+currentBalance\s*=\s*Number\(customer\.pointsBalance\)/);
  });

  it("ledger marking is idempotent (expired: false gate)", () => {
    // Job re-runs shouldn't double-expire the same entry. The updateMany
    // gate ensures `expired: true` is only written once.
    expect(fn).toMatch(/expired:\s*false/);
    expect(fn).toMatch(/expired:\s*true/);
  });
});

describe("hasEnoughPoints — clearly marked deprecated / TOCTOU-warning", () => {
  it("JSDoc warns about TOCTOU against a subsequent spendPoints call", () => {
    // The function itself is a fine read. The DANGER is when callers gate
    // a subsequent spend on this function's answer — classic
    // check-then-act race. The doc must steer callers toward letting
    // spendPoints throw.
    const surrounding = LEDGER.slice(
      0,
      LEDGER.indexOf("export async function hasEnoughPoints")
    );
    // The @deprecated tag + TOCTOU mention should be in the preceding
    // JSDoc block.
    const jsdocStart = surrounding.lastIndexOf("/**");
    const jsdoc = surrounding.slice(jsdocStart);
    expect(jsdoc).toMatch(/@deprecated/);
    expect(jsdoc).toMatch(/TOCTOU/i);
  });
});

describe("public API is unchanged", () => {
  // Nothing above should have renamed exports — every gamification
  // service imports from this module.
  it.each([
    "earnPoints",
    "spendPoints",
    "hasEnoughPoints",
    "getPointsBalance",
    "getTransactionHistory",
    "clawbackPoints",
    "expirePoints",
    "getExpiringPoints",
    "adjustPoints",
  ])("exports %s", (name) => {
    expect(LEDGER).toMatch(new RegExp(`export async function ${name}\\b`));
  });
});
