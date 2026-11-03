import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A discount reward is delivered only when Shopify has created the code.
 * Without an admin client, when Shopify refuses, answers without a discount
 * id, or the call throws, no code reaches the shopper and nothing is marked
 * delivered.
 */

const prisma = vi.hoisted(() => ({
  challengeParticipant: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  challenge: { findUnique: vi.fn(), update: vi.fn() },
  challengeReward: { findFirst: vi.fn() },
  mysteryBoxWinner: { findFirst: vi.fn(), update: vi.fn() },
  raffleWinner: { findFirst: vi.fn() },
  customer: { findUnique: vi.fn() },
  raffleEntry: { findFirst: vi.fn() },
}));
const discounts = vi.hoisted(() => ({ createDiscountCode: vi.fn() }));
const raffleDrawing = vi.hoisted(() => ({ updateWinnerDeliveryStatus: vi.fn(), markWinnerNotified: vi.fn() }));

vi.mock("~/db.server", () => ({ default: prisma, db: prisma, databaseSchema: "rewardspro" }));
vi.mock("~/services/shopify-discount.service", () => ({ createDiscountService: () => discounts }));
vi.mock("~/services/points-ledger.server", () => ({ earnPoints: vi.fn() }));
vi.mock("~/services/mission-events.server", () => ({ createClaimEvent: vi.fn() }));
vi.mock("~/services/manual-tier-assignment.server", () => ({ assignCustomerToTier: vi.fn() }));
vi.mock("~/services/raffle-drawing.server", () => raffleDrawing);
vi.mock("~/services/klaviyo-events.server", () => ({ trackRaffleWon: vi.fn() }));
vi.mock("~/services/raffle-draft-order.server", () => ({ createRaffleDraftOrder: vi.fn() }));
vi.mock("~/services/product-search.server", () => ({ getFirstVariantId: vi.fn() }));

import { claimChallengeReward } from "~/services/challenge-claim.server";
import { deliverReward as deliverMysteryBoxReward } from "~/services/mystery-box-delivery.server";
import { deliverPrize as deliverRafflePrize } from "~/services/raffle-prize-delivery.server";

const SHOP = "discounts.myshopify.com";
const ADMIN = { graphql: vi.fn() };
const CREATED = { success: true, discountId: "gid://shopify/DiscountCodeNode/1", code: "SERVER-CODE" };

const failures: Array<[string, typeof ADMIN | undefined, () => void]> = [
  ["there is no Shopify admin client", undefined, () => {}],
  ["Shopify refuses the discount", ADMIN, () => discounts.createDiscountCode.mockResolvedValue({ success: false, error: "Access denied" })],
  ["Shopify answers without a discount id", ADMIN, () => discounts.createDiscountCode.mockResolvedValue({ success: true })],
  ["the Shopify call throws", ADMIN, () => discounts.createDiscountCode.mockRejectedValue(new Error("network down"))],
];

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  discounts.createDiscountCode.mockReset();
});

describe("mission claims with a discount reward", () => {
  beforeEach(() => {
    prisma.challengeParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.challengeParticipant.findFirst.mockResolvedValue({ id: "participant-1", status: "COMPLETED" });
    prisma.challenge.findUnique.mockResolvedValue({ id: "chal-1234", shop: SHOP, name: "Spend 50" });
    prisma.challengeReward.findFirst.mockResolvedValue({
      rewardType: "DISCOUNT",
      rewardValue: { type: "percentage", value: 15 },
      description: "15% off",
    });
  });

  it.each(failures)("fail and stay claimable when %s", async (_case, admin, arrange) => {
    arrange();

    const result = await claimChallengeReward(SHOP, "customer-1", "chal-1234", admin);

    expect(result.success).toBe(false);
    expect(result.deliveryId).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/CHAL-/);
    expect(prisma.challengeParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-1" },
      data: { claimedAt: null },
    });
    expect(prisma.challengeParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CLAIMED" }) }),
    );
  });

  it("succeed with the code once Shopify has created it", async () => {
    discounts.createDiscountCode.mockResolvedValue(CREATED);

    const result = await claimChallengeReward(SHOP, "customer-1", "chal-1234", ADMIN);

    expect(result.success).toBe(true);
    expect(result.deliveryId).toMatch(/^CHAL-CHAL-/);
    expect(result.message).toContain(result.deliveryId);
    expect(prisma.challengeParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CLAIMED" }) }),
    );
  });
});

describe("paused mystery box discount rewards", () => {
  beforeEach(() => {
    prisma.mysteryBoxWinner.findFirst.mockResolvedValue({
      id: "winner-abcdef12",
      shop: SHOP,
      customerId: "customer-1",
      deliveryStatus: "PENDING",
      reward: { rewardType: "DISCOUNT", rewardValue: { type: "percentage", value: 10 } },
      box: { name: "Box" },
      customer: { id: "customer-1", email: null, shopifyCustomerId: "1" },
    });
  });

  it.each(failures)("are not delivered when %s", async (_case, admin, arrange) => {
    arrange();

    const result = await deliverMysteryBoxReward("winner-abcdef12", { admin, skipNotification: true });

    expect(result.success).toBe(false);
    expect(result.discountCode).toBeUndefined();
    expect(prisma.mysteryBoxWinner.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveryStatus: "DELIVERED" }) }),
    );
  });

  it("are delivered once Shopify has created the code", async () => {
    discounts.createDiscountCode.mockResolvedValue(CREATED);

    const result = await deliverMysteryBoxReward("winner-abcdef12", { admin: ADMIN, skipNotification: true });

    expect(result).toMatchObject({ success: true, discountCode: "MBOX-ABCDEF12" });
  });
});

describe("paused raffle discount prizes", () => {
  beforeEach(() => {
    prisma.raffleWinner.findFirst.mockResolvedValue({
      id: "winner-abcdef12",
      shop: SHOP,
      customerId: "customer-1",
      deliveryStatus: "PENDING",
      prize: { id: "prize-1", prizeType: "DISCOUNT", prizeValue: { type: "percentage", value: 10 }, name: "10% off" },
      raffle: { id: "raffle-1", name: "Raffle" },
      customer: { id: "customer-1", email: null, shopifyCustomerId: "1" },
    });
    prisma.customer.findUnique.mockResolvedValue(null);
  });

  it.each(failures)("are not delivered when %s", async (_case, admin, arrange) => {
    arrange();

    const result = await deliverRafflePrize("winner-abcdef12", { admin, skipNotification: true });

    expect(result.success).toBe(false);
    expect(result.discountCode).toBeUndefined();
    expect(raffleDrawing.updateWinnerDeliveryStatus).not.toHaveBeenCalledWith(
      "winner-abcdef12",
      "DELIVERED",
      expect.anything(),
    );
  });

  it("are delivered once Shopify has created the code", async () => {
    discounts.createDiscountCode.mockResolvedValue(CREATED);

    const result = await deliverRafflePrize("winner-abcdef12", { admin: ADMIN, skipNotification: true });

    expect(result).toMatchObject({ success: true, discountCode: "RAFFLE-ABCDEF12" });
  });
});
