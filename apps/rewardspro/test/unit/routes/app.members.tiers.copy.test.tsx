// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * What the Tiers page tells merchants about tiers: no figures nobody
 * measured, and evaluation periods that say what the tier resolver counts.
 * services/tier-calculation.server.ts sums the Order rows RewardsPro holds,
 * less refunds: orders/paid writes them from install on, and Sync Orders
 * brings in the last 12 months (install syncs customers, never orders). The
 * annual period counts those placed in the 12 months up to today.
 */

const PERIOD_HELP =
  "Both count the orders RewardsPro has recorded for a customer, less refunds: orders paid since you installed the app, plus orders from the past 12 months that you bring in with Sync Orders. Last 12 months counts orders placed in the 12 months up to today, so an order stops counting a year after it was placed. Lifetime counts every recorded order.";

const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useActionData: () => undefined,
  useSubmit: () => vi.fn(),
  useNavigation: () => ({ state: "idle" }),
  useFetcher: () => ({ state: "idle", data: undefined, submit: vi.fn() }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ to, children }: { to: string; children: ReactNode }) => createElement("a", { href: to }, children),
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));

import { TierEmptyStateV1B } from "~/components/TierEmptyStateVariations";
import TiersPage from "~/routes/app.members.tiers";

const text = (html: string) => html.replaceAll("&#x27;", "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function emptyStateHtml() {
  return renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(TierEmptyStateV1B, { onCreateTier: () => {} })));
}

const shopSettings = { storeCurrency: "GBP", currencyDisplayType: "SYMBOL" };

function tiersPageData(tiers: unknown[]) {
  return {
    tiers,
    shopSettings,
    tierDistribution: {},
    tierProductCoverage: {},
    hasAnnualEval: true,
    hasPurchasableTiers: true,
    limitAccess: { canCreate: true, current: tiers.length, max: 999999 },
  };
}

describe("tiers empty state", () => {
  it("makes no claims about results nobody measured", () => {
    const copy = text(emptyStateHtml());

    expect(copy).not.toMatch(/\d+%\+|lifetime value|boost|increase|drive revenue|coming back/i);
  });

  it("says what tiers do", () => {
    const copy = text(emptyStateHtml());

    expect(copy).toContain("Cashback as store credit");
    expect(copy).toContain("Each tier sets the share of an order customers get back as Shopify store credit.");
    expect(copy).toContain("Customers move into a tier once their spend reaches its minimum.");
  });

  it("keeps each benefit's text next to its icon", () => {
    // Polaris passes an InlineStack's align to nested stacks through an
    // inherited CSS variable, so each row sets its own or takes the outer
    // row's space-between and pushes its text away from its icon
    const view = emptyStateHtml();
    const rows = view.match(/<div class="Polaris-InlineStack" style="[^"]*"><div class="Polaris-Box" style="[^"]*--pc-box-border-radius:var\(--p-border-radius-full\)/g) ?? [];

    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toContain("--pc-inline-stack-align:start");
  });
});

describe("tier form evaluation period", () => {
  it("names the annual period as the last 12 months, counted back from today", async () => {
    remix.loaderData = tiersPageData([]);
    render(createElement(AppProvider, { i18n: en }, createElement(TiersPage)));

    await userEvent.setup().click(screen.getAllByRole("button", { name: "Create Tier" })[0]);
    const dialog = await screen.findByRole("dialog");
    const period = within(dialog).getByLabelText("Evaluation Period") as HTMLSelectElement;

    expect([...period.options].map((option) => option.textContent)).toEqual(["Last 12 months (rolling)", "Lifetime (all recorded orders)"]);
    expect(dialog).toHaveTextContent(PERIOD_HELP);
    expect(dialog).not.toHaveTextContent(/resets yearly|annually reset/i);
  });

  it("names lifetime by what it counts where it is the only period", async () => {
    remix.loaderData = { ...tiersPageData([]), hasAnnualEval: false };
    render(createElement(AppProvider, { i18n: en }, createElement(TiersPage)));

    await userEvent.setup().click(screen.getAllByRole("button", { name: "Create Tier" })[0]);
    const period = within(await screen.findByRole("dialog")).getByLabelText("Evaluation Period") as HTMLSelectElement;

    expect([...period.options].map((option) => option.textContent)).toEqual(["Lifetime (all recorded orders)"]);
  });

  it("doesn't promise that spend from before the app was installed counts", async () => {
    remix.loaderData = tiersPageData([]);
    render(createElement(AppProvider, { i18n: en }, createElement(TiersPage)));

    await userEvent.setup().click(screen.getAllByRole("button", { name: "Create Tier" })[0]);
    const dialog = await screen.findByRole("dialog");

    expect(dialog).not.toHaveTextContent(/all spend|everything they've spent|what a customer spent/i);
  });

  it("is named the same way on the Members page's tier form", () => {
    const source = readFileSync(resolve(process.cwd(), "app/routes/app.members._index.tsx"), "utf8");

    expect(source).toContain('{ label: "Last 12 months (rolling)", value: "ANNUAL" }');
    expect(source).toContain('{ label: "Lifetime (all recorded orders)", value: "LIFETIME" }');
    expect(source).toContain(`"${PERIOD_HELP}"`);
    expect(source).not.toMatch(/resets yearly|annually reset|all spend|everything they've spent/i);
  });

  it("labels an annual tier by the period it counts", () => {
    remix.loaderData = tiersPageData([{ id: "tier-gold", name: "Gold", cashbackPercent: 5, minSpend: 100, evaluationPeriod: "ANNUAL" }]);
    const copy = text(renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(TiersPage))));

    expect(copy).toContain("Last 12 months");
    expect(copy).not.toMatch(/\bAnnual\b/);
  });
});
