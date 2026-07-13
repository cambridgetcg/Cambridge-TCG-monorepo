import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuctionDetail } from "../types";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getAuction: vi.fn(),
  getTrustTier: vi.fn((score: number) => ({
    name: score >= 50 ? "Trusted" : "New",
  })),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/auction/db", () => ({ getAuction: mocks.getAuction }));
vi.mock("@/lib/escrow/trust-engine", () => ({
  getTrustTier: mocks.getTrustTier,
}));

import {
  loadAuctionState,
  projectAuctionSellerForPublic,
} from "../state";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const BID_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_USER_ID = "44444444-4444-4444-8444-444444444444";

const detail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Public auction",
  description: null,
  auction_type: "english",
  status: "ended",
  starting_price: "10.00",
  reserve_price: null,
  buy_now_price: null,
  bid_increment: "1.00",
  dutch_start_price: null,
  dutch_end_price: null,
  dutch_price_drop: null,
  dutch_drop_interval_seconds: null,
  starts_at: "2026-07-10T10:00:00.000Z",
  ends_at: "2026-07-11T10:00:00.000Z",
  actual_end_at: "2026-07-11T10:00:00.000Z",
  current_price: "24.00",
  bid_count: 1,
  winner_user_id: USER_ID,
  paid_at: "2026-07-11T10:05:00.000Z",
  allow_best_offer: true,
  seller_user_id: USER_ID,
  is_consignment: true,
  approval_status: "approved",
  seller_commission_rate: "0.12",
  created_at: "2026-07-09T10:00:00.000Z",
  updated_at: "2026-07-11T10:05:00.000Z",
  images: [],
  bids: [
    {
      id: BID_ID,
      auction_id: "11111111-1111-4111-8111-111111111111",
      user_id: USER_ID,
      amount: "24.00",
      is_best_offer: false,
      status: "winning",
      created_at: "2026-07-11T09:59:00.000Z",
      user_name: "Private Bidder",
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      auction_id: "11111111-1111-4111-8111-111111111111",
      user_id: OFFER_USER_ID,
      amount: "13.37",
      is_best_offer: true,
      status: "active",
      created_at: "2026-07-11T09:00:00.000Z",
      user_name: "Private Offerer",
    },
  ],
  server_time: "2026-07-11T10:06:00.000Z",
} as unknown as AuctionDetail;

describe("public auction state privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuction.mockResolvedValue(detail);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT u.username")) {
        return {
          rows: [
            {
              username: "private_seller",
              display_name: "Private Seller",
              is_public: true,
              is_suspended: true,
              trust_score: 87,
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it("fails closed for private, suspended, and incomplete seller publication", () => {
    const common = {
      username: "seller",
      display_name: "Seller Name",
      trust_score: 87,
    };

    for (const row of [
      { ...common, is_public: false, is_suspended: false },
      { ...common, is_public: true, is_suspended: true },
      { ...common, is_public: true, is_suspended: undefined },
    ]) {
      expect(projectAuctionSellerForPublic(row)).toEqual({
        username: null,
        display_name: null,
        trust_tier: null,
        trust_score: null,
        is_consignment: true,
      });
    }
  });

  it("publishes seller identity and trust only with a current receipt and no suspension", () => {
    expect(
      projectAuctionSellerForPublic({
        username: "seller",
        display_name: "Seller Name",
        is_public: true,
        profile_publication_notice_version: "person-publication-v1",
        profile_published_at: "2026-07-11T00:00:00.000Z",
        is_suspended: false,
        trust_score: 87,
      }),
    ).toEqual({
      username: "seller",
      display_name: "Seller Name",
      trust_tier: "Trusted",
      trust_score: 87,
      is_consignment: true,
    });
  });

  it("composes public bid and winner facts without person correlators", async () => {
    const state = await loadAuctionState(detail.id);

    expect(state?.bids).toEqual({
      recent: [
        {
          amount: 24,
          is_best_offer: false,
          status: "winning",
          created_at: "2026-07-11T09:59:00.000Z",
        },
      ],
      bid_count: 1,
    });
    expect(state?.winner).toEqual({ winning_bid: 24, paid: true });
    expect(state?.seller).toEqual({
      username: null,
      display_name: null,
      trust_tier: null,
      trust_score: null,
      is_consignment: true,
    });

    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("unique_bidders_count");
    expect(mocks.query).not.toHaveBeenCalledWith(
      expect.stringContaining("COUNT(DISTINCT user_id)"),
      expect.anything(),
    );
    for (const privateValue of [
      USER_ID,
      BID_ID,
      OFFER_USER_ID,
      "Private Bidder",
      "Private Offerer",
      "Private Seller",
      "private_seller",
      "13.37",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("uses the published fee instead of a seller-specific stored rate", async () => {
    mocks.getAuction.mockResolvedValue({
      ...detail,
      seller_commission_rate: "0.01",
    });

    const state = await loadAuctionState(detail.id);

    expect(state?.propagation.commission_rate).toBe(0.12);
    expect(state?.propagation.estimated_seller_payout_gbp).toBe(21.12);
    expect(state?.propagation.estimated_commission_gbp).toBe(2.88);
  });
});
