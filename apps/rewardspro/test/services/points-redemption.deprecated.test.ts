/**
 * points-redemption.server.ts is disabled — this test pins the contract.
 *
 * Reads return empty/null (two live proxy callers depend on array shape).
 * Writes throw a clear error so any forgotten caller, job, or ops script
 * fails loudly instead of silently spending points and then failing to
 * create a Shopify discount (which was the dangerous behavior the service
 * had before this change).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as svc from "../../app/services/points-redemption.server";

describe("points-redemption — reads are disabled but non-throwing", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("getRedemptionTiers returns an empty array", async () => {
    await expect(svc.getRedemptionTiers("shop.myshopify.com")).resolves.toEqual([]);
  });

  it("getRedemptionTier returns null", async () => {
    await expect(
      svc.getRedemptionTier("shop.myshopify.com", "tier_123")
    ).resolves.toBeNull();
  });

  it("getActiveDiscountCodes returns an empty array", async () => {
    await expect(
      svc.getActiveDiscountCodes("shop.myshopify.com", "cust_abc")
    ).resolves.toEqual([]);
  });

  it("getRedemptionStats returns zeroed aggregates", async () => {
    await expect(svc.getRedemptionStats("shop.myshopify.com")).resolves.toEqual({
      totalRedemptions: 0,
      totalPointsRedeemed: 0,
      totalDiscountValue: 0,
      byTier: {},
      byStatus: {},
    });
  });

  it("deprecation warnings are deduped — repeat calls don't amplify logs", async () => {
    // The module-level _warnedReads Set persists across tests and is
    // already populated from the reads above, so calling again must not
    // emit another warn. This documents the dedup guarantee without
    // depending on test ordering.
    warnSpy.mockClear();
    await svc.getRedemptionTiers("shop.myshopify.com");
    await svc.getRedemptionTier("shop.myshopify.com", "t");
    await svc.getActiveDiscountCodes("shop.myshopify.com", "c");
    await svc.getRedemptionStats("shop.myshopify.com");
    expect(warnSpy.mock.calls.length).toBe(0);
  });
});

describe("points-redemption — every write throws", () => {
  const error = /deprecated and has been disabled/;

  it.each([
    [
      "redeemPoints",
      () => svc.redeemPoints("shop", "cust", "tier"),
    ],
    [
      "createRedemptionTier",
      () =>
        svc.createRedemptionTier("shop", {
          name: "x",
          pointsCost: 100,
          type: "FIXED_DISCOUNT",
          value: 5,
          isActive: true,
        }),
    ],
    [
      "updateRedemptionTier",
      () => svc.updateRedemptionTier("shop", "tier", { value: 10 }),
    ],
    ["deleteRedemptionTier", () => svc.deleteRedemptionTier("shop", "tier")],
    ["markRedemptionUsed", () => svc.markRedemptionUsed("shop", "cust", "r1")],
    ["markRedemptionUsedByCode", () => svc.markRedemptionUsedByCode("shop", "CODE")],
    ["cancelRedemption", () => svc.cancelRedemption("shop", "cust", "r1")],
    ["processExpiredRedemptions", () => svc.processExpiredRedemptions("shop")],
  ])("%s rejects with deprecation error", async (_name, call) => {
    await expect(call()).rejects.toThrow(error);
  });
});
