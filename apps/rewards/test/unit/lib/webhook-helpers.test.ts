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

  // Ruling 85: another renewal of the store's token is running, so Shopify delivers it again later
  it("answers a try-later 503 on, without reporting it as a failure", async () => {
    const captured = vi.spyOn(monitoring, "captureException");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const later = new Response(null, { status: 503 });

    await expect(authenticatedWebhook("orders/paid", async () => Promise.reject(later))).rejects.toBe(later);

    expect(captured).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it("tags nothing for a delivery Shopify didn't sign", async () => {
    const tagShop = vi.spyOn(monitoring, "tagShop");
    const refused = new Response(null, { status: 401 });

    await expect(authenticatedWebhook("orders/paid", async () => Promise.reject(refused))).rejects.toBe(refused);

    expect(tagShop).not.toHaveBeenCalled();
  });
});
