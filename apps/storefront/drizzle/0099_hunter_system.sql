-- The Hunter System — Solo Leveling's System + HxH's Nen
-- Migration 0099: hunter_profiles, daily_quests, dungeon_instances
--
-- Every player and agent has a hunter_profile: level, XP, rank, and Nen
-- type. Daily quests reset at midnight (Solo Leveling's core loop). Dungeon
-- instances are gated by rank (Solo Leveling's gates).
--
-- The substrate is honest: the System window shows real numbers. Nen type
-- is determined by the Water Divination test (see packages/hunter). Rank
-- advancement requires real XP thresholds. Nothing is decorative.

-- Hunter profiles — one per player or agent
CREATE TABLE IF NOT EXISTS hunter_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who this profile belongs to
  actor_id UUID NOT NULL,           -- references users(id) or agents(id)
  actor_kind VARCHAR(10) NOT NULL DEFAULT 'player', -- 'player' | 'agent'
  UNIQUE(actor_id, actor_kind),

  -- The System (Solo Leveling)
  level INT NOT NULL DEFAULT 1,
  xp BIGINT NOT NULL DEFAULT 0,
  rank VARCHAR(20) NOT NULL DEFAULT 'E', -- E, D, C, B, A, S, National, Monarch

  -- Nen (Hunter x Hunter)
  nen_type VARCHAR(20),             -- null until Water Divination test
  nen_techniques TEXT[] NOT NULL DEFAULT '{}', -- unlocked techniques: Ten, Ren, Ken, En, Shu, Gyo, In, Ko
  aura_output INT NOT NULL DEFAULT 0, -- 0-100
  aura_range REAL NOT NULL DEFAULT 0,  -- meters of En coverage

  -- Hatsu abilities (JSONB array of registered abilities)
  hatsu JSONB NOT NULL DEFAULT '[]',

  -- Stats
  matches_played INT NOT NULL DEFAULT 0,
  matches_won INT NOT NULL DEFAULT 0,
  quests_completed INT NOT NULL DEFAULT 0,
  dungeons_cleared INT NOT NULL DEFAULT 0,

  -- Water Divination test answers (stored for re-verification)
  divination_signals JSONB,

  -- Lifecycle
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure rank is valid
  CONSTRAINT hunter_rank_valid CHECK (
    rank IN ('E', 'D', 'C', 'B', 'A', 'S', 'National', 'Monarch')
  ),
  CONSTRAINT hunter_nen_type_valid CHECK (
    nen_type IS NULL OR nen_type IN (
      'Enhancer', 'Transmuter', 'Conjurer', 'Emitter', 'Manipulator', 'Specialist'
    )
  ),
  CONSTRAINT hunter_aura_output_range CHECK (aura_output >= 0 AND aura_output <= 100)
);

-- Daily quests — reset daily, one set per hunter
CREATE TABLE IF NOT EXISTS daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_profile_id UUID NOT NULL REFERENCES hunter_profiles(id) ON DELETE CASCADE,
  quest_type VARCHAR(20) NOT NULL, -- match, trade, list, social, learn, collect, battle, daily
  description TEXT NOT NULL,
  xp_reward INT NOT NULL,
  target INT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  -- Solo Leveling: quests expire daily
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dq_type_valid CHECK (
    quest_type IN ('match', 'trade', 'list', 'social', 'learn', 'collect', 'battle', 'daily')
  )
);

CREATE INDEX IF NOT EXISTS dq_active_idx ON daily_quests(hunter_profile_id)
  WHERE completed = false;

-- Dungeon instances — Solo Leveling's gates
CREATE TABLE IF NOT EXISTS dungeon_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier VARCHAR(5) NOT NULL,         -- E, D, C, B, A, S, Red
  name VARCHAR(120) NOT NULL,
  description TEXT,
  min_rank VARCHAR(20) NOT NULL DEFAULT 'E',
  xp_reward INT NOT NULL,
  participants UUID[] NOT NULL DEFAULT '{}', -- actor IDs
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open, active, cleared, failed
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,

  CONSTRAINT dungeon_tier_valid CHECK (tier IN ('E', 'D', 'C', 'B', 'A', 'S', 'Red')),
  CONSTRAINT dungeon_status_valid CHECK (status IN ('open', 'active', 'cleared', 'failed')),
  CONSTRAINT dungeon_min_rank_valid CHECK (
    min_rank IN ('E', 'D', 'C', 'B', 'A', 'S', 'National', 'Monarch')
  )
);

-- XP ledger — every XP gain is recorded (substrate honesty)
CREATE TABLE IF NOT EXISTS xp_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_profile_id UUID NOT NULL REFERENCES hunter_profiles(id) ON DELETE CASCADE,
  amount INT NOT NULL,             -- positive = gain, negative = loss
  source VARCHAR(40) NOT NULL,     -- quest, match, dungeon, trade, admin
  source_id VARCHAR(80),            -- quest ID, match ID, dungeon ID, etc.
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT xp_amount_nonzero CHECK (amount != 0)
);

CREATE INDEX IF NOT EXISTS xp_ledger_profile_idx ON xp_ledger(hunter_profile_id, created_at DESC);

-- Comment: the System is honest
COMMENT ON TABLE hunter_profiles IS
  'The Hunter System — Solo Leveling''s System + HxH''s Nen. Every player/agent has level, XP, rank, and Nen type. The System window shows real numbers. Arise.';
COMMENT ON TABLE daily_quests IS
  'Daily quests — Solo Leveling''s core engagement loop. Reset daily. The System assigns them automatically.';
COMMENT ON TABLE dungeon_instances IS
  'Dungeon instances — Solo Leveling''s gates. Rank-gated instanced challenges with XP rewards.';
COMMENT ON TABLE xp_ledger IS
  'XP ledger — every XP gain/loss recorded. Substrate honesty: the System window can be verified against this ledger.';