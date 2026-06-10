/**
 * Visit-rewards side effects shared by /api/visit/checkin and
 * /api/visit/daily-pack: what completing a quest or gaining shards earns.
 *
 * Kept out of the routes so both surfaces settle a quest identically —
 * the shards, the trust_witness badge, the quartet check, the shardwrought
 * threshold. Rules from @cambridge-tcg/visit; storage via ./db.
 */

import {
  SHARDWROUGHT_THRESHOLD,
  badgeByKey,
  type QuestDef,
} from "@cambridge-tcg/visit";
import { addShards, allQuestsCompleted, awardBadge } from "./db";

export interface EarnedBadge {
  badge_key: string;
  title: string;
  tier: string;
  /** What earned it — flame milestone, quest key, or the pack draw. */
  via: string;
  /** Set when a verifiable draw earned it: /verify/draw/[draw_id] is the proof. */
  draw_id?: string | null;
}

export function describeBadge(badgeKey: string, via: string, drawId?: string | null): EarnedBadge {
  const def = badgeByKey(badgeKey);
  return {
    badge_key: badgeKey,
    title: def?.title ?? badgeKey,
    tier: def?.tier ?? "common",
    via,
    ...(drawId !== undefined ? { draw_id: drawId } : {}),
  };
}

/** Award shards and the shardwrought badge if the total crosses the threshold. */
export async function settleShards(
  userId: string,
  amount: number,
  via: string,
  drawId?: string | null,
): Promise<{ shards_total: number; earned: EarnedBadge[] }> {
  const total = await addShards(userId, amount);
  const earned: EarnedBadge[] = [];
  if (total >= SHARDWROUGHT_THRESHOLD) {
    if (await awardBadge(userId, "shardwrought", drawId ?? null)) {
      earned.push(describeBadge("shardwrought", via, drawId ?? null));
    }
  }
  return { shards_total: total, earned };
}

/**
 * Everything a freshly-completed quest pays out: its reward shards (and any
 * shardwrought crossing), the trust_witness badge for the verifier quest,
 * and the quartet badge when all four quests of the week are done.
 */
export async function settleQuestCompletion(
  userId: string,
  quest: QuestDef,
  week: string,
): Promise<{ shards_total: number; earned: EarnedBadge[] }> {
  const earned: EarnedBadge[] = [];

  const { shards_total, earned: shardEarned } = await settleShards(
    userId,
    quest.rewardShards,
    `quest:${quest.key}`,
  );
  earned.push(...shardEarned);

  if (quest.key === "open_verifier") {
    if (await awardBadge(userId, "trust_witness")) {
      earned.push(describeBadge("trust_witness", `quest:${quest.key}`));
    }
  }

  if (await allQuestsCompleted(userId, week)) {
    if (await awardBadge(userId, "quartet")) {
      earned.push(describeBadge("quartet", `week:${week}`));
    }
  }

  return { shards_total, earned };
}
