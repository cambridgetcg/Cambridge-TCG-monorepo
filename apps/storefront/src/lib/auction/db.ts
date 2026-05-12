import { query, transaction } from "@/lib/db";
import type { Auction, AuctionImage, AuctionSummary, AuctionDetail, Bid, CreateAuctionInput, BidResult } from "./types";
import { postActivity, awardAchievement } from "@/lib/social/db";
import { sendWinnerEmail, sendAuctionEndedAdminEmail } from "./email";
import { formatPrice } from "@/lib/format";
import { paymentExpiresAtForBuyer } from "@/lib/users/response-window";

// Anti-sniping: a bid placed in the last ANTI_SNIPE_WINDOW_MS extends the
// auction so the previous high bidder always has a chance to respond. No
// max-extensions cap — sniping wars resolve naturally when one side stops.
const ANTI_SNIPE_WINDOW_MS = 5 * 60 * 1000;
// Default winner-payment window when the winner hasn't declared a
// response_window_hours (migration 0092 — the Asynchronous). 48h matches
// the historical auction default — generous because winning an auction
// carries more emotional context than a market match. Winners with a
// declared cadence override this. See `lib/users/response-window.ts`.
const DEFAULT_AUCTION_PAYMENT_WINDOW_HOURS = 48;

// ── List auctions (public) ──

export async function listAuctions(filters: {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ auctions: AuctionSummary[]; total: number }> {
  // Lazy status transitions first
  await transitionScheduledToLive();
  await transitionLiveToEnded();
  await sweepUnpaidEndedAuctions();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.status === "live") {
    conditions.push(`a.status = 'live'`);
  } else if (filters.status === "upcoming") {
    conditions.push(`a.status = 'scheduled'`);
  } else if (filters.status === "ended") {
    conditions.push(`a.status IN ('ended', 'paid')`);
  }

  if (filters.type) {
    conditions.push(`a.auction_type = $${idx++}`);
    params.push(filters.type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const countResult = await query(
    `SELECT COUNT(*) FROM auctions a ${where}`,
    params
  );

  const orderBy = filters.status === "ended" ? "a.ends_at DESC" : "a.ends_at ASC";
  const result = await query(
    `SELECT a.id, a.title, a.auction_type, a.status, a.current_price, a.starting_price,
            a.buy_now_price, a.bid_count, a.starts_at, a.ends_at,
            a.seller_user_id, a.seller_payout, a.seller_paid_at,
            a.payout_method, a.payout_reference,
            (SELECT url FROM auction_images WHERE auction_id = a.id ORDER BY display_order LIMIT 1) as image_url
     FROM auctions a ${where}
     ORDER BY ${orderBy}
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return {
    auctions: result.rows as AuctionSummary[],
    total: parseInt(countResult.rows[0].count, 10),
  };
}

// ── Ownership check (cheap; no lazy transitions) ──

export async function getAuctionSellerId(id: string): Promise<string | null> {
  const result = await query(`SELECT seller_user_id FROM auctions WHERE id = $1`, [id]);
  return result.rows[0]?.seller_user_id ?? null;
}

// ── Get single auction detail ──

export async function getAuction(id: string): Promise<AuctionDetail | null> {
  await transitionScheduledToLive();
  await transitionLiveToEnded();

  const result = await query(`SELECT * FROM auctions WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  const auction = result.rows[0] as Auction;

  const images = await query(
    `SELECT * FROM auction_images WHERE auction_id = $1 ORDER BY display_order`,
    [id]
  );

  const bids = await query(
    `SELECT b.*, u.name as user_name FROM auction_bids b
     LEFT JOIN users u ON b.user_id = u.id
     WHERE b.auction_id = $1 ORDER BY b.created_at DESC LIMIT 50`,
    [id]
  );

  return {
    ...auction,
    images: images.rows as AuctionImage[],
    bids: bids.rows as Bid[],
    server_time: new Date().toISOString(),
  };
}

// ── Create auction (admin) ──

export async function createAuction(data: CreateAuctionInput): Promise<Auction> {
  const currentPrice = data.auction_type === "dutch"
    ? data.dutch_start_price || data.starting_price
    : data.starting_price;

  const result = await query(
    `INSERT INTO auctions (title, description, auction_type, starting_price, reserve_price,
      buy_now_price, bid_increment, dutch_start_price, dutch_end_price, dutch_price_drop,
      dutch_drop_interval_seconds, starts_at, ends_at, current_price, allow_best_offer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      data.title,
      data.description || null,
      data.auction_type,
      data.starting_price.toFixed(2),
      data.reserve_price?.toFixed(2) ?? null,
      data.buy_now_price?.toFixed(2) ?? null,
      (data.bid_increment || 1).toFixed(2),
      data.dutch_start_price?.toFixed(2) ?? null,
      data.dutch_end_price?.toFixed(2) ?? null,
      data.dutch_price_drop?.toFixed(2) ?? null,
      data.dutch_drop_interval_seconds ?? null,
      data.starts_at,
      data.ends_at,
      (currentPrice as number).toFixed(2),
      data.allow_best_offer || false,
    ]
  );

  return result.rows[0] as Auction;
}

// ── Update auction (admin) ──

export async function updateAuction(id: string, data: Partial<CreateAuctionInput> & { status?: string }): Promise<Auction | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const fieldMap: Record<string, unknown> = {
    title: data.title,
    description: data.description,
    auction_type: data.auction_type,
    starting_price: data.starting_price?.toFixed(2),
    reserve_price: data.reserve_price?.toFixed(2),
    buy_now_price: data.buy_now_price?.toFixed(2),
    bid_increment: data.bid_increment?.toFixed(2),
    dutch_start_price: data.dutch_start_price?.toFixed(2),
    dutch_end_price: data.dutch_end_price?.toFixed(2),
    dutch_price_drop: data.dutch_price_drop?.toFixed(2),
    dutch_drop_interval_seconds: data.dutch_drop_interval_seconds,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    allow_best_offer: data.allow_best_offer,
    status: data.status,
  };

  for (const [key, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }

  if (fields.length === 0) return null;
  fields.push("updated_at = NOW()");
  values.push(id);

  const result = await query(
    `UPDATE auctions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] as Auction ?? null;
}

// ── Delete auction (admin, draft only) ──

export async function deleteAuction(id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM auctions WHERE id = $1 AND status = 'draft' RETURNING id`,
    [id]
  );
  return result.rows.length > 0;
}

// ── Place bid (transactional) ──

export async function placeBid(auctionId: string, userId: string, amount: number, isBestOffer = false): Promise<BidResult> {
  // Trust gate — refuse bids from suspended users + over-tier-limit
  // amounts. Same enforcement as market orders. Returns the canTrade
  // reason as a clean error string (BidResult shape, no exception).
  // Skip the gate for best-offer (private proposals don't lock funds).
  if (!isBestOffer) {
    const { canTrade } = await import("@/lib/escrow/trust-engine");
    const gate = await canTrade(userId, amount);
    if (!gate.allowed) {
      return { success: false, error: gate.reason ?? "Order rejected by trust gate." };
    }
  }

  const txResult = await transaction(async (q) => {
    const auctionResult = await q(
      `SELECT * FROM auctions WHERE id = $1 AND status = 'live' FOR UPDATE`,
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      return { success: false, error: "Auction is not active." } as BidResult;
    }

    const auction = auctionResult.rows[0];

    if (new Date(auction.ends_at) <= new Date()) {
      return { success: false, error: "Auction has ended." } as BidResult;
    }

    if (isBestOffer) {
      // Best offers only valid on Buy Now auctions that explicitly allow them.
      // They don't touch current_price/bid_count and don't outbid anyone — they're
      // private proposals to the seller, who accepts or rejects later.
      if (auction.auction_type !== "buy_now" || !auction.allow_best_offer) {
        return { success: false, error: "This auction does not accept offers." } as BidResult;
      }

      const offerResult = await q(
        `INSERT INTO auction_bids (auction_id, user_id, amount, is_best_offer, status)
         VALUES ($1, $2, $3, true, 'active') RETURNING *`,
        [auctionId, userId, amount.toFixed(2)]
      );

      return {
        success: true,
        bid: offerResult.rows[0] as Bid,
        auction,
      };
    }

    // Regular bid path
    const currentPrice = parseFloat(auction.current_price);
    const increment = parseFloat(auction.bid_increment);
    const minBid = auction.bid_count > 0 ? currentPrice + increment : parseFloat(auction.starting_price);

    if (amount < minBid) {
      return { success: false, error: `Minimum bid is £${minBid.toFixed(2)}.` } as BidResult;
    }

    const bidResult = await q(
      `INSERT INTO auction_bids (auction_id, user_id, amount, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [auctionId, userId, amount.toFixed(2)]
    );

    // Outbid only previous regular bids; leave best offers alone
    await q(
      `UPDATE auction_bids SET status = 'outbid'
       WHERE auction_id = $1 AND status = 'active' AND is_best_offer = false AND id != $2`,
      [auctionId, bidResult.rows[0].id]
    );

    // Decide what happens to the auction itself.
    //   - Buy Now bid at >= buy_now_price: end immediately, this bidder wins.
    //   - English auction with bid in the last ANTI_SNIPE_WINDOW_MS: extend
    //     ends_at so the previous high bidder gets a chance to respond.
    //   - Otherwise: just update price + bid count.
    const buyNowPrice = auction.buy_now_price ? parseFloat(auction.buy_now_price) : null;
    const isBuyNowFill = auction.auction_type === "buy_now" && buyNowPrice !== null && amount >= buyNowPrice;

    let updatedAuction;
    let extendedEndsAt: string | null = null;
    let endedNow = false;

    if (isBuyNowFill) {
      // End the auction immediately and crown the bidder. The bid stays 'active'
      // here; the lazy transitionLiveToEnded will mark it 'winning' and fire
      // emails on the next read. We pre-emptively set actual_end_at and winner
      // so the next transition sweep picks it up correctly.
      // Winner-aware payment deadline: response_window_hours (migration 0092)
      // overrides the 48h auction default when the winner has declared a cadence.
      const paymentExpiresAt = await paymentExpiresAtForBuyer(userId, DEFAULT_AUCTION_PAYMENT_WINDOW_HOURS);
      const r = await q(
        `UPDATE auctions
            SET current_price = $1, bid_count = bid_count + 1,
                status = 'ended', actual_end_at = NOW(),
                winner_user_id = $2, payment_expires_at = $3,
                updated_at = NOW()
          WHERE id = $4 RETURNING *`,
        [amount.toFixed(2), userId, paymentExpiresAt, auctionId]
      );
      // Mark the winning bid now so downstream queries see it consistently.
      await q(
        `UPDATE auction_bids SET status = 'winning' WHERE id = $1`,
        [bidResult.rows[0].id]
      );
      updatedAuction = r.rows[0];
      endedNow = true;
    } else {
      const msUntilEnd = new Date(auction.ends_at).getTime() - Date.now();
      const shouldExtend = auction.auction_type === "english" && msUntilEnd > 0 && msUntilEnd < ANTI_SNIPE_WINDOW_MS;

      if (shouldExtend) {
        const newEndsAt = new Date(Date.now() + ANTI_SNIPE_WINDOW_MS).toISOString();
        const r = await q(
          `UPDATE auctions SET current_price = $1, bid_count = bid_count + 1,
                                ends_at = $2, updated_at = NOW()
            WHERE id = $3 RETURNING *`,
          [amount.toFixed(2), newEndsAt, auctionId]
        );
        updatedAuction = r.rows[0];
        extendedEndsAt = newEndsAt;
      } else {
        const r = await q(
          `UPDATE auctions SET current_price = $1, bid_count = bid_count + 1, updated_at = NOW()
            WHERE id = $2 RETURNING *`,
          [amount.toFixed(2), auctionId]
        );
        updatedAuction = r.rows[0];
      }
    }

    return {
      success: true,
      bid: bidResult.rows[0] as Bid,
      auction: extendedEndsAt
        ? { ...updatedAuction, current_price: amount.toFixed(2) }
        : updatedAuction,
      _endedNow: endedNow,
      _extendedEndsAt: extendedEndsAt,
      _updatedAuction: updatedAuction,
    };
  });

  // Early-exit failures from inside the transaction
  if (!txResult.success) return txResult;

  // Extract transient metadata then strip it from the return value
  const { _endedNow: endedNow, _extendedEndsAt: extendedEndsAt, _updatedAuction: updatedAuction, ...result } = txResult as any;

  // Fire the winner + admin emails for the immediate Buy Now end. The lazy
  // sweep would catch this eventually, but the buyer expects an instant
  // confirmation; firing here matches the ordinary end-of-auction emails.
  if (endedNow) {
    const winnerEmailRes = await query(`SELECT email FROM users WHERE id = $1`, [userId]).catch(() => ({ rows: [] }));
    const winnerEmail = winnerEmailRes.rows[0]?.email;
    if (winnerEmail) {
      sendWinnerEmail({
        email: winnerEmail,
        auctionTitle: updatedAuction.title,
        auctionId: updatedAuction.id,
        winningPrice: formatPrice(amount),
      }).catch((err) => console.error("[auction] BuyNow winner email failed:", err));
    }
    sendAuctionEndedAdminEmail({
      auctionTitle: updatedAuction.title,
      auctionId: updatedAuction.id,
      winnerEmail: winnerEmail ?? null,
      winningPrice: formatPrice(amount),
      bidCount: updatedAuction.bid_count,
    }).catch((err) => console.error("[auction] BuyNow admin email failed:", err));
  }

  // Lifecycle log — fire-and-forget. Captures the two interesting
  // bid-side state changes (anti-snipe extension, buy-now fill).
  // Plain bids on a still-open auction don't warrant a row; the
  // bid table itself is the audit trail for those.
  if (endedNow) {
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId,
        action: "buy_now_triggered",
        actorId: userId,
        reason: "Buy-now price met — auction ended immediately",
        metadata: { winning_price: amount.toFixed(2) },
      }),
    );
  } else if (extendedEndsAt) {
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId,
        action: "extended",
        actorId: userId,
        reason: "Anti-snipe — bid in final window extended end time",
        metadata: { new_ends_at: extendedEndsAt, current_price: amount.toFixed(2) },
      }),
    );
  }

  // Fire-and-forget bid-sniping detection. A user who places ≥3 bids
  // in the final 2 minutes across ≥2 distinct auctions in the last
  // hour fits the anti-snipe-extension exploitation pattern (force
  // auctions to extend, drive up other bidders' costs, withdraw
  // attention right before the new end). The signal lands a flag for
  // admin review; doesn't block bidding outright.
  void detectBidSniping(userId).catch((err) =>
    console.error("[auction/snipe] detection failed:", err),
  );

  return result as BidResult;
}

/**
 * Bid-sniping detection. Pulls the user's recent bids and counts
 * those placed within the final 2 minutes of their respective
 * auctions. Threshold: ≥3 such bids across ≥2 auctions in the
 * last hour. Idempotent via dedupeKey (UTC date + hour).
 */
async function detectBidSniping(userId: string): Promise<void> {
  const r = await query(
    `SELECT
        COUNT(*)::int AS count,
        COUNT(DISTINCT b.auction_id)::int AS auction_count
       FROM auction_bids b
       JOIN auctions a ON a.id = b.auction_id
      WHERE b.user_id = $1
        AND b.created_at >= NOW() - INTERVAL '1 hour' -- audit:cadence-platform — snipe-attempt detection, not a user deadline.
        AND a.ends_at IS NOT NULL
        AND b.created_at >= a.ends_at - INTERVAL '2 minutes' -- audit:cadence-platform — auction snipe window, a platform rule not a user deadline.
`,
    [userId],
  );
  const count = r.rows[0]?.count ?? 0;
  const auctions = r.rows[0]?.auction_count ?? 0;
  if (count >= 3 && auctions >= 2) {
    const { emitSignal, SIGNAL_DEFS } = await import("@/lib/fraud/detection");
    const day = new Date().toISOString().slice(0, 10);
    const hour = new Date().getUTCHours();
    await emitSignal({
      userId,
      def: SIGNAL_DEFS.BID_SNIPING,
      description: `${count} late-window bids across ${auctions} auctions in the last hour`,
      dedupeKey: `${day}:${hour}:bid-snipe`,
    });
  }
}

// ── Bid history ──

export async function getBidHistory(auctionId: string): Promise<Bid[]> {
  const result = await query(
    `SELECT b.*, u.name as user_name FROM auction_bids b
     LEFT JOIN users u ON b.user_id = u.id
     WHERE b.auction_id = $1 ORDER BY b.created_at DESC`,
    [auctionId]
  );
  return result.rows as Bid[];
}

// ── Images ──

export async function addAuctionImage(auctionId: string, url: string, s3Key: string, order: number): Promise<AuctionImage> {
  const result = await query(
    `INSERT INTO auction_images (auction_id, url, s3_key, display_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [auctionId, url, s3Key, order]
  );
  return result.rows[0] as AuctionImage;
}

export async function removeAuctionImage(imageId: string): Promise<string | null> {
  const result = await query(
    `DELETE FROM auction_images WHERE id = $1 RETURNING s3_key`,
    [imageId]
  );
  return result.rows[0]?.s3_key ?? null;
}

// ── Watch ──

export async function toggleWatch(userId: string, auctionId: string): Promise<boolean> {
  const existing = await query(
    `SELECT 1 FROM auction_watches WHERE user_id = $1 AND auction_id = $2`,
    [userId, auctionId]
  );

  if (existing.rows.length > 0) {
    await query(`DELETE FROM auction_watches WHERE user_id = $1 AND auction_id = $2`, [userId, auctionId]);
    return false;
  }

  await query(
    `INSERT INTO auction_watches (user_id, auction_id) VALUES ($1, $2)`,
    [userId, auctionId]
  );
  return true;
}

export async function isWatching(userId: string, auctionId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM auction_watches WHERE user_id = $1 AND auction_id = $2`,
    [userId, auctionId]
  );
  return result.rows.length > 0;
}

// ── All auctions for admin ──

export async function listAllAuctions(): Promise<AuctionSummary[]> {
  const result = await query(
    `SELECT a.id, a.title, a.auction_type, a.status, a.current_price, a.starting_price,
            a.buy_now_price, a.bid_count, a.starts_at, a.ends_at,
            (SELECT url FROM auction_images WHERE auction_id = a.id ORDER BY display_order LIMIT 1) as image_url
     FROM auctions a ORDER BY a.created_at DESC`
  );
  return result.rows as AuctionSummary[];
}

// ── Customer-created auctions ──

export async function createSellerAuction(userId: string, data: {
  title: string;
  description?: string;
  auction_type: string;
  starting_price: number;
  reserve_price?: number;
  buy_now_price?: number;
  bid_increment?: number;
  starts_at: string;
  ends_at: string;
  allow_best_offer?: boolean;
}): Promise<Auction> {
  const currentPrice = data.starting_price;

  // Membership tier may grant auto-approval. We resolve it inline so the
  // auction skips the manual review queue when applicable.
  const tierRes = await query(
    `SELECT t.auction_priority_approval AS auto_ok
       FROM users u LEFT JOIN tiers t ON t.id = u.tier_id
      WHERE u.id = $1`,
    [userId]
  );
  const autoApprove = tierRes.rows[0]?.auto_ok === true;
  const initialApproval = autoApprove ? "approved"        : "pending_review";
  const initialStatus   = autoApprove ? "scheduled"      : "draft";

  const result = await query(
    `INSERT INTO auctions (title, description, auction_type, starting_price, reserve_price,
      buy_now_price, bid_increment, starts_at, ends_at, current_price, allow_best_offer,
      seller_user_id, is_consignment, approval_status, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14)
     RETURNING *`,
    [
      data.title,
      data.description || null,
      data.auction_type,
      data.starting_price.toFixed(2),
      data.reserve_price?.toFixed(2) ?? null,
      data.buy_now_price?.toFixed(2) ?? null,
      (data.bid_increment || 1).toFixed(2),
      data.starts_at,
      data.ends_at,
      currentPrice.toFixed(2),
      data.allow_best_offer || false,
      userId,
      initialApproval,
      initialStatus,
    ]
  );
  const auction = result.rows[0] as Auction;

  // Social: activity feed + achievement
  postActivity(userId, "auction_listed", "Listed a card at auction").catch(() => {});
  awardAchievement(userId, "first_auction").catch(() => {});

  // Auto-approval bypass: notify followers immediately since the listing is
  // live (mirrors the post-approval notify in approveAuction). Without this,
  // a Platinum seller's followers wouldn't get the inline broadcast.
  if (autoApprove && auction.seller_user_id) {
    const { notifyFollowersOfAuctionListing } = await import("@/lib/social/notify");
    notifyFollowersOfAuctionListing({
      sellerId: auction.seller_user_id,
      auctionId: auction.id,
      auctionTitle: auction.title,
      imageUrl: null, // images attach after creation; will be missing on auto-approval
      startingPrice: parseFloat(auction.starting_price),
      buyNowPrice: auction.buy_now_price ? parseFloat(auction.buy_now_price) : null,
      endsAt: auction.ends_at,
    }).catch((err) => console.error("[auction] auto-approve follower notify failed:", err));
  }

  return auction;
}

export async function approveAuction(auctionId: string, notes?: string): Promise<Auction | null> {
  // Anchor the seller-intended duration to approval time, not submission time.
  // ends_at - starts_at on the submission represents the duration the seller asked for;
  // approval may happen days later, so we shift the window to start now.
  const result = await query(
    `UPDATE auctions SET
       approval_status = 'approved',
       approval_notes  = $2,
       status          = 'scheduled',
       starts_at       = NOW(),
       ends_at         = NOW() + (ends_at - starts_at),
       updated_at      = NOW()
     WHERE id = $1 AND approval_status = 'pending_review' RETURNING *`,
    [auctionId, notes || null]
  );
  const auction = (result.rows[0] as Auction) ?? null;

  // Lifecycle + governance — fire-and-forget. Approval is the moment
  // an auction becomes publicly biddable, so admins want this surfaced
  // alongside other moderator actions in the governance log.
  if (auction) {
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId: auction.id,
        action: "approved",
        actorLabel: "admin:auction-review",
        reason: notes || "Listing approved for live bidding",
        metadata: { starts_at: auction.starts_at, ends_at: auction.ends_at },
      }),
    );
    void import("@/lib/admin/governance-log").then(({ logAdminAction }) =>
      logAdminAction({
        actorLabel: "admin:auction-review",
        targetUserId: auction.seller_user_id,
        targetKind: "auction",
        targetId: auction.id,
        action: "auction.approved",
        beforeValue: { approval_status: "pending_review", status: "draft" },
        afterValue: { approval_status: "approved", status: "scheduled" },
        reason: notes ?? null,
      }),
    );
  }

  // Broadcast to the seller's followers now that the auction is actually
  // visible. Fire-and-forget — approval shouldn't block on email dispatch.
  // Uses the main image (if any) as the preview; first image is the cover.
  if (auction && auction.seller_user_id) {
    const image = await query(
      `SELECT url FROM auction_images WHERE auction_id = $1 ORDER BY display_order LIMIT 1`,
      [auction.id]
    );
    const { notifyFollowersOfAuctionListing } = await import("@/lib/social/notify");
    notifyFollowersOfAuctionListing({
      sellerId: auction.seller_user_id,
      auctionId: auction.id,
      auctionTitle: auction.title,
      imageUrl: image.rows[0]?.url ?? null,
      startingPrice: parseFloat(auction.starting_price),
      buyNowPrice: auction.buy_now_price ? parseFloat(auction.buy_now_price) : null,
      endsAt: auction.ends_at,
    }).catch((err) => console.error("[auction] follower-notify failed:", err));
  }

  return auction;
}

export async function rejectAuction(auctionId: string, notes: string): Promise<Auction | null> {
  const result = await query(
    `UPDATE auctions SET approval_status = 'rejected', approval_notes = $2,
     status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND approval_status = 'pending_review' RETURNING *`,
    [auctionId, notes]
  );
  const auction = (result.rows[0] as Auction) ?? null;

  if (auction) {
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId: auction.id,
        action: "cancelled",
        actorLabel: "admin:auction-review",
        reason: notes,
        metadata: { decision: "rejected" },
      }),
    );
    void import("@/lib/admin/governance-log").then(({ logAdminAction }) =>
      logAdminAction({
        actorLabel: "admin:auction-review",
        targetUserId: auction.seller_user_id,
        targetKind: "auction",
        targetId: auction.id,
        action: "auction.rejected",
        beforeValue: { approval_status: "pending_review" },
        afterValue: { approval_status: "rejected", status: "cancelled" },
        reason: notes,
      }),
    );
  }

  return auction;
}

export async function getUserAuctions(userId: string): Promise<AuctionSummary[]> {
  const result = await query(
    `SELECT a.id, a.title, a.auction_type, a.status, a.current_price, a.starting_price,
            a.buy_now_price, a.bid_count, a.starts_at, a.ends_at,
            a.approval_status, a.seller_commission_rate, a.seller_payout,
            (SELECT url FROM auction_images WHERE auction_id = a.id ORDER BY display_order LIMIT 1) as image_url
     FROM auctions a WHERE a.seller_user_id = $1 ORDER BY a.created_at DESC`,
    [userId]
  );
  return result.rows as AuctionSummary[];
}

export async function getPendingApprovalAuctions(): Promise<AuctionSummary[]> {
  const result = await query(
    `SELECT a.id, a.title, a.auction_type, a.status, a.current_price, a.starting_price,
            a.buy_now_price, a.bid_count, a.starts_at, a.ends_at,
            a.approval_status, a.seller_user_id, a.seller_commission_rate,
            (SELECT url FROM auction_images WHERE auction_id = a.id ORDER BY display_order LIMIT 1) as image_url,
            u.name as seller_name, u.email as seller_email
     FROM auctions a
     LEFT JOIN users u ON a.seller_user_id = u.id
     WHERE a.approval_status = 'pending_review'
     ORDER BY a.created_at ASC`
  );
  return result.rows as AuctionSummary[];
}

// ── Best Offer accept/reject ──
// Accepting an offer ends the Buy Now auction at the offer price; the offerer becomes the winner.
// Rejecting just marks the offer as rejected; auction continues.

export async function getOffer(auctionId: string, bidId: string): Promise<{
  bid: Bid;
  auction: Auction;
} | null> {
  const result = await query(
    `SELECT b.*, a.id as a_id, a.seller_user_id, a.status as a_status,
            a.title as a_title, a.auction_type as a_type, a.allow_best_offer
       FROM auction_bids b
       JOIN auctions a ON a.id = b.auction_id
      WHERE b.id = $1 AND b.auction_id = $2`,
    [bidId, auctionId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    bid: {
      id: row.id, auction_id: row.auction_id, user_id: row.user_id, amount: row.amount,
      is_best_offer: row.is_best_offer, status: row.status, created_at: row.created_at,
    },
    // Only the seller-relevant fields are needed by callers
    auction: { id: row.a_id, status: row.a_status, title: row.a_title,
               auction_type: row.a_type, allow_best_offer: row.allow_best_offer,
               seller_user_id: row.seller_user_id } as unknown as Auction,
  };
}

export async function acceptOffer(auctionId: string, bidId: string): Promise<{
  ok: boolean;
  error?: string;
  winnerEmail?: string;
  winningPrice?: string;
  auctionTitle?: string;
}> {
  return transaction(async (q) => {
    const auctionRes = await q(
      `SELECT * FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );
    if (auctionRes.rows.length === 0) {
      return { ok: false, error: "Auction not found." };
    }
    const auction = auctionRes.rows[0];

    if (auction.status !== "live") {
      return { ok: false, error: "Auction is not live." };
    }

    const bidRes = await q(
      `SELECT b.*, u.email FROM auction_bids b JOIN users u ON b.user_id = u.id
        WHERE b.id = $1 AND b.auction_id = $2 AND b.is_best_offer = true AND b.status = 'active'`,
      [bidId, auctionId]
    );
    if (bidRes.rows.length === 0) {
      return { ok: false, error: "Offer not found or already resolved." };
    }
    const bid = bidRes.rows[0];

    // End the auction at the offer price; mark this bid winning, others rejected
    await q(
      `UPDATE auctions SET status = 'ended', actual_end_at = NOW(),
         winner_user_id = $1, current_price = $2, updated_at = NOW()
        WHERE id = $3`,
      [bid.user_id, bid.amount, auctionId]
    );
    await q(
      `UPDATE auction_bids SET status = 'winning' WHERE id = $1`,
      [bidId]
    );
    await q(
      `UPDATE auction_bids SET status = 'rejected'
        WHERE auction_id = $1 AND status = 'active' AND id != $2`,
      [auctionId, bidId]
    );

    return {
      ok: true,
      winnerEmail: bid.email,
      winningPrice: bid.amount,
      auctionTitle: auction.title,
    };
  });
}

export async function rejectOffer(auctionId: string, bidId: string): Promise<boolean> {
  const result = await query(
    `UPDATE auction_bids SET status = 'rejected'
      WHERE id = $1 AND auction_id = $2 AND is_best_offer = true AND status = 'active'
      RETURNING id`,
    [bidId, auctionId]
  );
  return result.rows.length > 0;
}

export async function calculateSellerPayout(auctionId: string): Promise<{ payout: number; commission: number } | null> {
  // JOIN seller's current tier so a tier upgrade between auction creation
  // and payout retroactively reduces commission. Stored seller_commission_rate
  // is the floor: min(stored, current tier rate). Tier downgrades never
  // increase the rate.
  const result = await query(
    `SELECT a.*, t.auction_commission_rate AS tier_rate
       FROM auctions a
       LEFT JOIN users u ON u.id = a.seller_user_id
       LEFT JOIN tiers t ON t.id = u.tier_id
      WHERE a.id = $1`,
    [auctionId]
  );
  if (result.rows.length === 0) return null;
  const auction = result.rows[0];
  const salePrice = parseFloat(auction.current_price);
  const storedRate = parseFloat(auction.seller_commission_rate || "0.12");
  const tierRate = auction.tier_rate ? parseFloat(auction.tier_rate) : null;
  const rate = tierRate !== null && tierRate < storedRate ? tierRate : storedRate;
  const commission = Math.round(salePrice * rate * 100) / 100;
  const payout = salePrice - commission;

  await query(
    `UPDATE auctions SET seller_payout = $1, seller_commission_rate = $2, updated_at = NOW() WHERE id = $3`,
    [payout.toFixed(2), rate.toFixed(4), auctionId]
  );

  return { payout, commission };
}

// ── Lazy status transitions ──

async function transitionScheduledToLive(): Promise<void> {
  const r = await query(
    `UPDATE auctions SET status = 'live', updated_at = NOW()
     WHERE status = 'scheduled' AND starts_at <= NOW()
     RETURNING id, title`
  );
  for (const row of r.rows) {
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId: row.id,
        action: "live",
        actorLabel: "system:auction-scheduler",
        reason: `Auction "${row.title}" went live (scheduled start reached)`,
      }),
    );
  }
}

async function transitionLiveToEnded(): Promise<void> {
  // Find auctions that should end. Return enough fields to decide reserve + emails
  // without a second query per row.
  const ended = await query(
    `UPDATE auctions SET status = 'ended', actual_end_at = NOW(), updated_at = NOW()
     WHERE status = 'live' AND ends_at <= NOW()
     RETURNING id, title, reserve_price, bid_count`
  );

  for (const row of ended.rows) {
    // Pick highest non-best-offer bid; best offers are seller-driven, not auction winners
    const highBid = await query(
      `SELECT b.user_id, b.amount, u.email
         FROM auction_bids b
         JOIN users u ON b.user_id = u.id
        WHERE b.auction_id = $1 AND b.status = 'active' AND b.is_best_offer = false
        ORDER BY b.amount DESC LIMIT 1`,
      [row.id]
    );

    const reserve = row.reserve_price ? parseFloat(row.reserve_price) : null;
    const winning = highBid.rows[0];
    const reserveMet = winning && (reserve === null || parseFloat(winning.amount) >= reserve);

    let winnerEmail: string | null = null;
    let winningPrice = "0";

    if (winning && reserveMet) {
      // Stamp payment deadline so the winner can't sit on it forever; the
      // unpaid-cancel sweep picks this up after the winner's window elapses.
      // Winner-aware: their response_window_hours (migration 0092) overrides
      // the 48h platform default when declared.
      const paymentExpiresAt = await paymentExpiresAtForBuyer(winning.user_id, DEFAULT_AUCTION_PAYMENT_WINDOW_HOURS);
      await query(
        `UPDATE auctions SET winner_user_id = $1, current_price = $2,
                              payment_expires_at = $3
           WHERE id = $4`,
        [winning.user_id, winning.amount, paymentExpiresAt, row.id]
      );
      await query(
        `UPDATE auction_bids SET status = 'winning'
          WHERE auction_id = $1 AND user_id = $2 AND amount = $3 AND is_best_offer = false`,
        [row.id, winning.user_id, winning.amount]
      );
      winnerEmail = winning.email;
      winningPrice = winning.amount;
    } else if (winning && !reserveMet) {
      // Reserve unmet — auction ends with no winner; mark active bids as outbid for clarity
      await query(
        `UPDATE auction_bids SET status = 'outbid'
          WHERE auction_id = $1 AND status = 'active' AND is_best_offer = false`,
        [row.id]
      );
    }

    // Fire-and-forget notifications; never block the lazy transition on email
    if (winnerEmail) {
      sendWinnerEmail({
        email: winnerEmail,
        auctionTitle: row.title,
        auctionId: row.id,
        winningPrice: formatPrice(parseFloat(winningPrice)),
      }).catch((err) => console.error("[auction] Winner email failed:", err));
    }

    sendAuctionEndedAdminEmail({
      auctionTitle: row.title,
      auctionId: row.id,
      winnerEmail,
      winningPrice: formatPrice(parseFloat(winningPrice)),
      bidCount: row.bid_count,
    }).catch((err) => console.error("[auction] Admin end email failed:", err));

    // Lifecycle log — distinguishes the two end paths so /account/journey
    // can render "auction ended (no winner)" vs "auction ended with winner"
    // with different tones.
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId: row.id,
        action: winning && reserveMet ? "ended_with_winner" : "ended_no_winner",
        actorLabel: "system:auction-scheduler",
        reason: winning && reserveMet
          ? `Sold to winner for ${formatPrice(parseFloat(winningPrice))}`
          : (winning ? "Reserve unmet — no sale" : "No bids — no sale"),
        metadata: {
          winning_bid_gbp: winning ? parseFloat(winningPrice) : 0,
          reserve_gbp: reserve,
          bid_count: row.bid_count,
        },
      }),
    );
  }
}

// Cancel auctions whose winner never paid in time. Resets winner so the
// listing is clearly unpaid; the auction itself moves to 'cancelled' rather
// than re-opening (auctions, unlike continuous market orders, don't naturally
// re-list at the same end time — relisting is a separate seller action).
async function sweepUnpaidEndedAuctions(): Promise<void> {
  // RETURNING winner_user_id so we can fan out fraud signals + audit
  // entries for the defaulting buyer.
  const expired = await query(
    `UPDATE auctions
        SET status = 'cancelled', updated_at = NOW()
      WHERE status = 'ended'
        AND winner_user_id IS NOT NULL
        AND paid_at IS NULL
        AND payment_expires_at IS NOT NULL
        AND payment_expires_at <= NOW()
      RETURNING id, title, winner_user_id, current_price`
  );

  for (const row of expired.rows) {
    sendAuctionEndedAdminEmail({
      auctionTitle: row.title,
      auctionId: row.id,
      winnerEmail: null,
      winningPrice: formatPrice(0),
      bidCount: 0,
    }).catch((err) => console.error("[auction] Unpaid-cancel admin email failed:", err));

    // Lifecycle log: 'unpaid_lapsed' transition
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId: row.id,
        action: "unpaid_lapsed",
        actorLabel: "system:auction-cron",
        reason: `48h payment window lapsed; auction cancelled`,
        metadata: { winning_bid_gbp: parseFloat(row.current_price ?? "0") },
      }),
    );

    // AUCTION_DEFAULT fraud signal — high severity, autoAction=
    // block_trade. Repeat defaulters cross the auto-suspend threshold
    // via the existing evaluateAutoSuspend gate; first-time defaults
    // just lower trust + flag for admin review.
    if (row.winner_user_id) {
      void (async () => {
        try {
          const { emitSignal, SIGNAL_DEFS } = await import("@/lib/fraud/detection");
          await emitSignal({
            userId: row.winner_user_id,
            def: SIGNAL_DEFS.AUCTION_DEFAULT,
            description: `Won auction "${row.title}" (£${parseFloat(row.current_price ?? "0").toFixed(2)}) but didn't pay within 48h`,
            dedupeKey: `auction-default:${row.id}`,
          });
          // Recompute trust so the penalty flows in immediately.
          const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
          await calculateTrustScore(row.winner_user_id);
          // Governance trail
          const { logAdminAction } = await import("@/lib/admin/governance-log");
          await logAdminAction({
            actorLabel: "system:auction-cron",
            targetUserId: row.winner_user_id,
            targetKind: "user",
            targetId: row.winner_user_id,
            action: "user.auction_default",
            afterValue: { auction_id: row.id, winning_bid_gbp: parseFloat(row.current_price ?? "0") },
            reason: `Auction "${row.title}" cancelled — winner failed to pay within 48h`,
          });
        } catch (err) {
          console.error("[auction-default] fan-out failed:", err);
        }
      })();
    }
  }
}

// ── Manual payout recording (provider-agnostic) ──
// Mirrors market.recordTradePayout. Auctions only have payout for seller-
// listed (consigned) auctions where seller_user_id is set. For
// method='stripe_connect' the transfer is executed here.
export async function recordAuctionPayout(data: {
  auctionId: string;
  method: string;
  reference?: string;
}): Promise<{ ok: true; transferId?: string } | { ok: false; error: string }> {
  const r = await query(
    `SELECT a.status, a.seller_paid_at, a.seller_payout, a.seller_user_id, a.title,
            u.email AS seller_email
       FROM auctions a
       LEFT JOIN users u ON u.id = a.seller_user_id
      WHERE a.id = $1`,
    [data.auctionId]
  );
  if (r.rows.length === 0) return { ok: false, error: "Auction not found." };
  const a = r.rows[0];

  if (!a.seller_user_id) return { ok: false, error: "This auction has no seller to pay." };
  if (a.seller_paid_at) return { ok: false, error: "Payout already recorded." };
  if (a.status !== "paid") {
    return { ok: false, error: `Cannot pay seller until auction is paid (currently ${a.status}).` };
  }
  if (!a.seller_payout) {
    return { ok: false, error: "No seller_payout calculated yet — run calculate_payout first." };
  }

  let transferId: string | undefined;
  let storedReference = data.reference || null;
  if (data.method === "stripe_connect") {
    try {
      const { createTransferToSeller } = await import("@/lib/payouts/stripe-connect");
      const result = await createTransferToSeller({
        sellerUserId: a.seller_user_id,
        amountGbp: parseFloat(a.seller_payout),
        description: `Payout for auction ${data.auctionId} (${a.title})`,
        idempotencyKey: `payout-auction-${data.auctionId}`,
        metadata: { auctionId: data.auctionId, kind: "auction" },
      });
      transferId = result.transferId;
      storedReference = transferId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe transfer failed";
      return { ok: false, error: msg };
    }
  }

  await query(
    `UPDATE auctions
        SET seller_paid_at = NOW(),
            payout_method = $2,
            payout_reference = $3,
            stripe_transfer_id = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [data.auctionId, data.method, storedReference, transferId || null]
  );

  // Notify the seller (best-effort). Reuses the auction email helper layout.
  if (a.seller_email) {
    const { sendStatusEmail } = await import("@/lib/market/email");
    sendStatusEmail({
      email: a.seller_email,
      cardName: a.title,
      subject: `Payout sent: ${a.title} (£${a.seller_payout})`,
      heading: "Payout sent",
      body: `Your payout of <strong>£${a.seller_payout}</strong> for <strong>${a.title}</strong> has been sent via ${data.method}${storedReference ? ` (ref <code>${storedReference}</code>)` : ""}.`,
    }).catch((err) => console.error("[auction] Payout email failed:", err));
  }

  // In-app notification — bell deep-links to /account/payouts so the
  // history row is one click away. Same dedup pattern as the trade
  // payout: the duplicate guard above is the primary, this is for
  // retries from the cron sweep.
  const { notify } = await import("@/lib/notifications/db");
  await notify({
    userId: a.seller_user_id,
    kind: "payout.released",
    title: `Payout released: £${a.seller_payout} for ${a.title}`,
    body: data.method === "stripe_connect"
      ? "Funds are on their way to your Stripe account."
      : `Paid via ${data.method.replace(/_/g, " ")}.`,
    linkUrl: "/account/payouts",
    referenceType: "auction_payout",
    referenceId: data.auctionId,
  });

  // Lifecycle + trust + governance — fire-and-forget. Successful
  // payout is a positive seller signal (completed sale loop), so
  // recompute their trust score. Governance logs the admin action;
  // lifecycle log closes the auction's audit trail.
  void import("@/lib/auction/lifecycle-log").then(({ logAuctionTransition }) =>
    logAuctionTransition({
      auctionId: data.auctionId,
      action: "seller_paid_out",
      actorId: a.seller_user_id,
      actorLabel: "admin:auction-payout",
      reason: `£${a.seller_payout} paid via ${data.method}`,
      metadata: {
        amount_gbp: a.seller_payout,
        method: data.method,
        reference: storedReference,
        stripe_transfer_id: transferId ?? null,
      },
    }),
  );
  void import("@/lib/escrow/trust-engine").then(({ calculateTrustScore }) =>
    calculateTrustScore(a.seller_user_id).catch(() => { /* ignore */ }),
  );
  void import("@/lib/admin/governance-log").then(({ logAdminAction }) =>
    logAdminAction({
      actorLabel: "admin:auction-payout",
      targetUserId: a.seller_user_id,
      targetKind: "auction",
      targetId: data.auctionId,
      action: "auction.paid_out",
      beforeValue: { seller_paid_at: null },
      afterValue: { seller_paid_at: "now()", method: data.method, amount: a.seller_payout },
      reason: `Payout ref: ${storedReference ?? "(none)"}`,
    }),
  );

  return { ok: true, transferId };
}

// ── Cron entry point ──
// Runs all auction lifecycle transitions out-of-band so they don't depend on
// read traffic. Lazy versions remain wired into reads as a safety net.
export async function runAuctionMaintenance(): Promise<void> {
  await transitionScheduledToLive();
  await transitionLiveToEnded();
  await sweepUnpaidEndedAuctions();
}
