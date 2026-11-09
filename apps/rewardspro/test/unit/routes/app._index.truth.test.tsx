// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dashboard says what is actually happening: a shop that hasn't finished
 * setup is told to finish it, not that its systems are failing; the health
 * row follows the cashback toggle; the review request waits until the app has
 * done its job; and the order guide says it isn't a cap.
 */

const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown>, submit: vi.fn() }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useNavigate: () => vi.fn(),
  useFetcher: () => ({ submit: remix.submit, state: "idle", data: undefined }),
  useRouteError: () => undefined,
  isRouteErrorResponse: () => false,
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/utils/database-health.server", () => ({ measureQuery: vi.fn(), getDatabaseHealth: vi.fn() }));
vi.mock("~/services/customer-data-request.server", () => ({ countPendingDataRequests: vi.fn() }));
vi.mock("~/services/store-credit-spend.server", () => ({ getStoreCreditSpendProblems: vi.fn() }));
vi.mock("~/hooks/useAnalytics", () => ({ useAnalytics: () => ({ trackCustomEvent: vi.fn() }) }));
vi.mock("~/hooks/useToast", () => ({
  useToast: () => ({ toast: { active: false }, showSuccess: vi.fn(), showError: vi.fn(), hideToast: vi.fn() }),
}));

import * as dashboardRoute from "~/routes/app._index";

const Dashboard = dashboardRoute.default;

interface Shape {
  hasTier?: boolean;
  cashbackOn?: boolean;
  widgetOn?: boolean;
  webhooks?: "healthy" | "critical";
}

/** Loader data for a shop whose systems all work, set up as far as `shape` says */
function dashboardData({ hasTier = true, cashbackOn = true, widgetOn = true, webhooks = "healthy" }: Shape = {}, extra: Record<string, unknown> = {}) {
  return {
    shop: "shop.myshopify.com",
    showReviewBanner: false,
    hasSubscriptionRecords: false,
    pendingDataRequests: 0,
    storeCreditSpendProblems: [],
    autoCashbackBacklog: { count: 0, total: 0 },
    shopSettings: { storeCurrency: "GBP", autoCashbackProcessingEnabled: cashbackOn, advancedAnalyticsEnabled: true, tierProductsEnabled: true },
    widgetStatus: {
      isActive: widgetOn,
      setupDismissed: false,
      status: widgetOn ? "active" : "not_configured",
      blockType: widgetOn ? "app_embed" : "none",
      themeName: null,
      lastChecked: null,
    },
    shopifyMetrics: { source: "unavailable" },
    webhookStats: { processedLast24h: 0, errorsLast24h: 0, errorsLastHour: 0, successRate: 100, status: webhooks },
    databaseHealth: { responseTime: 1, status: "connected", uptime: 100, lastCheck: "2026-11-04T00:00:00.000Z" },
    loyaltyEngine: {
      tierCount: hasTier ? 1 : 0,
      status: !hasTier ? "needs_setup" : cashbackOn ? "operational" : "degraded",
      automationEnabled: false,
      currency: "GBP",
      cashbackEnabled: cashbackOn,
    },
    dataSyncHealth: {
      status: "operational",
      customerSync: { status: "completed", lastSyncAt: null, recordsProcessed: 0 },
      orderSync: { status: "idle", lastSyncAt: null, recordsProcessed: 0 },
      webhookHealth: webhooks,
    },
    firstRun: {
      hasTier,
      autoCashbackOn: cashbackOn,
      widgetOn,
      dismissed: false,
      themeEditorUrl: "https://shop.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=key/membership_widget",
    },
    currentPlan: null,
    activeSubscription: null,
    monthlyOrderUsage: { orderCount: 0, planLimit: 1000, planName: "RewardsPro Free", projectedOrders: 0 },
    currentMonth: "November",
    daysRemaining: 27,
    ...extra,
  };
}

function dashboardText(data: Record<string, unknown>) {
  remix.loaderData = data;
  const view = renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(Dashboard)));
  return view.replaceAll("&#x27;", "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

beforeEach(() => {
  remix.loaderData = {};
  remix.submit.mockReset();
});

describe("dashboard health row", () => {
  it("tells a fresh install to finish setup, not that its systems are failing", () => {
    const text = dashboardText(dashboardData({ hasTier: false, cashbackOn: false, widgetOn: false }));

    expect(text).toContain("Finish setup");
    expect(text).toContain("Still to do: create a tier, turn on automatic cashback, turn on the rewards widget.");
    expect(text).not.toMatch(/\d\/\d Systems Healthy/);
  });

  it("names only the steps left", () => {
    const text = dashboardText(dashboardData({ widgetOn: false }));

    expect(text).toContain("Finish setup");
    expect(text).toContain("Still to do: turn on the rewards widget.");
  });

  it("says all is well once setup is done and every system works", () => {
    const text = dashboardText(dashboardData());

    expect(text).toContain("All Systems Operational");
    expect(text).not.toContain("Finish setup");
    expect(text).not.toContain("Still to do");
  });

  it("counts the widget done only once the rewards widget is on, as the setup card does", () => {
    // widgetStatus is active for any of the app's blocks, such as the missions embed
    const missionsEmbedOnly = { isActive: true, setupDismissed: false, status: "active", blockType: "app_embed", themeName: null, lastChecked: null };
    const text = dashboardText(dashboardData({ widgetOn: false }, { widgetStatus: missionsEmbedOnly }));

    expect(text).toContain("Finish setup");
    expect(text).toContain("Still to do: turn on the rewards widget.");
    expect(text).not.toContain("All Systems Operational");
  });

  it("still reports a failing system, counting only the systems", () => {
    const text = dashboardText(dashboardData({ webhooks: "critical" }));

    expect(text).toContain("2/3 Systems Healthy");
    expect(text).not.toContain("Finish setup");
  });

  it("follows the automatic cashback toggle at once, without waiting for a reload", async () => {
    remix.loaderData = dashboardData({ cashbackOn: false });
    render(createElement(AppProvider, { i18n: en }, createElement(Dashboard)));
    expect(screen.getByText("Finish setup")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Turn on" }));

    expect(screen.getByText("All Systems Operational")).toBeInTheDocument();
    expect(screen.queryByText("Finish setup")).not.toBeInTheDocument();
  });

  it("follows the toggle at once when cashback is waiting, once the merchant confirms", async () => {
    // jsdom has no scrolling, which Polaris' modal asks for
    vi.spyOn(window, "scroll").mockImplementation(() => {});
    remix.loaderData = dashboardData({ cashbackOn: false }, { autoCashbackBacklog: { count: 3, total: 7.5 } });
    render(createElement(AppProvider, { i18n: en }, createElement(Dashboard)));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(screen.getByText("Finish setup")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Turn on and pay them" }));

    expect(screen.getByText("All Systems Operational")).toBeInTheDocument();
    expect(screen.queryByText("Finish setup")).not.toBeInTheDocument();
  });

  it("reloads the dashboard after a feature toggle, so everything else it shows is fresh too", () => {
    const formData = new FormData();
    formData.set("action", "toggle-feature");
    const revalidates = dashboardRoute.shouldRevalidate?.({ formData, defaultShouldRevalidate: true }) ?? true;

    expect(revalidates).toBe(true);
  });
});

describe("dashboard review request", () => {
  it("doesn't ask a shop the app hasn't done its job for yet", () => {
    expect(dashboardText(dashboardData({}, { showReviewBanner: false }))).not.toContain("Enjoying RewardsPro?");
  });

  it("asks once the loader says the app has done its job, and Maybe later still saves the dismissal", async () => {
    remix.loaderData = dashboardData({}, { showReviewBanner: true });
    render(createElement(AppProvider, { i18n: en }, createElement(Dashboard)));
    expect(screen.getByText("Enjoying RewardsPro?")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Maybe later" }));

    expect(remix.submit).toHaveBeenCalledWith({}, { method: "POST", action: "/api/dismiss-review-banner" });
    expect(screen.queryByText("Enjoying RewardsPro?")).not.toBeInTheDocument();
  });
});

describe("dashboard plan card", () => {
  it("doesn't link to subscription records a free shop doesn't have", () => {
    expect(dashboardText(dashboardData({}, { hasSubscriptionRecords: false }))).not.toContain("Subscription records");
  });

  it("links to subscription records when the shop has some", () => {
    expect(dashboardText(dashboardData({}, { hasSubscriptionRecords: true }))).toContain("Subscription records");
  });

  it("says the monthly order number is a guide, not a cap", () => {
    const text = dashboardText(dashboardData());

    expect(text).toContain("1,000");
    expect(text).toContain("Monthly order guide");
    expect(text).toContain("This is a guide, not a cap: orders past it still earn cashback.");
    expect(text).not.toContain("Plan limit");
  });

  it("says Unlimited, not the 999,999 stand-in, on an unlimited plan", () => {
    const usage = { orderCount: 0, planLimit: 999_999, planName: "Enterprise", projectedOrders: 0 };
    const text = dashboardText(dashboardData({}, { monthlyOrderUsage: usage }));

    expect(text).toContain("Unlimited");
    expect(text).not.toContain("999");
    expect(text).not.toContain("a guide, not a cap");
  });
});
