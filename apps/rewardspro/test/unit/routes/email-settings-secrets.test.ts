import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stored EmailSettings row as Prisma would return it, including the columns
// that hold Klaviyo credentials.
const SECRETS = {
  klaviyoApiKey: "enc:v2:example-stored-ciphertext",
  klaviyoAccessToken: "example-oauth-access-token",
  klaviyoRefreshToken: "example-oauth-refresh-token",
  klaviyoWebhookSecret: "example-webhook-signing-secret",
};
const ROW = {
  shop: "test-shop.myshopify.com",
  senderName: "Test Shop",
  senderEmail: "hello@test-shop.example",
  replyToEmail: null,
  sendingMode: "SHARED",
  customDomainId: null,
  ...SECRETS,
};

const prisma = vi.hoisted(() => ({
  emailSettings: { findUnique: vi.fn() },
  shopSettings: { findUnique: vi.fn() },
  sendGridDomain: { findMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("~/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({ session: { shop: "test-shop.myshopify.com" } })),
  },
}));
vi.mock("~/db.server", () => ({ default: prisma }));
vi.mock("~/services/marketing-mode.server", () => ({
  getMarketingModeInfo: vi.fn(async () => ({ mode: "IN_HOUSE" })),
  switchMarketingMode: vi.fn(),
}));
vi.mock("~/services/email-usage-control.server", () => ({
  getEmailUsageStats: vi.fn(async () => ({})),
}));
vi.mock("~/components/Billing/UpgradePrompt", () => ({ LimitHint: () => null }));
vi.mock("~/services/analytics-recommendations.server", () => ({
  AnalyticsRecommendationsService: class {
    getRecommendationById = vi.fn(async () => null);
    transformToCampaign = vi.fn(async () => null);
    getActionRecommendations = vi.fn(async () => []);
  },
}));

import { loader as settingsLoader } from "~/routes/app.marketing.settings";
import { loader as smartCreateLoader } from "~/routes/app.marketing.campaigns.smart-create";

function args(path: string) {
  return { request: new Request(`https://app.test${path}`), params: {}, context: {} };
}

describe("loaders that send email settings to the browser", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Behave like Prisma: columns named in `omit` are not returned.
    prisma.emailSettings.findUnique.mockImplementation(
      async ({ omit = {} }: { omit?: Record<string, boolean> }) =>
        Object.fromEntries(Object.entries(ROW).filter(([key]) => !omit[key])),
    );
    prisma.shopSettings.findUnique.mockResolvedValue(null);
    prisma.sendGridDomain.findMany.mockResolvedValue([]);
    prisma.sendGridDomain.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["marketing settings", () => settingsLoader(args("/app/marketing/settings"))],
    ["smart campaign creator", () => smartCreateLoader(args("/app/marketing/campaigns/smart-create"))],
  ])("%s loader leaves out Klaviyo credentials", async (_name, run) => {
    const response = await run();
    const text = await response.text();

    for (const value of Object.values(SECRETS)) {
      expect(text).not.toContain(value);
    }
    expect(text).toContain(ROW.senderEmail);
  });
});
