// Notify a user's followers of a market event. Fire-and-forget — caller
// doesn't await. Never throws. Used from auction listing flow to broadcast
// "[seller] just listed [auction]" to their follower graph.
//
// Design:
//   - One query joins the follower IDs to their emails + names
//   - Per-follower send runs sequentially (not Promise.all) so SES rate
//     limits aren't spiked on a seller with thousands of followers
//   - Any one follower's failure is logged and skipped — it shouldn't
//     stall the rest of the broadcast
//
// Intentionally not rate-limited per-sender here: auction listings are
// rare and high-signal. Ask-level events are routed through the weekly
// watchlist digest instead of inline (see runBuyerWatchlistDigest).

import { query } from "@/lib/db";
import {
  sendFollowerAuctionListedEmail,
} from "@/lib/market/email";

export async function notifyFollowersOfAuctionListing(data: {
  sellerId: string;
  auctionId: string;
  auctionTitle: string;
  imageUrl: string | null;
  startingPrice: number;
  buyNowPrice: number | null;
  endsAt: string;
}): Promise<void> {
  // Look up seller display info + follower emails in one round trip
  const result = await query(
    `SELECT
       (SELECT name FROM users WHERE id = $1)      AS seller_name,
       (SELECT username FROM users WHERE id = $1)  AS seller_username,
       f.follower_id, fu.email, fu.name AS follower_name
       FROM follows f
       JOIN users fu ON fu.id = f.follower_id
      WHERE f.following_id = $1
        AND fu.email IS NOT NULL`,
    [data.sellerId]
  );

  if (result.rows.length === 0) return;
  const sellerName = result.rows[0].seller_name || "A seller you follow";
  const sellerUsername = result.rows[0].seller_username;
  if (!sellerUsername) return; // Need a username for the /u/ link; no point otherwise

  for (const row of result.rows) {
    try {
      await sendFollowerAuctionListedEmail({
        email: row.email,
        followerName: row.follower_name,
        sellerName,
        sellerUsername,
        auctionTitle: data.auctionTitle,
        auctionId: data.auctionId,
        imageUrl: data.imageUrl,
        startingPrice: data.startingPrice,
        buyNowPrice: data.buyNowPrice,
        endsAt: data.endsAt,
      });
    } catch (err) {
      console.error(`[follow] auction-listed notify to ${row.email} failed:`, err);
    }
  }
}
