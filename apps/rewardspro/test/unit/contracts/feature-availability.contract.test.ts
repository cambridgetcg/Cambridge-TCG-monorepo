// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Features that can't work end to end yet (app/constants/feature-availability.ts)
 * are not offered: the admin hides them, the server refuses them and the
 * storefront gets no data for them.
 */

const SHOP = "honest.myshopify.com";

const prisma = vi.hoisted(() => ({
  challenge: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  challengeReward: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  customer: { findUnique: vi.fn() },
  shopSettings: { findUnique: vi.fn() },
  pointsConfig: { findUnique: vi.fn() },
  tier: { findMany: vi.fn() },
  tierProduct: { findMany: vi.fn() },
}));
const pointsConfig = vi.hoisted(() => ({
  getPointsConfig: vi.fn(),
  updatePointsConfig: vi.fn(),
  getEnabledFeatures: vi.fn(),
  getPointsStats: vi.fn(),
  getCurrencyBranding: vi.fn(),
}));
const pointsEvents = vi.hoisted(() => ({ getActiveEvents: vi.fn() }));
const missionStats = vi.hoisted(() => ({
  getMissionAnalytics: vi.fn(),
  getMissionsForCustomer: vi.fn(),
  getPlayerStats: vi.fn(),
}));

vi.mock("~/db.server", () => ({ default: prisma, db: prisma, databaseSchema: "rewardspro" }));
vi.mock("~/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({ session: { shop: SHOP }, admin: {} })),
    public: { appProxy: vi.fn(async () => ({ session: { shop: SHOP } })) },
  },
  unauthenticated: {},
}));
vi.mock("~/utils/rate-limiter-redis", () => ({ appProxyRateLimit: vi.fn(async () => null) }));
vi.mock("~/services/points-config.server", () => pointsConfig);
vi.mock("~/services/points-bonus-events.server", () => pointsEvents);
vi.mock("~/services/points-redemption.server", () => ({ getRedemptionTiers: vi.fn(async () => []) }));
vi.mock("~/services/mission-stats.server", () => missionStats);
vi.mock("~/services/anthropic.server", () => ({ generateSubjectLines: vi.fn(), streamGeneration: vi.fn() }));
vi.mock("~/services/points-metafield-sync.server", () => ({ syncPointsConfigMetafield: vi.fn() }));
vi.mock("~/services/raffle-management.server", () => ({ getRaffleStats: vi.fn() }));
vi.mock("~/services/mystery-box-management.server", () => ({ getMysteryBoxStats: vi.fn() }));

import {
  FEATURES_AVAILABLE,
  isMissionRewardAvailable,
  missionRewardUnavailableReason,
} from "~/constants/feature-availability";
import { MISSION_REWARD_TYPES, TEMPLATES_BY_CADENCE } from "~/constants/mission-templates";
import { SECTION_NAVIGATION } from "~/navigation/registry";
import { setChallengeReward, transitionChallengeStatus } from "~/services/challenge-management.server";
import { loader as missionEditorLoader } from "~/routes/app.rewards.missions.$id";
import { loader as missionsLoader } from "~/routes/app.rewards.missions._index";
import { action as overviewAction } from "~/routes/app.rewards._index";
import { action as pointsSetupAction, loader as pointsSetupLoader } from "~/routes/app.rewards.config";
import { action as giftCardsAction, loader as giftCardsLoader } from "~/routes/app.members.gift-cards";
import { action as redeemAction, loader as redeemLoader } from "~/routes/api.customer-account.points.redeem";
import { action as aiAction } from "~/routes/api.ai-email-assistant";
import { loader as proxyLoader } from "~/routes/api.proxy.$";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
// What Shopify adds to an embedded page load; a redirect must keep it
const EMBEDDED = `?embedded=1&shop=${SHOP}&host=YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvaG9uZXN0`;
const args = (url: string, init?: RequestInit, params: Record<string, string> = {}) => ({
  request: new Request(url, init),
  params,
  context: {},
});
const post = (url: string, fields: Record<string, string>) =>
  args(url, { method: "POST", body: new URLSearchParams(fields) });
const config = (overrides: Record<string, unknown> = {}) => ({
  isEnabled: false,
  challengesEnabled: false,
  currencyName: "Point",
  currencyNamePlural: "Points",
  currencyIcon: "⭐",
  ...overrides,
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("feature availability switch", () => {
  it("is a code constant, not a setting or environment variable", () => {
    expect(FEATURES_AVAILABLE).toEqual({
      points: false,
      giftCards: false,
      aiEmailAssistant: false,
      iconUpload: false,
      givebackPools: false,
    });
    const source = read("app/constants/feature-availability.ts");
    expect(source).not.toMatch(/process\.env|prisma|^import (?!type )/m);
  });

  it("hides Points setup and Gift cards from the admin navigation", () => {
    const rewards = SECTION_NAVIGATION.rewards.map((item) => item.label);
    const members = SECTION_NAVIGATION.members.map((item) => item.label);
    expect(rewards).not.toContain("Points setup");
    expect(rewards).toContain("Missions");
    expect(members).not.toContain("Gift cards");
    expect(members).toContain("Tiers");
  });
});

describe("mission rewards", () => {
  it("offers only rewards a shopper can receive today", () => {
    expect(["POINTS", "STORE_CREDIT", "DISCOUNT", "TIER_UPGRADE"].filter(isMissionRewardAvailable)).toEqual([]);
    expect(isMissionRewardAvailable("CUSTOM")).toBe(true);
    expect(missionRewardUnavailableReason("DISCOUNT")).toMatch(/can't be a mission reward yet/);
    expect(missionRewardUnavailableReason("TIER_UPGRADE")).toMatch(/no way to choose the tier/);
  });

  it("the mission editor's reward picker lists only those rewards", () => {
    expect(MISSION_REWARD_TYPES.map((reward) => reward.value)).toEqual(["CUSTOM"]);
    expect(read("app/routes/app.rewards.missions.$id.tsx")).toMatch(/options=\{MISSION_REWARD_TYPES\.map/);
  });

  it("offers no template whose reward can't be received", async () => {
    for (const template of Object.values(TEMPLATES_BY_CADENCE).flat()) {
      expect(isMissionRewardAvailable(template.rewardType), template.id).toBe(true);
    }

    pointsConfig.getPointsConfig.mockResolvedValue(config());
    const response = await missionEditorLoader(
      args("https://app.test/app/rewards/missions/new", undefined, { id: "new" }),
    );
    const data = await response.json();
    for (const template of Object.values(data.templates).flat() as Array<{ rewardType: string }>) {
      expect(isMissionRewardAvailable(template.rewardType)).toBe(true);
    }
  });

  it.each([
    ["POINTS", { amount: 100 }],
    ["STORE_CREDIT", { amount: 100 }],
    ["DISCOUNT", { type: "percentage", value: 15 }],
    // What the editor saves for a tier upgrade: it has no tier field
    ["TIER_UPGRADE", {}],
  ] as const)(
    "refuses to save a %s reward without touching the database",
    async (rewardType, rewardValue) => {
      await expect(
        setChallengeReward("challenge-1", SHOP, { rewardType, rewardValue, description: "x" }),
      ).rejects.toThrow(/can't be a mission reward yet/);
      expect(prisma.challenge.findFirst).not.toHaveBeenCalled();
      expect(prisma.challengeReward.create).not.toHaveBeenCalled();
      expect(prisma.challengeReward.update).not.toHaveBeenCalled();
    },
  );

  it.each(["ACTIVE", "SCHEDULED"] as const)("won't make a discount mission %s", async (status) => {
    prisma.challenge.findFirst.mockResolvedValue({
      id: "challenge-1",
      shop: SHOP,
      status: "DRAFT",
      endsAt: new Date(Date.now() + 86_400_000),
      reward: { rewardType: "DISCOUNT", rewardValue: { type: "percentage", value: 15 } },
    });

    await expect(transitionChallengeStatus("challenge-1", SHOP, status)).rejects.toThrow(
      /Discount codes can't be a mission reward yet/,
    );
    expect(prisma.challenge.update).not.toHaveBeenCalled();
  });

  it.each(["ACTIVE", "SCHEDULED"] as const)("won't make a tier-upgrade mission with no tier %s", async (status) => {
    prisma.challenge.findFirst.mockResolvedValue({
      id: "challenge-1",
      shop: SHOP,
      status: "DRAFT",
      endsAt: new Date(Date.now() + 86_400_000),
      reward: { rewardType: "TIER_UPGRADE", rewardValue: {} },
    });

    await expect(transitionChallengeStatus("challenge-1", SHOP, status)).rejects.toThrow(
      /Tier upgrades can't be a mission reward yet/,
    );
    expect(prisma.challenge.update).not.toHaveBeenCalled();
  });

  it("still activates a mission with a custom reward", async () => {
    prisma.challenge.findFirst.mockResolvedValue({
      id: "challenge-1",
      shop: SHOP,
      status: "DRAFT",
      endsAt: new Date(Date.now() + 86_400_000),
      reward: { rewardType: "CUSTOM", rewardValue: {} },
    });
    prisma.challenge.update.mockResolvedValue({ id: "challenge-1", status: "ACTIVE", reward: null });

    await transitionChallengeStatus("challenge-1", SHOP, "ACTIVE");

    expect(prisma.challenge.update).toHaveBeenCalled();
  });

  it("lets a merchant open missions without switching points on", async () => {
    pointsConfig.getPointsConfig.mockResolvedValue(config({ challengesEnabled: true }));
    prisma.challenge.findMany.mockResolvedValue([]);
    missionStats.getMissionAnalytics.mockRejectedValue(new Error("no analytics"));

    const response = await missionsLoader(args("https://app.test/app/rewards/missions"));

    await expect(response.json()).resolves.toMatchObject({ missionsEnabled: true });
  });
});

describe("points", () => {
  it("can't be switched on from the rewards overview", async () => {
    pointsConfig.getPointsConfig.mockResolvedValue(config({ isEnabled: false }));

    const response = await overviewAction(post("https://app.test/app/rewards", { intent: "toggle" }));

    expect(response.status).toBe(400);
    expect(pointsConfig.updatePointsConfig).not.toHaveBeenCalled();
  });

  it("can still be switched off from the rewards overview", async () => {
    pointsConfig.getPointsConfig.mockResolvedValue(config({ isEnabled: true }));

    await overviewAction(post("https://app.test/app/rewards", { intent: "toggle" }));

    expect(pointsConfig.updatePointsConfig).toHaveBeenCalledWith(SHOP, { isEnabled: false });
  });

  it("sends the Points setup page back to the rewards overview", async () => {
    for (const call of [
      pointsSetupLoader(args(`https://app.test/app/rewards/config${EMBEDDED}`)),
      pointsSetupAction(post(`https://app.test/app/rewards/config${EMBEDDED}`, { intent: "save", isEnabled: "true" })),
    ]) {
      const response: Response = await call.then(
        () => {
          throw new Error("expected a redirect");
        },
        (thrown: Response) => thrown,
      );
      expect(response.status).toBe(302);
      // Keeps shop and host, or the admin would show the login page
      expect(response.headers.get("Location")).toBe(`/app/rewards${EMBEDDED}`);
    }
    expect(pointsConfig.updatePointsConfig).not.toHaveBeenCalled();
  });

  it("are left out of the storefront widget even when PointsConfig says they're on", async () => {
    prisma.customer.findUnique.mockResolvedValue({
      id: "customer-1",
      shopifyCustomerId: "1",
      email: "shopper@example.com",
      storeCredit: 0,
      totalCashbackEarned: 0,
      pointsBalance: 120,
      lifetimePoints: 120,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: null,
      tierState: null,
    });
    prisma.shopSettings.findUnique.mockResolvedValue(null);
    prisma.pointsConfig.findUnique.mockResolvedValue({ isEnabled: true, currencyName: "Point", currencyNamePlural: "Points" });
    prisma.tier.findMany.mockResolvedValue([]);

    const response = await proxyLoader(
      args(`https://app.test/api/proxy/membership?shop=${SHOP}&logged_in_customer_id=1`, undefined, {
        "*": "membership",
      }),
    );

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.points).toBeNull();
    expect(pointsEvents.getActiveEvents).not.toHaveBeenCalled();
  });

  it("the old redeem endpoint says points can't be spent, not that they buy raffles", async () => {
    for (const response of [
      await redeemAction(args("https://app.test/api/customer-account/points/redeem", { method: "POST" })),
      await redeemLoader(args("https://app.test/api/customer-account/points/redeem")),
    ]) {
      expect(response.status).toBe(410);
      const body = await response.json();
      expect(body).toEqual({ success: false, error: "Points can't be spent yet." });
    }
    expect(read("app/routes/api.customer-account.points.redeem.tsx")).not.toMatch(/raffle|mystery/i);
  });
});

describe("gift cards", () => {
  it("send the gift cards page back to Customers", async () => {
    for (const call of [
      giftCardsLoader(args(`https://app.test/app/members/gift-cards${EMBEDDED}`)),
      giftCardsAction(post(`https://app.test/app/members/gift-cards${EMBEDDED}`, { intent: "createBundle" })),
    ]) {
      const response: Response = await call.then(
        () => {
          throw new Error("expected a redirect");
        },
        (thrown: Response) => thrown,
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(`/app/members${EMBEDDED}`);
    }
  });
});

describe("AI email assistant", () => {
  it("refuses requests even when an API key is set", async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "set-but-unused";
    try {
      const response = await aiAction(
        args("https://app.test/api/ai-email-assistant", {
          method: "POST",
          body: JSON.stringify({ action: "generate", prompt: "hi", context: {} }),
        }),
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "The AI writing assistant isn't available." });
    } finally {
      if (before === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = before;
    }
  });
});
