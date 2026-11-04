// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The dashboard is rendered for real below; only its server-side neighbours are stubbed.
// Every fetcher shares one submit, so a test sees what the page posts.
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
vi.mock("~/hooks/useAnalytics", () => ({ useAnalytics: () => ({ trackCustomEvent: vi.fn() }) }));
vi.mock("~/hooks/useToast", () => ({
  useToast: () => ({ toast: { active: false }, showSuccess: vi.fn(), showError: vi.fn(), hideToast: vi.fn() }),
}));

import Dashboard from "~/routes/app._index";

const SETUP_TITLE = "Get RewardsPro ready";

function dashboardData(firstRun: Record<string, unknown>, autoCashbackProcessingEnabled = false) {
  return {
    shop: "shop.myshopify.com",
    reviewBannerDismissed: true,
    pendingDataRequests: 0,
    shopSettings: { storeCurrency: "GBP", autoCashbackProcessingEnabled },
    widgetStatus: { isActive: false, setupDismissed: false, status: "not_configured", blockType: "none", themeName: null, lastChecked: null },
    shopifyMetrics: { source: "unavailable" },
    webhookStats: { processedLast24h: 0, errorsLast24h: 0, errorsLastHour: 0, successRate: 100, status: "healthy" },
    databaseHealth: { responseTime: 1, status: "connected", uptime: 100, lastCheck: "2026-11-03T00:00:00.000Z" },
    loyaltyEngine: { tierCount: 0, status: "needs_setup", automationEnabled: false, currency: "GBP", cashbackEnabled: false },
    dataSyncHealth: {
      status: "operational",
      customerSync: { status: "completed", lastSyncAt: null, recordsProcessed: 0 },
      orderSync: { status: "idle", lastSyncAt: null, recordsProcessed: 0 },
      webhookHealth: "healthy",
    },
    firstRun: {
      hasTier: false,
      autoCashbackOn: autoCashbackProcessingEnabled,
      widgetOn: false,
      dismissed: false,
      themeEditorUrl: "https://shop.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=key/membership_widget",
      ...firstRun,
    },
    currentPlan: null,
    activeSubscription: null,
    monthlyOrderUsage: { orderCount: 0, planLimit: 1000, planName: "RewardsPro Free", projectedOrders: 0 },
    currentMonth: "November",
    daysRemaining: 27,
  };
}

function dashboardHtml(data: Record<string, unknown>) {
  remix.loaderData = data;
  const view = renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(Dashboard)));
  return view.replaceAll("&#x27;", "'");
}

describe("dashboard first-run setup card", () => {
  beforeEach(() => {
    remix.loaderData = {};
  });

  it("greets a new shop with the setup steps", () => {
    const html = dashboardHtml(dashboardData({}));
    expect(html).toContain(SETUP_TITLE);
    expect(html).toContain("Create your first tier");
  });

  it("hides once the merchant dismissed it", () => {
    expect(dashboardHtml(dashboardData({ dismissed: true }))).not.toContain(SETUP_TITLE);
  });

  it("hides once every step is done", () => {
    const html = dashboardHtml(dashboardData({ hasTier: true, widgetOn: true }, true));
    expect(html).not.toContain(SETUP_TITLE);
  });
});

describe("dashboard first-run setup card, clicked", () => {
  beforeEach(() => {
    remix.loaderData = dashboardData({});
  });

  function renderDashboard() {
    render(createElement(AppProvider, { i18n: en }, createElement(Dashboard)));
  }

  it("Dismiss hides the card and saves it, so it stays hidden after a reload", async () => {
    renderDashboard();

    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));

    expect(remix.submit).toHaveBeenCalledWith({}, { method: "POST", action: "/api/dismiss-customer-account-block" });
    expect(screen.queryByText(SETUP_TITLE)).not.toBeInTheDocument();
  });

  it("Turn on switches automatic cashback on and marks that step Done at once", async () => {
    renderDashboard();

    await userEvent.setup().click(screen.getByRole("button", { name: "Turn on" }));

    const form = remix.submit.mock.calls[0][0] as FormData;
    expect(form.get("feature")).toBe("autoCashbackProcessingEnabled");
    expect(form.get("enabled")).toBe("true");
    expect(screen.queryByRole("button", { name: "Turn on" })).not.toBeInTheDocument();
    const cashbackStep = screen.getByText("Turn on automatic cashback").closest(".Polaris-InlineStack");
    expect(cashbackStep?.textContent).toContain("Done");
    expect(screen.getByText(SETUP_TITLE)).toBeInTheDocument();
  });
});
