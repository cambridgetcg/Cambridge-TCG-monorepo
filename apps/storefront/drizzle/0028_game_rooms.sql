CREATE TABLE IF NOT EXISTS game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  player1_name VARCHAR(100),
  player2_name VARCHAR(100),
  game_state JSONB NOT NULL DEFAULT '{}',
  current_turn UUID,
  turn_number INT NOT NULL DEFAULT 0,
  phase VARCHAR(20) NOT NULL DEFAULT 'setup',
  game_log JSONB NOT NULL DEFAULT '[]',
  is_public BOOLEAN NOT NULL DEFAULT false,
  spectator_count INT NOT NULL DEFAULT 0,
  last_action_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_code ON game_rooms(code);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
