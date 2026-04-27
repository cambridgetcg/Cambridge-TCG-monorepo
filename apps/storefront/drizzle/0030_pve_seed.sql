-- Seed PVE Adventure Mode with 10 levels following the One Piece storyline.
-- Idempotent: safe to re-run on an already-seeded DB.
-- first_clear_credit is stored in pounds (NUMERIC(10,2)) — matches the
-- addCredit() contract which expects a pound amount.

INSERT INTO pve_levels (
  level_number, title, description, opponent_name, opponent_icon,
  difficulty, ai_aggression,
  first_clear_points, first_clear_credit, repeat_points,
  required_level, is_active
) VALUES
  (1,
   'East Blue Rookie',
   'Your first taste of piracy. Alvida''s crew blocks your path out of the East Blue. Prove you''re more than a cabin boy.',
   'Alvida', '🔨',
   'easy', 0.30,
   500, 0.00, 100,
   0, true),

  (2,
   'Baratie Showdown',
   'Don Krieg''s armada descends on the floating restaurant. Defend the cooks and show what a rookie captain is made of.',
   'Don Krieg', '⚔️',
   'easy', 0.40,
   750, 0.00, 150,
   1, true),

  (3,
   'Arlong Park',
   'The tyrant of Cocoyasi Village has haunted Nami for years. Break his grip and prove your crew is worth sailing with.',
   'Arlong', '🦈',
   'easy', 0.50,
   1000, 1.00, 200,
   2, true),

  (4,
   'Drum Island',
   'A frozen kingdom ruled by a gluttonous tyrant. Chop through Wapol''s shape-shifting antics and reach the castle.',
   'Wapol', '👑',
   'medium', 0.55,
   1000, 1.00, 200,
   3, true),

  (5,
   'Alabasta Crisis',
   'The desert king of Baroque Works schemes to seize an entire nation. Dismantle his web of pawns and face him in the ruins.',
   'Crocodile', '🐊',
   'medium', 0.65,
   1500, 2.00, 300,
   4, true),

  (6,
   'Skypiea Thunder',
   'Four hundred million volts of godhood stand between you and the gold of Shandora. Survive the Ordeals.',
   'Enel', '⚡',
   'medium', 0.70,
   1500, 2.00, 300,
   5, true),

  (7,
   'Water 7 Betrayal',
   'A friend is a CP9 agent, the Puffing Tom is leaving the station, and Robin has been taken. The leopard won''t stop you.',
   'Rob Lucci', '🐆',
   'hard', 0.80,
   2000, 3.00, 400,
   6, true),

  (8,
   'Thriller Bark',
   'A ghost ship the size of an island, and a warlord who steals shadows. Reclaim yours before dawn.',
   'Gecko Moria', '👻',
   'hard', 0.80,
   2000, 3.00, 400,
   7, true),

  (9,
   'Marineford War',
   'The summit war. Magma versus rubber on the plaza of the strongest. The world is watching.',
   'Akainu', '🌋',
   'hard', 0.90,
   3000, 5.00, 600,
   8, true),

  (10,
   'New World Emperor',
   'The strongest creature in the world awaits at the summit. There is no harder fight in the seas.',
   'Kaido', '🐉',
   'extreme', 1.00,
   5000, 10.00, 1000,
   9, true)
ON CONFLICT (level_number) DO NOTHING;
