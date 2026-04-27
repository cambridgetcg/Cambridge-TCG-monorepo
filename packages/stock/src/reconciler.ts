/**
 * @module @cambridge-tcg/stock/reconciler
 *
 * Stock reconciliation. Verifies the cached balance against the movement
 * ledger and corrects discrepancies.
 *
 * This replaces the current syncUkStock() pattern — but without the
 * silent overwrite. check() reports discrepancies; fix() corrects them
 * with explicit reconciliation movements.
 */

import { eq, sql, inArray } from "drizzle-orm";
import { stockMovements } from "./schema.js";
import type {
  CardId,
  StockMovement,
  ReconciliationResult,
} from "./types.js";
import type { DbClient } from "./db.js";

export interface StockReconcilerDeps {
  cardsTable: any;
  purchasesTable: any;
  purchaseItemsTable: any;
}

export function createStockReconciler(deps: StockReconcilerDeps) {
  const { cardsTable, purchasesTable, purchaseItemsTable } = deps;

  return {
    /**
     * Derive on-hand stock from the movement ledger for given cards
     * and compare against the stored balance.
     *
     * Does NOT write. Returns discrepancies only.
     */
    async check(
      db: DbClient,
      cardIds?: CardId[]
    ): Promise<ReconciliationResult[]> {
      const cardFilter = cardIds?.length
        ? sql`WHERE m.card_id = ANY(${cardIds})`
        : sql``;

      // Derive stock from the movement ledger
      const derived = await db.execute(sql`
        SELECT
          m.card_id,
          coalesce(sum(m.delta), 0)::int as derived_balance
        FROM stock_movements m
        ${cardFilter}
        GROUP BY m.card_id
      `);

      const derivedMap = new Map<number, number>();
      for (const row of derived as any[]) {
        derivedMap.set(row.card_id, row.derived_balance);
      }

      // Get stored balances
      const storedConditions = cardIds?.length
        ? inArray(cardsTable.id, cardIds)
        : undefined;

      const stored = storedConditions
        ? await db
            .select({ id: cardsTable.id, stock: cardsTable.stock })
            .from(cardsTable)
            .where(storedConditions)
        : await db
            .select({ id: cardsTable.id, stock: cardsTable.stock })
            .from(cardsTable);

      // Compare
      const results: ReconciliationResult[] = [];
      for (const card of stored) {
        const derivedBalance = derivedMap.get(card.id) ?? 0;
        const discrepancy = derivedBalance - card.stock;
        if (discrepancy !== 0) {
          results.push({
            cardId: card.id,
            storedBalance: card.stock,
            derivedBalance,
            discrepancy,
          });
        }
      }

      return results;
    },

    /**
     * Derive on-hand stock from the movement ledger and fix discrepancies.
     *
     * Strategy: the stored balance (cards.stock) is treated as authoritative
     * during migration, since it's what the business has been operating on.
     * A reconciliation movement is inserted to bring the ledger SUM into
     * alignment with the stored balance.
     *
     * Before fix: stored = S, ledger_sum = D, discrepancy = D - S
     * Reconciliation movement delta = -(D - S) = S - D
     * After fix: new_ledger_sum = D + (S - D) = S = stored ✓
     *
     * Once all mutations go through the package, discrepancies should be zero.
     */
    async fix(
      tx: DbClient,
      cardIds?: CardId[]
    ): Promise<StockMovement[]> {
      const discrepancies = await this.check(tx, cardIds);
      const corrections: StockMovement[] = [];

      for (const d of discrepancies) {
        // The corrective delta brings ledger_sum to match stored balance
        const correctiveDelta = -d.discrepancy; // = stored - derived

        const [row] = await tx
          .insert(stockMovements)
          .values({
            cardId: d.cardId,
            kind: "reconciliation",
            channel: "system",
            delta: correctiveDelta,
            referenceId: `reconcile:${new Date().toISOString()}:${d.cardId}`,
            note: `Reconciliation: stored=${d.storedBalance}, ledger_sum=${d.derivedBalance}, corrective_delta=${correctiveDelta}`,
            condition: null,
          })
          .returning();

        // Mark the card as reconciled (stored balance is unchanged — it was already correct)
        await tx
          .update(cardsTable)
          .set({ stockReconciledAt: new Date() })
          .where(eq(cardsTable.id, d.cardId));

        corrections.push({
          id: row!.id,
          cardId: row!.cardId,
          kind: row!.kind as StockMovement["kind"],
          channel: row!.channel,
          delta: row!.delta,
          referenceId: row!.referenceId,
          note: row!.note,
          condition: row!.condition,
          createdAt: row!.createdAt,
        });
      }

      return corrections;
    },

    /**
     * Re-derive pending_stock from purchase records.
     * Updates cards.pending_stock for all affected cards.
     */
    async syncPending(
      tx: DbClient,
      cardIds?: CardId[]
    ): Promise<Array<{ cardId: CardId; oldPending: number; newPending: number }>> {
      // Get current pending values
      const currentConditions = cardIds?.length
        ? inArray(cardsTable.id, cardIds)
        : undefined;

      const currentRows = currentConditions
        ? await tx
            .select({
              id: cardsTable.id,
              pendingStock: cardsTable.pendingStock,
            })
            .from(cardsTable)
            .where(currentConditions)
        : await tx
            .select({
              id: cardsTable.id,
              pendingStock: cardsTable.pendingStock,
            })
            .from(cardsTable);

      const currentMap = new Map<number, number>();
      for (const row of currentRows) {
        currentMap.set(row.id, row.pendingStock);
      }

      // Derive pending from purchases
      const purchaseFilter = cardIds?.length
        ? sql`AND pi.card_id = ANY(${cardIds})`
        : sql``;

      const derived = await tx.execute(sql`
        SELECT
          pi.card_id,
          coalesce(sum(pi.quantity), 0)::int as pending_qty
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        WHERE p.status IN ('ordered', 'shipped')
          ${purchaseFilter}
        GROUP BY pi.card_id
      `);

      const derivedMap = new Map<number, number>();
      for (const row of derived as any[]) {
        derivedMap.set(row.card_id, row.pending_qty);
      }

      // Update cards where pending changed
      const changes: Array<{
        cardId: CardId;
        oldPending: number;
        newPending: number;
      }> = [];

      for (const [cardId, oldPending] of currentMap) {
        const newPending = derivedMap.get(cardId) ?? 0;
        if (newPending !== oldPending) {
          await tx
            .update(cardsTable)
            .set({ pendingStock: newPending })
            .where(eq(cardsTable.id, cardId));

          changes.push({ cardId, oldPending, newPending });
        }
      }

      return changes;
    },
  };
}

export type StockReconciler = ReturnType<typeof createStockReconciler>;
