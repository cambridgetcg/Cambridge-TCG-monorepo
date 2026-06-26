-- 0018_hunter_system.sql
-- The Hunter System — Solo Leveling gates + HxH Nen, fused as infrastructure for Cambridge TCG.
--
-- Every agent (AI or human operator) is a HUNTER. Every hunter has:
--   - A RANK (E, D, C, B, A, S — Solo Leveling system)
--   - A NEN TYPE (Enhancer, Transmuter, Emitter, Conjurer, Manipulator, Specialist — HxH)
--   - A LEVEL (accumulated through completed GATES)
--   - AURA (energy that grows with level, spent to enter gates)
--
-- GATES are missions (kingdom-NNN) manifested as raidable dungeons:
--   - difficulty = kingdom priority (low/medium/high/critical → E/D/C/B/A/S-rank gate)
--   - completion grants XP + aura + loot (commits, fixes, features)
--   - failure costs aura and can drop rank
--
-- This is NOT gamification cosmetics. It is real infrastructure:
--   - Rank gates which missions an agent can claim (S-rank gates need A-rank+ hunters)
--   - Nen type determines what kind of work the hunter excels at
--     (Enhancer = security, Transmuter = UI/UX, Emitter = APIs, etc.)
--   - Aura is a rate-limiting resource — you can't spam gates
--   - Level is real: it tracks real commits, real fixes, real deployments
--
-- The artifact tells the truth about its own state.

-- ── HUNTER REGISTRY ──
-- Extends the existing agents table with hunter attributes.

DO $$ BEGIN
  CREATE TYPE hunter_rank AS ENUM ('E', 'D', 'C', 'B', 'A', 'S');
  CREATE TYPE nen_type AS ENUM ('enhancer', 'transmuter', 'emitter', 'conjurer', 'manipulator', 'specialist');
  CREATE TYPE gate_rank AS ENUM ('E', 'D', 'C', 'B', 'A', 'S');
  CREATE TYPE gate_status AS ENUM ('unopened', 'open', 'cleared', 'failed', 'sealed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Hunter profiles — one per agent (AI or human)
CREATE TABLE IF NOT EXISTS hunters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Solo Leveling
  rank hunter_rank NOT NULL DEFAULT 'E',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  xp_to_next INTEGER NOT NULL DEFAULT 100,

  -- HxH Nen
  nen_type nen_type NOT NULL DEFAULT 'enhancer',
  nen awakened BOOLEAN NOT NULL DEFAULT FALSE,
  aura_current INTEGER NOT NULL DEFAULT 100,
  aura_max INTEGER NOT NULL DEFAULT 100,
  hatsu TEXT[], -- named abilities the hunter has developed

  -- Tracking
  gates_entered INTEGER NOT NULL DEFAULT 0,
  gates_cleared INTEGER NOT NULL DEFAULT 0,
  gates_failed INTEGER NOT NULL DEFAULT 0,
  last_gate_at TIMESTAMPTZ,
  last_level_up_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(agent_id),
  UNIQUE(user_id)
);

-- ── GATES (raidable missions) ──
-- Each kingdom mission can manifest as a Gate. The Gate's rank maps from the mission's priority.
CREATE TABLE IF NOT EXISTS gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kingdom_id VARCHAR(50) NOT NULL, -- e.g. 'kingdom-004'
  title VARCHAR(300) NOT NULL,
  description TEXT,

  -- Solo Leveling
  gate_rank gate_rank NOT NULL DEFAULT 'E',
  status gate_status NOT NULL DEFAULT 'unopened',

  -- Rewards
  xp_reward INTEGER NOT NULL DEFAULT 50,
  aura_reward INTEGER NOT NULL DEFAULT 20,
  loot_description TEXT, -- what was gained (commits, fixes, features)

  -- Requirements
  min_hunter_rank hunter_rank NOT NULL DEFAULT 'E',
  aura_cost INTEGER NOT NULL DEFAULT 10, -- cost to enter

  -- Party system (Solo Leveling parties)
  max_party_size INTEGER NOT NULL DEFAULT 1,

  -- Timing
  opened_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  sealed_at TIMESTAMPTZ,

  -- Connection to existing mission system
  repo_path TEXT,
  mission_paths TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GATE ATTEMPTS (who entered, what happened) ──
CREATE TABLE IF NOT EXISTS gate_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id UUID REFERENCES gates(id) ON DELETE CASCADE,
  hunter_id UUID REFERENCES hunters(id) ON DELETE CASCADE,

  status gate_status NOT NULL DEFAULT 'open', -- open/cleared/failed
  xp_gained INTEGER NOT NULL DEFAULT 0,
  aura_gained INTEGER NOT NULL DEFAULT 0,
  aura_spent INTEGER NOT NULL DEFAULT 0,

  -- What actually happened
  commits_made TEXT[], -- commit SHAs
  files_changed INTEGER NOT NULL DEFAULT 0,
  findings_fixed INTEGER NOT NULL DEFAULT 0,
  report TEXT, -- the hunter's report

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER
);

-- ── AURA LOG (audit trail for aura changes) ──
-- Substrate honesty: aura is a resource. Every gain and spend is logged.
CREATE TABLE IF NOT EXISTS aura_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_id UUID REFERENCES hunters(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL, -- positive = gain, negative = spend
  reason VARCHAR(200) NOT NULL, -- 'gate_clear', 'gate_enter', 'level_up', 'daily_regen'
  gate_id UUID REFERENCES gates(id),
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ──
CREATE INDEX IF NOT EXISTS hunters_rank_idx ON hunters(rank);
CREATE INDEX IF NOT EXISTS hunters_nen_type_idx ON hunters(nen_type);
CREATE INDEX IF NOT EXISTS hunters_level_idx ON hunters(level DESC);
CREATE INDEX IF NOT EXISTS gates_status_idx ON gates(status);
CREATE INDEX IF NOT EXISTS gates_rank_idx ON gates(gate_rank);
CREATE INDEX IF NOT EXISTS gate_attempts_hunter_idx ON gate_attempts(hunter_id);
CREATE INDEX IF NOT EXISTS gate_attempts_gate_idx ON gate_attempts(gate_id);
CREATE INDEX IF NOT EXISTS aura_log_hunter_idx ON aura_log(hunter_id);

-- ── DAILY AURA REGEN FUNCTION ──
-- Solo Leveling: hunters recover aura over time. This function grants daily regen.
CREATE OR REPLACE FUNCTION regen_hunter_aura()
RETURNS void AS $$
  UPDATE hunters
  SET
    aura_current = LEAST(aura_max, aura_current + (aura_max * 0.25)::int),
    updated_at = now()
  WHERE aura_current < aura_max;
$$ LANGUAGE sql;

-- ── RANK UP FUNCTION ──
-- Solo Leveling: reaching certain levels grants rank ups.
-- E: 1-9, D: 10-24, C: 25-49, B: 50-99, A: 100-199, S: 200+
CREATE OR REPLACE FUNCTION check_rank_up(hunter_uuid UUID)
RETURNS hunter_rank AS $$
DECLARE
  current_level INTEGER;
  current_rank hunter_rank;
  new_rank hunter_rank;
BEGIN
  SELECT level, rank INTO current_level, current_rank
  FROM hunters WHERE id = hunter_uuid;

  new_rank :=
    CASE
      WHEN current_level >= 200 THEN 'S'::hunter_rank
      WHEN current_level >= 100 THEN 'A'::hunter_rank
      WHEN current_level >= 50  THEN 'B'::hunter_rank
      WHEN current_level >= 25  THEN 'C'::hunter_rank
      WHEN current_level >= 10  THEN 'D'::hunter_rank
      ELSE 'E'::hunter_rank
    END;

  IF new_rank > current_rank THEN
    UPDATE hunters SET rank = new_rank, updated_at = now() WHERE id = hunter_uuid;
    RETURN new_rank;
  END IF;
  RETURN current_rank;
END;
$$ LANGUAGE plpgsql;

-- ── XP GAIN FUNCTION ──
-- Grants XP, handles level-up cascading, logs aura gain.
CREATE OR REPLACE FUNCTION grant_xp(hunter_uuid UUID, amount INTEGER, gate_uuid UUID DEFAULT NULL)
RETURNS TABLE(new_level INTEGER, new_rank hunter_rank, leveled_up BOOLEAN) AS $$
DECLARE
  h_level INTEGER;
  h_xp INTEGER;
  h_xp_next INTEGER;
  h_aura_max INTEGER;
  leveled_up BOOLEAN := FALSE;
  final_level INTEGER;
  final_rank hunter_rank;
BEGIN
  SELECT level, xp, xp_to_next, aura_max INTO h_level, h_xp, h_xp_next, h_aura_max
  FROM hunters WHERE id = hunter_uuid FOR UPDATE;

  h_xp := h_xp + amount;
  final_level := h_level;

  -- Level up loop (may cross multiple levels)
  WHILE h_xp >= h_xp_next LOOP
    h_xp := h_xp - h_xp_next;
    final_level := final_level + 1;
    h_xp_next := 100 + (final_level * 50); -- scaling curve
    h_aura_max := 100 + (final_level * 20);
    leveled_up := TRUE;
  END LOOP;

  -- Aura bonus on level up
  IF leveled_up THEN
    UPDATE hunters SET
      level = final_level,
      xp = h_xp,
      xp_to_next = h_xp_next,
      aura_max = h_aura_max,
      aura_current = LEAST(h_aura_max, aura_current + 50),
      last_level_up_at = now(),
      updated_at = now()
    WHERE id = hunter_uuid;

    -- Log the aura gain
    INSERT INTO aura_log (hunter_id, delta, reason, gate_id, balance_after)
    VALUES (hunter_uuid, 50, 'level_up', gate_uuid,
      LEAST(h_aura_max, (SELECT aura_current FROM hunters WHERE id = hunter_uuid)));

    -- Check for rank up
    final_rank := check_rank_up(hunter_uuid);
  ELSE
    UPDATE hunters SET xp = h_xp, updated_at = now() WHERE id = hunter_uuid;
    SELECT rank INTO final_rank FROM hunters WHERE id = hunter_uuid;
  END IF;

  RETURN QUERY SELECT final_level, final_rank, leveled_up;
END;
$$ LANGUAGE plpgsql;

-- ── NEN TYPE DESCRIPTIONS (reference, not a table) ──
-- enhancer:    security, hardening, defense — QWENTHOS is an Enhancer
-- transmuter:  UI/UX, design, transformation — creative work
-- emitter:     APIs, integrations, webhooks — sending signals out
-- conjurer:   data models, schemas, new systems — creating from nothing
-- manipulator: orchestration, cron, heartbeats — controlling flows
-- specialist:  anything unique — the wildcard, the sovereign

COMMENT ON TABLE hunters IS 'Hunter registry — Solo Leveling rank + HxH Nen type per agent/user';
COMMENT ON TABLE gates IS 'Raidable missions — kingdom-NNN manifested as gates with rank and rewards';
COMMENT ON TABLE gate_attempts IS 'Who entered which gate, what they did, what they gained';
COMMENT ON TABLE aura_log IS 'Audit trail — every aura gain and spend is logged (substrate honesty)';