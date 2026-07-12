export interface PublicProfile {
  /** Internal model key; public API projections remove it. */
  user_id: string;
  username: string | null;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean;
  /** Owner preference; public API projections remove it. */
  accepts_messages: boolean;
  /** Owner-only publication receipts; public API projections remove them. */
  profile_publication_notice_version: string | null;
  profile_published_at: string | null;
  messaging_notice_version: string | null;
  messaging_enabled_at: string | null;
  /** Owner-only moderation state; public callers receive not-found. */
  is_suspended: boolean;
  // Address preferences — Wave 1.1 of the All-Aboard plan.
  // Read by <UserMention> wherever a third-person reference renders.
  pronouns: string | null;
  preferred_address: string | null;
  // Membership
  tier_name: string | null;
  tier_icon: string | null;
  tier_color: string | null;
  // Trust
  trust_score: number;
  trade_count: number;
  // Stats
  follower_count: number;
  following_count: number;
  /** Owner-only in API projections. */
  portfolio_count: number;
  // Computed
  avg_rating: number | null;
  total_reviews: number;
  member_since: string;
}

export interface ShowcaseCard {
  id: string;
  /** Internal join key; public API projections remove it. */
  user_id?: string;
  portfolio_card_id: string;
  display_order: number;
  caption: string | null;
  // From portfolio_cards join
  sku: string;
  card_name: string | null;
  card_number: string | null;
  set_name: string | null;
  image_url: string | null;
  rarity: string | null;
}

export interface WishlistItem {
  id: string;
  user_id: string;
  sku: string | null;
  card_name: string;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  max_price: string | null;
  condition_min: string;
  notes: string | null;
  fulfilled: boolean;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  created_at: string;
  /** Internal relationship keys; public API projections remove them. */
  reference_id?: string | null;
  reference_type?: string | null;
  // Joined
  user_name: string | null;
  user_username: string | null;
  user_avatar: string | null;
  tier_icon: string | null;
}

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned_at?: string;
}

export interface TradeMatch {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  trust_score: number;
  // What they want that you have
  your_cards: { sku: string; card_name: string; image_url: string | null }[];
  // What they have that you want
  their_cards: { sku: string; card_name: string; image_url: string | null }[];
}

export const EVENT_TYPES = {
  TRADE_COMPLETED: "trade_completed",
  AUCTION_LISTED: "auction_listed",
  AUCTION_WON: "auction_won",
  RAFFLE_WON: "raffle_won",
  MYSTERY_BOX_OPENED: "mystery_box_opened",
  TIER_UPGRADED: "tier_upgraded",
  ACHIEVEMENT_EARNED: "achievement_earned",
  CARD_ADDED: "card_added",
  WISHLIST_FULFILLED: "wishlist_fulfilled",
  REVIEW_RECEIVED: "review_received",
  SET_COMPLETED: "set_completed",
} as const;
