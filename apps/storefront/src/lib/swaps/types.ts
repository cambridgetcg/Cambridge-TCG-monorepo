// Collector swap types — the substrate shapes for swap_proposals /
// swap_proposal_items (migration 0109).
//
// v1 boundary, stated once here and everywhere the user can see:
// Cambridge TCG facilitates and RECORDS the swap; payment of any cash
// difference and shipping happen between the parties directly. No
// market_trades row, no trust-score movement, no escrow.

export type SwapStatus =
  | "draft"
  | "proposed"
  | "countered"
  | "accepted"
  | "shipping"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

export type SwapSide = "proposer" | "recipient";

/** Card conditions accepted on swap items — same vocabulary as market_orders. */
export const SWAP_CONDITIONS = ["NM", "LP", "MP", "HP"] as const;
export type SwapCondition = (typeof SWAP_CONDITIONS)[number];

export interface SwapItem {
  id: string;
  swap_id: string;
  side: SwapSide;
  sku: string;
  condition: string;
  quantity: number;
  snapshot_name: string | null;
  snapshot_image_url: string | null;
  snapshot_indicative_price_pence: number | null;
  created_at: string;
}

/** Flat ship-to address — mirrors market_trades.shipping_address (0105). */
export interface SwapAddress {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface SwapProposal {
  id: string;
  proposer_id: string;
  recipient_id: string;
  status: SwapStatus;
  cash_delta_pence: number;
  note: string | null;
  counter_of: string | null;
  expires_at: string | null;
  proposer_address: SwapAddress | null;
  recipient_address: SwapAddress | null;
  proposer_shipped_at: string | null;
  proposer_carrier: string | null;
  proposer_tracking: string | null;
  recipient_shipped_at: string | null;
  recipient_carrier: string | null;
  recipient_tracking: string | null;
  proposer_confirmed_at: string | null;
  recipient_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined for list/detail surfaces
  proposer_username?: string | null;
  proposer_name?: string | null;
  recipient_username?: string | null;
  recipient_name?: string | null;
  proposer_item_count?: number;
  recipient_item_count?: number;
}

/** Input shape for one item when creating/countering a swap. */
export interface SwapItemInput {
  side: SwapSide;
  sku: string;
  condition: SwapCondition;
  quantity: number;
  /** Display snapshots supplied by the composer UI (labels, not money —
   *  indicative prices are always recomputed server-side). */
  name?: string | null;
  imageUrl?: string | null;
}

/** Discriminated-union result shape shared with the rest of the market libs. */
export type SwapResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; status: number };
