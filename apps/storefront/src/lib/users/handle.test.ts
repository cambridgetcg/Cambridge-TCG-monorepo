import { describe, it, expect } from "vitest";
import { generateHandle, fallbackHandle, HANDLE_REGEX } from "./handle";

// The contract that matters: every generated handle must pass the
// PATCH /api/social/profile validation (3-30 chars, [a-z0-9_] only),
// or first-login users would be assigned a name the profile editor
// refuses to re-save.

describe("generateHandle", () => {
  it("always satisfies the profile-editor username constraints", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateHandle()).toMatch(HANDLE_REGEX);
    }
  });

  it("has the two-words-plus-four-digits shape", () => {
    expect(generateHandle()).toMatch(/^[a-z]+_[a-z]+_\d{4}$/);
  });

  it("is deterministic under an injected rng, including edge values", () => {
    expect(generateHandle(() => 0)).toBe(generateHandle(() => 0));
    // rng values approaching 1 must not index past the word lists
    // or produce a 5th digit.
    expect(generateHandle(() => 0.999999)).toMatch(/^[a-z]+_[a-z]+_\d{4}$/);
  });

  it("zero-pads the digit block", () => {
    expect(generateHandle(() => 0)).toMatch(/_0000$/);
  });
});

describe("fallbackHandle", () => {
  it("satisfies the same constraints", () => {
    for (let i = 0; i < 100; i++) {
      expect(fallbackHandle()).toMatch(HANDLE_REGEX);
    }
  });

  it("is collector_ plus 12 digits", () => {
    expect(fallbackHandle()).toMatch(/^collector_\d{12}$/);
  });
});
