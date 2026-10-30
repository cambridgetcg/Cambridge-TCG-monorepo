import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  sfQuery: vi.fn(),
  begin: vi.fn(),
  unsafe: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/db", () => ({
  sfQuery: mocks.sfQuery,
  storefrontDb: () => ({ client: { begin: mocks.begin } }),
}));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { adminArchiveAgent, adminRevokeKey } from "./_actions";

const AGENT_ID = "00000000-0000-4000-8000-0000000000b2";

function sqlOf(call: number): string {
  return String(mocks.unsafe.mock.calls[call][0]).replace(/\s+/g, " ");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "staff-1", email: "staff@example.test", role: "admin" });
  // postgres.js begin(): run the callback with a transaction handle; a
  // throw inside rolls back and rejects with the same error.
  mocks.begin.mockImplementation(async (fn: (tx: { unsafe: typeof mocks.unsafe }) => Promise<unknown>) =>
    fn({ unsafe: mocks.unsafe }),
  );
});

describe("adminArchiveAgent", () => {
  it("archives and revokes live keys in one transaction on the admin pool", async () => {
    mocks.unsafe.mockResolvedValueOnce([{ id: AGENT_ID }]).mockResolvedValueOnce([]);

    const result = await adminArchiveAgent({ id: AGENT_ID, reason: "  abuse report  " });

    expect(result).toEqual({ ok: true, data: { id: AGENT_ID, action: "archive" } });
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(sqlOf(0)).toContain("UPDATE agents SET status = 'archived'");
    expect(sqlOf(1)).toContain("UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = $2");
    expect(mocks.unsafe.mock.calls[1][1]).toEqual([AGENT_ID, "admin archive: abuse report"]);
    expect(mocks.sfQuery).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agent.archive", targetId: AGENT_ID }),
    );
  });

  it("revokes nothing and logs nothing when the agent is missing or already archived", async () => {
    mocks.unsafe.mockResolvedValueOnce([]);

    const result = await adminArchiveAgent({ id: AGENT_ID, reason: "cleanup" });

    expect(result).toEqual({
      ok: false,
      error: "Agent not found or already archived.",
      code: "validation",
    });
    expect(mocks.unsafe).toHaveBeenCalledTimes(1);
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it("requires a reason before opening a transaction", async () => {
    const result = await adminArchiveAgent({ id: AGENT_ID, reason: "  " });

    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect(mocks.begin).not.toHaveBeenCalled();
  });
});

describe("staff revocation reasons", () => {
  it("prefixes a single-key revocation with admin, like an archive", async () => {
    mocks.sfQuery.mockResolvedValueOnce({ rows: [{ id: "key-1" }] });

    await adminRevokeKey({ key_id: "key-1", reason: " leaked in a log " });

    expect(mocks.sfQuery.mock.calls[0][1]).toEqual(["key-1", "admin revoke: leaked in a log"]);
  });
});
