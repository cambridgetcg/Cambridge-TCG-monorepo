import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/lib/db", () => ({ query: queryMock }));

import { consumeActionRateLimit } from "./action-rate-limit";

const WINDOWS = [
  { name: "hour", seconds: 3600, limit: 5 },
  { name: "day", seconds: 86_400, limit: 20 },
] as const;

const originalRateSecret = process.env.RATE_LIMIT_HASH_SECRET;
const originalAuthSecret = process.env.AUTH_SECRET;

describe("consumeActionRateLimit", () => {
  beforeEach(() => {
    queryMock.mockReset();
    process.env.RATE_LIMIT_HASH_SECRET =
      "test-rate-limit-secret-with-at-least-thirty-two-characters";
    delete process.env.AUTH_SECRET;
  });

  afterEach(() => {
    if (originalRateSecret === undefined) delete process.env.RATE_LIMIT_HASH_SECRET;
    else process.env.RATE_LIMIT_HASH_SECRET = originalRateSecret;
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  it("consumes both windows atomically without sending the raw subject to SQL", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { window_name: "hour", request_count: 1 },
        { window_name: "day", request_count: 1 },
      ],
    });

    const result = await consumeActionRateLimit({
      action: "feedback-submit",
      subject: "ip:203.0.113.7",
      windows: WINDOWS,
      now: new Date("2026-07-11T12:30:00.000Z"),
    });

    expect(result.ok && result.allowed).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO privacy_action_rate_buckets");
    expect(sql).toContain("ON CONFLICT");
    expect(JSON.stringify(params)).not.toContain("203.0.113.7");
    expect(params.filter((value) => value === "feedback-submit")).toHaveLength(2);
  });

  it("reports a real retry delay after a window is exceeded", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { window_name: "hour", request_count: 6 },
        { window_name: "day", request_count: 6 },
      ],
    });

    const result = await consumeActionRateLimit({
      action: "feedback-submit",
      subject: "ip:203.0.113.7",
      windows: WINDOWS,
      now: new Date("2026-07-11T12:30:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1800,
    });
  });

  it("fails closed before the database when no strong hash secret exists", async () => {
    delete process.env.RATE_LIMIT_HASH_SECRET;
    delete process.env.AUTH_SECRET;

    const result = await consumeActionRateLimit({
      action: "feedback-submit",
      subject: "ip:203.0.113.7",
      windows: WINDOWS,
    });

    expect(result).toEqual({ ok: false, reason: "missing-secret" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("can fall back to a strong AUTH_SECRET when an optional override is weak", async () => {
    process.env.RATE_LIMIT_HASH_SECRET = "too-short";
    process.env.AUTH_SECRET =
      "strong-auth-secret-with-at-least-thirty-two-characters";
    queryMock.mockResolvedValue({
      rows: [
        { window_name: "hour", request_count: 1 },
        { window_name: "day", request_count: 1 },
      ],
    });

    const result = await consumeActionRateLimit({
      action: "feedback-submit",
      subject: "ip:203.0.113.7",
      windows: WINDOWS,
    });

    expect(result.ok && result.allowed).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed without exposing a database error", async () => {
    queryMock.mockRejectedValue(new Error("private database detail"));

    const result = await consumeActionRateLimit({
      action: "feedback-submit",
      subject: "ip:203.0.113.7",
      windows: WINDOWS,
    });

    expect(result).toEqual({ ok: false, reason: "storage-unavailable" });
  });
});
