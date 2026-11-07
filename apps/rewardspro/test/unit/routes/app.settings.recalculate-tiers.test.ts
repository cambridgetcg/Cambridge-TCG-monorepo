import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Recalculate Now" in Settings resolves every customer's tier, as the
// scheduled run does. It stops before the function's time limit, and it only
// records a complete run (which pushes the next scheduled run a full period
// away) when every customer was resolved.

const SHOP = "settings-recalc.myshopify.com";

const prisma = vi.hoisted(() => ({
  shopSettings: { update: vi.fn() },
}));
const tierManagement = vi.hoisted(() => ({
  recalculateTiersSmart: vi.fn(),
  refreshAnnualSpending: vi.fn(),
}));

vi.mock("~/shopify.server", () => ({
  authenticate: { admin: vi.fn(async () => ({ session: { shop: SHOP }, admin: {}, billing: undefined })) },
}));
vi.mock("~/db.server", () => ({ default: prisma, db: prisma, prisma }));
vi.mock("~/services/tier-management.server", () => tierManagement);

import { action } from "~/routes/app.settings._index";

const recalcResult = (overrides: Record<string, unknown> = {}) => ({
  processed: 10,
  remaining: 0,
  upgraded: 2,
  downgraded: 1,
  unchanged: 7,
  errors: 0,
  complete: true,
  bySource: { manualOverride: 0, tierSubscription: 0, tierPurchase: 0, spendingBased: 10, none: 0 },
  timing: { totalMs: 1200 },
  engine: "LEGACY",
  optimizedPath: false,
  ...overrides,
});

async function recalculateNow() {
  const body = new FormData();
  body.set("intent", "recalculate-tiers");
  const response = await action({
    request: new Request("https://app.test/app/settings", { method: "POST", body }),
    params: {},
    context: {},
  });
  return { status: response.status, body: await response.json() };
}

const stampedLastRun = () =>
  prisma.shopSettings.update.mock.calls.some(([args]) => "tierRecalculationLastRun" in (args?.data ?? {}));

beforeEach(() => {
  prisma.shopSettings.update.mockReset().mockResolvedValue({});
  tierManagement.recalculateTiersSmart.mockReset().mockResolvedValue(recalcResult());
  tierManagement.refreshAnnualSpending
    .mockReset()
    .mockResolvedValue({ processed: 10, updated: 0, errors: 0, duration: 5, complete: true });
  for (const method of ["log", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Settings: Recalculate Now", () => {
  it("stops before the function's time limit, and refreshes annual spending after the tiers", async () => {
    const start = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(start);

    await recalculateNow();

    expect(tierManagement.recalculateTiersSmart).toHaveBeenCalledWith(SHOP, { deadline: start + 240_000 });
    expect(tierManagement.refreshAnnualSpending).toHaveBeenCalledWith(SHOP, { deadline: start + 240_000 });
    expect(tierManagement.refreshAnnualSpending.mock.invocationCallOrder[0])
      .toBeGreaterThan(tierManagement.recalculateTiersSmart.mock.invocationCallOrder[0]);
  });

  it("records a complete run and says what changed when every customer was resolved", async () => {
    const { body } = await recalculateNow();

    expect(stampedLastRun()).toBe(true);
    expect(body).toMatchObject({ success: true, recalculationComplete: true });
    expect(body.message).toBe("Tier recalculation completed (1.2s): 2 upgraded, 1 downgraded, 7 unchanged");
  });

  it("still reports the tiers it updated when the annual-spending refresh after them fails", async () => {
    tierManagement.refreshAnnualSpending.mockRejectedValue(new Error("connection reset"));

    const { body } = await recalculateNow();

    expect(stampedLastRun()).toBe(true);
    expect(body).toMatchObject({ success: true, message: "Tier recalculation completed (1.2s): 2 upgraded, 1 downgraded, 7 unchanged" });
  });

  it("doesn't record a complete run, and says so, when some customers couldn't be updated", async () => {
    tierManagement.recalculateTiersSmart.mockResolvedValue(recalcResult({ errors: 3, unchanged: 4 }));

    const { body } = await recalculateNow();

    expect(stampedLastRun()).toBe(false);
    expect(body).toMatchObject({ success: false, recalculationComplete: true });
    expect(body.error).toBe(
      "3 customers couldn't be updated and keep their current tier. Press Recalculate Now to try them again. " +
        "The others: 2 upgraded, 1 downgraded, 4 unchanged.",
    );
  });

  it("doesn't record a complete run when the time ran out, and says how to carry on", async () => {
    tierManagement.recalculateTiersSmart.mockResolvedValue(recalcResult({ complete: false, remaining: 1 }));

    const { body } = await recalculateNow();

    expect(stampedLastRun()).toBe(false);
    expect(body).toMatchObject({ success: true, recalculationComplete: true });
    expect(body.message).toBe(
      "Tier recalculation stopped at the time limit: 2 upgraded, 1 downgraded, 7 unchanged. " +
        "1 customer wasn't reached and keeps their current tier. Press Recalculate Now again to carry on with them.",
    );
  });
});

describe("Settings: what the Tier Automation tab says about recalculation", () => {
  const source = readFileSync(resolve(__dirname, "../../../app/routes/app.settings._index.tsx"), "utf8");

  it("claims no grace period before downgrades: the tier rules have none", () => {
    expect(source).not.toMatch(/grace period/i);
    expect(source).toContain(
      "Recalculation respects manual tier overrides and memberships, uses your tier's evaluation period (Annual/Lifetime), and logs all changes.",
    );
  });

  it("shows the last complete run, and says a run is due rather than showing a date that has passed", () => {
    expect(source).toContain("Last complete run: {formatDate(settings.tierRecalculationLastRun)}");
    expect(source).toContain('"due, runs at 09:00 UTC"');
    expect(source).toContain("No complete run yet");
    expect(source).not.toContain("This runs in the background");
  });
});
