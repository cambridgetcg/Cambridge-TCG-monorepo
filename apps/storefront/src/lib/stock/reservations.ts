/**
 * Stock reservation adapter.
 *
 * Storefront's bridge to @cambridge-tcg/stock. Handles the dimensional
 * differences between storefront's view of an item (sku string) and the
 * package's view (numeric cardId). Wraps multi-item operations in a single
 * Drizzle transaction so a multi-item cart either fully reserves or fully
 * rolls back.
 *
 * See docs/architecture/storefront-checkout-flow.md for the full design.
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

export interface ReserveResult {
  ok: true;
  reserved: { sku: string; cardId: number; quantity: number }[];
}

export interface ReserveFailure {
  ok: false;
  reason: "out_of_stock" | "unknown_sku" | "internal";
  message: string;
  /** sku that triggered the failure, if known */
  sku?: string;
}

/**
 * Build the canonical holder string for a Stripe checkout session.
 * Prefixed so future sources (P2P market, etc.) don't collide.
 */
export function holderForStripeSession(sessionId: string): string {
  return `stripe-session:${sessionId}`;
}

/**
 * Reserve stock for every line in a cart. All-or-nothing — if any line
 * fails, the transaction rolls back and no reservations persist.
 *
 * Idempotent: if called twice with the same `holder`, the second call
 * updates the existing reservations (per the reserver's reserve() semantics).
 */
export async function reserveCartItems(
  holder: string,
  items: CartLine[],
): Promise<ReserveResult | ReserveFailure> {
  if (items.length === 0) {
    return { ok: true, reserved: [] };
  }

  const { db } = wholesaleDb();
  const { reserver } = service();

  // sku → cardId lookup (single query)
  const skus = items.map((i) => i.sku);
  const cardRows = await db
    .select({ id: cards.id, sku: cards.sku })
    .from(cards)
    .where(inArray(cards.sku, skus));
  const skuToCardId = new Map(cardRows.map((r) => [r.sku, r.id]));

  for (const item of items) {
    if (!skuToCardId.has(item.sku)) {
      return {
        ok: false,
        reason: "unknown_sku",
        sku: item.sku,
        message: `sku not found in wholesale cards table: ${item.sku}`,
      };
    }
  }

  try {
    const reserved: ReserveResult["reserved"] = [];
    await db.transaction(async (tx) => {
      for (const item of items) {
        const cardId = skuToCardId.get(item.sku)!;
        await reserver.reserve(tx, {
          cardId,
          quantity: item.quantity,
          holder,
        });
        reserved.push({ sku: item.sku, cardId, quantity: item.quantity });
      }
    });
    return { ok: true, reserved };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("Insufficient stock")) {
      // Reserver's specific failure mode
      const m = msg.match(/card (\d+)/);
      const cardId = m ? Number(m[1]) : undefined;
      const sku =
        cardId !== undefined
          ? cardRows.find((r) => r.id === cardId)?.sku
          : undefined;
      return { ok: false, reason: "out_of_stock", sku, message: msg };
    }
    return { ok: false, reason: "internal", message: msg };
  }
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
 * Sweep expired reservations. Called from /api/cron/maintenance once per
 * minute. Returns the number of reservations released.
 */
export async function releaseExpiredReservations(): Promise<{
  ok: true;
  released: number;
} | { ok: false; message: string }> {
  const { db } = wholesaleDb();
  const { reserver } = service();
  try {
    const released = await db.transaction(async (tx) =>
      reserver.releaseExpired(tx),
    );
    return { ok: true, released };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}

// Re-export for callers that want raw access in tests/scripts.
export { stockMovements, stockReservations, stockTargets };
