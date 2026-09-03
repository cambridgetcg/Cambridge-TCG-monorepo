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
    reconciliation: null,
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

  it("keeps an incomplete provider binding visible without inventing a period", () => {
    const parsed = parsePrismSubscriptionStatus({
      ...STATUS,
      plan: "free",
      access: { allowed: false, reason: "entitlement_inactive", active_until: null },
      subscription: { ...STATUS.subscription, status: "incomplete", current_period_end: null },
    });
    expect(parsed.subscription?.current_period_end).toBeNull();
    expect(parsed.plan).toBe("free");
  });

  it("accepts only the bounded cancel-subscription reconciliation posture", () => {
    const parsed = parsePrismSubscriptionStatus({
      ...STATUS,
      access: { allowed: false, reason: "refunded", active_until: null },
      subscription: {
        ...STATUS.subscription,
        reconciliation: {
          status: "required",
          action: "cancel_subscription",
          reason: "full_refund",
        },
      },
      checkout: {
        available: false,
        reason: "subscription_cancellation_required",
      },
    });
    expect(parsed.subscription?.reconciliation).toEqual({
      status: "required",
      action: "cancel_subscription",
      reason: "full_refund",
    });
    expect(Object.isFrozen(parsed.subscription?.reconciliation)).toBe(true);
  });

  it.each([
    { ...STATUS, sandbox: false },
    { ...STATUS, provider_id: "cus_hidden" },
    { ...STATUS, access: { ...STATUS.access, active_until: "soon" } },
    { ...STATUS, checkout: { available: "yes", reason: "ready" } },
    { ...STATUS, portal: { available: true, url: "https://evil.example" } },
    {
      ...STATUS,
      subscription: {
        ...STATUS.subscription,
        reconciliation: {
          status: "required",
          action: "refund_subscription",
          reason: "full_refund",
        },
      },
    },
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

  it("rejects a Stripe hostname on a non-default port", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          schema: "cambridgetcg.prism-stripe-redirect/1",
          kind: "checkout",
          url: "https://checkout.stripe.com:444/c/pay/cs_test_123",
        }),
      ),
    );
    await expect(requestPrismStripeRedirect("checkout")).rejects.toThrow(
      "Unexpected Stripe redirect response.",
    );
    vi.unstubAllGlobals();
  });

  it.each([
    [
      "sandbox_invitation_required",
      "All sandbox Checkout is currently limited to accounts with an active operator invitation.",
    ],
    [
      "beta_interest_required",
      "Record an active PRISM beta-interest request before using an invited sandbox place.",
    ],
  ])("explains the bounded %s eligibility refusal without navigating", async (code, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code, message: "server copy is not trusted" } },
          { status: 403 },
        ),
      ),
    );
    await expect(requestPrismStripeRedirect("checkout")).rejects.toThrow(message);
    vi.unstubAllGlobals();
  });
});
