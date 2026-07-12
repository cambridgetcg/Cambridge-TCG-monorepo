import { describe, expect, it } from "vitest";
import {
  auctionRecordIsPublic,
  normalizeAuctionListStatus,
  PUBLIC_AUCTION_SQL_PREDICATE,
  projectAuctionBidsForPublic,
  projectAuctionForParticipant,
  projectAuctionForPublic,
  projectBidMutationResult,
} from "../public";
import type { AuctionDetail } from "../types";

const AUCTION_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const WINNER_ID = "33333333-3333-4333-8333-333333333333";
const BID_ID = "44444444-4444-4444-8444-444444444444";
const OFFER_ID = "55555555-5555-4555-8555-555555555555";
const USER_NAME = "Private Bidder Name";

function auctionFixture(): AuctionDetail {
  return {
    id: AUCTION_ID,
    title: "Public card title",
    description: "Public listing description",
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
    payment_expires_at: "2026-07-13T10:00:00.000Z",
    allow_best_offer: true,
    seller_user_id: SELLER_ID,
    is_consignment: true,
    approval_status: "approved",
    approval_notes: "Private operator note",
    seller_commission_rate: "0.12",
    seller_payout: "21.12",
    seller_paid_at: null,
    escrow_status: "paid",
    tracking_to_ctcg: "PRIVATE-TRACKING-1",
    tracking_to_buyer: "PRIVATE-TRACKING-2",
    seller_shipped_at: null,
    received_by_ctcg_at: null,
    shipped_to_buyer_at: null,
    buyer_received_at: null,
    carrier_to_ctcg: null,
    carrier_to_buyer: null,
    shipping_address: {
      name: "Private Winner",
      line1: "1 Private Street",
      line2: undefined,
      city: "Cambridge",
      postal_code: "CB1 1AA",
      country: "GB",
    },
    created_at: "2026-07-09T10:00:00.000Z",
    updated_at: "2026-07-11T10:05:00.000Z",
    images: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        auction_id: AUCTION_ID,
        url: "https://images.example.test/public-card.jpg",
        s3_key: "private-storage-key",
        display_order: 0,
        created_at: "2026-07-09T10:00:00.000Z",
      },
    ],
    bids: [
      {
        id: BID_ID,
        auction_id: AUCTION_ID,
        user_id: WINNER_ID,
        amount: "24.00",
        is_best_offer: false,
        status: "winning",
        created_at: "2026-07-11T09:59:00.000Z",
        user_name: USER_NAME,
      },
      {
        id: OFFER_ID,
        auction_id: AUCTION_ID,
        user_id: SELLER_ID,
        amount: "13.37",
        is_best_offer: true,
        status: "active",
        created_at: "2026-07-11T09:00:00.000Z",
        user_name: "Private Offerer",
      },
    ],
    server_time: "2026-07-11T10:06:00.000Z",
    ...({
      payout_method: "bank",
      payout_reference: "private-reference",
      stripe_transfer_id: "tr_private",
      trust_score: 99,
      future_sensitive_column: "must-not-cross-the-boundary",
    } as Record<string, unknown>),
  };
}

describe("public auction projections", () => {
  it("keeps useful auction facts while excluding internal and person fields", () => {
    const projected = projectAuctionForPublic(auctionFixture());
    const serialized = JSON.stringify(projected);

    expect(projected).toMatchObject({
      title: "Public card title",
      current_price: "24.00",
      bid_count: 1,
      starts_at: "2026-07-10T10:00:00.000Z",
      ends_at: "2026-07-11T10:00:00.000Z",
      reserve_met: true,
      images: [
        { url: "https://images.example.test/public-card.jpg", display_order: 0 },
      ],
      bids: [
        {
          amount: "24.00",
          is_best_offer: false,
          status: "winning",
          created_at: "2026-07-11T09:59:00.000Z",
        },
      ],
    });
    expect(projected).not.toHaveProperty("id");
    for (const privateValue of [
      AUCTION_ID,
      SELLER_ID,
      WINNER_ID,
      BID_ID,
      OFFER_ID,
      USER_NAME,
      "Private Offerer",
      "13.37",
      "cs_private",
      "1 Private Street",
      "must-not-cross-the-boundary",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("can retain only the auction id for a signed-in non-participant", () => {
    const projected = projectAuctionForPublic(auctionFixture(), {
      includeAuctionId: true,
    });

    expect(projected.id).toBe(AUCTION_ID);
    expect(projected.bids[0]).not.toHaveProperty("user_id");
    expect(projected.bids[0]).not.toHaveProperty("id");
  });

  it("publishes regular bid price/time events and keeps best offers private", () => {
    expect(projectAuctionBidsForPublic(auctionFixture().bids)).toEqual([
      {
        amount: "24.00",
        is_best_offer: false,
        status: "winning",
        created_at: "2026-07-11T09:59:00.000Z",
      },
    ]);
  });

  it("uses one publication rule and accepts both scheduled status names", () => {
    expect(auctionRecordIsPublic(auctionFixture())).toBe(true);
    expect(
      auctionRecordIsPublic({
        status: "draft",
        is_consignment: false,
        approval_status: null,
      }),
    ).toBe(false);
    expect(
      auctionRecordIsPublic({
        status: "scheduled",
        is_consignment: true,
        approval_status: "pending_review",
      }),
    ).toBe(false);
    expect(normalizeAuctionListStatus("scheduled")).toBe("scheduled");
    expect(normalizeAuctionListStatus("upcoming")).toBe("scheduled");
    expect(normalizeAuctionListStatus("anything-else")).toBeNull();
    expect(PUBLIC_AUCTION_SQL_PREDICATE).toContain("a.status IN ('scheduled'");
    expect(PUBLIC_AUCTION_SQL_PREDICATE).toContain("a.approval_status = 'approved'");
  });

  it("gives a winner only their settlement view", () => {
    const projected = projectAuctionForParticipant(
      auctionFixture(),
      "winner",
      WINNER_ID,
    );
    const serialized = JSON.stringify(projected);

    expect(projected.viewer_role).toBe("winner");
    expect(projected.payment_expires_at).toBe("2026-07-13T10:00:00.000Z");
    expect(projected.shipping_address?.line1).toBe("1 Private Street");
    expect(projected.tracking_to_buyer).toBe("PRIVATE-TRACKING-2");
    expect(projected.tracking_to_ctcg).toBeNull();
    expect(projected.bids).toHaveLength(1);
    expect(projected.bids[0].is_own).toBe(true);
    for (const privateValue of [
      SELLER_ID,
      BID_ID,
      OFFER_ID,
      "Private Offerer",
      "13.37",
      "cs_private",
      "Private operator note",
      "21.12",
      "private-reference",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("gives a seller private offer events without bidder identity or payment internals", () => {
    const projected = projectAuctionForParticipant(
      auctionFixture(),
      "seller",
      SELLER_ID,
    );
    const serialized = JSON.stringify(projected);

    expect(projected.viewer_role).toBe("seller");
    expect(projected.bids).toHaveLength(2);
    expect(projected.bids[1]).toMatchObject({
      amount: "13.37",
      is_best_offer: true,
      status: "active",
    });
    expect(projected.tracking_to_ctcg).toBe("PRIVATE-TRACKING-1");
    expect(projected.shipping_address).toBeNull();
    expect(projected.approval_notes).toBe("Private operator note");
    expect(projected.seller_payout).toBe("21.12");
    expect(projected.reserve_price).toBe("20.00");
    for (const privateValue of [
      WINNER_ID,
      BID_ID,
      OFFER_ID,
      USER_NAME,
      "Private Offerer",
      "cs_private",
      "1 Private Street",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("projects a successful bid mutation instead of returning the raw auction row", () => {
    const raw = auctionFixture();
    const projected = projectBidMutationResult({
      success: true,
      bid: raw.bids[0],
      auction: raw,
    });
    const serialized = JSON.stringify(projected);

    expect(projected).toMatchObject({
      success: true,
      bid: { amount: "24.00", is_own: true },
      auction: { current_price: "24.00", bid_count: 1, status: "ended" },
    });
    for (const privateValue of [
      AUCTION_ID,
      SELLER_ID,
      WINNER_ID,
      BID_ID,
      "cs_private",
      "Private operator note",
      "21.12",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});
