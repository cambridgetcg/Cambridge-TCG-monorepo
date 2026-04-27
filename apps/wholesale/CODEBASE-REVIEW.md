# TCG Wholesale — Full Codebase Review
*Generated 2026-03-19 by Claude Code — 96 source files reviewed*

## 1. Architecture Overview

**Stack:** Next.js 15 App Router, NextAuth v5 (JWT/Credentials), Drizzle ORM + PostgreSQL (RDS), Resend email, S3 price feeds, deployed on Vercel.

**Structure:**
- **Subdomain routing** — `admin.wholesaletcgdirect.com` for admin, bare domain for storefront. Middleware handles gating.
- **Auth** — JWT sessions (30-day), bcrypt password hashing, role-based (`admin` | `client`).
- **DB** — 15 tables (clients, games, sets, cards, orders, order_items, purchases, purchase_items, fulfillments, cart_items, wanted_cards, stock_targets, price_history, order_status_history, notifications).
- **Pricing** — JPY → GBP with 8% margin + per-card fee + 20% VAT.
- **Volume discounts** — Recently removed but ~30% of the scaffolding remains (stubs, dead columns, dead UI).

**Architectural concerns:**
- No transactions on critical multi-step operations (order creation, stock sync, stock-check completion).
- Two separate stock management pages with overlapping functionality.
- Admin API auth relies on domain gating in middleware rather than per-route role checks — vulnerable on preview deploys.

---

## 2. Module-by-Module Review

### src/lib/

#### `auth.ts`
Configures NextAuth v5 with Credentials provider, bcrypt verification, 30-day JWT.
- **[SECURITY]** No rate limiting on `authorize()` — brute-force login unthrottled.
- **[WARN]** No disabled/banned account check — any client with valid password can log in.
- **[WARN]** 30-day JWT with no rotation mechanism.

#### `cart-context.tsx`
Client React context with localStorage persistence, debounced server sync, price refresh.
- **[BUG]** Lines 167-170: `setItems` callback used as synchronous state read — unsafe in React 18 concurrent mode. Snapshot may be `[]` when fetch fires.
- **[WARN]** Lines 185-200: Race condition — `changes` array populated inside `setItems` updater, read outside it. Concurrent React can call updater multiple times, duplicating entries.
- **[WARN]** Line 262: `discountedTotal` hardcoded to `total`. Misleading API surface.
- **[WARN]** Lines 93-101: `syncToServer` swallows all errors silently.
- **[INFO]** `volumeDiscountPct` still in context interface — dead field.

#### `db/schema.ts`
- **[WARN]** Stale volume discount columns (`currentMonthSpend`, `priorMonthSpend`, `volumeDiscountPct` on clients; `volumeDiscount` on orders) still exist.
- **[WARN]** No index on `orders.clientId` or `orderItems.orderId`.
- **[WARN]** `updatedAt` on orders never auto-updated.
- **[WARN]** `stock` column has no `CHECK >= 0` constraint.

#### `sync-uk-stock.ts`
- **[BUG]** Lines 48, 74: `c.id` alias used where no `c` alias exists — SQL error when `cardIds` passed.
- **[WARN]** No transaction wrapping 4 independent UPDATE statements.

#### `s3.ts`
- **[BUG]** Line 34: Fallback FX rate hardcoded to `208.53` — silently produces wrong prices if data missing.

#### `email/templates.ts`
- **[SECURITY]** Lines 87, 246, 261: No HTML escaping on user input — XSS vector in emails.
- **[WARN]** Line 112: Division by zero if `discountPct` were ever 1.0.

#### `email/send-order-email.ts`
- **[WARN]** Line 72: Admin notification falls back to client email if no admin exists.
- **[BUG]** Line 130: No `default` case in switch — new notification types silently fail.

---

### src/app/api/ (Non-Admin Routes)

#### `cards/route.ts`
- **[SECURITY]** **No auth check** — entire catalog with wholesale prices publicly accessible.
- **[WARN]** No pagination — `SELECT *` on full table.

#### `cards/[id]/route.ts`
- **[BUG]** `price` not validated. Returns 200 with undefined on missing card.

#### `cart/route.ts`
- **[SECURITY]** PUT stores client-supplied prices without server verification.
- **[WARN]** No quantity validation.

#### `orders/route.ts`
- **[BUG]** Order creation + item insertion NOT in a transaction — orphaned orders on failure.
- **[BUG]** Idempotency marker permanently replaces `notes` if update fails.
- **[WARN]** N+1 card lookups.

#### `orders/[id]/items/route.ts`
- **[BUG]** Item IDs not verified to belong to the target order — cross-order manipulation possible.

#### `orders/[id]/stock-check/complete/route.ts`
- **[BUG]** No transaction — partial failure leaves inconsistent state.

#### `cron/monthly-rollover/route.ts`
- **[SECURITY]** Auth bypassed when `CRON_SECRET` env var unset (`if (cronSecret && ...)`).
- **[WARN]** Secret passed as query param (appears in logs).

---

### src/app/api/admin/

#### `purchases/review/route.ts`
- **[SECURITY]** **No auth on GET or PATCH** — unauthenticated access to purchase approval.

#### `stock-targets/route.ts`
- **[SECURITY]** **No auth on any of 4 HTTP methods** — unauthenticated CRUD.

#### `games/[id]/route.ts` and `sets/[id]/route.ts`
- **[BUG]** Empty `updates` object causes SQL syntax error.

#### `stock-check/live/route.ts`
- **[WARN]** No URL allowlist — SSRF proxy potential.

---

### src/app/ Pages & src/components/

#### `middleware.ts`
- **[SECURITY]** Admin API routes lack role-based checks — only domain-gated. Preview deploys expose them.

#### `Nav.tsx`
- **[WARN]** Line 138: Mobile nav still links to `/discount` (removed from desktop, left in mobile).

#### `StockCheckClient.tsx`
- **[WARN]** `applyLiveResult` missing from `useCallback` dependency arrays — stale closures.

#### `MarginCalculator.tsx`
- **[WARN]** Unused `StatusBadge` import. `applyToAll` function defined but no UI trigger.

#### `admin/page.tsx`
- **[WARN]** Fetches ALL orders into memory, filters client-side.

---

## 3. Security Findings

| # | Severity | Location | Description |
|---|----------|----------|-------------|
| S1 | **CRITICAL** | `api/admin/purchases/review/route.ts` | No auth — unauthenticated purchase approval |
| S2 | **CRITICAL** | `api/admin/stock-targets/route.ts` | No auth on all 4 methods |
| S3 | **CRITICAL** | `api/cron/monthly-rollover/route.ts:24` | Auth bypassed when `CRON_SECRET` unset |
| S4 | **HIGH** | `api/cards/route.ts` | No auth — wholesale prices publicly exposed |
| S5 | **HIGH** | `middleware.ts` | Admin API routes not role-checked — preview deploy exposure |
| S6 | **HIGH** | `api/cart/route.ts:63` | Client-supplied prices stored without verification |
| S7 | **MEDIUM** | `email/templates.ts:87,246` | No HTML escaping on user input in emails |
| S8 | **MEDIUM** | `api/admin/stock-check/live/route.ts` | No URL allowlist — SSRF potential |
| S9 | **MEDIUM** | `auth.ts` | No rate limiting on login |
| S10 | **LOW** | `api/sync/route.ts:110` | Error details leaked in 500 response |

---

## 4. Dead Code & Stale References

| # | Location | Description |
|---|----------|-------------|
| D1 | `lib/get-volume-discount.ts` | Entire stub file — should be deleted |
| D2 | `schema.ts:33-35` | `currentMonthSpend`, `priorMonthSpend`, `volumeDiscountPct` on clients |
| D3 | `schema.ts:97` | `volumeDiscount` on orders — always 0 |
| D4 | `layout.tsx:4,17` | `getVolumeDiscount()` called on every page load |
| D5 | `providers.tsx:8` | `volumeDiscountPct` prop always 0 |
| D6 | `catalog/page.tsx:52-53,197-215` | Discount info fetch, banner, multiplier calcs |
| D7 | `CardTable.tsx:154` | `discounted` variable that doesn't actually discount |
| D8 | `discount/page.tsx` | Entire page is a redirect — should be deleted |
| D9 | `Nav.tsx:138` | Mobile "Discounts" link to dead route |
| D10 | `orders/page.tsx:33` | `volumeDiscount` selected but never displayed |
| D11 | `MarginCalculator.tsx:4` | Unused `StatusBadge` import |
| D12 | `MarginCalculator.tsx:45-54` | `applyToAll` function with no UI trigger |
| D13 | `cron/monthly-rollover/route.ts` | Computes discount spend that is no longer used |

---

## 5. Bugs & Edge Cases

| # | Location | Description |
|---|----------|-------------|
| B1 | `sync-uk-stock.ts:48,74` | `c.id` alias SQL error |
| B2 | `cart-context.tsx:167` | `setItems` callback as sync state read — race condition |
| B3 | `s3.ts:34` | Hardcoded FX rate fallback |
| B4 | `orders/route.ts:70` | Order + items not in transaction |
| B5 | `orders/route.ts:77` | Idempotency marker overwrites notes |
| B6 | `orders/[id]/status/route.ts:94` | Stale total used for spend tracking |
| B7 | `orders/[id]/items/route.ts:79` | Item IDs not verified to belong to target order |
| B8 | `orders/[id]/stock-check/complete/route.ts` | No transaction |
| B9 | `games/[id]/route.ts`, `sets/[id]/route.ts` | Empty update object → SQL error |
| B10 | `cards/[id]/route.ts:14` | Price not validated, 200 with undefined on missing card |
| B11 | `send-order-email.ts:130` | No default case in notification switch |
| B12 | `StockCheckClient.tsx:167` | Stale closures in useCallback |

---

## 6. Prioritised Fix List

### CRITICAL
| # | File | Fix |
|---|------|-----|
| 1 | `api/admin/purchases/review/route.ts` | Add auth + admin role check |
| 2 | `api/admin/stock-targets/route.ts` | Add auth + admin role check to all 4 methods |
| 3 | `api/cron/monthly-rollover/route.ts:24` | Deny when `CRON_SECRET` unset |

### HIGH
| # | File | Fix |
|---|------|-----|
| 4 | `api/cards/route.ts:6` | Add auth check |
| 5 | `middleware.ts` | Add role check for `/api/admin/*` routes |
| 6 | `api/cart/route.ts:63` | Verify prices server-side in PUT |
| 7 | `sync-uk-stock.ts:48,74` | Fix SQL alias |
| 8 | `api/orders/route.ts:70` | Wrap in transaction |
| 9 | `api/orders/[id]/items/route.ts:79` | Verify item ownership |
| 10 | `api/orders/[id]/stock-check/complete/route.ts` | Wrap in transaction |
| 11 | `s3.ts:34` | Remove hardcoded FX fallback |

### MEDIUM
| # | File | Fix |
|---|------|-----|
| 12 | `email/templates.ts:87` | HTML-escape user input |
| 13 | `api/admin/stock-check/live/route.ts` | Add URL allowlist |
| 14 | `cart-context.tsx:167` | Use `useRef` for latest items snapshot |
| 15 | `api/admin/games/[id]/route.ts` | Guard empty updates |
| 16 | `api/admin/sets/[id]/route.ts` | Guard empty updates |
| 17 | `sync-uk-stock.ts` | Wrap in transaction |
| 18 | `schema.ts` | Add indices on clientId / orderId |

### LOW (cleanup)
| # | File | Fix |
|---|------|-----|
| 19 | All discount scaffolding | Remove `get-volume-discount.ts`, dead columns, dead UI |
| 20 | `discount/page.tsx` + `Nav.tsx:138` | Delete dead page and mobile link |
| 21 | `admin/page.tsx` | SQL aggregations instead of client-side filter |
| 22 | `admin/prices/page.tsx` | Add pagination |
| 23 | `MarginCalculator.tsx:4` | Remove unused import |
| 24 | `StockCheckClient.tsx` | Fix useCallback deps |
| 25 | `api/cards/route.ts:16` | Add pagination |
