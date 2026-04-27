-- Link trade-in submissions to user accounts so the paid-out credit lands
-- in the user's store_credit_ledger automatically. Nullable — submissions
-- from non-registered users (one-off counter trade-ins) still work, they
-- just don't get credit issuance (admin pays them another way).

BEGIN;

ALTER TABLE tradein_submissions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tradein_submissions_user
  ON tradein_submissions(user_id, created_at DESC);

-- Backfill: link existing rows by matching customer_email → users.email.
-- Safe because customer_email is captured at submission time and users.email
-- is the auth identifier; one match per row at most.
UPDATE tradein_submissions s
   SET user_id = u.id
  FROM users u
 WHERE s.user_id IS NULL
   AND lower(s.customer_email) = lower(u.email);

-- Marker for "this submission's credit has been issued already". Belt and
-- braces — the per-submission ledger entry is keyed by reference_id, but a
-- dedicated boolean keeps re-credit checks O(1) without a ledger lookup.
ALTER TABLE tradein_submissions
  ADD COLUMN IF NOT EXISTS credit_issued_at TIMESTAMPTZ;

COMMIT;
