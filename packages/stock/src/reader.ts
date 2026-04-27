/**
 * @module @cambridge-tcg/stock/reader
 *
 * Stock read operations. All queries go through here.
 */

import { eq, sql, and, desc, inArray, gt, asc, lte } from "drizzle-orm";
import { stockMovements, stockTargets } from "./schema";
import type {
  CardId,
  StockLevel,
  StockMovement,
  ReorderItem,
  GetMovementsOptions,
  ListReorderQueueOptions,
  ListOutOfStockOptions,
} from "./types";
import type { DbClient } from "./db";

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

export interface StockReaderDeps {
  cardsTable: any;
  purchasesTable: any;
  purchaseItemsTable: any;
}

export function createStockReader(deps: StockReaderDeps) {
  const { cardsTable, purchasesTable, purchaseItemsTable } = deps;

  return {
    /**
     * Get the current stock level for one card.
     * Reads from cards columns — fast, no ledger aggregation.
     */
    async getLevel(db: DbClient, cardId: CardId): Promise<StockLevel | null> {
      const [row] = await db
        .select({
          cardId: cardsTable.id,
          stock: cardsTable.stock,
          pendingStock: cardsTable.pendingStock,
          reservedStock: sql<number>`coalesce(${cardsTable.reservedStock}, 0)`,
          stockReconciledAt: cardsTable.stockReconciledAt,
        })
        .from(cardsTable)
        .where(eq(cardsTable.id, cardId));

      if (!row) return null;

      const onHand = row.stock;
      const reserved = row.reservedStock ?? 0;
      return {
        cardId: row.cardId,
        onHand,
        reserved,
        available: Math.max(0, onHand - reserved),
        pending: row.pendingStock,
        lastReconciledAt: row.stockReconciledAt ?? null,
      };
    },

    /**
     * Get stock levels for multiple cards. Single batched query.
     */
    async getLevels(
      db: DbClient,
      cardIds: CardId[]
    ): Promise<Map<CardId, StockLevel>> {
      if (cardIds.length === 0) return new Map();

      const rows = await db
        .select({
          cardId: cardsTable.id,
          stock: cardsTable.stock,
          pendingStock: cardsTable.pendingStock,
          reservedStock: sql<number>`coalesce(${cardsTable.reservedStock}, 0)`,
          stockReconciledAt: cardsTable.stockReconciledAt,
        })
        .from(cardsTable)
        .where(inArray(cardsTable.id, cardIds));

      const map = new Map<CardId, StockLevel>();
      for (const row of rows) {
        const onHand = row.stock;
        const reserved = row.reservedStock ?? 0;
        map.set(row.cardId, {
          cardId: row.cardId,
          onHand,
          reserved,
          available: Math.max(0, onHand - reserved),
          pending: row.pendingStock,
          lastReconciledAt: row.stockReconciledAt ?? null,
        });
      }
      return map;
    },

    /**
     * Get the movement history for a card, newest first.
     */
    async getMovements(
      db: DbClient,
      cardId: CardId,
      opts?: GetMovementsOptions
    ): Promise<StockMovement[]> {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      const conditions = [eq(stockMovements.cardId, cardId)];
      if (opts?.kind) {
        conditions.push(eq(stockMovements.kind, opts.kind));
      }
      if (opts?.channel) {
        conditions.push(eq(stockMovements.channel, opts.channel));
      }
      if (opts?.since) {
        conditions.push(
          sql`${stockMovements.createdAt} >= ${opts.since}`
        );
      }

      const rows = await db
        .select()
        .from(stockMovements)
        .where(and(...conditions))
        .orderBy(desc(stockMovements.createdAt))
        .limit(limit)
        .offset(offset);

      return rows.map(rowToMovement);
    },

    /**
     * Compute pending stock from purchase records.
     * Derived from purchases where status IN ('ordered', 'shipped').
     */
    async computePending(
      db: DbClient,
      cardIds?: CardId[]
    ): Promise<Map<CardId, number>> {
      const conditions = [
        sql`${purchasesTable.status} IN ('ordered', 'shipped')`,
      ];
      if (cardIds && cardIds.length > 0) {
        conditions.push(inArray(purchaseItemsTable.cardId, cardIds));
      }

      const rows = await db
        .select({
          cardId: purchaseItemsTable.cardId,
          totalPending: sql<number>`coalesce(sum(${purchaseItemsTable.quantity}), 0)`,
        })
        .from(purchaseItemsTable)
        .innerJoin(
          purchasesTable,
          eq(purchaseItemsTable.purchaseId, purchasesTable.id)
        )
        .where(and(...conditions))
        .groupBy(purchaseItemsTable.cardId);

      const map = new Map<CardId, number>();
      for (const row of rows) {
        map.set(row.cardId, Number(row.totalPending));
      }
      return map;
    },

    /**
     * List cards below their reorder target.
     * Joins stock + pending against stock_targets price bands.
     */
    async listReorderQueue(
      db: DbClient,
      opts?: ListReorderQueueOptions
    ): Promise<ReorderItem[]> {
      const minShortfall = opts?.minShortfall ?? 1;

      // Raw SQL for the price-band join since Drizzle doesn't have BETWEEN joins easily
      const gameFilter = opts?.gameId
        ? sql`AND c.game_id = ${opts.gameId}`
        : sql``;

      const rows = await db.execute(sql`
        SELECT
          c.id as card_id,
          c.sku,
          c.name,
          c.stock as current_stock,
          c.pending_stock,
          st.target_qty,
          greatest(st.target_qty - c.stock - c.pending_stock, 0) as to_order
        FROM cards c
        JOIN stock_targets st
          ON c.price >= st.price_min AND c.price < st.price_max
        WHERE st.target_qty - c.stock - c.pending_stock >= ${minShortfall}
          ${gameFilter}
        ORDER BY (st.target_qty - c.stock - c.pending_stock) DESC
      `);

      return (rows as any[]).map((row) => ({
        cardId: row.card_id,
        sku: row.sku,
        name: row.name,
        currentStock: row.current_stock,
        pendingStock: row.pending_stock,
        targetQty: row.target_qty,
        toOrder: row.to_order,
      }));
    },

    /**
     * List cards with zero or negative available stock.
     */
    async listOutOfStock(
      db: DbClient,
      opts?: ListOutOfStockOptions
    ): Promise<StockLevel[]> {
      const conditions = [lte(cardsTable.stock, 0)];
      if (opts?.gameId) {
        conditions.push(eq(cardsTable.gameId, opts.gameId));
      }
      if (opts?.includePending) {
        conditions.push(lte(cardsTable.pendingStock, 0));
      }

      const rows = await db
        .select({
          cardId: cardsTable.id,
          stock: cardsTable.stock,
          pendingStock: cardsTable.pendingStock,
          reservedStock: sql<number>`coalesce(${cardsTable.reservedStock}, 0)`,
          stockReconciledAt: cardsTable.stockReconciledAt,
        })
        .from(cardsTable)
        .where(and(...conditions));

      return rows.map((row) => {
        const onHand = row.stock;
        const reserved = row.reservedStock ?? 0;
        return {
          cardId: row.cardId,
          onHand,
          reserved,
          available: Math.max(0, onHand - reserved),
          pending: row.pendingStock,
          lastReconciledAt: row.stockReconciledAt ?? null,
        };
      });
    },
  };
}

export type StockReader = ReturnType<typeof createStockReader>;
