import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as FeatureAvailability from "~/constants/feature-availability";

/**
 * What merchants see while a feature can't work end to end
 * (app/constants/feature-availability.ts). The pages are rendered for real;
 * only their server-side neighbours are stubbed.
 */

const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
// Lets one test render a page as it will look once points can be spent
const availability = vi.hoisted(() => ({ points: false }));

vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useActionData: () => undefined,
  useSubmit: () => vi.fn(),
  useNavigation: () => ({ state: "idle" }),
  useFetcher: () => ({ data: undefined, state: "idle", submit: vi.fn() }),
  useNavigate: () => vi.fn(),
}));
vi.mock("~/constants/feature-availability", async (importOriginal) => {
  const actual = await importOriginal<typeof FeatureAvailability>();
  return {
    ...actual,
    FEATURES_AVAILABLE: {
      ...actual.FEATURES_AVAILABLE,
      get points() {
        return availability.points;
      },
    },
  };
});
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/components/AuthenticatedFetch", () => ({ useAuthenticatedFetch: () => vi.fn() }));

import RewardsOverview from "~/routes/app.rewards._index";
import MissionsPage from "~/routes/app.rewards.missions._index";
import PointsSetupPage from "~/routes/app.rewards.config";
import { AIAssistantPanel } from "~/components/AIEmailAssistant";
import { IconPicker } from "~/components/IconPicker";
import { PointsTab } from "~/components/Points";
import EditEmailTemplate from "~/routes/app.marketing.templates.$id";
import NewEmailTemplate from "~/routes/app.marketing.templates.new";
import MarketingHub from "~/routes/app.marketing._index";

function renderPage(Component: ComponentType, loaderData: Record<string, unknown> = {}) {
  remix.loaderData = loaderData;
  const html = renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(Component)));
  return html.replaceAll("&#x27;", "'");
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const pointsConfig = {
  isEnabled: true,
  currencyName: "Point",
  currencyNamePlural: "Points",
  currencyIcon: "⭐",
  pointsPerDollar: 10,
  roundingMode: "FLOOR",
  pointsExpire: false,
  expirationDays: 365,
  expirationWarningDays: 30,
  rafflesEnabled: true,
  mysteryBoxesEnabled: true,
  spinWheelEnabled: true,
  challengesEnabled: true,
  scratchCardsEnabled: true,
  givebackPoolsEnabled: true,
  dailySpinEnabled: true,
  dailySpinResetHour: 0,
  premiumSpinCost: 100,
  streakBonusEnabled: false,
  streakBonusMultiplier: 0.1,
  iconType: "library",
  iconId: "star",
  iconColor: "#000000",
};

const overviewData = {
  config: pointsConfig,
  stats: {
    totalPointsIssued: 0,
    totalPointsRedeemed: 0,
    totalPointsExpired: 0,
    activePointsBalance: 0,
    customersWithPoints: 0,
  },
  features: {
    pointsSystem: true,
    raffles: false,
    mysteryBoxes: false,
    spinWheel: false,
    challenges: true,
    scratchCards: false,
    givebackPools: false,
    dailySpin: false,
    streakBonus: false,
  },
  moduleStats: {
    raffles: { totalRaffles: 0, activeRaffles: 0, totalEntries: 0, totalPrizePoolValue: 0 },
    mysteryBoxes: { totalBoxes: 0, activeBoxes: 0, totalOpens: 0, totalPointsSpent: 0 },
    challenges: { totalChallenges: 0, activeChallenges: 0, totalParticipants: 0, totalCompletions: 0 },
  },
};

beforeEach(() => {
  availability.points = false;
});

describe("rewards overview", () => {
  it("says points aren't available and offers no way to switch them on", () => {
    for (const isEnabled of [false, true]) {
      const html = renderPage(RewardsOverview, { ...overviewData, config: { ...pointsConfig, isEnabled } });

      expect(html).toContain("Points aren't available yet");
      expect(html).toContain("Cashback and tiers work today");
      expect(html).not.toMatch(/Enable Points System|Enable the Points/);
      expect(html).not.toContain('href="/app/rewards/config"');
    }
  });

  it("never claims points are earned on purchases, once points can be spent", () => {
    availability.points = true;

    const html = renderPage(RewardsOverview, overviewData);

    expect(html).toContain("Points system active");
    expect(html).not.toMatch(/on every purchase|per \$1 spent/);
    expect(html).toContain("Customers don't earn points from purchases");
  });
});

describe("missions page", () => {
  const emptyMissions = { daily: [], weekly: [], monthly: [], special: [] };
  const stats = {
    totalMissions: 0,
    activeMissions: 0,
    totalParticipants: 0,
    totalCompletions: 0,
    totalXpAwarded: 0,
    completionRate: 0,
  };

  it.each([false, true])("says missions aren't live in the storefront (missions on: %s)", (missionsEnabled) => {
    const html = renderPage(MissionsPage, {
      missionsEnabled,
      pointsConfig: { currencyName: "Point", currencyIcon: "⭐", currencyPlural: "Points" },
      missions: emptyMissions,
      stats,
      analytics: null,
    });

    expect(text(html)).toContain("Missions aren't live in your storefront yet");
    expect(text(html)).toContain("shoppers can't see or join them yet");
  });
});

describe("points setup", () => {
  it("shows no toggles for paused games of chance or Giveback pools", () => {
    availability.points = true;

    const html = text(renderPage(PointsSetupPage, { config: pointsConfig, tiers: [] }));

    for (const title of ["Raffles", "Mystery Boxes", "Spin Wheel", "Scratch Cards", "Giveback Pools", "Spin Wheel Settings"]) {
      expect(html).not.toContain(title);
    }
    expect(html).toContain("Challenges");
    expect(html).toContain("1/1 Active");
  });

  it("offers no icon upload", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(
          AppProvider,
          { i18n: en },
          createElement(IconPicker, {
            value: { iconType: "library", iconEmoji: "", iconUrl: null, iconId: "star", iconColor: null },
            onChange: () => {},
            onUpload: async () => null,
          }),
        ),
      ),
    );

    expect(html).toContain("Icon Library");
    expect(html).not.toContain("Upload");
  });
});

describe("customer points tab", () => {
  it("says points aren't available instead of offering to add or remove them", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(
          AppProvider,
          { i18n: en },
          createElement(PointsTab, {
            customer: { id: "customer-1", email: "shopper@example.com", pointsBalance: 0 },
            currencyConfig: { name: "Point", plural: "Points", icon: "⭐" },
          }),
        ),
      ),
    ).replaceAll("&#x27;", "'");

    expect(html).toContain("Points aren't available yet");
    expect(html).not.toMatch(/Add Points|Remove Points/i);
  });
});

describe("AI email assistant panel", () => {
  it("says the assistant isn't available, without blaming an API key", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(AppProvider, { i18n: en }, createElement(AIAssistantPanel, { templateType: "promotional" })),
      ),
    ).replaceAll("&#x27;", "'");

    expect(html).toContain("The AI writing assistant isn't available.");
    expect(html).not.toMatch(/API key/i);
    expect(html).not.toContain("Generate");
  });
});

describe("email template editors", () => {
  const tabNames = () => screen.queryAllByRole("tab").map((tab) => tab.textContent);

  it("show no AI tab while the assistant isn't available", () => {
    remix.loaderData = {
      shop: "honest.myshopify.com",
      template: {
        id: "template-1",
        name: "Welcome",
        type: "promotional",
        subject: "Hello",
        previewText: "",
        bodyHtml: "",
        content: { blocks: [], styles: {} },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
      brandKit: null,
      brandKitEnabled: false,
    };
    render(createElement(AppProvider, { i18n: en }, createElement(EditEmailTemplate)));

    expect(tabNames()).toContain("Content");
    expect(tabNames()).not.toContain("AI");
  });

  it("show no AI tab on a new template either", async () => {
    const user = userEvent.setup();
    remix.loaderData = { shop: "honest.myshopify.com", brandKit: null, brandKitEnabled: false };
    render(createElement(AppProvider, { i18n: en }, createElement(NewEmailTemplate)));

    await user.click(screen.getByRole("button", { name: "Start Fresh" }));

    expect(tabNames()).toContain("Content");
    expect(tabNames()).not.toContain("AI");
  });
});

describe("marketing home", () => {
  it("doesn't promote points, raffles or mystery boxes", () => {
    const html = text(
      renderPage(MarketingHub, {
        showChoiceModal: false,
        isConfigured: true,
        isKlaviyoConnected: false,
        marketingMode: "INHOUSE",
        klaviyoData: null,
        metrics: {
          totalSent: 0,
          sentChange: 0,
          openRate: 0,
          openRateChange: 0,
          clickRate: 0,
          clickRateChange: 0,
          totalRevenue: 0,
          revenueChange: 0,
          totalOrders: 0,
        },
        recentCampaigns: [],
        automations: [],
        customerStats: { total: 0, withEmail: 0, subscribed: 0 },
        recommendations: [],
      }),
    );

    expect(html).toContain("Marketing Hub");
    expect(html).not.toMatch(/Points Engagement|View Points Hub|Raffles|Mystery Boxes/);
  });
});
