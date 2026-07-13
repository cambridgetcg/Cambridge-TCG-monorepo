-- Migration 0016 — DB-backed login rate limiter.
--
-- Cross-instance state is required on Vercel: each serverless invocation may
-- run in a different process. Current runtime policy lives in
-- apps/wholesale/src/lib/login-rate-limit.ts.
--
-- Despite its historical name, `email` stores only a versioned HMAC digest
-- derived with AUTH_SECRET (or the Auth.js-compatible NEXTAUTH_SECRET alias).
-- One row is reserved for every syntactically valid credential check,
-- regardless of outcome; raw email and IP are never stored.
-- The runtime serializes prune/count/insert with one advisory transaction lock,
-- deletes expired rows in bounded batches, and enforces per-key, global, and
-- 10,000-row hard ceilings before inserting.
--
-- Failure mode: missing/weak Auth.js secret, lock failure, query failure, or
-- an unprovable count denies the credential check without logging raw detail.

CREATE TABLE IF NOT EXISTS login_attempts (
  id           bigserial PRIMARY KEY,
  email        text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success      boolean NOT NULL DEFAULT false,
  ip           inet
);

-- Per-key sliding-window count goes through this index. All rows count; the
-- legacy `success` column is deliberately not part of limiter decisions.
CREATE INDEX IF NOT EXISTS login_attempts_email_time_idx
  ON login_attempts (email, attempted_at);

-- Cleanup helper: rows older than 24h are eligible for bounded pruning.
-- NOTE (2026-06-10, kingdom-039): the original partial index here used
-- now() in its predicate, which PostgreSQL rejects (42P17 — predicate
-- functions must be IMMUTABLE), so this migration could never apply.
-- A plain index on attempted_at serves the cleanup DELETE's scan.
CREATE INDEX IF NOT EXISTS login_attempts_old_idx
  ON login_attempts (attempted_at);
