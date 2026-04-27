// Wishlist matching — evaluates every open wishlist item against the live
// storefront (wholesale retail) price and the P2P market order book, then
// queues a wishlist_matched email when something meets the user's
// max_price AND condition_min.
//
// The sweep runs in the daily cron (after the price-history tick) so the
// freshest data is available. Idempotency key per (wishlist item, day)
// plus a 7-day cooldown on the wishlists row itself means a hot P2P
// listing can't flood the wisher's inbox.
//
// Sources considered:
//   - wholesale: retailPrice(fetchCard(sku)) gives the "store" price.
//     We treat store stock as condition = NM.
//   - market_orders: DISTINCT ON sku, condition picks the lowest open ask
//     per (sku, condition).
// Match direction: pick the single best (cheapest) eligible listing
// across both sources — the one most likely to close the wish.

import { query } from "@/lib/db";
import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { scheduleEmail } from "@/lib/email/queue";

export type MatchSource = "wholesale" | "p2p";

export interface WishlistMatchCandidate {
  wishlistId: string;
  userId: string;
  sku: string;
  cardName: string;
  cardNumber: string | null;
  imageUrl: string | null;
  maxPrice: number;
  conditionMin: string;
  // Winning listing:
  source: MatchSource;
  priceGbp: number;
  condition: string;
  quantityAvailable: number;
  // When P2P, the id is useful for deep-linking the email
  marketOrderId: string | null;
}

// Ranking: NM > LP > MP > HP > DMG. Returns >= if candidateCondition meets
// or exceeds the required minimum.
const CONDITION_RANK: Record<string, number> = {
  NM: 5, LP: 4, MP: 3, HP: 2, DMG: 1,
};

function meetsCondition(candidate: string, min: string): boolean {
  const c = CONDITION_RANK[(candidate || "NM").toUpperCase()] ?? 0;
  const m = CONDITION_RANK[(min || "NM").toUpperCase()] ?? 5;
  return c >= m;
}

const REFIRE_COOLDOWN_DAYS = 7;

export interface WishlistMatchSweepResult {
  considered: number;
  matched: number;
  skipped: number;
  errors: number;
}

export async function runWishlistMatchSweep(): Promise<WishlistMatchSweepResult> {
  // Only consider wishlist items with a SKU + max_price and not yet
  // fulfilled; un-SKU'd items need manual catalog resolution first.
  const wishRows = await query(
    `SELECT id, user_id, sku, card_name, card_number, image_url,
            max_price, condition_min, last_matched_at
     FROM wishlists
     WHERE fulfilled = false
       AND sku IS NOT NULL
       AND max_price IS NOT NULL
       AND max_price > 0`,
  );

  if (wishRows.rows.length === 0) {
    return { considered: 0, matched: 0, skipped: 0, errors: 0 };
  }

  // Pre-fetch the cheapest open P2P ask per (sku, condition) in one query.
  const skus = wishRows.rows.map((r) => r.sku);
  const askRows = await query(
    `SELECT DISTINCT ON (sku, condition)
       id, sku, condition, price, (quantity - filled_quantity) AS remaining
     FROM market_orders
     WHERE side = 'ask'
       AND status IN ('open', 'partially_filled')
       AND sku = ANY($1::text[])
     ORDER BY sku, condition, price ASC`,
    [skus],
  );
  // Build: sku → array of (condition, price, id, remaining), sorted cheapest first.
  const asksBySku = new Map<
    string,
    Array<{ id: string; condition: string; price: number; remaining: number }>
  >();
  for (const a of askRows.rows) {
    const arr = asksBySku.get(a.sku) ?? [];
    arr.push({
      id: a.id,
      condition: a.condition,
      price: parseFloat(a.price),
      remaining: parseInt(a.remaining, 10),
    });
    asksBySku.set(a.sku, arr);
  }

  let matched = 0;
  let skipped = 0;
  let errors = 0;

  for (const w of wishRows.rows) {
    // Cooldown
    if (w.last_matched_at) {
      const since = Date.now() - new Date(w.last_matched_at).getTime();
      if (since < REFIRE_COOLDOWN_DAYS * 86400 * 1000) {
        skipped++;
        continue;
      }
    }

    const maxPrice = parseFloat(w.max_price);
    const conditionMin = (w.condition_min || "NM").toUpperCase();

    try {
      // 1. Cheapest P2P match meeting condition_min.
      let best: WishlistMatchCandidate | null = null;
      const asks = asksBySku.get(w.sku) ?? [];
      for (const a of asks) {
        if (a.remaining <= 0) continue;
        if (!meetsCondition(a.condition, conditionMin)) continue;
        if (a.price > maxPrice) continue;
        if (!best || a.price < best.priceGbp) {
          best = {
            wishlistId: w.id, userId: w.user_id, sku: w.sku,
            cardName: w.card_name, cardNumber: w.card_number,
            imageUrl: w.image_url,
            maxPrice, conditionMin,
            source: "p2p",
            priceGbp: a.price,
            condition: a.condition,
            quantityAvailable: a.remaining,
            marketOrderId: a.id,
          };
        }
      }

      // 2. Storefront (wholesale-based) — treat as NM.
      if (meetsCondition("NM", conditionMin)) {
        const card = await fetchCard(w.sku);
        if (card && card.stock > 0) {
          const storePrice = retailPrice(card.price_gbp, card.channel_price);
          if (storePrice <= maxPrice && (!best || storePrice < best.priceGbp)) {
            best = {
              wishlistId: w.id, userId: w.user_id, sku: w.sku,
              cardName: w.card_name, cardNumber: w.card_number,
              imageUrl: w.image_url,
              maxPrice, conditionMin,
              source: "wholesale",
              priceGbp: storePrice,
              condition: "NM",
              quantityAvailable: card.stock,
              marketOrderId: null,
            };
          }
        }
      }

      if (!best) { skipped++; continue; }

      // Queue the email. Idempotency key includes today so re-running the
      // sweep the same day can't duplicate.
      const today = new Date().toISOString().slice(0, 10);
      await scheduleEmail({
        userId: best.userId,
        event: "wishlist_matched",
        data: {
          wishlistId: best.wishlistId,
          sku: best.sku,
          cardName: best.cardName,
          cardNumber: best.cardNumber,
          imageUrl: best.imageUrl,
          maxPrice: best.maxPrice,
          conditionMin: best.conditionMin,
          source: best.source,
          priceGbp: best.priceGbp,
          condition: best.condition,
          quantityAvailable: best.quantityAvailable,
          marketOrderId: best.marketOrderId,
        },
        scheduledFor: new Date(Date.now() + 30 * 1000),
        idempotencyKey: `wishlist_matched:${best.wishlistId}:${today}`,
      });

      await query(
        `UPDATE wishlists SET last_matched_at = NOW() WHERE id = $1`,
        [w.id],
      );

      matched++;
    } catch (err) {
      errors++;
      console.error(`[wishlist-match] failed for ${w.id}:`, err);
    }
  }

  return { considered: wishRows.rows.length, matched, skipped, errors };
}
