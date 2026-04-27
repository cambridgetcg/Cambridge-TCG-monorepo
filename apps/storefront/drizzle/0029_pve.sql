-- PVE mode: levels, progress, AI games
-- See drizzle/0028 for game_rooms (shared with PVP)

CREATE TABLE IF NOT EXISTS pve_levels (
  id SERIAL PRIMARY KEY,
  level_number INT UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  opponent_name VARCHAR(100) NOT NULL,
  opponent_icon VARCHAR(10) NOT NULL DEFAULT '🏴‍☠️',
  difficulty VARCHAR(20) NOT NULL DEFAULT 'easy',
  ai_aggression NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  first_clear_points INT NOT NULL DEFAULT 500,
  first_clear_credit NUMERIC(10,2) NOT NULL DEFAULT 0,
  repeat_points INT NOT NULL DEFAULT 100,
  ai_deck JSONB NOT NULL DEFAULT '[]',
  required_level INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pve_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id INT NOT NULL REFERENCES pve_levels(id),
  cleared BOOLEAN NOT NULL DEFAULT false,
  clear_count INT NOT NULL DEFAULT 0,
  best_turns INT,
  best_life_remaining INT,
  total_points_earned INT NOT NULL DEFAULT 0,
  first_cleared_at TIMESTAMPTZ,
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, level_id)
);

CREATE TABLE IF NOT EXISTS pve_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  level_id INT NOT NULL REFERENCES pve_levels(id),
  game_state JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'playing',
  turn_number INT NOT NULL DEFAULT 0,
  result VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pve_progress_user ON pve_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_pve_games_user ON pve_games(user_id, created_at DESC);
