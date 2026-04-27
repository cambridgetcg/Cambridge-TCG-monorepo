-- Market settlement, expiry, and escrow tier persistence.
--
-- Adds the columns needed to (a) cancel unpaid trades after a deadline,
-- (b) record which escrow tier a trade was routed into at match time so the
-- admin dashboard and emails can branch on it, and (c) carry a Stripe
-- checkout session id distinct from the payment intent (the webhook needs
-- both for idempotent lookups).
--
-- All additive; safe to apply on a live DB. Run before deploying the code
-- that depends on these fields.

BEGIN;

-- Trades --------------------------------------------------------------------

ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS escrow_tier        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_session_id  TEXT;

CREATE INDEX IF NOT EXISTS idx_market_trades_payment_expiry
  ON market_trades(escrow_status, payment_expires_at)
  WHERE escrow_status = 'awaiting_payment';

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_trades_stripe_session
  ON market_trades(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Orders --------------------------------------------------------------------
-- expires_at already exists on market_orders (per 0012); add an index so the
-- lazy expiry sweep doesn't full-scan.

CREATE INDEX IF NOT EXISTS idx_market_orders_expires
  ON market_orders(status, expires_at)
  WHERE status IN ('open', 'partially_filled');

COMMIT;
