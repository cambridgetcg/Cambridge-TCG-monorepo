# `packages/stock` — Contract Specification

> **Mission:** `stock-design-packages-stock-contract`
> **Date:** 2026-04-27
> **Status:** Draft
> **Depends on:** `docs/architecture/stock-surface.md` (audit)

---

## 0. Design Principles

1. **One truth, one writer.** Every stock mutation flows through this package. No caller writes `cards.stock` directly.
2. **Movements are facts.** The `stock_movements` table is an append-only ledger. Each row records something that happened (received goods, sold an item, adjusted a count). Facts are never updated or deleted.
3. **Balance is a cache.** `cards.stock` is a materialized view of the movement ledger. The package owns the cache; callers read it but never write it.
4. **Idempotency by default.** Every external-facing operation accepts an idempotency key. Duplicate calls are safe no-ops.
5. **Transactions are non-negotiable.** Every mutation is a single DB transaction: insert movement + update balance. No partial states.
6. **Conditions are first-class.** The current system lumps all conditions. The contract supports per-condition tracking from day one, even if the initial implementation aggregates.

---

## 1. Core Types

```typescript
// ─── Identifiers ───

/** Card ID from the cards table. Stock doesn't own cards — it references them. */
type CardId = number;

/** Opaque movement ID. */
type MovementId = number;

/** Opaque reservation ID. */
type ReservationId = number;

// ─── Enums ───

/**
 * What happened to inventory. Replaces the current overloaded `reason` enum.
 *
 * INBOUND: goods entering the warehouse
 *   - purchase_received: supplier order received (from purchase_items)
 *   - found: physical count found more than expected
 *   - return: customer returned goods
 *
 * OUTBOUND: goods leaving the warehouse
 *   - sale: sold through any channel (Shopify, eBay, wholesale, v1 API)
 *   - fulfillment: shipped to customer (from fulfillment_entries)
 *   - damage: item damaged, removed from sellable stock
 *   - loss: item lost (shrinkage)
 *
 * NEUTRAL: corrections that don't represent physical movement
 *   - correction: manual count correction (delta can be +/-)
 *   - reconciliation: system-generated correction from reconcile()
 */
type MovementKind =
  | 'purchase_received'
  | 'found'
  | 'return'
  | 'sale'
  | 'fulfillment'
  | 'damage'
  | 'loss'
  | 'correction'
  | 'reconciliation';

/**
 * Source channel. Replaces the current free-text `channel` column.
 * Extensible — new channels are added here, not scattered across handlers.
 */
type Channel =
  | 'wholesale'      // Direct B2B orders
  | 'shopify'        // Shopify storefront
  | 'ebay'           // eBay listings
  | 'manual'         // Admin UI adjustments
  | 'system'         // syncUkStock, reconciliation, cron
  | string;          // Future channels (v1 API callers identify themselves)

/**
 * Purchase status — determines pending stock derivation.
 */
type PurchaseStatus = 'ordered' | 'shipped' | 'received';

// ─── Core Domain Objects ───

/**
 * A single stock movement. The atomic unit of the ledger.
 *
 * Movements are append-only. Once written, they are never modified.
 * The combination of (kind + channel + reference_id) should be unique
 * for any given card — this is the idempotency contract.
 */
interface StockMovement {
  id: MovementId;
  card_id: CardId;

  /** What happened */
  kind: MovementKind;

  /** Where it happened */
  channel: Channel;

  /**
   * Signed quantity change. Positive = stock increase, negative = decrease.
   * Convention: inbound kinds have positive delta, outbound have negative.
   * Corrections and reconciliations can be either.
   */
  delta: number;

  /**
   * External reference for idempotency.
   * Examples:
   *   - Shopify webhook: `shopify:order:12345`
   *   - eBay import: `ebay:order:67890`
   *   - v1 API: `v1:mychannel:order-ref-abc`
   *   - Purchase receive: `purchase:42:item:7`
   *   - Fulfillment: `fulfill:order:5:item:12`
   *   - Manual: `manual:admin:2026-04-27T14:30:00Z` (or null)
   *
   * When non-null, UNIQUE constraint on (card_id, reference_id) enforces
   * idempotency at the DB level.
   */
  reference_id: string | null;

  /** Optional human-readable note */
  note: string | null;

  /** Condition of the item, if known. Null = aggregated / unknown. */
  condition: string | null;

  created_at: Date;
}

/**
 * The cached stock level for a card. Derived from the movement ledger.
 * This is what callers read for "how many do we have?"
 */
interface StockLevel {
  card_id: CardId;

  /** On-hand sellable quantity. Always ≥ 0. */
  on_hand: number;

  /** Reserved by active carts/pending orders. Always ≥ 0. */
  reserved: number;

  /** Available = on_hand - reserved. Can be 0 but not negative. */
  available: number;

  /**
   * Ordered/shipped from suppliers, not yet received.
   * Derived from purchase records, not from movements.
   */
  pending: number;

  /** When the balance was last reconciled against the ledger */
  last_reconciled_at: Date | null;
}

/**
 * A time-limited hold on stock for a cart or pending order.
 * Prevents overselling without decrementing on-hand.
 */
interface StockReservation {
  id: ReservationId;
  card_id: CardId;
  quantity: number;

  /**
   * Who holds the reservation.
   * - `cart:<client_id>` for wholesale carts
   * - `checkout:<session_id>` for storefront checkout
   * - `order:<order_id>` for confirmed but unfulfilled orders
   */
  holder: string;

  /** Reservation expires and auto-releases after this time */
  expires_at: Date;

  created_at: Date;
}

/**
 * Reorder policy: "for cards in this price band, keep this many in stock."
 * Unchanged from current stock_targets — the package just owns the query.
 */
interface StockTarget {
  id: number;
  price_min: number;  // GBP
  price_max: number;  // GBP
  target_qty: number;
}

/**
 * Output of the reorder computation.
 */
interface ReorderItem {
  card_id: CardId;
  sku: string;
  name: string;
  current_stock: number;
  pending_stock: number;
  target_qty: number;

  /** target_qty - current_stock - pending_stock, floored at 0 */
  to_order: number;
}
```

---

## 2. Schema Ownership

### Tables that migrate INTO `packages/stock`

These tables are **owned** by the stock package. The package defines their schema, writes to them, and exposes read queries. No other code writes to these tables directly.

| Table | Current Name | Migration Notes |
|-------|-------------|-----------------|
| **stock_movements** | `stock_adjustments` | Renamed. Schema expanded (see §2.1). Existing rows migrated with kind/channel mapping. |
| **stock_reservations** | *(new)* | New table for cart/order holds. |
| **stock_targets** | `stock_targets` | Unchanged. Ownership transfers to this package. |
| **stock_levels** (view or columns) | `cards.stock`, `cards.pending_stock` | See §2.2 for the two migration options. |

### Tables that STAY OUT

These tables are **consumed** by the stock package (read joins) but owned elsewhere:

| Table | Why It Stays Out | How Stock Uses It |
|-------|-----------------|-------------------|
| `cards` | Product catalog — too many non-stock concerns | Joins for SKU, name, price, game_id. Writes only to `stock`/`pending_stock` columns. |
| `purchases` | Procurement workflow | Reads `status` to compute pending stock |
| `purchase_items` | Procurement workflow | Reads `quantity`, `condition` for pending derivation |
| `fulfillment_entries` | Order fulfillment workflow | Reads for reconciliation (derived on-hand) |
| `orders` / `order_items` | Order management | Reads for demand/fulfillment context |
| `cart_items` | Cart management | Stock creates reservations; cart code calls `reserve()` |
| `condition_prices` | Supplier pricing (CardRush scrape) | Not used by stock at all |
| `channel_pricing` | Pricing formulas | Not used by stock |

### 2.1 `stock_movements` Schema (migrated from `stock_adjustments`)

```sql
CREATE TABLE stock_movements (
  id            SERIAL PRIMARY KEY,
  card_id       INTEGER NOT NULL REFERENCES cards(id),
  kind          TEXT NOT NULL,       -- MovementKind enum
  channel       TEXT NOT NULL DEFAULT 'manual',
  delta         INTEGER NOT NULL,
  reference_id  TEXT,                -- idempotency key
  note          TEXT,
  condition     TEXT,                -- nullable, for future per-condition tracking
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency: no two movements for the same card with the same reference
  CONSTRAINT stock_movements_idempotent UNIQUE (card_id, reference_id)
);

CREATE INDEX stock_movements_card_idx ON stock_movements (card_id);
CREATE INDEX stock_movements_kind_idx ON stock_movements (kind);
CREATE INDEX stock_movements_created_idx ON stock_movements (created_at);
CREATE INDEX stock_movements_reference_idx ON stock_movements (reference_id)
  WHERE reference_id IS NOT NULL;
```

**Migration mapping** from `stock_adjustments`:

| Old Column | New Column | Mapping |
|-----------|-----------|---------|
| `id` | `id` | Preserved |
| `card_id` | `card_id` | Preserved |
| `delta` | `delta` | Preserved |
| `reason` | `kind` | `count` → infer from `channel`; `damage` → `damage`; `loss` → `loss`; `found` → `found`; `correction`/`other` → `correction` |
| `channel` | `channel` | Preserved. `shopify-cambridge` → `shopify`; `ebay-sale` → `ebay` |
| `note` | `note` | Preserved |
| *(none)* | `reference_id` | Extract from `note` where possible (e.g., "eBay sale: ORDER123" → `ebay:order:ORDER123`). Null for rows where extraction is ambiguous. |
| *(none)* | `condition` | Null for all migrated rows |
| `created_at` | `created_at` | Preserved |

### 2.2 Stock Balance Storage

Two columns remain on `cards`:

- `cards.stock` → renamed conceptually to "on-hand balance" (column name unchanged for migration simplicity)
- `cards.pending_stock` → unchanged

**Why not a separate `stock_levels` table?** Because every read path in both apps already joins on `cards`. Adding a separate table means every product query gains a join. The columns stay on `cards`, but **only `packages/stock` writes to them**.

A new column is added:

```sql
ALTER TABLE cards ADD COLUMN reserved_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN stock_reconciled_at TIMESTAMPTZ;
```

The `available` computation (`stock - reserved_stock`) is done in application code or as a generated column — not stored separately.

### 2.3 `stock_reservations` Schema (new)

```sql
CREATE TABLE stock_reservations (
  id          SERIAL PRIMARY KEY,
  card_id     INTEGER NOT NULL REFERENCES cards(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  holder      TEXT NOT NULL,         -- 'cart:123', 'checkout:abc', 'order:456'
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One reservation per holder per card
  CONSTRAINT stock_reservations_holder_card UNIQUE (holder, card_id)
);

CREATE INDEX stock_reservations_card_idx ON stock_reservations (card_id);
CREATE INDEX stock_reservations_expires_idx ON stock_reservations (expires_at);
```

---

## 3. Operations

### 3.1 Write Operations (Mutations)

Every write operation:
- Runs in a single DB transaction
- Inserts a `stock_movements` row
- Updates `cards.stock` (and optionally `cards.reserved_stock`)
- Returns the created movement(s) or throws on constraint violation
- Is idempotent when a `reference_id` is provided

```typescript
interface StockWriter {
  /**
   * Record a channel sale (Shopify, eBay, v1 API, wholesale).
   *
   * Decrements on-hand stock. If a reservation exists for this holder,
   * commits it (releases the hold, decrements on-hand). If no reservation,
   * decrements on-hand directly.
   *
   * Idempotent: duplicate reference_id for the same card is a no-op
   * (returns the existing movement).
   */
  recordSale(tx: Transaction, params: {
    card_id: CardId;
    quantity: number;          // positive; will be stored as negative delta
    channel: Channel;
    reference_id: string;      // REQUIRED for sales — no anonymous sales
    note?: string;
    condition?: string;
  }): Promise<StockMovement>;

  /**
   * Record goods received from a supplier.
   *
   * Increments on-hand stock. Typically called when a purchase transitions
   * to 'received' status, once per purchase_item.
   */
  recordPurchaseReceived(tx: Transaction, params: {
    card_id: CardId;
    quantity: number;          // positive
    purchase_id: number;
    purchase_item_id: number;
    condition?: string;
  }): Promise<StockMovement>;

  /**
   * Record a fulfillment (shipment to customer).
   *
   * Decrements on-hand stock. Called when fulfillment_entries are created.
   * Unlike recordSale, this represents physical shipment — it may happen
   * after the sale was recorded (wholesale flow) or simultaneously (channel flow).
   *
   * For wholesale orders where sale and fulfillment are separate events,
   * only ONE of recordSale or recordFulfillment should decrement stock.
   * Convention: wholesale orders use recordFulfillment at ship time.
   * Channel sales (Shopify, eBay) use recordSale at order time.
   */
  recordFulfillment(tx: Transaction, params: {
    card_id: CardId;
    quantity: number;          // positive; stored as negative delta
    order_id: number;
    order_item_id: number;
    fulfillment_date: string;  // ISO date
  }): Promise<StockMovement>;

  /**
   * Record a manual adjustment (count correction, damage, loss, found).
   *
   * Delta can be positive or negative.
   */
  recordAdjustment(tx: Transaction, params: {
    card_id: CardId;
    delta: number;             // signed
    kind: 'correction' | 'damage' | 'loss' | 'found' | 'return';
    channel?: Channel;         // defaults to 'manual'
    note?: string;
    reference_id?: string;     // optional for manual adjustments
  }): Promise<StockMovement>;

  /**
   * Set stock to an absolute value via a correction movement.
   *
   * Computes delta = desired - current, inserts a correction movement.
   * The read + write happen in the same transaction to prevent lost updates.
   */
  setAbsolute(tx: Transaction, params: {
    card_id: CardId;
    desired_stock: number;     // must be ≥ 0
    note?: string;
  }): Promise<StockMovement | null>;  // null if no change needed
}
```

### 3.2 Reservation Operations

```typescript
interface StockReserver {
  /**
   * Reserve stock for a cart or checkout session.
   *
   * Increments cards.reserved_stock. Does NOT decrement on_hand.
   * Fails if available (on_hand - reserved) < quantity.
   *
   * If a reservation already exists for this (holder, card_id),
   * updates the quantity and extends the expiry.
   */
  reserve(tx: Transaction, params: {
    card_id: CardId;
    quantity: number;
    holder: string;            // 'cart:123', 'checkout:abc'
    ttl_minutes?: number;      // default: 30 for carts, 15 for checkout
  }): Promise<StockReservation>;

  /**
   * Release a reservation (cart cleared, checkout abandoned, timeout).
   *
   * Decrements cards.reserved_stock.
   */
  release(tx: Transaction, params: {
    card_id: CardId;
    holder: string;
  }): Promise<void>;

  /**
   * Release all expired reservations.
   *
   * Called by a cron job. Returns the number of reservations released.
   */
  releaseExpired(tx: Transaction): Promise<number>;

  /**
   * Commit a reservation into a sale.
   *
   * Atomically: release the reservation + record the sale movement +
   * decrement on_hand. This is the checkout completion path.
   */
  commitToSale(tx: Transaction, params: {
    card_id: CardId;
    holder: string;
    channel: Channel;
    reference_id: string;
    note?: string;
  }): Promise<StockMovement>;
}
```

### 3.3 Read Operations (Queries)

```typescript
interface StockReader {
  /**
   * Get the current stock level for one card.
   * Reads from cards.stock / cards.reserved_stock / cards.pending_stock.
   * Fast — no ledger aggregation.
   */
  getLevel(card_id: CardId): Promise<StockLevel>;

  /**
   * Get stock levels for multiple cards. Batched single query.
   */
  getLevels(card_ids: CardId[]): Promise<Map<CardId, StockLevel>>;

  /**
   * Get the movement history for a card, newest first.
   */
  getMovements(card_id: CardId, opts?: {
    limit?: number;           // default 50
    offset?: number;
    kind?: MovementKind;
    channel?: Channel;
    since?: Date;
  }): Promise<StockMovement[]>;

  /**
   * Compute pending stock from purchase records.
   *
   * This is derived live from purchases/purchase_items where
   * purchase.status IN ('ordered', 'shipped').
   * Returns a map of card_id → pending quantity.
   */
  computePending(card_ids?: CardId[]): Promise<Map<CardId, number>>;

  /**
   * List cards below their reorder target.
   *
   * Joins cards.stock + cards.pending_stock against stock_targets
   * (price-band lookup). Returns cards where:
   *   stock + pending < target_qty
   */
  listReorderQueue(opts?: {
    game_id?: number;
    min_shortfall?: number;    // default 1
  }): Promise<ReorderItem[]>;

  /**
   * List cards with zero or negative available stock.
   */
  listOutOfStock(opts?: {
    game_id?: number;
    include_pending?: boolean; // if true, excludes cards with pending > 0
  }): Promise<StockLevel[]>;
}
```

### 3.4 Reconciliation

```typescript
interface StockReconciler {
  /**
   * Derive on-hand stock from the movement ledger for given cards
   * and compare against the stored balance.
   *
   * Does NOT write. Returns discrepancies only.
   *
   * This replaces the current syncUkStock() pattern but without
   * the silent overwrite. Callers decide what to do with discrepancies.
   */
  check(card_ids?: CardId[]): Promise<ReconciliationResult[]>;

  /**
   * Derive on-hand stock from the movement ledger and fix discrepancies.
   *
   * For each discrepancy:
   *   1. Insert a 'reconciliation' movement with the corrective delta
   *   2. Update cards.stock to the derived value
   *   3. Update cards.stock_reconciled_at
   *
   * Returns all corrections made.
   */
  fix(card_ids?: CardId[]): Promise<StockMovement[]>;

  /**
   * Full re-derive of pending_stock from purchase records.
   * Updates cards.pending_stock for all affected cards.
   * Returns cards whose pending_stock changed.
   */
  syncPending(card_ids?: CardId[]): Promise<Array<{
    card_id: CardId;
    old_pending: number;
    new_pending: number;
  }>>;
}

interface ReconciliationResult {
  card_id: CardId;
  stored_balance: number;      // current cards.stock
  derived_balance: number;     // SUM(movements.delta)
  discrepancy: number;         // derived - stored
}
```

---

## 4. Ledger Model

### 4.1 Choice: Stored Balance with Append-Only Audit

**Not** pure event-sourcing (too expensive for reads — every product listing would aggregate movements). **Not** pure stored balance (current approach — no audit trail, drift between syncs).

**Hybrid:** Every mutation writes both a movement row (the fact) and updates the balance column (the cache). The movement ledger is the authority; the balance is a performance optimization that can be verified via `reconcile.check()`.

```
                         ┌─────────────────────┐
                         │    stock_movements   │
                         │  (append-only ledger) │
                         └──────────┬───────────┘
                                    │
                              IN SAME TX
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    cards.stock       │
                         │  (materialized cache) │
                         └─────────────────────┘
                                    │
                              PERIODIC
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  reconcile.check()   │
                         │  (verify cache = Σ)  │
                         └─────────────────────┘
```

### 4.2 The Condition Filter Decision

**Current problem:** `syncUkStock` counts all conditions. `fulfill-order.ts` excludes `状態%` (Japanese A- grade labels). This produces different stock numbers.

**Decision:** The package counts **all conditions** by default. The `condition` column on `stock_movements` enables future per-condition queries, but the cached balance on `cards.stock` is always the total across all conditions.

**Rationale:** A- items are physically in the warehouse. Excluding them from the on-hand count understates actual inventory. If the business needs an "A or better" stock count, that's a filtered read query — not a different source of truth.

### 4.3 Pending Stock

`pending_stock` is **not** derived from movements. It's derived from purchase records (purchases with status `ordered` or `shipped`). This is correct — a purchase being "in transit" is a state of the procurement workflow, not a stock event.

The package provides `syncPending()` which re-derives `cards.pending_stock` from `purchases + purchase_items`. This replaces the pending portion of `syncUkStock()`.

**The refill.ts bypass is eliminated.** `tools/refill.ts` currently directly increments `pending_stock`. After migration, it must create a purchase record first, then call `syncPending()`. No direct column writes.

### 4.4 Dedup Strategy

Every external stock mutation requires a `reference_id`. The DB enforces `UNIQUE(card_id, reference_id)`. Duplicates hit the constraint and return the existing movement without side effects.

**Reference ID conventions:**

| Source | Pattern | Example |
|--------|---------|---------|
| Shopify webhook | `shopify:order:{shopify_order_id}:item:{line_item_id}` | `shopify:order:12345:item:67890` |
| Shopify cron | `shopify:order:{shopify_order_id}:item:{line_item_id}` | Same as webhook — they converge |
| eBay import | `ebay:order:{ebay_order_id}:item:{sku}` | `ebay:order:ABC123:item:OP09-001-SR` |
| v1 API | `v1:{channel}:{order_ref}:item:{sku}` | `v1:tcgplayer:order-789:item:OP09-001-SR` |
| Purchase receive | `purchase:{purchase_id}:item:{purchase_item_id}` | `purchase:42:item:7` |
| Fulfillment | `fulfill:{order_id}:item:{order_item_id}:{date}` | `fulfill:5:item:12:2026-04-27` |
| Manual adjust | `manual:{timestamp}` or null | `manual:2026-04-27T14:30:00Z` |

**Key insight:** Shopify webhook and Shopify cron use the **same** reference ID format. This means whichever fires first wins, and the second is a safe no-op. The current dual-path problem (webhook + cron both decrement) is solved by idempotency, not by removing one path.

### 4.5 Transaction Boundaries

Every stock mutation is a single transaction containing:

```
BEGIN;
  -- 1. Insert movement (or detect duplicate via UNIQUE constraint)
  INSERT INTO stock_movements (...) VALUES (...)
    ON CONFLICT (card_id, reference_id) DO NOTHING
    RETURNING *;

  -- 2. If insert succeeded (not a duplicate):
  UPDATE cards SET stock = greatest(stock + $delta, 0)
    WHERE id = $card_id;

  -- 3. If reservation involved:
  DELETE FROM stock_reservations WHERE holder = $holder AND card_id = $card_id;
  UPDATE cards SET reserved_stock = greatest(reserved_stock - $qty, 0)
    WHERE id = $card_id;
COMMIT;
```

The `ON CONFLICT DO NOTHING` + `RETURNING` pattern means:
- If the insert succeeds → we get the new row, proceed to update balance
- If it conflicts → we get zero rows, skip the balance update (idempotent)

This replaces the current read-then-write anti-pattern with a single atomic operation.

---

## 5. Event Model

The package emits events for downstream consumers (channel sync, notifications, analytics). Events are **not** the movements themselves — they're derived signals.

```typescript
/**
 * Emitted after any successful stock mutation.
 * Consumers: Shopify sync, eBay sync, buylist rebuild, low-stock alerts.
 */
interface StockChangedEvent {
  card_id: CardId;
  movement_id: MovementId;
  kind: MovementKind;
  channel: Channel;
  delta: number;
  new_on_hand: number;
  new_available: number;       // on_hand - reserved
  new_pending: number;
  timestamp: Date;
}

/**
 * Emitted when available stock drops to zero or below target.
 * Consumers: reorder alerts, admin notifications.
 */
interface LowStockEvent {
  card_id: CardId;
  on_hand: number;
  target: number | null;       // null if no target configured
  pending: number;
  timestamp: Date;
}
```

**Implementation:** Initially, events are synchronous callbacks registered at package initialization. No message queue. The package calls `onStockChanged(event)` after each mutation within the same request. If a consumer fails, it does not roll back the stock mutation (fire-and-forget with error logging).

**Future:** When volume justifies it, events can be published to a queue (SQS, Redis streams) for async processing. The contract doesn't change — only the transport.

---

## 6. Package API Surface

```typescript
// packages/stock/index.ts

export interface StockService extends StockWriter, StockReserver, StockReader, StockReconciler {
  /**
   * Register an event listener.
   */
  onStockChanged(handler: (event: StockChangedEvent) => Promise<void>): void;
  onLowStock(handler: (event: LowStockEvent) => Promise<void>): void;
}

/**
 * Create a StockService instance.
 *
 * @param db - Drizzle database instance (or raw pg Pool — TBD during extraction)
 * @param opts - Configuration
 */
export function createStockService(db: Database, opts?: {
  /** Default reservation TTL in minutes. Default: 30. */
  defaultReservationTtlMinutes?: number;

  /** Whether to enforce non-negative stock. Default: true.
   *  When true, stock is floored at 0 via greatest(stock + delta, 0).
   *  When false, stock can go negative (useful for reconciliation debugging). */
  enforceNonNegative?: boolean;
}): StockService;

// Re-export all types
export type {
  CardId, MovementId, ReservationId,
  MovementKind, Channel, PurchaseStatus,
  StockMovement, StockLevel, StockReservation, StockTarget, ReorderItem,
  ReconciliationResult,
  StockChangedEvent, LowStockEvent,
};
```

---

## 7. What This Package Does NOT Own

Explicit non-goals — these consume stock identifiers but live elsewhere:

| Concern | Why It's Out | Interface Point |
|---------|-------------|-----------------|
| **Pricing** | Pricing is channel-specific, involves margins, FX rates, volume discounts | Callers pass `card_id`, stock returns quantities |
| **Condition grading** | Grading is a product attribute, not a stock concern | `stock_movements.condition` records it; stock doesn't define the grading scale |
| **Channel transport** | Shopify/eBay API calls are integration concerns | Stock emits `StockChangedEvent`; channel sync listens and pushes |
| **Customer data** | Orders, clients, carts are order-management concerns | Reservations use opaque `holder` strings; stock doesn't know what a "client" is |
| **Purchase workflow** | Procurement (ordering, shipping tracking) is its own domain | Stock reads purchase status for `computePending()`; doesn't manage purchase lifecycle |
| **Fulfillment workflow** | Picking, packing, shipping is its own domain | Callers invoke `recordFulfillment()` when goods ship |

---

## 8. Migration Plan

### Phase 1: Schema Migration (no code changes)

1. Create `stock_movements` table
2. Migrate all `stock_adjustments` rows into `stock_movements` with kind/channel mapping
3. **Backfill missing movements** from `purchase_items` (received purchases → `purchase_received` movements) and `fulfillment_entries` (→ `fulfillment` movements)
4. Add `reserved_stock` and `stock_reconciled_at` columns to `cards`
5. Create `stock_reservations` table
6. Verify: `SUM(stock_movements.delta) per card` should equal `cards.stock` (within tolerance — discrepancies from untracked mutations become `reconciliation` movements)
7. Keep `stock_adjustments` table as read-only backup for 30 days

### Phase 2: Package Extraction

1. Create `packages/stock/` with types, operations, and Drizzle schema
2. Implement `StockWriter`, `StockReserver`, `StockReader`, `StockReconciler`
3. Write tests against a test database (the first real tests in this monorepo)
4. Export `createStockService()` as the entry point

### Phase 3: Port Wholesale

1. Replace every direct `cards.stock` write with the appropriate `StockWriter` method
2. Wire Shopify webhook → `recordSale()` with idempotency key
3. Wire v1 sales API → `recordSale()` with idempotency key
4. Wire eBay import → `recordSale()` with idempotency key
5. Wire admin adjust → `recordAdjustment()` or `setAbsolute()`
6. Replace `syncUkStock()` calls with `reconcile.fix()` + `syncPending()`
7. Delete the three copies of stock sync SQL
8. Wire cart operations to use `reserve()` / `release()` / `commitToSale()`
9. Verify: all stock writes go through the package; no direct column writes remain

### Phase 4: Wire Storefront + Omnichannel

1. Import `packages/stock` into storefront
2. Wire any storefront stock reads through `StockReader`
3. Wire checkout flow through reservation → commit pipeline
4. Wire channel sync (Shopify push, eBay push, buylist KV) to `StockChangedEvent`

### Phase 5: Verification

1. Run `reconcile.check()` over the entire catalog — zero discrepancies expected
2. Load test: concurrent sales from multiple channels
3. Replay test: duplicate webhook delivery → verify idempotent
4. Canonical README documenting the contract, usage patterns, and invariants

### Data Safety

- **No data loss.** The migration is additive (new table + backfill). Existing `stock_adjustments` remains read-only for 30 days.
- **No downtime.** Phase 1 (schema) can run while the app is live. Phase 3 (port) is a code-level swap — each handler is migrated independently.
- **Rollback.** If anything goes wrong, the old code paths still work against `stock_adjustments`. The package can be unplugged by reverting the handler changes.

---

## 9. Open Questions for Yu

1. **Reservation TTL policy.** Wholesale carts currently have no timeout. Should we introduce one? If so, how long? (Suggested: 24h for wholesale carts, 15min for storefront checkout.)

2. **A- condition handling.** The current `fulfill-order.ts` excludes A- items from stock counts. Is this a business rule ("don't count A- in sellable stock") or a bug? The contract design counts all conditions by default.

3. **syncUkStock retirement timeline.** The reconciler replaces syncUkStock but the transition needs care. Should we run both in parallel for a period (reconciler in read-only mode, syncUkStock still authoritative)?

4. **Event consumers.** Which downstream systems should react to `StockChangedEvent`? Current candidates: Shopify sync, eBay sync, buylist rebuild. Any others?

---

*Generated by Gamma — Cambridge-TCG stock contract design mission*
