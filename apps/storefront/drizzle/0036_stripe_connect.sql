-- Stripe Connect for seller payouts.
--
-- Sellers onboard via Stripe Express (hosted KYC + bank verification).
-- Once payouts_enabled = true, admin can trigger Stripe Transfers from
-- the platform balance to the seller's connected account; the existing
-- payout endpoints record method='stripe_connect' + the transfer id.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS stripe_connect_status        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_updated_at    TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_connect_account
  ON users(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

-- Track the transfer that paid the seller (when method='stripe_connect').
-- Distinct from buyer's stripe_payment_intent and stripe_session_id.
ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS stripe_transfer_id VARCHAR(200);

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS stripe_transfer_id VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_trades_stripe_transfer
  ON market_trades(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auctions_stripe_transfer
  ON auctions(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

COMMIT;
