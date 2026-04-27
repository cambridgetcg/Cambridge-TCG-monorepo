/**
 * @module @cambridge-tcg/stock/reserver
 *
 * Stock reservation operations. Manages time-limited holds on stock
 * for carts and checkout sessions.
 */

import { eq, sql, and, lte } from "drizzle-orm";
import { stockMovements, stockReservations } from "./schema.js";
import type {
  StockMovement,
  StockReservation,
  ReserveParams,
} from "./types.js";
import type { DbClient } from "./db.js";

export interface StockReserverDeps {
  defaultTtlMinutes: number;
  enforceNonNegative: boolean;
  cardsTable: any;
}

export function createStockReserver(deps: StockReserverDeps) {
  const { defaultTtlMinutes, enforceNonNegative, cardsTable } = deps;

  return {
    /**
     * Reserve stock for a cart or checkout session.
     * Increments cards.reserved_stock. Does NOT decrement on_hand.
     * Fails if available (on_hand - reserved) < quantity.
     *
     * If a reservation already exists for this (holder, card_id),
     * updates the quantity and extends the expiry.
     */
    async reserve(
      tx: DbClient,
      params: ReserveParams
    ): Promise<StockReservation> {
      const ttl = params.ttlMinutes ?? defaultTtlMinutes;
      const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

      // Check available stock
      const [card] = await tx
        .select({
          stock: cardsTable.stock,
          reserved: sql<number>`coalesce(${cardsTable.reservedStock}, 0)`,
        })
        .from(cardsTable)
        .where(eq(cardsTable.id, params.cardId));

      if (!card) {
        throw new Error(`Card ${params.cardId} not found`);
      }

      // Check if there's an existing reservation for this holder+card
      const [existing] = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.holder, params.holder),
            eq(stockReservations.cardId, params.cardId)
          )
        );

      const currentReservedByThisHolder = existing?.quantity ?? 0;
      const available =
        card.stock - card.reserved + currentReservedByThisHolder;

      if (available < params.quantity) {
        throw new Error(
          `Insufficient stock for card ${params.cardId}: available=${available}, requested=${params.quantity}`
        );
      }

      if (existing) {
        // Update existing reservation
        const deltaReserved = params.quantity - existing.quantity;

        const [updated] = await tx
          .update(stockReservations)
          .set({
            quantity: params.quantity,
            expiresAt,
          })
          .where(eq(stockReservations.id, existing.id))
          .returning();

        // Update reserved_stock on cards
        if (deltaReserved !== 0) {
          await tx
            .update(cardsTable)
            .set({
              reservedStock: sql`greatest(coalesce(${cardsTable.reservedStock}, 0) + ${deltaReserved}, 0)`,
            })
            .where(eq(cardsTable.id, params.cardId));
        }

        return rowToReservation(updated!);
      }

      // Create new reservation
      const [reservation] = await tx
        .insert(stockReservations)
        .values({
          cardId: params.cardId,
          quantity: params.quantity,
          holder: params.holder,
          expiresAt,
        })
        .returning();

      // Increment reserved_stock
      await tx
        .update(cardsTable)
        .set({
          reservedStock: sql`coalesce(${cardsTable.reservedStock}, 0) + ${params.quantity}`,
        })
        .where(eq(cardsTable.id, params.cardId));

      return rowToReservation(reservation!);
    },

    /**
     * Release a reservation (cart cleared, checkout abandoned, timeout).
     * Decrements cards.reserved_stock.
     */
    async release(
      tx: DbClient,
      params: { cardId: number; holder: string }
    ): Promise<void> {
      const [reservation] = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.holder, params.holder),
            eq(stockReservations.cardId, params.cardId)
          )
        );

      if (!reservation) return; // Nothing to release

      await tx
        .delete(stockReservations)
        .where(eq(stockReservations.id, reservation.id));

      await tx
        .update(cardsTable)
        .set({
          reservedStock: sql`greatest(coalesce(${cardsTable.reservedStock}, 0) - ${reservation.quantity}, 0)`,
        })
        .where(eq(cardsTable.id, params.cardId));
    },

    /**
     * Release all expired reservations.
     * Called by a cron job. Returns the number released.
     */
    async releaseExpired(tx: DbClient): Promise<number> {
      const now = new Date();

      // Find all expired reservations
      const expired = await tx
        .select()
        .from(stockReservations)
        .where(lte(stockReservations.expiresAt, now));

      if (expired.length === 0) return 0;

      // Release each one (update reserved_stock per card)
      for (const reservation of expired) {
        await tx
          .update(cardsTable)
          .set({
            reservedStock: sql`greatest(coalesce(${cardsTable.reservedStock}, 0) - ${reservation.quantity}, 0)`,
          })
          .where(eq(cardsTable.id, reservation.cardId));
      }

      // Delete all expired
      await tx
        .delete(stockReservations)
        .where(lte(stockReservations.expiresAt, now));

      return expired.length;
    },

    /**
     * Commit a reservation into a sale.
     * Atomically: release reservation + record sale movement + decrement on_hand.
     */
    async commitToSale(
      tx: DbClient,
      params: {
        cardId: number;
        holder: string;
        channel: string;
        referenceId: string;
        note?: string;
      }
    ): Promise<StockMovement | null> {
      // Find the reservation
      const [reservation] = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.holder, params.holder),
            eq(stockReservations.cardId, params.cardId)
          )
        );

      if (!reservation) {
        throw new Error(
          `No reservation found for holder=${params.holder}, card=${params.cardId}`
        );
      }

      // Delete the reservation
      await tx
        .delete(stockReservations)
        .where(eq(stockReservations.id, reservation.id));

      // Decrement reserved_stock
      await tx
        .update(cardsTable)
        .set({
          reservedStock: sql`greatest(coalesce(${cardsTable.reservedStock}, 0) - ${reservation.quantity}, 0)`,
        })
        .where(eq(cardsTable.id, params.cardId));

      // Insert the sale movement
      const rows = await tx
        .insert(stockMovements)
        .values({
          cardId: params.cardId,
          kind: "sale",
          channel: params.channel,
          delta: -reservation.quantity,
          referenceId: params.referenceId,
          note: params.note ?? null,
          condition: null,
        })
        .onConflictDoNothing({
          target: [stockMovements.cardId, stockMovements.referenceId],
        })
        .returning();

      if (rows.length === 0) return null; // Duplicate

      // Decrement on_hand
      const stockUpdate = enforceNonNegative
        ? sql`greatest(${cardsTable.stock} - ${reservation.quantity}, 0)`
        : sql`${cardsTable.stock} - ${reservation.quantity}`;

      await tx
        .update(cardsTable)
        .set({ stock: stockUpdate })
        .where(eq(cardsTable.id, params.cardId));

      return {
        id: rows[0]!.id,
        cardId: rows[0]!.cardId,
        kind: rows[0]!.kind as StockMovement["kind"],
        channel: rows[0]!.channel,
        delta: rows[0]!.delta,
        referenceId: rows[0]!.referenceId,
        note: rows[0]!.note,
        condition: rows[0]!.condition,
        createdAt: rows[0]!.createdAt,
      };
    },
  };
}

function rowToReservation(
  row: typeof stockReservations.$inferSelect
): StockReservation {
  return {
    id: row.id,
    cardId: row.cardId,
    quantity: row.quantity,
    holder: row.holder,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export type StockReserver = ReturnType<typeof createStockReserver>;
