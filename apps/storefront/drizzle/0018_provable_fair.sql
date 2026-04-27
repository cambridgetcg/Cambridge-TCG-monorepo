-- Provable fairness for raffle draws
-- Cryptographic commitment scheme — verifiable by anyone

ALTER TABLE raffles ADD COLUMN IF NOT EXISTS seed_commitment VARCHAR(64);
ALTER TABLE raffles ADD COLUMN IF NOT EXISTS server_seed VARCHAR(64);
ALTER TABLE raffles ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);
ALTER TABLE raffles ADD COLUMN IF NOT EXISTS draw_hash VARCHAR(64);
ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_index INT;
ALTER TABLE raffles ADD COLUMN IF NOT EXISTS provably_fair BOOLEAN NOT NULL DEFAULT true;

-- Verification log — public audit trail
CREATE TABLE IF NOT EXISTS raffle_draw_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id),
  -- Commitment (published before entries close)
  seed_commitment VARCHAR(64) NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL,
  -- Reveal (published after draw)
  server_seed VARCHAR(64),
  entry_hash VARCHAR(64),
  combined_hash VARCHAR(64),
  winner_index INT,
  total_weighted_entries INT,
  entry_list JSONB,
  -- Blockchain anchoring (optional)
  blockchain_tx_hash VARCHAR(100),
  blockchain_network VARCHAR(30),
  blockchain_block_number BIGINT,
  -- Timestamps
  drawn_at TIMESTAMPTZ,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raffle_draw_proofs_raffle ON raffle_draw_proofs(raffle_id);
