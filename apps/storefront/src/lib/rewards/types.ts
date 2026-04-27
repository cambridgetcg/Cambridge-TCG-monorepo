export type RaffleStatus = "draft" | "active" | "drawing" | "completed" | "cancelled";
export type MysteryBoxStatus = "draft" | "active" | "paused" | "retired";

export interface Raffle {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  status: RaffleStatus;
  entry_cost_points: number;
  max_entries_per_user: number;
  prize_description: string;
  prize_value: string | null;
  prize_type: string;
  prize_image_url: string | null;
  starts_at: string;
  ends_at: string;
  draw_at: string;
  total_entries: number;
  winner_user_id: string | null;
  winner_drawn_at: string | null;
  winner_notified: boolean;
  prize_fulfilled: boolean;
  created_at: string;
  // Joined
  winner_name?: string | null;
  winner_email?: string;
  user_entries?: number;
}

export interface RaffleEntry {
  id: string;
  raffle_id: string;
  user_id: string;
  entry_count: number;
  points_spent: number;
  created_at: string;
  user_name?: string | null;
}

export interface MysteryBox {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  status: MysteryBoxStatus;
  cost_points: number;
  total_opens: number;
  max_opens_per_user: number;
  max_total_opens: number | null;
  created_at: string;
  rewards?: MysteryBoxReward[];
  user_opens?: number;
}

export interface MysteryBoxReward {
  id: string;
  box_id: string;
  name: string;
  description: string | null;
  reward_type: string; // "points" | "credit" | "physical" | "discount"
  reward_value: string;
  image_url: string | null;
  probability: string;
  rarity: string; // "common" | "uncommon" | "rare" | "legendary"
  stock: number | null;
  awarded_count: number;
  sort_order: number;
}

export interface MysteryBoxOpen {
  id: string;
  box_id: string;
  user_id: string;
  reward_id: string;
  points_spent: number;
  fulfilled: boolean;
  created_at: string;
  reward?: MysteryBoxReward;
  box_title?: string;
}

export const RARITY_COLORS: Record<string, string> = {
  common: "bg-neutral-500/20 text-neutral-400",
  uncommon: "bg-blue-500/20 text-blue-400",
  rare: "bg-purple-500/20 text-purple-400",
  legendary: "bg-amber-500/20 text-amber-400",
};

export const REWARD_TYPES = [
  { value: "points", label: "Bonus Berries" },
  { value: "credit", label: "Store Credit" },
  { value: "physical", label: "Physical Card/Product" },
  { value: "discount", label: "Discount Code" },
] as const;
