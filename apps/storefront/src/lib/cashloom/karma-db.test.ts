import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCashloomKarmaDecision } from "./karma-db";

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: dbMocks.query }));

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const EVALUATED_AT = "2026-08-01T09:00:00.000Z";

beforeEach(() => vi.resetAllMocks());

describe("CashLoom KARMA local evidence adapter", () => {
  it("projects only bounded advisory fields for the current participant", async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{
        signal_type: "self_trading",
        severity: "high",
        created_at: new Date("2026-07-31T09:00:00.000Z"),
      }],
    });

    const decision = await getCashloomKarmaDecision(
      USER_ID,
      "market.cashloom-handoff",
      EVALUATED_AT,
    );

    expect(decision.proposed_response).toBe("isolate");
    expect(decision.effective_response).toBe("observe");
    expect(dbMocks.query).toHaveBeenCalledWith(
      expect.not.stringMatching(/description|resolved_notes|trade_id|email/i),
      [USER_ID, 65],
    );
    const sql = String(dbMocks.query.mock.calls[0]?.[0]);
    expect(sql.trim()).toMatch(/^SELECT\b/);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
  });

  it("degrades visibly to unavailable and never turns a read failure into enforcement", async () => {
    dbMocks.query.mockRejectedValueOnce(new Error("database unavailable"));

    const decision = await getCashloomKarmaDecision(
      USER_ID,
      "account.cashloom-profile",
      EVALUATED_AT,
    );

    expect(decision).toMatchObject({
      state: "evidence-unavailable",
      proposed_response: "isolate",
      effective_response: "observe",
      effects: {
        changes_account_state: false,
        changes_trade_state: false,
        moves_or_holds_money: false,
      },
    });
  });
});
