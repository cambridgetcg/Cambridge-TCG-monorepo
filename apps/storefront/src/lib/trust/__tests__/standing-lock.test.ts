import { describe, expect, it, vi } from "vitest";
import { lockTradeStanding } from "@/lib/trust/standing-lock";

describe("lockTradeStanding", () => {
  it("locks unique account rows in deterministic order", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      rows: [
        { user_id: "user-a", is_suspended: false, suspended_reason: null },
        { user_id: "user-b", is_suspended: false, suspended_reason: null },
      ],
      rowCount: 2,
    });

    const result = await lockTradeStanding(runQuery, [
      "user-b",
      "user-a",
      "user-b",
    ]);

    expect(result.allowed).toBe(true);
    expect(runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/ORDER BY user_id\s+FOR SHARE/),
      [["user-a", "user-b"]],
    );
  });

  it("fails closed when an expected account has no trust profile", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      rows: [
        { user_id: "user-a", is_suspended: false, suspended_reason: null },
      ],
      rowCount: 1,
    });

    const result = await lockTradeStanding(runQuery, ["user-a", "user-b"]);

    expect(result).toMatchObject({
      allowed: false,
      missingUserIds: ["user-b"],
      suspendedUserIds: [],
    });
  });

  it("reports suspended accounts while retaining the human reason", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          user_id: "user-a",
          is_suspended: true,
          suspended_reason: "Emergency review",
        },
      ],
      rowCount: 1,
    });

    const result = await lockTradeStanding(runQuery, ["user-a"]);

    expect(result).toMatchObject({
      allowed: false,
      missingUserIds: [],
      suspendedUserIds: ["user-a"],
      suspendedReasons: { "user-a": "Emergency review" },
    });
  });
});
