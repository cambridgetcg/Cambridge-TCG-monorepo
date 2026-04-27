/**
 * @module @cambridge-tcg/stock/events
 *
 * Synchronous event emitter for stock changes.
 * Consumers register handlers; they fire after each mutation.
 * If a handler throws, the stock mutation is NOT rolled back
 * (fire-and-forget with error logging).
 */

import type { StockChangedEvent, LowStockEvent } from "./types.js";

export type StockChangedHandler = (event: StockChangedEvent) => Promise<void>;
export type LowStockHandler = (event: LowStockEvent) => Promise<void>;

export function createEventEmitter() {
  const stockChangedHandlers: StockChangedHandler[] = [];
  const lowStockHandlers: LowStockHandler[] = [];

  return {
    onStockChanged(handler: StockChangedHandler): void {
      stockChangedHandlers.push(handler);
    },

    onLowStock(handler: LowStockHandler): void {
      lowStockHandlers.push(handler);
    },

    async emitStockChanged(event: StockChangedEvent): Promise<void> {
      for (const handler of stockChangedHandlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error(
            `[stock] StockChanged handler error for card ${event.cardId}:`,
            err
          );
        }
      }
    },

    async emitLowStock(event: LowStockEvent): Promise<void> {
      for (const handler of lowStockHandlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error(
            `[stock] LowStock handler error for card ${event.cardId}:`,
            err
          );
        }
      }
    },
  };
}

export type EventEmitter = ReturnType<typeof createEventEmitter>;
