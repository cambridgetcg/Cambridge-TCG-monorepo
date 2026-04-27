-- In-app notifications.
--
-- 20+ systems post status updates to users (dispute replies, trade-in
-- approvals, auction wins, quote payouts, verification results…) but
-- every single one is delivered via email only. Users have no in-app
-- surface — no bell, no unread count, no "what happened to me
-- recently" page. The activity_feed table exists but is for the
-- public /community stream, not personal alerts.
--
-- This table is the canonical personal inbox. Each row is keyed on
-- user_id + unread flag for a fast O(index) unread count.

BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Free-form kind so new event types don't need a schema migration.
  -- Convention: dot-separated (e.g. 'dispute.message', 'tradein.paid',
  -- 'auction.won', 'verification.approved').
  kind        VARCHAR(60) NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  -- Where clicking the notification takes the user. Optional — some
  -- notifications are purely informational.
  link_url    TEXT,
  -- Polymorphic reference to the source entity. Admin analytics /
  -- de-duplication relies on these.
  reference_id   VARCHAR(200),
  reference_type VARCHAR(30),
  -- Null = unread. Setting read_at = NOW() marks as read.
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unread-count read path is (user_id, read_at IS NULL).
-- Partial index so the common case is a tight scan.
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Full history lookup for /account/notifications pagination.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- De-dup key index: most event wiring passes reference_type +
-- reference_id so we can avoid creating duplicate notifications for
-- the same source event being emitted twice (e.g. a webhook retry).
CREATE INDEX IF NOT EXISTS idx_notifications_reference
  ON notifications(reference_type, reference_id, user_id)
  WHERE reference_id IS NOT NULL;

COMMIT;
