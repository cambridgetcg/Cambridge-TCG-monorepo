import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { databaseSchema } from "~/db.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * /api/health on real Postgres (RP-25): code that reads a column production
 * lacks turns health red, even with no rows. Each case drops the column
 * inside a transaction that is then rolled back, and sends the probe's reads
 * through that transaction, so the schema is never changed for later suites.
 */

const PROBED = ["cronLock", "connection", "merchant"] as const;
type FindFirst = (...args: unknown[]) => Promise<unknown>;

class RolledBack extends Error {}

/**
 * GET /api/health inside a transaction that first runs `ddl` (if any), then
 * is rolled back. The route module is loaded fresh, so no earlier probe
 * result is reused.
 */
async function healthWith(ddl?: string): Promise<{ status: number; body: unknown }> {
  vi.resetModules();
  const { loader } = await import("~/routes/api.health");
  let answer: { status: number; body: unknown } | undefined;
  await prisma
    .$transaction(async (tx) => {
      if (ddl) await tx.$executeRawUnsafe(ddl);
      const restores: Array<() => void> = [];
      for (const model of PROBED) {
        const delegate = prisma[model] as unknown as { findFirst: FindFirst };
        const original = delegate.findFirst;
        delegate.findFirst = (...args) => (tx[model] as unknown as { findFirst: FindFirst }).findFirst(...args);
        restores.push(() => (delegate.findFirst = original));
      }
      try {
        const response = await loader();
        answer = { status: response.status, body: await response.json() };
      } finally {
        for (const restore of restores) restore();
      }
      throw new RolledBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RolledBack)) throw error;
    });
  return answer!;
}

/** Prisma's own error log (console.log in tests), which the failing read writes */
const captureQueryErrorLogs = () => vi.spyOn(console, "log").mockImplementation(() => {});

const dropColumn = (table: string, column: string) => `ALTER TABLE "${databaseSchema}"."${table}" DROP COLUMN "${column}"`;

describe.skipIf(!hasTestDatabase)("/api/health on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers 200 on an empty database that has every column", async () => {
    await expect(prisma.merchant.count()).resolves.toBe(0);
    await expect(prisma.connection.count()).resolves.toBe(0);

    await expect(healthWith()).resolves.toEqual({ status: 200, body: { status: "ok", database: "ready" } });
  });

  it("answers 503 when a merchant column is missing, logging only the error's name and code", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const prismaLog = captureQueryErrorLogs();

    await expect(healthWith(dropColumn("merchant", "guide_dismissed_at"))).resolves.toEqual({
      status: 503,
      body: { status: "unavailable", database: "unavailable" },
    });

    expect(error).toHaveBeenCalledWith("[DatabaseHealth] Probe failed", { name: "PrismaClientKnownRequestError", code: "P2022" });
    expect(prismaLog).toHaveBeenCalledWith(expect.stringContaining("prisma:error"), expect.stringMatching(/does not exist/));
    // Rolled back: the column is there again
    await expect(healthWith()).resolves.toMatchObject({ status: 200 });
  });

  it("answers 503 when a connection column is missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const prismaLog = captureQueryErrorLogs();

    await expect(healthWith(dropColumn("connection", "last_auth_at"))).resolves.toMatchObject({ status: 503 });

    expect(error).toHaveBeenCalledWith("[DatabaseHealth] Probe failed", { name: "PrismaClientKnownRequestError", code: "P2022" });
    expect(prismaLog).toHaveBeenCalledWith(expect.stringContaining("prisma:error"), expect.stringMatching(/does not exist/));
    await expect(healthWith()).resolves.toMatchObject({ status: 200 });
  });
});
