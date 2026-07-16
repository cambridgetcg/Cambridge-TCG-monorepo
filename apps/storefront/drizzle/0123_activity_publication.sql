-- Activity publication receipt — the versioned, purpose-specific choice a
-- person makes to publish their MILESTONE activity to the community feed
-- (activity-publication-v1). This is the "separate per-event publication
-- choice" the paused feed was waiting for (methodology/community →
-- Conditions for resumption). Mirrors the profile + messaging receipts added
-- by 0117. Default absent → nobody's activity is public until they accept it.
--
-- Forward-only: activity_feed.is_public is computed at insert time (postActivity)
-- from whether the author currently holds this receipt AND the event is a
-- publishable milestone, so events created before consent stay private and
-- withdrawal (clearing the receipt) hides even already-public rows, because the
-- feed read also re-checks the current receipt.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS activity_publication_notice_version TEXT,
  ADD COLUMN IF NOT EXISTS activity_published_at TIMESTAMPTZ;

-- The feed reads: public rows whose author currently holds the receipt.
CREATE INDEX IF NOT EXISTS idx_activity_feed_public_recent
  ON activity_feed (created_at DESC) WHERE is_public = true;
