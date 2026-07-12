import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, consumeMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  consumeMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/privacy/action-rate-limit", () => ({
  consumeActionRateLimit: consumeMock,
}));
vi.mock("@/lib/data-pantry", () => ({
  jsonResponse: ({ data }: { data: unknown }) =>
    Response.json({ data, _meta: { test: true } }),
  errorResponse: (options: {
    code: string;
    message: string;
    status?: number;
  }) =>
    Response.json(
      { error: { code: options.code, message: options.message } },
      { status: options.status ?? 400 },
    ),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/v1/feedback/route";

const allowedBudget = {
  ok: true,
  allowed: true,
  remaining: 4,
  retryAfterSeconds: 0,
  windows: [
    { name: "hour", limit: 5, used: 1, remaining: 4, resetsInSeconds: 1800 },
    { name: "day", limit: 20, used: 1, remaining: 19, resetsInSeconds: 41_400 },
  ],
};

function request(body: unknown, ip = "203.0.113.7"): NextRequest {
  return new NextRequest("https://cambridgetcg.com/api/v1/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("feedback route persistence boundary", () => {
  beforeEach(() => {
    queryMock.mockReset();
    consumeMock.mockReset();
    consumeMock.mockResolvedValue(allowedBudget);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores allowlisted content, separates contact, and logs no submission data", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          received_at: "2026-07-11T12:00:00.000Z",
          content_expires_at: "2027-01-07T12:00:00.000Z",
          lifecycle_expires_at: "2028-07-10T12:00:00.000Z",
        },
      ],
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await POST(
      request({
        kind: "general",
        message: "private message text",
        topic: "general",
        reporter_contact: "person@example.com",
      }),
    );

    expect(response.status).toBe(200);
    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe("person@example.com");
    expect(String(params[3])).toContain("private message text");
    expect(String(params[3])).not.toContain("person@example.com");
    expect(params[4]).toBe(180);
    expect(params[5]).toBe(730);

    const receipt = (await response.clone().json()) as {
      data?: { retention?: { lifecycle_expires_at?: string; lifecycle_days?: number } };
    };
    expect(receipt.data?.retention?.lifecycle_days).toBe(730);
    expect(receipt.data?.retention?.lifecycle_expires_at).toBe(
      "2028-07-10T12:00:00.000Z",
    );

    const log = JSON.stringify(info.mock.calls);
    expect(log).not.toContain("private message text");
    expect(log).not.toContain("person@example.com");
    expect(log).not.toContain("203.0.113.7");
  });

  it("returns 503 instead of a receipt when the inbox write fails", async () => {
    queryMock.mockRejectedValue(new Error("database unavailable"));
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      request({ kind: "general", message: "do not lose this" }),
    );
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(503);
    expect(body.error?.code).toBe("SOURCE_UNAVAILABLE");
    expect(body.error?.message).toContain("was not accepted");
    expect(info).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain("do not lose this");
  });

  it("fails before persistence when no valid client IP reaches the trust boundary", async () => {
    const response = await POST(
      request({ kind: "general", message: "hello" }, "not-an-ip"),
    );

    expect(response.status).toBe(503);
    expect(consumeMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
