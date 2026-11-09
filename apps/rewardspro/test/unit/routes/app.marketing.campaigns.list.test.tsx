import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { describe, expect, it, vi } from "vitest";

// The campaigns list, rendered for real; only Remix hooks and server neighbours are stubbed.
const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useNavigate: () => vi.fn(),
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/services/marketing-mode.server", () => ({ guardInHouseRoute: vi.fn() }));
vi.mock("~/services/campaign-send.server", () => ({ shopTimeZone: vi.fn() }));

import CampaignsList from "~/routes/app.marketing.campaigns._index";

const NO_METRICS = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0, orders: 0 };

function campaign(id: string, status: string, metrics: Record<string, unknown> | null) {
  return { id, name: `Campaign ${id}`, status, subject: "Sale", scheduledFor: null, sentAt: null, metrics, createdAt: "2026-11-01T10:00:00.000Z" };
}

function listHtml(campaigns: ReturnType<typeof campaign>[]) {
  remix.loaderData = { shop: "test-shop.myshopify.com", campaigns, timeZone: "America/New_York" };
  return renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(CampaignsList))).replaceAll("&#x27;", "'");
}

/** The text of the table row for a campaign. */
function row(html: string, id: string): string {
  const rows = html.split("<tr").filter((r) => r.includes(`Campaign ${id}`));
  expect(rows).toHaveLength(1);
  return rows[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("the campaigns list", () => {
  it("says a campaign SendGrid gave no answer for may have gone out, not that 0 were sent", () => {
    const html = listHtml([
      campaign("maybe", "failed", { ...NO_METRICS, interruptedReason: "Something went wrong while this campaign was sending" }),
      campaign("unsent", "failed", { ...NO_METRICS, notSentReason: "No one could get it" }),
      campaign("sent", "sent", { ...NO_METRICS, sent: 40, opened: 10 }),
    ]);

    expect(row(html, "maybe")).toContain("May have gone out");
    expect(row(html, "maybe")).not.toMatch(/\b0 sent/);
    expect(row(html, "unsent")).toContain("Not sent");
    expect(row(html, "sent")).toContain("40 sent");
    expect(row(html, "sent")).toContain("25.0% opened");
  });

  it("still opens with a Smart Create draft, whose metrics are empty", () => {
    const html = listHtml([campaign("smart", "draft", {}), campaign("plain", "draft", null)]);

    expect(row(html, "smart")).toContain("—");
    expect(row(html, "plain")).toContain("—");
  });
});
