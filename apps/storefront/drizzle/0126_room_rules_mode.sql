-- 0126_room_rules_mode.sql — refereed PvP rooms.
--
-- rules_mode declares who enforces the rules at this table:
--   'tabletop' — the historical honor-system virtual tabletop: manual
--                damage, corrections, free moves. Preserved deliberately;
--                some tables WANT house rules.
--   'referee'  — the server validates every move against the official
--                Comprehensive Rules (validate.ts) and runs the battle
--                steps with real defense windows (Block 7-1-2, Counter
--                7-1-3), the same engine practice mode plays.
ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS rules_mode TEXT NOT NULL DEFAULT 'tabletop';
