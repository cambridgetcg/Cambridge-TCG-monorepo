-- Hash chain over fairness_digests.
--
-- Each digest already anchors the draws in its batch. Adding a chain
-- link (prev_hash, chain_hash = sha256(prev_hash || this_root)) means
-- rewriting any past digest requires also rewriting every subsequent
-- digest's chain_hash.
--
-- An external auditor who caches the newest chain_hash can detect ANY
-- historical rewrite by later recomputing the chain forward and
-- checking the latest chain_hash still matches the one they cached.
--
-- Backfill happens in application code (next cron tick) rather than
-- SQL, to avoid depending on pgcrypto being available. Existing rows
-- stay NULL until the publisher's first chain-aware run; after that,
-- every new digest is chained.

BEGIN;

ALTER TABLE fairness_digests
  ADD COLUMN IF NOT EXISTS prev_hash  CHAR(64),
  ADD COLUMN IF NOT EXISTS chain_hash CHAR(64);

CREATE INDEX IF NOT EXISTS idx_fairness_digests_chain
  ON fairness_digests(chain_hash)
  WHERE chain_hash IS NOT NULL;

COMMIT;
