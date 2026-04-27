/**
 * @module @cambridge-tcg/stock
 *
 * Stock management package for Cambridge TCG.
 *
 * One truth, one writer. Every stock mutation flows through this package.
 * The movement ledger is the authority; the balance is a verifiable cache.
 *
 * Usage:
 *   import { createStockService } from '@cambridge-tcg/stock';
 *   import { cards, purchases, purchaseItems } from './db/schema';
 *
 *   const stock = createStockService(db, {
 *     cardsTable: cards,
 *     purchasesTable: purchases,
 *     purchaseItemsTable: purchaseItems,
 *   });
 *
 *   // Record a sale
 *   await db.transaction(async (tx) => {
 *     await stock.writer.recordSale(tx, {
 *       cardId: 42,
 *       quantity: 1,
 *       channel: 'shopify',
 *       referenceId: 'shopify:order:12345:item:67890',
 *     });
 *   });
 */

import { createStockWriter, type StockWriter } from "./writer.js";
import { createStockReader, type StockReader } from "./reader.js";
import { createStockReserver, type StockReserver } from "./reserver.js";
import { createStockReconciler, type StockReconciler } from "./reconciler.js";
import { createEventEmitter, type EventEmitter } from "./events.js";
import type {
  StockServiceOptions,
  StockChangedEvent,
  LowStockEvent,
} from "./types.js";

// ─── Table Dependencies ───

/**
 * The consuming app must pass its Drizzle table references.
 * The stock package doesn't own the cards table — it only reads/writes
 * specific columns on it.
 */
export interface TableDeps {
  /** The Drizzle cards table. Must have: id, stock, pendingStock, reservedStock, stockReconciledAt, gameId, price, sku, name */
  cardsTable: any;
  /** The Drizzle purchases table. Must have: id, status */
  purchasesTable: any;
  /** The Drizzle purchaseItems table. Must have: id, purchaseId, cardId, quantity */
  purchaseItemsTable: any;
}

// ─── Service ───

export interface StockService {
  writer: StockWriter;
  reader: StockReader;
  reserver: StockReserver;
  reconciler: StockReconciler;
  events: EventEmitter;
}

export function createStockService(
  tables: TableDeps,
  opts?: StockServiceOptions
): StockService {
  const enforceNonNegative = opts?.enforceNonNegative ?? true;
  const defaultTtlMinutes = opts?.defaultReservationTtlMinutes ?? 30;

  const events = createEventEmitter();

  const writer = createStockWriter({
    enforceNonNegative,
    cardsTable: tables.cardsTable,
  });

  const reader = createStockReader({
    cardsTable: tables.cardsTable,
    purchasesTable: tables.purchasesTable,
    purchaseItemsTable: tables.purchaseItemsTable,
  });

  const reserver = createStockReserver({
    defaultTtlMinutes,
    enforceNonNegative,
    cardsTable: tables.cardsTable,
  });

  const reconciler = createStockReconciler({
    cardsTable: tables.cardsTable,
    purchasesTable: tables.purchasesTable,
    purchaseItemsTable: tables.purchaseItemsTable,
  });

  return { writer, reader, reserver, reconciler, events };
}

// ─── Re-exports ───

export type {
  StockWriter,
  StockReader,
  StockReserver,
  StockReconciler,
  EventEmitter,
};

export type {
  CardId,
  MovementId,
  ReservationId,
  MovementKind,
  Channel,
  StockMovement,
  StockLevel,
  StockReservation,
  StockTarget,
  ReorderItem,
  ReconciliationResult,
  StockChangedEvent,
  LowStockEvent,
  StockServiceOptions,
  RecordSaleParams,
  RecordPurchaseReceivedParams,
  RecordFulfillmentParams,
  RecordAdjustmentParams,
  SetAbsoluteParams,
  ReserveParams,
  GetMovementsOptions,
  ListReorderQueueOptions,
  ListOutOfStockOptions,
} from "./types.js";

export { MOVEMENT_KINDS } from "./types.js";

export {
  stockMovements,
  stockReservations,
  stockTargets,
  type StockMovementRow,
  type NewStockMovement,
  type StockReservationRow,
  type StockTargetRow,
} from "./schema.js";

export type { DbClient } from "./db.js";
