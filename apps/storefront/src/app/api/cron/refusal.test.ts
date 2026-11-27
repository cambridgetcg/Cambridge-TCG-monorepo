import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every scheduled route, called for real without the bearer. Both databases, the
// network, Stripe and the mail seam are stand-ins that count being touched and
// then fail, so a route that forgets the check, calls requireCronAuth and
// ignores its answer, or works first and refuses afterwards fails here, and
// does nothing while it fails.

const touched = vi.hoisted(() => vi.fn((): never => {
  throw new Error("a cron route did work before it was authorised");
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: touched, transaction: touched, db: {}, close: touched }));
// The wholesale database: lib/stock and lib/admin open it through createDb, lib/wholesale through pg.
vi.mock("@cambridge-tcg/db", () => ({ createDb: touched }));
vi.mock("pg", () => ({ Pool: touched, default: { Pool: touched } }));
vi.mock("@/lib/stripe", () => ({ getStripe: touched }));
vi.mock("@cambridge-tcg/email", () => ({ sendMail: touched, isMailConfigured: touched }));

const app = join(process.cwd(), "src/app");
const scheduled = (JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string }[] })
  .crons.map((cron) => cron.path);
// A route under /api/cron answers anyone who calls it, scheduled or not.
const present = readdirSync(join(app, "api/cron"), { recursive: true, encoding: "utf8" })
  .filter((file) => /(^|\/)route\.tsx?$/.test(file))
  .map((file) => `/api/cron/${dirname(file)}`);

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Handler = (request: Request) => Response | Promise<Response>;
type Route = Partial<Record<(typeof METHODS)[number], Handler>>;

beforeEach(() => {
  touched.mockClear();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.stubEnv("WHOLESALE_DATABASE_URL", "postgres://nobody@127.0.0.1:9/none"); // unset, its clients stop before the stand-in
  vi.stubGlobal("fetch", touched);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("scheduled routes", () => {
  it.each([...new Set([...scheduled, ...present])])("%s refuses a call without the bearer, before any work", async (path) => {
    const route = (await import(/* @vite-ignore */ `@/app${path}/route`)) as Route;
    const handlers = METHODS.filter((method) => route[method]);
    expect(handlers).toContain("GET");

    for (const method of handlers) {
      const bare = await route[method]!(new Request(`https://cambridgetcg.example${path}`, { method }));
      expect(bare.status, method).toBe(401);

      // Nothing a caller can put in the request stands in for the secret.
      const dressed = await route[method]!(new Request(
        `https://cambridgetcg.example${path}?secret=test-cron-secret&dev=local-dev`,
        { method, headers: { authorization: "Bearer wrong", "x-vercel-cron": "1", "x-cron-dev": "local-dev" } },
      ));
      expect(dressed.status, method).toBe(401);
    }
    expect(touched).not.toHaveBeenCalled();
  }, 30_000);
});
