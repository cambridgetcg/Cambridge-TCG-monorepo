import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The crons vercel.json schedules: only the jobs the free app needs, and each
 * one refuses a caller without the cron secret before it touches anything.
 */

// Records any use of the database or Shopify; nothing may be touched before auth
const touched = vi.hoisted(() => [] as string[]);
const untouchable = vi.hoisted(
  () => (name: string) =>
    new Proxy(
      {},
      {
        get(_target, property) {
          if (typeof property === "symbol" || property === "then" || property === "__esModule") {
            return undefined;
          }
          touched.push(`${name}.${property}`);
          throw new Error(`${name}.${property} used before cron auth`);
        },
      },
    ),
);

vi.mock("~/db.server", () => {
  const db = untouchable("db");
  return { default: db, db, prisma: db };
});
vi.mock("~/shopify.server", () => ({
  authenticate: untouchable("authenticate"),
  unauthenticated: untouchable("unauthenticated"),
}));

type CronLoader = (args: { request: Request; params: object; context: object }) => Promise<Response>;

// Each kept job, and why the free app needs it
const SCHEDULED_CRONS: Record<string, () => Promise<{ loader: unknown }>> = {
  // Ends one-time memberships when they run out, and warns shoppers before
  "/api/cron/tier-maintenance": () => import("~/routes/api.cron.tier-maintenance"),
  // Recalculates tiers for shops that switched on automatic recalculation
  "/api/cron/tier-recalculation": () => import("~/routes/api.cron.tier-recalculation"),
  // Retries automatic cashback that Shopify didn't take the first time
  "/api/cron/cashback-reconciliation": () => import("~/routes/api.cron.cashback-reconciliation"),
  // Sends the email campaigns merchants schedule
  "/api/cron/scheduled-campaigns": () => import("~/routes/api.cron.scheduled-campaigns"),
  // Deletes expired sessions (the privacy policy promises it)
  "/api/cron/session-cleanup": () => import("~/routes/api.cron.session-cleanup"),
  // Deletes old webhook records and expired data-request reports (privacy policy)
  "/api/cron/webhook-cleanup": () => import("~/routes/api.cron.webhook-cleanup"),
  // Permanently deletes membership products 30 days after a merchant deletes them
  "/api/cron/tier-product-cleanup": () => import("~/routes/api.cron.tier-product-cleanup"),
  // Starts and closes the missions merchants schedule in the admin
  "/api/cron/mission-status": () => import("~/routes/api.cron.mission-status"),
};

// Cron routes left unscheduled on purpose, and why. The route files stay.
const UNSCHEDULED_CRONS: Record<string, string> = {
  "/api/cron/monthly-reset":
    "Usage rows are per month and made on first use, and capacity is advisory, so nothing needs resetting",
  "/api/cron/exchange-rates": "Nothing reads the rates it fetches",
  "/api/cron/metrics": "It only writes per-shop counts to the logs",
  "/api/cron/session-health": "Its only output is alerts that no page reads",
  "/api/cron/store-credit-reconciliation":
    "It compares two local numbers and logs shoppers' email addresses; it never checks Shopify or fixes anything",
  "/api/cron/subscription-expiry":
    "With the billing webhook off nothing refreshes a paid agreement's period end, so it would mark a still-billed agreement EXPIRED",
  "/api/cron/billing-reconciliation":
    "Entitlements read AppSubscription first; this only copies it into two other tables or logs rows nothing reads",
  "/api/cron/subscription-reconciliation": "Memberships are one-time purchases, so no TierSubscription row is ever created",
  "/api/cron/points-maintenance": "Points are off (FEATURES_AVAILABLE.points)",
  "/api/cron/mission-generator": "Nothing creates the mission templates it makes missions from",
  "/api/cron/raffle-status": "Raffles are paused (CHANCE_MECHANICS_PAUSED)",
  "/api/cron/raffle-draw": "Raffles are paused (CHANCE_MECHANICS_PAUSED)",
  "/api/cron/mystery-box-status": "Mystery boxes are paused (CHANCE_MECHANICS_PAUSED)",
  "/api/cron/mystery-box-delivery": "Mystery boxes are paused, so no winner is waiting for delivery",
  "/api/cron/usage-billing": "A tombstone: fixed prices have no usage charges",
  "/api/cron/webhook-reconciliation": "It needs a ?shop= parameter, so it's run by hand for one shop",
};

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};
const scheduledPaths = vercelConfig.crons.map((cron) => cron.path);

describe("scheduled crons", () => {
  it("schedules only the jobs the free app needs", () => {
    expect([...scheduledPaths].sort()).toEqual(Object.keys(SCHEDULED_CRONS).sort());
  });

  it.each(scheduledPaths)("%s is scheduled once and has a route", (path) => {
    expect(scheduledPaths.filter((scheduled) => scheduled === path)).toHaveLength(1);
    const name = path.replace("/api/cron/", "");
    expect(existsSync(resolve(process.cwd(), `app/routes/api.cron.${name}.tsx`))).toBe(true);
  });

  it("has a decision for every cron route", () => {
    const routePaths = readdirSync(resolve(process.cwd(), "app/routes"))
      .flatMap((file) => /^api\.cron\.(.+)\.tsx$/.exec(file)?.slice(1) ?? [])
      .map((name) => `/api/cron/${name}`)
      .sort();

    expect([...Object.keys(SCHEDULED_CRONS), ...Object.keys(UNSCHEDULED_CRONS)].sort()).toEqual(routePaths);
  });

  // Logs record identifiers, not contact data (the privacy policy says so)
  it.each(scheduledPaths)("%s logs no shopper contact data", (path) => {
    const name = path.replace("/api/cron/", "");
    const source = readFileSync(resolve(process.cwd(), `app/routes/api.cron.${name}.tsx`), "utf8");

    expect(logCalls(source).filter((call) => CONTACT_DATA.test(call))).toEqual([]);
  });
});

const CONTACT_DATA = /\.(?:email|firstName|lastName|phone)\b|\b(?:email|firstName|lastName|phone)\s*:/;

// The full text of every log() and console.*() call in a source file
function logCalls(source: string): string[] {
  return [...source.matchAll(/\b(?:log|console\.(?:log|info|warn|error|debug))\(/g)].map((match) => {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")" && --depth === 0) break;
    }
    return source.slice(match.index, end + 1);
  });
}

describe("scheduled crons refuse callers without the cron secret", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "the-cron-secret";
    touched.length = 0;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  const unauthenticatedHeaders: Array<[string, Record<string, string>]> = [
    ["no credentials", {}],
    ["a wrong bearer token", { Authorization: "Bearer not-the-cron-secret" }],
    ["the secret without Bearer", { Authorization: "the-cron-secret" }],
    ["only Vercel's cron marker header", { "x-vercel-cron": "1", "user-agent": "vercel-cron/1.0" }],
  ];

  it.each(Object.entries(SCHEDULED_CRONS))("%s answers 401 and touches nothing", async (path, load) => {
    const { loader } = (await load()) as { loader: CronLoader };
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const [, headers] of unauthenticatedHeaders) {
      const response = await loader({
        request: new Request(`https://rewardspro.test${path}`, { headers }),
        params: {},
        context: {},
      });
      expect(response.status).toBe(401);
    }

    expect(touched).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
