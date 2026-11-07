import { afterEach, describe, expect, it, vi } from "vitest";

// The app's client, reduced to the one read the probe makes
const findFirst = vi.fn();
const queryRaw = vi.fn();
vi.mock("~/db.server", () => ({ default: { cronLock: { findFirst }, $queryRaw: queryRaw } }));

const { probeDatabase } = await import("~/db/database-health.server");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  findFirst.mockReset();
  queryRaw.mockReset();
});

/**
 * /api/health's database probe (READINESS-3): ready only when one of the
 * app's own tables answers, so a URL naming the right host but the wrong
 * schema or role fails the switch's step 4 instead of passing it.
 */
describe("probeDatabase", () => {
  it("reads one of the app's own tables, the cheapest way, and is ready when it answers", async () => {
    findFirst.mockResolvedValue(null);

    await expect(probeDatabase()).resolves.toBe(true);

    expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it("is not ready when the table can't be read (wrong schema or no grant), and says only the error's name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // As Prisma reports a table missing from the URL's schema, or a role without its grants
    findFirst.mockRejectedValue(Object.assign(new Error('permission denied for table cron_lock'), { name: "PrismaClientKnownRequestError" }));
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await expect(probeDatabase()).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith("[DatabaseHealth] Probe failed", { name: "PrismaClientKnownRequestError" });
  });

  it("is not ready when the read doesn't answer in time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    findFirst.mockReturnValue(new Promise(() => {}));

    const probe = probeDatabase(2000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(probe).resolves.toBe(false);
  });
});
