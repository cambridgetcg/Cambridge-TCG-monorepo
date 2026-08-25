import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const terms = readFileSync(
  resolve(process.cwd(), "src/app/terms/page.tsx"),
  "utf8",
).replace(/\s+/g, " ");

describe("terms participation boundary", () => {
  it("states the adult-only rule and the limits of the reversible release pause", () => {
    expect(terms).toContain("You must be at least 18");
    expect(terms).toContain(
      "Production defaults new account registration and new P2P commitments to paused",
    );
    expect(terms).toContain("release pause is not age assurance");
    expect(terms).toContain("not a stored receipt");
    expect(terms).toContain("does not yet store a site-wide versioned assent receipt");
  });

  it("preserves existing obligations and remedies while commitments are paused", () => {
    for (const step of [
      "payment",
      "shipping",
      "receipt",
      "cancellation",
      "return",
      "dispute",
      "refund",
      "payout",
      "evidence",
    ]) {
      expect(terms, step).toContain(step);
    }
  });
});
