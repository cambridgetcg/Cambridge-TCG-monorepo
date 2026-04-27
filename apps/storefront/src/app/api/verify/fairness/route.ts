import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Public aggregate fairness data. Reports, per tier, the last-30-day
// rolled-rarity distribution alongside the configured rarity_weights
// so anyone can eyeball "are actual pulls matching the stated odds?"
//
// No user data exposed — only aggregate counts per tier+rarity. A
// single weekly rarity outcome already leaks ~0 about any individual.

const WINDOW_DAYS = 30;
const MIN_SAMPLES = 30; // hide tiers with too few pulls to signal anything

export async function GET() {
  // Tier weights snapshot (current; the tier config can drift over the
  // window, but we report current weights — historical drift would
  // require per-pull weight capture, which the 0032 schema doesn't do).
  const tiers = await query(
    `SELECT tier, display_name, rarity_weights, enabled
       FROM bounty_pull_tiers
      ORDER BY tier`,
  );

  // Rolled rarities over the window.
  const rolls = await query(
    `SELECT tier, rolled_rarity, COUNT(*)::int AS n
       FROM bounty_pulls
      WHERE resolved_at >= NOW() - make_interval(days => $1)
        AND rolled_rarity IS NOT NULL
      GROUP BY tier, rolled_rarity`,
    [WINDOW_DAYS],
  );

  // Index rolls by tier for the per-tier aggregation below.
  const rollsByTier = new Map<string, Map<string, number>>();
  for (const row of rolls.rows) {
    if (!rollsByTier.has(row.tier)) rollsByTier.set(row.tier, new Map());
    rollsByTier.get(row.tier)!.set(row.rolled_rarity, row.n);
  }

  const perTier = tiers.rows.map((t) => {
    const rollMap = rollsByTier.get(t.tier) ?? new Map<string, number>();
    const total = [...rollMap.values()].reduce((s, n) => s + n, 0);
    const weights: Record<string, number> = t.rarity_weights ?? {};

    // Per-rarity: expected vs observed. Chi-square contribution per bucket
    // is (observed - expected)^2 / expected; sum across buckets gives a
    // rough deviation score.
    type Row = { rarity: string; expected_pct: number; observed: number; observed_pct: number; };
    const rarityRows: Row[] = Object.entries(weights).map(([rarity, w]) => {
      const observed = rollMap.get(rarity) ?? 0;
      return {
        rarity,
        expected_pct: w,
        observed,
        observed_pct: total > 0 ? observed / total : 0,
      };
    });

    // Chi-square-ish deviation: sum((observed - expected_count)^2 /
    // expected_count) — a crude fairness signal. High numbers with
    // low samples are meaningless; the UI hides the metric below the
    // sample threshold.
    let chiSquare = 0;
    for (const r of rarityRows) {
      const expectedCount = r.expected_pct * total;
      if (expectedCount > 0) {
        chiSquare += ((r.observed - expectedCount) ** 2) / expectedCount;
      }
    }

    return {
      tier: t.tier,
      display_name: t.display_name,
      enabled: t.enabled,
      total_pulls: total,
      rarities: rarityRows,
      chi_square: chiSquare,
      enough_samples: total >= MIN_SAMPLES,
    };
  });

  // ── Multi-kind: verifiable_draws aggregated per kind ──────────────
  //
  // verifiable_draws can have different weights per draw (different
  // pack pools, different spin wheels, etc), so "expected distribution
  // for pack_open" isn't a single vector. We compute it by summing each
  // draw's weight contribution: expected[key] = Σ weight_i[key] across
  // draws. Observed is the raw count of draws whose outcome.picked=key
  // (or slot outcomes for multi-slot draws like packs).
  //
  // Variable-weights aggregation is mathematically sound: each draw
  // contributes its own probabilities to the expected total.
  const drawRes = await query(
    `SELECT kind, weights, outcome, num_slots
       FROM verifiable_draws
      WHERE revealed_at >= NOW() - make_interval(days => $1)
        AND outcome IS NOT NULL`,
    [WINDOW_DAYS],
  );

  type KindAgg = {
    expected: Record<string, number>;
    observed: Record<string, number>;
    draws: number;
    slotTotal: number; // total slots rolled (packs count 5× draws)
  };
  const perKindAgg = new Map<string, KindAgg>();

  for (const row of drawRes.rows) {
    const agg = perKindAgg.get(row.kind) ?? { expected: {}, observed: {}, draws: 0, slotTotal: 0 };
    const weights: Record<string, number> = row.weights ?? {};
    const numSlots: number = row.num_slots ?? 1;
    const outcome = row.outcome as { picked?: string; slots?: Array<{ picked: string }> } | null;

    // Sum expected contributions for every slot rolled.
    for (const [key, w] of Object.entries(weights)) {
      agg.expected[key] = (agg.expected[key] ?? 0) + w * numSlots;
    }
    agg.slotTotal += numSlots;
    agg.draws += 1;

    // Observed: single vs multi-slot.
    if (outcome) {
      if (outcome.slots) {
        for (const slot of outcome.slots) {
          agg.observed[slot.picked] = (agg.observed[slot.picked] ?? 0) + 1;
        }
      } else if (outcome.picked != null) {
        agg.observed[outcome.picked] = (agg.observed[outcome.picked] ?? 0) + 1;
      }
    }

    perKindAgg.set(row.kind, agg);
  }

  const perDrawKind = Array.from(perKindAgg.entries()).map(([kind, agg]) => {
    // Union of outcome keys seen in either expected or observed. For
    // weight keys that are opaque ids (pool row ids, segment indices),
    // the UI can show them as-is; surfaces wanting human labels
    // should derive them at render time from their own lookups.
    const keys = new Set([...Object.keys(agg.expected), ...Object.keys(agg.observed)]);
    const totalObs = Object.values(agg.observed).reduce((s, n) => s + n, 0);

    const rows = Array.from(keys).map((key) => {
      const expectedCount = agg.expected[key] ?? 0;
      const observedCount = agg.observed[key] ?? 0;
      return {
        key,
        expected_count: expectedCount,
        observed_count: observedCount,
        expected_pct: agg.slotTotal > 0 ? expectedCount / agg.slotTotal : 0,
        observed_pct: totalObs > 0 ? observedCount / totalObs : 0,
      };
    });

    // Chi-square across keys where expected > 0.
    let chiSquare = 0;
    for (const r of rows) {
      if (r.expected_count > 0) {
        chiSquare += ((r.observed_count - r.expected_count) ** 2) / r.expected_count;
      }
    }

    // Sort rows by observed count so the dominant outcomes surface first;
    // the long tail of opaque keys isn't visually informative.
    rows.sort((a, b) => b.observed_count - a.observed_count);

    return {
      kind,
      draw_count: agg.draws,
      slot_total: agg.slotTotal,
      rows: rows.slice(0, 12), // cap the tail so the UI stays readable
      chi_square: chiSquare,
      enough_samples: agg.slotTotal >= MIN_SAMPLES,
    };
  });

  return NextResponse.json({
    window_days: WINDOW_DAYS,
    min_samples_for_signal: MIN_SAMPLES,
    per_tier: perTier,
    per_draw_kind: perDrawKind,
  });
}
