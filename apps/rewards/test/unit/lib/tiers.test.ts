import { describe, expect, it, vi } from "vitest";

// tiers.server imports the app's Prisma client, which needs a database URL;
// the pure functions here never touch it.
vi.mock("~/db.server", () => ({ default: {} }));

import { Money } from "~/lib/money";
import { BASE_TIER_NAME, type TierRow, parseBaseRate, progress, qualify, windowStart } from "~/lib/tiers.server";

const tier = (id: string, minSpend: string, percent: string, position: number): TierRow => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  minSpend: new Money(minSpend),
  cashbackPercent: new Money(percent),
  position,
});

// Out of order on purpose: both functions sort by minimum spend.
const gold = tier("gold", "500", "10", 2);
const bronze = tier("bronze", "0", "5", 0);
const silver = tier("silver", "200", "7.5", 1);
const TIERS = [gold, bronze, silver];

const spend = (v: string) => new Money(v);

describe("windowStart", () => {
  it("is the same instant one calendar year earlier for the rolling window", () => {
    expect(windowStart("rolling_12_months", new Date("2026-11-05T14:30:15.250Z"))).toEqual(
      new Date("2025-11-05T14:30:15.250Z"),
    );
  });

  it("is the last day of February a year before a 29 February", () => {
    expect(windowStart("rolling_12_months", new Date("2028-02-29T08:00:00Z"))).toEqual(new Date("2027-02-28T08:00:00Z"));
  });

  it("is null for all time", () => {
    expect(windowStart("lifetime", new Date("2026-11-05T00:00:00Z"))).toBeNull();
  });
});

describe("qualify", () => {
  it("picks the highest minimum at or below the spend", () => {
    expect(qualify(spend("0"), TIERS)).toBe(bronze);
    expect(qualify(spend("199.9999"), TIERS)).toBe(bronze);
    expect(qualify(spend("200"), TIERS)).toBe(silver);
    expect(qualify(spend("499.99"), TIERS)).toBe(silver);
    expect(qualify(spend("500.0000"), TIERS)).toBe(gold);
    expect(qualify(spend("100000"), TIERS)).toBe(gold);
  });

  it("compares exact decimals, not floats", () => {
    const tiers = [tier("low", "0", "1", 0), tier("high", "0.3", "2", 1)];
    // 0.1 + 0.2 is 0.30000000000000004 in floats
    expect(qualify(spend("0.1").plus("0.2"), tiers).id).toBe("high");
    expect(qualify(spend("0.2999"), tiers).id).toBe("low");
  });

  it("places spend below every minimum in the lowest tier (rule 2)", () => {
    const tiers = [tier("silver", "200", "7.5", 1), tier("gold", "500", "10", 2)];
    expect(qualify(spend("50"), tiers).id).toBe("silver");
  });

  it("refuses an empty tier list", () => {
    expect(() => qualify(spend("10"), [])).toThrow(RangeError);
  });
});

describe("progress", () => {
  it("measures the way from the current tier's minimum to the next one's, floored", () => {
    // Bronze 0 to Silver 200: 133.99 is 66.995%, floored to 66
    expect(progress(spend("133.99"), "bronze", TIERS)).toEqual({
      percent: 66,
      nextTierName: "Silver",
      nextTierPercent: new Money("7.5"),
      nextTierMin: new Money("200"),
      amountRemaining: new Money("66.01"),
      isTop: false,
    });
    // Silver 200 to Gold 500: 350 is half way
    expect(progress(spend("350"), "silver", TIERS)).toMatchObject({ percent: 50, nextTierName: "Gold" });
    expect(progress(spend("350"), "silver", TIERS).amountRemaining.toFixed()).toBe("150");
  });

  it("caps at 99 below the top tier, even when the spend already reaches the next minimum", () => {
    expect(progress(spend("199.9999"), "bronze", TIERS).percent).toBe(99);
    // Held below what the spend gives (a lock, or not resolved yet)
    const ahead = progress(spend("800"), "bronze", TIERS);
    expect(ahead).toMatchObject({ percent: 99, nextTierName: "Silver", isTop: false });
    expect(ahead.amountRemaining.toFixed()).toBe("0");
  });

  it("is never below 0, for a buyer held above their spend", () => {
    const locked = progress(spend("50"), "silver", TIERS);
    expect(locked).toMatchObject({ percent: 0, nextTierName: "Gold" });
    expect(locked.amountRemaining.toFixed()).toBe("450");
  });

  it("is 100 at the top tier, with nothing next", () => {
    expect(progress(spend("50"), "gold", TIERS)).toEqual({
      percent: 100,
      nextTierName: null,
      nextTierPercent: null,
      nextTierMin: null,
      amountRemaining: new Money(0),
      isTop: true,
    });
  });

  it("keeps exact decimals in the amount remaining", () => {
    const tiers = [tier("low", "0", "1", 0), tier("high", "0.3", "2", 1)];
    const p = progress(spend("0.1").plus("0.1"), "low", tiers);
    expect(p.amountRemaining.toFixed()).toBe("0.1");
    expect(p.percent).toBe(66);
  });

  it("counts a tier it can't find as the lowest one (rule 2)", () => {
    expect(progress(spend("100"), "deleted", TIERS)).toMatchObject({ percent: 50, nextTierName: "Silver" });
  });

  it("measures toward the next distinct minimum when the next tier shares the current one's (A12-F2)", () => {
    // Bronze and Copper both start at 0: the way from Bronze leads to Silver at 200.
    const tiers = [...TIERS, tier("copper", "0", "6", 1)];
    expect(progress(spend("100"), "bronze", tiers)).toMatchObject({ percent: 50, nextTierName: "Silver", isTop: false });
    expect(progress(spend("100"), "bronze", tiers).amountRemaining.toFixed()).toBe("100");
    expect(progress(spend("100"), "copper", tiers)).toMatchObject({ percent: 50, nextTierName: "Silver" });
  });

  it("is at the top when every tier above shares the current minimum: no spend reaches further (A12-F2)", () => {
    const tiers = [bronze, silver, tier("platinum", "200", "9", 3)];
    expect(progress(spend("300"), "silver", tiers)).toEqual({
      percent: 100,
      nextTierName: null,
      nextTierPercent: null,
      nextTierMin: null,
      amountRemaining: new Money(0),
      isTop: true,
    });
  });

  it("is a single tier's top", () => {
    expect(progress(spend("0"), "bronze", [bronze])).toMatchObject({ percent: 100, isTop: true, nextTierName: null });
  });

  it("is empty with no tiers", () => {
    expect(progress(spend("10"), "bronze", [])).toEqual({
      percent: 0,
      nextTierName: null,
      nextTierPercent: null,
      nextTierMin: null,
      amountRemaining: new Money(0),
      isTop: false,
    });
  });
});

// A19-F4: the base rate's rules are the engine's, which the Home page uses
describe("the base rate", () => {
  it("takes a base rate only as a whole percent from 0 to 100", () => {
    expect(["0", "5", " 12 ", "100"].map(parseBaseRate)).toEqual([0, 5, 12, 100]);
    expect(["4.5", "101", "-1", "", "1e2", "five", null].map(parseBaseRate)).toEqual([null, null, null, null, null, null, null]);
  });

  it("names the tier it creates", () => {
    expect(BASE_TIER_NAME).toBe("Everyone");
  });
});
