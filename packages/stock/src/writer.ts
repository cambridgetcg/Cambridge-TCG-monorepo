/**
 * @module @cambridge-tcg/stock/writer
 *
 * Stock write operations. Every stock mutation flows through here.
 * Each operation runs in a single transaction: insert movement + update balance.
 */

import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { stockMovements } from "./schema";
import type {
  StockMovement,
  RecordSaleParams,
  RecordPurchaseReceivedParams,
  RecordFulfillmentParams,
  RecordAdjustmentParams,
  SetAbsoluteParams,
} from "./types";
import type { DbClient } from "./db";

// ─── Internal helpers ───

/**
 * The core mutation: insert a movement row and update the card's stock balance.
 * Returns the movement if inserted, or null if it was a duplicate (idempotent no-op).
 */
async function insertMovementAndUpdateBalance(
  tx: DbClient,
  params: {
    cardId: number;
    kind: string;
    channel: string;
    delta: number;
    referenceId: string | null;
    note: string | null;
    condition: string | null;
  },
  opts: { enforceNonNegative: boolean; cardsTable: any }
): Promise<StockMovement | null> {
  const { cardsTable, enforceNonNegative } = opts;

  // Oversell detection: with enforceNonNegative the balance update below
  // clamps at 0 while the movement keeps the full delta, so ledger and
  // cache would diverge silently. Read the balance FOR UPDATE (the same
  // row lock the update takes) so the check can't race, and surface the
  // clamp in the movement note and the log.
  let stockBefore: number | null = null;
  if (enforceNonNegative) {
    const [current] = await tx
      .select({ stock: cardsTable.stock })
      .from(cardsTable)
      .where(eq(cardsTable.id, params.cardId))
      .for("update");
    if (current && current.stock + params.delta < 0) {
      stockBefore = current.stock;
    }
  }

  const note =
    stockBefore !== null
      ? [
          params.note,
          `[oversell: delta ${params.delta} against stock ${stockBefore}; balance clamped to 0]`,
        ]
          .filter(Boolean)
          .join(" ")
      : params.note;

  // 1. Insert movement — ON CONFLICT DO NOTHING for idempotency
  const rows = await tx
    .insert(stockMovements)
    .values({
      cardId: params.cardId,
      kind: params.kind,
      channel: params.channel,
      delta: params.delta,
      referenceId: params.referenceId,
      note,
      condition: params.condition,
    })
    .onConflictDoNothing({
      target: [stockMovements.cardId, stockMovements.referenceId],
    })
    .returning();

  // If conflict (duplicate reference_id), this is a no-op
  if (rows.length === 0) {
    return null;
  }

  const movement = rows[0]!;

  if (stockBefore !== null) {
    console.error(
      `[stock] Oversell on card ${params.cardId}: delta ${params.delta} against stock ${stockBefore} (kind=${params.kind}, channel=${params.channel}, ref=${params.referenceId}) — balance clamped to 0, ledger records full delta`
    );
  }

  // 2. Update cards.stock
  if (enforceNonNegative) {
    await tx
      .update(cardsTable)
      .set({
        stock: sql`greatest(${cardsTable.stock} + ${params.delta}, 0)`,
      })
      .where(eq(cardsTable.id, params.cardId));
  } else {
    await tx
      .update(cardsTable)
      .set({
        stock: sql`${cardsTable.stock} + ${params.delta}`,
      })
      .where(eq(cardsTable.id, params.cardId));
  }

  return rowToMovement(movement);
}

function rowToMovement(row: typeof stockMovements.$inferSelect): StockMovement {
  return {
    id: row.id,
    cardId: row.cardId,
    kind: row.kind as StockMovement["kind"],
    channel: row.channel,
    delta: row.delta,
    referenceId: row.referenceId,
    note: row.note,
    condition: row.condition,
    createdAt: row.createdAt,
  };
}

// ─── Public API ───

export interface StockWriterDeps {
  enforceNonNegative: boolean;
  cardsTable: any; // The Drizzle cards table reference from the consuming app
}

export function createStockWriter(deps: StockWriterDeps) {
  const { enforceNonNegative, cardsTable } = deps;
  const insertOpts = { enforceNonNegative, cardsTable };

  return {
    /**
     * Record a channel sale (Shopify, eBay, v1 API, wholesale).
     * Decrements on-hand stock.
     * Idempotent: duplicate reference_id for the same card is a no-op.
     */
    async recordSale(
      tx: DbClient,
      params: RecordSaleParams
    ): Promise<StockMovement | null> {
      if (params.quantity <= 0) {
        throw new Error("Sale quantity must be positive");
      }
      if (!params.referenceId) {
        throw new Error("Sales require a reference_id for idempotency");
      }

      return insertMovementAndUpdateBalance(
        tx,
        {
          cardId: params.cardId,
          kind: "sale",
          channel: params.channel,
          delta: -params.quantity,
          referenceId: params.referenceId,
          note: params.note ?? null,
          condition: params.condition ?? null,
        },
        insertOpts
      );
    },

    /**
     * Record goods received from a supplier.
     * Increments on-hand stock.
     */
    async recordPurchaseReceived(
      tx: DbClient,
      params: RecordPurchaseReceivedParams
    ): Promise<StockMovement | null> {
      if (params.quantity <= 0) {
        throw new Error("Purchase quantity must be positive");
      }

      const referenceId = `purchase:${params.purchaseId}:item:${params.purchaseItemId}`;

      return insertMovementAndUpdateBalance(
        tx,
        {
          cardId: params.cardId,
          kind: "purchase_received",
          channel: "system",
          delta: params.quantity,
          referenceId,
          note: null,
          condition: params.condition ?? null,
        },
        insertOpts
      );
    },

    /**
     * Record a fulfillment (shipment to customer).
     * Decrements on-hand stock.
     *
     * For wholesale orders where sale and fulfillment are separate events,
     * only ONE should decrement stock. Convention: wholesale uses recordFulfillment
     * at ship time. Channel sales use recordSale at order time.
     */
    async recordFulfillment(
      tx: DbClient,
      params: RecordFulfillmentParams
    ): Promise<StockMovement | null> {
      if (params.quantity <= 0) {
        throw new Error("Fulfillment quantity must be positive");
      }

      const referenceId = `fulfill:${params.orderId}:item:${params.orderItemId}:${params.fulfillmentDate}`;

      return insertMovementAndUpdateBalance(
        tx,
        {
          cardId: params.cardId,
          kind: "fulfillment",
          channel: "wholesale",
          delta: -params.quantity,
          referenceId,
          note: null,
          condition: null,
        },
        insertOpts
      );
    },

    /**
     * Record a manual adjustment (count correction, damage, loss, found, return).
     * Delta can be positive or negative.
     */
    async recordAdjustment(
      tx: DbClient,
      params: RecordAdjustmentParams
    ): Promise<StockMovement | null> {
      return insertMovementAndUpdateBalance(
        tx,
        {
          cardId: params.cardId,
          kind: params.kind,
          channel: params.channel ?? "manual",
          delta: params.delta,
          referenceId: params.referenceId ?? null,
          note: params.note ?? null,
          condition: null,
        },
        insertOpts
      );
    },

    /**
     * Set stock to an absolute value via a correction movement.
     * Computes delta = desired - current in the same transaction.
     * Returns null if no change needed.
     */
    async setAbsolute(
      tx: DbClient,
      params: SetAbsoluteParams
    ): Promise<StockMovement | null> {
      if (params.desiredStock < 0) {
        throw new Error("Desired stock must be non-negative");
      }

      // Read current stock FOR UPDATE so a concurrent movement can't
      // land between this read and the relative update below — the
      // computed delta must still hold when it is applied.
      const [current] = await tx
        .select({ stock: cardsTable.stock })
        .from(cardsTable)
        .where(eq(cardsTable.id, params.cardId))
        .for("update");

      if (!current) {
        throw new Error(`Card ${params.cardId} not found`);
      }

      const delta = params.desiredStock - current.stock;
      if (delta === 0) return null;

      return insertMovementAndUpdateBalance(
        tx,
        {
          cardId: params.cardId,
          kind: "correction",
          channel: "manual",
          delta,
          referenceId: null,
          note: params.note ?? `Set absolute: ${current.stock} → ${params.desiredStock}`,
          condition: null,
        },
        insertOpts
      );
    },
  };
}

export type StockWriter = ReturnType<typeof createStockWriter>;
