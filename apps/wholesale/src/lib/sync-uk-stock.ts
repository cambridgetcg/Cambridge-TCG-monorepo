import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Sync UK warehouse stock into cards.stock and cards.pending_stock.
 *
 * stock         = received purchase qty - fulfilled qty + stock adjustments
 * pending_stock = ordered/shipped purchase qty
 *
 * Stock adjustments (from manual counts, damage, etc.) are persisted in
 * stock_adjustments and layered on top of purchase-derived stock so they
 * survive re-sync operations.
 */
export async function syncUkStock(cardIds?: number[]) {
  const scope = cardIds?.length ? sql`AND c.id = ANY(${cardIds})` : sql``;
  const scopeNoAlias = cardIds?.length ? sql`AND id = ANY(${cardIds})` : sql``;

  // On-hand stock: all received purchases (A- treated same as Mint)
  await db.execute(sql`
    UPDATE cards c
    SET stock = COALESCE(uk.qty_on_hand, 0)
    FROM (
      SELECT
        p.card_id,
        GREATEST(SUM(p.qty_purchased) - COALESCE(f.qty_fulfilled, 0), 0)::int AS qty_on_hand
      FROM (
        SELECT pi.card_id, SUM(pi.quantity) AS qty_purchased
        FROM purchase_items pi
        JOIN purchases pu ON pu.id = pi.purchase_id
        WHERE pu.status = 'received'
        GROUP BY pi.card_id
      ) p
      LEFT JOIN (
        SELECT oi.card_id, SUM(fe.fulfilled_qty) AS qty_fulfilled
        FROM fulfillment_entries fe
        JOIN order_items oi ON oi.id = fe.order_item_id AND oi.removed_at IS NULL
        GROUP BY oi.card_id
      ) f ON f.card_id = p.card_id
      GROUP BY p.card_id, f.qty_fulfilled
    ) uk
    WHERE c.id = uk.card_id ${scope}
  `);

  // Zero out on-hand for cards with no received purchases
  await db.execute(sql`
    UPDATE cards SET stock = 0
    WHERE stock != 0
    AND id NOT IN (
      SELECT pi.card_id FROM purchase_items pi
      JOIN purchases pu ON pu.id = pi.purchase_id
      WHERE pu.status = 'received'
    )
    ${scopeNoAlias}
  `);

  // Layer stock adjustments (manual counts, damage, etc.) on top of
  // purchase-derived stock so they persist across re-syncs
  await db.execute(sql`
    UPDATE cards c
    SET stock = GREATEST(c.stock + adj.total_delta, 0)
    FROM (
      SELECT card_id, SUM(delta)::int AS total_delta
      FROM stock_adjustments
      GROUP BY card_id
    ) adj
    WHERE c.id = adj.card_id ${scope}
  `);

  // Pending stock: ordered or shipped (all conditions counted)
  await db.execute(sql`
    UPDATE cards c
    SET pending_stock = COALESCE(pk.qty_pending, 0)
    FROM (
      SELECT pi.card_id, SUM(pi.quantity)::int AS qty_pending
      FROM purchase_items pi
      JOIN purchases pu ON pu.id = pi.purchase_id
      WHERE pu.status IN ('ordered', 'shipped')
      GROUP BY pi.card_id
    ) pk
    WHERE c.id = pk.card_id ${scope}
  `);

  // Zero out pending for cards with no ordered/shipped purchases
  await db.execute(sql`
    UPDATE cards SET pending_stock = 0
    WHERE pending_stock != 0
    AND id NOT IN (
      SELECT pi.card_id FROM purchase_items pi
      JOIN purchases pu ON pu.id = pi.purchase_id
      WHERE pu.status IN ('ordered', 'shipped')
    )
    ${scopeNoAlias}
  `);
}
