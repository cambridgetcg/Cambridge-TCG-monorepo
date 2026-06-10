-- The Daily Flame — visit rewards that are provably fair and guilt-free.
--
-- Yu's commission: "lets gamify cambridgetcg! module and process! Make the
-- visit rewarding and fun!"
--
-- Four tables for one loop: a signed-in visitor checks in once a day
-- (visit_checkins), the flame grows (visit_flames), weekly visit quests
-- track free-to-complete progress (visit_quests), and badges accumulate
-- as the TCG-native collection (visit_badges).
--
-- The daily pack deliberately gets NO table of its own. Every pack is a
-- commit-reveal draw in `verifiable_draws` (drizzle/0061) with kind
-- 'daily_pack' — the draw row IS the record: one-per-day enforcement reads
-- it, the outcome lives in its JSONB, and /verify/draw/[id] explains it.
-- This advances the migration arc 0061's header declared (surfaces
-- graduating from Math.random to commit-reveal): the Daily Flame is the
-- first surface BORN on the substrate rather than migrated to it. The
-- weights committed per-draw come from @cambridge-tcg/visit's
-- DAILY_PACK_TABLE — the same table /rewards/rules publishes, so the
-- published odds and the rolled odds cannot drift apart.
--
-- Anti-guilt by design: losing the flame never costs the user anything —
-- no debit, no tier change, no locked quest. An ember (one per ISO week,
-- automatic) shields a single missed day before the flame resets to 1.
-- The rules live in @cambridge-tcg/visit (pure compute, like pricing);
-- this schema only remembers what happened.
--
-- Time: a "day" is the database's CURRENT_DATE (UTC on RDS). The routes
-- ask the DB for today rather than trusting an app-server wall clock —
-- one clock, the database's.

BEGIN;

-- One row per (user, day) check-in. The unique constraint is the
-- idempotency: re-checking-in the same day is a no-op by construction.
CREATE TABLE IF NOT EXISTS visit_checkins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_visit_checkins_user_day
  ON visit_checkins(user_id, day DESC);

COMMENT ON TABLE visit_checkins IS
  'One row per user per day of showing up. UNIQUE(user_id, day) makes check-in idempotent. Day is the DB''s CURRENT_DATE (UTC).';

-- The flame itself — one row per user, advanced by @cambridge-tcg/visit's
-- advanceFlame() on each new-day check-in. `shards` rides here because
-- shards are a per-user counter, not an event log; the events that earned
-- them are reconstructable from verifiable_draws + visit_quests.
CREATE TABLE IF NOT EXISTS visit_flames (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  length           INT NOT NULL DEFAULT 0,
  embers_used_week INT NOT NULL DEFAULT 0,
  ember_week       VARCHAR(10),
  last_day         DATE,
  shards           INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE visit_flames IS
  'Per-user flame state. Rules are pure compute in @cambridge-tcg/visit; this row is the memory. Losing the flame costs nothing — anti-guilt is policy.';
COMMENT ON COLUMN visit_flames.embers_used_week IS
  'Embers spent during ember_week (ISO week key, e.g. 2026-W24). One free ember per week shields a single missed day. Counter resets implicitly when the week turns.';
COMMENT ON COLUMN visit_flames.shards IS
  'Badge shards from daily packs + quest completions. At 10 the shardwrought badge is awarded (threshold in @cambridge-tcg/visit).';

-- Weekly quest progress — one row per (user, quest, ISO week). Quest
-- definitions are data in @cambridge-tcg/visit (WEEKLY_QUESTS): browse
-- sets, price-check a card, open the fairness verifier, complete a
-- trade-in. No purchase-required quests in v1; every loop completes free.
CREATE TABLE IF NOT EXISTS visit_quests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_key    VARCHAR(40) NOT NULL,
  week         VARCHAR(10) NOT NULL,
  progress     INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, quest_key, week)
);

CREATE INDEX IF NOT EXISTS idx_visit_quests_user_week
  ON visit_quests(user_id, week);

COMMENT ON TABLE visit_quests IS
  'Per-user weekly quest progress. week is an ISO week key (2026-W24). Definitions live in @cambridge-tcg/visit WEEKLY_QUESTS — data-defined, all completable without spending.';

-- Earned badges. `draw_id` is the transparency thread: when a badge came
-- out of a daily pack, the row points at the verifiable draw that earned
-- it, so "why did I get this?" answers with /verify/draw/[id] — a proof,
-- not a shrug. Quest- and flame-earned badges carry NULL there; their
-- provenance is the quest row / flame milestone instead.
CREATE TABLE IF NOT EXISTS visit_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key  VARCHAR(60) NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  draw_id    UUID REFERENCES verifiable_draws(id) ON DELETE SET NULL,
  UNIQUE (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_visit_badges_user
  ON visit_badges(user_id, earned_at DESC);

COMMENT ON COLUMN visit_badges.draw_id IS
  'When the badge was earned by a daily-pack draw, the verifiable_draws row that proves it. NULL for quest/flame-earned badges.';

COMMIT;
