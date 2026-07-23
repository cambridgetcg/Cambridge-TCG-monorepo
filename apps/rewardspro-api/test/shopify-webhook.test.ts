import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  InvalidShopifyWebhookError,
  parseShopifyPayload,
  parseShopifyWebhookHeaders,
  verifyShopifyHmac,
} from "../src/webhooks/shopify.js";

describe("Shopify webhook verification", () => {
  it("verifies the exact raw bytes with SHA-256 HMAC", () => {
    const rawBody = Buffer.from('{\n  "id": 42\n}\n');
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(rawBody).digest("base64");

    expect(verifyShopifyHmac(rawBody, signature, secret)).toBe(true);
    expect(
      verifyShopifyHmac(Buffer.from('{"id":42}'), signature, secret),
    ).toBe(false);
  });

  it("rejects malformed base64 before constant-time comparison", () => {
    expect(verifyShopifyHmac(Buffer.from("{}"), "not-base64", "secret")).toBe(
      false,
    );
  });

  it("parses and canonicalizes required Shopify headers", () => {
    expect(
      parseShopifyWebhookHeaders({
        "x-shopify-hmac-sha256": "abc",
        "x-shopify-shop-domain": "EXAMPLE.myshopify.com",
        "x-shopify-topic": "orders/paid",
        "x-shopify-triggered-at": "2026-07-23T12:34:56Z",
        "x-shopify-webhook-id": "webhook-1",
      }),
    ).toEqual({
      hmac: "abc",
      shopDomain: "example.myshopify.com",
      topic: "orders/paid",
      triggeredAt: "2026-07-23T12:34:56Z",
      webhookId: "webhook-1",
    });
  });

  it("rejects duplicate headers and non-Shopify domains", () => {
    expect(() =>
      parseShopifyWebhookHeaders({
        "x-shopify-hmac-sha256": ["one", "two"],
        "x-shopify-shop-domain": "attacker.example",
        "x-shopify-topic": "orders/paid",
        "x-shopify-webhook-id": "webhook-1",
      }),
    ).toThrow(InvalidShopifyWebhookError);
  });

  it("accepts only JSON objects as provider payloads", () => {
    expect(parseShopifyPayload(Buffer.from('{"id":1}'))).toEqual({ id: 1 });
    expect(
      parseShopifyPayload(
        Buffer.from('{"id":820982911946154508,"price":12.50}'),
      ),
    ).toEqual({ id: "820982911946154508", price: "12.50" });
    expect(() => parseShopifyPayload(Buffer.from("[1]"))).toThrow(
      InvalidShopifyWebhookError,
    );
    expect(() => parseShopifyPayload(Buffer.from("{"))).toThrow(
      InvalidShopifyWebhookError,
    );
  });
});
