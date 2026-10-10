import { beforeEach, describe, expect, it, vi } from "vitest";
import { transaction } from "@/lib/db";
import { writeAdminAction } from "@/lib/admin/governance-log";
import { calculateTrustScore } from "@/lib/escrow/trust-engine";
import {
  bulkResolveFraudSignals,
  reviewFraudSignal,
} from "@/lib/admin/fraud-review";

vi.mock("@/lib/db", () => ({ transaction: vi.fn() }));
vi.mock("@/lib/admin/governance-log", () => ({ writeAdminAction: vi.fn() }));
vi.mock("@/lib/escrow/trust-engine", () => ({ calculateTrustScore: vi.fn() }));

const mockTransaction = vi.mocked(transaction);
const mockWrite = vi.mocked(writeAdminAction);
const mockCalculate = vi.mocked(calculateTrustScore);
const txQuery = vi.fn();

const admin = { id: "admin-1", email: "reviewer@example.test", role: "admin" };
const before = {
  id: "signal-1",
  user_id: "user-1",
  severity: "medium" as const,
  resolved: false,
  resolved_by: null,
  resolved_notes: null,
};
const after = {
  ...before,
  resolved: true,
  resolved_by: admin.id,
  resolved_notes: "Reviewed payment evidence and confirmed the signal.",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockTransaction.mockImplementation(async (fn) => fn(txQuery));
  mockWrite.mockResolvedValue(undefined);
  mockCalculate.mockResolvedValue({} as never);
});

describe("single fraud-signal human review", () => {
  it("rejects a review without substantive human reasoning", async () => {
    const result = await reviewFraudSignal({
      admin,
      signalId: before.id,
      action: "resolve",
      reason: "too short",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      committed: false,
      audited: false,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("stores the authenticated admin id, commits strict evidence, and awaits trust recompute", async () => {
    txQuery.mockResolvedValueOnce({ rows: [before], rowCount: 1 });
    txQuery.mockResolvedValueOnce({ rows: [after], rowCount: 1 });

    const result = await reviewFraudSignal({
      admin,
      signalId: before.id,
      action: "resolve",
      reason: after.resolved_notes,
    });

    expect(result).toMatchObject({
      ok: true,
      committed: true,
      audited: true,
      trustRecomputed: true,
    });
    expect(String(txQuery.mock.calls[1][0])).toContain("resolved_by = $2");
    expect(txQuery.mock.calls[1][1]).toEqual([
      before.id,
      admin.id,
      after.resolved_notes,
    ]);
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: admin.id,
        actorLabel: admin.email,
        action: "fraud.resolve",
        targetId: before.id,
      }),
      txQuery,
    );
    expect(mockCalculate).toHaveBeenCalledWith(before.user_id);
  });

  it("recomputes trust when escalation crosses from low to medium", async () => {
    const low = { ...before, severity: "low" as const };
    const medium = {
      ...low,
      severity: "medium" as const,
      resolved_notes: "Escalated after manual payment review.",
    };
    txQuery.mockResolvedValueOnce({ rows: [low], rowCount: 1 });
    txQuery.mockResolvedValueOnce({ rows: [medium], rowCount: 1 });

    const result = await reviewFraudSignal({
      admin,
      signalId: low.id,
      action: "escalate",
      reason: medium.resolved_notes,
    });

    expect(result.ok).toBe(true);
    expect(txQuery.mock.calls[1][1]).toEqual([
      low.id,
      "medium",
      medium.resolved_notes,
    ]);
    expect(mockCalculate).toHaveBeenCalledWith(low.user_id);
  });

  it("reports the review as not committed when governance evidence rejects", async () => {
    txQuery.mockResolvedValueOnce({ rows: [before], rowCount: 1 });
    txQuery.mockResolvedValueOnce({ rows: [after], rowCount: 1 });
    mockWrite.mockRejectedValueOnce(new Error("audit down"));

    const result = await reviewFraudSignal({
      admin,
      signalId: before.id,
      action: "dismiss",
      reason:
        "Reviewed the source data and found the address match inaccurate.",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 503,
      committed: false,
      audited: false,
    });
    expect(mockCalculate).not.toHaveBeenCalled();
  });

  it("exposes a post-commit trust recompute failure instead of returning false success", async () => {
    txQuery.mockResolvedValueOnce({ rows: [before], rowCount: 1 });
    txQuery.mockResolvedValueOnce({ rows: [after], rowCount: 1 });
    mockCalculate.mockRejectedValueOnce(new Error("trust unavailable"));

    const result = await reviewFraudSignal({
      admin,
      signalId: before.id,
      action: "resolve",
      reason: after.resolved_notes,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 503,
      committed: true,
      audited: true,
      failedUserIds: [before.user_id],
    });
  });
});

describe("bulk fraud-signal human review", () => {
  it("writes per-signal evidence in one transaction and recomputes each affected user once", async () => {
    const beforeTwo = { ...before, id: "signal-2", user_id: "user-2" };
    const afterTwo = { ...after, id: "signal-2", user_id: "user-2" };
    txQuery.mockResolvedValueOnce({ rows: [before, beforeTwo], rowCount: 2 });
    txQuery.mockResolvedValueOnce({ rows: [after, afterTwo], rowCount: 2 });

    const result = await bulkResolveFraudSignals({
      admin,
      signalIds: [before.id, beforeTwo.id],
      reason: "Bulk review confirmed these duplicate payment-failure signals.",
    });

    expect(result).toMatchObject({
      ok: true,
      committed: true,
      audited: true,
      resolved: 2,
      affectedUsers: 2,
      failedUserIds: [],
    });
    expect(mockWrite).toHaveBeenCalledTimes(2);
    expect(mockWrite.mock.calls.every((call) => call[1] === txQuery)).toBe(
      true,
    );
    expect(mockCalculate).toHaveBeenCalledTimes(2);
    expect(new Set(mockCalculate.mock.calls.map(([userId]) => userId))).toEqual(
      new Set(["user-1", "user-2"]),
    );
  });
});
