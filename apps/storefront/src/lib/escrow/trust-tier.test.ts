import { describe, expect, it } from "vitest";
import { resolveTrustTier } from "./trust-tier";
import { TRUST_TIERS } from "./types";

describe("resolveTrustTier", () => {
  it("resolves the tier object the route sends", () => {
    // What GET /api/escrow/trust puts on the wire: getTrustTier()'s entry,
    // serialised.
    const wire = JSON.parse(JSON.stringify(TRUST_TIERS[3]));
    expect(resolveTrustTier(wire)).toBe(TRUST_TIERS[3]);
  });

  it("resolves a bare tier name, in case an older shape meets this page", () => {
    expect(resolveTrustTier("Trusted")?.name).toBe("Trusted");
  });

  it("takes the limits from the local table, not from the payload", () => {
    const tampered = { ...TRUST_TIERS[1], tradeLimit: 999_999, dailyLimit: 999_999 };
    expect(resolveTrustTier(tampered)).toMatchObject({ name: "Starter", tradeLimit: 150, dailyLimit: 500 });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 80],
    ["an object without a name", { minScore: 80 }],
    ["an object with a non-string name", { name: 3 }],
    ["an unknown name", "Legendary"],
    ["an object with an unknown name", { name: "Legendary" }],
  ])("returns null for %s, so the page keeps its default", (_label, value) => {
    expect(resolveTrustTier(value)).toBeNull();
  });

  it("is the fix for comparing the object to a name string", () => {
    const wire = JSON.parse(JSON.stringify(TRUST_TIERS[4]));
    // The old comparison: never matches an object, so every account was New.
    expect(TRUST_TIERS.find((t) => t.name === (wire as unknown))).toBeUndefined();
    expect(resolveTrustTier(wire)?.name).toBe("Elite");
  });
});
