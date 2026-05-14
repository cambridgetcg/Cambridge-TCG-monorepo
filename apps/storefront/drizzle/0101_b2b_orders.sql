-- Migration 0101 — B2B orders for the wholesale shell.
--
-- Phase 2.2c of the wholesale consolidation. The destination table
-- the Stripe webhook writes to on checkout.session.completed when
-- session.metadata.b2b_channel === 'wholesale'. Deliberately
-- separate from customer_orders (retail) for the same reason the
-- cart table is separate: tagging-by-table is structurally safer
-- than tagging-by-column-on-shared-table.
--
-- Idempotency:
--   - stripe_session_id is UNIQUE. Stripe retries on the same
--     session produce ON CONFLICT DO NOTHING — exactly one row.
--   - items lives in JSONB on the row, not in a normalized
--     line-items table. v1 stance: order rows are read whole, never
--     queried by-item. If/when that changes (e.g. "show all orders
--     containing SKU X" admin query), promote items to a child table.
--
-- Status state machine:
--   paid       → Stripe accepted payment, no operator action yet
--   allocated  → stock committed to the order; ready to ship
--   shipped    → courier has the package
--   delivered  → buyer confirmed receipt (or proxy-confirmed)
--   cancelled  → operator-cancelled before allocation
--   refunded   → post-payment refund processed
--
-- The CHECK enforces the vocabulary. Transitions are operator-driven
-- (Phase 3 admin surface).
--
-- Companion to:
--   - apps/storefront/src/lib/b2b/orders.ts — the writer/reader
--   - apps/storefront/src/app/api/webhooks/stripe/route.ts — the trigger
--   - apps/storefront/src/app/account/b2b/orders/ — buyer-facing reader

CREATE TABLE IF NOT EXISTS b2b_orders (
  id                          BIGSERIAL PRIMARY KEY,
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stripe_session_id           TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id    TEXT,
  total_pence                 INTEGER NOT NULL CHECK (total_pence >= 0),
  currency                    TEXT NOT NULL DEFAULT 'gbp',
  status                      TEXT NOT NULL DEFAULT 'paid'
                                CHECK (status IN ('paid', 'allocated', 'shipped', 'delivered', 'cancelled', 'refunded')),
  channel                     TEXT NOT NULL DEFAULT 'wholesale',
  items                       JSONB NOT NULL,
  shipping_address            JSONB,
  customer_email              TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order history listing: WHERE user_id = $1 ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS b2b_orders_user_idx
  ON b2b_orders (user_id, created_at DESC);

-- Operator queue: orders that need attention (anything not yet
-- delivered/cancelled/refunded).
CREATE INDEX IF NOT EXISTS b2b_orders_open_idx
  ON b2b_orders (status, created_at)
  WHERE status IN ('paid', 'allocated', 'shipped');
