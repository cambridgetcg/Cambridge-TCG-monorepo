/**
 * GET /api/visit/state — the Daily Flame at a glance, mutating nothing.
 *
 * Substrate honesty is the shape of this response:
 *   - `flame` is the STORED state as of the last check-in that advanced it
 *     (flame.state_source says so) — a GET does not quietly bump streaks.
 *   - `preview.if_checked_in_now` is a pure-function preview (the same
 *     advanceFlame the POST runs), labelled as a preview, not a promise.
 *   - `pack_odds` is @cambridge-tcg/visit's DAILY_PACK_TABLE verbatim — the
 *     same object the server commits into each draw and /rewards/rules
 *     publishes. One table, three surfaces, zero drift.
 *   - `computed_at` stamps when this snapshot was assembled.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  advanceFlame,
  badgeByKey,
  isoWeekOf,
  DAILY_PACK_TABLE,
  EMBERS_PER_WEEK,
  WEEKLY_QUESTS,
  WEIGHT_TOTAL,
} from "@cambridge-tcg/visit";
import {
  getDbToday,
  hasCheckedInToday,
  loadBadges,
  loadFlame,
  loadWeekQuests,
  todaysPackDraw,
} from "@/lib/visit/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;

  const today = await getDbToday();
  const week = isoWeekOf(today);

  const [flame, checkedIn, pack, questRows, badgeRows] = await Promise.all([
    loadFlame(userId),
    hasCheckedInToday(userId),
    todaysPackDraw(userId),
    loadWeekQuests(userId, week),
    loadBadges(userId),
  ]);

  // Preview: what WOULD happen if the user checked in right now — the same
  // pure rules the POST runs, run read-only here.
  const preview = advanceFlame(flame, today);

  // This week's quests: definitions merged over stored rows; quests with no
  // row yet (week not seeded) honestly report progress 0 from definition.
  const rowsByKey = new Map(questRows.map((r) => [r.quest_key, r]));
  const quests = WEEKLY_QUESTS.map((def) => {
    const row = rowsByKey.get(def.key);
    return {
      quest_key: def.key,
      title: def.title,
      description: def.description,
      event: def.event,
      progress: row?.progress ?? 0,
      target: def.target,
      completed_at: row?.completed_at ?? null,
      reward_shards: def.rewardShards,
    };
  });

  const badges = badgeRows.map((b) => {
    const def = badgeByKey(b.badge_key);
    return {
      badge_key: b.badge_key,
      title: def?.title ?? b.badge_key,
      tier: def?.tier ?? "common",
      description: def?.description ?? "",
      earned_at: b.earned_at,
      // The transparency thread: pack-earned badges carry their proof.
      ...(b.draw_id ? { draw_id: b.draw_id, verify_path: `/verify/draw/${b.draw_id}` } : {}),
    };
  });

  return NextResponse.json({
    day: today,
    week,
    flame: {
      length: flame?.length ?? 0,
      last_day: flame?.lastDay ?? null,
      embers_used_week: flame?.emberWeek === week ? flame.embersUsedWeek : 0,
      embers_per_week: EMBERS_PER_WEEK,
      shards: flame?.shards ?? 0,
      // Honest about what this number is: state as written at the last
      // check-in that advanced the flame — not recomputed by this GET.
      state_source: "stored_at_last_checkin",
    },
    today: {
      checked_in: checkedIn,
      pack_opened: pack !== null,
      ...(pack
        ? { pack_draw_id: pack.id, pack_verify_path: `/verify/draw/${pack.id}` }
        : {}),
    },
    preview: {
      // What the next check-in would do, per the published rules. A pure
      // recomputation, not a stored fact.
      if_checked_in_now: preview.event,
      flame_length_after: preview.state.length,
    },
    quests,
    badges,
    pack_odds: {
      // Verbatim from @cambridge-tcg/visit DAILY_PACK_TABLE — the exact
      // weights committed into every daily_pack verifiable draw.
      source: "@cambridge-tcg/visit DAILY_PACK_TABLE",
      weight_total: WEIGHT_TOTAL,
      outcomes: DAILY_PACK_TABLE.map((r) => ({
        key: r.key,
        kind: r.kind,
        label: r.label,
        weight: r.weight,
      })),
    },
    computed_at: new Date().toISOString(),
  });
}
