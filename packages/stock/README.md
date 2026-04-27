# @cambridge-tcg/stock

One truth, one writer. Every stock mutation flows through this package.

## What This Package Owns

**Tables** (created by this package):
- `stock_movements` — Append-only ledger. Every stock change is a row.
- `stock_reservations` — Time-limited holds for carts and checkout sessions.
- `stock_targets` — Reorder policy: price-band → target quantity.

**Columns on `cards`** (owned by this package, hosted on an external table):
- `stock` — On-hand sellable quantity (the cached balance).
- `pending_stock` — Quantity in transit from suppliers.
- `reserved_stock` — Quantity reserved by active carts.
- `stock_reconciled_at` — Last reconciliation timestamp.

The `cards` table itself is NOT owned by this package — it's passed in as a Drizzle table reference.

## Core Invariant

Every mutation writes a `stock_movements` row AND updates `cards.stock` in the same transaction. The movement ledger is the authority; the balance is a verifiable cache.

Idempotency is enforced by a `UNIQUE(card_id, reference_id)` constraint on `stock_movements`. Duplicate reference IDs for the same card are silently dropped (`ON CONFLICT DO NOTHING`).

## Usage

```typescript
import { createStockService } from '@cambridge-tcg/stock';
import { cards, purchases, purchaseItems } from './db/schema';

const stock = createStockService(db, {
  cardsTable: cards,
  purchasesTable: purchases,
  purchaseItemsTable: purchaseItems,
});
```

The service is a single object with five operation groups:

| Group | Purpose |
|-------|---------|
| `stock.writer` | Record mutations (sales, purchases, adjustments) |
| `stock.reader` | Query stock levels, movement history, reorder queue |
| `stock.reserver` | Reserve and release stock for carts |
| `stock.reconciler` | Verify and fix ledger ↔ balance alignment |
| `stock.events` | Register handlers for stock change events |

## Operations

### Writer

All writer operations require a Drizzle transaction (`tx`) as the first argument.

```typescript
// Record a channel sale (Shopify, eBay, v1 API)
await stock.writer.recordSale(tx, {
  cardId: 42,
  quantity: 1,
  channel: 'shopify',
  referenceId: 'shopify:order:12345:item:67890', // REQUIRED for idempotency
});

// Record goods received from supplier
await stock.writer.recordPurchaseReceived(tx, {
  cardId: 42,
  quantity: 10,
  purchaseId: 100,
  purchaseItemId: 200,
});

// Record order fulfillment (shipment)
await stock.writer.recordFulfillment(tx, {
  cardId: 42,
  quantity: 1,
  orderId: 50,
  orderItemId: 75,
  fulfillmentDate: '2026-04-27',
});

// Manual adjustment (count correction, damage, loss, found, return)
await stock.writer.recordAdjustment(tx, {
  cardId: 42,
  delta: -1,
  kind: 'damage',
  note: 'Water damage from shelf leak',
});

// Set stock to an absolute value (computes delta automatically)
await stock.writer.setAbsolute(tx, {
  cardId: 42,
  desiredStock: 15,
  note: 'Physical count correction',
});
```

Every writer method returns `StockMovement | null`. `null` means the operation was a no-op due to idempotency (duplicate `referenceId`).

### Reader

Reader operations accept either the root `db` or a transaction.

```typescript
// Single card level
const level = await stock.reader.getLevel(db, cardId);
// → { cardId, onHand, reserved, available, pending, lastReconciledAt }

// Batch card levels
const levels = await stock.reader.getLevels(db, [1, 2, 3]);
// → Map<CardId, StockLevel>

// Movement history
const movements = await stock.reader.getMovements(db, cardId, {
  limit: 20,
  kind: 'sale',
  channel: 'shopify',
  since: new Date('2026-04-01'),
});

// Derived pending from purchases
const pending = await stock.reader.computePending(db, [1, 2, 3]);

// Reorder queue (cards below target)
const toOrder = await stock.reader.listReorderQueue(db, { gameId: 1 });

// Out-of-stock cards
const oos = await stock.reader.listOutOfStock(db, { gameId: 1 });
```

### Reserver

Reservations hold stock for carts and checkout sessions without decrementing on-hand.

```typescript
// Reserve stock for a cart (upserts if same holder+card exists)
const reservation = await stock.reserver.reserve(tx, {
  cardId: 42,
  quantity: 2,
  holder: 'cart:user-abc',
  ttlMinutes: 30, // default from service options if omitted
});

// Release a reservation (cart cleared, abandoned)
await stock.reserver.release(tx, {
  cardId: 42,
  holder: 'cart:user-abc',
});

// Release all expired reservations (called by cron)
const releasedCount = await stock.reserver.releaseExpired(tx);

// Convert reservation to sale (payment confirmed)
const sale = await stock.reserver.commitToSale(tx, {
  cardId: 42,
  holder: 'cart:user-abc',
  channel: 'storefront',
  referenceId: 'storefront:order:1:item:1',
});
```

### Reconciler

Verifies and corrects the cached balance against the movement ledger.

```typescript
// Check for discrepancies (read-only)
const discrepancies = await stock.reconciler.check(db, [cardId]);
// → [{ cardId, storedBalance, derivedBalance, discrepancy }]

// Fix discrepancies by inserting reconciliation movements
const corrections = await stock.reconciler.fix(tx, [cardId]);

// Re-derive pending_stock from purchase records
const changes = await stock.reconciler.syncPending(tx, [cardId]);
```

**Migration-period behavior:** `fix()` trusts the stored balance (what the business operates on) and inserts corrective movements to align the ledger. After all mutations flow through the package, discrepancies should be zero.

### Events

Synchronous callbacks that fire after mutations. Fire-and-forget — handler errors are caught and logged.

```typescript
stock.events.onStockChanged(async (event) => {
  // event: { cardId, movementId, kind, channel, delta, newOnHand, newAvailable, newPending, timestamp }
  await syncShopifyInventory(event.cardId, event.newOnHand);
});

stock.events.onLowStock(async (event) => {
  // event: { cardId, onHand, target, pending, timestamp }
  await notifyPurchasing(event);
});
```

## Reference ID Conventions

The `referenceId` field is the key to idempotency. Format conventions:

| Source | Pattern | Example |
|--------|---------|---------|
| Shopify (webhook, cron, backfill) | `shopify:order:{orderId}:item:{lineItemId}` | `shopify:order:5001:item:8001` |
| eBay | `ebay:order:{orderId}:sku:{sku}` | `ebay:order:300:sku:OP01-001-R` |
| v1 Sales API | `v1:{channel}:{orderRef}:{sku}` | `v1:wholesale:REF001:OP01-001-R` |
| Purchase received | `purchase:{purchaseId}:item:{itemId}` | `purchase:42:item:99` |
| Fulfillment | `fulfill:{orderId}:item:{itemId}:{date}` | `fulfill:50:item:75:2026-04-27` |
| Reconciliation | `reconcile:{timestamp}:{cardId}` | `reconcile:2026-04-27T12:00:00Z:42` |

**Cross-path dedup:** Shopify webhook, cron, and backfill all use the same `shopify:order:{id}:item:{id}` format. Whichever fires first writes the movement; the others are idempotent no-ops. This solves the historical double-decrement bug without removing any ingestion path.

## Movement Kinds

| Kind | Direction | Description |
|------|-----------|-------------|
| `purchase_received` | Inbound (+) | Supplier order received |
| `found` | Inbound (+) | Physical count found more than expected |
| `return` | Inbound (+) | Customer returned goods |
| `sale` | Outbound (−) | Sold through any channel |
| `fulfillment` | Outbound (−) | Shipped to customer |
| `damage` | Outbound (−) | Item damaged, removed from sellable stock |
| `loss` | Outbound (−) | Item lost (shrinkage) |
| `correction` | Either | Manual count correction |
| `reconciliation` | Either | System-generated correction from `reconcile.fix()` |

## Configuration

```typescript
const stock = createStockService(tables, {
  defaultReservationTtlMinutes: 30,  // Default TTL for reserve() calls
  enforceNonNegative: true,          // Floor stock at 0 (default: true)
});
```

## Migration Strategy: Dual-Write

During migration, ported handlers write to BOTH:
1. `stock_movements` (via this package) — for idempotency and the movement ledger
2. `stock_adjustments` (original table) — for `syncUkStock` backward compatibility

When `syncUkStock` is ported to read from `stock_movements`, the `stock_adjustments` dual-write can be removed.

## Testing

```bash
pnpm test          # Run once
pnpm test:watch    # Watch mode
pnpm typecheck     # Type check
```

**Test structure:**
- `types.test.ts` — Type shapes and MOVEMENT_KINDS
- `events.test.ts` — Event emitter behavior (ordering, error isolation)
- `service.test.ts` — Service factory shape (all methods present)
- `writer-validation.test.ts` — Writer input validation (guard clauses)
- `flows.test.ts` — End-to-end business logic flows against in-memory DB

The flow tests exercise:
1. Purchase received → on-hand increments
2. Channel sale → on-hand decrements with idempotency
3. Reserve → commit → sale lifecycle
4. Reserve → release → stock restored
5. Cross-path dedup (Shopify webhook + cron + backfill mutual dedup)
6. Non-negative enforcement
7. setAbsolute delta computation
8. Reservation stock availability checks
9. Multi-channel full lifecycle (purchase → sales → adjustment → correction)

## Adding a New Consumer

To wire a new app or service onto this package:

1. **Install:** `pnpm add @cambridge-tcg/stock` (workspace link)
2. **Create a bridge:** Export a configured `StockService` instance from your app's `lib/stock.ts`:
   ```typescript
   import { createStockService } from '@cambridge-tcg/stock';
   import { cards, purchases, purchaseItems } from '../db/schema';

   export const stock = createStockService({
     cardsTable: cards,
     purchasesTable: purchases,
     purchaseItemsTable: purchaseItems,
   });
   ```
3. **Use in handlers:** Import `stock` from your bridge, wrap mutations in `db.transaction()`.
4. **Generate a referenceId:** Follow the conventions above. The format must be deterministic from the source event's natural keys so that retries produce the same ID.

## File Structure

```
packages/stock/
├── src/
│   ├── index.ts          # Service factory + re-exports
│   ├── schema.ts         # Drizzle schema (stock_movements, stock_reservations, stock_targets)
│   ├── types.ts          # Domain types (StockMovement, StockLevel, params, events)
│   ├── db.ts             # DbClient type abstraction
│   ├── writer.ts         # Stock write operations
│   ├── reader.ts         # Stock read operations
│   ├── reserver.ts       # Reservation lifecycle
│   ├── reconciler.ts     # Ledger ↔ balance verification and correction
│   ├── events.ts         # Synchronous event emitter
│   └── __tests__/
│       ├── types.test.ts
│       ├── events.test.ts
│       ├── service.test.ts
│       ├── writer-validation.test.ts
│       └── flows.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```
