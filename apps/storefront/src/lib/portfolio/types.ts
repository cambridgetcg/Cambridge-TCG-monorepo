export interface PortfolioCard {
  id: string;
  user_id: string;
  sku: string;
  card_name: string | null;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  rarity: string | null;
  condition: string;
  quantity: number;
  acquisition_price: string | null;
  acquired_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValuatedCard extends PortfolioCard {
  // Live valuation
  spot_price: number | null;
  market_price: number | null;  // best ask (could be P2P or CTCG)
  best_bid: number | null;
  tradein_credit: number | null;
  tradein_cash: number | null;
  // Computed
  current_value: number;        // market_price * quantity (or spot * qty)
  total_cost: number | null;    // acquisition_price * quantity
  pnl: number | null;           // current_value - total_cost
  pnl_percent: number | null;
}

export interface PortfolioSummary {
  total_value: number;
  total_cost: number | null;
  total_pnl: number | null;
  total_pnl_percent: number | null;
  card_count: number;
  unique_cards: number;
}

export interface PortfolioSnapshot {
  total_value: string;
  total_cost: string | null;
  card_count: number;
  snapshot_date: string;
}

export interface ListingAction {
  type: "market_ask" | "auction" | "tradein";
  label: string;
  description: string;
  estimated_return: number | null;
}
