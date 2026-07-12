import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createAgentWithKey: vi.fn(),
  consumeActionRateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/agents/creation", () => ({
  createAgentWithKey: mocks.createAgentWithKey,
  randomBase62: () => "abcd1234",
  HANDLE_RE: /^[a-z0-9][a-z0-9-]{2,31}$/,
}));
vi.mock("@/lib/privacy/action-rate-limit", () => ({
  consumeActionRateLimit: mocks.consumeActionRateLimit,
}));

import { POST } from "./route";

function registrationRequest(ip = "203.0.113.7"): NextRequest {
  return new NextRequest("https://example.test/api/v1/agents/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `${ip}, 198.51.100.2`,
    },
    body: JSON.stringify({ name: "card-archivist" }),
  });
}

function allowedBudget() {
  return {
    ok: true as const,
    allowed: true,
    remaining: 2,
    retryAfterSeconds: 0,
    windows: [
      {
        name: "utc-day",
        limit: 3,
        used: 1,
        remaining: 2,
        resetsInSeconds: 43_200,
      },
    ],
  };
}

describe("self-serve agent registration privacy contract", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.createAgentWithKey.mockReset();
    mocks.consumeActionRateLimit.mockReset();
    mocks.query.mockResolvedValue({ rows: [{ id: "steward-user" }] });
    mocks.consumeActionRateLimit.mockResolvedValue(allowedBudget());
    mocks.createAgentWithKey.mockResolvedValue({
      ok: true,
      agent_id: "agent-1",
      public_handle: "card-archivist",
      token: "secret-once",
      key_prefix: "ctcg_abc",
    });
  });

  it("uses the secret-HMAC action limiter and never writes the legacy IP bucket", async () => {
    const rawIp = "203.0.113.7";
    const response = await POST(registrationRequest(rawIp));

    expect(response.status).toBe(200);
    expect(mocks.consumeActionRateLimit).toHaveBeenCalledWith({
      action: "agent-register",
      subject: `ip:${rawIp}`,
      windows: [{ name: "utc-day", seconds: 86_400, limit: 3 }],
    });

    const databaseCalls = mocks.query.mock.calls.map(([sql, params]) => ({
      sql: String(sql),
      params: JSON.stringify(params ?? []),
    }));
    expect(databaseCalls.map((call) => call.sql).join("\n")).not.toContain(
      "agent_registration_buckets",
    );
    expect(databaseCalls.map((call) => call.params).join("\n")).not.toContain(rawIp);
  });

  it.each(["missing-secret", "storage-unavailable"] as const)(
    "fails closed when the limiter reports %s",
    async (reason) => {
      mocks.consumeActionRateLimit.mockResolvedValue({ ok: false, reason });

      const response = await POST(registrationRequest());
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.createAgentWithKey).not.toHaveBeenCalled();
    },
  );

  it("returns an actionable 429 before registration writes", async () => {
    mocks.consumeActionRateLimit.mockResolvedValue({
      ok: true,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 900,
      windows: [
        {
          name: "utc-day",
          limit: 3,
          used: 4,
          remaining: 0,
          resetsInSeconds: 900,
        },
      ],
    });

    const response = await POST(registrationRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.createAgentWithKey).not.toHaveBeenCalled();
  });

  it("fails closed when no valid network address is available", async () => {
    const request = new NextRequest(
      "https://example.test/api/v1/agents/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "card-archivist" }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(mocks.consumeActionRateLimit).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
