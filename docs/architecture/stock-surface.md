# Stock Surface Audit — Wholesale

> **Mission:** `stock-audit-current-surface-in-wholesale`
> **Date:** 2026-04-27
> **Status:** Complete

---

## 1. What Does "Current On-Hand" Mean Today?

**Answer: Both computed and stored, but they can diverge.**

The single source of truth for on-hand inventory is `cards.stock` (integer, default 0). This column is:

1. **Derived** by `syncUkStock()` from first principles:
   ```
   stock = Σ(received purchase_items.quantity) − Σ(fulfillment_entries.fulfilled_qty) + Σ(stock_adjustments.delta)
   ```
2. **Directly mutated** by channel sale handlers (Shopify webhook, Shopify cron, eBay import, v1 sales API, manual adjustments) which do `UPDATE cards SET stock = greatest(stock - qty, 0)`.

These two paths are not reconciled automatically. `syncUkStock()` only runs on explicit trigger (admin button, purchase review, tool scripts). Between syncs, channel decrements drift the stored value away from the derived value. A re-sync will **overwrite** channel decrements that occurred since the last sync — unless those sales also created `stock_adjustments` rows (which the Shopify and eBay handlers do, so the adjustments survive; but the v1 sales API also creates adjustments, so this works too).

**`pending_stock`** (integer, default 0) represents items ordered from suppliers but not yet received. It is:
- **Derived** by `syncUkStock()` from `purchase_items` where purchase status is `ordered` or `shipped`
- **Directly incremented** by `tools/refill.ts` after Remambo submission (bypasses syncUkStock derivation — will be overwritten on next sync if no purchase record exists yet)

---

## 2. Stock-Related Tables

| Table | Stock Role | Key Columns | FK to cards? |
|-------|-----------|-------------|--------------|
| **cards** | Source of truth | `stock`, `pending_stock` | — |
| **stock_adjustments** | Audit log + correction layer | `card_id`, `delta`, `reason`, `channel` | ✅ FK |
| **stock_targets** | Reorder policy | `price_min`, `price_max`, `target_qty` | ❌ (price-band, no card FK) |
| **purchases** | Supplier orders | `status` (ordered/shipped/received) | ❌ |
| **purchase_items** | Supplier order lines | `card_id`, `quantity`, `condition` | ✅ FK |
| **orders** | Customer orders | `status`, `channel`, `stock_checked_at` | ❌ |
| **order_items** | Customer order lines | `card_id`, `quantity`, `stock_status`, `checked_quantity` | ✅ FK |
| **fulfillment_entries** | Partial fulfillment tracking | `order_item_id`, `fulfilled_qty`, `fulfillment_date` | ✅ (via order_items) |
| **cart_items** | Cart (denormalized snapshot) | `card_id`, `quantity`, `price` | ✅ FK |
| **wanted_cards** | Demand signal | `client_id`, `card_id` | ✅ FK |
| **condition_prices** | Supplier stock snapshot (CardRush) | `card_number`, `stock`, `price_jpy`, `snapshot_date` | ❌ (text join on card_number) |
| **channel_pricing** | Per-channel pricing formula | `margin_multiplier`, `flat_fee_*`, etc. | ❌ |
| **channel_api_keys** | Channel auth | `channel`, `key_hash` | ❌ |
| **price_archive** | Daily price snapshot | `card_id`, `price`, `channel` | ✅ FK |

---

## 3. Touchpoint Matrix

### 3.1 Write Paths (stock mutations)

| Path | Tables Written | Transactional? | Dedup? | Notes |
|------|---------------|----------------|--------|-------|
| **`syncUkStock()`** | `cards.stock`, `cards.pending_stock` | ❌ (4 sequential UPDATEs) | N/A | Full recalc from purchases/fulfillment/adjustments |
| **`PATCH /api/admin/stock/adjust`** | `stock_adjustments`, `cards.stock` | ✅ | N/A | Absolute set; delta computed |
| **`POST /api/webhooks/shopify/orders-paid`** | `cards.stock`, `stock_adjustments` | ❌ | ❌ **NO DEDUP** | Double-delivery = double-decrement |
| **`POST /api/cron/shopify-orders`** | `cards.stock`, `stock_adjustments`, `orders`, `order_items` | ❌ | ✅ (by `external_order_id`) | |
| **`POST /api/admin/shopify-backfill`** | `cards.stock`, `stock_adjustments` | ❌ | ✅ (by adjustment note) | |
| **`POST /api/admin/channels/ebay/import-orders`** | `cards.stock`, `stock_adjustments` | ✅ (per item) | Partial | Only eBay route with per-item tx |
| **`POST /api/v1/sales`** | `cards.stock`, `stock_adjustments` | ❌ | ❌ **NO DEDUP** | External channel generic sale |
| **`POST /api/cron/stock-correct`** | `cards.stock`, `stock_adjustments` | ❌ | N/A | Manual correction by SKU |
| **`PATCH /api/admin/purchases/review`** | `purchase_items` + triggers `syncUkStock` | ❌ | N/A | A- condition approve/reject |
| **`POST /api/orders/[id]/stock-check/complete`** | `order_items`, `orders` | ✅ | N/A | Status only, no qty mutation |
| **`tools/fulfill-order.ts`** | `fulfillment_entries`, `cards.stock` | ❌ | N/A | Has **own** stock sync SQL |
| **`tools/import-remambo-order.ts`** | `purchases`, `purchase_items`, `cards.stock`, `cards.pending_stock` | ❌ | ✅ (by remambo_order_id) | Has **own** stock sync SQL |
| **`tools/batch-import-orders.ts`** | Same as above | ❌ | ✅ | **Third** copy of stock sync SQL |
| **`tools/refill.ts`** | `cards.pending_stock` (direct increment) | ❌ | N/A | Bypasses syncUkStock derivation |
| **Shopify sync (`runShopifySync`)** | External only (pushes to Shopify) | N/A | N/A | Reads `cards.stock`, writes to Shopify API |
| **eBay sync (`/api/admin/channels/ebay/sync`)** | External only (pushes to eBay) | N/A | N/A | Reads `cards.stock`, writes to eBay API |

### 3.2 Read Paths

| Path | Tables Read | What It Computes |
|------|------------|-----------------|
| `GET /api/admin/stock` | purchases, purchase_items, fulfillment_entries, order_items, cards | Derived on-hand from first principles (CTE) |
| `GET /api/admin/stock/levels` | cards | Direct stock + pending_stock |
| `GET /api/admin/stock-targets/preview` | cards, stock_targets | to_order = target - stock - pending |
| `GET /api/admin/to-order?source=targets` | cards, stock_targets | Same shortfall formula |
| `GET /api/admin/to-order?source=orders` | order_items, orders, fulfillment_entries, purchase_items, purchases, cards | to_order = ordered - fulfilled - purchased |
| `GET /api/admin/refill` | cards, stock_targets | Same as to-order/targets + CardRush fields |
| `GET /api/admin/wanted` | wanted_cards, cards, clients | Demand + stock level |
| `GET /api/v1/prices` | cards, games | stock + pending_stock per card |
| `/catalog` page | cards, games, sets, wanted_cards | Direct stock + pending_stock |
| `/fulfillment` page | orders, order_items, cards, fulfillment_entries | fulfilled vs remaining |
| `GET /api/cron/rebuild-buylist` | cards, price_archive, games | Includes stock in KV output |

### 3.3 Consumer UI

| Page Route | Purpose | Stock Display | Mutations |
|------------|---------|---------------|-----------|
| `/admin/stock` | Legacy stock editor | stock, pendingStock, total (client-computed) | Adjust (no reason) |
| `/admin/stock-levels` | Full stock editor (SSR) | stock + pending annotation | Adjust with reason/note, +/- buttons |
| `/admin/stock-adjustments` | Audit log | delta (color-coded), reason, note | None (read-only) |
| `/admin/stock-targets` | Reorder policy config | target tiers + preview (stock, pending, toOrder) | CRUD on tiers |
| `/admin/refill` | Supplier reorder pipeline | stock, pending, target, refill qty | None (generates CLI commands) |
| `/admin/to-order` | Unified to-order view | Two modes: target shortfall / order fulfillment | None (read-only) |
| `/admin/wanted` | Demand signal | stock (color-coded) + demand count | None |
| `/admin/purchases` | Supplier order tracking | Item quantities + A- review | Approve/reject A- items |
| `/admin/orders/[id]/stock-check` | Order stock check workflow | Supplier live price/stock, status per item | Mark status, complete check |
| `/catalog` | Client product browse | stock + pending annotation | Toggle wanted |
| `/fulfillment` | Client fulfillment tracking | fulfilled/remaining per item | None |

---

## 4. Invariants

| # | Invariant | Enforcement | Status |
|---|-----------|-------------|--------|
| I1 | `cards.stock ≥ 0` | `greatest(stock - qty, 0)` in *some* paths; `syncUkStock` can produce negative if adjustments are negative enough | ⚠️ **Partial** — not guaranteed in all paths |
| I2 | `cards.stock = Σ received_purchases − Σ fulfilled + Σ adjustments` | Only holds immediately after `syncUkStock()` runs | ⚠️ **Eventual** — channel decrements break this between syncs |
| I3 | `cards.pending_stock = Σ ordered/shipped purchases` | Only holds after `syncUkStock()`; `refill.ts` bypasses | ⚠️ **Eventual** — refill.ts directly increments |
| I4 | Every stock mutation has a `stock_adjustments` row | Most channel handlers create one; `syncUkStock` doesn't; `fulfill-order.ts` doesn't | ⚠️ **Partial** — coverage gaps |
| I5 | One cart item per (client, card) | DB UNIQUE constraint | ✅ **Enforced** |
| I6 | `fulfillment_entries` — one entry per (order_item, date) | DB UNIQUE constraint | ✅ **Enforced** (but limits to one shipment/day) |
| I7 | Stock status transitions follow order workflow | Validated in stock-check/complete handler | ✅ **Enforced** in happy path |
| I8 | Prices resolved server-side, never from client | Enforced in order creation and cart sync | ✅ **Enforced** |

---

## 5. Race Conditions & Risks

### 5.1 Shopify Webhook Double-Decrement (HIGH)

`POST /api/webhooks/shopify/orders-paid` has **no deduplication**. Shopify retries webhooks on timeout. Each delivery decrements stock and inserts an adjustment. If delivered twice, stock is decremented twice.

**Mitigation:** The Shopify cron (`/api/cron/shopify-orders`) deduplicates by `external_order_id`, but the webhook path is independent.

### 5.2 Non-Transactional Channel Decrements (MEDIUM)

Shopify webhook, Shopify cron, and v1 sales API all read `cards.stock`, compute delta, and write back without a transaction. Under concurrent webhook deliveries for different items in the same order, this is fine (different card rows). But concurrent decrements to the **same card** from different channels could lose updates.

**Mitigation:** The raw SQL `greatest(stock - qty, 0)` is atomic per-statement but the read-then-write pattern in some paths isn't.

### 5.3 Three Copies of Stock Sync SQL (MEDIUM)

`syncUkStock()` in the app, `fulfill-order.ts`, and `import-remambo-order.ts` / `batch-import-orders.ts` each have independent stock recalculation SQL. The tool scripts filter `condition NOT LIKE '状態%'` (excluding certain Japanese condition labels); `syncUkStock()` counts all conditions. These will produce different stock numbers for the same card.

### 5.4 v1 Sales API No Dedup (MEDIUM)

`POST /api/v1/sales` accepts channel + order_ref but never checks for duplicate submissions. A retry or duplicate integration call will double-decrement.

### 5.5 refill.ts Pending Stock Bypass (LOW)

`tools/refill.ts` directly increments `cards.pending_stock` after Remambo submission. If `syncUkStock()` runs before the corresponding purchase is imported, the increment is overwritten (set to the derived value which doesn't include the not-yet-imported purchase).

### 5.6 syncUkStock Not Transactional (LOW)

The four sequential UPDATE statements in `syncUkStock()` are not wrapped in a transaction. If the process crashes between statements, stock and pending_stock can be in an inconsistent state. Recoverable by re-running.

### 5.7 fulfillment_entries One-Per-Day (LOW)

The UNIQUE constraint on `(order_item_id, fulfillment_date)` means two partial shipments of the same item on the same day will conflict. The `fulfill-order.ts` tool uses ON CONFLICT DO UPDATE (upsert), so the second shipment replaces the first quantity rather than accumulating.

---

## 6. The Stock Data Flow

```
                    ┌─────────────────┐
                    │  CardRush (JP)  │
                    │  supplier stock  │
                    └────────┬────────┘
                             │ scrape (price-snapshot cron, stock-check/live)
                             ▼
                    ┌─────────────────┐
                    │ condition_prices │  (snapshot, no FK to cards)
                    └─────────────────┘

    ┌──────────────────────────────────────────────────────────┐
    │                    INBOUND (supplier → warehouse)         │
    │                                                          │
    │  tools/import-remambo-order ──► purchases + purchase_items│
    │  tools/refill ──► pending_stock (direct)                 │
    │                                                          │
    │  syncUkStock() derives:                                  │
    │    stock = received_qty − fulfilled_qty + adjustments    │
    │    pending = ordered/shipped_qty                         │
    └──────────────────────┬───────────────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   cards.stock   │◄──── manual adjust (admin UI)
                  │   cards.pending │      stock_adjustments (audit)
                  └────────┬────────┘
                           │
    ┌──────────────────────┼───────────────────────────────────┐
    │                      │  OUTBOUND (warehouse → customer)  │
    │                      ▼                                   │
    │  ┌─────────────┐  ┌──────────┐  ┌────────┐  ┌────────┐ │
    │  │  Wholesale   │  │ Shopify  │  │  eBay  │  │ v1 API │ │
    │  │  orders +    │  │ webhook  │  │ import │  │ sales  │ │
    │  │  fulfillment │  │ + cron   │  │ orders │  │        │ │
    │  └──────┬───────┘  └────┬─────┘  └───┬────┘  └───┬────┘ │
    │         │               │            │            │      │
    │         │ fulfillment   │ decrement  │ decrement  │ dec  │
    │         │ entries       │ + adjust   │ + adjust   │ +adj │
    │         ▼               ▼            ▼            ▼      │
    │    cards.stock ←── cards.stock ← cards.stock ← cards.stock│
    └──────────────────────────────────────────────────────────┘
                           │
                           ▼
    ┌──────────────────────────────────────────────────────────┐
    │              OUTBOUND SYNC (push to channels)            │
    │                                                          │
    │  Shopify sync: reads cards.stock → Shopify inventory     │
    │  eBay sync: reads cards.stock → eBay inventory           │
    │  Buylist cron: reads cards.stock → Cloudflare KV         │
    └──────────────────────────────────────────────────────────┘
```

---

## 7. Recommendations for Package Extraction

These findings inform the `packages/stock` design (next mission):

1. **Single stock engine.** The three copies of stock sync SQL must collapse into one authoritative function. The condition filter divergence (`状態%` exclusion) needs a deliberate decision.

2. **Transactional decrements.** Every stock mutation (adjust, channel sale, fulfillment) should be a single transaction: `INSERT INTO stock_adjustments` + `UPDATE cards SET stock`. The eBay import route already does this — generalize the pattern.

3. **Idempotent sale ingestion.** Every channel sale handler needs dedup. The pattern: check `stock_adjustments` for a `(channel, note)` match before decrementing. The Shopify backfill route already does this.

4. **Derived vs stored reconciliation.** Either commit fully to derived stock (compute from ledger on every read — expensive) or to stored stock with audit trail (current approach, but needs invariant enforcement). The stored approach is pragmatic; the package should expose a `reconcile()` function that reruns the derivation and flags discrepancies without silently overwriting.

5. **pending_stock lifecycle.** The refill.ts bypass must be eliminated. Pending stock should only change when purchase records change.

6. **Non-negative constraint.** Add a CHECK constraint on `cards.stock >= 0` at the DB level, or handle gracefully in the package.

---

*Generated by Gamma — Cambridge-TCG stock audit mission*
