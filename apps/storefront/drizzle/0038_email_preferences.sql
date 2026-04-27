-- Per-user opt-out state for transactional emails.
--
-- Categories:
--   essential        — sign-in links, payment receipts, order shipments. Cannot
--                      be disabled by the user (absence of a row = allowed).
--   activity         — you did the thing (pull resolved, item sold back). Default ON.
--   nudges           — expiry reminders. Default ON because value preservation.
--   marketing        — newsletters, promotions. Default OFF (explicit opt-in).
--   guild / social   — optional; future use.
--
-- Convention: one BOOLEAN column per event. A nullable DB with no row for a
-- user implies defaults. We only INSERT when the user actually changes a
-- preference.
--
-- Signed unsubscribe tokens resolve to (user_id, category) server-side so
-- they don't leak user IDs in URLs. See src/lib/email/unsubscribe.ts.

CREATE TABLE IF NOT EXISTS user_email_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Activity (default ON)
  pull_resolved          BOOLEAN NOT NULL DEFAULT true,
  vault_redeemed         BOOLEAN NOT NULL DEFAULT true,
  vault_sold_back        BOOLEAN NOT NULL DEFAULT true,

  -- Nudges (default ON — these protect user value)
  vault_expired          BOOLEAN NOT NULL DEFAULT true,
  vault_expiring_soon    BOOLEAN NOT NULL DEFAULT true,

  -- Opt-in (default OFF — push-y by nature)
  streak_at_risk         BOOLEAN NOT NULL DEFAULT false,
  marketing              BOOLEAN NOT NULL DEFAULT false,

  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit of one-click unsubscribes so we can spot abuse (e.g. bot traffic
-- mass-unsubscribing users by replaying old tokens).
CREATE TABLE IF NOT EXISTS email_unsubscribe_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  category        VARCHAR(40) NOT NULL,
  source          VARCHAR(20) NOT NULL,    -- 'email_link' | 'preference_page' | 'list_unsubscribe'
  ip              VARCHAR(45),
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_unsub_log_user ON email_unsubscribe_log(user_id, created_at DESC);
