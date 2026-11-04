import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the two tables the failed purchase touches are stubbed
const db = vi.hoisted(() => ({
  tierProduct: { findUnique: vi.fn() },
  tier: { findUnique: vi.fn() },
  webhookError: { create: vi.fn() },
}));
vi.mock("~/db.server", () => ({ default: db }));

import { TierProductPurchaseService, type TierProductForPurchase } from "~/services/tier-products/tier-product-purchase.server";

const SHOP = "test-shop.myshopify.com";
const SHOPPER_EMAIL = "shopper@example.com";
const SHOPPER_ID = 123456789;

const order = { id: 5550001, currency: "GBP", email: SHOPPER_EMAIL, customer: { id: SHOPPER_ID, email: SHOPPER_EMAIL } };
const lineItem = { id: 7770001, price: "20.00", sku: "GOLD-1M", title: "Gold membership" };
const tierProduct = { id: "tp-1", tierId: "tier-gold", duration: "MONTHLY", tier: null } as unknown as TierProductForPurchase;

describe("a tier product purchase that cannot be fulfilled", () => {
  beforeEach(() => {
    db.webhookError.create.mockResolvedValue({});
  });

  it("logs the order for review without the shopper's email or customer id, which customers/redact does not reach", async () => {
    // The tier product was deleted after the shopper bought it
    db.tierProduct.findUnique.mockResolvedValue(null);

    const result = await TierProductPurchaseService.createPurchase(SHOP, order, lineItem, tierProduct);

    expect(result.errorCode).toBe("TIER_PRODUCT_DELETED");
    expect(db.webhookError.create).toHaveBeenCalledTimes(1);
    const logged = db.webhookError.create.mock.calls[0][0].data;
    expect(logged).toMatchObject({ shop: SHOP, topic: "tier_purchase_failed", orderId: String(order.id) });
    expect(logged.payload).not.toHaveProperty("customerEmail");
    expect(logged.payload).not.toHaveProperty("customerId");
    expect(JSON.stringify(logged)).not.toContain(SHOPPER_EMAIL);
    expect(JSON.stringify(logged)).not.toContain(String(SHOPPER_ID));
  });
});
