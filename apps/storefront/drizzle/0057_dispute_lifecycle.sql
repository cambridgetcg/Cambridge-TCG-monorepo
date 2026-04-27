-- Dispute system fixes + lifecycle timestamps.
--
-- Two problems this migration solves:
--
-- 1. dispute_messages.sender_id was NOT NULL REFERENCES users(id),
--    which meant admin messages needed a "real" user id. The current
--    admin POST route works around this by picking whoever happens
--    to be first in the users table — which attributes admin replies
--    to a random customer. Make sender_id nullable so admin messages
--    can be stored with sender_id=NULL + is_admin=true, which is both
--    honest and queryable.
--
-- 2. trade_disputes has created_at and resolved_at but nothing in
--    between. Admin flipping status='under_review' or 'awaiting_evidence'
--    is invisible to the customer timeline. Add per-status timestamp
--    columns (same pattern as migration 0047 for tradein_submissions)
--    and stamp them via COALESCE.

BEGIN;

ALTER TABLE dispute_messages
  ALTER COLUMN sender_id DROP NOT NULL;

ALTER TABLE trade_disputes
  ADD COLUMN IF NOT EXISTS under_review_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS awaiting_evidence_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS withdrawn_at         TIMESTAMPTZ;

-- Backfill — rows whose current status implies a step is past get their
-- timestamp from updated_at as the best available approximation.
UPDATE trade_disputes SET under_review_at      = updated_at
  WHERE under_review_at IS NULL AND status IN ('under_review', 'awaiting_evidence',
    'resolved_buyer', 'resolved_seller', 'resolved_split', 'closed');
UPDATE trade_disputes SET awaiting_evidence_at = updated_at
  WHERE awaiting_evidence_at IS NULL AND status IN ('awaiting_evidence',
    'resolved_buyer', 'resolved_seller', 'resolved_split', 'closed');

CREATE INDEX IF NOT EXISTS idx_trade_disputes_raised_by
  ON trade_disputes(raised_by, created_at DESC);

COMMIT;
