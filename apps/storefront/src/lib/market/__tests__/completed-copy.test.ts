import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), sendStatusEmail: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: async (work: (q: unknown) => Promise<unknown>) => work(mocks.query),
}));
vi.mock("../email", () => ({
  sendStatusEmail: mocks.sendStatusEmail,
  sendBuyerMatchEmail: vi.fn(), sendSellerMatchEmail: vi.fn(), sendCancelEmail: vi.fn(),
}));
vi.mock("@/lib/notifications/db", () => ({ notify: mocks.notify }));
vi.mock("@/lib/social/db", () => ({ postActivity: vi.fn(), awardAchievement: vi.fn() }));

import { confirmReceived, runTradeCompletionSweep } from "../completion";
import { notifyTradeStatusChange, updateEscrowStatus } from "../db";

const trade = (buyer_paid_at: string | null) =>
  ({ id: "t1", escrow_status: "completed", seller_payout: "9.20", buyer_paid_at }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.sendStatusEmail.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ rows: [{ buyer_id: "b", buyer_email: "b@example.test", seller_id: "s", seller_email: "s@example.test", card_name: "Card" }] });
});

describe("the completion message", () => {
  const mailTo = (email: string) => mocks.sendStatusEmail.mock.calls.map(([m]) => m).find((m) => m.email === email);
  const bellOf = (userId: string) => mocks.notify.mock.calls.map(([n]) => n).find((n) => n.userId === userId);

  it("promises the seller the payout when the buyer paid", async () => {
    await notifyTradeStatusChange(trade("2026-11-01 00:00:00+00"));
    expect(mailTo("s@example.test").body).toContain("£9.20");
    expect(bellOf("s").title).toBe("Trade complete: Card — payout £9.20");
  });
  it("promises the seller none when no buyer payment is recorded, and says so", async () => {
    await notifyTradeStatusChange(trade(null));
    const mail = mailTo("s@example.test");
    expect(mail.heading).toBe("Trade complete");
    expect(mail.body).toBe(
      "Trade for <strong>Card</strong> is complete. No buyer payment is recorded for it, so no payout is due. If the buyer has paid, contact support.",
    );
    expect(bellOf("s").title).toBe("Trade complete: Card");
  });
  it("tells the buyer the same either way", async () => {
    for (const paid of ["2026-11-01 00:00:00+00", null]) {
      mocks.sendStatusEmail.mockClear();
      mocks.notify.mockClear();
      await notifyTradeStatusChange(trade(paid));
      expect(mailTo("b@example.test").body).toBe("Your trade for <strong>Card</strong> is complete. Thanks for trading on Cambridge TCG.");
      expect(bellOf("b").title).toBe("Trade complete: Card");
    }
  });
});

// The message reads buyer_paid_at from the row the completing UPDATE returns.
// A narrower RETURNING would tell a seller whose buyer paid that no payment is
// recorded.
describe("every path that completes a trade returns the whole row", () => {
  const completing = () => mocks.query.mock.calls.map(([sql]) => sql as string).filter((sql) => /^\s*UPDATE market_trades\b/.test(sql));
  function expectWholeRow() {
    expect(completing()).toHaveLength(1);
    expect(completing()[0]).toMatch(/RETURNING \*\s*$/);
  }

  it("an admin", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await updateEscrowStatus("t1", "completed");
    expectWholeRow();
  });
  it("the buyer's confirmation", async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("FOR UPDATE") ? { rows: [{ id: "t1", buyer_id: "b", escrow_status: "shipped_to_buyer", escrow_tier: "direct" }] } : { rows: [] });
    await confirmReceived("t1", "b");
    expectWholeRow();
  });
  it("the dispute window's end", async () => {
    mocks.query.mockImplementation(async (sql: string) => (/^\s*SELECT t\.id/.test(sql) ? { rows: [{ id: "t1" }] } : { rows: [] }));
    await runTradeCompletionSweep();
    expectWholeRow();
  });
});
