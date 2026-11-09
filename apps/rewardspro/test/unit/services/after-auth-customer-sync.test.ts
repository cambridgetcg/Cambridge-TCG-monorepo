import { beforeEach, describe, expect, it, vi } from "vitest";

// shopifyApp is replaced so the real afterAuth hook from shopify.server can be called directly.
const shopifyConfig = vi.hoisted(() => ({ current: null as any }));
vi.mock("@shopify/shopify-app-remix/adapters/node", () => ({}));
vi.mock("@shopify/shopify-app-remix/server", () => ({
  ApiVersion: { January25: "2025-01" },
  AppDistribution: { AppStore: "app_store" },
  BillingInterval: { Every30Days: "EVERY_30_DAYS", Annual: "ANNUAL" },
  shopifyApp: vi.fn((config: unknown) => {
    shopifyConfig.current = config;
    return { addDocumentResponseHeaders: vi.fn(), authenticate: {}, unauthenticated: {}, login: vi.fn(), sessionStorage: {} };
  }),
}));
vi.mock("~/utils/session-storage.server", () => ({ EncryptedPrismaSessionStorage: class {} }));
vi.mock("~/db.server", () => ({
  default: {
    shopSettings: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("~/services/background-customer-sync.server", () => ({ syncCustomersInBackground: vi.fn() }));
vi.mock("~/utils/wait-until.server", () => ({ waitUntil: vi.fn() }));

import prisma from "~/db.server";
import { syncCustomersInBackground } from "~/services/background-customer-sync.server";
import { waitUntil } from "~/utils/wait-until.server";
import "~/shopify.server";

const SHOP = "new-shop.myshopify.com";
const admin = {
  graphql: vi.fn(async () => ({
    json: async () => ({ data: { shop: { name: "New Shop", currencyCode: "GBP", ianaTimezone: "Europe/London", url: `https://${SHOP}` } } }),
  })),
};

function afterAuth() {
  return shopifyConfig.current.hooks.afterAuth({ session: { shop: SHOP }, admin });
}

describe("initial customer sync after install", () => {
  beforeEach(() => {
    vi.mocked(prisma.shopSettings.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.shopSettings.create).mockImplementation(async (args: any) => args.data);
  });

  it("is handed to Vercel's waitUntil, so it is not cut off when the install response is sent", async () => {
    let finishSync!: () => void;
    vi.mocked(syncCustomersInBackground).mockReturnValue(new Promise<void>((resolve) => (finishSync = resolve)));

    await afterAuth();

    expect(syncCustomersInBackground).toHaveBeenCalledWith(SHOP, admin);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const kept = vi.mocked(waitUntil).mock.calls[0][0];
    let settled = false;
    void kept.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    finishSync();
    await kept;
    expect(settled).toBe(true);
  });

  it("hands over a promise that never rejects when the sync fails", async () => {
    vi.mocked(syncCustomersInBackground).mockRejectedValue(new Error("Shopify unavailable"));

    await afterAuth();

    await expect(vi.mocked(waitUntil).mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("does not start again once the shop's customers were synced", async () => {
    vi.mocked(prisma.shopSettings.findUnique).mockResolvedValue({ shop: SHOP, customersInitialSynced: true, storeCurrency: "GBP", timezone: "Europe/London" } as any);

    await afterAuth();

    expect(syncCustomersInBackground).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
