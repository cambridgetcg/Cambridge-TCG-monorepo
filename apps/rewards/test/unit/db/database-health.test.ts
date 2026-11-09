import { afterEach, describe, expect, it, vi } from "vitest";

// The app's client, reduced to the three reads the probe makes
const cronFindFirst = vi.fn();
const connectionFindFirst = vi.fn();
const merchantFindFirst = vi.fn();
const queryRaw = vi.fn();
vi.mock("~/db.server", () => ({
  default: {
    cronLock: { findFirst: cronFindFirst },
    connection: { findFirst: connectionFindFirst },
    merchant: { findFirst: merchantFindFirst },
    $queryRaw: queryRaw,
  },
}));

const { probeDatabase } = await import("~/db/database-health.server");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cronFindFirst.mockReset();
  connectionFindFirst.mockReset();
  merchantFindFirst.mockReset();
  queryRaw.mockReset();
});

/** As Prisma reports a column the code knows and the database lacks (pg 42703) */
const missingColumn = (column: string) =>
  Object.assign(new Error(`The column \`${column}\` does not exist in the current database.`), {
    name: "PrismaClientKnownRequestError",
    code: "P2022",
    meta: { modelName: column.split(".")[0], column },
  });

/**
 * /api/health's database probe (READINESS-3, RP-25): ready only when one of
 * the app's own tables answers, so a URL naming the right host but the wrong
 * schema or role fails the switch's step 4 instead of passing it, and only
 * when a whole merchant row and a whole connection row can be read, so code
 * deployed before its migration turns health red.
 */
describe("probeDatabase", () => {
  it("reads one of the app's own tables, the cheapest way, and is ready when it answers", async () => {
    cronFindFirst.mockResolvedValue(null);

    await expect(probeDatabase()).resolves.toBe(true);

    expect(cronFindFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it("reads one full connection row and one full merchant row after cron_lock, one at a time", async () => {
    cronFindFirst.mockResolvedValue(null);
    connectionFindFirst.mockResolvedValue(null);
    merchantFindFirst.mockResolvedValue(null);

    await expect(probeDatabase()).resolves.toBe(true);

    // No arguments: every column Prisma knows, and a real query even on an empty table
    expect(connectionFindFirst).toHaveBeenCalledWith();
    expect(merchantFindFirst).toHaveBeenCalledWith();
    const [cron] = cronFindFirst.mock.invocationCallOrder;
    const [connection] = connectionFindFirst.mock.invocationCallOrder;
    const [merchant] = merchantFindFirst.mock.invocationCallOrder;
    expect(cron).toBeLessThan(connection);
    expect(connection).toBeLessThan(merchant);
  });

  it("is not ready when the table can't be read (wrong schema or no grant), and says only the error's name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // As Prisma reports a table missing from the URL's schema, or a role without its grants
    cronFindFirst.mockRejectedValue(Object.assign(new Error('permission denied for table cron_lock'), { name: "PrismaClientKnownRequestError" }));
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await expect(probeDatabase()).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith("[DatabaseHealth] Probe failed", { name: "PrismaClientKnownRequestError" });
  });

  it("is not ready when a merchant column is missing, and logs only the error's name and code", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    cronFindFirst.mockResolvedValue(null);
    connectionFindFirst.mockResolvedValue(null);
    merchantFindFirst.mockRejectedValue(missingColumn("merchant.guide_dismissed_at"));

    await expect(probeDatabase()).resolves.toBe(false);

    // Exactly these fields: the message and meta name the column
    expect(error).toHaveBeenCalledWith("[DatabaseHealth] Probe failed", { name: "PrismaClientKnownRequestError", code: "P2022" });
  });

  it("is not ready when a connection column is missing, and reads no further", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    cronFindFirst.mockResolvedValue(null);
    connectionFindFirst.mockRejectedValue(missingColumn("connection.last_auth_at"));

    await expect(probeDatabase()).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith("[DatabaseHealth] Probe failed", { name: "PrismaClientKnownRequestError", code: "P2022" });
    expect(merchantFindFirst).not.toHaveBeenCalled();
  });

  it("is not ready when the read doesn't answer in time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    cronFindFirst.mockReturnValue(new Promise(() => {}));

    const probe = probeDatabase(2000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(probe).resolves.toBe(false);
  });

  it("stops reading once it has timed out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    cronFindFirst.mockReturnValue(new Promise((resolve) => setTimeout(() => resolve(null), 2500)));

    const probe = probeDatabase(2000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(probe).resolves.toBe(false);
    // cron_lock answers late; the probe sends nothing after it
    await vi.advanceTimersByTimeAsync(1000);

    expect(cronFindFirst).toHaveBeenCalledTimes(1);
    expect(connectionFindFirst).not.toHaveBeenCalled();
    expect(merchantFindFirst).not.toHaveBeenCalled();
  });
});
