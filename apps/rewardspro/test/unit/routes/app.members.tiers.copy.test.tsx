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
 * measured, and an annual period that says what the tier resolver counts
 * (services/tier-calculation.server.ts: orders from the last 12 months,
 * counted back from today).
 */

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

    expect([...period.options].map((option) => option.textContent)).toEqual(["Last 12 months (rolling)", "Lifetime (all spend)"]);
    expect(dialog).toHaveTextContent(
      "Last 12 months counts what a customer spent in the 12 months up to today, so an order stops counting a year after it was placed. Lifetime counts everything they've spent.",
    );
    expect(dialog).not.toHaveTextContent(/resets yearly|annually reset/i);
  });

  it("is named the same way on the Members page's tier form", () => {
    const source = readFileSync(resolve(process.cwd(), "app/routes/app.members._index.tsx"), "utf8");

    expect(source).toContain('{ label: "Last 12 months (rolling)", value: "ANNUAL" }');
    expect(source).not.toMatch(/resets yearly|annually reset/i);
  });

  it("labels an annual tier by the period it counts", () => {
    remix.loaderData = tiersPageData([{ id: "tier-gold", name: "Gold", cashbackPercent: 5, minSpend: 100, evaluationPeriod: "ANNUAL" }]);
    const copy = text(renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(TiersPage))));

    expect(copy).toContain("Last 12 months");
    expect(copy).not.toMatch(/\bAnnual\b/);
  });
});
