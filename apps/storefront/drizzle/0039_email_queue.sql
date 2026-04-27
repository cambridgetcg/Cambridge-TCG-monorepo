-- Scheduled / delayed email queue.
--
-- Use cases:
--   - "Your vault item expires in 7 days" (queued at pull time, due 7 days
--     before expires_at)
--   - "Your streak breaks tomorrow" (queued nightly when at-risk)
--   - any future time-delayed nudge
--
-- State machine:
--   pending   → drain picks it up, flips to sending, tries once, then
--                            sent OR failed(retry_count<3) OR dead(retry_count=3)
--   cancelled → item exited the state that made the email meaningful
--                (sold back before expiry, etc.). Queue skips it.
--
-- Idempotency key pattern:
--   For "vault_expiring_soon" the key is "vault_expiring_soon:<vault_item_id>".
--   Duplicate scheduleEmail() with the same key returns the existing row.
--   The drain uses a FOR UPDATE SKIP LOCKED pattern so multiple concurrent
--   crons don't double-send.

CREATE TABLE IF NOT EXISTS email_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event             VARCHAR(50) NOT NULL,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for     TIMESTAMPTZ NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending | sending | sent | failed | dead | cancelled
  attempt_count     INT NOT NULL DEFAULT 0,
  last_error        TEXT,
  last_attempt_at   TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  idempotency_key   VARCHAR(200) UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_drain
  ON email_queue (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_user
  ON email_queue (user_id, created_at DESC);
