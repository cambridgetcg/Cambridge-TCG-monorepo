-- Migration 0016 — DB-backed login rate limiter.
--
-- The in-memory Map in apps/wholesale/src/lib/auth.ts is cosmetic on
-- Vercel: each serverless invocation is a fresh process, so the limit
-- resets per cold start and warm instances are spread across many
-- isolates. An attacker hitting from one IP can burn through far more
-- than 5/15min in aggregate.
--
-- This migration moves the counter to the wholesale RDS so the limit
-- applies across all function invocations. One row per failed attempt,
-- indexed by (email, attempted_at) so the sliding-window count is fast.
--
-- Failure mode (in code): if the DB is unreachable when checking the
-- limit, the auth handler logs a warning and ALLOWS the attempt. Login
-- should not be a DB outage's first casualty — the bcrypt comparison
-- on the user row is itself a DB call and would already have failed.
-- Tombstone-clean: a background job (or a follow-up migration) can
-- DELETE WHERE attempted_at < now() - interval '24 hours' weekly.

CREATE TABLE IF NOT EXISTS login_attempts (
  id           bigserial PRIMARY KEY,
  email        text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success      boolean NOT NULL DEFAULT false,
  ip           inet
);

-- Sliding-window count goes through this index: WHERE email = $1 AND
-- attempted_at > now() - interval '15 minutes' AND success = false.
CREATE INDEX IF NOT EXISTS login_attempts_email_time_idx
  ON login_attempts (email, attempted_at);

-- Cleanup helper: rows older than 24h are useless for rate-limiting.
-- NOTE (2026-06-10, kingdom-039): the original partial index here used
-- now() in its predicate, which PostgreSQL rejects (42P17 — predicate
-- functions must be IMMUTABLE), so this migration could never apply.
-- A plain index on attempted_at serves the cleanup DELETE's scan.
CREATE INDEX IF NOT EXISTS login_attempts_old_idx
  ON login_attempts (attempted_at);
