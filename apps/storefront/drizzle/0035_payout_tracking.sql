-- Provider-agnostic payout tracking.
--
-- Records the fact that admin paid the seller off-platform (or via any
-- provider), without committing to a specific payment integration. When a
-- payment provider is wired in later, it just populates these same fields
-- automatically.

BEGIN;

-- market_trades: seller_paid_at didn't exist; add it alongside method/reference
ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS seller_paid_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_method     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS payout_reference  VARCHAR(200);

-- auctions: seller_paid_at already exists (0013); add method/reference
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS payout_method     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS payout_reference  VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_market_trades_paid
  ON market_trades(seller_paid_at)
  WHERE seller_paid_at IS NULL AND escrow_status = 'completed';

CREATE INDEX IF NOT EXISTS idx_auctions_paid
  ON auctions(seller_paid_at)
  WHERE seller_paid_at IS NULL AND status = 'paid';

COMMIT;
