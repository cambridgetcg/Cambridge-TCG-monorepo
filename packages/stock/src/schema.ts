/**
 * @module @cambridge-tcg/stock/schema
 *
 * Drizzle schema for stock-owned tables.
 *
 * Tables owned by this package:
 *   - stock_movements (migrated from stock_adjustments)
 *   - stock_reservations (new)
 *   - stock_targets (moved from wholesale)
 *
 * Columns owned on external tables:
 *   - cards.stock (on-hand balance cache)
 *   - cards.pending_stock (pending from purchases)
 *   - cards.reserved_stock (reserved by carts/checkouts)
 *   - cards.stock_reconciled_at (last reconciliation timestamp)
 *
 * The cards table itself is NOT owned by this package — only these columns.
 * We re-export a reference to the cards table for joins but never define it.
 */

import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  unique,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Match the money type used in apps/wholesale for stock_targets
const money = customType<{ data: number; driverData: string }>({
  dataType() {
    return "numeric(10, 2)";
  },
  fromDriver(value: string): number {
    return Number(value);
  },
});

// ─── Stock Movements (append-only ledger) ───

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    cardId: integer("card_id").notNull(),
    kind: text("kind").notNull(),
    channel: text("channel").notNull().default("manual"),
    delta: integer("delta").notNull(),
    referenceId: text("reference_id"),
    note: text("note"),
    condition: text("condition"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Idempotency: no two movements for the same card with the same reference
    idempotent: unique("stock_movements_idempotent").on(
      table.cardId,
      table.referenceId
    ),
    cardIdx: index("stock_movements_card_idx").on(table.cardId),
    kindIdx: index("stock_movements_kind_idx").on(table.kind),
    createdIdx: index("stock_movements_created_idx").on(table.createdAt),
    referenceIdx: index("stock_movements_reference_idx").on(table.referenceId),
  })
);

// ─── Stock Reservations ───

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: serial("id").primaryKey(),
    cardId: integer("card_id").notNull(),
    quantity: integer("quantity").notNull(),
    holder: text("holder").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    holderCard: unique("stock_reservations_holder_card").on(
      table.holder,
      table.cardId
    ),
    cardIdx: index("stock_reservations_card_idx").on(table.cardId),
    expiresIdx: index("stock_reservations_expires_idx").on(table.expiresAt),
    quantityPositive: check(
      "stock_reservations_qty_positive",
      sql`${table.quantity} > 0`
    ),
  })
);

// ─── Stock Targets (reorder policy) ───

export const stockTargets = pgTable("stock_targets", {
  id: serial("id").primaryKey(),
  priceMin: money("price_min").notNull(),
  priceMax: money("price_max").notNull(),
  targetQty: integer("target_qty").notNull(),
});

// ─── Inferred types ───

export type StockMovementRow = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
export type StockReservationRow = typeof stockReservations.$inferSelect;
export type StockTargetRow = typeof stockTargets.$inferSelect;
