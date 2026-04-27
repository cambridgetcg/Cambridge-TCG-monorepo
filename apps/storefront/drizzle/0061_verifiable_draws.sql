-- Unified commit-reveal audit table for any weighted-draw surface.
--
-- Today we have 4 surfaces that pick a random outcome with stated
-- weights: bounty pulls (provably fair), raffles (partially), pack
-- openings (Math.random), spin wheel (Math.random), mystery boxes
-- (Math.random). Bounty pulls keep their own bounty_pulls table (too
-- much surface-specific data to fold in); the other three graduate to
-- this shared schema so they all get the same /verify/draw/[id] view
-- and the same certificate+fairness surface as bounty pulls.
--
-- Kind-agnostic: `kind` distinguishes surface, `outcome` is an opaque
-- JSONB blob the surface can shape as it pleases, `weights` is the
-- weights at the time of draw so a late-replay reproduces the same
-- result even if admin has since tuned them.

BEGIN;

CREATE TABLE IF NOT EXISTS verifiable_draws (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Surface discriminator: 'pack_open' | 'spin_wheel' | 'mystery_box' | 'raffle_draw' | 'custom'
  kind              VARCHAR(30) NOT NULL,

  -- Optional back-reference to the kind-specific row (e.g. pack_opens.id,
  -- spin_results.id). Opaque string — this table doesn't FK into
  -- anything surface-specific.
  subject_id        VARCHAR(64),

  -- Owner (for per-user history + auth scoping when exposing privately).
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Commit-reveal cryptographic inputs ------------------------------
  commitment        CHAR(64) NOT NULL,           -- sha256(server_seed)
  server_seed       CHAR(64),                    -- revealed after reveal
  client_seed       VARCHAR(200) NOT NULL,       -- `${userId}:${suffix}` or similar
  nonce             BIGINT NOT NULL,

  -- Draw inputs at commit time --------------------------------------
  weights           JSONB NOT NULL,              -- { key: number, ... }
  num_slots         INT NOT NULL DEFAULT 1,      -- 1 for singles; N for packs

  -- Draw outputs after reveal --------------------------------------
  -- outcome: surface-shaped blob; for a single-slot surface, likely
  -- { picked: "rarity_key", roll: 0.1234 }. For a pack:
  -- { slots: [{ picked, roll }, ...] }. Always enough to reconstruct
  -- the verification from (server_seed, client_seed, nonce, weights).
  outcome           JSONB,

  -- Timestamps make commit < reveal orderly verifiable --------------
  committed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revealed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_verifiable_draws_kind_time
  ON verifiable_draws(kind, revealed_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifiable_draws_user
  ON verifiable_draws(user_id, revealed_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifiable_draws_subject
  ON verifiable_draws(kind, subject_id);

-- For the aggregate fairness dashboard: `outcome->>'picked'` indexed
-- so we can group by it cheaply. Functional index, partial to revealed
-- rows only (committed-but-unrevealed rows don't have an outcome yet).
CREATE INDEX IF NOT EXISTS idx_verifiable_draws_outcome_picked
  ON verifiable_draws(kind, (outcome->>'picked'))
  WHERE revealed_at IS NOT NULL;

COMMIT;
