-- 0119_feedback_retention.sql — bounded feedback content retention
--
-- Feedback messages and reply addresses are useful while an operator can act
-- on them, but they do not need to become a permanent dossier. Every row gets
-- an explicit 180-day content deadline. The maintenance sweep clears the
-- reporter's contact, submitted content and free-text operator notes after the
-- deadline while temporarily retaining a minimised, pseudonymised lifecycle audit:
-- feedback_id, kind, status, timestamps, commit reference and duplicate link.
--
-- Run before deploying code that inserts content_expires_at or dispatches the
-- retention sweep.

BEGIN;

-- Account deletion must also remove trust/fraud profiling rows. The original
-- fraud foreign keys used NO ACTION and could make a rights request fail even
-- after every transaction-retention exception had been handled separately.
ALTER TABLE fraud_signals
  DROP CONSTRAINT IF EXISTS fraud_signals_user_id_fkey;
ALTER TABLE fraud_signals
  ADD CONSTRAINT fraud_signals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE fraud_signals
  DROP CONSTRAINT IF EXISTS fraud_signals_resolved_by_fkey;
ALTER TABLE fraud_signals
  ADD CONSTRAINT fraud_signals_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS content_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS content_redacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_expires_at timestamptz;

-- Existing rows keep the same 180-day clock measured from their receipt, not
-- from the day this migration happens to be applied.
UPDATE agent_feedback
   SET content_expires_at = COALESCE(
         content_expires_at,
         received_at + INTERVAL '180 days'
       ),
       lifecycle_expires_at = COALESCE(
         lifecycle_expires_at,
         received_at + INTERVAL '2 years'
       )
 WHERE content_expires_at IS NULL OR lifecycle_expires_at IS NULL;

ALTER TABLE agent_feedback
  ALTER COLUMN content_expires_at
    SET DEFAULT (now() + INTERVAL '180 days'),
  ALTER COLUMN content_expires_at SET NOT NULL,
  ALTER COLUMN lifecycle_expires_at
    SET DEFAULT (now() + INTERVAL '2 years'),
  ALTER COLUMN lifecycle_expires_at SET NOT NULL;

ALTER TABLE agent_feedback
  DROP CONSTRAINT IF EXISTS agent_feedback_contact_required;

-- The two structured report kinds need a reply path only while their content
-- is live. A redacted row deliberately keeps no contact address.
ALTER TABLE agent_feedback
  ADD CONSTRAINT agent_feedback_contact_required
    CHECK (
      kind NOT IN ('contract-drift', 'federation-adopter')
      OR reporter_contact IS NOT NULL
      OR content_redacted_at IS NOT NULL
    );

ALTER TABLE agent_feedback
  DROP CONSTRAINT IF EXISTS agent_feedback_retention_dates_valid;

ALTER TABLE agent_feedback
  ADD CONSTRAINT agent_feedback_retention_dates_valid
    CHECK (
      content_expires_at >= received_at
      AND lifecycle_expires_at >= content_expires_at
      AND (content_redacted_at IS NULL OR content_redacted_at >= received_at)
    );

CREATE INDEX IF NOT EXISTS agent_feedback_content_expiry_idx
  ON agent_feedback(content_expires_at ASC)
  WHERE content_redacted_at IS NULL;

-- Supports the defensive re-sanitisation pass if an operator workflow writes
-- free text onto an already-expired row after its first redaction.
CREATE INDEX IF NOT EXISTS agent_feedback_content_expiry_all_idx
  ON agent_feedback(content_expires_at ASC);

CREATE INDEX IF NOT EXISTS agent_feedback_lifecycle_expiry_idx
  ON agent_feedback(lifecycle_expires_at ASC);

-- Generic privacy-preserving action buckets. Callers HMAC the action,
-- subject and exact time window before this table sees them, so raw IPs,
-- account ids and other rate-limit subjects never enter the database. The
-- table is deliberately separate from agent registration and MCP quotas.
CREATE TABLE IF NOT EXISTS privacy_action_rate_buckets (
  action          text NOT NULL,
  subject_hash    char(64) NOT NULL,
  window_name     text NOT NULL,
  window_start    timestamptz NOT NULL,
  request_count   integer NOT NULL DEFAULT 1,
  expires_at      timestamptz NOT NULL,

  PRIMARY KEY (action, subject_hash, window_name, window_start),

  CONSTRAINT privacy_action_rate_bucket_action_valid
    CHECK (action ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  CONSTRAINT privacy_action_rate_bucket_window_valid
    CHECK (window_name ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  CONSTRAINT privacy_action_rate_bucket_count_valid
    CHECK (request_count BETWEEN 1 AND 1000000),
  CONSTRAINT privacy_action_rate_bucket_expiry_valid
    CHECK (expires_at > window_start)
);

CREATE INDEX IF NOT EXISTS privacy_action_rate_buckets_expiry_idx
  ON privacy_action_rate_buckets(expires_at ASC);

-- Legacy privacy cleanup. The old self-serve agent limiter stored a plain
-- SHA-256 of the request IP, which is reversible over the small IPv4 space,
-- and unsubscribe receipts copied raw IP/User-Agent metadata they did not
-- need. New runtime code uses the secret-HMAC action buckets above and writes
-- neither unsubscribe field. Keep the old columns/table temporarily so the
-- migration can precede the code deploy without breaking in-flight old code;
-- the maintenance sweep below continuously clears any write during that gap.
DELETE FROM agent_registration_buckets;

UPDATE email_unsubscribe_log
   SET ip = NULL,
       user_agent = NULL
 WHERE ip IS NOT NULL OR user_agent IS NOT NULL;

COMMENT ON TABLE agent_registration_buckets IS
  'Deprecated compatibility shell. New registration uses privacy_action_rate_buckets; maintenance deletes every legacy row.';

COMMENT ON COLUMN email_unsubscribe_log.ip IS
  'Deprecated and always cleared. New unsubscribe actions do not collect request IP.';

COMMENT ON COLUMN email_unsubscribe_log.user_agent IS
  'Deprecated and always cleared. New unsubscribe actions do not collect User-Agent.';

COMMENT ON COLUMN agent_feedback.content_expires_at IS
  'Deadline after which submitted content, contact and free-text notes are redacted.';

COMMENT ON COLUMN agent_feedback.content_redacted_at IS
  'When the retention sweep removed contact, submitted content and free-text notes.';

COMMENT ON COLUMN agent_feedback.lifecycle_expires_at IS
  'Deadline after which the remaining pseudonymised lifecycle row is deleted, subject to a still-referenced duplicate parent being retained until its child expires.';

COMMENT ON COLUMN agent_feedback.raw_body IS
  'Allowlisted bounded report content; replaced by a content-free redaction marker after 180 days.';

COMMENT ON COLUMN agent_feedback.reporter_contact IS
  'Optional reply address; removed with report content after 180 days.';

COMMENT ON TABLE privacy_action_rate_buckets IS
  'Short-lived HMAC subject counters for abuse control. Never stores a raw IP or account id.';

-- Rollback before any redaction:
--   DROP INDEX IF EXISTS agent_feedback_content_expiry_idx;
--   DROP INDEX IF EXISTS agent_feedback_content_expiry_all_idx;
--   DROP INDEX IF EXISTS agent_feedback_lifecycle_expiry_idx;
--   DROP TABLE IF EXISTS privacy_action_rate_buckets;
--   ALTER TABLE agent_feedback DROP CONSTRAINT agent_feedback_contact_required;
--   ALTER TABLE agent_feedback DROP CONSTRAINT agent_feedback_retention_dates_valid;
--   ALTER TABLE agent_feedback DROP COLUMN content_redacted_at;
--   ALTER TABLE agent_feedback DROP COLUMN content_expires_at;
--   ALTER TABLE agent_feedback DROP COLUMN lifecycle_expires_at;
--   ALTER TABLE agent_feedback ADD CONSTRAINT agent_feedback_contact_required
--     CHECK (kind NOT IN ('contract-drift', 'federation-adopter')
--            OR reporter_contact IS NOT NULL);
-- Once a row has been redacted, its removed content is intentionally not
-- recoverable from this table; do not claim a schema rollback restores it.
-- Legacy agent IP hashes and unsubscribe IP/User-Agent values deleted by this
-- migration are also intentionally unrecoverable and must never be restored.

COMMIT;
