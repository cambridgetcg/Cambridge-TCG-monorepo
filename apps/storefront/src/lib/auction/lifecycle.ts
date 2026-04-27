import type { Auction } from "./types";

export function getCurrentDutchPrice(auction: Auction): number {
  if (auction.auction_type !== "dutch") return parseFloat(auction.current_price);

  const startPrice = parseFloat(auction.dutch_start_price || auction.starting_price);
  const endPrice = parseFloat(auction.dutch_end_price || "0");
  const drop = parseFloat(auction.dutch_price_drop || "0");
  const interval = auction.dutch_drop_interval_seconds || 60;

  const elapsed = (Date.now() - new Date(auction.starts_at).getTime()) / 1000;
  const drops = Math.floor(elapsed / interval);
  const price = startPrice - drops * drop;

  return Math.max(price, endPrice);
}

export function getTimeRemaining(endsAt: string): {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
} {
  const total = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const expired = total <= 0;

  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
    expired,
  };
}

export function getMinNextBid(auction: Auction): number {
  const current = parseFloat(auction.current_price);
  const increment = parseFloat(auction.bid_increment);
  const starting = parseFloat(auction.starting_price);

  return auction.bid_count > 0 ? current + increment : starting;
}

export function isReserveMet(auction: Auction): boolean | null {
  if (!auction.reserve_price) return null; // No reserve
  return parseFloat(auction.current_price) >= parseFloat(auction.reserve_price);
}
