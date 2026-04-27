import { query } from "@/lib/db";
import { spendPoints, earnPoints, addCredit } from "@/lib/membership/db";
import type { Raffle, RaffleEntry, MysteryBox, MysteryBoxReward, MysteryBoxOpen } from "./types";
import { postActivity, awardAchievement } from "@/lib/social/db";

// ══════════════════════════════════════════════════════════════
// RAFFLES
// ══════════════════════════════════════════════════════════════

export async function listRaffles(status?: string): Promise<Raffle[]> {
  // Lazy transition: activate scheduled raffles
  await query(`UPDATE raffles SET status='active', updated_at=NOW() WHERE status='draft' AND starts_at <= NOW() AND ends_at > NOW()`);

  const params: unknown[] = [];
  let where = "";
  if (status === "active") { where = "WHERE r.status='active' AND r.ends_at > NOW()"; }
  else if (status === "completed") { where = "WHERE r.status='completed'"; }
  else if (status) { params.push(status); where = `WHERE r.status=$1`; }

  const result = await query(
    `SELECT r.*, u.name as winner_name FROM raffles r
     LEFT JOIN users u ON r.winner_user_id=u.id ${where} ORDER BY r.ends_at ASC`,
    params
  );
  return result.rows as Raffle[];
}

export async function getRaffle(raffleId: string, userId?: string): Promise<Raffle | null> {
  const result = await query(
    `SELECT r.*, u.name as winner_name, u.email as winner_email FROM raffles r
     LEFT JOIN users u ON r.winner_user_id=u.id WHERE r.id=$1`,
    [raffleId]
  );
  if (result.rows.length === 0) return null;
  const raffle = result.rows[0] as Raffle;

  if (userId) {
    const entry = await query(
      `SELECT entry_count FROM raffle_entries WHERE raffle_id=$1 AND user_id=$2`,
      [raffleId, userId]
    );
    raffle.user_entries = entry.rows[0]?.entry_count || 0;
  }

  return raffle;
}

export async function createRaffle(data: Partial<Raffle>): Promise<Raffle> {
  const result = await query(
    `INSERT INTO raffles (title, description, image_url, entry_cost_points, max_entries_per_user,
      prize_description, prize_value, prize_type, prize_image_url, starts_at, ends_at, draw_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [data.title, data.description, data.image_url, data.entry_cost_points || 500,
     data.max_entries_per_user || 10, data.prize_description, data.prize_value,
     data.prize_type || "physical", data.prize_image_url,
     data.starts_at, data.ends_at, data.draw_at]
  );
  const raffle = result.rows[0] as Raffle;

  // Pre-commit the seed at raffle creation so the commitment precedes
  // every entry. Without this the sweep falls back to committing at
  // draw time, which is safer than nothing but doesn't let entrants
  // see the hash before they paid in.
  try {
    const { commitSeed } = await import("./provable-fair");
    await commitSeed(raffle.id);
  } catch (err) {
    console.warn(`[raffles] pre-commit failed for raffle ${raffle.id}:`, err);
  }

  return raffle;
}

export async function enterRaffle(raffleId: string, userId: string, entries: number = 1): Promise<{
  success: boolean; entry?: RaffleEntry; error?: string;
}> {
  const raffle = await getRaffle(raffleId, userId);
  if (!raffle) return { success: false, error: "Raffle not found." };
  if (raffle.status !== "active") return { success: false, error: "Raffle is not active." };
  if (new Date(raffle.ends_at) <= new Date()) return { success: false, error: "Raffle has ended." };

  const currentEntries = raffle.user_entries || 0;
  if (currentEntries + entries > raffle.max_entries_per_user) {
    return { success: false, error: `Max ${raffle.max_entries_per_user} entries. You have ${currentEntries}.` };
  }

  const totalCost = raffle.entry_cost_points * entries;

  // Atomic-ish: refund the spend if the entry insert / counter update fails.
  const { withCompensatingSpend } = await import("./atomic-spend");
  const result = await withCompensatingSpend(
    {
      userId,
      amount: totalCost,
      type: "redeemed",
      description: `${entries} raffle entry for "${raffle.title}" (${totalCost} Berries)`,
      referenceId: raffleId,
    },
    async () => {
      const entryResult = await query(
        `INSERT INTO raffle_entries (raffle_id, user_id, entry_count, points_spent)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (raffle_id, user_id) DO UPDATE SET entry_count=raffle_entries.entry_count+$3, points_spent=raffle_entries.points_spent+$4
         RETURNING *`,
        [raffleId, userId, entries, totalCost]
      );
      await query(`UPDATE raffles SET total_entries=total_entries+$2, updated_at=NOW() WHERE id=$1`, [raffleId, entries]);
      return entryResult.rows[0] as RaffleEntry;
    },
  );

  if (!result.success) return { success: false, error: result.error };
  return { success: true, entry: result.result };
}

// drawRaffleWinner (legacy Math.random() draw) has been removed. All
// draws now go through @/lib/rewards/provable-fair.provablyFairDraw,
// which writes a commit-reveal audit row to raffle_draw_proofs and
// produces a verifiable outcome. The admin draw endpoint and the
// raffle-sweep cron were the only callers.

export async function getRaffleEntries(raffleId: string): Promise<RaffleEntry[]> {
  const result = await query(
    `SELECT e.*, u.name as user_name FROM raffle_entries e
     JOIN users u ON e.user_id=u.id WHERE e.raffle_id=$1 ORDER BY e.entry_count DESC`,
    [raffleId]
  );
  return result.rows as RaffleEntry[];
}

// ══════════════════════════════════════════════════════════════
// MYSTERY BOXES
// ══════════════════════════════════════════════════════════════

export async function listMysteryBoxes(status?: string): Promise<MysteryBox[]> {
  const params: unknown[] = [];
  let where = "";
  if (status) { params.push(status); where = `WHERE b.status=$1`; }

  const result = await query(`SELECT * FROM mystery_boxes b ${where} ORDER BY b.created_at DESC`, params);
  return result.rows as MysteryBox[];
}

export async function getMysteryBox(boxId: string, userId?: string): Promise<MysteryBox | null> {
  const result = await query(`SELECT * FROM mystery_boxes WHERE id=$1`, [boxId]);
  if (result.rows.length === 0) return null;
  const box = result.rows[0] as MysteryBox;

  const rewards = await query(
    `SELECT * FROM mystery_box_rewards WHERE box_id=$1 ORDER BY sort_order ASC`,
    [boxId]
  );
  box.rewards = rewards.rows as MysteryBoxReward[];

  if (userId) {
    const opens = await query(
      `SELECT COUNT(*) FROM mystery_box_opens WHERE box_id=$1 AND user_id=$2`,
      [boxId, userId]
    );
    box.user_opens = parseInt(opens.rows[0].count, 10);
  }

  return box;
}

export async function createMysteryBox(data: Partial<MysteryBox>): Promise<MysteryBox> {
  const result = await query(
    `INSERT INTO mystery_boxes (title, description, image_url, cost_points, max_opens_per_user, max_total_opens)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.title, data.description, data.image_url, data.cost_points || 1000,
     data.max_opens_per_user || 5, data.max_total_opens]
  );
  return result.rows[0] as MysteryBox;
}

export async function addBoxReward(boxId: string, data: Partial<MysteryBoxReward>): Promise<MysteryBoxReward> {
  const result = await query(
    `INSERT INTO mystery_box_rewards (box_id, name, description, reward_type, reward_value, image_url, probability, rarity, stock, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [boxId, data.name, data.description, data.reward_type, data.reward_value,
     data.image_url, data.probability, data.rarity || "common", data.stock, data.sort_order || 0]
  );
  return result.rows[0] as MysteryBoxReward;
}

export async function openMysteryBox(boxId: string, userId: string): Promise<{
  success: boolean; open?: MysteryBoxOpen; reward?: MysteryBoxReward; drawId?: string; error?: string;
}> {
  const box = await getMysteryBox(boxId, userId);
  if (!box) return { success: false, error: "Mystery box not found." };
  if (box.status !== "active") return { success: false, error: "Mystery box is not active." };
  if (box.user_opens !== undefined && box.user_opens >= box.max_opens_per_user) {
    return { success: false, error: `Max ${box.max_opens_per_user} opens reached.` };
  }
  if (box.max_total_opens && box.total_opens >= box.max_total_opens) {
    return { success: false, error: "All boxes have been opened." };
  }

  // Pre-flight: stock check happens before spend so we don't burn points
  // for a box with nothing to award.
  const rewards = box.rewards || [];
  const available = rewards.filter(r => r.stock === null || r.awarded_count < (r.stock ?? Infinity));
  if (available.length === 0) return { success: false, error: "No rewards available." };

  // Atomic-ish: spend → reward selection → open insert → count bumps.
  // If any step fails, points refunded.
  const { withCompensatingSpend } = await import("./atomic-spend");
  const wrapped = await withCompensatingSpend(
    {
      userId,
      amount: box.cost_points,
      type: "redeemed",
      description: `Opened mystery box "${box.title}" (${box.cost_points} Berries)`,
      referenceId: boxId,
    },
    async () => {
      // Provable-fair selection through the shared commit-reveal primitive.
      // Reward row id is the weight key so the verifier reproduces the
      // pick deterministically from (seed, client, nonce, weights).
      const { commitDraw, rollSlot, revealDraw } = await import("@/lib/provable-draw");
      const totalProb = available.reduce((s, r) => s + parseFloat(r.probability), 0);
      const weights: Record<string, number> = {};
      for (const reward of available) weights[String(reward.id)] = parseFloat(reward.probability) / totalProb;

      const draw = await commitDraw({
        kind: "mystery_box",
        userId,
        subjectId: boxId,
        weights,
      });
      const { roll, picked } = rollSlot<string>(draw, 0);
      const selectedReward = available.find(r => String(r.id) === picked) ?? available[0];
      await revealDraw(draw, { picked: String(selectedReward.id), roll });

      // Record open
      const openResult = await query(
        `INSERT INTO mystery_box_opens (box_id, user_id, reward_id, points_spent)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [boxId, userId, selectedReward.id, box.cost_points]
      );

      // Update counts
      await query(`UPDATE mystery_boxes SET total_opens=total_opens+1, updated_at=NOW() WHERE id=$1`, [boxId]);
      await query(`UPDATE mystery_box_rewards SET awarded_count=awarded_count+1 WHERE id=$1`, [selectedReward.id]);

      return { selectedReward, openRow: openResult.rows[0], drawId: draw.id };
    },
  );

  if (!wrapped.success) return { success: false, error: wrapped.error };
  const { selectedReward, openRow: openInsertedRow, drawId } = wrapped.result;
  // Re-shape so the rest of the function uses the same names as before
  const openResult = { rows: [openInsertedRow] };

  // Social: activity feed + legendary achievement
  postActivity(userId, "mystery_box_opened", "Opened a mystery box").catch(() => {});
  if (selectedReward.rarity === "legendary") {
    awardAchievement(userId, "mystery_legendary").catch(() => {});
  }

  // Auto-fulfill points and credit rewards. Points go through the
  // multiplier-aware helper so tier + streak boost the box's points payout.
  if (selectedReward.reward_type === "points") {
    const { earnRewardPoints } = await import("./earnings");
    await earnRewardPoints({
      userId,
      baseAmount: parseFloat(selectedReward.reward_value),
      type: "manual_credit",
      description: `Won ${selectedReward.reward_value} Berries from "${box.title}"`,
      referenceId: openResult.rows[0].id,
    });
    await query(`UPDATE mystery_box_opens SET fulfilled=true WHERE id=$1`, [openResult.rows[0].id]);
  } else if (selectedReward.reward_type === "credit") {
    await addCredit(userId, parseFloat(selectedReward.reward_value), "manual_adjustment",
      `Won £${selectedReward.reward_value} credit from "${box.title}"`, openResult.rows[0].id);
    await query(`UPDATE mystery_box_opens SET fulfilled=true WHERE id=$1`, [openResult.rows[0].id]);
  }

  return { success: true, open: openResult.rows[0] as MysteryBoxOpen, reward: selectedReward, drawId };
}

export async function getUserRewardHistory(userId: string): Promise<MysteryBoxOpen[]> {
  const result = await query(
    `SELECT o.*, r.name as reward_name, r.reward_type, r.reward_value, r.rarity, r.image_url as reward_image,
       b.title as box_title
     FROM mystery_box_opens o
     JOIN mystery_box_rewards r ON o.reward_id=r.id
     JOIN mystery_boxes b ON o.box_id=b.id
     WHERE o.user_id=$1 ORDER BY o.created_at DESC`,
    [userId]
  );
  return result.rows as MysteryBoxOpen[];
}

export async function updateMysteryBoxStatus(boxId: string, status: string): Promise<void> {
  await query(`UPDATE mystery_boxes SET status=$2, updated_at=NOW() WHERE id=$1`, [boxId, status]);
}

export async function updateRaffleStatus(raffleId: string, status: string): Promise<void> {
  await query(`UPDATE raffles SET status=$2, updated_at=NOW() WHERE id=$1`, [raffleId, status]);
}
