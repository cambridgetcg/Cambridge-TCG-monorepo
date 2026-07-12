import { isReserveMet } from "./lifecycle";
import type {
  AuctionDetail,
  AuctionShippingAddress,
  AuctionStatus,
  Bid,
  BidResult,
} from "./types";

export type AuctionViewerRole = "public" | "seller" | "winner" | "admin";

export const PUBLIC_AUCTION_SQL_PREDICATE =
  "a.status IN ('scheduled', 'live', 'ended', 'paid', 'cancelled') AND (COALESCE(a.is_consignment, FALSE) = FALSE OR a.approval_status = 'approved')";

const PUBLIC_AUCTION_STATUSES = new Set<AuctionStatus>([
  "scheduled",
  "live",
  "ended",
  "paid",
  "cancelled",
]);

export function auctionRecordIsPublic(record: {
  status: AuctionStatus;
  is_consignment: boolean;
  approval_status: AuctionDetail["approval_status"];
}): boolean {
  if (!PUBLIC_AUCTION_STATUSES.has(record.status)) return false;
  return !record.is_consignment || record.approval_status === "approved";
}

export function normalizeAuctionListStatus(
  status: string | undefined,
): "live" | "scheduled" | "ended" | null {
  if (status === "live") return "live";
  if (status === "scheduled" || status === "upcoming") return "scheduled";
  if (status === "ended") return "ended";
  return null;
}

/** A public bid is a market event, not a person record. */
export interface PublicAuctionBid {
  amount: string;
  is_best_offer: false;
  status: string;
  created_at: string;
  /** Present only in a signed-in viewer-specific projection. */
  is_own?: boolean;
}

export interface ParticipantAuctionBid {
  amount: string;
  is_best_offer: boolean;
  status: string;
  created_at: string;
  is_own?: boolean;
}

export interface PublicAuctionDetail {
  /** Included for signed-in non-participants so the bidding client keeps working. */
  id?: string;
  title: string;
  description: string | null;
  sku: string | null;
  condition: string | null;
  auction_type: AuctionDetail["auction_type"];
  status: AuctionDetail["status"];
  starting_price: string;
  buy_now_price: string | null;
  bid_increment: string;
  dutch_start_price: string | null;
  dutch_end_price: string | null;
  dutch_price_drop: string | null;
  dutch_drop_interval_seconds: number | null;
  starts_at: string;
  ends_at: string;
  actual_end_at: string | null;
  current_price: string;
  bid_count: number;
  reserve_met: boolean | null;
  allow_best_offer: boolean;
  is_consignment: boolean;
  created_at: string;
  updated_at: string;
  computed_price?: number;
  images: Array<{ url: string; display_order: number }>;
  bids: PublicAuctionBid[];
  server_time: string;
  viewer_role: "public";
}

export interface ParticipantAuctionDetail
  extends Omit<PublicAuctionDetail, "id" | "bids" | "viewer_role"> {
  id: string;
  viewer_role: "seller" | "winner";
  bids: ParticipantAuctionBid[];
  reserve_price: string | null;
  approval_status: AuctionDetail["approval_status"];
  approval_notes: string | null;
  seller_commission_rate: string | null;
  seller_payout: string | null;
  seller_paid_at: string | null;
  paid_at: string | null;
  payment_expires_at: string | null;
  escrow_status: string | null;
  seller_shipped_at: string | null;
  received_by_ctcg_at: string | null;
  shipped_to_buyer_at: string | null;
  buyer_received_at: string | null;
  tracking_to_ctcg: string | null;
  tracking_to_buyer: string | null;
  carrier_to_ctcg: string | null;
  carrier_to_buyer: string | null;
  shipping_address: AuctionShippingAddress | null;
}

export type AdminAuctionDetail = AuctionDetail & { viewer_role: "admin" };

export type InteractiveAuctionDetail =
  | (PublicAuctionDetail & { id: string })
  | ParticipantAuctionDetail
  | AdminAuctionDetail;

export function hasParticipantAuctionDetail(
  auction: InteractiveAuctionDetail,
): auction is ParticipantAuctionDetail {
  return auction.viewer_role === "seller" || auction.viewer_role === "winner";
}

/**
 * Publish regular price events only. Best offers are private proposals to the
 * seller; internal ids, user names and user trust never cross this boundary.
 */
export function projectAuctionBidsForPublic(
  bids: Bid[],
  viewerUserId?: string | null,
): PublicAuctionBid[] {
  return bids
    .filter((bid) => !bid.is_best_offer)
    .map((bid) => ({
      amount: bid.amount,
      is_best_offer: false,
      status: bid.status,
      created_at: bid.created_at,
      ...(viewerUserId ? { is_own: bid.user_id === viewerUserId } : {}),
    }));
}

export function projectAuctionBidsForSeller(bids: Bid[]): ParticipantAuctionBid[] {
  return bids.map((bid) => ({
    amount: bid.amount,
    is_best_offer: bid.is_best_offer,
    status: bid.status,
    created_at: bid.created_at,
  }));
}

function projectAuctionListing(
  auction: AuctionDetail,
): Omit<PublicAuctionDetail, "id" | "bids" | "viewer_role"> {
  const projected: Omit<PublicAuctionDetail, "id" | "bids" | "viewer_role"> = {
    title: auction.title,
    description: auction.description,
    sku: auction.sku,
    condition: auction.condition,
    auction_type: auction.auction_type,
    status: auction.status,
    starting_price: auction.starting_price,
    buy_now_price: auction.buy_now_price,
    bid_increment: auction.bid_increment,
    dutch_start_price: auction.dutch_start_price,
    dutch_end_price: auction.dutch_end_price,
    dutch_price_drop: auction.dutch_price_drop,
    dutch_drop_interval_seconds: auction.dutch_drop_interval_seconds,
    starts_at: auction.starts_at,
    ends_at: auction.ends_at,
    actual_end_at: auction.actual_end_at,
    current_price: auction.current_price,
    bid_count: auction.bid_count,
    reserve_met: isReserveMet(auction),
    allow_best_offer: auction.allow_best_offer,
    is_consignment: auction.is_consignment,
    created_at: auction.created_at,
    updated_at: auction.updated_at,
    images: auction.images.map((image) => ({
      url: image.url,
      display_order: image.display_order,
    })),
    server_time: auction.server_time,
  };
  if (auction.computed_price !== undefined) {
    projected.computed_price = auction.computed_price;
  }
  return projected;
}

/**
 * Allowlisted projection for readers who cannot see participant detail.
 *
 * Anonymous callers do not receive the auction UUID. A signed-in
 * non-participant may receive it because the interactive client needs the id
 * to place a first bid, but still receives no participant identifiers.
 */
export function projectAuctionForPublic(
  auction: AuctionDetail,
  options: { includeAuctionId?: boolean; viewerUserId?: string | null } = {},
): PublicAuctionDetail {
  const projected: PublicAuctionDetail = {
    ...projectAuctionListing(auction),
    bids: projectAuctionBidsForPublic(auction.bids, options.viewerUserId),
    viewer_role: "public",
  };
  if (options.includeAuctionId) {
    projected.id = auction.id;
  }
  return projected;
}

export function projectAuctionForParticipant(
  auction: AuctionDetail,
  role: "seller" | "winner",
  viewerUserId: string,
): ParticipantAuctionDetail {
  const seller = role === "seller";
  const winner = role === "winner";
  return {
    ...projectAuctionListing(auction),
    id: auction.id,
    viewer_role: role,
    bids: seller
      ? projectAuctionBidsForSeller(auction.bids)
      : projectAuctionBidsForPublic(auction.bids, viewerUserId),
    reserve_price: seller ? auction.reserve_price : null,
    approval_status: seller ? auction.approval_status : null,
    approval_notes: seller ? auction.approval_notes : null,
    seller_commission_rate: seller ? auction.seller_commission_rate : null,
    seller_payout: seller ? auction.seller_payout : null,
    seller_paid_at: seller ? auction.seller_paid_at : null,
    paid_at: auction.paid_at,
    payment_expires_at: winner ? auction.payment_expires_at : null,
    escrow_status: auction.escrow_status,
    seller_shipped_at: auction.seller_shipped_at,
    received_by_ctcg_at: auction.received_by_ctcg_at,
    shipped_to_buyer_at: auction.shipped_to_buyer_at,
    buyer_received_at: auction.buyer_received_at,
    tracking_to_ctcg: seller && auction.is_consignment ? auction.tracking_to_ctcg : null,
    tracking_to_buyer:
      winner || (seller && !auction.is_consignment) ? auction.tracking_to_buyer : null,
    carrier_to_ctcg: seller && auction.is_consignment ? auction.carrier_to_ctcg : null,
    carrier_to_buyer:
      winner || (seller && !auction.is_consignment) ? auction.carrier_to_buyer : null,
    shipping_address:
      winner || (seller && !auction.is_consignment) ? auction.shipping_address : null,
  };
}

export function projectAuctionForAdmin(auction: AuctionDetail): AdminAuctionDetail {
  return { ...auction, viewer_role: "admin" };
}

export interface ProjectedBidMutationResult {
  success: true;
  bid?: ParticipantAuctionBid & { is_own: true };
  auction?: Pick<
    AuctionDetail,
    "current_price" | "bid_count" | "status" | "ends_at" | "actual_end_at"
  >;
}

export function projectBidMutationResult(
  result: BidResult,
): ProjectedBidMutationResult {
  return {
    success: true,
    ...(result.bid
      ? {
          bid: {
            amount: result.bid.amount,
            is_best_offer: result.bid.is_best_offer,
            status: result.bid.status,
            created_at: result.bid.created_at,
            is_own: true,
          },
        }
      : {}),
    ...(result.auction
      ? {
          auction: {
            current_price: result.auction.current_price,
            bid_count: result.auction.bid_count,
            status: result.auction.status,
            ends_at: result.auction.ends_at,
            actual_end_at: result.auction.actual_end_at,
          },
        }
      : {}),
  };
}
