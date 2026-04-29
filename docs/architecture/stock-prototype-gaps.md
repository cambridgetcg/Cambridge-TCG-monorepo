# Stock Package — Prototype Gaps

Identified during `stock-prototype-1/3` mission: building the admin stock page
against the existing `packages/stock` reader API.

---

## Gap 1: `getLevels()` takes an array of IDs — no all-cards paginated query

**API:** `StockReader.getLevels(db, cardIds: CardId[]): Promise<Map<CardId, StockLevel>>`

**What we need for the admin stock levels table:**
A paginated all-cards query — `(card_name, stock, pending_stock, available, reserved)` with
search-by-name and sort-by-stock, returning 50 rows at a time.

**Why it doesn't fit:**
- Requires knowing card IDs upfront (no discovery)
- No support for text search on `cards.name`
- No pagination cursor/offset
- Doesn't join card metadata (name, sku, condition)

**Workaround (prototype):**
Direct SQL via `wsQuery()` in the admin page:
```sql
SELECT c.id, c.name, c.sku, c.stock as on_hand,
       coalesce(c.reserved_stock, 0) as reserved,
       greatest(c.stock - coalesce(c.reserved_stock, 0), 0) as available,
       c.pending_stock
FROM cards c
WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%')
ORDER BY c.stock ASC
LIMIT 50 OFFSET $2
```

**Proper fix (future mission):**
Add `listLevels(db, opts?: { search?: string; offset?: number; limit?: number; gameId?: number })`
to `StockReader`. Returns `Array<StockLevel & { name: string; sku: string }>` with total count.

---

## Gap 2: `getMovements()` requires a `cardId` — no cross-card recent-movements query

**API:** `StockReader.getMovements(db, cardId: CardId, opts?): Promise<StockMovement[]>`

**What we need for the admin movements feed:**
The last 50 movements *across all cards*, joined with card name for display.

**Why it doesn't fit:**
- `cardId` is required — no facility for "all cards"
- Even if we fetched all card IDs first, that's N+1
- No join to cards.name — caller only gets a `cardId` back

**Workaround (prototype):**
Direct SQL via `wsQuery()`:
```sql
SELECT sm.id, sm.card_id, c.name as card_name, sm.kind, sm.delta,
       sm.reference_id, sm.channel, sm.created_at
FROM stock_movements sm
LEFT JOIN cards c ON c.id = sm.card_id
ORDER BY sm.created_at DESC
LIMIT 50
```

**Proper fix (future mission):**
Add `listMovements(db, opts?: { limit?: number; offset?: number; cardId?: CardId; kind?: MovementKind; since?: Date })`
to `StockReader`. When `cardId` is omitted, queries across all cards. Joins card name.

---

## Gap 3: `listReorderQueue()` uses raw `db.execute(sql`...`)` — incompatible with postgres.js

**API:** `StockReader.listReorderQueue(db, opts?): Promise<ReorderItem[]>`

**What we need:** Works fine in the wholesale context (drizzle-orm over postgres.js). The
admin app also uses drizzle-orm over postgres.js via `packages/db`. Compatible.

**Reality check:** The raw SQL in `listReorderQueue` uses `db.execute(sql`...`)` which works
in the Drizzle context. Admin's `wholesaleDb().db` is the same drizzle instance. Should work.

**Status:** No workaround needed. Test with actual DB to confirm.

---

## Gap 4: `StockLevel` doesn't include card name or sku

**API:** `StockLevel { cardId, onHand, reserved, available, pending, lastReconciledAt }`

**What we need for any display:** Card name and SKU alongside the stock numbers.

**Why it doesn't fit:** Pure domain object — intentionally doesn't mix presentation concerns.
But for admin displays, every stock row needs a name. Callers must join separately.

**Workaround (prototype):**
All display queries join `cards` directly. Accept that admin queries bypass the reader API
for display-layer concerns.

**Proper fix (future mission):**
Create an admin-oriented `StockDisplay` type:
```ts
export interface StockDisplay extends StockLevel {
  name: string;
  sku: string;
  gameId: number | null;
}
```
Add `listLevels()` returning this enriched type.

---

## Gap 5: `reservedStock` and `stockReconciledAt` columns may not exist in production DB

**Context:** The stock package schema defines these columns on `cards`:
- `cards.reserved_stock` (from `StockReserver`)
- `cards.stock_reconciled_at` (from `StockReconciler`)

The wholesale schema (`apps/wholesale/src/lib/db/schema.ts`) does **not** define these columns.
If the wholesale DB hasn't had the stock package migration applied, these columns don't exist.

**Impact:** Any query using `coalesce(c.reserved_stock, 0)` will error in production.

**Workaround (prototype):**
Guard with `coalesce()` in SQL and add a `try/catch` fallback that shows a migration warning
when the column doesn't exist. Or omit reserved from the display if missing.

**Proper fix (future mission):**
Run the stock package migrations against the wholesale DB:
```sql
ALTER TABLE cards ADD COLUMN IF NOT EXISTS reserved_stock integer NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS stock_reconciled_at timestamptz;
```
Add this to the wholesale migration sequence.

---

## Summary — Reader API additions needed

| Method | Priority | Notes |
|--------|----------|-------|
| `listLevels(db, opts?)` | High | Pagination + search + name join |
| `listMovements(db, opts?)` | High | Cross-card + name join |
| `StockDisplay` type | Medium | Enriched display type |
| DB migration for new columns | High | Blocker for reserved/reconciled display |

These are deferred to post-prototype missions. The prototype works around them with direct SQL.
