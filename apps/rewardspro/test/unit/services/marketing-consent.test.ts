import { afterEach, describe, expect, it } from "vitest";
import {
  consentFromShopify,
  marketingConsentUpdate,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "~/services/marketing-consent.server";

const T1 = new Date("2026-10-01T10:00:00Z");
const T2 = new Date("2026-10-02T10:00:00Z");
const T3 = new Date("2026-10-03T10:00:00Z");

describe("Shopify consent", () => {
  it.each([
    ["subscribed", true],
    ["SUBSCRIBED", true],
    ["pending", false],
    ["NOT_SUBSCRIBED", false],
    ["unsubscribed", false],
    ["redacted", false],
    ["invalid", false],
    [null, false],
    [undefined, false],
  ])("%s means consent: %s", (state, subscribed) => {
    expect(consentFromShopify(state, "2026-10-02T10:00:00Z")).toEqual({ subscribed, updatedAt: T2 });
  });

  it("ignores a missing or unreadable consent time", () => {
    expect(consentFromShopify("subscribed", null).updatedAt).toBeNull();
    expect(consentFromShopify("subscribed", "not a date").updatedAt).toBeNull();
  });
});

describe("consent updates: the latest decision wins", () => {
  const subscribedAt = (updatedAt: Date | null) => ({ subscribed: true, updatedAt });
  const notSubscribedAt = (updatedAt: Date | null) => ({ subscribed: false, updatedAt });

  it("subscribes a new customer only when Shopify says SUBSCRIBED", () => {
    expect(marketingConsentUpdate(subscribedAt(T1), null)).toEqual({ acceptsMarketing: true, marketingConsentUpdatedAt: T1 });
    expect(marketingConsentUpdate(notSubscribedAt(T1), null)).toEqual({ acceptsMarketing: false, marketingConsentUpdatedAt: T1 });
  });

  it("keeps an unsubscribe made here against an older Shopify subscription", () => {
    const unsubscribedHere = { acceptsMarketing: false, marketingConsentUpdatedAt: T2 };
    expect(marketingConsentUpdate(subscribedAt(T1), unsubscribedHere)).toEqual({});
    expect(marketingConsentUpdate(subscribedAt(null), unsubscribedHere)).toEqual({});
  });

  it("re-subscribes when the shopper subscribed again in Shopify later", () => {
    const unsubscribedHere = { acceptsMarketing: false, marketingConsentUpdatedAt: T2 };
    expect(marketingConsentUpdate(subscribedAt(T3), unsubscribedHere)).toEqual({ acceptsMarketing: true, marketingConsentUpdatedAt: T3 });
  });

  it("always applies a withdrawal, keeping the latest decision time", () => {
    const subscribed = { acceptsMarketing: true, marketingConsentUpdatedAt: T2 };
    expect(marketingConsentUpdate(notSubscribedAt(T1), subscribed)).toEqual({ acceptsMarketing: false, marketingConsentUpdatedAt: T2 });
    expect(marketingConsentUpdate(notSubscribedAt(T3), subscribed)).toEqual({ acceptsMarketing: false, marketingConsentUpdatedAt: T3 });
  });
});

describe("unsubscribe links", () => {
  const originalSecret = process.env.ENCRYPTION_SECRET;
  const originalUrl = process.env.SHOPIFY_APP_URL;

  afterEach(() => {
    process.env.ENCRYPTION_SECRET = originalSecret;
    process.env.SHOPIFY_APP_URL = originalUrl;
  });

  it("round-trips the shop and customer", () => {
    const token = unsubscribeToken("a.myshopify.com", "customer-1");
    expect(verifyUnsubscribeToken(token)).toEqual({ shop: "a.myshopify.com", customerId: "customer-1" });
  });

  it("rejects tampered, foreign and malformed tokens", () => {
    const token = unsubscribeToken("a.myshopify.com", "customer-1");
    const [payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ v: 1, s: "a.myshopify.com", c: "customer-2" })).toString("base64url");

    expect(verifyUnsubscribeToken(`${forgedPayload}.${signature}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.${signature}.extra`)).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();

    process.env.ENCRYPTION_SECRET = "another-deployment";
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("links to the app's unsubscribe page", () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.test";
    const url = new URL(unsubscribeUrl("a.myshopify.com", "customer-1"));
    expect(url.origin + url.pathname).toBe("https://app.example.test/email/unsubscribe");
    expect(verifyUnsubscribeToken(url.searchParams.get("token"))).toEqual({ shop: "a.myshopify.com", customerId: "customer-1" });
  });
});
