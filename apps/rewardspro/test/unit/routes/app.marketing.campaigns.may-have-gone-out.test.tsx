import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { describe, expect, it, vi } from "vitest";

// A campaign SendGrid gave no answer for, as the merchant sees it. The pages
// are rendered for real; only Remix hooks and server neighbours are stubbed.
const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useActionData: () => undefined,
  useSubmit: () => vi.fn(),
  useNavigation: () => ({ state: "idle" }),
  useFetcher: () => ({ data: undefined, state: "idle", submit: vi.fn() }),
  useNavigate: () => vi.fn(),
  Form: ({ children }: { children: ReactNode }) => createElement("form", null, children),
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/components/AuthenticatedFetch", () => ({ useAuthenticatedFetch: () => vi.fn() }));

import CampaignDetail from "~/routes/app.marketing.campaigns.$id._index";
import MarketingHub from "~/routes/app.marketing._index";

const INTERRUPTED =
  "Something went wrong while this campaign was sending, and some or all customers may have received it. RewardsPro won't send it again by itself. Check whether they got it before you send it again, so no one gets it twice.";
const SEND_STARTED = "2026-11-02T15:30:00.000Z";

function pageText(Component: ComponentType, loaderData: Record<string, unknown>) {
  remix.loaderData = loaderData;
  return renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(Component)))
    .replaceAll("&#x27;", "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function campaign(status: string, metrics: Record<string, unknown>) {
  return {
    id: "c1",
    name: "Autumn sale",
    status,
    subject: "Autumn sale",
    previewText: "",
    templateId: "t1",
    scheduledFor: null,
    sentAt: SEND_STARTED,
    metrics: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0, orders: 0, ...metrics },
    createdAt: "2026-11-02T15:00:00.000Z",
    updatedAt: SEND_STARTED,
  };
}

const detail = (c: ReturnType<typeof campaign>) => pageText(CampaignDetail, { campaign: c, templates: [], timeZone: "UTC" });

describe("a campaign that may have gone out", () => {
  it("shows what SendGrid has reported so far, so the merchant can check before sending it again", () => {
    const text = detail(campaign("failed", { delivered: 2, bounced: 1, interruptedReason: INTERRUPTED }));

    expect(text).toContain("This campaign may have been sent");
    expect(text).toContain("So far SendGrid has reported 2 delivered and 1 bounced. It reports each email as it arrives, so check again in a few minutes.");
  });

  it("calls the time it was sent from the time the send started, not the time it was sent", () => {
    const text = detail(campaign("failed", { interruptedReason: INTERRUPTED }));

    expect(text).toContain("Send started November 2, 2026 at 03:30 PM UTC");
    expect(text).not.toMatch(/ Sent November/);
    expect(detail(campaign("sent", { sent: 40 }))).toContain("Sent November 2, 2026 at 03:30 PM UTC");
  });

  it("is listed on the Marketing Hub by when its send started, not as last edited", () => {
    const text = pageText(MarketingHub, {
      showChoiceModal: false,
      isConfigured: true,
      isKlaviyoConnected: false,
      marketingMode: "INHOUSE",
      klaviyoData: null,
      timeZone: "UTC",
      metrics: { totalSent: 0, sentChange: 0, openRate: 0, openRateChange: 0, clickRate: 0, clickRateChange: 0, totalRevenue: 0, revenueChange: 0, totalOrders: 0 },
      recentCampaigns: [campaign("failed", { interruptedReason: INTERRUPTED })],
      automations: [],
      customerStats: { total: 0, withEmail: 0, subscribed: 0 },
      recommendations: [],
    });

    expect(text).toContain("Autumn sale");
    expect(text).toContain("Send started Nov 2");
    expect(text).not.toContain("Last edited");
  });
});
