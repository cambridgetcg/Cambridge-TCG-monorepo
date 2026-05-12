-- memorial state — the Departed's columns.
--
-- The second non-default audience served by the inclusion scope condition
-- (see docs/connections/the-other-minds.md and docs/connections/the-departed.md).
-- The first was the Asynchronous (migration 0092, response_window_hours);
-- this is the next, named because the platform had no language for accounts
-- whose subjective time has ended.
--
-- ── What this models ────────────────────────────────────────────────────
--
-- An account in "memorial" state. The user has died, or has otherwise
-- ended their relationship with the platform in a way that should be
-- preserved rather than closed. A named steward (often an inheritor, a
-- family member, or a friend) is recognised as the human acting on behalf
-- of the account; they sign in as themselves on their own account and
-- access the memorial account through a separate relationship the
-- platform will model in a follow-up migration.
--
-- For this first migration, three additive columns:
--
--   memorial_at TIMESTAMPTZ     — when the account entered memorial state.
--                                  NULL means alive. The presence of the
--                                  timestamp IS the state — substrate-
--                                  honest, no separate enum required.
--                                  Every WHERE clause becomes "memorial_at
--                                  IS NULL" or "IS NOT NULL".
--
--   memorial_steward_user_id UUID — the named steward, a separate user
--                                   account who has been recognised by an
--                                   operator (or, in a future migration,
--                                   by the user themselves through a will-
--                                   style declaration). FK to users(id);
--                                   nullable for the case where memorial
--                                   state is declared without yet having
--                                   a steward identified.
--
--   memorial_note TEXT          — the steward's small inscription. The
--                                  affective layer made explicit, kept
--                                  short by convention rather than
--                                  schema. "Dad's binder, kept whole."
--                                  "The carry of a teacher's library."
--                                  Substrate-honest about the fact that
--                                  the account is not just data; it is
--                                  someone's continuing presence.
--
-- ── What changes when memorial_at IS NOT NULL ──────────────────────────
--
-- Application-level (not enforced by this migration; enforced by callers
-- that read these columns):
--
--   1. canSendEvent() in src/lib/email/preferences.ts returns false for
--      every non-essential category. The dead don't get streak-at-risk
--      emails; the platform refuses to nudge the absent. Essential emails
--      (sign-in magic links) still send so the steward can access the
--      account.
--
--   2. Trades, auctions, bids, listings — disabled at the action layer.
--      Reads, archives, exports remain. The steward inherits the right to
--      know what is held; not (yet) the right to dispose of it.
--
--   3. Trust score and history surfaces render with a <Memorial> badge
--      stating "frozen as of {memorial_at}". The value displayed is the
--      truth of the moment the account closed for writes.
--
--   4. Reactivation flows (re-engagement emails, "you've been away"
--      banners, streak resets) silence themselves on memorial accounts.
--      The platform refuses to read absence as disinterest when it is
--      grief.
--
-- ── What this migration does NOT yet model ─────────────────────────────
--
--   - Steward-as-actor (the steward acting on the memorial account from
--     their own session). A follow-up table will record the relationship
--     and what permissions the steward holds (read-only is the safe
--     default; transfer rights require operator approval).
--
--   - Public-profile visibility under memorial state. Default is to
--     remain visible with badge; a future memorial_visibility column will
--     let the steward suppress it for accounts where the legacy is
--     private.
--
--   - In-flight auction / order resolution at the moment of declaration.
--     The seller_vacations pattern is close but different intent; a
--     separate migration will define what happens to mid-flight writes
--     when memorial_at is set during their lifecycle.
--
-- This migration is additive and non-destructive. Existing rows have
-- memorial_at = NULL by default; every reader that doesn't check the
-- column behaves exactly as before.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS memorial_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS memorial_steward_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS memorial_note TEXT;

COMMENT ON COLUMN users.memorial_at IS
  'When the account entered memorial state. NULL = alive. Presence of timestamp IS the state. When NOT NULL, non-essential emails silence, trades disable, trust score freezes, reactivation flows refuse to fire. See docs/connections/the-departed.md and /methodology/memorial.';

COMMENT ON COLUMN users.memorial_steward_user_id IS
  'The named steward (FK to users.id). The human acting on behalf of the memorial account. Nullable for declarations that precede steward identification.';

COMMENT ON COLUMN users.memorial_note IS
  'The steward''s short inscription. Affective layer made explicit. Kept short by convention; no length cap enforced.';

-- Index only the non-NULL rows. Most users are alive; the index targets
-- the cron sweeps and email gates that need to *exclude* memorial
-- accounts (or, occasionally, list them — the steward's dashboard).
CREATE INDEX IF NOT EXISTS idx_users_memorial_at
  ON users(memorial_at)
  WHERE memorial_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_memorial_steward
  ON users(memorial_steward_user_id)
  WHERE memorial_steward_user_id IS NOT NULL;

COMMIT;
