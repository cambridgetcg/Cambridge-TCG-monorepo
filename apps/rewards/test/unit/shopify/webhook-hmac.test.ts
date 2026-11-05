import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monitoring } from "~/lib/telemetry.server";
import { triggeredAtOf, verifyShopifyWebhook } from "~/shopify/webhook-hmac.server";

const SHOP = "hmac-test.myshopify.com";
const SECRET = process.env.SHOPIFY_API_SECRET!;

/** Each own-check topic's payload as Shopify sends it, as much of it as the check reads. */
const UNINSTALLED = { id: 1, domain: SHOP, myshopify_domain: SHOP };
const SHOP_REDACT = { shop_id: 1, shop_domain: SHOP };
const CUSTOMERS_REDACT = { shop_id: 1, shop_domain: SHOP, customer: { id: 7 }, orders_to_redact: [11] };
const DATA_REQUEST = { shop_id: 1, shop_domain: SHOP, customer: { id: 7 }, orders_requested: [11], data_request: { id: 9 } };

const sign = (body: string, secret = SECRET) => crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");

/** A delivery as Shopify sends it, with header changes (null removes one). */
function delivery(o: { body?: string; headers?: Record<string, string | null>; method?: string } = {}): Request {
  const body = o.body ?? JSON.stringify(UNINSTALLED);
  const headers: Record<string, string | null> = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": "app/uninstalled",
    "X-Shopify-Shop-Domain": SHOP,
    "X-Shopify-Hmac-Sha256": sign(body),
    "X-Shopify-Webhook-Id": "webhook-1",
    ...o.headers,
  };
  const kept = Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== null);
  const method = o.method ?? "POST";
  return new Request("https://test.example.com/webhooks/app/uninstalled", { method, headers: kept, ...(method === "GET" ? {} : { body }) });
}

afterEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET;
  vi.restoreAllMocks();
});

describe("verifyShopifyWebhook", () => {
  it("accepts a delivery signed with the app's secret, without any session", async () => {
    await expect(verifyShopifyWebhook(delivery())).resolves.toEqual({
      topic: "APP_UNINSTALLED",
      shop: SHOP,
      webhookId: "webhook-1",
      payload: UNINSTALLED,
    });
  });

  // OPERATIONS-8: the store a verified delivery is for goes on monitoring's scope; nothing for one Shopify didn't sign
  it("tags monitoring with the store, once the delivery is verified", async () => {
    const tagShop = vi.spyOn(monitoring, "tagShop");

    await verifyShopifyWebhook(delivery({ headers: { "X-Shopify-Hmac-Sha256": sign("{}") } }));
    expect(tagShop).not.toHaveBeenCalled();

    await verifyShopifyWebhook(delivery());
    expect(tagShop).toHaveBeenCalledWith(SHOP);
  });

  it("names the topic as the library does", async () => {
    for (const [header, topic, payload] of [
      ["customers/data_request", "CUSTOMERS_DATA_REQUEST", DATA_REQUEST],
      ["customers/redact", "CUSTOMERS_REDACT", CUSTOMERS_REDACT],
      ["shop/redact", "SHOP_REDACT", SHOP_REDACT],
      ["orders/cancelled", "ORDERS_CANCELLED", { id: 1 }],
    ] as const) {
      await expect(verifyShopifyWebhook(delivery({ body: JSON.stringify(payload), headers: { "X-Shopify-Topic": header } }))).resolves.toMatchObject({
        topic,
        payload,
      });
    }
  });

  // Ruling 40: the shop header and the topic header are not signed; the body is.
  describe("the signed body decides the shop and the topic's shape", () => {
    const as = (topic: string, payload: unknown, shop = SHOP) =>
      verifyShopifyWebhook(delivery({ body: JSON.stringify(payload), headers: { "X-Shopify-Topic": topic, "X-Shopify-Shop-Domain": shop } }));
    const OTHER = "someone-else.myshopify.com";

    it("refuses an uninstall whose shop header isn't the payload's myshopify_domain", async () => {
      await expect(as("app/uninstalled", UNINSTALLED, OTHER)).resolves.toBeNull();
      await expect(as("app/uninstalled", { ...UNINSTALLED, myshopify_domain: OTHER })).resolves.toBeNull();
      await expect(as("app/uninstalled", { id: 1, domain: SHOP })).resolves.toBeNull();
    });

    it.each([
      ["shop/redact", SHOP_REDACT],
      ["customers/redact", CUSTOMERS_REDACT],
      ["customers/data_request", DATA_REQUEST],
    ] as const)("refuses %s whose shop header isn't the payload's shop_domain", async (topic, payload) => {
      await expect(as(topic, payload)).resolves.toMatchObject({ shop: SHOP, payload });
      await expect(as(topic, payload, OTHER)).resolves.toBeNull();
      await expect(as(topic, { ...payload, shop_domain: OTHER })).resolves.toBeNull();
      const withoutDomain: Record<string, unknown> = { ...payload };
      delete withoutDomain.shop_domain;
      await expect(as(topic, withoutDomain)).resolves.toBeNull();
    });

    it("refuses a compliance body relabelled as another topic", async () => {
      // A signed data request or buyer redaction posted as shop/redact would erase the store
      await expect(as("shop/redact", DATA_REQUEST)).resolves.toBeNull();
      await expect(as("shop/redact", CUSTOMERS_REDACT)).resolves.toBeNull();
      await expect(as("shop/redact", { shop_domain: SHOP })).resolves.toBeNull();
      // and relabelled as customers/redact, it would erase the buyer
      await expect(as("customers/redact", DATA_REQUEST)).resolves.toBeNull();
      await expect(as("customers/redact", SHOP_REDACT)).resolves.toBeNull();
      await expect(as("customers/data_request", CUSTOMERS_REDACT)).resolves.toBeNull();
      await expect(as("customers/data_request", SHOP_REDACT)).resolves.toBeNull();
      await expect(as("app/uninstalled", SHOP_REDACT)).resolves.toBeNull();
    });

    it("accepts a buyer redaction or data request whose customer has no id: the route decides", async () => {
      await expect(as("customers/redact", { ...CUSTOMERS_REDACT, customer: {} })).resolves.not.toBeNull();
      await expect(as("customers/data_request", { ...DATA_REQUEST, customer: null })).resolves.not.toBeNull();
    });

    it("refuses a body that isn't an object", async () => {
      await expect(as("shop/redact", [SHOP_REDACT])).resolves.toBeNull();
      await expect(as("app/uninstalled", null)).resolves.toBeNull();
    });
  });

  it("refuses a body that isn't the one signed", async () => {
    const signed = JSON.stringify({ id: 1 });
    await expect(verifyShopifyWebhook(delivery({ body: JSON.stringify({ id: 2 }), headers: { "X-Shopify-Hmac-Sha256": sign(signed) } }))).resolves.toBeNull();
  });

  it("refuses a signature made with another secret", async () => {
    const body = JSON.stringify({ id: 1 });
    await expect(verifyShopifyWebhook(delivery({ body, headers: { "X-Shopify-Hmac-Sha256": sign(body, "another-secret") } }))).resolves.toBeNull();
  });

  it.each(["", "not base64 at all", "AAAA"])("refuses a malformed signature %j", async (hmac) => {
    await expect(verifyShopifyWebhook(delivery({ headers: { "X-Shopify-Hmac-Sha256": hmac } }))).resolves.toBeNull();
  });

  it("refuses everything while the app's secret is not set", async () => {
    const body = JSON.stringify({ id: 1 });
    process.env.SHOPIFY_API_SECRET = "";
    await expect(verifyShopifyWebhook(delivery({ body, headers: { "X-Shopify-Hmac-Sha256": sign(body, "") } }))).resolves.toBeNull();
    delete process.env.SHOPIFY_API_SECRET;
    await expect(verifyShopifyWebhook(delivery({ body, headers: { "X-Shopify-Hmac-Sha256": sign(body, "") } }))).resolves.toBeNull();
  });

  // The same rule as the connection's key (app/lib/shop-domain.ts).
  it.each(["Hmac-Test.myshopify.com", "hmac-test.myshopify.com.example.com", "shop.example.com", "-shop.myshopify.com", ""])(
    "refuses a shop domain that isn't canonical: %j",
    async (shop) => {
      await expect(verifyShopifyWebhook(delivery({ headers: { "X-Shopify-Shop-Domain": shop } }))).resolves.toBeNull();
    },
  );

  it.each(["X-Shopify-Hmac-Sha256", "X-Shopify-Shop-Domain", "X-Shopify-Topic", "X-Shopify-Webhook-Id"])("refuses a delivery without %s", async (header) => {
    await expect(verifyShopifyWebhook(delivery({ headers: { [header]: null } }))).resolves.toBeNull();
  });

  it("refuses a signed body that isn't JSON, and an empty one", async () => {
    await expect(verifyShopifyWebhook(delivery({ body: "not json" }))).resolves.toBeNull();
    await expect(verifyShopifyWebhook(delivery({ body: "" }))).resolves.toBeNull();
  });

  it("refuses anything but a POST", async () => {
    await expect(verifyShopifyWebhook(delivery({ method: "GET" }))).resolves.toBeNull();
  });
});

describe("triggeredAtOf", () => {
  const received = new Date("2026-11-05T12:00:00Z");
  const at = (value: string | null) => triggeredAtOf(delivery({ headers: { "X-Shopify-Triggered-At": value } }), received);

  it("reads Shopify's nanosecond timestamp", () => {
    expect(at("2026-11-05T10:00:00.877041743Z")).toEqual(new Date("2026-11-05T10:00:00.877Z"));
  });

  it("falls back to the receipt time when the header is missing or doesn't read", () => {
    expect(at(null)).toEqual(received);
    expect(at("yesterday")).toEqual(received);
    expect(at("")).toEqual(received);
  });

  it("is never later than the receipt: the header isn't signed", () => {
    expect(at("2026-11-05T12:00:01Z")).toEqual(received);
  });
});
