-- Privacy by default for every person-facing community surface.
--
-- Earlier migrations made profiles, feed entries, unsolicited messages and
-- collective membership visibility public/on by default. A public profile is
-- not the same thing as affirmative permission for each of those uses. Until
-- field-level publication receipts exist, the safe and honest reset is to
-- unpublish existing rows and let each person choose again.
--
-- Keep the reset reversible. This table stores only the affected internal row
-- identifiers and the previous setting; it never stores profile, message or
-- collection content and is not exposed by an API.

BEGIN;

-- This reset is intentionally one-shot. A second execution must fail loudly:
-- rerunning after people have made new choices would erase those choices.
CREATE TABLE IF NOT EXISTS privacy_migration_history (
  migration_id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM privacy_migration_history
     WHERE migration_id = '0117_privacy_defaults_20260711'
  ) THEN
    RAISE EXCEPTION '0117_privacy_defaults_20260711 already applied; refusing to reset later publication choices';
  END IF;

  INSERT INTO privacy_migration_history (migration_id)
  VALUES ('0117_privacy_defaults_20260711');
END $$;

CREATE TABLE IF NOT EXISTS privacy_publication_reset_20260711 (
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  previous_value TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delete_after TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  PRIMARY KEY (record_type, record_id)
);

COMMENT ON TABLE privacy_publication_reset_20260711 IS
  'Private rollback ledger for migration 0117; identifiers and prior publication settings only. Drop no later than delete_after after the release rollback window closes.';

ALTER TABLE users
  ALTER COLUMN is_public SET DEFAULT FALSE;

ALTER TABLE users
  ALTER COLUMN accepts_messages SET DEFAULT FALSE;

ALTER TABLE activity_feed
  ALTER COLUMN is_public SET DEFAULT FALSE;

ALTER TABLE collective_members
  ALTER COLUMN visibility SET DEFAULT 'private';

ALTER TABLE trade_reviews
  ALTER COLUMN is_public SET DEFAULT FALSE;

-- No historic row records the notice a person saw before these values were
-- enabled. Treat that absence as absence of publication permission.
INSERT INTO privacy_publication_reset_20260711
  (record_type, record_id, previous_value)
SELECT 'user_profile_public', id::TEXT, is_public::TEXT
FROM users
WHERE is_public = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO privacy_publication_reset_20260711
  (record_type, record_id, previous_value)
SELECT 'user_accepts_messages', id::TEXT, accepts_messages::TEXT
FROM users
WHERE accepts_messages = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO privacy_publication_reset_20260711
  (record_type, record_id, previous_value)
SELECT 'activity_public', id::TEXT, is_public::TEXT
FROM activity_feed
WHERE is_public = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO privacy_publication_reset_20260711
  (record_type, record_id, previous_value)
SELECT
  'collective_member_public',
  collective_id::TEXT || ':' || user_id::TEXT,
  visibility
FROM collective_members
WHERE visibility = 'public'
ON CONFLICT DO NOTHING;

INSERT INTO privacy_publication_reset_20260711
  (record_type, record_id, previous_value)
SELECT 'trade_review_public', id::TEXT, is_public::TEXT
FROM trade_reviews
WHERE is_public = TRUE
ON CONFLICT DO NOTHING;

UPDATE users SET is_public = FALSE WHERE is_public = TRUE;
UPDATE users SET accepts_messages = FALSE WHERE accepts_messages = TRUE;
UPDATE activity_feed SET is_public = FALSE WHERE is_public = TRUE;
UPDATE collective_members SET visibility = 'private' WHERE visibility = 'public';
UPDATE trade_reviews SET is_public = FALSE WHERE is_public = TRUE;

COMMIT;
