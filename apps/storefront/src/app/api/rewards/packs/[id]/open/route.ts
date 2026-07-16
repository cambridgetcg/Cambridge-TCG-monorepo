import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addCredit } from "@/lib/membership/db";
import { query } from "@/lib/db";
import { postActivity } from "@/lib/social/db";
import { commitDraw, rollSlot, revealDraw } from "@/lib/provable-draw";

// POST — open a pack (spend points, get 5 cards)
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const userId: string = session.user.id;  // hoisted so closures inside withCompensatingSpend keep the narrowed type

  const { id } = await params;

  // Get pack
  const packResult = await query(`SELECT * FROM reward_packs WHERE id=$1 AND status='active'`, [id]);
  if (packResult.rows.length === 0) return NextResponse.json({ error: "Pack not found." }, { status: 404 });
  const pack = packResult.rows[0];

  // Pre-flight: check pool BEFORE spending so we don't burn points on an
  // empty pool. (Stock can change between this check and the actual pulls
  // in race conditions, but the spend wrapper below will refund if the
  // pulls themselves throw.)
  const poolResult = await query(
    `SELECT * FROM reward_pack_pools WHERE pack_id=$1 ORDER BY sort_order`,
    [id]
  );
  const pool = poolResult.rows.filter(
    (r: { stock: number | null; awarded: number }) => r.stock === null || r.awarded < (r.stock ?? Infinity)
  );
  if (pool.length === 0) {
    return NextResponse.json({ error: "Pack pool is empty." }, { status: 400 });
  }

  // Atomic-ish: spend → pulls → reward distribution. If any pull fails,
  // points refunded. Cards already-awarded inside the wrapper persist —
  // the wrapper only un-spends, it can't un-award; in practice the
  // failure mode is database error and the awarded counts will be rolled
  // back along with the failed query.
  const { withCompensatingSpend } = await import("@/lib/rewards/atomic-spend");
  const wrapped = await withCompensatingSpend(
    {
      userId: userId,
      amount: pack.cost_points,
      type: "redeemed",
      description: `Opened pack: ${pack.title} (${pack.cost_points} Berries)`,
      referenceId: id,
    },
    async () => {
      const cards: {
        card_name: string;
        card_number: string | null;
        image_url: string | null;
        rarity: string;
        reward_type: string;
        reward_value: number;
        pool_id: string;
      }[] = [];

      // Weights keyed on pool row id. Normalised to sum-to-1 so the
      // verifier's pickWeighted produces the same pick from the same roll.
      const totalProb = pool.reduce(
        (s: number, r: { probability: string }) => s + parseFloat(r.probability),
        0,
      );
      const weights: Record<string, number> = {};
      for (const p of pool) weights[String(p.id)] = parseFloat(p.probability) / totalProb;

      // Store the seed and commitment before this code path rolls. The later
      // receipt is reproducible, but all entropy is server-chosen and the
      // commitment is not externally published before selection.
      const draw = await commitDraw({
        kind: "pack_open",
        userId,
        subjectId: id,
        weights,
        numSlots: 5,
      });

      const slotOutcomes: Array<{ picked: string; roll: number }> = [];
      const { earnRewardPoints } = await import("@/lib/rewards/earnings");

      for (let i = 0; i < 5; i++) {
        const { roll, picked } = rollSlot<string>(draw, i);
        const selected = pool.find((p: { id: string }) => String(p.id) === picked) ?? pool[0];
        slotOutcomes.push({ picked: String(selected.id), roll });

        cards.push({
          card_name: selected.card_name,
          card_number: selected.card_number,
          image_url: selected.image_url,
          rarity: selected.rarity,
          reward_type: selected.reward_type,
          reward_value: parseFloat(selected.reward_value),
          pool_id: String(selected.id),
        });

        // Guard the increment on stock so awarded can never exceed a limited
        // pool's stock, even when an earlier slot in this same open or a
        // concurrent open already took the last one. (The per-slot pick is
        // fixed at commit time for the provable-fair receipt, so a true
        // stockout still displays the card; reconciling the draw with finite
        // stock is a separate design decision — see REVIEW notes.)
        const stockUpd = await query(
          `UPDATE reward_pack_pools SET awarded=awarded+1
           WHERE id=$1 AND (stock IS NULL OR awarded < stock)`,
          [selected.id]
        );
        if ((stockUpd.rowCount ?? 0) === 0) {
          console.warn(`[packs] pool ${selected.id} stocked out during open of pack ${id}; award count held at stock`);
        }

        if (selected.reward_type === "points") {
          await earnRewardPoints({
            userId: userId,
            baseAmount: parseFloat(selected.reward_value),
            type: "manual_credit",
            description: `Pack pull: ${selected.card_name}`,
            referenceId: packResult.rows[0].id,
          });
        } else if (selected.reward_type === "credit") {
          await addCredit(userId, parseFloat(selected.reward_value), "manual_adjustment",
            `Pack pull: ${selected.card_name}`, packResult.rows[0].id);
        }
      }

      await revealDraw(draw, { slots: slotOutcomes });

      // Canonical result rows live INSIDE the wrapper: if either write throws,
      // the compensating refund fires. Written outside, a failed insert left
      // the user charged with cards but no pack_opens record and no refund.
      await query(
        `INSERT INTO pack_opens (pack_id, user_id, cards, points_spent) VALUES ($1,$2,$3,$4)`,
        [id, userId, JSON.stringify(cards), pack.cost_points]
      );
      await query(`UPDATE reward_packs SET total_opens=total_opens+1 WHERE id=$1`, [id]);

      return { cards, drawId: draw.id };
    },
  );

  if (!wrapped.success) {
    return NextResponse.json({ error: wrapped.error }, { status: 400 });
  }
  const { cards, drawId } = wrapped.result;

  // Activity
  const bestPull = cards.reduce((best, c) => {
    const rarityOrder: Record<string, number> = { SEC: 6, SR: 5, SP: 4, L: 4, R: 3, UC: 2, C: 1 };
    const bestScore = rarityOrder[best.rarity] || 0;
    const currScore = rarityOrder[c.rarity] || 0;
    return currScore > bestScore ? c : best;
  }, cards[0]);

  postActivity(userId, "mystery_box_opened",
    `Opened ${pack.title} — pulled ${bestPull.card_name}!`,
    { imageUrl: bestPull.image_url || undefined }
  ).catch(() => {});

  return NextResponse.json({ cards, packTitle: pack.title, drawId });
}
