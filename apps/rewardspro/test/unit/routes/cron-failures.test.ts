import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vercel shows a cron run as failed only when it answers 5xx, and it neither
 * retries nor alerts. Every scheduled cron answers 500 when its job fails,
 * records the failure, and sends the real error to Sentry.
 */

const DATABASE_DOWN = "database down";

// The database is down for the job's own work; the lock and the run records still work
const records = vi.hoisted(() => ({ upsert: vi.fn(), findMany: vi.fn() }));
const locks = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() }));
const db = vi.hoisted(
  () =>
    new Proxy({} as Record<string, unknown>, {
      get(_target, property) {
        if (typeof property === "symbol" || property === "then" || property === "__esModule") return undefined;
        if (property === "syncStatus") return records;
        if (property === "cronLock") return locks;
        const down = () => Promise.reject(new Error("database down"));
        if (String(property).startsWith("$")) return down;
        return new Proxy({}, { get: () => down });
      },
    }),
);
const sentryService = vi.hoisted(() => ({
  isEnabled: vi.fn(() => false),
  captureException: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));
vi.mock("~/services/monitoring/sentry.service", () => ({ SentryService: sentryService }));

type CronLoader = (args: { request: Request; params: object; context: object }) => Promise<Response>;

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};
const jobs = vercelConfig.crons.map((cron) => cron.path.replace("/api/cron/", ""));

const saved = { ...process.env };

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  // So scheduled-campaigns gets past its "marketing email is off" check
  process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = "verification-key";
  process.env.SHOPIFY_APP_URL = "https://rewardspro.test";
  records.upsert.mockReset().mockResolvedValue({});
  locks.create.mockReset().mockImplementation(async ({ data }) => data);
  locks.findUnique.mockReset().mockResolvedValue(null);
  locks.delete.mockReset().mockResolvedValue({});
  locks.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  sentryService.captureException.mockReset();
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
});

describe("a scheduled cron whose job fails", () => {
  it.each(jobs)("%s answers 500, records the failure and sends the error to Sentry", async (job) => {
    const { loader } = (await import(`~/routes/api.cron.${job}.tsx`)) as { loader: CronLoader };

    const response = await loader({
      request: new Request(`https://rewardspro.test/api/cron/${job}`, {
        headers: { Authorization: "Bearer the-cron-secret" },
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(500);

    const written = records.upsert.mock.calls.map(([args]) => args.where.shop_syncType.syncType);
    expect(written).toEqual([`${job}:started`, `${job}:failed`]);
    const failed = records.upsert.mock.calls[1][0].update;
    expect(failed.errorMessage).toContain(DATABASE_DOWN);

    expect(sentryService.captureException).toHaveBeenCalledTimes(1);
    const [error, context] = sentryService.captureException.mock.calls[0];
    expect(String((error as Error).message) + String((error as Error).cause)).toContain(DATABASE_DOWN);
    expect(context).toMatchObject({ tags: { "cron.job": job } });
  });
});
