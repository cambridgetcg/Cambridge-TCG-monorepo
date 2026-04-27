export type AuctionType = "english" | "dutch" | "buy_now";
export type AuctionStatus = "draft" | "scheduled" | "live" | "ended" | "paid" | "cancelled";
export type BidStatus = "active" | "outbid" | "winning" | "rejected";

export interface Auction {
  id: string;
  title: string;
  description: string | null;
  auction_type: AuctionType;
  status: AuctionStatus;
  starting_price: string;
  reserve_price: string | null;
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
  winner_user_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  paid_at: string | null;
  payment_expires_at: string | null;
  allow_best_offer: boolean;
  // Customer-created auction fields
  seller_user_id: string | null;
  is_consignment: boolean;
  approval_status: "pending_review" | "approved" | "rejected" | null;
  approval_notes: string | null;
  seller_commission_rate: string;
  seller_payout: string | null;
  seller_paid_at: string | null;
  escrow_status: string | null;
  tracking_to_ctcg: string | null;
  tracking_to_buyer: string | null;
  // Fulfilment-chain timestamps (migration 0058). Power the customer
  // timeline + seller/buyer shipping UI. Auction.escrow_status remains
  // the current sub-state label during the physical handoff.
  seller_shipped_at: string | null;
  received_by_ctcg_at: string | null;
  shipped_to_buyer_at: string | null;
  buyer_received_at: string | null;
  carrier_to_ctcg: string | null;
  carrier_to_buyer: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionImage {
  id: string;
  auction_id: string;
  url: string;
  s3_key: string;
  display_order: number;
  created_at: string;
}

export interface Bid {
  id: string;
  auction_id: string;
  user_id: string;
  amount: string;
  is_best_offer: boolean;
  status: string;
  created_at: string;
  // Joined fields
  user_name?: string | null;
  user_email?: string;
}

export interface AuctionDetail extends Auction {
  images: AuctionImage[];
  bids: Bid[];
  computed_price?: number; // For Dutch auctions
  server_time: string;
}

export interface AuctionSummary {
  id: string;
  title: string;
  auction_type: AuctionType;
  status: AuctionStatus;
  current_price: string;
  starting_price: string;
  buy_now_price: string | null;
  bid_count: number;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
}

export interface CreateAuctionInput {
  title: string;
  description?: string;
  auction_type: AuctionType;
  starting_price: number;
  reserve_price?: number;
  buy_now_price?: number;
  bid_increment?: number;
  dutch_start_price?: number;
  dutch_end_price?: number;
  dutch_price_drop?: number;
  dutch_drop_interval_seconds?: number;
  starts_at: string;
  ends_at: string;
  allow_best_offer?: boolean;
  seller_user_id?: string;
  seller_commission_rate?: number;
}

export type ApprovalStatus = "pending_review" | "approved" | "rejected";

export const SELLER_COMMISSION_RATE = 0.12; // 12% default

export interface BidResult {
  success: boolean;
  bid?: Bid;
  error?: string;
  auction?: Auction;
}
