import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily session-cleanup cron reports what it did, not settings it never
 * applies.
 */

const db = vi.hoisted(() => ({
  session: { count: vi.fn(), deleteMany: vi.fn() },
  syncStatus: { upsert: vi.fn() },
}));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));

import { loader } from "~/routes/api.cron.session-cleanup";

function runCron(query = "") {
  return loader({
    request: new Request(`https://rewardspro.test/api/cron/session-cleanup${query}`, {
      headers: { Authorization: "Bearer the-cron-secret" },
    }),
    params: {},
    context: {},
  });
}

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  db.session.count.mockReset().mockResolvedValue(2);
  db.session.deleteMany.mockReset().mockResolvedValue({ count: 1 });
  db.syncStatus.upsert.mockReset().mockResolvedValue({});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("session-cleanup cron", () => {
  it.each(["", "?stats=true"])("answers %s without echoing its configuration", async (query) => {
    const response = await runCron(query);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("config");
    expect(body.stats ?? {}).not.toHaveProperty("config");
  });
});
