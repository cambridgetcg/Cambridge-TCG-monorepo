import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createTransferToSeller: vi.fn(),
  sendPayoutEmail: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: vi.fn() }));
vi.mock("@/lib/payouts/stripe-connect", () => ({ createTransferToSeller: mocks.createTransferToSeller }));
vi.mock("../email", () => ({
  sendPayoutEmail: mocks.sendPayoutEmail,
  sendBuyerMatchEmail: vi.fn(), sendSellerMatchEmail: vi.fn(), sendCancelEmail: vi.fn(),
}));
vi.mock("@/lib/notifications/db", () => ({ notify: mocks.notify }));
vi.mock("@/lib/social/db", () => ({ postActivity: vi.fn(), awardAchievement: vi.fn() }));

import { owedTradeSql, TRADE_BUYER_NOT_PAID_ERROR, TRADE_NO_COMPLETION_TIME_ERROR, TRADE_NOT_OWED_ERROR } from "@/lib/payouts/owed";
import { recordTradePayout, updateEscrowStatus } from "../db";

const owed = {
  escrow_status: "completed", completed_at: "2026-11-02 00:00:00+00", buyer_paid_at: "2026-11-01 00:00:00+00", seller_paid_at: null,
  seller_payout: "9.20", seller_id: "s", owed: true, seller_email: "seller@example.test", card_name: "Card",
};
let row: Record<string, unknown> = owed;
const updates = () => mocks.query.mock.calls.filter(([sql]) => /^\s*UPDATE/.test(sql as string));

beforeEach(() => {
  vi.resetAllMocks();
  row = { ...owed };
  mocks.createTransferToSeller.mockResolvedValue({ transferId: "tr_1" });
  mocks.sendPayoutEmail.mockResolvedValue(undefined);
  mocks.query.mockImplementation(async (sql: string) =>
    /^\s*UPDATE/.test(sql) ? { rows: [{ id: "t1" }] } : { rows: [row] });
});

function expectNothingMoved() {
  expect(mocks.createTransferToSeller).not.toHaveBeenCalled();
  expect(updates()).toEqual([]);
  expect(mocks.sendPayoutEmail).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
}

describe("recordTradePayout", () => {
  for (const method of ["bank_transfer", "paypal", "crypto", "stripe_connect", "store_credit", "other"]) {
    it(`refuses an unpaid trade by ${method}, and moves and records nothing`, async () => {
      row = { ...owed, buyer_paid_at: null, owed: false };
      expect(await recordTradePayout({ tradeId: "t1", method, reference: "R" })).toEqual({ ok: false, error: TRADE_BUYER_NOT_PAID_ERROR });
      expectNothingMoved();
    });
    it(`refuses by ${method} anything else the shared rule leaves out, and any answer but true`, async () => {
      row = { ...owed, completed_at: null, owed: false };
      expect(await recordTradePayout({ tradeId: "t1", method, reference: "R" })).toEqual({ ok: false, error: TRADE_NO_COMPLETION_TIME_ERROR });
      for (const answer of [false, null, undefined, "t", 1]) {
        row = { ...owed, owed: answer };
        expect(await recordTradePayout({ tradeId: "t1", method, reference: "R" }), String(answer)).toEqual({ ok: false, error: TRADE_NOT_OWED_ERROR });
      }
      expectNothingMoved();
    });
  }
  it("reads the shared rule from the database with the row", async () => {
    await recordTradePayout({ tradeId: "t1", method: "bank_transfer" });
    expect((mocks.query.mock.calls[0][0] as string)).toContain(`${owedTradeSql("t")} AS owed`);
  });
  it("keeps the earlier, more specific refusals first", async () => {
    row = { ...owed, seller_paid_at: "2026-11-02 00:00:00+00", owed: false };
    expect(await recordTradePayout({ tradeId: "t1", method: "other" })).toEqual({ ok: false, error: "Payout already recorded for this trade." });
    row = { ...owed, escrow_status: "awaiting_payment", completed_at: null, buyer_paid_at: null, owed: false };
    expect(await recordTradePayout({ tradeId: "t1", method: "other" })).toEqual({
      ok: false, error: "Cannot pay seller until trade is completed (currently awaiting_payment).",
    });
    row = { ...owed, completed_at: null, buyer_paid_at: null, owed: false };
    expect(await recordTradePayout({ tradeId: "t1", method: "other" })).toEqual({ ok: false, error: TRADE_BUYER_NOT_PAID_ERROR });
    expectNothingMoved();
  });
  it("pays an owed trade once, under its own idempotency key", async () => {
    expect(await recordTradePayout({ tradeId: "t1", method: "stripe_connect" })).toEqual({ ok: true, transferId: "tr_1" });
    expect(mocks.createTransferToSeller).toHaveBeenCalledTimes(1);
    expect(mocks.createTransferToSeller.mock.calls[0][0]).toMatchObject({ sellerUserId: "s", amountGbp: 9.2, idempotencyKey: "payout-trade-t1" });
    expect(updates()).toHaveLength(1);
    expect(updates()[0][0]).toContain("seller_paid_at IS NULL");
    expect(updates()[0][1]).toEqual(["t1", "stripe_connect", "tr_1", "tr_1"]);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
  it("records a payout made elsewhere, tells the seller, and makes no transfer", async () => {
    expect(await recordTradePayout({ tradeId: "t1", method: "bank_transfer", reference: "R" })).toEqual({ ok: true, transferId: undefined });
    expect(mocks.createTransferToSeller).not.toHaveBeenCalled();
    expect(updates()[0][1]).toEqual(["t1", "bank_transfer", "R", null]);
    expect(mocks.sendPayoutEmail.mock.calls.map(([m]) => m.email)).toEqual(["seller@example.test"]);
  });
  it("records nothing when the transfer fails", async () => {
    mocks.createTransferToSeller.mockRejectedValue(new Error("account closed"));
    expect(await recordTradePayout({ tradeId: "t1", method: "stripe_connect" })).toEqual({ ok: false, error: "account closed" });
    expect(updates()).toEqual([]);
    expect(mocks.sendPayoutEmail).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

describe("an admin's Mark Paid", () => {
  it("records the buyer's payment, which the payout rule reads", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await updateEscrowStatus("t1", "paid");
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/SET escrow_status = \$1, .*buyer_paid_at = NOW\(\).* WHERE id = \$2 RETURNING \*$/);
    expect(params).toEqual(["paid", "t1"]);
  });
  it("and no other status does", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    for (const status of ["awaiting_payment", "awaiting_shipment", "shipped_to_ctcg", "received_by_ctcg", "verified", "shipped_to_buyer", "completed", "disputed", "refunded", "cancelled"]) {
      mocks.query.mockClear();
      await updateEscrowStatus("t1", status);
      expect(mocks.query.mock.calls[0][0] as string, status).not.toContain("buyer_paid_at");
    }
  });
});
