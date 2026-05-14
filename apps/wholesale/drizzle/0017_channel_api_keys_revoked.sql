-- Migration 0017 — channel_api_keys.revoked_at for soft-delete revocation.
--
-- Today the only way to disable a partner key is `DELETE FROM
-- channel_api_keys WHERE …`, which orphans audit trails and makes
-- forensic questions ("was this key live on 2026-03-14?") unanswerable.
-- This migration adds a nullable revoked_at timestamptz so revocation
-- becomes an append (UPDATE … SET revoked_at = now()) rather than a
-- destructive delete.
--
-- authenticateApiKey() in src/app/api/v1/auth.ts will be updated in the
-- same commit to filter WHERE revoked_at IS NULL — revoked keys stop
-- working immediately but their row + lastUsedAt history survives.

ALTER TABLE channel_api_keys
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- Partial index: only live keys are checked at auth-time. The query in
-- authenticateApiKey is `WHERE key_hash = $1 AND revoked_at IS NULL`
-- so this index is the lookup path.
CREATE INDEX IF NOT EXISTS channel_api_keys_live_idx
  ON channel_api_keys (key_hash)
  WHERE revoked_at IS NULL;
