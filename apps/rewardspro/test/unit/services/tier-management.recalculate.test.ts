import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Recalculating a shop's tiers resolves each customer with the resolver orders
 * use. It reports the customers it couldn't resolve, and it can stop at a
 * deadline and carry on in the next run.
 */

const db = vi.hoisted(() => ({
  customer: { findMany: vi.fn() },
  tier: { findUnique: vi.fn() },
}));

const tierResolution = vi.hoisted(() => ({ updateCustomerToEffectiveTier: vi.fn() }));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));
vi.mock("~/services/tier-resolution.server", () => tierResolution);

import { recalculateTiersSmart } from "~/services/tier-management.server";

const SHOP = "shop.myshopify.com";
const resolved = { success: true, changed: false, previousTierId: "tier-bronze", newTierId: "tier-bronze", source: "SPENDING_BASED" };

beforeEach(() => {
  // Never resolved first, then the rest
  db.customer.findMany
    .mockReset()
    .mockResolvedValueOnce([{ id: "new", currentTierId: null }])
    .mockResolvedValueOnce([
      { id: "stale", currentTierId: "tier-bronze" },
      { id: "recent", currentTierId: "tier-bronze" },
    ]);
  db.tier.findUnique.mockReset().mockResolvedValue(null);
  tierResolution.updateCustomerToEffectiveTier.mockReset().mockResolvedValue(resolved);
  for (const method of ["log", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const resolvedCustomers = () => tierResolution.updateCustomerToEffectiveTier.mock.calls.map(([, id]) => id);

describe("recalculateTiersSmart", () => {
  it("resolves every customer through the resolver, never-resolved first, then the longest since their last resolve", async () => {
    const result = await recalculateTiersSmart(SHOP);

    expect(resolvedCustomers()).toEqual(["new", "stale", "recent"]);
    expect(tierResolution.updateCustomerToEffectiveTier).toHaveBeenCalledWith(SHOP, "new", {
      triggeredBy: "tier_recalculation",
    });
    expect(db.customer.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { shop: SHOP, tierState: { is: null } },
    }));
    expect(db.customer.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { shop: SHOP, tierState: { isNot: null } },
      orderBy: [{ tierState: { lastResolvedAt: "asc" } }, { id: "asc" }],
    }));
    expect(result).toMatchObject({ processed: 3, unchanged: 3, errors: 0, complete: true });
  });

  it("counts a customer the resolver couldn't resolve as an error, not as unchanged", async () => {
    tierResolution.updateCustomerToEffectiveTier
      .mockResolvedValueOnce(resolved)
      .mockResolvedValueOnce({ success: false, changed: false, previousTierId: null, newTierId: null, source: "NONE", error: "connection reset" })
      .mockRejectedValueOnce(new Error("boom"));

    const result = await recalculateTiersSmart(SHOP);

    expect(result).toMatchObject({ processed: 3, unchanged: 1, errors: 2, complete: true });
    expect(result.bySource.spendingBased).toBe(1);
  });

  it("starts no customer after the deadline and says it didn't finish", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    tierResolution.updateCustomerToEffectiveTier.mockImplementation(async () => {
      now += 600; // each resolve takes 600 ms
      return resolved;
    });

    const result = await recalculateTiersSmart(SHOP, { deadline: 2_000 });

    expect(resolvedCustomers()).toEqual(["new", "stale"]);
    expect(result).toMatchObject({ processed: 2, complete: false, errors: 0 });
  });
});
