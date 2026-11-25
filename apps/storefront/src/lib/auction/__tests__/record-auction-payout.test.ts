import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), createTransferToSeller: vi.fn(), notify: vi.fn(), sendStatusEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: vi.fn() }));
vi.mock("@/lib/payouts/stripe-connect", () => ({ createTransferToSeller: mocks.createTransferToSeller }));
vi.mock("@/lib/notifications/db", () => ({ notify: mocks.notify }));
vi.mock("@/lib/market/email", () => ({ sendStatusEmail: mocks.sendStatusEmail }));
vi.mock("@/lib/social/db", () => ({ postActivity: vi.fn(), awardAchievement: vi.fn() }));
vi.mock("@/lib/auction/lifecycle-log", () => ({ logAuctionTransition: vi.fn() }));
vi.mock("@/lib/escrow/trust-engine", () => ({ calculateTrustScore: vi.fn(async () => 0) }));
vi.mock("@/lib/admin/governance-log", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/trust/standing-lock", () => ({ lockTradeStanding: vi.fn() }));
vi.mock("@/lib/users/response-window", () => ({ paymentExpiresAtForBuyer: vi.fn() }));

import { AUCTION_BUYER_NOT_PAID_ERROR, AUCTION_NOT_OWED_ERROR, owedAuctionSql } from "@/lib/payouts/owed";
import { recordAuctionPayout, updateAuction } from "../db";

const owed = {
  status: "paid", paid_at: "2026-11-01 00:00:00+00", seller_paid_at: null, seller_payout: "45.50",
  seller_user_id: "s", title: "Lot", owed: true, seller_email: null,
};
let row: Record<string, unknown> = owed;
const updates = () => mocks.query.mock.calls.filter(([sql]) => /^\s*UPDATE/.test(sql as string));

beforeEach(() => {
  vi.resetAllMocks();
  row = { ...owed };
  mocks.createTransferToSeller.mockResolvedValue({ transferId: "tr_1" });
  mocks.query.mockImplementation(async (sql: string) => (/^\s*UPDATE/.test(sql) ? { rows: [{ id: "a1" }] } : { rows: [row] }));
});

function expectNothingMoved() {
  expect(mocks.createTransferToSeller).not.toHaveBeenCalled();
  expect(updates()).toEqual([]);
  expect(mocks.notify).not.toHaveBeenCalled();
}

describe("recordAuctionPayout", () => {
  for (const method of ["bank_transfer", "paypal", "crypto", "stripe_connect", "store_credit", "other"]) {
    it(`refuses by ${method} an auction marked paid by hand, with no winner payment recorded`, async () => {
      row = { ...owed, paid_at: null, owed: false };
      expect(await recordAuctionPayout({ auctionId: "a1", method, reference: "R" })).toEqual({ ok: false, error: AUCTION_BUYER_NOT_PAID_ERROR });
      expectNothingMoved();
    });
    it(`refuses by ${method} anything else the shared rule leaves out, and any answer but true`, async () => {
      for (const answer of [false, null, undefined, "t", 1]) {
        row = { ...owed, owed: answer };
        expect(await recordAuctionPayout({ auctionId: "a1", method, reference: "R" }), String(answer)).toEqual({ ok: false, error: AUCTION_NOT_OWED_ERROR });
      }
      expectNothingMoved();
    });
  }
  it("keeps the earlier, more specific refusals", async () => {
    row = { ...owed, seller_user_id: null, owed: false };
    expect(await recordAuctionPayout({ auctionId: "a1", method: "other" })).toEqual({ ok: false, error: "This auction has no seller to pay." });
    row = { ...owed, seller_paid_at: "2026-11-02 00:00:00+00", owed: false };
    expect(await recordAuctionPayout({ auctionId: "a1", method: "other" })).toEqual({ ok: false, error: "Payout already recorded." });
    row = { ...owed, status: "ended", paid_at: null, owed: false };
    expect(await recordAuctionPayout({ auctionId: "a1", method: "other" })).toEqual({ ok: false, error: "Cannot pay seller until auction is paid (currently ended)." });
    row = { ...owed, seller_payout: null, owed: false };
    expect(await recordAuctionPayout({ auctionId: "a1", method: "other" })).toEqual({ ok: false, error: "No seller_payout calculated yet — run calculate_payout first." });
    expectNothingMoved();
  });
  it("reads the shared rule with the row, and pays an owed auction once", async () => {
    expect(await recordAuctionPayout({ auctionId: "a1", method: "stripe_connect" })).toEqual({ ok: true, transferId: "tr_1" });
    expect(mocks.query.mock.calls[0][0] as string).toContain(`${owedAuctionSql("a")} AS owed`);
    expect(mocks.createTransferToSeller).toHaveBeenCalledTimes(1);
    expect(mocks.createTransferToSeller.mock.calls[0][0]).toMatchObject({ sellerUserId: "s", amountGbp: 45.5, idempotencyKey: "payout-auction-a1" });
    expect(updates()).toHaveLength(1);
    expect(updates()[0][1]).toEqual(["a1", "stripe_connect", "tr_1", "tr_1"]);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
  it("records a payout made elsewhere, tells the seller, and makes no transfer", async () => {
    row = { ...owed, seller_email: "seller@example.test" };
    mocks.sendStatusEmail.mockResolvedValue(undefined);
    expect(await recordAuctionPayout({ auctionId: "a1", method: "bank_transfer", reference: "R" })).toEqual({ ok: true, transferId: undefined });
    expect(mocks.createTransferToSeller).not.toHaveBeenCalled();
    expect(updates()[0][1]).toEqual(["a1", "bank_transfer", "R", null]);
    expect(mocks.sendStatusEmail.mock.calls.map(([m]) => m.email)).toEqual(["seller@example.test"]);
  });
  it("records nothing when the transfer fails", async () => {
    mocks.createTransferToSeller.mockRejectedValue(new Error("account closed"));
    expect(await recordAuctionPayout({ auctionId: "a1", method: "stripe_connect" })).toEqual({ ok: false, error: "account closed" });
    expect(updates()).toEqual([]);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

describe("an auction marked paid by hand", () => {
  it("records no payment by the winner", async () => {
    await updateAuction("a1", { status: "paid" });
    expect(updates()).toHaveLength(1);
    expect(updates()[0][0] as string).not.toContain("paid_at");
  });
});
