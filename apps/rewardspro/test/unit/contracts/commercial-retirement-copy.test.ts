import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The billing page is rendered for real below; only its server-side neighbours are stubbed.
const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useActionData: () => undefined,
  useSubmit: () => vi.fn(),
  useNavigation: () => ({ state: "idle" }),
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/utils/billing-test-mode.server", () => ({ isTestMode: vi.fn(), getTestMode: vi.fn() }));
vi.mock("~/utils/billing-success-detection.server", () => ({ detectNewSubscription: vi.fn() }));

import {
  ACTIVE_PAID_AGREEMENT_MESSAGE,
  FREE_SHOP_PAID_PLANS_MESSAGE,
  PAID_SUBSCRIPTIONS_RETIRED_MESSAGE,
  hasActivePaidAgreement,
  paidPlansNotOfferedMessage,
  paidSubscriptionsRetiredResult,
} from "~/constants/commercial-retirement";
import BillingPage from "~/routes/app.billing";

const SAYS_FREE = /RewardsPro is free/i;

function renderBillingPage(loaderData: Record<string, unknown>) {
  remix.loaderData = {
    hasActivePayment: false,
    appSubscriptions: [],
    oneTimePurchases: [],
    subscriptionInfo: null,
    justSubscribed: false,
    cancelled: false,
    newSubscriptionPlan: null,
    shop: "shop.myshopify.com",
    usageMetrics: null,
    ...loaderData,
  };
  const html = renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(BillingPage)));
  return html.replaceAll("&#x27;", "'");
}

describe("which shops have an active paid agreement", () => {
  it("counts no subscription, or only the Free plan, as no paid agreement", () => {
    expect(hasActivePaidAgreement([])).toBe(false);
    expect(hasActivePaidAgreement([null, undefined, "", "  "])).toBe(false);
    expect(hasActivePaidAgreement(["RewardsPro Free"])).toBe(false);
    expect(hasActivePaidAgreement(["Free Forever", null])).toBe(false);
  });

  it("counts any paid plan among the names as a paid agreement", () => {
    expect(hasActivePaidAgreement(["RewardsPro Pro"])).toBe(true);
    expect(hasActivePaidAgreement(["RewardsPro Max Annual"])).toBe(true);
    expect(hasActivePaidAgreement(["RewardsPro Free", "RewardsPro Ultra"])).toBe(true);
  });

  it("treats a plan name it doesn't recognise as paid, so a paying merchant is never told it's free", () => {
    expect(hasActivePaidAgreement(["Legacy Partner Plan"])).toBe(true);
  });
});

describe("paid-plans copy", () => {
  it("tells a shop with a paid agreement that its subscription continues, never that RewardsPro is free", () => {
    const message = paidPlansNotOfferedMessage({ hasActivePaidAgreement: true });
    expect(message).toBe(ACTIVE_PAID_AGREEMENT_MESSAGE);
    expect(message).not.toMatch(SAYS_FREE);
    expect(message).toMatch(/existing subscription keeps its recorded terms/);
    expect(message).toMatch(/cancellation, refunds, and support remain available/);
  });

  it("tells a shop with no paid agreement that RewardsPro is free", () => {
    const message = paidPlansNotOfferedMessage({ hasActivePaidAgreement: false });
    expect(message).toBe(FREE_SHOP_PAID_PLANS_MESSAGE);
    expect(message).toMatch(SAYS_FREE);
  });

  it("keeps the shared message, used where the agreement isn't known, true for every merchant", () => {
    expect(PAID_SUBSCRIPTIONS_RETIRED_MESSAGE).not.toMatch(SAYS_FREE);
    expect(paidSubscriptionsRetiredResult().error).toBe(PAID_SUBSCRIPTIONS_RETIRED_MESSAGE);
    for (const message of [PAID_SUBSCRIPTIONS_RETIRED_MESSAGE, ACTIVE_PAID_AGREEMENT_MESSAGE, FREE_SHOP_PAID_PLANS_MESSAGE]) {
      expect(message).not.toMatch(/retire/i);
    }
  });
});

describe("billing page banner", () => {
  beforeEach(() => {
    remix.loaderData = {};
  });

  it("doesn't tell a merchant on a paid plan that RewardsPro is free", () => {
    const html = renderBillingPage({
      hasActivePayment: true,
      appSubscriptions: [{ id: "gid://shopify/AppSubscription/1", name: "RewardsPro Pro", test: false }],
    });
    expect(html).toContain(ACTIVE_PAID_AGREEMENT_MESSAGE);
    expect(html).not.toMatch(SAYS_FREE);
  });

  it("uses the live subscription name when billing.check() found no paid plan", () => {
    const html = renderBillingPage({ subscriptionInfo: { name: "RewardsPro Ultra Annual", status: "ACTIVE" } });
    expect(html).toContain(ACTIVE_PAID_AGREEMENT_MESSAGE);
    expect(html).not.toMatch(SAYS_FREE);
  });

  it("tells a shop with no paid agreement that RewardsPro is free", () => {
    expect(renderBillingPage({})).toContain(FREE_SHOP_PAID_PLANS_MESSAGE);
    expect(renderBillingPage({ subscriptionInfo: { name: "RewardsPro Free", status: "ACTIVE" } })).toContain(FREE_SHOP_PAID_PLANS_MESSAGE);
  });
});

describe("settings Billing tab banner", () => {
  it("branches on the same plan sources the tab shows as the current plan", () => {
    const source = readFileSync(resolve(process.cwd(), "app/routes/app.settings._index.tsx"), "utf8");
    expect(source).toContain(
      "hasActivePaidAgreement([subscriptionInfo?.name, currentPlan?.planName, activeSubscription?.name])",
    );
    expect(source).toContain("paidPlansNotOfferedMessage({ hasActivePaidAgreement: paidAgreement })");
    expect(source).not.toContain("{PAID_SUBSCRIPTIONS_RETIRED_MESSAGE}");
  });
});
