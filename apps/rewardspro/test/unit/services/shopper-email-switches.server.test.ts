import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../mocks/server";

// Every email RewardsPro sends a shopper by itself goes out only when the
// shop's merchant turned that kind on. SendGrid is answered by MSW, so
// "sends nothing" means no request reached SendGrid at all.

const SHOP = "test-shop.myshopify.com";

const prisma = vi.hoisted(() => ({
  emailSettings: { findUnique: vi.fn() },
  shopSettings: { findUnique: vi.fn() },
  sendGridDomain: { findFirst: vi.fn() },
  emailEvent: { create: vi.fn() },
  tier: { findMany: vi.fn() },
}));

vi.mock("~/db.server", () => ({ default: prisma }));
vi.mock("~/services/email-usage-control.server", () => ({
  checkEmailLimit: vi.fn(async () => ({ capacityExceeded: false })),
  recordEmailSent: vi.fn(),
}));
vi.mock("~/services/klaviyo.server", () => ({ isKlaviyoEnabled: vi.fn(async () => false) }));

import {
  sendPointsEarnedEmail,
  sendPointsExpiringEmail,
  sendPointsRedeemedEmail,
  sendStreakMilestoneEmail,
  sendTierDowngradeEmailNotification,
  sendTierExpirationWarningEmail,
  sendTierExpiredEmail,
  sendTierUpgradeEmailNotification,
  sendWelcomeEmailNotification,
} from "~/services/email-notifications.server";
import { SHOPPER_EMAIL_KINDS, type ShopperEmailKind } from "~/constants/shopper-emails";

const shopper = { id: "customer-1", email: "shopper@example.test", firstName: "Sam", lastName: null, shop: SHOP };
const silver = { id: "tier-silver", name: "Silver", cashbackPercent: 2 };
const gold = { id: "tier-gold", name: "Gold", cashbackPercent: 5 };
const points = { customerId: shopper.id, email: shopper.email, firstName: "Sam", currencyName: "Stars", currencyIcon: "*" };

/** One call per kind, the way the webhooks, the cron and the Members page make it. */
const SEND: Record<ShopperEmailKind, () => Promise<unknown>> = {
  welcome: () => sendWelcomeEmailNotification(SHOP, shopper, silver),
  tierUp: () => sendTierUpgradeEmailNotification(SHOP, shopper, silver, gold),
  tierDown: () => sendTierDowngradeEmailNotification(SHOP, shopper, gold, silver),
  membershipReminder: () =>
    sendTierExpirationWarningEmail(SHOP, {
      customerId: shopper.id,
      email: shopper.email,
      firstName: "Sam",
      tierName: "Gold",
      tierBenefits: ["5% cashback on purchases"],
      daysUntilExpiry: 7,
      expirationDate: new Date("2026-12-01T00:00:00Z"),
    }),
  membershipEnded: () =>
    sendTierExpiredEmail(SHOP, {
      customerId: shopper.id,
      email: shopper.email,
      firstName: "Sam",
      expiredTierName: "Gold",
      newTierName: null,
    }),
  pointsEarned: () => sendPointsEarnedEmail(SHOP, { ...points, pointsEarned: 100, totalBalance: 300 }),
  pointsExpiring: () => sendPointsExpiringEmail(SHOP, { ...points, pointsExpiring: 50, daysUntilExpiry: 7 }),
  pointsRedeemed: () =>
    sendPointsRedeemedEmail(SHOP, {
      ...points,
      pointsSpent: 100,
      remainingBalance: 200,
      discountCode: "STARS-5",
      discountValue: 5,
      discountType: "fixed",
      expiresAt: new Date("2026-12-01T00:00:00Z"),
    }),
  streakMilestone: () => sendStreakMilestoneEmail(SHOP, { ...points, streakDays: 7, bonusMultiplier: 1.1 }),
};

/** The row markChoiceModalSeen creates when a merchant dismisses the Marketing choice: no switches. */
const SETTINGS = {
  shop: SHOP,
  senderName: "Card Shop",
  senderEmail: `noreply@${SHOP}`,
  replyToEmail: null,
  sendingMode: "SHARED",
  customDomainId: null,
  emailProvider: "SENDGRID",
  footerContent: null,
  sendTimePrefs: { preferredTime: "10:00", timezone: "America/New_York", dailyLimit: 1000, hourlyLimit: 100 },
};

function settingsWith(switches: Partial<Record<ShopperEmailKind, boolean>>, overrides: Record<string, unknown> = {}) {
  return { ...SETTINGS, sendTimePrefs: { ...SETTINGS.sendTimePrefs, shopperEmails: switches }, ...overrides };
}

const allOn = () => Object.fromEntries(SHOPPER_EMAIL_KINDS.map((kind) => [kind, true]));

/** SendGrid's mail/send, answered by MSW; returns the addresses each request went to. */
function mockSendGrid(): string[][] {
  const sent: string[][] = [];
  server.use(
    http.post("https://api.sendgrid.com/v3/mail/send", async ({ request }) => {
      const body = (await request.json()) as { personalizations: Array<{ to: Array<{ email: string }> }> };
      sent.push(body.personalizations.flatMap((p) => p.to.map((to) => to.email)));
      return new HttpResponse(null, { status: 202 });
    }),
  );
  return sent;
}

describe("emails RewardsPro sends shoppers by itself", () => {
  let sent: string[][];

  beforeEach(() => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    prisma.shopSettings.findUnique.mockResolvedValue({ shop: SHOP, storeName: "Card Shop" });
    prisma.sendGridDomain.findFirst.mockResolvedValue(null);
    prisma.emailEvent.create.mockResolvedValue({});
    prisma.tier.findMany.mockResolvedValue([]);
    sent = mockSendGrid();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("has a switch for every kind, and every kind has a send path here", () => {
    expect(Object.keys(SEND).sort()).toEqual([...SHOPPER_EMAIL_KINDS].sort());
  });

  it.each(SHOPPER_EMAIL_KINDS)("%s: sends nothing for a shop without email settings", async (kind) => {
    prisma.emailSettings.findUnique.mockResolvedValue(null);

    await SEND[kind]();

    expect(sent).toEqual([]);
  });

  it.each(SHOPPER_EMAIL_KINDS)("%s: sends nothing for a shop whose settings have no switches yet", async (kind) => {
    prisma.emailSettings.findUnique.mockResolvedValue(SETTINGS);

    await SEND[kind]();

    expect(sent).toEqual([]);
  });

  it.each(SHOPPER_EMAIL_KINDS)("%s: sends nothing while only the other kinds are on", async (kind) => {
    prisma.emailSettings.findUnique.mockResolvedValue(settingsWith({ ...allOn(), [kind]: false }));

    await SEND[kind]();

    expect(sent).toEqual([]);
  });

  it.each(SHOPPER_EMAIL_KINDS)("%s: sends to the shopper once the merchant turns it on", async (kind) => {
    prisma.emailSettings.findUnique.mockResolvedValue(settingsWith({ [kind]: true }));

    await SEND[kind]();

    expect(sent).toEqual([[shopper.email]]);
  });

  it.each(SHOPPER_EMAIL_KINDS)("%s: sends nothing through SendGrid for a shop that sends through Klaviyo", async (kind) => {
    prisma.emailSettings.findUnique.mockResolvedValue(settingsWith(allOn(), { emailProvider: "KLAVIYO" }));

    await SEND[kind]();

    expect(sent).toEqual([]);
  });

  it.each(SHOPPER_EMAIL_KINDS)("%s: sends nothing while SendGrid isn't set up", async (kind) => {
    vi.stubEnv("SENDGRID_API_KEY", "");
    prisma.emailSettings.findUnique.mockResolvedValue(settingsWith(allOn()));

    await SEND[kind]();

    expect(sent).toEqual([]);
  });
});
