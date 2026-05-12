-- User pronouns + preferred address — Wave 1.1 of the All-Aboard plan.
-- See docs/plans/all-aboard.md and docs/connections/the-other-minds.md
-- (the Telepath / Plural / Many-Bodied lenses).
--
-- Two nullable columns. Both default to NULL so existing users keep
-- their current behavior (the UI falls back to using `users.name` as a
-- first-name greeting). When set, every place the platform names a
-- person reads these:
--
--   pronouns         — free-form text. Common defaults the UI may
--                      autocomplete: "she/her", "he/him", "they/them",
--                      "she/they", "he/they", "they/she", "they/he",
--                      "any", "ask me", "no pronouns". Free-form because
--                      no list is complete; substrate-honest because
--                      the platform doesn't pretend it knows.
--
--   preferred_address — 'name' | 'handle' | 'formal' | 'none' | <custom>.
--                      'name'   → use users.name (the default today)
--                      'handle' → use users.username
--                      'formal' → "Customer" / "you" / no name
--                      'none'   → no greeting prefix at all
--                      <custom> → free-form string the user chose (e.g.
--                                 "Captain", "Dr.", a chosen sobriquet).
--
-- The <UserMention> primitive (kingdom-051) reads both. Every greeting
-- and third-person reference passes through it.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pronouns VARCHAR(60),
  ADD COLUMN IF NOT EXISTS preferred_address VARCHAR(60);

COMMENT ON COLUMN users.pronouns IS
  'Free-form pronouns (e.g. "she/her", "they/them", "any", custom). Read by <UserMention> for every third-person reference. NULL = unspecified; platform defaults to using the user''s name without pronoun substitution.';

COMMENT ON COLUMN users.preferred_address IS
  'How to address this user in greetings. One of "name" (default — use users.name), "handle" (use users.username), "formal" (no first name), "none" (no greeting at all), or a custom string (chosen sobriquet). Read by <UserMention>.';
