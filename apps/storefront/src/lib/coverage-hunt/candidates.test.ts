import { describe, expect, it } from "vitest";
import {
  createCoverageCandidate,
  validateCoverageCandidateSnapshot,
} from "./candidates";
import { CoverageHuntError } from "./validation";

const base = {
  kind: "missing_set_observations",
  target: { game_code: "op", source_id: "cardrush", set_code: "OP01" },
  metrics: { catalog_cards: 121, observed_cards: 0 },
  observed_at: "2026-07-12T10:00:00.000Z",
  why_candidate: "The catalog has cards, while this source has no observed card in the set.",
} as const;

describe("coverage candidate identity", () => {
  it("is deterministic across object-key order", () => {
    const first = createCoverageCandidate(base);
    const second = createCoverageCandidate({
      why_candidate: base.why_candidate,
      observed_at: base.observed_at,
      metrics: { observed_cards: 0, catalog_cards: 121 },
      target: { set_code: "OP01", source_id: "cardrush", game_code: "op" },
      kind: base.kind,
    });

    expect(second).toEqual(first);
    expect(first.id).toMatch(/^ch_[0-9a-f]{24}$/);
    expect(first.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes identity when an observed fact changes", () => {
    const first = createCoverageCandidate(base);
    const second = createCoverageCandidate({
      ...base,
      observed_at: "2026-07-12T11:00:00.000Z",
    });
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it("rejects a snapshot whose claimed identity does not match its facts", () => {
    const snapshot = createCoverageCandidate(base);
    expect(() =>
      validateCoverageCandidateSnapshot({
        ...snapshot,
        metrics: { catalog_cards: 999, observed_cards: 0 },
      }),
    ).toThrow(/id and fingerprint must match/);
  });

  it("normalizes timestamps before hashing", () => {
    const normalized = createCoverageCandidate({
      ...base,
      observed_at: "2026-07-12T12:00:00+02:00",
    });
    expect(normalized).toEqual(createCoverageCandidate(base));
  });
});

describe("coverage candidate boundaries", () => {
  it("requires missing-set numerator and zero observed cards", () => {
    expect(() =>
      createCoverageCandidate({
        ...base,
        metrics: { catalog_cards: 121, observed_cards: 1 },
      }),
    ).toThrow(CoverageHuntError);
  });

  it("requires a true partial ratio for partial-set candidates", () => {
    const partial = createCoverageCandidate({
      ...base,
      kind: "partial_set_observations",
      metrics: { catalog_cards: 121, observed_cards: 89, observations: 412 },
    });
    expect(partial.metrics.observed_cards).toBe(89);

    expect(() =>
      createCoverageCandidate({
        ...base,
        kind: "partial_set_observations",
        metrics: { catalog_cards: 121, observed_cards: 121 },
      }),
    ).toThrow(/0 < observed_cards < catalog_cards/);
  });

  it("compares stale age with the declared freshness budget", () => {
    const stale = createCoverageCandidate({
      ...base,
      kind: "stale_set_observations",
      metrics: { freshest_age_hours: 49, freshness_budget_hours: 48 },
    });
    expect(stale.kind).toBe("stale_set_observations");

    expect(() =>
      createCoverageCandidate({
        ...base,
        kind: "stale_set_observations",
        metrics: { freshest_age_hours: 48, freshness_budget_hours: 48 },
      }),
    ).toThrow(/above freshness_budget_hours/);
  });

  it("rejects fields that could smuggle values or people into a candidate", () => {
    expect(() =>
      createCoverageCandidate({
        ...base,
        metrics: {
          catalog_cards: 121,
          observed_cards: 0,
          price_gbp: 9.99,
        },
      }),
    ).toThrow(/unknown field.*price_gbp/);

    expect(() =>
      createCoverageCandidate({
        ...base,
        target: {
          ...base.target,
          collector_email: "private@example.test",
        },
      }),
    ).toThrow(/unknown field.*collector_email/);
  });

  it("bounds counts and identifiers", () => {
    expect(() =>
      createCoverageCandidate({
        ...base,
        metrics: { catalog_cards: Number.MAX_SAFE_INTEGER, observed_cards: 0 },
      }),
    ).toThrow(/no greater than/);

    expect(() =>
      createCoverageCandidate({
        ...base,
        target: { ...base.target, set_code: "contains a space" },
      }),
    ).toThrow(/identifier/);
  });
});
