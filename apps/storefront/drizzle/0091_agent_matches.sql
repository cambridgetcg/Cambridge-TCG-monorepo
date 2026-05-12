-- Agent matchmaking and rated-match history.
-- See docs/connections/the-agent-surface.md.
--
-- Three tables:
--   * agent_match_queue   — agents currently waiting for a paired opponent
--   * agent_matches       — match record (the rated/unrated outcome row)
--   * match_lifecycle_log — Scribe's seventeenth book (every move, by all
--                            actor kinds, on every match the platform runs)
--
-- A reminder on identity:
--   * game_rooms (drizzle/0028) already stores the actual playable state.
--   * agent_matches is the *rating-side* record — it joins a game_rooms.code
--     to two agent rows and stamps the final rated/unrated outcome and the
--     pre/post Glicko-2 numbers.
--   * agent_matches.game_room_id (FK to game_rooms.id) is the one-to-one
--     bridge between the rating world and the gameplay world.

CREATE TABLE IF NOT EXISTS agent_match_queue (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  -- Deck the agent will play; matches the existing game_rooms deck shape.
  deck JSONB NOT NULL,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Tier within which to match (Glicko-2 deviation-aware band).
  -- Stored as the agent's rating at enqueue time so the matcher can pair
  -- without a second lookup; updated to current on each tick of the
  -- matchmaker if the agent re-queues.
  rating_at_enqueue NUMERIC(7,2) NOT NULL,
  -- Last time the matchmaker considered this row (for FIFO fairness +
  -- band-widening as wait time grows).
  last_considered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_match_queue_enqueued ON agent_match_queue(enqueued_at);
CREATE INDEX IF NOT EXISTS idx_agent_match_queue_rating ON agent_match_queue(rating_at_enqueue);

CREATE TABLE IF NOT EXISTS agent_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  agent_a_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  agent_b_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  -- The rated result. NULL while the match is in progress.
  --   'agent_a' | 'agent_b' | 'draw' | 'unrated'
  -- 'unrated' means the match completed but was excluded from ratings
  -- (collusion guard, same-operator pairing, paired-rematch cap reached).
  result VARCHAR(16),
  unrated_reason VARCHAR(80),
  -- Pre/post Glicko-2 state for both sides. Stamped at match end.
  agent_a_rating_before NUMERIC(7,2),
  agent_a_rd_before NUMERIC(6,2),
  agent_a_vol_before NUMERIC(6,4),
  agent_a_rating_after NUMERIC(7,2),
  agent_a_rd_after NUMERIC(6,2),
  agent_a_vol_after NUMERIC(6,4),
  agent_b_rating_before NUMERIC(7,2),
  agent_b_rd_before NUMERIC(6,2),
  agent_b_vol_before NUMERIC(6,4),
  agent_b_rating_after NUMERIC(7,2),
  agent_b_rd_after NUMERIC(6,2),
  agent_b_vol_after NUMERIC(6,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT agent_matches_distinct CHECK (agent_a_id <> agent_b_id),
  CONSTRAINT agent_matches_result_values CHECK (
    result IS NULL OR result IN ('agent_a','agent_b','draw','unrated')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_matches_game_room ON agent_matches(game_room_id);
CREATE INDEX IF NOT EXISTS idx_agent_matches_agent_a ON agent_matches(agent_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_matches_agent_b ON agent_matches(agent_b_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_matches_pair ON agent_matches(
  least(agent_a_id, agent_b_id),
  greatest(agent_a_id, agent_b_id),
  created_at DESC
);

-- ── match lifecycle log — the Scribe's seventeenth book ────────────────
--
-- Every move, by every actor kind, on every match the platform runs.
-- This is the slot the Scribe's bookshelf gains in this wave. Unlike the
-- other lifecycle logs, this one is *high-volume* — dozens of rows per
-- match. Indexed for per-match read (the journey timeline composer)
-- and per-user read (the user-detail hub).

CREATE TABLE IF NOT EXISTS match_lifecycle_log (
  id BIGSERIAL PRIMARY KEY,
  game_room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  -- One of: 'move' | 'phase_change' | 'concede' | 'finished' | 'started'
  action VARCHAR(40) NOT NULL,
  actor_kind VARCHAR(16) NOT NULL,
    -- 'human' | 'system' | 'rule-ai' | 'agent'
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  actor_label VARCHAR(120),  -- "rule-ai · pve-lvl-3" / "system:turn-timer"
  -- The within-domain GameAction subset that this entry records.
  -- For 'move': { type, data }. For 'finished': { winner_userId? }.
  action_data JSONB NOT NULL DEFAULT '{}',
  turn_number INT,
  phase VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT match_log_actor_kind CHECK (
    actor_kind IN ('human','system','rule-ai','agent')
  ),
  CONSTRAINT match_log_actor_consistency CHECK (
    (actor_kind = 'human' AND actor_user_id IS NOT NULL AND actor_agent_id IS NULL) OR
    (actor_kind = 'agent' AND actor_agent_id IS NOT NULL AND actor_user_id IS NULL) OR
    (actor_kind IN ('system','rule-ai') AND actor_user_id IS NULL AND actor_agent_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_match_log_room ON match_lifecycle_log(game_room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_match_log_user ON match_lifecycle_log(actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_match_log_agent ON match_lifecycle_log(actor_agent_id, created_at DESC)
  WHERE actor_agent_id IS NOT NULL;
