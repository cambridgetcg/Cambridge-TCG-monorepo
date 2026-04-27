-- Auction payment deadline + auto-cancel.
--
-- Mirrors the market settlement pattern: when an auction ends with a winner,
-- we stamp payment_expires_at = NOW() + 48h. A lazy sweep cancels auctions
-- whose winner never paid in time so the listing can be relisted.

BEGIN;

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_auctions_payment_expiry
  ON auctions(status, payment_expires_at)
  WHERE status = 'ended';

COMMIT;
