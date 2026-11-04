// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The campaign pages are rendered for real; only Remix hooks and server neighbours are stubbed.
const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useActionData: () => undefined,
  useNavigate: () => vi.fn(),
  Form: ({ children }: { children: ReactNode }) => createElement("form", null, children),
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));

import CreateCampaign from "~/routes/app.marketing.campaigns.create";
import SendCampaign from "~/routes/app.marketing.campaigns.$id.send";

const OFF = "RewardsPro can't send marketing email yet. You can write campaigns and save them as drafts, and send them once sending is switched on.";

function createPage(marketingBlocked: string | null) {
  remix.loaderData = {
    shop: "test-shop.myshopify.com",
    templates: [],
    segments: [{ id: "all", name: "All Customers", customerCount: 2 }],
    limitAccess: { canCreate: true, current: 0, max: 999999 },
    marketingBlocked,
    timeZone: "America/New_York",
  };
  render(createElement(AppProvider, { i18n: en }, createElement(CreateCampaign)));
}

async function writeACampaign() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Campaign Name"), "Autumn sale");
  await user.click(screen.getByLabelText("Write Content"));
  await user.type(screen.getByLabelText("Subject Line"), "Autumn sale");
  await user.type(screen.getByLabelText("Email Content (HTML)"), "20% off");
}

describe("the Create page while marketing email is off", () => {
  beforeEach(() => {
    remix.loaderData = {};
  });

  it("offers a draft, and nothing that would send", async () => {
    createPage(OFF);
    await writeACampaign();

    expect(screen.getByText(OFF)).toBeInTheDocument();
    expect(screen.getByLabelText("Save as draft")).toBeChecked();
    expect(screen.getByLabelText("Send immediately")).toBeDisabled();
    expect(screen.getByLabelText("Schedule for later")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Launch Campaign" })).not.toBeInTheDocument();
    expect(document.querySelector<HTMLInputElement>('input[name="scheduleType"]')!.value).toBe("draft");
  });

  it("still opens on Send immediately once email is on", async () => {
    createPage(null);
    await writeACampaign();

    expect(screen.getByLabelText("Send immediately")).toBeChecked();
    expect(screen.getByRole("button", { name: "Launch Campaign" })).toBeEnabled();
  });
});

describe("the send page", () => {
  it("opens on the tiers saved on the campaign, not on everyone", () => {
    remix.loaderData = {
      campaign: { id: "c1", name: "Sale (Copy)", subject: "Sale", previewText: "", status: "draft", templateId: "t1", segmentRules: { tierIds: ["bronze"] } },
      audience: { kind: "tiers", tierIds: ["bronze"] },
      audienceStats: { total: 3, withEmail: 3, reachable: 2, recommendedSegment: 0 },
      tiers: [
        { id: "bronze", name: "Bronze", customerCount: 1 },
        { id: "gold", name: "Gold", customerCount: 1 },
      ],
      marketingBlocked: null,
      timeZone: "America/New_York",
    };
    render(createElement(AppProvider, { i18n: en }, createElement(SendCampaign)));

    expect(screen.getByLabelText("Send to all reachable customers")).not.toBeChecked();
    expect(screen.getByLabelText("Bronze (1 customers)")).toBeChecked();
    expect(screen.getByLabelText("Gold (1 customers)")).not.toBeChecked();
    expect(document.querySelector<HTMLInputElement>('input[name="sendToAll"]')!.value).toBe("false");
    expect([...document.querySelectorAll<HTMLInputElement>('input[name="selectedTiers"]')].map((i) => i.value)).toEqual(["bronze"]);
  });
});
