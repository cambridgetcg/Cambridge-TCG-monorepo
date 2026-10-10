import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  reviewFraudSignal: vi.fn(),
  listFraudSignals: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/fraud-review", () => ({
  MIN_FRAUD_REVIEW_REASON_LENGTH: 10,
  reviewFraudSignal: mocks.reviewFraudSignal,
}));
vi.mock("@/lib/escrow/trust-engine", () => ({
  listFraudSignals: mocks.listFraudSignals,
}));

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

describe("legacy escrow fraud review route", () => {
  it("routes resolve/dismiss through the same authenticated review service", async () => {
    const response = await PATCH(
      new Request("https://example.test/api/escrow/fraud", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: "signal-1",
          action: "dismiss",
          notes:
            "Reviewed the evidence and found the match belonged to another household.",
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
      reason:
        "Reviewed the evidence and found the match belonged to another household.",
    });
    expect(
      JSON.stringify(mocks.reviewFraudSignal.mock.calls[0][0]),
    ).not.toContain("spoofed");
  });

  it("does not preserve the old reason-free dismiss path", async () => {
    const response = await PATCH(
      new Request("https://example.test/api/escrow/fraud", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: "signal-1",
          action: "dismiss",
          notes: "too short",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.reviewFraudSignal).not.toHaveBeenCalled();
  });
});
