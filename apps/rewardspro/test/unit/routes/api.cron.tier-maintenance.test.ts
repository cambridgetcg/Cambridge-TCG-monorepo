import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily tier-maintenance cron: it ends memberships that ran out and warns
 * shoppers before they do. It must not write tier history that didn't happen,
 * and it must not put shoppers' email addresses into the logs.
 */

const db = vi.hoisted(() => ({
  tierSubscription: { findMany: vi.fn(), update: vi.fn() },
  tierPurchase: { findMany: vi.fn(), update: vi.fn() },
  emailEvent: { findFirst: vi.fn() },
  customer: { findMany: vi.fn() },
  tier: { findFirst: vi.fn() },
  tierChangeLog: { findFirst: vi.fn(), create: vi.fn() },
  $queryRaw: vi.fn(),
}));

const email = vi.hoisted(() => ({
  sendTierExpirationWarningEmail: vi.fn(),
  sendTierExpiredEmail: vi.fn(),
}));

const tierResolution = vi.hoisted(() => ({ updateCustomerToEffectiveTier: vi.fn() }));

const cronLock = vi.hoisted(() => ({
  acquireCronLock: vi.fn(),
  releaseCronLock: vi.fn(),
  cleanupExpiredLocks: vi.fn(),
}));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));
vi.mock("~/services/email-notifications.server", () => email);
vi.mock("~/services/tier-resolution.server", () => tierResolution);
vi.mock("~/services/cron-lock.server", () => cronLock);

import { loader } from "~/routes/api.cron.tier-maintenance";

const SHOP = "shop.myshopify.com";
const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const gold = { id: "tier-gold", name: "Gold", cashbackPercent: 5, pointsMultiplier: null, benefits: null };
const silver = { id: "tier-silver", name: "Silver", cashbackPercent: 2, pointsMultiplier: null, benefits: null };

function runCron() {
  return loader({
    request: new Request("https://rewardspro.test/api/cron/tier-maintenance", {
      headers: { Authorization: "Bearer the-cron-secret" },
    }),
    params: {},
    context: {},
  });
}

const logged: string[] = [];
const record = (...args: unknown[]) => {
  logged.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
};
const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  for (const model of Object.values(db)) {
    if (typeof model === "function") model.mockReset().mockResolvedValue([]);
    else for (const method of Object.values(model)) method.mockReset().mockResolvedValue(null);
  }
  db.tierSubscription.findMany.mockResolvedValue([]);
  db.tierPurchase.findMany.mockResolvedValue([]);
  db.customer.findMany.mockResolvedValue([]);
  email.sendTierExpirationWarningEmail.mockReset().mockResolvedValue({ success: true });
  email.sendTierExpiredEmail.mockReset().mockResolvedValue({ success: true });
  tierResolution.updateCustomerToEffectiveTier.mockReset().mockResolvedValue({ changed: false });
  cronLock.acquireCronLock.mockReset().mockResolvedValue({ acquired: true, lockId: "lock-1" });
  cronLock.releaseCronLock.mockReset().mockResolvedValue(undefined);
  cronLock.cleanupExpiredLocks.mockReset().mockResolvedValue(undefined);

  logged.length = 0;
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(record);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("tier-maintenance cron", () => {
  it("gives a member who bought a lifetime membership and hasn't ordered since no Downgraded history", async () => {
    // Bought Gold for life (an ACTIVE TierPurchase with no end date), spent
    // nothing else, last ordered two months ago
    const member = {
      id: "customer-1",
      shop: SHOP,
      email: "member@example.com",
      currentTierId: gold.id,
      currentTier: gold,
      currentSubscriptionId: null,
      netSpent: { toNumber: () => 0 },
      totalSpent: { toNumber: () => 0 },
      lastOrderDate: daysFromNow(-60),
    };
    db.customer.findMany.mockResolvedValue([member]);
    db.tier.findFirst.mockResolvedValue({ ...silver, minSpend: 0 });

    const response = await runCron();

    expect(response.status).toBe(200);
    expect(db.tierChangeLog.create).not.toHaveBeenCalled();
    expect(tierResolution.updateCustomerToEffectiveTier).not.toHaveBeenCalled();
  });

  it("logs no shopper email address when it warns that a membership is ending", async () => {
    const purchase = (id: string, customerEmail: string, endsInDays: number) => ({
      id,
      shop: SHOP,
      customerId: `customer-${id}`,
      endDate: daysFromNow(endsInDays),
      customer: { email: customerEmail, firstName: "Sam" },
      tier: gold,
      tierProduct: null,
    });
    db.tierPurchase.findMany
      .mockResolvedValueOnce([]) // memberships that already ran out
      .mockResolvedValueOnce([purchase("a", "warned-now@example.com", 7)]) // 7 days left
      .mockResolvedValueOnce([purchase("b", "warned-before@example.com", 1)]); // 1 day left
    db.emailEvent.findFirst
      .mockResolvedValueOnce(null) // not warned yet: sends
      .mockResolvedValueOnce({ id: "event-1" }); // warned already: skips

    const response = await runCron();

    expect(response.status).toBe(200);
    expect(email.sendTierExpirationWarningEmail).toHaveBeenCalledTimes(1);
    const output = logged.join("\n");
    expect(output).toContain("expiration warning");
    expect(output).toContain("Already sent");
    expect(output).not.toMatch(/@example\.com/);
  });
});
