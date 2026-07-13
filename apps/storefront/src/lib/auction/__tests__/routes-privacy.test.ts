import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AuctionDetail, Bid } from "../types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isAdmin: vi.fn(),
  getAuction: vi.fn(),
  getBidHistory: vi.fn(),
  updateAuction: vi.fn(),
  deleteAuction: vi.fn(),
  placeBid: vi.fn(),
  listAuctions: vi.fn(),
  createAuction: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/auction/db", () => ({
  getAuction: mocks.getAuction,
  getBidHistory: mocks.getBidHistory,
  updateAuction: mocks.updateAuction,
  deleteAuction: mocks.deleteAuction,
  placeBid: mocks.placeBid,
  listAuctions: mocks.listAuctions,
  createAuction: mocks.createAuction,
}));
vi.mock("@/lib/market/db", () => ({ resolveCatalogCard: vi.fn() }));
vi.mock("@/lib/auction/email", () => ({ sendOutbidEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/format", () => ({ formatPrice: (value: number) => `£${value}` }));

import {
  DELETE as deleteAuctionRoute,
  GET as getAuctionRoute,
  PATCH as updateAuctionRoute,
} from "@/app/api/auctions/[id]/route";
import {
  GET as getBidsRoute,
  POST as placeBidRoute,
} from "@/app/api/auctions/[id]/bids/route";
import { GET as listAuctionsRoute } from "@/app/api/auctions/route";

const AUCTION_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const WINNER_ID = "33333333-3333-4333-8333-333333333333";
const BID_ID = "44444444-4444-4444-8444-444444444444";
const OFFER_ID = "55555555-5555-4555-8555-555555555555";

const bids: Bid[] = [
  {
    id: BID_ID,
    auction_id: AUCTION_ID,
    user_id: WINNER_ID,
    amount: "24.00",
    is_best_offer: false,
    status: "winning",
    created_at: "2026-07-11T09:59:00.000Z",
    user_name: "Private Bidder",
  },
  {
    id: OFFER_ID,
    auction_id: AUCTION_ID,
    user_id: "77777777-7777-4777-8777-777777777777",
    amount: "13.37",
    is_best_offer: true,
    status: "active",
    created_at: "2026-07-11T09:00:00.000Z",
    user_name: "Private Offerer",
  },
];

const auction = {
  id: AUCTION_ID,
  title: "Public auction",
  description: null,
  sku: "op01-001",
  condition: "NM",
  auction_type: "english",
  status: "ended",
  starting_price: "10.00",
  reserve_price: "20.00",
  buy_now_price: null,
  bid_increment: "1.00",
  dutch_start_price: null,
  dutch_end_price: null,
  dutch_price_drop: null,
  dutch_drop_interval_seconds: null,
  starts_at: "2026-07-10T10:00:00.000Z",
  ends_at: "2026-07-11T10:00:00.000Z",
  actual_end_at: "2026-07-11T10:00:01.000Z",
  current_price: "24.00",
  bid_count: 1,
  winner_user_id: WINNER_ID,
  stripe_session_id: "cs_private",
  stripe_payment_intent: "pi_private",
  paid_at: "2026-07-11T10:05:00.000Z",
  payment_expires_at: null,
  allow_best_offer: true,
  seller_user_id: SELLER_ID,
  is_consignment: true,
  approval_status: "approved",
  approval_notes: "Private operator note",
  seller_commission_rate: "0.12",
  seller_payout: "21.12",
  seller_paid_at: null,
  escrow_status: "paid",
  tracking_to_ctcg: null,
  tracking_to_buyer: null,
  seller_shipped_at: null,
  received_by_ctcg_at: null,
  shipped_to_buyer_at: null,
  buyer_received_at: null,
  carrier_to_ctcg: null,
  carrier_to_buyer: null,
  shipping_address: null,
  created_at: "2026-07-09T10:00:00.000Z",
  updated_at: "2026-07-11T10:05:00.000Z",
  images: [],
  bids,
  server_time: "2026-07-11T10:06:00.000Z",
} as AuctionDetail;

const context = { params: Promise.resolve({ id: AUCTION_ID }) };

describe("auction route privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.isAdmin.mockResolvedValue(false);
    mocks.getAuction.mockResolvedValue(auction);
    mocks.getBidHistory.mockResolvedValue(bids);
    mocks.listAuctions.mockResolvedValue({ auctions: [], total: 0 });
  });

  it("returns an allowlisted auction without any UUID or person detail anonymously", async () => {
    const response = await getAuctionRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}`) as never,
      context,
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body).toMatchObject({ current_price: "24.00", bid_count: 1 });
    expect(body.bids).toEqual([
      {
        amount: "24.00",
        is_best_offer: false,
        status: "winning",
        created_at: "2026-07-11T09:59:00.000Z",
      },
    ]);
    for (const privateValue of [
      AUCTION_ID,
      SELLER_ID,
      WINNER_ID,
      BID_ID,
      OFFER_ID,
      "Private Bidder",
      "Private Offerer",
      "13.37",
      "cs_private",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses the same non-cacheable response for a missing auction", async () => {
    mocks.getAuction.mockResolvedValue(null);

    const response = await getAuctionRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}`) as never,
      context,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects malformed auction IDs before auth or database work on public reads", async () => {
    const malformedContext = { params: Promise.resolve({ id: "1" }) };

    const [detailResponse, bidsResponse] = await Promise.all([
      getAuctionRoute(
        new Request("https://example.test/api/auctions/1") as never,
        malformedContext,
      ),
      getBidsRoute(
        new Request("https://example.test/api/auctions/1/bids"),
        malformedContext,
      ),
    ]);

    for (const response of [detailResponse, bidsResponse]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Not found" });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.getAuction).not.toHaveBeenCalled();
    expect(mocks.getBidHistory).not.toHaveBeenCalled();
  });

  it("rejects malformed mutation IDs after authorization and before input or database work", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "88888888-8888-4888-8888-888888888888" },
    });
    mocks.isAdmin.mockResolvedValue(true);
    const malformedContext = { params: Promise.resolve({ id: "1" }) };
    const invalidJson = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    };

    const [bidResponse, updateResponse, deleteResponse] = await Promise.all([
      placeBidRoute(
        new Request("https://example.test/api/auctions/1/bids", invalidJson),
        malformedContext,
      ),
      updateAuctionRoute(
        new NextRequest("https://example.test/api/auctions/1", {
          ...invalidJson,
          method: "PATCH",
        }),
        malformedContext,
      ),
      deleteAuctionRoute(
        new NextRequest("https://example.test/api/auctions/1", { method: "DELETE" }),
        malformedContext,
      ),
    ]);

    for (const response of [bidResponse, updateResponse, deleteResponse]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Not found" });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.getAuction).not.toHaveBeenCalled();
    expect(mocks.placeBid).not.toHaveBeenCalled();
    expect(mocks.updateAuction).not.toHaveBeenCalled();
    expect(mocks.deleteAuction).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("redacts auction update failures from the client response", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.isAdmin.mockResolvedValue(true);
    mocks.updateAuction.mockRejectedValue(
      new Error("invalid input syntax for type uuid: internal-database-detail"),
    );

    const response = await updateAuctionRoute(
      new NextRequest(`https://example.test/api/auctions/${AUCTION_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      }),
      context,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to update auction" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(errorLog).toHaveBeenCalledWith("[auction] Update failed:", expect.any(Error));
    errorLog.mockRestore();
  });

  it("gives the seller operational events without raw person or payment fields", async () => {
    mocks.auth.mockResolvedValue({ user: { id: SELLER_ID } });

    const response = await getAuctionRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}`) as never,
      context,
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.id).toBe(AUCTION_ID);
    expect(body.viewer_role).toBe("seller");
    expect(body.bids).toHaveLength(2);
    expect(body.bids[1]).toMatchObject({ amount: "13.37", is_best_offer: true });
    expect(body.approval_notes).toBe("Private operator note");
    expect(body.seller_payout).toBe("21.12");
    for (const privateValue of [
      SELLER_ID,
      WINNER_ID,
      BID_ID,
      OFFER_ID,
      "Private Bidder",
      "Private Offerer",
      "cs_private",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("gives the winner a personalized public bid tape without other offers", async () => {
    mocks.auth.mockResolvedValue({ user: { id: WINNER_ID } });

    const response = await getAuctionRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}`) as never,
      context,
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.viewer_role).toBe("winner");
    expect(body.bids).toEqual([
      {
        amount: "24.00",
        is_best_offer: false,
        status: "winning",
        created_at: "2026-07-11T09:59:00.000Z",
        is_own: true,
      },
    ]);
    for (const privateValue of [
      SELLER_ID,
      BID_ID,
      OFFER_ID,
      "Private Offerer",
      "13.37",
      "cs_private",
      "21.12",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("keeps the auction id but not participant detail for a signed-in outsider", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "88888888-8888-4888-8888-888888888888" },
    });

    const response = await getAuctionRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}`) as never,
      context,
    );
    const body = await response.json();

    expect(body.id).toBe(AUCTION_ID);
    expect(body).not.toHaveProperty("seller_user_id");
    expect(body.bids[0]).not.toHaveProperty("user_id");
  });

  it("returns person-free regular bid events anonymously", async () => {
    const response = await getBidsRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}/bids`),
      context,
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.bids).toEqual([
      {
        amount: "24.00",
        is_best_offer: false,
        status: "winning",
        created_at: "2026-07-11T09:59:00.000Z",
      },
    ]);
    for (const privateValue of [
      AUCTION_ID,
      WINNER_ID,
      BID_ID,
      OFFER_ID,
      "Private Bidder",
      "Private Offerer",
      "13.37",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("preserves full bid detail for an admin", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-user" } });
    mocks.isAdmin.mockResolvedValue(true);

    const response = await getBidsRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}/bids`),
      context,
    );
    const body = await response.json();

    expect(body.bids).toEqual(bids);
  });

  it("returns not-found for unpublished detail and bids outside seller/admin roles", async () => {
    mocks.getAuction.mockResolvedValue({
      ...auction,
      status: "draft",
      approval_status: "pending_review",
    });

    const [detailResponse, bidsResponse] = await Promise.all([
      getAuctionRoute(
        new Request(`https://example.test/api/auctions/${AUCTION_ID}`) as never,
        context,
      ),
      getBidsRoute(
        new Request(`https://example.test/api/auctions/${AUCTION_ID}/bids`),
        context,
      ),
    ]);

    expect(detailResponse.status).toBe(404);
    expect(bidsResponse.status).toBe(404);
  });

  it("keeps unpublished detail available to its seller", async () => {
    mocks.auth.mockResolvedValue({ user: { id: SELLER_ID } });
    mocks.getAuction.mockResolvedValue({
      ...auction,
      status: "draft",
      approval_status: "pending_review",
    });

    const response = await getAuctionRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}`) as never,
      context,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).viewer_role).toBe("seller");
  });

  it("returns a projected mutation result to an ordinary bidder", async () => {
    const bidderId = "88888888-8888-4888-8888-888888888888";
    mocks.auth.mockResolvedValue({ user: { id: bidderId } });
    mocks.placeBid.mockResolvedValue({
      success: true,
      bid: { ...bids[0], user_id: bidderId },
      auction,
    });

    const response = await placeBidRoute(
      new Request(`https://example.test/api/auctions/${AUCTION_ID}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 13.37, is_best_offer: true }),
      }),
      context,
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body).toMatchObject({
      success: true,
      bid: { amount: "24.00", is_own: true },
      auction: { current_price: "24.00", bid_count: 1 },
    });
    for (const privateValue of [
      AUCTION_ID,
      SELLER_ID,
      WINNER_ID,
      BID_ID,
      bidderId,
      "cs_private",
      "Private operator note",
      "21.12",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("publication-gates list reads and accepts the UI's scheduled status", async () => {
    const response = await listAuctionsRoute(
      new NextRequest("https://example.test/api/auctions?status=scheduled&limit=40"),
    );

    expect(mocks.listAuctions).toHaveBeenCalledWith(
      { status: "scheduled", type: undefined, limit: 40, offset: undefined },
      { includeUnpublished: false },
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("allows an admin to request the unfiltered auction list", async () => {
    mocks.isAdmin.mockResolvedValue(true);

    await listAuctionsRoute(
      new NextRequest("https://example.test/api/auctions?limit=200"),
    );

    expect(mocks.listAuctions).toHaveBeenCalledWith(
      { status: undefined, type: undefined, limit: 200, offset: undefined },
      { includeUnpublished: true },
    );
  });
});
