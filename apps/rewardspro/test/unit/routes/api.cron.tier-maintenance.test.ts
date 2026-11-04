import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily tier-maintenance cron: it ends memberships that ran out and warns
 * shoppers before they do. It must not write tier history that didn't happen,
 * and it must not put shoppers' email addresses into the logs.
 */

const db = vi.hoisted(() => ({
  tierSubscription: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  tierPurchase: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
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

const gold = { id: "tier-gold", name: "Gold", minSpend: 500, cashbackPercent: 5, pointsMultiplier: null, benefits: null };
const silver = { id: "tier-silver", name: "Silver", minSpend: 100, cashbackPercent: 2, pointsMultiplier: null, benefits: null };

/** A Gold membership that ran out yesterday */
const endedGold = () => ({
  id: "purchase-1",
  shop: SHOP,
  customerId: "customer-1",
  tierId: gold.id,
  status: "ACTIVE",
  endDate: daysFromNow(-1),
  customer: { email: "member@example.com", firstName: "Sam" },
  tier: gold,
});

const resolvedTo = (newTierId: string | null) => ({
  success: true,
  changed: newTierId !== gold.id,
  previousTierId: gold.id,
  newTierId,
  source: newTierId ? "SPENDING_BASED" : "NONE",
});

async function runCronForJson() {
  const response = await runCron();
  return { status: response.status, body: await response.json() };
}

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
  tierResolution.updateCustomerToEffectiveTier.mockReset().mockResolvedValue({ success: true, changed: false, newTierId: null });
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

  it("sends no membership-ended email to a shopper who keeps the tier", async () => {
    // Renewed, or a manual tier or their spending holds Gold
    db.tierPurchase.findMany.mockResolvedValueOnce([endedGold()]);
    tierResolution.updateCustomerToEffectiveTier.mockResolvedValue(resolvedTo(gold.id));

    const { status, body } = await runCronForJson();

    expect(status).toBe(200);
    expect(db.tierPurchase.update).toHaveBeenCalledWith({ where: { id: "purchase-1" }, data: { status: "EXPIRED" } });
    expect(email.sendTierExpiredEmail).not.toHaveBeenCalled();
    expect(body.summary).toMatchObject({ expiredMemberships: 1, errorCount: 0 });
  });

  it("names the tier the shopper moves to when a membership ends", async () => {
    db.tierPurchase.findMany.mockResolvedValueOnce([endedGold()]);
    tierResolution.updateCustomerToEffectiveTier.mockResolvedValue(resolvedTo(silver.id));
    db.tier.findFirst.mockResolvedValue({ name: silver.name });

    await runCron();

    expect(db.tier.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: silver.id, shop: SHOP } }));
    expect(email.sendTierExpiredEmail).toHaveBeenCalledWith(
      SHOP,
      expect.objectContaining({ expiredTierName: "Gold", newTierName: "Silver" }),
    );
  });

  it("says the membership was removed only when the shopper is left with no tier", async () => {
    db.tierPurchase.findMany.mockResolvedValueOnce([endedGold()]);
    tierResolution.updateCustomerToEffectiveTier.mockResolvedValue(resolvedTo(null));

    await runCron();

    expect(email.sendTierExpiredEmail).toHaveBeenCalledWith(SHOP, expect.objectContaining({ newTierName: null }));
  });

  it("puts a membership back to ACTIVE, counts an error, emails nobody and answers 500 when its tier can't be re-resolved", async () => {
    db.tierPurchase.findMany.mockResolvedValueOnce([endedGold()]);
    tierResolution.updateCustomerToEffectiveTier.mockResolvedValue({
      success: false,
      changed: false,
      previousTierId: null,
      newTierId: null,
      source: "NONE",
      error: "connection reset",
    });

    const { status, body } = await runCronForJson();

    // A failed answer is what the cron monitor and Vercel's logs show as a
    // failed run; a Slack alert needs SLACK_WEBHOOK_URL, which may not be set
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(db.tierPurchase.update.mock.calls).toEqual([
      [{ where: { id: "purchase-1" }, data: { status: "EXPIRED" } }],
      [{ where: { id: "purchase-1" }, data: { status: "ACTIVE" } }],
    ]);
    expect(email.sendTierExpiredEmail).not.toHaveBeenCalled();
    expect(body.summary).toMatchObject({ expiredMemberships: 0, errorCount: 1 });
  });

  it("puts a subscription back as it was when its tier can't be re-resolved", async () => {
    const endDate = daysFromNow(-1);
    db.tierSubscription.findMany.mockResolvedValueOnce([
      { id: "subscription-1", shop: SHOP, customerId: "customer-1", endDate, customer: {}, tier: gold },
    ]);
    tierResolution.updateCustomerToEffectiveTier.mockResolvedValue({ success: false, error: "connection reset" });

    const { body } = await runCronForJson();

    expect(db.tierSubscription.update).toHaveBeenLastCalledWith({
      where: { id: "subscription-1" },
      data: { status: "ACTIVE", endDate },
    });
    expect(body.summary).toMatchObject({ expiredMemberships: 0, errorCount: 1 });
  });

  it("doesn't warn a shopper whose membership goes on through another one that lasts longer", async () => {
    const ending = { ...endedGold(), endDate: daysFromNow(7), tierProduct: null };
    db.tierPurchase.findMany
      .mockResolvedValueOnce([]) // memberships that already ran out
      .mockResolvedValueOnce([ending]) // 7 days left
      .mockResolvedValueOnce([]); // 1 day left
    // They bought Gold again, which ends in 37 days
    db.tierPurchase.findFirst.mockResolvedValue({ id: "purchase-2" });

    await runCron();

    expect(db.tierPurchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shop: SHOP,
          customerId: "customer-1",
          id: { not: "purchase-1" },
          status: "ACTIVE",
          tier: { is: { minSpend: { gte: gold.minSpend } } },
          OR: [{ endDate: null }, { endDate: { gt: ending.endDate } }],
        },
      }),
    );
    expect(email.sendTierExpirationWarningEmail).not.toHaveBeenCalled();
  });

  it("doesn't warn a shopper with a subscription to the same or a higher tier that lasts longer", async () => {
    const ending = { ...endedGold(), endDate: daysFromNow(1), tierProduct: null };
    db.tierPurchase.findMany
      .mockResolvedValueOnce([]) // memberships that already ran out
      .mockResolvedValueOnce([]) // 7 days left
      .mockResolvedValueOnce([ending]); // 1 day left
    db.tierSubscription.findFirst.mockResolvedValue({ id: "subscription-1" });

    await runCron();

    expect(db.tierSubscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shop: SHOP,
          customerId: "customer-1",
          status: "ACTIVE",
          tier: { is: { minSpend: { gte: gold.minSpend } } },
          OR: [{ endDate: null }, { endDate: { gt: ending.endDate } }],
        },
      }),
    );
    expect(email.sendTierExpirationWarningEmail).not.toHaveBeenCalled();
  });

  it("answers 500 when the whole job fails", async () => {
    db.tierSubscription.findMany.mockRejectedValue(new Error("database unavailable"));

    const response = await runCron();

    expect(response.status).toBe(500);
    expect(cronLock.releaseCronLock).toHaveBeenCalledWith("lock-1");
  });

  it("counts a tier mismatch as repaired only when the repair worked, newest mismatches first", async () => {
    db.$queryRaw.mockResolvedValue([
      { id: "customer-1", shop: SHOP, currentTierId: gold.id, effectiveTierId: silver.id },
      { id: "customer-2", shop: SHOP, currentTierId: gold.id, effectiveTierId: null },
    ]);
    tierResolution.updateCustomerToEffectiveTier
      .mockResolvedValueOnce(resolvedTo(silver.id))
      .mockResolvedValueOnce({ success: false, error: "connection reset" });

    const { body } = await runCronForJson();

    expect(body.summary).toMatchObject({ consistencyRepairs: 1, errorCount: 1 });
    const sql = (db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toMatch(/ORDER BY c\."updatedAt" DESC, c\.id\s+LIMIT 100/);
  });
});
