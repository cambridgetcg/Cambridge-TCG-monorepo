import { query } from "@/lib/db";
import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { getCardOrderBook } from "@/lib/market/db";
import type { PortfolioCard, ValuatedCard, PortfolioSummary, PortfolioSnapshot, ListingAction } from "./types";
import { COMMISSION_RATE } from "@/lib/market/types";
import { SELLER_COMMISSION_RATE } from "@/lib/auction/types";
import { awardAchievement } from "@/lib/social/db";

// ── CRUD ──

export async function addCard(userId: string, data: {
  sku: string;
  cardName?: string;
  cardNumber?: string;
  setCode?: string;
  setName?: string;
  imageUrl?: string;
  rarity?: string;
  condition: string;
  quantity: number;
  acquisitionPrice?: number;
  acquiredAt?: string;
  notes?: string;
}): Promise<PortfolioCard> {
  // Upsert: if same user+sku+condition exists, add quantity
  const existing = await query(
    `SELECT * FROM portfolio_cards WHERE user_id = $1 AND sku = $2 AND condition = $3`,
    [userId, data.sku, data.condition]
  );

  if (existing.rows.length > 0) {
    const card = existing.rows[0];
    const newQty = card.quantity + data.quantity;
    // Weighted average acquisition price
    const oldTotal = card.acquisition_price ? parseFloat(card.acquisition_price) * card.quantity : 0;
    const newTotal = (data.acquisitionPrice || 0) * data.quantity;
    const avgPrice = newQty > 0 ? (oldTotal + newTotal) / newQty : null;

    const result = await query(
      `UPDATE portfolio_cards SET quantity = $1, acquisition_price = $2,
       card_name = COALESCE($3, card_name), image_url = COALESCE($4, image_url),
       set_code = COALESCE($5, set_code), set_name = COALESCE($6, set_name),
       rarity = COALESCE($7, rarity), updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [newQty, avgPrice?.toFixed(2) ?? null, data.cardName, data.imageUrl,
       data.setCode, data.setName, data.rarity, card.id]
    );

    // Social: collection milestone achievements
    query(
      `SELECT COALESCE(SUM(quantity), 0) as total FROM portfolio_cards WHERE user_id = $1`,
      [userId]
    ).then((res) => {
      const total = parseInt(res.rows[0].total, 10);
      if (total >= 10) awardAchievement(userId, "collection_10").catch(() => {});
      if (total >= 50) awardAchievement(userId, "collection_50").catch(() => {});
      if (total >= 100) awardAchievement(userId, "collection_100").catch(() => {});
    }).catch(() => {});

    return result.rows[0] as PortfolioCard;
  }

  const result = await query(
    `INSERT INTO portfolio_cards (user_id, sku, card_name, card_number, set_code, set_name,
      image_url, rarity, condition, quantity, acquisition_price, acquired_at, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [userId, data.sku, data.cardName || null, data.cardNumber || null,
     data.setCode || null, data.setName || null, data.imageUrl || null,
     data.rarity || null, data.condition, data.quantity,
     data.acquisitionPrice?.toFixed(2) ?? null,
     data.acquiredAt || null, data.notes || null]
  );

  // Social: collection milestone achievements
  query(
    `SELECT COALESCE(SUM(quantity), 0) as total FROM portfolio_cards WHERE user_id = $1`,
    [userId]
  ).then((res) => {
    const total = parseInt(res.rows[0].total, 10);
    if (total >= 10) awardAchievement(userId, "collection_10").catch(() => {});
    if (total >= 50) awardAchievement(userId, "collection_50").catch(() => {});
    if (total >= 100) awardAchievement(userId, "collection_100").catch(() => {});
  }).catch(() => {});

  return result.rows[0] as PortfolioCard;
}

export async function updateCard(cardId: string, userId: string, data: {
  quantity?: number;
  acquisitionPrice?: number;
  condition?: string;
  notes?: string;
}): Promise<PortfolioCard | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.quantity !== undefined) { fields.push(`quantity = $${idx++}`); values.push(data.quantity); }
  if (data.acquisitionPrice !== undefined) { fields.push(`acquisition_price = $${idx++}`); values.push(data.acquisitionPrice.toFixed(2)); }
  if (data.condition) { fields.push(`condition = $${idx++}`); values.push(data.condition); }
  if (data.notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(data.notes || null); }

  if (fields.length === 0) return null;
  fields.push("updated_at = NOW()");
  values.push(userId, cardId);

  const result = await query(
    `UPDATE portfolio_cards SET ${fields.join(", ")} WHERE user_id = $${idx++} AND id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] as PortfolioCard ?? null;
}

export async function removeCard(cardId: string, userId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM portfolio_cards WHERE id = $1 AND user_id = $2 RETURNING id`,
    [cardId, userId]
  );
  return result.rows.length > 0;
}

export async function getUserCards(userId: string): Promise<PortfolioCard[]> {
  const result = await query(
    `SELECT * FROM portfolio_cards WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows as PortfolioCard[];
}

// ── Valuation ──

export async function valuatePortfolio(userId: string): Promise<{
  cards: ValuatedCard[];
  summary: PortfolioSummary;
}> {
  const cards = await getUserCards(userId);

  const valuated: ValuatedCard[] = await Promise.all(
    cards.map(async (card) => {
      // Fetch live pricing
      const [wholesale, orderBook, creditCard, cashCard] = await Promise.all([
        fetchCard(card.sku).catch(() => null),
        getCardOrderBook(card.sku).catch(() => ({ bids: [], asks: [], recent_trades: [], best_bid: null, best_ask: null, sku: card.sku, card_name: null, image_url: null })),
        fetchCard(card.sku, "tradein-credit").catch(() => null),
        fetchCard(card.sku, "tradein-cash").catch(() => null),
      ]);

      const spotPrice = wholesale ? retailPrice(wholesale.price_gbp, wholesale.channel_price) : null;

      // Backfill image_url from wholesale if missing
      if (!card.image_url && wholesale?.image_url) {
        query(`UPDATE portfolio_cards SET image_url=$1 WHERE id=$2`, [wholesale.image_url, card.id]).catch(() => {});
        card.image_url = wholesale.image_url;
      }

      const bestBid = orderBook.best_bid ? parseFloat(orderBook.best_bid) : null;
      const bestAsk = orderBook.best_ask ? parseFloat(orderBook.best_ask) : null;
      const tradeinCredit = creditCard?.channel_price ?? null;
      const tradeinCash = cashCard?.channel_price ?? null;

      // Market price = best available ask, or spot if no P2P
      const marketPrice = bestAsk ?? spotPrice;
      const currentValue = (marketPrice ?? 0) * card.quantity;
      const totalCost = card.acquisition_price ? parseFloat(card.acquisition_price) * card.quantity : null;
      const pnl = totalCost !== null ? currentValue - totalCost : null;
      const pnlPercent = totalCost && totalCost > 0 ? (pnl! / totalCost) * 100 : null;

      return {
        ...card,
        spot_price: spotPrice,
        market_price: marketPrice,
        best_bid: bestBid,
        tradein_credit: tradeinCredit,
        tradein_cash: tradeinCash,
        current_value: currentValue,
        total_cost: totalCost,
        pnl,
        pnl_percent: pnlPercent,
      };
    })
  );

  const totalValue = valuated.reduce((s, c) => s + c.current_value, 0);
  const totalCost = valuated.every((c) => c.total_cost !== null)
    ? valuated.reduce((s, c) => s + (c.total_cost ?? 0), 0)
    : null;
  const totalPnl = totalCost !== null ? totalValue - totalCost : null;
  const totalPnlPercent = totalCost && totalCost > 0 ? (totalPnl! / totalCost) * 100 : null;
  const cardCount = valuated.reduce((s, c) => s + c.quantity, 0);

  return {
    cards: valuated,
    summary: {
      total_value: totalValue,
      total_cost: totalCost,
      total_pnl: totalPnl,
      total_pnl_percent: totalPnlPercent,
      card_count: cardCount,
      unique_cards: valuated.length,
    },
  };
}

// ── Listing actions for a card ──

export function getListingActions(card: ValuatedCard): ListingAction[] {
  const actions: ListingAction[] = [];

  // Market ask (P2P)
  if (card.spot_price) {
    const netAfterCommission = card.spot_price * (1 - COMMISSION_RATE);
    actions.push({
      type: "market_ask",
      label: "Sell on Market",
      description: `List at spot £${card.spot_price.toFixed(2)} or set your price. 8% commission.`,
      estimated_return: Math.round(netAfterCommission * 100) / 100,
    });
  }

  // Auction
  if (card.market_price && card.market_price >= 5) {
    const netAfterCommission = (card.market_price ?? 0) * (1 - SELLER_COMMISSION_RATE);
    actions.push({
      type: "auction",
      label: "List at Auction",
      description: `Let buyers compete. 12% commission on sale.`,
      estimated_return: Math.round(netAfterCommission * 100) / 100,
    });
  }

  // Trade-in
  if (card.tradein_credit && card.tradein_credit > 0) {
    actions.push({
      type: "tradein",
      label: "Trade In",
      description: `Instant credit: £${card.tradein_credit.toFixed(2)} or cash: £${(card.tradein_cash ?? 0).toFixed(2)}. No commission.`,
      estimated_return: card.tradein_credit,
    });
  }

  return actions;
}

// ── Snapshots ──

export async function saveSnapshot(userId: string, totalValue: number, totalCost: number | null, cardCount: number): Promise<void> {
  await query(
    `INSERT INTO portfolio_snapshots (user_id, total_value, total_cost, card_count)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE SET total_value = $2, total_cost = $3, card_count = $4`,
    [userId, totalValue.toFixed(2), totalCost?.toFixed(2) ?? null, cardCount]
  );
}

export async function getSnapshots(userId: string, days: number = 30): Promise<PortfolioSnapshot[]> {
  const result = await query(
    `SELECT * FROM portfolio_snapshots WHERE user_id = $1 AND snapshot_date > NOW() - INTERVAL '${days} days'
     ORDER BY snapshot_date ASC`,
    [userId]
  );
  return result.rows as PortfolioSnapshot[];
}
