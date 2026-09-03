import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PrismSubscriptionAccount, {
  SubscriptionStatusUnknown,
  parsePrismSubscriptionStatus,
  requestPrismStripeRedirect,
} from "./PrismSubscriptionAccount";

const STATUS = {
  schema: "cambridgetcg.prism-subscription-status/1",
  sandbox: true,
  plan: "all",
  access: {
    allowed: true,
    reason: "active",
    active_until: "2026-10-03T07:00:00.000Z",
  },
  subscription: {
    status: "active",
    cancel_at_period_end: false,
    current_period_end: "2026-10-03T07:00:00.000Z",
  },
  checkout: { available: false, reason: "already_subscribed" },
  portal: { available: true },
};

describe("PRISM subscription account boundaries", () => {
  it("strictly parses and freezes the owner status without provider ids", () => {
    const parsed = parsePrismSubscriptionStatus(STATUS);
    expect(parsed).toEqual(STATUS);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.access)).toBe(true);
    expect(Object.isFrozen(parsed.subscription)).toBe(true);
    expect(JSON.stringify(parsed)).not.toMatch(/customer_|subscription_|price_|invoice_/);
  });

  it.each([
    { ...STATUS, sandbox: false },
    { ...STATUS, provider_id: "cus_hidden" },
    { ...STATUS, access: { ...STATUS.access, active_until: "soon" } },
    { ...STATUS, checkout: { available: "yes", reason: "ready" } },
    { ...STATUS, portal: { available: true, url: "https://evil.example" } },
  ])("fails closed for malformed or expanded owner status", (value) => {
    expect(() => parsePrismSubscriptionStatus(value)).toThrow(
      /Unexpected .* response/,
    );
  });

  it("server-renders an unknown state with no active mutation control", () => {
    const markup = renderToStaticMarkup(<PrismSubscriptionAccount />);
    expect(markup).toContain("Checking owner status");
    expect(markup).toContain("No Free, All, payment, or access conclusion");
    expect(markup).not.toContain("Start £5/month sandbox checkout");
    expect(markup).not.toContain("Manage test subscription");
  });

  it("makes read failure explicit and keeps controls locked", () => {
    const markup = renderToStaticMarkup(
      <SubscriptionStatusUnknown kind="error" onRetry={vi.fn()} />,
    );
    expect(markup).toContain("Subscription status not verified");
    expect(markup).toContain("Checkout and portal controls remain locked");
    expect(markup).toContain("Retry owner status");
  });

  it.each([
    ["checkout", "/api/prism-signals/stripe/checkout", "https://checkout.stripe.com/c/pay/cs_test_123"],
    ["portal", "/api/prism-signals/stripe/portal", "https://billing.stripe.com/p/session/test_123"],
  ] as const)("accepts only the expected %s Stripe redirect", async (kind, endpoint, url) => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        schema: "cambridgetcg.prism-stripe-redirect/1",
        kind,
        url,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestPrismStripeRedirect(kind)).resolves.toBe(url);
    expect(fetchMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: "{}",
      }),
    );
    vi.unstubAllGlobals();
  });

  it("rejects a mismatched or untrusted redirect without navigating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          schema: "cambridgetcg.prism-stripe-redirect/1",
          kind: "checkout",
          url: "https://evil.example/collect",
        }),
      ),
    );
    await expect(requestPrismStripeRedirect("checkout")).rejects.toThrow(
      "Unexpected Stripe redirect response.",
    );
    vi.unstubAllGlobals();
  });
});
