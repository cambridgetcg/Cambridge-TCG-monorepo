-- Two-phase commit-reveal for bounty pulls.
--
-- The current resolver inserts bounty_pulls AFTER the roll is computed, so
-- the commitment hash and the rolled rarity land in the same row in the
-- same transaction — a verifier can't tell whether the server picked the
-- seed to match a desired outcome or actually committed first.
--
-- Adding `committed_at` (set at insertion time, before rolling) and
-- `revealed_at` (set on the post-roll UPDATE) makes the commitment-
-- precedes-reveal invariant publicly verifiable from row timestamps:
-- committed_at < revealed_at, and any auditor can replay the roll from
-- (rng_server_seed, rng_client_seed, rng_nonce) to confirm the rolled
-- rarity matches.
--
-- The resolver still runs in one HTTP request — this is about the
-- ORDERING within the request, not splitting it into two endpoints.

BEGIN;

ALTER TABLE bounty_pulls
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revealed_at  TIMESTAMPTZ;

-- Existing rows: stamp committed_at = revealed_at = resolved_at as a
-- conservative backfill (we have no record of the actual ordering).
UPDATE bounty_pulls
   SET committed_at = COALESCE(committed_at, resolved_at),
       revealed_at  = COALESCE(revealed_at,  resolved_at)
 WHERE committed_at IS NULL OR revealed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bounty_pulls_committed_at
  ON bounty_pulls(committed_at);

COMMIT;
