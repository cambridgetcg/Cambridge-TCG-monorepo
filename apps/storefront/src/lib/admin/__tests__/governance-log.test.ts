import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { logAdminAction, writeAdminAction } from "@/lib/admin/governance-log";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

const entry = {
  actorId: "admin-1",
  actorLabel: "admin@example.test",
  targetUserId: "user-1",
  targetKind: "fraud_signal",
  targetId: "signal-1",
  action: "fraud.resolve",
  beforeValue: { resolved: false },
  afterValue: { resolved: true },
  reason: "Reviewed by a human operator.",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("governance log writers", () => {
  it("persists the authenticated actor id and label in the strict writer", async () => {
    await writeAdminAction(entry);

    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "actor_id, actor_label",
    );
    expect(mockQuery.mock.calls[0][1]?.slice(0, 6)).toEqual([
      entry.actorId,
      entry.actorLabel,
      entry.targetUserId,
      entry.targetKind,
      entry.targetId,
      entry.action,
    ]);
  });

  it("lets strict callers observe a failed audit write", async () => {
    mockQuery.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(writeAdminAction(entry)).rejects.toThrow("audit unavailable");
  });

  it("keeps the legacy best-effort wrapper non-throwing", async () => {
    mockQuery.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(logAdminAction(entry)).resolves.toBeUndefined();
  });
});
