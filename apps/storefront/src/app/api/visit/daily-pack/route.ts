/**
 * POST /api/visit/daily-pack — one free provably-fair draw per day.
 *
 * The pack rolls through the commit-reveal substrate (src/lib/provable-draw,
 * verifiable_draws kind 'daily_pack') — never Math.random. This advances the
 * migration arc drizzle/0061's header declared: the Daily Flame is the first
 * surface BORN on the substrate rather than migrated to it.
 *
 * The weights committed into the draw row are @cambridge-tcg/visit's
 * DAILY_PACK_TABLE — the same table /rewards/rules publishes, so the odds
 * the user reads and the odds the server rolls are one object. The response
 * carries draw_id + verify_path: "why did I get this?" answers with
 * /verify/draw/[id], a recomputable proof, not a shrug.
 *
 * One per day, enforced against the draw rows themselves (the draw IS the
 * record — no parallel pack table to drift from the proof). Opening a pack
 * also counts as showing up: the flame advances through the same shared
 * check-in path as /api/visit/checkin.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addCredit } from "@/lib/membership/db";
import { rollSingleSlot } from "@/lib/provable-draw";
import {
  dailyPackWeights,
  packRewardByKey,
  questByKey,
  GOLDEN_SPARK_BONUS_SHARDS,
  WEEKLY_QUESTS,
} from "@cambridge-tcg/visit";
import { performDailyCheckin } from "@/lib/visit/checkin";
import { awardBadge, loadWeekQuests, progressQuest, todaysPackDraw } from "@/lib/visit/db";
import {
  describeBadge,
  settleQuestCompletion,
  settleShards,
  type EarnedBadge,
} from "@/lib/visit/awards";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;

  // One pack per day. The committed draw row is the authority — same
  // pattern as the spin route's per-day count, but anchored to the proof.
  const existing = await todaysPackDraw(userId);
  if (existing) {
    return NextResponse.json(
      {
        error: "Today's pack is already open. Tomorrow brings another — nothing is lost by waiting.",
        draw_id: existing.id,
        verify_path: `/verify/draw/${existing.id}`,
      },
      { status: 400 },
    );
  }

  // Opening the pack is also showing up — flame + quest seeding share the
  // check-in path so the two surfaces can't disagree about "today".
  const checkin = await performDailyCheckin(userId);
  const badgesEarned: EarnedBadge[] = [...checkin.badges_earned];

  // Commit → roll → reveal, weights straight from the published table.
  const { draw, picked } = await rollSingleSlot<string>({
    kind: "daily_pack",
    userId,
    weights: dailyPackWeights(),
  });

  const reward = packRewardByKey(picked);
  if (!reward) {
    // Unreachable while weights derive from the table; loud if it ever isn't.
    return NextResponse.json(
      { error: `Draw picked unknown reward key '${picked}'.`, draw_id: draw.id },
      { status: 500 },
    );
  }

  // Apply the outcome.
  let creditAdded: number | null = null;
  let shardsTotal: number | null = null;
  let questBoosted: { quest_key: string; progress: number; target: number; completed: boolean } | null =
    null;

  if (reward.kind === "credit") {
    await addCredit(userId, reward.value, "manual_adjustment", `Daily pack: ${reward.label}`, draw.id);
    creditAdded = reward.value;
    if (reward.key === "golden_spark") {
      const settled = await settleShards(userId, GOLDEN_SPARK_BONUS_SHARDS, "pack:golden_spark", draw.id);
      shardsTotal = settled.shards_total;
      badgesEarned.push(...settled.earned);
      if (await awardBadge(userId, "first_light", draw.id)) {
        badgesEarned.push(describeBadge("first_light", "pack:golden_spark", draw.id));
      }
    }
  } else if (reward.kind === "badge_shard") {
    const settled = await settleShards(userId, reward.value, `pack:${reward.key}`, draw.id);
    shardsTotal = settled.shards_total;
    badgesEarned.push(...settled.earned);
  } else if (reward.kind === "quest_boost") {
    // Boost the first incomplete quest, in the table's declared order —
    // deterministic, so the user can predict where a boost lands.
    const rows = await loadWeekQuests(userId, checkin.week);
    const progressByKey = new Map(rows.map((r) => [r.quest_key, r]));
    const targetQuest = WEEKLY_QUESTS.find((q) => {
      const row = progressByKey.get(q.key);
      return !row || row.completed_at === null;
    });
    if (targetQuest) {
      const result = await progressQuest(userId, targetQuest, checkin.week, reward.value);
      questBoosted = {
        quest_key: result.quest_key,
        progress: result.progress,
        target: result.target,
        completed: result.completed,
      };
      if (result.just_completed) {
        const quest = questByKey(result.quest_key);
        if (quest) {
          const settled = await settleQuestCompletion(userId, quest, checkin.week);
          shardsTotal = settled.shards_total;
          badgesEarned.push(...settled.earned);
        }
      }
    }
  }
  // reward.kind === "spark": the message is the reward; nothing to persist
  // beyond the draw row itself.

  return NextResponse.json({
    day: checkin.day,
    draw_id: draw.id,
    verify_path: `/verify/draw/${draw.id}`,
    picked: reward.key,
    reward: {
      key: reward.key,
      kind: reward.kind,
      label: reward.label,
      value: reward.value,
      message: reward.message,
    },
    applied: {
      ...(creditAdded !== null ? { credit_added: creditAdded } : {}),
      ...(shardsTotal !== null ? { shards_total: shardsTotal } : {}),
      ...(questBoosted !== null ? { quest_boosted: questBoosted } : {}),
      badges_earned: badgesEarned,
    },
    flame_event: checkin.flame_event,
    computed_at: new Date().toISOString(),
  });
}
