/**
 * Pins the consolidation of openMysteryBox + openMysteryBoxEnhanced.
 *
 * Both entry points now delegate the critical-path transaction (atomic
 * stock claim → open record → winner record → box stats → depletion-error
 * handling) to a single private `createOpenTransaction` helper. This
 * eliminates the earlier ~90%-duplicated transaction bodies and ensures
 * any future fix to the stock lock or the transaction ordering lands in
 * exactly one place.
 *
 * Source-level test — no runtime Prisma needed.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MYSTERY_BOX_OPEN = path.resolve(
  __dirname,
  "../../app/services/mystery-box-open.server.ts"
);

describe("mystery-box-open — consolidated transaction helper", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MYSTERY_BOX_OPEN, "utf-8");
  });

  it("exposes a private createOpenTransaction helper", () => {
    expect(source).toMatch(/async function createOpenTransaction\s*\(/);
    expect(source).toMatch(/interface OpenTransactionInput\b/);
  });

  it("openMysteryBox calls createOpenTransaction (not its own prisma.$transaction)", () => {
    const fn = extractFunctionBody(source, "export async function openMysteryBox");
    expect(fn).toMatch(/createOpenTransaction\s*\(/);
    // The old duplicated transaction body must be gone from the public
    // entry point.
    expect(fn).not.toMatch(/prisma\.\$transaction/);
  });

  it("openMysteryBoxEnhanced calls createOpenTransaction (not its own prisma.$transaction)", () => {
    const fn = extractFunctionBody(source, "export async function openMysteryBoxEnhanced");
    expect(fn).toMatch(/createOpenTransaction\s*\(/);
    expect(fn).not.toMatch(/prisma\.\$transaction/);
  });

  it("stock-claim logic appears exactly once — in the helper, not at the call sites", () => {
    // The conditional updateMany IS the lock. Finding it more than once
    // in this file means someone re-inlined a transaction body.
    const claims = source.match(/mysteryBoxReward\.updateMany\s*\(/g) || [];
    expect(claims.length, "stock claim should live only in createOpenTransaction").toBe(1);
  });

  it("the depletion sentinel error is translated exactly once", () => {
    const translations =
      source.match(
        /The selected reward was just claimed by another customer\. Please try opening again\./g
      ) || [];
    expect(translations.length).toBe(1);
  });

  it("enhanced entry point forwards all psychology metadata to the helper", () => {
    const fn = extractFunctionBody(source, "export async function openMysteryBoxEnhanced");
    // Every psychology field the open row supports must still be
    // threaded through. If someone drops one here, the stored open row
    // will miss context (streak visualization, pity progress, etc.).
    for (const key of [
      "streakDay",
      "streakBonusApplied",
      "luckyStreakCount",
      "luckyStreakBonus",
      "bonusEventId",
      "discountApplied",
      "isFreeOpen",
      "pityTriggered",
      "nearMissRewardId",
    ]) {
      // Match either `key: value` or `key,` (shorthand property).
      expect(fn, `enhanced open must forward ${key}`).toMatch(
        new RegExp(`\\b${key}\\s*[:,]`)
      );
    }
  });

  it("basic entry point does NOT forward psychology metadata (schema defaults apply)", () => {
    const fn = extractFunctionBody(source, "export async function openMysteryBox");
    // The basic caller's createOpenTransaction invocation should only
    // pass the structural args. Psychology fields are the enhanced
    // variant's territory; the basic open row relies on schema defaults
    // (null / 0 / false) for those columns.
    const call = fn.match(/createOpenTransaction\s*\(\s*\{[\s\S]*?\}\s*\)/);
    expect(call).not.toBeNull();
    const args = call![0];
    expect(args).not.toMatch(/streakDay\s*:/);
    expect(args).not.toMatch(/pityTriggered\s*:/);
    expect(args).not.toMatch(/nearMissRewardId\s*:/);
  });
});

/** Pull out a top-level function body. Robust to inline object types in
 *  the parameter list (e.g., `fn(input: { a: string })`) by first
 *  skipping past the signature's parentheses at depth 0 — we only start
 *  tracking body braces AFTER the outer `(...)` of the signature has
 *  closed. */
function extractFunctionBody(src: string, header: string): string {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`function ${header} not found`);

  // Phase 1: find the end of the parameter list.
  let parenDepth = 0;
  let seenParen = false;
  let i = start;
  for (; i < src.length; i++) {
    if (src[i] === "(") {
      parenDepth++;
      seenParen = true;
    } else if (src[i] === ")") {
      parenDepth--;
      if (seenParen && parenDepth === 0) {
        i++;
        break;
      }
    }
  }

  // Phase 2: skip the return-type annotation until the body-opening brace.
  for (; i < src.length; i++) {
    if (src[i] === "{") break;
  }
  const bodyStart = i;

  // Phase 3: brace-count to the matching close.
  let braceDepth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") braceDepth++;
    else if (src[i] === "}") {
      braceDepth--;
      if (braceDepth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function: ${header} (bodyStart=${bodyStart})`);
}
