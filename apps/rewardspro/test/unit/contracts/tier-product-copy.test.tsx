import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What merchants read about membership (tier) products. Each one is a
 * one-time purchase of a month, a year or a lifetime, and nothing renews it:
 * the app has no Shopify subscription contracts, and an order placed through
 * a selling plan grants no membership (webhooks.orders.paid.tsx). So no page
 * may offer recurring memberships, subscriptions or tier trials.
 *
 * The pages are rendered for real; only their server-side neighbours are stubbed.
 */

const remix = vi.hoisted(() => ({
  loaderData: {} as Record<string, unknown>,
  fetcherData: undefined as unknown,
  searchParams: new URLSearchParams(),
}));

vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useActionData: () => undefined,
  useSubmit: () => vi.fn(),
  useNavigation: () => ({ state: "idle" }),
  useRevalidator: () => ({ revalidate: vi.fn(), state: "idle" }),
  useFetcher: () => ({ state: "idle", data: remix.fetcherData, submit: vi.fn() }),
  useSearchParams: () => [remix.searchParams, vi.fn()],
  Link: ({ to, children }: { to: string; children: ReactNode }) => createElement("a", { href: to }, children),
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {}, db: {} }));

import TiersPage from "~/routes/app.members.tiers";
import TierProductsPage from "~/routes/app.members.products";

const RECURRING = /recurring|subscription|renews (monthly|annually|every)/i;

function page(Component: ComponentType, loaderData: Record<string, unknown>) {
  remix.loaderData = loaderData;
  return createElement(AppProvider, { i18n: en }, createElement(Component));
}

const text = (html: string) =>
  html.replaceAll("&#x27;", "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const pageText = (Component: ComponentType, loaderData: Record<string, unknown>) =>
  text(renderToStaticMarkup(page(Component, loaderData)));

const shopSettings = { storeCurrency: "GBP", currencyDisplayType: "SYMBOL" };
const tiers = [
  { id: "tier-silver", name: "Silver", cashbackPercent: 2, minSpend: 0, evaluationPeriod: "LIFETIME" },
  { id: "tier-gold", name: "Gold", cashbackPercent: 5, minSpend: 100, evaluationPeriod: "LIFETIME" },
];

function tierProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-gold-monthly",
    tierId: "tier-gold",
    tierName: "Gold",
    shopifyProductId: "gid://shopify/Product/1",
    shopifyVariantId: "gid://shopify/ProductVariant/1",
    productHandle: "gold-tier-membership-monthly",
    sku: "SHOP-GOLD-MON",
    price: 5,
    duration: "MONTHLY",
    features: [],
    publishedAt: "2026-11-01T00:00:00.000Z",
    isActive: true,
    hasSubscription: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function productsPageData(tierProducts: unknown[]) {
  return {
    tiers,
    tierProducts,
    deletedTierProducts: [],
    shopSettings,
    shop: "shop.myshopify.com",
    tierDistribution: {},
    canCreateProducts: true,
    currentPlan: "RewardsPro Free",
    hasAnnualEval: false,
    hasPurchasableTiers: true,
    analytics: { totalProducts: tierProducts.length, totalActiveMemberships: 0, monthlyRevenue: 0, expiringThisWeek: 0 },
  };
}

beforeEach(() => {
  remix.fetcherData = undefined;
});

describe("tiers page", () => {
  it("says membership products are one-time purchases that don't renew", () => {
    const html = pageText(TiersPage, {
      tiers,
      shopSettings,
      tierDistribution: {},
      tierProductCoverage: {},
      hasAnnualEval: false,
      hasPurchasableTiers: true,
      limitAccess: { canCreate: true, current: tiers.length, max: 999999 },
    });

    expect(html).toContain("Sell tier memberships as products");
    expect(html).toContain(
      "Each is a one-time purchase that gives membership for one month, one year or a lifetime, and it doesn't renew automatically.",
    );
    expect(html).not.toMatch(RECURRING);
  });
});

describe("membership products page", () => {
  it("shows no subscription status while no product has a selling plan", () => {
    const html = pageText(TierProductsPage, productsPageData([tierProduct()]));

    expect(html).toContain("Status Indicators:");
    expect(html).not.toMatch(RECURRING);
    expect(html).not.toMatch(/selling plan/i);
  });

  it("calls a selling plan another app attached what it is, not a subscription", () => {
    const html = pageText(TierProductsPage, productsPageData([tierProduct({ hasSubscription: true })]));

    expect(html).toContain("Selling plan attached");
    expect(html).not.toMatch(RECURRING);
  });

  it("offers each duration as a one-time purchase", async () => {
    const user = userEvent.setup();
    render(page(TierProductsPage, productsPageData([])));

    await user.click(screen.getAllByRole("button", { name: "Create" })[0]);
    const dialog = await screen.findByRole("dialog");
    const duration = within(dialog).getByLabelText("Duration") as HTMLSelectElement;

    expect([...duration.options].map((option) => option.textContent)).toEqual(["Monthly", "Annual", "Lifetime"]);
    expect(dialog).toHaveTextContent(
      "How long the membership lasts: one month, one year or a lifetime. Customers pay once, and it doesn't renew automatically.",
    );
    expect(dialog).not.toHaveTextContent(RECURRING);
  });

  it("asks only about purchases before deleting a product", async () => {
    const user = userEvent.setup();
    const { rerender } = render(page(TierProductsPage, productsPageData([tierProduct()])));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Checking for active purchases...");
    expect(dialog).not.toHaveTextContent(RECURRING);

    remix.fetcherData = {
      success: true,
      action: "validate-delete-product",
      canDelete: false,
      blockers: [{ type: "active_purchases", count: 2, message: "2 active purchases exist" }],
      warnings: [],
      product: { id: "product-gold-monthly", name: "Gold" },
    };
    rerender(page(TierProductsPage, productsPageData([tierProduct()])));

    const blocked = await screen.findByRole("dialog");
    expect(blocked).toHaveTextContent("This product has active purchases that must end first.");
    expect(blocked).toHaveTextContent("You can delete it once none of its purchases are active.");
    expect(blocked).not.toHaveTextContent(RECURRING);
  });
});

describe("settings tier section", () => {
  const settingsSource = readFileSync(resolve(process.cwd(), "app/routes/app.settings._index.tsx"), "utf8");

  it("leaves subscriptions out of the tier priority", () => {
    expect(settingsSource).toContain("Manual Override → Purchase → Spending-Based → Default Base Tier");
    expect(settingsSource).not.toContain("→ Subscription →");
  });

  it("offers no tier trial controls, since there are no tier trials", () => {
    for (const shown of [
      ">Trial Abuse Prevention<",
      "tier subscription trials",
      'label="Allow multiple tier trials"',
      'label="Maximum lifetime trial days"',
      'label="Minimum days between trials"',
    ]) {
      expect(settingsSource).not.toContain(shown);
    }
  });
});
