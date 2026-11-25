/**
 * Stock reservation adapter.
 *
 * Storefront's bridge to @cambridge-tcg/stock. Handles the dimensional
 * differences between storefront's view of an item (sku string) and the
 * package's view (numeric cardId). Wraps multi-item operations in a single
 * Drizzle transaction so a cart either fully commits or fully rolls back.
 *
 * Nothing reserves stock any more: the last caller, B2B checkout, was closed
 * in July 2026 and removed on 2026-11-24. What stays lets a late Stripe event
 * for an earlier session commit or release what that session held.
 *
 * See docs/architecture/storefront-checkout-flow.md for the original design.
 */

import { createDb } from "@cambridge-tcg/db";
import {
  createStockService,
  stockMovements,
  stockReservations,
  stockTargets,
} from "@cambridge-tcg/stock";
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { eq, inArray, sql } from "drizzle-orm";

// ── Minimal Drizzle table refs ─────────────────────────────────────────────
//
// The stock package needs Drizzle table objects for cards/purchases/
// purchaseItems. We can't import wholesale's schema directly because storefront
// doesn't depend on apps/wholesale. We declare minimal shadow definitions
// covering only the columns the stock package actually reads/writes — they
// must stay in sync with the canonical schema in
// apps/wholesale/src/lib/db/schema.ts. A schema-mismatch test (in a future
// mission) would catch drift; for the prototype, this is the documented seam.

const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").default(""),
  gameId: integer("game_id"),
  price: text("price"),
  stock: integer("stock").notNull().default(0),
  pendingStock: integer("pending_stock").notNull().default(0),
  reservedStock: integer("reserved_stock").default(0),
  stockReconciledAt: timestamp("stock_reconciled_at"),
});

const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  status: text("status"),
});

const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id"),
  cardId: integer("card_id"),
  quantity: integer("quantity"),
});

// ── Lazy singleton wholesale Drizzle connection ───────────────────────────

let _wholesale: ReturnType<typeof createDb> | null = null;
function wholesaleDb() {
  if (_wholesale) return _wholesale;
  const url = process.env.WHOLESALE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "stock/reservations: neither WHOLESALE_DATABASE_URL nor DATABASE_URL is set",
    );
  }
  _wholesale = createDb({ url });
  return _wholesale;
}

// ── Service ────────────────────────────────────────────────────────────────

let _service: ReturnType<typeof createStockService> | null = null;
function service() {
  if (_service) return _service;
  _service = createStockService(
    {
      cardsTable: cards,
      purchasesTable: purchases,
      purchaseItemsTable: purchaseItems,
    },
    {
      defaultReservationTtlMinutes: 30,
      enforceNonNegative: true,
    },
  );
  return _service;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface CartLine {
  sku: string;
  quantity: number;
}

/**
 * Build the canonical holder string for a Stripe checkout session.
 * Prefixed so future sources (P2P market, etc.) don't collide.
 */
export function holderForStripeSession(sessionId: string): string {
  return `stripe-session:${sessionId}`;
}

/**
 * Commit a reserved cart into a sale. Called from the Stripe
 * `checkout.session.completed` webhook after the order is durably
 * persisted.
 *
 * Idempotent via the package's `(cardId, referenceId)` UNIQUE constraint —
 * if Stripe redelivers the event, only one movement is written per item.
 *
 * Returns the number of newly-recorded movements (zero if every item was a
 * duplicate, which is normal on Stripe redelivery).
 */
export async function commitCartToSale(
  holder: string,
  items: CartLine[],
  channel = "cambridgetcg.com",
): Promise<{ ok: true; committed: number } | { ok: false; message: string }> {
  if (items.length === 0) return { ok: true, committed: 0 };

  const { db } = wholesaleDb();
  const { reserver } = service();

  const cardRows = await db
    .select({ id: cards.id, sku: cards.sku })
    .from(cards)
    .where(inArray(cards.sku, items.map((i) => i.sku)));
  const skuToCardId = new Map(cardRows.map((r) => [r.sku, r.id]));

  let committed = 0;
  try {
    await db.transaction(async (tx) => {
      for (const item of items) {
        const cardId = skuToCardId.get(item.sku);
        if (cardId === undefined) continue; // skip unknown sku
        const referenceId = `${holder}:sku:${item.sku}`;
        const movement = await reserver.commitToSale(tx, {
          cardId,
          holder,
          channel,
          referenceId,
        });
        if (movement) committed += 1;
      }
    });
    return { ok: true, committed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}

/**
 * Release every reservation held by a holder. Called when checkout fails,
 * is abandoned, or a Stripe session expires.
 */
export async function releaseHolder(
  holder: string,
): Promise<{ ok: true; released: number } | { ok: false; message: string }> {
  const { db } = wholesaleDb();
  const { reserver } = service();
  try {
    const rows = await db
      .select({ cardId: stockReservations.cardId })
      .from(stockReservations)
      .where(eq(stockReservations.holder, holder));
    if (rows.length === 0) return { ok: true, released: 0 };

    await db.transaction(async (tx) => {
      for (const { cardId } of rows) {
        await reserver.release(tx, { cardId, holder });
      }
    });
    return { ok: true, released: rows.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}

// Re-export for callers that want raw access in tests/scripts.
export { stockMovements, stockReservations, stockTargets };
