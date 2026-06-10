/**
 * POST /api/visit/checkin — the Daily Flame's check-in.
 *
 * Idempotent per day: UNIQUE(user_id, day) on visit_checkins means a retry
 * or a double-tap re-lands on the same row; the response says plainly
 * whether this call was the day's first (`is_new_day`).
 *
 * Advances the flame via @cambridge-tcg/visit's advanceFlame — the same
 * pure rules /rewards/rules publishes (extend on consecutive days, one
 * automatic ember per ISO week shields a single missed day, otherwise the
 * flame resets to 1 at no cost — the flame is for joy, not obligation).
 *
 * Optionally awards quest progress: the body may carry a quest event the
 * client just witnessed ({ "event": "browse_set" | "price_check" |
 * "open_verifier" | "trade_in_completed" }) and the matching weekly quest
 * advances. Unknown events are reported back, not silently swallowed.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { questsForEvent, WEEKLY_QUESTS, questByKey } from "@cambridge-tcg/visit";
import { performDailyCheckin } from "@/lib/visit/checkin";
import { loadWeekQuests, progressQuest } from "@/lib/visit/db";
import { settleQuestCompletion, type EarnedBadge } from "@/lib/visit/awards";

const KNOWN_EVENTS = new Set(WEEKLY_QUESTS.map((q) => q.event));

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;

  // The body is optional — a bare check-in is the common case.
  let body: { event?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // no body — fine
  }

  const checkin = await performDailyCheckin(userId);
  const badgesEarned: EarnedBadge[] = [...checkin.badges_earned];

  // Quest progress for a reported event.
  const event = typeof body.event === "string" ? body.event : null;
  const eventRecognized = event !== null ? KNOWN_EVENTS.has(event) : null;
  const questUpdates: Array<{
    quest_key: string;
    progress: number;
    target: number;
    completed: boolean;
  }> = [];

  if (event && eventRecognized) {
    for (const quest of questsForEvent(event)) {
      const result = await progressQuest(userId, quest, checkin.week, 1);
      questUpdates.push({
        quest_key: result.quest_key,
        progress: result.progress,
        target: result.target,
        completed: result.completed,
      });
      if (result.just_completed) {
        const settled = await settleQuestCompletion(userId, quest, checkin.week);
        badgesEarned.push(...settled.earned);
        checkin.flame.shards = settled.shards_total;
      }
    }
  }

  // This week's quests, definitions merged in (rows are seeded by the check-in).
  const rows = await loadWeekQuests(userId, checkin.week);
  const quests = rows.map((row) => {
    const def = questByKey(row.quest_key);
    return {
      quest_key: row.quest_key,
      title: def?.title ?? row.quest_key,
      description: def?.description ?? "",
      progress: row.progress,
      target: def?.target ?? 1,
      completed_at: row.completed_at,
    };
  });

  return NextResponse.json({
    day: checkin.day,
    week: checkin.week,
    is_new_day: checkin.is_new_day,
    // Post-write state — live as of this request, not a cache.
    flame: {
      length: checkin.flame.length,
      last_day: checkin.flame.lastDay,
      embers_used_week: checkin.flame.embersUsedWeek,
      ember_week: checkin.flame.emberWeek,
      shards: checkin.flame.shards,
    },
    flame_event: checkin.flame_event,
    quests,
    badges_earned: badgesEarned,
    ...(event !== null ? { event, event_recognized: eventRecognized } : {}),
    computed_at: new Date().toISOString(),
  });
}
