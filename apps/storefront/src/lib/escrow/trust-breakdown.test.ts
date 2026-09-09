import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeTrustBreakdown,
  TRUST_WEIGHTS,
  TRUST_PENALTIES,
  TRUST_MAX_SCORE,
  TRUST_COMPONENT_LABELS,
  TRUST_PENALTY_LABELS,
  type TrustBreakdownInputs,
} from "./trust-breakdown";

// The drift this file exists to prevent:
//
// On 2026-06-10 identity verification stopped being a score component and its
// 10 pts moved into completion (30→35) and reviews (25→30). The engine changed.
// /account/trust kept its own copy of the formulas and did not — it went on
// drawing five bars with maxima 30/25/15/10/10, one of them for a component
// that no longer existed, reading a column (trust_profiles.external_rep) that
// nothing writes. Ninety points of bars, under a caption that promised they
// summed to a score out of a hundred.
//
// Nothing failed. No test knew the two were supposed to agree. So: these.

const nobody: TrustBreakdownInputs = {
  totalTrades: 0,
  completedTrades: 0,
  avgRating: 0,
  totalVolume: 0,
  monthsActive: 0,
  externalRepCount: 0,
  openDisputes: 0,
  disputesLost: 0,
  disputesSplit: 0,
  fraudSignals: 0,
};

// A seller who has done everything right for a year: every trade completed,
// straight 5s, £100k through the books, two verified platforms.
const exemplary: TrustBreakdownInputs = {
  ...nobody,
  totalTrades: 200,
  completedTrades: 200,
  avgRating: 5,
  totalVolume: 100_000,
  monthsActive: 12,
  externalRepCount: 2,
};

describe("the weights are a whole score", () => {
  it("components sum to exactly TRUST_MAX_SCORE", () => {
    const sum = Object.values(TRUST_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(TRUST_MAX_SCORE);
  });

  it("an exemplary seller reaches all of it — not 90", () => {
    const b = computeTrustBreakdown(exemplary);
    expect(b.raw_score).toBe(100);
    expect(b.score).toBe(100);
    // The pre-2026-06-10 maxima the account page kept using.
    expect(b.raw_score).not.toBe(90);
  });

  it("carries the post-2026-06-10 weights, not the ones the page remembered", () => {
    const b = computeTrustBreakdown(exemplary);
    expect(b.components.completion.max).toBe(35); // was 30 on the page
    expect(b.components.review.max).toBe(30); // was 25 on the page
    expect(Object.keys(b.components)).not.toContain("verification");
  });
});

describe("the sum is the score", () => {
  it("components − penalties = score, for a seller carrying every kind of penalty", () => {
    // One open dispute, one lost, one split, one fraud signal:
    // 10 + 15 + 8 + 20 = 53 against a full 100.
    const b = computeTrustBreakdown({
      ...exemplary,
      openDisputes: 1,
      disputesLost: 1,
      disputesSplit: 1,
      fraudSignals: 1,
    });
    expect(b.penalty_total).toBe(53);
    expect(b.raw_score - b.penalty_total).toBe(b.score);
    expect(b.score).toBe(47);
    expect(b.floored).toBe(false);
  });

  it("reports every penalty with its count and its per-occurrence cost", () => {
    const b = computeTrustBreakdown({ ...exemplary, openDisputes: 3 });
    expect(b.penalties.openDisputes).toEqual({
      count: 3,
      each: TRUST_PENALTIES.openDispute,
      points: 30,
    });
    // A penalty not incurred is present and zero, never absent.
    expect(b.penalties.fraudSignals.count).toBe(0);
    expect(b.penalties.fraudSignals.points).toBe(0);
  });

  it("split disputes and fraud signals are expressible at all", () => {
    // The old page had no bar or line for either — a seller penalised 8 pts
    // for a split dispute saw an unexplained gap between bars and score.
    const b = computeTrustBreakdown({ ...exemplary, disputesSplit: 2, fraudSignals: 1 });
    expect(b.penalties.disputesSplit.points).toBe(16);
    expect(b.penalties.fraudSignals.points).toBe(20);
    expect(b.penalty_total).toBe(36);
  });
});

describe("the floor is admitted, not hidden", () => {
  it("floors at 0 and says so when penalties exceed what was earned", () => {
    const b = computeTrustBreakdown({ ...nobody, fraudSignals: 3 });
    expect(b.raw_score).toBe(0);
    expect(b.penalty_total).toBe(60);
    expect(b.score).toBe(0);
    // The subtraction is NOT true here, and the flag is how the page knows
    // not to claim it is.
    expect(b.raw_score - b.penalty_total).not.toBe(b.score);
    expect(b.floored).toBe(true);
  });

  it("does not claim to floor when the arithmetic came out exactly 0", () => {
    // 0 earned, 0 penalties → score 0, but nothing was clamped.
    const b = computeTrustBreakdown(nobody);
    expect(b.score).toBe(0);
    expect(b.floored).toBe(false);
  });
});

describe("a brand-new account", () => {
  it("scores 0 without dividing by zero", () => {
    const b = computeTrustBreakdown(nobody);
    expect(b.score).toBe(0);
    expect(Number.isNaN(b.score)).toBe(false);
    expect(b.components.completion.points).toBe(0);
  });
});

describe("component ceilings hold", () => {
  it("no component can exceed its own max, however extreme the input", () => {
    const b = computeTrustBreakdown({
      ...nobody,
      totalTrades: 1,
      completedTrades: 1,
      avgRating: 5,
      totalVolume: 10 ** 12, // log10 × 5 = 60, capped at 15
      monthsActive: 600, // × 2 = 1200, capped at 10
      externalRepCount: 99, // × 5 = 495, capped at 10
    });
    for (const [key, c] of Object.entries(b.components)) {
      expect(c.points, `${key} exceeded its max`).toBeLessThanOrEqual(c.max);
    }
    expect(b.raw_score).toBeLessThanOrEqual(TRUST_MAX_SCORE);
  });
});

describe("the page's labels name the engine's keys", () => {
  // If these drift, a new component renders as an unlabelled bar or an old one
  // lingers at zero — which is the exact failure this whole file is about.
  it("every component the engine emits has a label, and vice versa", () => {
    const emitted = Object.keys(computeTrustBreakdown(nobody).components).sort();
    const labelled = TRUST_COMPONENT_LABELS.map(([k]) => k).sort();
    expect(labelled).toEqual(emitted);
  });

  it("every penalty the engine emits has a singular and plural label", () => {
    const emitted = Object.keys(computeTrustBreakdown(nobody).penalties).sort();
    const labelled = TRUST_PENALTY_LABELS.map(([k]) => k).sort();
    expect(labelled).toEqual(emitted);
    for (const [key, one, many] of TRUST_PENALTY_LABELS) {
      expect(one, `${key} singular`).toBeTruthy();
      expect(many, `${key} plural`).toBeTruthy();
      expect(one).not.toBe(many);
    }
  });

  it("every component label carries its max, so no bar needs a hardcoded ceiling", () => {
    const b = computeTrustBreakdown(nobody);
    for (const [key] of TRUST_COMPONENT_LABELS) {
      expect(b.components[key].max).toBe(TRUST_WEIGHTS[key]);
    }
  });
});

describe("the methodology page states the weights the code holds", () => {
  // /methodology/trust-score explains the score in prose. Prose is exactly what
  // drifted last time — the engine's own header carried a "Suspension history
  // -30" penalty the code never applied. The page is correct today; this keeps
  // it correct without interpolating template literals through readable prose.
  const doc = readFileSync(
    join(__dirname, "../../app/methodology/trust-score/page.tsx"),
    "utf8",
  );

  it("declares the same ceiling the components add up to", () => {
    expect(doc).toContain(`up to ${TRUST_MAX_SCORE} points`);
  });

  it("gives each component the maximum the code gives it", () => {
    const headings: [keyof typeof TRUST_WEIGHTS, string][] = [
      ["completion", "Trade completion rate"],
      ["review", "Review score"],
      ["volume", "Trade volume"],
      ["age", "Account age"],
      ["external", "External reputation"],
    ];
    for (const [key, heading] of headings) {
      expect(doc, `${heading} heading`).toContain(
        `${heading} — up to ${TRUST_WEIGHTS[key]} points`,
      );
    }
  });

  it("quotes each penalty at the cost the code charges", () => {
    expect(doc).toContain(`−${TRUST_PENALTIES.disputeLost} per lost dispute`);
  });

  it("names no penalty the code does not apply", () => {
    // The phantom that lived in the engine header for months.
    expect(doc).not.toContain("Suspension history");
  });
});

describe("the identity holds across the whole input space", () => {
  // Seeded so a failure is reproducible rather than a Tuesday mystery.
  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }

  it("score is always the clamped sum, and floored always reports the clamp (1000 cases)", () => {
    const rnd = lcg(20260803);
    for (let n = 0; n < 1000; n++) {
      const totalTrades = Math.floor(rnd() * 500);
      const inputs: TrustBreakdownInputs = {
        totalTrades,
        completedTrades: Math.floor(rnd() * (totalTrades + 1)),
        avgRating: rnd() * 5,
        totalVolume: rnd() * 500_000,
        monthsActive: rnd() * 60,
        externalRepCount: Math.floor(rnd() * 5),
        openDisputes: Math.floor(rnd() * 4),
        disputesLost: Math.floor(rnd() * 4),
        disputesSplit: Math.floor(rnd() * 4),
        fraudSignals: Math.floor(rnd() * 3),
      };
      const b = computeTrustBreakdown(inputs);
      const componentSum = Object.values(b.components).reduce((s, c) => s + c.points, 0);
      const penaltySum = Object.values(b.penalties).reduce((s, p) => s + p.points, 0);

      expect(b.raw_score, JSON.stringify(inputs)).toBe(componentSum);
      expect(b.penalty_total, JSON.stringify(inputs)).toBe(penaltySum);
      expect(b.score, JSON.stringify(inputs)).toBe(
        Math.max(0, Math.min(TRUST_MAX_SCORE, componentSum - penaltySum)),
      );
      expect(b.floored, JSON.stringify(inputs)).toBe(componentSum - penaltySum !== b.score);
      expect(b.score).toBeGreaterThanOrEqual(0);
      expect(b.score).toBeLessThanOrEqual(TRUST_MAX_SCORE);
    }
  });
});
