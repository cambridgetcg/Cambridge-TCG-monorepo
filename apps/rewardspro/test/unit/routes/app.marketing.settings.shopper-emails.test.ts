import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Email settings: one switch per email RewardsPro sends shoppers by itself,
// each off until the merchant turns it on.

const SHOP = "test-shop.myshopify.com";

const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
const prisma = vi.hoisted(() => ({
  emailSettings: { upsert: vi.fn(), findUnique: vi.fn() },
  shopSettings: { findUnique: vi.fn() },
  sendGridDomain: { findMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useFetcher: () => ({ state: "idle", data: undefined, submit: vi.fn() }),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: vi.fn(async () => ({ session: { shop: SHOP } })) },
}));
vi.mock("~/db.server", () => ({ default: prisma }));
vi.mock("~/services/marketing-mode.server", () => ({
  getMarketingModeInfo: vi.fn(),
  switchMarketingMode: vi.fn(),
}));
vi.mock("~/services/email-usage-control.server", () => ({ getEmailUsageStats: vi.fn() }));
vi.mock("~/services/klaviyo.server", () => ({ isKlaviyoEnabled: vi.fn() }));
vi.mock("~/components/Billing/UpgradePrompt", () => ({ LimitHint: () => null }));

import EmailSettings, { action, loader } from "~/routes/app.marketing.settings";
import { SHOPPER_EMAIL_KINDS, SHOPPER_EMAIL_SWITCHES, shopperEmailSwitches } from "~/constants/shopper-emails";
import { FEATURES_AVAILABLE } from "~/constants/feature-availability";
import { getMarketingModeInfo } from "~/services/marketing-mode.server";
import { getEmailUsageStats } from "~/services/email-usage-control.server";
import { isKlaviyoEnabled } from "~/services/klaviyo.server";

const SEND_TIME_PREFS = { preferredTime: "10:00", timezone: "America/New_York", dailyLimit: 1000, hourlyLimit: 100 };

function saveRequest(fields: Record<string, string>) {
  const body = new FormData();
  body.set("intent", "saveSettings");
  body.set("senderName", "Card Shop");
  body.set("senderEmail", "hello@card-shop.example");
  body.set("primaryColor", "#5C6AC4");
  body.set("secondaryColor", "#F4F6F8");
  body.set("fontFamily", "Inter");
  body.set("footerText", "Card Shop");
  body.set("dailyLimit", "1000");
  body.set("hourlyLimit", "100");
  body.set("preferredTime", "10:00");
  body.set("timezone", "America/New_York");
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return { request: new Request("https://app.test/app/marketing/settings", { method: "POST", body }), params: {}, context: {} };
}

function pageHtml(emailSettings: Record<string, unknown> | null, sendgridConfigured = true, klaviyoSending = false) {
  remix.loaderData = {
    shop: SHOP,
    emailSettings,
    customDomain: null,
    shopSettings: { storeName: "Card Shop" },
    domains: [],
    sendgridConfigured,
    klaviyoSending,
    marketingModeInfo: { mode: "INHOUSE", isKlaviyoConnected: false },
    emailUsageStats: {
      percentage: 0, planName: "Free", limit: 50, totalEmails: 0, remaining: 50, isLocked: false,
      campaignEmails: 0, automationEmails: 0, transactionalEmails: 0,
    },
  };
  return renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(EmailSettings))).replaceAll("&#x27;", "'");
}

function switchInput(html: string, kind: string) {
  const match = html.match(new RegExp(`<input[^>]*id="shopper-email-${kind}"[^>]*>`));
  expect(match, `switch for ${kind}`).not.toBeNull();
  return match![0];
}

describe("Email settings: shopper email switches", () => {
  beforeEach(() => {
    prisma.emailSettings.upsert.mockResolvedValue({});
  });

  it("saves the switches with the other send controls, and only the ones the page shows", async () => {
    await action(
      saveRequest({
        "shopperEmails.welcome": "true",
        "shopperEmails.tierDown": "false",
        "shopperEmails.pointsExpiring": "true",
        "shopperEmails.pointsEarned": "true",
      }),
    );

    const { create, update } = prisma.emailSettings.upsert.mock.calls[0][0];
    for (const stored of [create.sendTimePrefs, update.sendTimePrefs]) {
      expect(stored).toMatchObject(SEND_TIME_PREFS);
      const switches = shopperEmailSwitches(stored);
      expect(switches.welcome).toBe(true);
      // No switch on the page, so it can't be turned on
      expect(switches.pointsExpiring).toBe(false);
      // Hidden while shoppers can't spend points
      expect(switches.pointsEarned).toBe(false);
      for (const kind of SHOPPER_EMAIL_KINDS.filter((k) => k !== "welcome")) {
        expect(switches[kind], kind).toBe(false);
      }
    }
  });

  it("turns everything off when the form leaves the switches out", async () => {
    await action(saveRequest({}));

    const { update } = prisma.emailSettings.upsert.mock.calls[0][0];
    expect(Object.values(shopperEmailSwitches(update.sendTimePrefs)).some(Boolean)).toBe(false);
  });

  it("shows every switch off for a shop that never turned one on, and says they are off until turned on", () => {
    const html = pageHtml({ senderEmail: "", sendTimePrefs: SEND_TIME_PREFS, emailProvider: "SENDGRID" });

    expect(html).toContain("Emails to your customers");
    expect(html).toContain("off until you turn it on");
    for (const { kind, label } of SHOPPER_EMAIL_SWITCHES) {
      expect(html).toContain(label);
      expect(switchInput(html, kind)).toContain('aria-checked="false"');
    }
  });

  it("shows no Points added switch while shoppers can't spend points", () => {
    expect(FEATURES_AVAILABLE.points).toBe(false);
    const html = pageHtml({ sendTimePrefs: { ...SEND_TIME_PREFS, shopperEmails: { pointsEarned: true } }, emailProvider: "SENDGRID" });

    expect(SHOPPER_EMAIL_SWITCHES.map(({ kind }) => kind)).not.toContain("pointsEarned");
    expect(html).not.toContain('id="shopper-email-pointsEarned"');
    expect(html).not.toContain("Points added");
  });

  it("tells the merchant who gets the welcome email", () => {
    const html = pageHtml(null);

    expect(html).toContain(
      "Sent to a new customer, usually when they check out or sign up, if they agreed to get your marketing emails and qualify for a tier. Customers you already had don't get one.",
    );
  });

  it("shows every switch off for a shop with no email settings", () => {
    const html = pageHtml(null);

    for (const { kind } of SHOPPER_EMAIL_SWITCHES) {
      expect(switchInput(html, kind)).toContain('aria-checked="false"');
    }
  });

  it("shows the switches the merchant turned on", () => {
    const html = pageHtml({ sendTimePrefs: { ...SEND_TIME_PREFS, shopperEmails: { welcome: true } }, emailProvider: "SENDGRID" });

    expect(switchInput(html, "welcome")).toContain('aria-checked="true"');
    expect(switchInput(html, "tierUp")).toContain('aria-checked="false"');
  });

  it("says nothing goes out through RewardsPro for a shop that sends through Klaviyo", () => {
    const html = pageHtml({ sendTimePrefs: { ...SEND_TIME_PREFS, shopperEmails: { welcome: true } }, emailProvider: "KLAVIYO" }, true, true);

    expect(html).toContain("You send email through Klaviyo, so RewardsPro sends none of these itself.");
    expect(html).not.toContain("Klaviyo isn't connected");
  });

  it("warns that nobody emails customers while the shop sends through Klaviyo but Klaviyo isn't connected", () => {
    const html = pageHtml({ sendTimePrefs: { ...SEND_TIME_PREFS, shopperEmails: { welcome: true } }, emailProvider: "KLAVIYO" }, true, false);

    expect(html).toContain(
      "Klaviyo isn't connected, so your customers get none of these emails. Reconnect Klaviyo, or switch to In-House Marketing to send them from RewardsPro.",
    );
    expect(html).not.toContain("Your Klaviyo flows decide what your customers get.");
  });

  it("asks Klaviyo's own check whether events reach Klaviyo, not just whether it was once connected", async () => {
    prisma.emailSettings.findUnique.mockResolvedValue({ shop: SHOP, emailProvider: "KLAVIYO", customDomainId: null });
    prisma.shopSettings.findUnique.mockResolvedValue({ storeName: "Card Shop" });
    prisma.sendGridDomain.findMany.mockResolvedValue([]);
    // A failed token refresh leaves klaviyoEnabled on, so the mode info still says connected
    vi.mocked(getMarketingModeInfo).mockResolvedValue({
      mode: "KLAVIYO", modeSetAt: null, hasSeenChoice: true, isKlaviyoConnected: true, isSendGridConfigured: true,
    });
    vi.mocked(getEmailUsageStats).mockResolvedValue({} as Awaited<ReturnType<typeof getEmailUsageStats>>);
    vi.mocked(isKlaviyoEnabled).mockResolvedValue(false);

    const response = await loader({ request: new Request("https://app.test/app/marketing/settings"), params: {}, context: {} });

    expect(isKlaviyoEnabled).toHaveBeenCalledWith(SHOP);
    await expect(response.json()).resolves.toMatchObject({ klaviyoSending: false });
  });

  it("says nothing goes out while email sending isn't set up", () => {
    const html = pageHtml({ sendTimePrefs: { ...SEND_TIME_PREFS, shopperEmails: { welcome: true } }, emailProvider: "SENDGRID" }, false);

    expect(html).toContain("Email sending isn't set up yet, so RewardsPro sends none of these, even the ones you turn on.");
  });
});
