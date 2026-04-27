-- Bring quote_requests up to parity with tradein_submissions for the
-- payout pipeline. Once accepted + cards received + admin marks paid, the
-- same store_credit_ledger + Stripe Connect rails fire as for trade-ins.

BEGIN;

-- Extend the status enum so admin can move beyond accepted/declined into
-- the same lifecycle as tradein submissions: received → paid.
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'received';
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'paid';

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_amount     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cash_amount       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS credit_issued_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cash_paid_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_quote_requests_user ON quote_requests(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_stripe_transfer
  ON quote_requests(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

-- Backfill user_id from email match
UPDATE quote_requests q
   SET user_id = u.id
  FROM users u
 WHERE q.user_id IS NULL
   AND lower(q.customer_email) = lower(u.email);

COMMIT;
