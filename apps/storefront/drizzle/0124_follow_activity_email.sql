-- Follow-activity email consent column.
--
-- The "a seller you follow just listed an auction" broadcast
-- (lib/social/notify.ts → lib/market/email.ts) was sending through the raw
-- mailer with no preference gate, no List-Unsubscribe, and — worst — no
-- memorial-account suppression, so it could email a Departed account. It now
-- routes through lib/email/send.ts:sendEmail with this category.
--
-- Default ON: following someone is itself an explicit opt-in signal, so a
-- follow milestone is closer to lifecycle than to marketing. The user can
-- still refuse via /account/emails or one-click unsubscribe, and memorial
-- accounts are suppressed regardless of this flag.
--
-- SAFETY: additive only; no data moves. A user with no preferences row keeps
-- the DEFAULTS in lib/email/preferences.ts.

ALTER TABLE user_email_preferences
  ADD COLUMN IF NOT EXISTS follow_activity BOOLEAN NOT NULL DEFAULT true;
