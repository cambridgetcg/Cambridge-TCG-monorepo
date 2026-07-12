import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isAdmin: vi.fn(),
  updateAuction: vi.fn(),
  deleteAuction: vi.fn(),
  placeBid: vi.fn(),
  query: vi.fn(),
  sendOutbidEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/auction/db", () => ({
  updateAuction: mocks.updateAuction,
  deleteAuction: mocks.deleteAuction,
  placeBid: mocks.placeBid,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/auction/email", () => ({
  sendOutbidEmail: mocks.sendOutbidEmail,
}));
vi.mock("@/lib/format", () => ({ formatPrice: (value: number) => `£${value}` }));

import { GET as getDetail } from "./route";
import { GET as getBids, POST as placeBid } from "./bids/route";

const context = { params: Promise.resolve({ id: "auction-1" }) };

describe("public auction detail boundary", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("fails the mixed public detail route closed without database or auth work", async () => {
    const response = await getDetail(
      new NextRequest("https://example.test/api/auctions/auction-1"),
      context,
    );

    expect(response.status).toBe(503);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.updateAuction).not.toHaveBeenCalled();
  });

  it("fails public raw bid history closed without querying", async () => {
    const response = await getBids(
      new Request("https://example.test/api/auctions/auction-1/bids"),
      context,
    );

    expect(response.status).toBe(503);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.placeBid).not.toHaveBeenCalled();
  });

  it("projects a successful bid into a strict caller receipt", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "bidder-1" } });
    mocks.placeBid.mockResolvedValue({
      success: true,
      bid: {
        id: "own-bid-1",
        user_id: "bidder-1",
        amount: "42.00",
        is_best_offer: true,
        private_marker: "must-not-leak",
      },
      auction: {
        id: "auction-1",
        status: "live",
        current_price: "50.00",
        bid_count: 2,
        ends_at: "2026-07-12T12:00:00.000Z",
        reserve_price: "500.00",
        seller_user_id: "seller-secret",
        winner_user_id: "winner-secret",
        stripe_payment_intent: "pi_secret",
        seller_payout: "999.00",
        shipping_address: { line1: "private" },
      },
    });

    const response = await placeBid(
      new Request("https://example.test/api/auctions/auction-1/bids", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 42, is_best_offer: true }),
      }),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      bid_id: "own-bid-1",
      current_price: "50.00",
      bid_count: 2,
      ends_at: "2026-07-12T12:00:00.000Z",
      status: "live",
    });
    expect(JSON.stringify(body)).not.toMatch(
      /reserve|seller|winner|stripe|payout|shipping|private_marker|user_id|amount/,
    );
  });
});
