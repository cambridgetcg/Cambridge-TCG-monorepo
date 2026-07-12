/**
 * B2B cart — DB layer for /account/b2b shoppers.
 *
 * Pure DB IO. Caller is responsible for the role gate and the shared purchase
 * availability boundary. Cart rows store only sku + quantity. Current pricing
 * and checkout are paused; existing rows remain removable.
 *
 * Companion to:
 *   - apps/storefront/drizzle/0100_b2b_cart_items.sql — schema
 *   - apps/storefront/src/app/account/b2b/cart/actions.ts — server actions
 *   - apps/storefront/src/app/account/b2b/cart/page.tsx — display
 */

import { query } from "@/lib/db";

export interface B2BCartRow {
  sku: string;
  quantity: number;
  added_at: string;
}

export async function loadCartRows(userId: string): Promise<B2BCartRow[]> {
  const r = await query(
    `SELECT sku, quantity, added_at::text AS added_at
       FROM b2b_cart_items
      WHERE user_id = $1
      ORDER BY added_at ASC`,
    [userId],
  );
  return r.rows as B2BCartRow[];
}

export async function addItem(
  userId: string,
  sku: string,
  quantityDelta = 1,
): Promise<void> {
  if (quantityDelta <= 0) return;
  await query(
    `INSERT INTO b2b_cart_items (user_id, sku, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, sku) DO UPDATE
         SET quantity = b2b_cart_items.quantity + EXCLUDED.quantity,
             updated_at = NOW()`,
    [userId, sku, quantityDelta],
  );
}

export async function setQuantity(
  userId: string,
  sku: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) {
    await removeItem(userId, sku);
    return;
  }
  await query(
    `UPDATE b2b_cart_items
        SET quantity = $1, updated_at = NOW()
      WHERE user_id = $2 AND sku = $3`,
    [quantity, userId, sku],
  );
}

export async function removeItem(userId: string, sku: string): Promise<void> {
  await query(`DELETE FROM b2b_cart_items WHERE user_id = $1 AND sku = $2`, [userId, sku]);
}

export async function clearCart(userId: string): Promise<void> {
  await query(`DELETE FROM b2b_cart_items WHERE user_id = $1`, [userId]);
}

export async function countItems(userId: string): Promise<number> {
  const r = await query(
    `SELECT COALESCE(SUM(quantity), 0)::int AS n
       FROM b2b_cart_items WHERE user_id = $1`,
    [userId],
  );
  const row = r.rows[0] as { n: number } | undefined;
  return row?.n ?? 0;
}
