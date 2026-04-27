-- Generalised user-to-user direct messaging.
--
-- The dispute_messages table (migration 0019, 0057) was the first
-- application of this pattern: per-conversation thread, sender_id,
-- read state. This migration generalises it so any two users can
-- start a thread — about a market listing, an auction, an offer,
-- or just to chat about a card.
--
-- Conversation row is canonicalised as an ordered pair
-- (user_a_id < user_b_id) so dm_conversations(user_a, user_b) is
-- a unique tuple regardless of who initiated. The lib hides the
-- ordering from callers.

CREATE TABLE IF NOT EXISTS dm_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Canonical ordering: user_a_id < user_b_id (string compare on
  -- UUID text). Enforced by CHECK + the lib's sortPair helper.
  user_a_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Cached preview for the inbox list — saves a JOIN per row.
  last_message_at        TIMESTAMPTZ,
  last_sender_id         UUID REFERENCES users(id),
  last_message_preview   TEXT,
  message_count          INT NOT NULL DEFAULT 0,

  -- Per-user read cursor. last_read_at_a is the timestamp through
  -- which user_a has read the conversation; messages with
  -- created_at > last_read_at_a are unread for them.
  last_read_at_a TIMESTAMPTZ,
  last_read_at_b TIMESTAMPTZ,

  -- Per-user archive flag — hides the conversation from one user's
  -- inbox without affecting the other. A new message un-archives.
  archived_a    BOOLEAN NOT NULL DEFAULT false,
  archived_b    BOOLEAN NOT NULL DEFAULT false,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dm_conversations_canonical_pair CHECK (user_a_id < user_b_id),
  UNIQUE (user_a_id, user_b_id)
);

-- Inbox query: "my conversations, newest message first."
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user_a
  ON dm_conversations (user_a_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user_b
  ON dm_conversations (user_b_id, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS dm_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),

  -- Optional context — "this message is about market_order X" or
  -- "auction Y". Nullable; the inbox renders a small chip when
  -- present so the recipient knows what triggered the message.
  reference_type VARCHAR(40),
  reference_id   VARCHAR(100),

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Thread render: messages in a conversation, oldest first.
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation
  ON dm_messages (conversation_id, created_at ASC);

-- Rate-limit check: "how many messages has this sender sent in the
-- last N seconds?" Partial-ish — we don't have a status here, but
-- the index supports the lookback predicate efficiently.
CREATE INDEX IF NOT EXISTS idx_dm_messages_sender_recent
  ON dm_messages (sender_id, created_at DESC);

-- Block list. Bidirectional check at send-time: the lib refuses if
-- EITHER user has the other in their block list. Stored as one row
-- per (blocker, blocked) so unblocking is a simple delete.
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- "Has this user blocked anyone? / been blocked by anyone?" — both
-- directions index-only-scannable for the bidirectional check.
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
  ON user_blocks (blocked_id, blocker_id);

-- Per-user opt-out. Defaults true so the platform doesn't silently
-- become a spam channel; users who don't want unsolicited messages
-- can flip it on /account/profile.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accepts_messages BOOLEAN NOT NULL DEFAULT true;
