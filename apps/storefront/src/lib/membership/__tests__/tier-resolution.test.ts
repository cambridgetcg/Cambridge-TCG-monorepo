import { describe, it, expect } from "vitest";
import { selectSpendingTier } from "../tier-resolution";
import type { Tier } from "../types";

// Minimal Tier factory — only the fields selectSpendingTier reads matter.
function tier(partial: Partial<Tier> & { name: string; sort_order: number }): Tier {
  return {
    id: partial.name.toLowerCase(),
    name: partial.name,
    description: null,
    icon: "⭐",
    color: "#000000",
    sort_order: partial.sort_order,
    min_annual_spend: partial.min_annual_spend ?? "0",
    cashback_percent: "0",
    points_multiplier: "1",
    tradein_bonus_percent: "0",
    p2p_commission_rate: "0.08",
    auction_commission_rate: "0.12",
    auction_priority_approval: false,
    benefits: [],
    is_active: true,
    store_discount_percent: "0",
    is_paid: partial.is_paid ?? false,
    monthly_price: null,
    annual_price: null,
    is_hidden: partial.is_hidden ?? false,
  } as unknown as Tier;
}

// Mirrors the production seed (getAllTiers(true) — includes hidden), sorted by
// sort_order ASC. OG is the free, hidden, sort_order=99 tier that caused the bug.
const LADDER: Tier[] = [
  tier({ name: "Bronze", sort_order: 0, min_annual_spend: "0" }),
  tier({ name: "Silver", sort_order: 1, min_annual_spend: "100" }),
  tier({ name: "Gold", sort_order: 2, min_annual_spend: "500" }),
  tier({ name: "Platinum", sort_order: 3, min_annual_spend: "0", is_paid: true }),
  tier({ name: "Pro", sort_order: 3, min_annual_spend: "300", is_paid: true }),
  tier({ name: "OG", sort_order: 99, min_annual_spend: "0", is_hidden: true }),
];

describe("selectSpendingTier", () => {
  it("REGRESSION: a brand-new £0-spend account resolves to Bronze, never OG", () => {
    const t = selectSpendingTier(LADDER, 0);
    expect(t?.name).toBe("Bronze");
    expect(t?.name).not.toBe("OG");
  });

  it("never resolves the hidden OG tier from spending, at any spend level", () => {
    for (const spend of [0, 50, 100, 500, 5000, 1_000_000]) {
      expect(selectSpendingTier(LADDER, spend)?.name).not.toBe("OG");
    }
  });

  it("never resolves a paid tier (Platinum/Pro) from spending", () => {
    for (const spend of [0, 300, 500, 10_000]) {
      const name = selectSpendingTier(LADDER, spend)?.name;
      expect(name).not.toBe("Platinum");
      expect(name).not.toBe("Pro");
    }
  });

  it("resolves the highest free/visible tier the spend qualifies for", () => {
    expect(selectSpendingTier(LADDER, 99)?.name).toBe("Bronze");
    expect(selectSpendingTier(LADDER, 100)?.name).toBe("Silver");
    expect(selectSpendingTier(LADDER, 499)?.name).toBe("Silver");
    expect(selectSpendingTier(LADDER, 500)?.name).toBe("Gold");
    expect(selectSpendingTier(LADDER, 5000)?.name).toBe("Gold");
  });

  it("falls back to the base free tier when below every threshold", () => {
    const noBronze = LADDER.filter((t) => t.name !== "Bronze");
    // Silver (min 100) is now the lowest free/visible tier.
    expect(selectSpendingTier(noBronze, 0)?.name).toBe("Silver");
  });

  it("returns null when no free, visible tier exists", () => {
    const paidOnly = LADDER.filter((t) => t.is_paid || t.is_hidden);
    expect(selectSpendingTier(paidOnly, 1000)).toBeNull();
  });
});
