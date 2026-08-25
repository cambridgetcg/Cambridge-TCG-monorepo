import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  reviewFraudSignal: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/fraud-review", () => ({
  MIN_FRAUD_REVIEW_REASON_LENGTH: 10,
  reviewFraudSignal: mocks.reviewFraudSignal,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

const admin = { id: "admin-real", email: "real@example.test", role: "admin" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue(admin);
  mocks.reviewFraudSignal.mockResolvedValue({
    ok: true,
    status: 200,
    signal: { id: "signal-1", user_id: "user-1", resolved: true },
    committed: true,
    audited: true,
    trustRecomputed: true,
  });
});

describe("admin fraud-signal review route", () => {
  it("derives the audit actor from the authenticated session, never the body", async () => {
    const response = await PATCH(
      new Request("https://example.test/api/admin/fraud-signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: "signal-1",
          action: "dismiss",
          reason: "Source evidence showed this was a false address match.",
          actorLabel: "spoofed@example.test",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.reviewFraudSignal).toHaveBeenCalledWith({
      admin,
      signalId: "signal-1",
      action: "dismiss",
      reason: "Source evidence showed this was a false address match.",
    });
    expect(
      JSON.stringify(mocks.reviewFraudSignal.mock.calls[0][0]),
    ).not.toContain("spoofed");
  });

  it("requires a human review reason before calling the mutation helper", async () => {
    const response = await PATCH(
      new Request("https://example.test/api/admin/fraud-signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: "signal-1",
          action: "resolve",
          reason: "too short",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.reviewFraudSignal).not.toHaveBeenCalled();
  });

  it("preserves committed/audited truth when trust recomputation fails", async () => {
    mocks.reviewFraudSignal.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: "Trust recompute failed.",
      committed: true,
      audited: true,
      signal: { id: "signal-1", user_id: "user-1", resolved: true },
      failedUserIds: ["user-1"],
    });

    const response = await PATCH(
      new Request("https://example.test/api/admin/fraud-signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: "signal-1",
          action: "resolve",
          reason: "Reviewed the payment evidence and confirmed the outcome.",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ committed: true, audited: true });
  });
});
