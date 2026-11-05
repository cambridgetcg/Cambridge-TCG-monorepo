import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticatedWebhook } from "~/lib/webhook-helpers.server";
import { monitoring } from "~/lib/telemetry.server";

afterEach(() => {
  vi.restoreAllMocks();
});

// OPERATIONS-8: a webhook's failure reaches Sentry with the store it was for
describe("authenticatedWebhook", () => {
  it("tags monitoring with the delivery's store once Shopify's signature is checked", async () => {
    const tagShop = vi.spyOn(monitoring, "tagShop");
    const delivery = { topic: "ORDERS_PAID", shop: "hooks.myshopify.com", payload: {} };

    await expect(authenticatedWebhook("orders/paid", async () => delivery)).resolves.toBe(delivery);

    expect(tagShop).toHaveBeenCalledWith("hooks.myshopify.com");
  });

  it("tags nothing for a delivery Shopify didn't sign", async () => {
    const tagShop = vi.spyOn(monitoring, "tagShop");
    const refused = new Response(null, { status: 401 });

    await expect(authenticatedWebhook("orders/paid", async () => Promise.reject(refused))).rejects.toBe(refused);

    expect(tagShop).not.toHaveBeenCalled();
  });
});
