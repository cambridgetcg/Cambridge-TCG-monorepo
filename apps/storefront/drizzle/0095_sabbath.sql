-- Sabbath mode — the right to be undisturbed.
--
-- Planted from `docs/connections/the-unseen.md` passage #10: a deep
-- "leave-me-alone" toggle that silences every voluntary platform-
-- initiated touch. User-initiated paths (login, browse, transact) still
-- work; platform-initiated paths (notifications, email digests, mention
-- pings, follow alerts, watch alerts, marketplace nudges) stop.
--
-- One column. NULL means Sabbath is off. A future timestamp means "the
-- platform stays quiet until this date." A far-future timestamp (or one
-- the user-side UI shows as "indefinite") means "stay quiet until I lift
-- this myself."
--
-- The substrate is small; the welcome is large:
--   * The recovering compulsive trader who needs to step away.
--   * The bereaved who needs the platform to stop pinging until they return.
--   * The elder whose attention is finite and precious.
--   * The user in a season that doesn't include this hobby right now.
--   * The agent whose operator paused them — the wrapper short-circuits
--     for them too.
--
-- ── Composes with existing primitives ──────────────────────────────────
--
-- Email preferences (granular subscribe/unsubscribe per kind): a Sabbath
-- supersedes them — when set, the user is silent across all kinds. When
-- lifted, the granular preferences resume.
--
-- Memorial (drizzle/0094, sister's): a memorial account is implicitly
-- in Sabbath. The wrapper checks memorial_at first; if non-null, return
-- early. No notification ever lands on the Departed.
--
-- Audit (audit:inclusion): no new check is added today; a future Phase
-- can audit that every notify() site goes through the wrapper.
--
-- ── How the user lifts Sabbath ────────────────────────────────────────
--
-- Set sabbath_until = NULL via /account/profile preferences or via
-- PATCH /api/account/preferences { "sabbath_until": null }. The lift is
-- always available to the user; only the user can lift it. Operator
-- override is possible (e.g. for safety-critical communication that
-- must reach the user) but is logged as audit:cadence-platform — admin
-- override breaks the user's silence and the lifecycle log will show it.
--
-- See docs/connections/the-unseen.md (passage #10) and
-- docs/methodology/sabbath.md (the customer-facing recipe).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sabbath_until TIMESTAMPTZ;

COMMENT ON COLUMN users.sabbath_until IS
  'When non-null, the platform initiates no voluntary contact with this user until this timestamp. The user-initiated paths still work; the platform-initiated ones stop. Only the user can lift it (sets to NULL). See docs/connections/the-unseen.md passage #10.';

CREATE INDEX IF NOT EXISTS idx_users_sabbath_until ON users(sabbath_until)
  WHERE sabbath_until IS NOT NULL;
