/**
 * performDailyCheckin — the one "I'm here today" gesture of the Daily Flame.
 *
 * Both /api/visit/checkin (the explicit gesture) and /api/visit/daily-pack
 * (opening a pack is also showing up) run through this, so the flame can
 * never disagree with itself about whether today counted.
 *
 * Self-healing: the flame is advanced whenever its stored lastDay lags the
 * check-in record (e.g. a crash between the two writes) — advanceFlame is
 * pure and idempotent per day, so repair is just running it again.
 */

import {
  advanceFlame,
  flameMilestoneBadges,
  isoWeekOf,
  type FlameEvent,
  type FlameState,
} from "@cambridge-tcg/visit";
import {
  awardBadge,
  getDbToday,
  loadFlame,
  recordCheckin,
  saveFlame,
  seedWeekQuests,
} from "./db";
import { describeBadge, type EarnedBadge } from "./awards";

export interface CheckinResult {
  day: string;
  week: string;
  /** True when this call created today's check-in row. */
  is_new_day: boolean;
  flame: FlameState;
  flame_event: FlameEvent;
  badges_earned: EarnedBadge[];
}

export async function performDailyCheckin(userId: string): Promise<CheckinResult> {
  const day = await getDbToday();
  const week = isoWeekOf(day);

  const isNewDay = await recordCheckin(userId);
  const prev = await loadFlame(userId);
  const { state, event } = advanceFlame(prev, day);

  // Persist only when something actually moved (advanceFlame is pure; the
  // "already_today" branch carries no new fact worth a write).
  if (event !== "already_today") {
    await saveFlame(userId, state);
  }

  const earned: EarnedBadge[] = [];
  if (event === "ember_spent") {
    if (await awardBadge(userId, "ember_saved")) {
      earned.push(describeBadge("ember_saved", "flame:ember"));
    }
  }
  for (const badgeKey of flameMilestoneBadges(state.length)) {
    if (await awardBadge(userId, badgeKey)) {
      earned.push(describeBadge(badgeKey, `flame:${state.length}`));
    }
  }

  // Make this week's quest rows visible from the first visit of the week.
  await seedWeekQuests(userId, week);

  return {
    day,
    week,
    is_new_day: isNewDay,
    flame: state,
    flame_event: event,
    badges_earned: earned,
  };
}
