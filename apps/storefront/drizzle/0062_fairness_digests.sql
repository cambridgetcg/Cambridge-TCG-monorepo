-- Public tamper-evidence layer for provably-fair draws.
--
-- Commit-reveal proves the server didn't pick the seed after the fact,
-- but only if you trust our DB hasn't been rewritten. A motivated
-- attacker with write access could edit a bounty_pulls row and fake the
-- entire proof after the fact — no external observer would know.
--
-- Rolling Merkle digest fixes that: every N minutes a cron takes all
-- undigested draws (bounty_pulls + verifiable_draws), builds a Merkle
-- tree over their per-draw proof leaves, and publishes the root. Once
-- a root is published it is immutable — editing any leaf changes the
-- root, detectable to anyone who cached it. Third parties can snapshot
-- the root feed and compare later.
--
-- Each draw gets its merkle_digest_id + leaf_index stamped so the
-- verifier can reconstruct the inclusion proof (log2(N) sibling hashes)
-- in one query.

BEGIN;

CREATE TABLE IF NOT EXISTS fairness_digests (
  id             BIGSERIAL PRIMARY KEY,
  root           CHAR(64) NOT NULL,          -- hex sha256 of Merkle root
  leaf_count     INT NOT NULL,
  -- JSON array of leaf hashes, ordered. Enables reconstructing the
  -- inclusion path client-side without a separate lookup per level.
  -- For tiny digests this is cheap; the cron caps batch size so the
  -- leaf array stays bounded.
  leaves         JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Window covered — informational for the public feed page.
  window_from    TIMESTAMPTZ NOT NULL,
  window_to      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fairness_digests_created
  ON fairness_digests(created_at DESC);

-- Add per-draw back-references so the verifier can locate its digest
-- and leaf index in one indexed lookup. Nullable because draws
-- pre-date the digest cron until the next tick picks them up.
ALTER TABLE verifiable_draws
  ADD COLUMN IF NOT EXISTS merkle_digest_id BIGINT REFERENCES fairness_digests(id),
  ADD COLUMN IF NOT EXISTS merkle_leaf_index INT;

ALTER TABLE bounty_pulls
  ADD COLUMN IF NOT EXISTS merkle_digest_id BIGINT REFERENCES fairness_digests(id),
  ADD COLUMN IF NOT EXISTS merkle_leaf_index INT;

-- Partial indexes for the cron's "undigested draws" query — it looks
-- for revealed rows with NULL merkle_digest_id, so we index that subset.
CREATE INDEX IF NOT EXISTS idx_verifiable_draws_undigested
  ON verifiable_draws(revealed_at)
  WHERE revealed_at IS NOT NULL AND merkle_digest_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_bounty_pulls_undigested
  ON bounty_pulls(revealed_at)
  WHERE revealed_at IS NOT NULL AND merkle_digest_id IS NULL;

COMMIT;
