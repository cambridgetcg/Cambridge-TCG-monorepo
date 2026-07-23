import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { logAdminAction } from "@/lib/admin/governance-log";
import {
  MIN_REASON_LENGTH,
  emergencyFreezeAccount,
  liftEmergencyFreeze,
} from "@/lib/admin/emergency-intervention";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/admin/governance-log", () => ({ logAdminAction: vi.fn() }));

const mockQuery = vi.mocked(query);
const mockLog = vi.mocked(logAdminAction);

const actor = { id: "admin-1", email: "op@cambridgetcg.com" };
const target = "user-9";
const goodReason = "Active exploit draining escrow via this account — freezing to stop it.";

beforeEach(() => {
  mockQuery.mockReset();
  mockLog.mockReset();
  mockLog.mockResolvedValue(undefined);
});

describe("emergency break-glass", () => {
  it("requires a substantive written justification and does nothing without one", async () => {
    const res = await emergencyFreezeAccount(actor, target, "too short");
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(MIN_REASON_LENGTH));
    expect(mockQuery).not.toHaveBeenCalled(); // no read, no write
    expect(mockLog).not.toHaveBeenCalled(); // and nothing audited
  });

  it("refuses to freeze an account with no trust profile (no write)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // the SELECT finds nothing
    const res = await emergencyFreezeAccount(actor, target, goodReason);
    expect(res.ok).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1); // only the SELECT ran
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("freezes an active account, marks the reason, and loudly audits it", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ is_suspended: false }], rowCount: 1 }); // before
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // the UPDATE

    const res = await emergencyFreezeAccount(actor, target, goodReason);

    expect(res.ok).toBe(true);
    expect(res.changed).toBe(true);
    // the UPDATE sets is_suspended = true and marks the reason as an emergency
    const updateCall = mockQuery.mock.calls[1];
    expect(String(updateCall[0])).toMatch(/is_suspended = true/);
    expect(String(updateCall[1]?.[1])).toContain("[EMERGENCY]");
    expect(String(updateCall[1]?.[1])).toContain(goodReason);
    // and it is audited with the actor, action, and break-glass marker
    expect(mockLog).toHaveBeenCalledTimes(1);
    const logged = mockLog.mock.calls[0][0];
    expect(logged.action).toBe("emergency.freeze");
    expect(logged.actorLabel).toBe(actor.email);
    expect(logged.targetUserId).toBe(target);
    expect(logged.reason).toBe(goodReason);
    expect(logged.metadata?.break_glass).toBe(true);
  });

  it("reports changed=false when the account was already frozen", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ is_suspended: true }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await emergencyFreezeAccount(actor, target, goodReason);
    expect(res.ok).toBe(true);
    expect(res.changed).toBe(false);
    expect(mockLog).toHaveBeenCalledTimes(1); // still audited
  });

  it("lifts a freeze, clears the reason, and audits the reversal", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ is_suspended: true }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await liftEmergencyFreeze(actor, target, "Threat contained; restoring the account.");

    expect(res.ok).toBe(true);
    expect(res.changed).toBe(true);
    const updateCall = mockQuery.mock.calls[1];
    expect(String(updateCall[0])).toMatch(/is_suspended = false/);
    expect(String(updateCall[0])).toMatch(/suspended_reason = NULL/);
    expect(mockLog.mock.calls[0][0].action).toBe("emergency.lift");
  });
});
