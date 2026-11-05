// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// The page's loader and action are replaced by the stub's hydration data;
// nothing here reaches Shopify or the database.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const { default: Home } = await import("~/routes/app._index");

type HomeData = Record<string, unknown>;

/** Home's loader data for a GBP shop, with `overrides`. */
function homeData(overrides: { running?: boolean; hasTiers?: boolean; importState?: string; placedBuyers?: number } = {}): HomeData {
  const hasTiers = overrides.hasTiers ?? true;
  return {
    shop: "home-dom.myshopify.com",
    currency: "GBP",
    running: overrides.running ?? true,
    stats: {
      cashbackGiven: "24.50",
      creditSpent: "11.00",
      cameBack: 9,
      daily: [
        { date: "2026-11-01", given: "2.50", spent: "0" },
        { date: "2026-11-02", given: "4.20", spent: "11.00" },
      ],
      recent: [
        { orderId: "o1", orderName: "#1012", buyer: "Sam K.", tierName: "Everyone", amount: "2.50", currency: "GBP", status: "Issued" },
        { orderId: "o2", orderName: "#1011", buyer: "Priya R.", tierName: "Everyone", amount: "4.20", currency: "GBP", status: "Waiting" },
        { orderId: "o3", orderName: "#1009", buyer: "Customer ····7001", tierName: "Everyone", amount: "-1.00", currency: "GBP", status: "Taken back" },
      ],
      tiers: hasTiers ? [{ id: "t1", name: "Everyone", percent: "5", members: 14 }] : [],
      needsLook: 0,
      cashbackOrders: 3,
    },
    bannerFacts: { privacyDueAt: null, spendProblems: [], needsLook: 0, timezone: "Europe/London", themeEditorUrl: "https://home-dom.myshopify.com/admin/themes/current/editor" },
    setup: { importState: overrides.importState ?? "done", importError: null, importHorizonDays: 365, placedBuyers: overrides.placedBuyers ?? 14 },
    reviewDue: false,
    storeCreditReady: true,
    themeEditorUrl: "https://home-dom.myshopify.com/admin/themes/current/editor",
  };
}

/** App Bridge's `shopify` global, with the widget embed in the given state. */
function stubAppBridge(embed: "active" | "available") {
  const extensions = vi.fn(async () => [
    {
      handle: "rewardspro-theme-extension",
      type: "theme_app_extension",
      activations: [{ handle: "membership_widget", name: "Rewards widget", target: "body", status: embed, activations: [] }],
    },
  ]);
  vi.stubGlobal("shopify", { app: { extensions }, reviews: { request: vi.fn() } });
  return extensions;
}

async function renderHome(data: HomeData) {
  const Stub = createRoutesStub([{ id: "routes/app._index", path: "/app", Component: Home }]);
  render(<Stub initialEntries={["/app"]} hydrationData={{ loaderData: { "routes/app._index": data } }} />);
  await screen.findByText("This month");
  // Let the widget check settle
  await act(async () => {});
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("shows the setup card while a step is left, and hides it once every step is done", async () => {
    const extensions = stubAppBridge("active");
    await renderHome(homeData({ running: false }));
    expect(extensions).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-setup-card]")).not.toBeNull();
    expect(screen.getByText("Switch cashback on")).toBeTruthy();
    cleanup();

    stubAppBridge("available");
    await renderHome(homeData({ running: true }));
    expect(document.querySelector("[data-setup-card]")).not.toBeNull();
    expect(screen.getByText("Turn on the widget in your theme")).toBeTruthy();
    cleanup();

    stubAppBridge("active");
    await renderHome(homeData({ running: true }));
    expect(document.querySelector("[data-setup-card]")).toBeNull();
  });

  it("keeps the setup card while the import runs, then says how many buyers it placed", async () => {
    stubAppBridge("active");
    await renderHome(homeData({ importState: "running" }));
    expect(document.querySelector("[data-setup-card]")?.textContent).toContain(
      "Bringing in your last 12 months of orders so buyers start in the right tier",
    );
    cleanup();

    await renderHome(homeData({ hasTiers: false, importState: "done", placedBuyers: 14 }));
    expect(document.querySelector("[data-setup-card]")?.textContent).toContain("Done: 14 buyers placed in tiers");
  });

  it("says what the switch does, matching it", async () => {
    stubAppBridge("active");
    await renderHome(homeData({ running: true }));
    expect(screen.getByText("On: every paid order earns cashback as store credit.")).toBeTruthy();
    expect(screen.queryByText("Off: orders still count toward tiers but earn no cashback.")).toBeNull();
    expect(document.querySelector("s-switch")?.hasAttribute("checked")).toBe(true);
    cleanup();

    await renderHome(homeData({ running: false }));
    expect(screen.getByText("Off: orders still count toward tiers but earn no cashback.")).toBeTruthy();
    expect(screen.queryByText("On: every paid order earns cashback as store credit.")).toBeNull();
    expect(document.querySelector("s-switch")?.hasAttribute("checked")).toBe(false);
  });

  it("shows the numbers in the shop's currency, the recent rewards and the tiers", async () => {
    stubAppBridge("active");
    await renderHome(homeData());
    const text = document.body.textContent ?? "";
    expect(text).toContain("£24.50");
    expect(text).toContain("£11.00");
    expect(text).toContain("Sam K.");
    expect(text).toContain("-£1.00");
    expect(text).toContain("14 members");
    // The widget is on, so no banner
    expect(document.querySelector('[slot="supplemental-start"]')).toBeNull();
  });

  it("warns when the widget embed is off", async () => {
    stubAppBridge("available");
    await renderHome(homeData());
    expect(document.querySelector('[slot="supplemental-start"]')?.textContent).toContain("The rewards widget is off in your theme.");
  });
});
