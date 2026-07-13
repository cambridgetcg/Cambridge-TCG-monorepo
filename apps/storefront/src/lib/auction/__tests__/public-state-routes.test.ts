import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuctionStateShape } from "../state";

const mocks = vi.hoisted(() => ({
  loadAuctionState: vi.fn(),
  auctionStateIsPublic: vi.fn(),
}));

vi.mock("@/lib/auction/state", () => ({
  loadAuctionState: mocks.loadAuctionState,
  auctionStateIsPublic: mocks.auctionStateIsPublic,
}));
vi.mock("@/lib/data-pantry", () => ({
  jsonResponse: (options: { data: unknown; no_cache?: boolean }) =>
    new Response(JSON.stringify({ data: options.data }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": options.no_cache ? "no-store" : "public",
      },
    }),
  errorResponse: (options: unknown) =>
    new Response(JSON.stringify(options), { status: 404 }),
}));

import { GET as getV1Auction } from "@/app/api/v1/auctions/[id]/route";
import { GET as getUniversalAuction } from "@/app/api/v1/universal/auctions/[id]/route";

const AUCTION_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";

function stateFixture(): AuctionStateShape {
  return {
    meta: {
      id: AUCTION_ID,
      title: "Public auction",
      description: null,
      auction_type: "english",
      status: "ended",
      is_consignment: true,
      approval_status: "approved",
      created_at: "2026-07-09T10:00:00.000Z",
      updated_at: "2026-07-11T10:05:00.000Z",
    },
    images: [],
    pricing: {
      starting_price: 10,
      current_price: 24,
      bid_increment: 1,
      buy_now_price: null,
      min_next_bid: 25,
      dutch_computed_price: null,
      dutch: null,
      allow_best_offer: false,
    },
    timing: {
      starts_at: "2026-07-10T10:00:00.000Z",
      ends_at: "2026-07-11T10:00:00.000Z",
      actual_end_at: "2026-07-11T10:00:00.000Z",
      time_remaining_ms: null,
      time_remaining: null,
      has_started: true,
      has_ended: true,
    },
    reserve: { reserve_met: null },
    bids: {
      recent: [
        {
          amount: 24,
          is_best_offer: false,
          status: "winning",
          created_at: "2026-07-11T09:59:00.000Z",
        },
      ],
      bid_count: 1,
    },
    winner: { winning_bid: 24, paid: true },
    seller: {
      username: null,
      display_name: null,
      trust_tier: null,
      trust_score: null,
      is_consignment: true,
    },
    propagation: {
      commission_rate: 0.12,
      commission_rate_display: "12%",
      payout_hold_days: 3,
      escrow_flow: "ctcg_mediated",
      estimated_seller_payout_gbp: 21.12,
      estimated_commission_gbp: 2.88,
      methodology_urls: {
        commission_rate: "/methodology/commission-rate",
        payout_hold: "/methodology/payout-hold",
        escrow_tier: "/methodology/escrow-tier",
      },
    },
    _provenance: {
      kind: "live",
      queried_at: "2026-07-11T10:06:00.000Z",
      notes: "Public person-free state",
      sources: ["auctions", "auction_bids"],
      methodology_url: "/methodology/auctions",
    },
  };
}

const context = { params: Promise.resolve({ id: AUCTION_ID }) };

describe("public auction state routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auctionStateIsPublic.mockResolvedValue(true);
    mocks.loadAuctionState.mockResolvedValue(stateFixture());
  });

  it("serves the v1 public state without shared caching", async () => {
    const response = await getV1Auction(new Request("https://example.test"), context);
    const body = await response.json();

    expect(body.data.bids.recent[0]).toEqual({
      amount: 24,
      is_best_offer: false,
      status: "winning",
      created_at: "2026-07-11T09:59:00.000Z",
    });
    expect(body.data.winner).toEqual({ winning_bid: 24, paid: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not translate hidden bidder or winner fields into universal output", async () => {
    const state = stateFixture();
    Object.assign(state.bids.recent[0], {
      anonymous_bidder_id: PERSON_ID,
      trust_tier: "Elite",
      trust_score: 99,
    });
    Object.assign(state.winner!, {
      anonymous_winner_id: PERSON_ID,
      trust_tier: "Elite",
      trust_score: 99,
    });
    mocks.loadAuctionState.mockResolvedValue(state);

    const response = await getUniversalAuction(
      new Request("https://example.test"),
      context,
    );
    const body = await response.json();
    const personSections = JSON.stringify({
      bidding: body.bidding,
      winner: body.winner,
    });

    expect(body.bidding.recent[0]).toEqual({
      amount_gbp: 24,
      amount_to_starting_ratio: 2.4,
      is_best_offer: false,
      status_name: "winning",
      at: {
        iso: "2026-07-11T09:59:00.000Z",
        epoch: 1783763940,
      },
    });
    expect(body.bidding).not.toHaveProperty("unique_bidders_count");
    expect(body.winner).toEqual({
      winning_bid_gbp: 24,
      winning_to_starting_ratio: 2.4,
      paid: true,
    });
    expect(personSections).not.toContain(PERSON_ID);
    expect(personSections).not.toContain("trust");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
