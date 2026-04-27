/**
 * Stock service instance for wholesale.
 *
 * This is the single entry point for all stock operations in wholesale.
 * Every stock read/write should go through this service.
 *
 * Usage:
 *   import { stock } from '@/lib/stock';
 *
 *   // In a transaction:
 *   await db.transaction(async (tx) => {
 *     await stock.writer.recordSale(tx, { ... });
 *   });
 *
 *   // For reads (no transaction needed):
 *   const level = await stock.reader.getLevel(db, cardId);
 */

import { createStockService } from "@cambridge-tcg/stock";
import { cards, purchases, purchaseItems } from "./db/schema";

export const stock = createStockService({
  cardsTable: cards,
  purchasesTable: purchases,
  purchaseItemsTable: purchaseItems,
});
