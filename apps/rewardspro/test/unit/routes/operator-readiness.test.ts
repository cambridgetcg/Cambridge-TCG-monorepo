import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("~/db.server", () => ({ default: prisma, db: prisma }));

import { loader } from "~/routes/api.operator.readiness";

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  prisma.$queryRaw.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

function request(authorization?: string): Request {
  return new Request("https://example.test/api/operator/readiness", {
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

describe("operator readiness", () => {
  it.each([undefined, "Bearer wrong", "bearer readiness-secret"])(
    "rejects a missing or inexact credential before touching the database",
    async (authorization) => {
      process.env.CRON_SECRET = "readiness-secret";

      const response = await loader({
        request: request(authorization),
        params: {},
        context: {},
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({ status: "unauthorized" });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it("runs exactly one read-only statement for the exact bearer credential", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const response = await loader({
      request: request("Bearer readiness-secret"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ status: "ready" });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0][0].join("")).toBe("SELECT 1");
  });

  it("returns a generic unavailable response without exposing the failure", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    const internalDetail = "credential material was rejected upstream";
    prisma.$queryRaw.mockRejectedValueOnce(new Error(internalDetail));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await loader({
      request: request("Bearer readiness-secret"),
      params: {},
      context: {},
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    expect(body).not.toContain(internalDetail);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when the database does not respond within the probe timeout", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    vi.useFakeTimers();
    prisma.$queryRaw.mockReturnValueOnce(new Promise(() => {}));
    vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const pending = loader({
        request: request("Bearer readiness-secret"),
        params: {},
        context: {},
      });
      await vi.advanceTimersByTimeAsync(2_000);
      const response = await pending;

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });
});
