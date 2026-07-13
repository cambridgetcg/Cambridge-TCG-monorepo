import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aurora = vi.hoisted(() => ({
  executeStatement: vi.fn(),
  getAuroraClient: vi.fn(),
}));

vi.mock("~/utils/aurora-data-api", () => ({
  getAuroraClient: aurora.getAuroraClient,
}));

import { loader } from "~/routes/api.operator.readiness";

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  aurora.executeStatement.mockReset();
  aurora.getAuroraClient.mockReset();
  aurora.getAuroraClient.mockReturnValue({
    executeStatement: aurora.executeStatement,
  });
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
    "rejects a missing or inexact credential before the Data API client",
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
      expect(aurora.getAuroraClient).not.toHaveBeenCalled();
      expect(aurora.executeStatement).not.toHaveBeenCalled();
    },
  );

  it("runs exactly one read-only statement for the exact bearer credential", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    aurora.executeStatement.mockResolvedValueOnce({ records: [{ ready: 1 }] });

    const response = await loader({
      request: request("Bearer readiness-secret"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ status: "ready" });
    expect(aurora.getAuroraClient).toHaveBeenCalledTimes(1);
    expect(aurora.executeStatement).toHaveBeenCalledTimes(1);
    expect(aurora.executeStatement).toHaveBeenCalledWith("SELECT 1 AS ready");
  });

  it("returns a generic unavailable response without exposing the failure", async () => {
    process.env.CRON_SECRET = "readiness-secret";
    const internalDetail = "credential material was rejected upstream";
    aurora.executeStatement.mockRejectedValueOnce(new Error(internalDetail));
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
    expect(aurora.executeStatement).toHaveBeenCalledTimes(1);
  });
});
