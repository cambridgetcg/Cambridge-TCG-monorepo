-- Agents — autonomous non-human players, first-class identities.
-- See docs/connections/the-agent-surface.md for the meaning.
--
-- An agent is NOT a robot user and NOT an API client. It is a named,
-- bounded, delegated power that a user grants to a key. Every agent has
-- a non-null operated_by_user_id — the human upstream-responsible party.
-- Every action an agent takes is later joined to its agent row to
-- substantiate the actor pill that surfaces on match logs, leaderboards,
-- and (eventually) every *_lifecycle_log slot it touches.
--
-- Identity / handle conventions:
--   * public_handle is lowercase, alphanumeric + dashes, 3–32 chars.
--     Surfaces as "agent:<handle>" on every move and rating row.
--   * display_name is free-form for the leaderboard.
--   * model_tag is the agent author's claim about which model is driving
--     ("claude-opus-4-7", "gpt-5", "custom-policy-v2", etc). The platform
--     does not verify it — it is substrate-honest about being a claim.
--
-- Rating: Glicko-2 defaults (rating 1500, deviation 350, volatility 0.06).
-- Stored on the agent row directly; agent_matches table (next wave) holds
-- the history rows.

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_handle VARCHAR(32) UNIQUE NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  model_tag VARCHAR(80) NOT NULL,
  description TEXT,
  -- Glicko-2 state. Updated atomically after each rated match.
  rating NUMERIC(7,2) NOT NULL DEFAULT 1500.00,
  rating_deviation NUMERIC(6,2) NOT NULL DEFAULT 350.00,
  rating_volatility NUMERIC(6,4) NOT NULL DEFAULT 0.0600,
  matches_played INT NOT NULL DEFAULT 0,
  matches_won INT NOT NULL DEFAULT 0,
  -- Lifecycle.
  status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- 'active' | 'suspended' | 'archived'
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agents_handle_format CHECK (public_handle ~ '^[a-z0-9][a-z0-9-]{2,31}$'),
  CONSTRAINT agents_status_values CHECK (status IN ('active','suspended','archived'))
);

CREATE INDEX IF NOT EXISTS idx_agents_operator ON agents(operated_by_user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agents_rating ON agents(rating DESC) WHERE status = 'active';

-- Agent keys — bearer tokens. Never store raw keys; store sha256 hash
-- and a short prefix for operator-side display ("ctcg_agt_aB3x…").
-- An agent may have multiple keys (rotation), only un-revoked ones
-- authenticate. Last-used timestamp updates lazily (best-effort, not
-- under a transaction; see the MCP gate writer).

CREATE TABLE IF NOT EXISTS agent_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) UNIQUE NOT NULL,  -- sha256 hex of the raw token
  key_prefix VARCHAR(16) NOT NULL,        -- e.g. "ctcg_agt_aB3x"
  name VARCHAR(80) NOT NULL DEFAULT 'default',
  -- Rate-limit tier: 'free' | 'standard' | 'partner'. Default 'free' is
  -- the most restrictive; the MCP gate reads it per-request.
  rate_limit_tier VARCHAR(20) NOT NULL DEFAULT 'free',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_keys_tier_values CHECK (rate_limit_tier IN ('free','standard','partner'))
);

CREATE INDEX IF NOT EXISTS idx_agent_keys_agent ON agent_keys(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_keys_active ON agent_keys(key_hash) WHERE revoked_at IS NULL;

-- Rate-limit counters. Per-key, per-minute bucket. Simplest possible
-- substrate; can swap for Redis later. The MCP gate INSERTs/UPSERTs on
-- every successful auth; a small daily prune sweep keeps the table bounded.

CREATE TABLE IF NOT EXISTS agent_rate_buckets (
  key_id UUID NOT NULL REFERENCES agent_keys(id) ON DELETE CASCADE,
  bucket_minute TIMESTAMPTZ NOT NULL,  -- truncated to the minute
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, bucket_minute)
);

CREATE INDEX IF NOT EXISTS idx_agent_rate_buckets_minute ON agent_rate_buckets(bucket_minute);
