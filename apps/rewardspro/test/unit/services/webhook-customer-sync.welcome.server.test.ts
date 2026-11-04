import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../mocks/server";

// The welcome email is for shoppers created after install: customers/create.
// Customers RewardsPro first meets another way (customers/update, a bulk sync,
// the first sync after install) were already the store's customers.

const SHOP = "test-shop.myshopify.com";

const prisma = vi.hoisted(() => ({
  customer: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  shopSettings: { upsert: vi.fn(), update: vi.fn() },
  tier: { findUnique: vi.fn(), findMany: vi.fn() },
}));

vi.mock("~/db.server", () => ({ default: prisma }));
vi.mock("~/services/email-notifications.server", () => ({ sendWelcomeEmailNotification: vi.fn() }));
vi.mock("~/services/automation-trigger.server", () => ({ processAutomationTrigger: vi.fn() }));
vi.mock("~/services/tier-resolution.server", () => ({
  updateCustomerToEffectiveTier: vi.fn(async () => ({ changed: false, source: "SPENDING", newTierId: null })),
}));
vi.mock("~/services/klaviyo.server", () => ({ isKlaviyoEnabled: vi.fn(async () => false) }));

import { sendWelcomeEmailNotification } from "~/services/email-notifications.server";
import { processAutomationTrigger } from "~/services/automation-trigger.server";
import {
  handleCustomerCreate,
  handleCustomerUpdate,
  syncBulkCustomers,
} from "~/services/webhook-customer-sync.server";
import { syncCustomersInBackground } from "~/services/background-customer-sync.server";

const payload = (id: number) => ({
  id,
  email: `shopper-${id}@example.test`,
  first_name: "Sam",
  last_name: "Shopper",
  total_spent: "0.00",
  orders_count: 0,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-11-04T10:00:00Z",
});

/** No customer stored yet; create and update hand back what they were given. */
function emptyStore() {
  prisma.customer.findFirst.mockResolvedValue(null);
  prisma.customer.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
  prisma.customer.findUnique.mockResolvedValue({ totalRefunded: 0, acceptsMarketing: false, marketingConsentUpdatedAt: null });
  prisma.customer.update.mockResolvedValue({});
}

const welcomeTriggers = () =>
  vi.mocked(processAutomationTrigger).mock.calls.filter(([event]) => event.type === "welcome");

describe("welcome email: only for shoppers created after install", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    emptyStore();
  });

  it("customers/create for a new shopper sends the welcome email (if the merchant turned it on)", async () => {
    await handleCustomerCreate(payload(1), SHOP);

    expect(sendWelcomeEmailNotification).toHaveBeenCalledTimes(1);
    expect(sendWelcomeEmailNotification).toHaveBeenCalledWith(
      SHOP,
      expect.objectContaining({ email: "shopper-1@example.test" }),
      null,
    );
    expect(welcomeTriggers()).toHaveLength(1);
  });

  it("customers/create for a shopper already stored sends no welcome", async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: "stored-1", shop: SHOP, shopifyCustomerId: "1" });

    await handleCustomerCreate(payload(1), SHOP);

    expect(sendWelcomeEmailNotification).not.toHaveBeenCalled();
    expect(welcomeTriggers()).toHaveLength(0);
  });

  it("customers/update for an existing customer RewardsPro hasn't seen stores them but sends no welcome", async () => {
    await handleCustomerUpdate(payload(2), SHOP);

    expect(prisma.customer.create).toHaveBeenCalledTimes(1);
    expect(sendWelcomeEmailNotification).not.toHaveBeenCalled();
    expect(welcomeTriggers()).toHaveLength(0);
  });

  it("a bulk sync stores customers without welcoming any", async () => {
    await syncBulkCustomers([payload(3), payload(4)], SHOP);

    expect(prisma.customer.create).toHaveBeenCalledTimes(2);
    expect(sendWelcomeEmailNotification).not.toHaveBeenCalled();
    expect(welcomeTriggers()).toHaveLength(0);
  });

  it("the first customer sync after install emails nobody", async () => {
    const mail: unknown[] = [];
    server.use(
      http.post("https://api.sendgrid.com/v3/mail/send", async ({ request }) => {
        mail.push(await request.json());
        return new HttpResponse(null, { status: 202 });
      }),
    );
    prisma.shopSettings.upsert.mockResolvedValue({});
    prisma.shopSettings.update.mockResolvedValue({});
    const node = (n: number) => ({
      id: `gid://shopify/Customer/${n}`,
      email: `existing-${n}@example.test`,
      displayName: "Existing",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2026-11-04T00:00:00Z",
      emailMarketingConsent: { marketingState: "SUBSCRIBED", consentUpdatedAt: "2025-01-01T00:00:00Z" },
    });
    const admin = {
      graphql: vi.fn(async () =>
        Response.json({
          data: {
            customers: {
              edges: [{ cursor: "a", node: node(5) }, { cursor: "b", node: node(6) }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      ),
    };

    await syncCustomersInBackground(SHOP, admin);

    expect(prisma.customer.create).toHaveBeenCalledTimes(2);
    expect(sendWelcomeEmailNotification).not.toHaveBeenCalled();
    expect(processAutomationTrigger).not.toHaveBeenCalled();
    expect(mail).toEqual([]);
  });
});
