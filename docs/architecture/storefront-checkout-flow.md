# Storefront checkout flow — survey

Survey of `apps/storefront`'s cart + checkout + order lifecycle, written ahead
of wiring `@cambridge-tcg/stock` reservations into it. This is the "Mission 2/3
survey" for the stock prototype arc.

## Cart

- **Storage:** browser localStorage under key `cambridgetcg_cart`. No
  server-side cart table, no cart cookie. Cart is purely client state until
  checkout.
- **Item shape** (`src/lib/cart.ts:CartItem`): `{ sku, name, price, image_url,
  quantity, set_code, card_number }`.
- **Identifier:** there is no durable cart identifier before checkout. The
  first identifier the server sees is the **Stripe checkout session id**,
  generated when the client POSTs to `/api/checkout`.

## Checkout request — `POST /api/checkout`

- Validates the cart, applies tier discount (membership perks), applies
  store credit (one-shot Stripe coupon), then `stripe.checkout.sessions.create`.
- Stuffs `metadata.skus` with `JSON.stringify(items.map(...))` so the webhook
  can reconstruct line items without DB lookups.
- Returns `{ url, discount, creditApplied, creditAvailable }`. Client redirects
  to Stripe-hosted checkout.
- **No reservation today.** Inventory is not held. Two carts can pay for the
  last unit; the second to land in the webhook gets a stock decrement that
  goes negative (or silently fails depending on call site).

## Stripe webhook — `POST /api/webhooks/stripe`

Branches on `event.type`. Relevant branches:
- `checkout.session.completed` (line ~333): reads `metadata.skus`, calls
  wholesale `reportSale()`, INSERTs into `customer_orders`, debits store
  credit, posts social activity. **This is where stock should be committed
  (decrement on_hand) and the reservation should be cleared.**
- `payment_intent.payment_failed` (line ~304): logs, ingests failure
  signal, calls `handleFailedPayment`. **Reservation should be released here.**
- `charge.refunded` / `charge.refund.updated` (line ~280-): handles refunds.
  Refund handling is out of scope for the prototype (refund-side stock
  recovery is a future mission).

Stripe metadata carries `skus`, `platinum_discount`, `credit_applied_gbp`,
`credit_user_id`. Adding nothing new — webhook reads everything from the
session.

## DB layer

- `apps/storefront/src/lib/db.ts` exports `query`, `transaction`, `db` from
  `@cambridge-tcg/db/compat` (raw-SQL compatibility wrapper over postgres.js).
- Compat layer is good for storefront's existing code but the stock package
  expects a Drizzle `DbClient` (`PostgresJsDatabase`).
- Solution: lazily construct a separate Drizzle client over the same DB URL
  via `createDb({ url: process.env.DATABASE_URL })` from `@cambridge-tcg/db`.
  Both connections point at the same RDS Postgres; the cards table lives in
  the same schema; reservations and movements land in the wholesale-owned
  tables (`stock_reservations`, `stock_movements`).

## Sku → cardId translation

- `cards.sku` is `text NOT NULL UNIQUE` (per `apps/wholesale/src/lib/db/schema.ts`).
- `cards.id` is `serial PRIMARY KEY`.
- Stock reserver expects numeric `cardId`. Storefront speaks `sku`. Translation
  done once per checkout against the wholesale `cards` table (single
  `WHERE sku IN (...)` query).

## Cron

- `/api/cron/maintenance` runs every minute (per `apps/storefront/vercel.json`).
- Currently does ~36 small sweeps. **Add `releaseExpired()` here** to clean
  up stale reservations whose Stripe sessions never completed.

## Test framework

- None installed in storefront. No vitest, no jest, no playwright. Existing
  scripts: `dev`, `build`, `start`, `lint`. Adding tests is out of scope for
  this mission; covered separately by the E2E mission (3/3).

## Hook points — what this mission wires

1. **`POST /api/checkout`** — after `stripe.checkout.sessions.create()` succeeds,
   reserve stock for every line item using `session.id` as the `holder`.
   If reservation fails for any item, expire the Stripe session immediately
   and return 409 to the client.
2. **`checkout.session.completed`** in webhook — after the
   `INSERT INTO customer_orders ... ON CONFLICT DO NOTHING` succeeds, call
   `commitToSale` for every line item. The reserver's
   `ON CONFLICT (cardId, referenceId) DO NOTHING` makes commit idempotent if
   Stripe redelivers the event.
3. **`payment_intent.payment_failed`** in webhook — best-effort
   `releaseCheckout(holder)`. The holder is reachable via the PI's
   `metadata` only if we copied it across; if we can't recover the holder
   we rely on the reservation TTL + cron sweep.
4. **`/api/cron/maintenance`** — call `releaseExpired()` once per tick.

## Decisions

- **Hold TTL: 30 minutes** (the reserver's default). Stripe's hosted checkout
  has its own session timeout (~24 hours by default but we use 30 minutes
  for cart liveness — long enough for normal checkouts, short enough that
  abandoned reservations clear quickly on cron).
- **Holder format: `stripe-session:<session.id>`.** Prefixed so future
  reservation sources (e.g. P2P market locks) don't collide.
- **Atomicity on multi-item carts:** wrap all reserves in one Drizzle
  transaction. If any item fails the whole transaction rolls back — the
  client either gets the cart they asked for or nothing.
- **Idempotency on commit:** rely on the package's `referenceId` UNIQUE
  constraint. Reference id = `stripe-session:<session.id>:sku:<sku>`.

## Migration prerequisite

The reserver requires `cards.reserved_stock` (integer column). This column
must exist in the wholesale schema before any reservation runs. If absent,
the wiring built in this mission compiles but throws at runtime when
`tx.update(cards).set({ reservedStock: ... })` is called. The migration is
the wholesale team's responsibility and is tracked separately.

## What this mission does NOT do

- No UI surface for "this card is out of stock" on PDP/cart — the prototype
  surfaces 409 at checkout only. PDP-time availability is a follow-up.
- No tests — storefront has no test framework and adding one is outside the
  prototype scope. E2E is mission 3/3.
- No refund-side stock recovery — when a refund is issued, the existing
  movement is not reversed in this prototype. Future mission.
- No multi-condition reservations — the reserver keys on `cardId`, not
  `(cardId, condition)`. This is consistent with how the storefront
  catalogs items (one sku per card-condition combo).
