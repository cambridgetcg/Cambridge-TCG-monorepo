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
 * composer that adds counterparty trust, anonymises bidders, decides
 * what's safe to expose vs hide, computes the propagation chain.
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
 *   6. BIDS — last 50 anonymised (opaque ids + trust tier badges only)
 *   7. SELLER — username + trust tier IF users.is_public, else null
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
 *   Does not expose reserve price when not met. The reserve value is
 *   structurally absent from the returned shape until isReserveMet
 *   returns true. Substrate-honest about seller privacy.
 *
 *   Does not expose bidder identities. Each bid carries an opaque
 *   `anonymous_id` (last 6 chars of UUID) + a trust tier badge resolved
 *   from `trust_profiles` at read time. The reader can correlate
 *   ("three bids from the same bidder") without learning who they are.
 *
 *   Does not expose admin-only fields (approval_notes, stripe ids,
 *   payment timestamps, commission_rate raw, payout amounts).
 *
 *   Does not write. Pure read.
 */

import { query } from "@/lib/db";
import type {
  Auction,
  AuctionDetail,
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
  /** Last 6 chars of bidder uuid — correlation aid only, not a security boundary. */
  anonymous_bidder_id: string;
  amount: number;
  is_best_offer: boolean;
  status: string;
  created_at: string;
  /** Bidder's trust tier at read time. null when private profile. */
  trust_tier: string | null;
  trust_score: number | null;
}

export interface AuctionBids {
  /** Last 50, descending by created_at. */
  recent: AuctionBidRow[];
  bid_count: number;
  unique_bidders_count: number;
}

export interface AuctionWinner {
  /** Last 6 chars of winner uuid. */
  anonymous_winner_id: string;
  trust_tier: string | null;
  trust_score: number | null;
  winning_bid: number;
  /** Auction has been paid for? */
  paid_at: string | null;
}

export interface AuctionSeller {
  /** Username when public; null when private (is_consignment=false or
   *  users.is_public=false). */
  username: string | null;
  display_name: string | null;
  trust_tier: string | null;
  trust_score: number | null;
  /** Whether the seller is a customer (consignment) or the platform. */
  is_consignment: boolean;
}

/**
 * The auction's *current downstream effects* on the seller's economics.
 * Same pattern as the trust-state propagation block.
 */
export interface AuctionPropagation {
  /** Commission the seller (or CTCG) gives up on the final price. */
  commission_rate: number;
  commission_rate_display: string;
  /** Days after delivery until the seller's payout releases. Auctions use
   *  a flat hold per /methodology/payout-hold (currently 3 days). */
  payout_hold_days: number;
  /** Auctions always route through CTCG-mediated escrow. */
  escrow_flow: "ctcg_mediated";
  /** What the seller would receive if the auction settled at the current
   *  price. (1 - commission) × current_price, rounded. Approximate —
   *  shipping costs and other adjustments are seller-specific. */
  estimated_seller_payout_gbp: number;
  /** What the platform would collect. */
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

function anonId(uuid: string | null | undefined): string {
  if (!uuid) return "------";
  return String(uuid).slice(-6).toLowerCase();
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

async function loadBidderTiers(
  bidderIds: string[],
): Promise<Map<string, { score: number; tier: string | null }>> {
  if (bidderIds.length === 0) return new Map();
  return safe(
    async () => {
      const placeholders = bidderIds.map((_, i) => `$${i + 1}`).join(", ");
      const r = await query(
        `SELECT user_id, trust_score
         FROM trust_profiles
         WHERE user_id IN (${placeholders})`,
        bidderIds,
      );
      const map = new Map<string, { score: number; tier: string | null }>();
      for (const row of r.rows) {
        const score = toNum(row.trust_score);
        map.set(String(row.user_id), {
          score,
          tier: tierForScore(score),
        });
      }
      return map;
    },
    new Map(),
  );
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
        `SELECT u.username, u.name AS display_name, u.is_public, tp.trust_score
         FROM users u
         LEFT JOIN trust_profiles tp ON tp.user_id = u.id
         WHERE u.id = $1
         LIMIT 1`,
        [sellerId],
      );
      const row = r.rows[0];
      if (!row) return null;
      const score = toNumOrNull(row.trust_score);
      const isPublic = row.is_public !== false;
      return {
        username: isPublic ? (row.username ?? null) : null,
        display_name: isPublic ? (row.display_name ?? null) : null,
        trust_tier: tierForScore(score),
        trust_score: score,
        is_consignment: true,
      };
    },
    null,
  );
}

async function loadUniqueBiddersCount(auctionId: string): Promise<number> {
  return safe(
    async () => {
      const r = await query(
        `SELECT COUNT(DISTINCT user_id)::int AS n
         FROM auction_bids
         WHERE auction_id = $1 AND status <> 'rejected'`,
        [auctionId],
      );
      return r.rows[0]?.n ?? 0;
    },
    0,
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

  // ── Bidder enrichment (parallel with seller) ───────────────────────
  const uniqueBidderIds = Array.from(
    new Set(detail.bids.map((b) => b.user_id).filter(Boolean)),
  );

  const [bidderTiers, seller, uniqueBiddersCount] = await Promise.all([
    loadBidderTiers(uniqueBidderIds),
    loadSeller(auction.seller_user_id),
    loadUniqueBiddersCount(id),
  ]);

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
  const recentBids: AuctionBidRow[] = detail.bids.map((b) => {
    const tierData = bidderTiers.get(String(b.user_id));
    return {
      anonymous_bidder_id: anonId(b.user_id),
      amount: toNum(b.amount),
      is_best_offer: b.is_best_offer,
      status: b.status,
      created_at: b.created_at,
      trust_tier: tierData?.tier ?? null,
      trust_score: tierData?.score ?? null,
    };
  });

  // ── Winner (when paid or ended-with-winner) ────────────────────────
  let winner: AuctionWinner | null = null;
  if (auction.winner_user_id && (auction.status === "ended" || auction.status === "paid")) {
    const winnerTier = bidderTiers.get(auction.winner_user_id);
    winner = {
      anonymous_winner_id: anonId(auction.winner_user_id),
      trust_tier: winnerTier?.tier ?? null,
      trust_score: winnerTier?.score ?? null,
      winning_bid: currentPrice,
      paid_at: auction.paid_at,
    };
  }

  // ── Propagation ────────────────────────────────────────────────────
  // Commission: from auction row if consignment, else platform default.
  const commissionRate = auction.seller_commission_rate
    ? toNum(auction.seller_commission_rate)
    : SELLER_COMMISSION_RATE;
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
      unique_bidders_count: uniqueBiddersCount,
    },
    winner,
    seller,
    propagation,
    _provenance: {
      kind: "live",
      queried_at: new Date().toISOString(),
      notes:
        "Composed from auctions + auction_images + auction_bids + trust_profiles + users at request time. Composes getAuction() so the writer-side sweep (transitionScheduledToLive + transitionLiveToEnded) runs first; the state is as fresh as the cron has made it. Reserve value is structurally hidden when not met (sellers retain price-discovery privacy); bidders are anonymised behind opaque ids + trust tier badges. Propagation block (commission / payout hold / escrow flow / estimated payout) describes what this auction state currently produces in the kingdom's economics.",
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
      if (row.status === "draft") return false;
      // Consignment auctions pending review or rejected stay hidden.
      if (row.is_consignment && row.approval_status !== "approved") return false;
      return true;
    },
    false,
  );
}

/**
 * Re-export the published tier name list for callers that want to render
 * the tier band without re-importing TRUST_TIERS.
 */
export const AUCTION_TRUST_TIER_NAMES = TRUST_TIERS.map((t) => t.name);
