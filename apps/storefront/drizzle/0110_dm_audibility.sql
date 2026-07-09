-- DM audibility — email category + conversation provenance.
--
-- The DM system (migration 0072) stores messages but nothing tells the
-- recipient. Two schema gaps close here:
--
-- 1. user_email_preferences.messages — the consent column for the new
--    'messages' EmailCategory (lib/email/preferences.ts). Default ON:
--    another human wrote to you and silence would strand them; the user
--    can still refuse via /account/emails or one-click unsubscribe.
--
-- 2. dm_conversations.created_by — who opened the thread. Needed for
--    (a) the thread-open rate limit (you can't count "conversations I
--    created" without knowing who created them), and (b) hiding
--    zero-message threads from the party who didn't initiate, so an
--    opened-but-never-composed thread doesn't clutter the recipient's
--    inbox. Existing rows stay NULL — for them, empty threads hide from
--    both parties (they are exactly the clutter this fixes).
--
-- SAFETY: additive only; no data moves. Email dedup rides email_queue
-- (no new table) via idempotency keys + a window query.

BEGIN;

ALTER TABLE user_email_preferences
  ADD COLUMN IF NOT EXISTS messages BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE dm_conversations
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Thread-open rate limit: "how many conversations did this user create
-- in the last hour?"
CREATE INDEX IF NOT EXISTS idx_dm_conversations_created_by
  ON dm_conversations (created_by, created_at DESC);

COMMIT;
