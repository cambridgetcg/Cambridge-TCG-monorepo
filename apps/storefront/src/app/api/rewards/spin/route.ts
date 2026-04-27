import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { spendPoints, addCredit } from "@/lib/membership/db";
import { bumpStreak } from "@/lib/membership/streak";
import { query } from "@/lib/db";
import { commitDraw, rollSlot, revealDraw } from "@/lib/provable-draw";

interface Segment {
  label: string;
  reward_type: string;
  reward_value: number;
  color: string;
  probability: number;
}

// GET — spin wheel config + user's spins today
export async function GET() {
  const session = await auth();

  const configResult = await query(`SELECT * FROM spin_config LIMIT 1`);
  const config = configResult.rows[0];
  const segments: Segment[] = config?.segments || [];

  let spinsToday = 0;
  let streak = 0;
  if (session?.user?.id) {
    const todaySpins = await query(
      `SELECT COUNT(*) FROM spin_results WHERE user_id=$1 AND NOT is_premium AND created_at::date=CURRENT_DATE`,
      [session.user.id]
    );
    spinsToday = parseInt(todaySpins.rows[0].count, 10);

    // Update streak via shared helper
    const s = await bumpStreak(session.user.id);
    streak = s.currentStreak;
  }

  return NextResponse.json({
    segments: segments.map(s => ({ label: s.label, color: s.color })), // hide probabilities
    freeSpinsPerDay: config?.free_spins_per_day || 1,
    premiumCost: config?.premium_cost_points || 500,
    spinsUsedToday: spinsToday,
    streak,
    canFreeSpin: spinsToday < (config?.free_spins_per_day || 1),
  });
}

// POST — spin the wheel
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json();
  const isPremium = body.premium === true;

  const configResult = await query(`SELECT * FROM spin_config LIMIT 1`);
  const config = configResult.rows[0];
  if (!config) return NextResponse.json({ error: "Spin wheel not configured." }, { status: 500 });

  const segments: Segment[] = config.segments;

  // Check free spin availability
  if (!isPremium) {
    const todaySpins = await query(
      `SELECT COUNT(*) FROM spin_results WHERE user_id=$1 AND NOT is_premium AND created_at::date=CURRENT_DATE`,
      [session.user.id]
    );
    if (parseInt(todaySpins.rows[0].count, 10) >= config.free_spins_per_day) {
      return NextResponse.json({ error: "No free spins left today. Use premium spin (500 Berries)." }, { status: 400 });
    }
  }

  // Spend points for premium spin
  if (isPremium) {
    const result = await spendPoints(session.user.id, config.premium_cost_points, "redeemed",
      `Premium spin (${config.premium_cost_points} Berries)`);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Provable-fair selection. Commit a seed + weights to verifiable_draws
  // BEFORE rolling, so the recorded commitment predates the outcome.
  // Segment index as the weight key keeps the verifier generic.
  const totalProb = segments.reduce((s: number, seg: Segment) => s + seg.probability, 0);
  const weights: Record<string, number> = {};
  segments.forEach((seg, i) => { weights[String(i)] = seg.probability / totalProb; });

  const draw = await commitDraw({
    kind: "spin_wheel",
    userId: session.user.id,
    weights,
  });
  const { roll, picked } = rollSlot<string>(draw, 0);
  const selectedIndex = parseInt(picked, 10);
  const selected = segments[selectedIndex] ?? segments[0];
  await revealDraw(draw, { picked, roll });

  // Award reward — points go through the multiplier-aware helper so
  // tier + streak boost the spin's points payout, mirroring orders.
  if (selected.reward_type === "points" && selected.reward_value > 0) {
    const { earnRewardPoints } = await import("@/lib/rewards/earnings");
    await earnRewardPoints({
      userId: session.user.id,
      baseAmount: selected.reward_value,
      type: "manual_credit",
      description: `Spin wheel: ${selected.label}`,
    });
  } else if (selected.reward_type === "credit" && selected.reward_value > 0) {
    await addCredit(session.user.id, selected.reward_value, "manual_adjustment",
      `Spin wheel: ${selected.label}`);
  }

  // Record result
  await query(
    `INSERT INTO spin_results (user_id, segment_index, reward_type, reward_value, reward_label, is_premium)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [session.user.id, selectedIndex, selected.reward_type, selected.reward_value, selected.label, isPremium]
  );

  return NextResponse.json({
    segmentIndex: selectedIndex,
    reward: { type: selected.reward_type, value: selected.reward_value, label: selected.label },
    drawId: draw.id,
  });
}
