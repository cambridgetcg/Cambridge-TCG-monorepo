-- Migration 0018 — per-API-key rate limiting.
--
-- Each channel_api_keys row gains a requests_per_minute integer
-- (default 60). authenticateApiKey() counts requests in a sliding
-- 60-second window via api_key_usage; if the count exceeds the limit,
-- the request is rejected with 429.
--
-- Failure mode (in code): if the DB count query fails, the limiter
-- fails OPEN — we allow the request and log a warning. The platform's
-- read path shouldn't 429 because the rate-limiter table is sick.
--
-- Cleanup: api_key_usage grows unboundedly without it. A weekly cron
-- can DELETE WHERE used_at < now() - interval '1 hour'; the index
-- below makes that scan cheap.

ALTER TABLE channel_api_keys
  ADD COLUMN IF NOT EXISTS requests_per_minute integer NOT NULL DEFAULT 60;

CREATE TABLE IF NOT EXISTS api_key_usage (
  id          bigserial PRIMARY KEY,
  api_key_id  integer NOT NULL REFERENCES channel_api_keys(id) ON DELETE CASCADE,
  used_at     timestamptz NOT NULL DEFAULT now(),
  path        text,
  status      integer
);

-- Hot path: count usage rows in the last 60 seconds for one key.
CREATE INDEX IF NOT EXISTS api_key_usage_key_time_idx
  ON api_key_usage (api_key_id, used_at);

-- Cleanup helper index.
-- NOTE (2026-06-10, kingdom-039): the original partial index here used
-- now() in its predicate, which PostgreSQL rejects (42P17 — predicate
-- functions must be IMMUTABLE), so this migration could never apply.
-- A plain index on used_at serves the cleanup DELETE's scan.
CREATE INDEX IF NOT EXISTS api_key_usage_old_idx
  ON api_key_usage (used_at);
