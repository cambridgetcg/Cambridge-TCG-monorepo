import { beforeEach, describe, expect, it, vi } from "vitest";
import { transaction } from "@/lib/db";
import { writeAdminAction } from "@/lib/admin/governance-log";
import {
  MIN_REASON_LENGTH,
  emergencyFreezeAccount,
  liftEmergencyFreeze,
} from "@/lib/admin/emergency-intervention";

vi.mock("@/lib/db", () => ({ transaction: vi.fn() }));
vi.mock("@/lib/admin/governance-log", () => ({ writeAdminAction: vi.fn() }));

const mockTransaction = vi.mocked(transaction);
const mockWrite = vi.mocked(writeAdminAction);
const txQuery = vi.fn();

const actor = { id: "admin-1", email: "op@cambridgetcg.com" };
const target = "user-9";
const goodReason =
  "Active exploit draining escrow via this account — freezing to stop it.";

beforeEach(() => {
  vi.resetAllMocks();
  mockTransaction.mockImplementation(async (fn) => fn(txQuery));
  mockWrite.mockResolvedValue(undefined);
});

describe("emergency break-glass", () => {
  it("requires a substantive written justification and does nothing without one", async () => {
    const res = await emergencyFreezeAccount(actor, target, "too short");
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(MIN_REASON_LENGTH));
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("refuses to freeze an account with no trust profile", async () => {
    txQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await emergencyFreezeAccount(actor, target, goodReason);

    expect(res.ok).toBe(false);
    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(String(txQuery.mock.calls[0][0])).toContain("FOR UPDATE");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("commits a freeze and strict audit through the same transaction query", async () => {
    txQuery.mockResolvedValueOnce({
      rows: [{ is_suspended: false }],
      rowCount: 1,
    });
    txQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await emergencyFreezeAccount(actor, target, goodReason);

    expect(res.ok).toBe(true);
    expect(res.changed).toBe(true);
    const updateCall = txQuery.mock.calls[1];
    expect(String(updateCall[0])).toMatch(/is_suspended = true/);
    expect(String(updateCall[1]?.[1])).toContain("[EMERGENCY]");
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const [logged, auditQuery] = mockWrite.mock.calls[0];
    expect(auditQuery).toBe(txQuery);
    expect(logged).toMatchObject({
      action: "emergency.freeze",
      actorId: actor.id,
      actorLabel: actor.email,
      targetUserId: target,
      reason: goodReason,
      metadata: { break_glass: true },
    });
  });

  it("returns failure instead of claiming a freeze when the strict audit rejects", async () => {
    txQuery.mockResolvedValueOnce({
      rows: [{ is_suspended: false }],
      rowCount: 1,
    });
    txQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockWrite.mockRejectedValueOnce(new Error("audit unavailable"));

    const res = await emergencyFreezeAccount(actor, target, goodReason);

    expect(res).toMatchObject({ ok: false, changed: false });
    expect(res.message).toContain("could not be committed together");
  });

  it("reports changed=false when an existing freeze reason is reviewed and updated", async () => {
    txQuery.mockResolvedValueOnce({
      rows: [{ is_suspended: true }],
      rowCount: 1,
    });
    txQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await emergencyFreezeAccount(actor, target, goodReason);

    expect(res).toMatchObject({ ok: true, changed: false });
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it("lifts a freeze and audits the reversal atomically", async () => {
    txQuery.mockResolvedValueOnce({
      rows: [{ is_suspended: true }],
      rowCount: 1,
    });
    txQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await liftEmergencyFreeze(
      actor,
      target,
      "Threat contained; restoring the account.",
    );

    expect(res).toMatchObject({ ok: true, changed: true });
    expect(String(txQuery.mock.calls[1][0])).toMatch(/is_suspended = false/);
    expect(String(txQuery.mock.calls[1][0])).toMatch(/suspended_reason = NULL/);
    expect(mockWrite.mock.calls[0][0]).toMatchObject({
      action: "emergency.lift",
      actorId: actor.id,
    });
    expect(mockWrite.mock.calls[0][1]).toBe(txQuery);
  });

  it("logs a reviewed no-op lift without mutating an already-active profile", async () => {
    txQuery.mockResolvedValueOnce({
      rows: [{ is_suspended: false }],
      rowCount: 1,
    });

    const res = await liftEmergencyFreeze(
      actor,
      target,
      "Confirmed no emergency hold remains on this account.",
    );

    expect(res).toMatchObject({ ok: true, changed: false });
    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(mockWrite.mock.calls[0][0].metadata).toMatchObject({ no_op: true });
  });
});
