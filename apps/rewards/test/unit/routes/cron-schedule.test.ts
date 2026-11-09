import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The three jobs vercel.json schedules (plan Decision 17), carried from
 * apps/rewardspro's cron-schedule and cron-monitor schedule tests: the
 * schedules are CRON_SCHEDULES, and each route refuses a caller without the
 * cron secret before it touches the database or Shopify.
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
  return { default: db, db, prisma: db, databaseSchema: "rewards" };
});
vi.mock("~/shopify.server", () => ({
  authenticate: untouchable("authenticate"),
  unauthenticated: untouchable("unauthenticated"),
}));

import { CRON_SCHEDULES, onSchedule, scheduleInterval } from "~/lib/cron.server";

type CronLoader = (args: { request: Request; params: object; context: object }) => Promise<Response>;

// Each job, and what it is for
const SCHEDULED_CRONS: Record<string, () => Promise<{ loader: unknown }>> = {
  // Settles unclear payouts, sends due ones, records missed paid orders (rules 9 and 13)
  "/api/cron/payouts": () => import("~/routes/api.cron.payouts"),
  // Resolves every buyer's tier once a day (rule 10)
  "/api/cron/tiers": () => import("~/routes/api.cron.tiers"),
  // Locks, expired privacy reports, online sessions, offline token refresh
  "/api/cron/housekeeping": () => import("~/routes/api.cron.housekeeping"),
};

const HOUR = 60 * 60 * 1000;

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};
const scheduledPaths = vercelConfig.crons.map((cron) => cron.path);

describe("scheduled jobs", () => {
  it("are the ones CRON_SCHEDULES names, on its schedules", () => {
    const scheduled = Object.fromEntries(vercelConfig.crons.map((cron) => [cron.path.replace("/api/cron/", ""), cron.schedule]));
    expect(scheduled).toEqual(CRON_SCHEDULES);
    expect(CRON_SCHEDULES).toEqual({ payouts: "30 * * * *", tiers: "0 2 * * *", housekeeping: "0 3 * * *" });
  });

  it("each have one route, and every cron route is scheduled", () => {
    const routePaths = readdirSync(resolve(process.cwd(), "app/routes"))
      .flatMap((file) => /^api\.cron\.(.+)\.tsx$/.exec(file)?.slice(1) ?? [])
      .map((name) => `/api/cron/${name}`)
      .sort();
    expect([...scheduledPaths].sort()).toEqual(routePaths);
    expect(routePaths).toEqual(Object.keys(SCHEDULED_CRONS).sort());
  });

  // Logs record identifiers, not contact data
  it.each(scheduledPaths)("%s logs no buyer contact data", (path) => {
    const name = path.replace("/api/cron/", "");
    const source = readFileSync(resolve(process.cwd(), `app/routes/api.cron.${name}.tsx`), "utf8");
    expect(logCalls(source).filter((call) => CONTACT_DATA.test(call))).toEqual([]);
  });

  it("know how often each schedule runs", () => {
    expect(scheduleInterval("30 * * * *")).toBe(HOUR);
    expect(scheduleInterval("0 2 * * *")).toBe(24 * HOUR);
    expect(scheduleInterval("0 5 * * 0")).toBe(7 * 24 * HOUR);
    expect(() => scheduleInterval("*/15 * * * *")).toThrow("Unsupported cron schedule");
    expect(() => scheduleInterval("0 0 1 * *")).toThrow("Unsupported cron schedule");
  });

  it("tell a run that started on its schedule from one started by hand", () => {
    expect(onSchedule("30 * * * *", new Date("2026-11-04T10:30:59Z"))).toBe(true);
    expect(onSchedule("30 * * * *", new Date("2026-11-04T10:34:00Z"))).toBe(true);
    expect(onSchedule("30 * * * *", new Date("2026-11-04T10:36:00Z"))).toBe(false);
    expect(onSchedule("30 * * * *", new Date("2026-11-04T10:29:00Z"))).toBe(false);
    expect(onSchedule("0 3 * * *", new Date("2026-11-04T03:00:30Z"))).toBe(true);
    expect(onSchedule("0 3 * * *", new Date("2026-11-04T09:28:02Z"))).toBe(false);
    expect(onSchedule("0 3 * * *", new Date("2026-11-04T02:59:00Z"))).toBe(false);
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

describe("scheduled jobs refuse callers without the cron secret", () => {
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
      const response = await loader({ request: new Request(`https://rewards.test${path}`, { headers }), params: {}, context: {} });
      expect(response.status).toBe(401);
    }

    expect(touched).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("answers 401 with no CRON_SECRET set, even to an empty bearer", async () => {
    delete process.env.CRON_SECRET;
    const { loader } = (await SCHEDULED_CRONS["/api/cron/payouts"]()) as { loader: CronLoader };
    const response = await loader({
      request: new Request("https://rewards.test/api/cron/payouts", { headers: { Authorization: "Bearer " } }),
      params: {},
      context: {},
    });
    expect(response.status).toBe(401);
    expect(touched).toEqual([]);
  });
});
