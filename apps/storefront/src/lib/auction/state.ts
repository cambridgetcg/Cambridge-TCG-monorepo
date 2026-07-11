/**
 * Auction state — the shared read composer for all reading positions.
 *
 * Yu's directive 2026-05-13 (after the trust fan-out): *"Go for Auction state."*
 *
 * ── What this file is ───────────────────────────────────────────────────
 *
 * The auction module's `lib/auction/db.ts` is 1177 lines and 22 exported
 * functions — every caller writes its own assembly of "this auction's
 * full state" from individual queries. There's `getAuction(id)` which
 * returns `AuctionDetail` (auction + images + last-50 bids) but no
 * composer that decides what's safe to expose, computes public auction
 * facts and assembles the propagation chain.
 *
 * This module is that composer — the single shape the next wave of
 * auction-facing surfaces shares:
 *   - `/auctions/[id]/read` (HTML calm-read mirror, public no-auth)
 *   - `/api/v1/auctions/[id]` (JSON sibling)
 *   - `/api/v1/universal/auctions/[id]` (math-mirror)
 *   - future `/account/auctions` aggregate dashboards
 *
 * ── What it composes ────────────────────────────────────────────────────
 *
 *   1. META — id, title, description, type, status, timestamps
 *   2. IMAGES — display-order array (from getAuction's join)
 *   3. PRICING — starting / current / increment / buy_now / dutch params
 *   4. DUTCH COMPUTED — for dutch auctions, live-computed current price
 *   5. TIMING — time_remaining when live, actual_end_at when ended
 *   6. BIDS — last 50 public price events, without person identifiers
 *   7. SELLER — username + trust only when public and not suspended
 *   8. RESERVE — boolean met/not-met; reserve value never exposed publicly
 *   9. PROPAGATION — commission rate, payout hold, escrow flow,
 *      estimated seller payout (current price × (1 - commission))
 *  10. _provenance — sources + methodology URLs
 *
 * ── What it does NOT do ────────────────────────────────────────────────
 *
 *   Does not gate visibility. The composer returns the state for ANY
 *   non-deleted auction, in any status including 'draft'. The caller
 *   chooses whether to expose drafts (admin) or only published auctions
 *   (public mirror); `auctionStateIsPublic(id)` is the gate helper.
 *
 *   Does not expose the reserve price. Only the computed met/not-met boolean
 *   is present, so the seller's price-discovery boundary remains intact.
 *
 *   Does not expose bidder or winner identifiers. Truncated UUIDs are still
 *   deterministic correlators, so public bids contain price and time facts
 *   only. Best offers are private proposals and are absent.
 *
 *   Does not expose admin-only fields (approval_notes, stripe ids,
 *   payment timestamps, commission_rate raw, payout amounts).
 *
 *   Does not write. Pure read.
 */

import { query } from "@/lib/db";
import type {
  Auction,
  AuctionImage,
  AuctionType,
  AuctionStatus,
} from "./types";
import { SELLER_COMMISSION_RATE } from "./types";
import {
  getAuction,
  // Note: getBidHistory exists too but getAuction already returns the last 50.
} from "./db";
import {
  getCurrentDutchPrice,
  getMinNextBid,
  isReserveMet,
  getTimeRemaining,
} from "./lifecycle";
import { TRUST_TIERS } from "@/lib/escrow/types";
import { getTrustTier } from "@/lib/escrow/trust-engine";
import { PERSON_PUBLICATION_NOTICE_VERSION } from "@/lib/social/publication";
import { auctionRecordIsPublic } from "./public";

// ── Public shape ─────────────────────────────────────────────────────────

export interface AuctionMeta {
  id: string;
  title: string;
  description: string | null;
  auction_type: AuctionType;
  status: AuctionStatus;
  is_consignment: boolean;
  approval_status: "pending_review" | "approved" | "rejected" | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionImageRow {
  url: string;
  display_order: number;
}

export interface AuctionTiming {
  starts_at: string;
  ends_at: string;
  actual_end_at: string | null;
  /** Computed at request time. null when ended. */
  time_remaining_ms: number | null;
  /** Convenience breakdown when live. */
  time_remaining: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
  /** Has the listing window opened? */
  has_started: boolean;
  /** Has the listing window closed (regardless of payment / fulfilment)? */
  has_ended: boolean;
}

export interface AuctionPricing {
  starting_price: number;
  current_price: number;
  bid_increment: number;
  /** Buy-now price if seller set one; null otherwise. */
  buy_now_price: number | null;
  /** Minimum value the next bid must be. */
  min_next_bid: number;
  /** For dutch auctions, the live-computed current price (may differ from
   *  current_price if the cron hasn't fired in the last interval). */
  dutch_computed_price: number | null;
  dutch: {
    start_price: number;
    end_price: number;
    drop_amount: number;
    drop_interval_seconds: number;
  } | null;
  allow_best_offer: boolean;
}

export interface AuctionReserve {
  /** True when reserve set + met; false when reserve set + not met; null
   *  when no reserve set. The reserve VALUE is never exposed in this
   *  composer — sellers retain price-discovery privacy. */
  reserve_met: boolean | null;
}

export interface AuctionBidRow {
  amount: number;
  is_best_offer: false;
  status: string;
  created_at: string;
}

export interface AuctionBids {
  /** Last 50, descending by created_at. */
  recent: AuctionBidRow[];
  bid_count: number;
}

export interface AuctionWinner {
  winning_bid: number;
  paid: boolean;
}

export interface AuctionSeller {
  /** Person fields publish only with explicit profile publication and while
   *  the seller is not suspended. */
  username: string | null;
  display_name: string | null;
  trust_tier: string | null;
  trust_score: number | null;
  /** Whether the seller is a customer (consignment) or the platform. */
  is_consignment: boolean;
}

/**
 * Public standard economics at the current price. Seller-specific stored
 * rates and actual settlement amounts are deliberately not inputs.
 */
export interface AuctionPropagation {
  /** Published platform commission rate, not the seller's stored rate. */
  commission_rate: number;
  commission_rate_display: string;
  /** Days after delivery until the seller's payout releases. Auctions use
   *  a flat hold per /methodology/payout-hold (currently 3 days). */
  payout_hold_days: number;
  /** Auctions always route through CTCG-mediated escrow. */
  escrow_flow: "ctcg_mediated";
  /** Generic estimate at the published rate, not the seller's actual payout. */
  estimated_seller_payout_gbp: number;
  /** Generic platform-fee estimate at the published rate. */
  estimated_commission_gbp: number;
  methodology_urls: {
    commission_rate: string;
    payout_hold: string;
    escrow_tier: string;
  };
}

export interface AuctionStateShape {
  meta: AuctionMeta;
  images: AuctionImageRow[];
  pricing: AuctionPricing;
  timing: AuctionTiming;
  reserve: AuctionReserve;
  bids: AuctionBids;
  winner: AuctionWinner | null;
  seller: AuctionSeller | null;
  propagation: AuctionPropagation;
  _provenance: {
    kind: "live";
    queried_at: string;
    notes: string;
    sources: string[];
    methodology_url: string;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function tierForScore(score: number | null): string | null {
  if (score === null) return null;
  const tier = getTrustTier(score);
  return tier.name;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auction/state] query failed:", err);
    }
    return fallback;
  }
}

// ── Section enrichers ───────────────────────────────────────────────────

export function projectAuctionSellerForPublic(row: {
  username?: string | null;
  display_name?: string | null;
  is_public?: boolean | null;
  profile_publication_notice_version?: string | null;
  profile_published_at?: string | null;
  is_suspended?: boolean | null;
  trust_score?: unknown;
}): AuctionSeller {
  const canPublish =
    row.is_public === true &&
    row.profile_publication_notice_version === PERSON_PUBLICATION_NOTICE_VERSION &&
    Boolean(row.profile_published_at) &&
    row.is_suspended === false;
  const score = canPublish ? toNumOrNull(row.trust_score) : null;
  return {
    username: canPublish ? (row.username ?? null) : null,
    display_name: canPublish ? (row.display_name ?? null) : null,
    trust_tier: canPublish ? tierForScore(score) : null,
    trust_score: score,
    is_consignment: true,
  };
}

async function loadSeller(sellerId: string | null): Promise<AuctionSeller | null> {
  if (!sellerId) {
    // Platform-owned auction (not a consignment). The kingdom's house
    // auctions don't have a customer seller; surface CTCG itself.
    return {
      username: null,
      display_name: "Cambridge TCG",
      trust_tier: null,
      trust_score: null,
      is_consignment: false,
    };
  }
  return safe(
    async () => {
      const r = await query(
        `SELECT u.username, u.name AS display_name, u.is_public,
                u.profile_publication_notice_version, u.profile_published_at,
                COALESCE(tp.is_suspended, FALSE) AS is_suspended,
                tp.trust_score
         FROM users u
         LEFT JOIN trust_profiles tp ON tp.user_id = u.id
         WHERE u.id = $1
         LIMIT 1`,
        [sellerId],
      );
      const row = r.rows[0];
      if (!row) return null;
      return projectAuctionSellerForPublic(row);
    },
    null,
  );
}

// ── Public surface ─────────────────────────────────────────────────────

/**
 * Compose the full auction state from `getAuction(id)` + counterparty
 * enrichment + propagation chain + privacy projections.
 *
 * Returns null when no auction with that id exists. Returns a state for
 * any status (draft / scheduled / live / ended / paid / cancelled); the
 * caller chooses whether to expose drafts.
 *
 * Composes the existing `getAuction(id)` writer-side function rather
 * than duplicating its SQL — substrate-honest about shared composition.
 */
export async function loadAuctionState(id: string): Promise<AuctionStateShape | null> {
  const detail = await safe(() => getAuction(id), null);
  if (!detail) return null;

  const auction: Auction = detail;

  const seller = await loadSeller(auction.seller_user_id);

  // ── Reserve ────────────────────────────────────────────────────────
  const reserveMet = isReserveMet(auction);

  // ── Pricing ────────────────────────────────────────────────────────
  const currentPrice = toNum(auction.current_price);
  const startingPrice = toNum(auction.starting_price);
  const bidIncrement = toNum(auction.bid_increment);
  const buyNowPrice = toNumOrNull(auction.buy_now_price);
  const minNextBid = getMinNextBid(auction);
  const dutchComputed =
    auction.auction_type === "dutch"
      ? getCurrentDutchPrice(auction)
      : null;
  const dutchParams =
    auction.auction_type === "dutch" && auction.dutch_start_price
      ? {
          start_price: toNum(auction.dutch_start_price),
          end_price: toNum(auction.dutch_end_price),
          drop_amount: toNum(auction.dutch_price_drop),
          drop_interval_seconds: auction.dutch_drop_interval_seconds ?? 60,
        }
      : null;

  // ── Timing ─────────────────────────────────────────────────────────
  const tr = getTimeRemaining(auction.ends_at);
  const now = Date.now();
  const hasStarted = new Date(auction.starts_at).getTime() <= now;
  const hasEnded = tr.expired || auction.status === "ended" || auction.status === "paid" || auction.status === "cancelled";

  // ── Bids ───────────────────────────────────────────────────────────
  const recentBids: AuctionBidRow[] = detail.bids
    .filter((bid) => !bid.is_best_offer)
    .map((b) => ({
      amount: toNum(b.amount),
      is_best_offer: false,
      status: b.status,
      created_at: b.created_at,
    }));

  // ── Winner (when paid or ended-with-winner) ────────────────────────
  let winner: AuctionWinner | null = null;
  if (auction.winner_user_id && (auction.status === "ended" || auction.status === "paid")) {
    winner = {
      winning_bid: currentPrice,
      paid: auction.paid_at !== null,
    };
  }

  // ── Propagation ────────────────────────────────────────────────────
  // Public propagation uses the published platform rate. The stored auction
  // rate can contain a seller-specific membership adjustment and is a private
  // commercial term; actual settlement remains participant/admin-only.
  const commissionRate = SELLER_COMMISSION_RATE;
  const payoutHoldDays = 3; // /methodology/payout-hold — flat for auctions
  const estimatedPayout = Math.round((currentPrice * (1 - commissionRate)) * 100) / 100;
  const estimatedCommission = Math.round((currentPrice * commissionRate) * 100) / 100;

  const propagation: AuctionPropagation = {
    commission_rate: commissionRate,
    commission_rate_display: `${Math.round(commissionRate * 1000) / 10}%`,
    payout_hold_days: payoutHoldDays,
    escrow_flow: "ctcg_mediated",
    estimated_seller_payout_gbp: estimatedPayout,
    estimated_commission_gbp: estimatedCommission,
    methodology_urls: {
      commission_rate: "/methodology/commission-rate",
      payout_hold: "/methodology/payout-hold",
      escrow_tier: "/methodology/escrow-tier",
    },
  };

  return {
    meta: {
      id: auction.id,
      title: auction.title,
      description: auction.description,
      auction_type: auction.auction_type,
      status: auction.status,
      is_consignment: auction.is_consignment,
      approval_status: auction.approval_status,
      created_at: auction.created_at,
      updated_at: auction.updated_at,
    },
    images: (detail.images as AuctionImage[]).map((img) => ({
      url: img.url,
      display_order: img.display_order,
    })),
    pricing: {
      starting_price: startingPrice,
      current_price: currentPrice,
      bid_increment: bidIncrement,
      buy_now_price: buyNowPrice,
      min_next_bid: minNextBid,
      dutch_computed_price: dutchComputed,
      dutch: dutchParams,
      allow_best_offer: auction.allow_best_offer,
    },
    timing: {
      starts_at: auction.starts_at,
      ends_at: auction.ends_at,
      actual_end_at: auction.actual_end_at,
      time_remaining_ms: tr.expired ? null : tr.total,
      time_remaining: tr.expired
        ? null
        : {
            days: tr.days,
            hours: tr.hours,
            minutes: tr.minutes,
            seconds: tr.seconds,
          },
      has_started: hasStarted,
      has_ended: hasEnded,
    },
    reserve: { reserve_met: reserveMet },
    bids: {
      recent: recentBids,
      bid_count: auction.bid_count ?? 0,
    },
    winner,
    seller,
    propagation,
    _provenance: {
      kind: "live",
      queried_at: new Date().toISOString(),
      notes:
        "Composed from auctions + auction_images + auction_bids + trust_profiles + users at request time. Composes getAuction() so the writer-side sweep (transitionScheduledToLive + transitionLiveToEnded) runs first; the state is as fresh as the cron has made it. The reserve value is structurally absent; only met/not-met is public. Public bid history contains regular price/time events and the total event count, never bidder counts, bidder or winner correlators, or best offers. Seller identity and trust publish only with a current profile-publication receipt and while unsuspended. The propagation block uses the published platform fee, never a seller-specific stored rate or actual payout.",
      sources: [
        "auctions",
        "auction_images",
        "auction_bids",
        "trust_profiles",
        "users",
        "lib/auction/db.ts (getAuction)",
        "lib/auction/lifecycle.ts (getCurrentDutchPrice, isReserveMet, getMinNextBid, getTimeRemaining)",
        "lib/escrow/trust-engine.ts (getTrustTier)",
      ],
      methodology_url: "/methodology/auctions",
    },
  };
}

/**
 * Should this auction be visible on a public-mirror surface?
 *
 * Public iff the auction exists AND its status is one of the
 * publishable values (scheduled / live / ended / paid / cancelled).
 * Drafts and consignment-pending-review auctions stay hidden until
 * approved.
 */
export async function auctionStateIsPublic(id: string): Promise<boolean> {
  return safe(
    async () => {
      const r = await query(
        `SELECT status, is_consignment, approval_status
         FROM auctions
         WHERE id = $1
         LIMIT 1`,
        [id],
      );
      const row = r.rows[0];
      if (!row) return false;
      return auctionRecordIsPublic(row);
    },
    false,
  );
}

/**
 * Re-export the published tier name list for callers that want to render
 * the tier band without re-importing TRUST_TIERS.
 */
export const AUCTION_TRUST_TIER_NAMES = TRUST_TIERS.map((t) => t.name);
