/**
 * Tests for @cambridge-tcg/visit — the Daily Flame's pure-compute core.
 *
 * Coverage:
 *   1. Day/week helpers — daysBetween, addDays, assertDay, isoWeekOf (known
 *      ISO 8601 fixtures + week-boundary relations)
 *   2. advanceFlame — started / already_today / extended / ember_spent /
 *      reset, plus the one-ember-per-ISO-week accounting
 *   3. computeFlame — the audit-grade replay: lit/waiting/unlit states,
 *      ember receipts, duplicate/unsorted/future-day inputs, equivalence
 *      with advanceFlame by construction and by observation
 *   4. DAILY_PACK_TABLE — integer weights, sum invariant, unique keys, and
 *      THE jsonb-key-order invariant (insertion order must equal Postgres
 *      jsonb order — length asc, then bytewise — or /verify/draw/[id]'s
 *      recompute walks different cumulative ranges than the server's roll)
 *   5. outcomeForRoll — byte-equivalent mirror of bounty/rng.ts pickWeighted
 *      (algorithm replicated verbatim here as the reference)
 *   6. oddsAsPublished — exact reduced fractions, percent strings, totals
 *   7. Quests — ISO-week scoping, distinct-subject counting, subjectless
 *      boost events, completion caps, every v1 quest purchase-free
 *   8. Badges — BADGE_CONDITIONS completeness both directions, milestone
 *      consistency, earnedBadges scenarios, tier vocabulary
 */

import { describe, it, expect } from "vitest";

import {
  // days & weeks
  daysBetween,
  addDays,
  assertDay,
  isoWeekOf,
  // flame
  EMBERS_PER_WEEK,
  FLAME_PROMISE,
  emptyFlame,
  advanceFlame,
  computeFlame,
  type FlameState,
  // daily pack
  WEIGHT_TOTAL,
  DAILY_PACK_TABLE,
  GOLDEN_SPARK_BONUS_SHARDS,
  dailyPackWeights,
  packRewardByKey,
  outcomeForRoll,
  oddsAsPublished,
  // quests
  WEEKLY_QUESTS,
  questByKey,
  questsForEvent,
  evaluateQuests,
  type QuestEvent,
  // badges
  BADGES,
  badgeByKey,
  SHARDWROUGHT_THRESHOLD,
  FLAME_MILESTONE_BADGES,
  flameMilestoneBadges,
  BADGE_CONDITIONS,
  meetsBadgeCondition,
  earnedBadges,
  type VisitStats,
} from "../index";

// ── 1. Day & week helpers ───────────────────────────────────────────────────

describe("day helpers", () => {
  it("daysBetween counts whole days, signed", () => {
    expect(daysBetween("2026-06-09", "2026-06-10")).toBe(1);
    expect(daysBetween("2026-06-10", "2026-06-09")).toBe(-1);
    expect(daysBetween("2026-06-09", "2026-06-09")).toBe(0);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1); // 2026 not a leap year
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // 2024 is
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
  });

  it("addDays shifts across month/year boundaries", () => {
    expect(addDays("2026-06-10", -1)).toBe("2026-06-09");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-06-09", 0)).toBe("2026-06-09");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("assertDay accepts real YYYY-MM-DD days", () => {
    expect(() => assertDay("2026-06-09")).not.toThrow();
    expect(() => assertDay("2024-02-29")).not.toThrow();
  });

  it("assertDay rejects malformed and impossible dates loudly", () => {
    for (const bad of ["2026-6-9", "09-06-2026", "2026-06-09T00:00:00Z", "", "yesterday", "2026-02-31", "2026-13-01", "2025-02-29"]) {
      expect(() => assertDay(bad), bad).toThrow(TypeError);
    }
  });

  it("isoWeekOf matches known ISO 8601 fixtures", () => {
    // Classic ISO edges, all independently checkable:
    expect(isoWeekOf("2021-01-01")).toBe("2020-W53"); // Fri → belongs to 2020's last week
    expect(isoWeekOf("2024-12-30")).toBe("2025-W01"); // Mon → already 2025-W01
    expect(isoWeekOf("2026-01-01")).toBe("2026-W01"); // Thu → week 1 by definition
    expect(isoWeekOf("2026-01-04")).toBe("2026-W01"); // Sun, same week
    expect(isoWeekOf("2026-01-05")).toBe("2026-W02"); // Mon, next week
  });

  it("isoWeekOf turns over on Monday, not Sunday", () => {
    // 2026-06-08 is a Monday.
    expect(isoWeekOf("2026-06-07")).not.toBe(isoWeekOf("2026-06-08"));
    expect(isoWeekOf("2026-06-08")).toBe(isoWeekOf("2026-06-14")); // Mon..Sun same key
  });
});

// ── 2. advanceFlame ─────────────────────────────────────────────────────────

describe("advanceFlame", () => {
  it("starts a flame at 1 from null or empty state", () => {
    const a = advanceFlame(null, "2026-06-09");
    expect(a.event).toBe("started");
    expect(a.state.length).toBe(1);
    expect(a.state.lastDay).toBe("2026-06-09");

    const b = advanceFlame(emptyFlame(), "2026-06-09");
    expect(b.event).toBe("started");
    expect(b.state.length).toBe(1);
  });

  it("is idempotent for a same-day re-check-in", () => {
    const a = advanceFlame(null, "2026-06-09");
    const b = advanceFlame(a.state, "2026-06-09");
    expect(b.event).toBe("already_today");
    expect(b.state.length).toBe(1);
    expect(b.state.lastDay).toBe("2026-06-09");
  });

  it("extends on consecutive days", () => {
    let s = advanceFlame(null, "2026-06-08").state;
    const adv = advanceFlame(s, "2026-06-09");
    expect(adv.event).toBe("extended");
    expect(adv.state.length).toBe(2);
  });

  it("shields a single missed day with the weekly ember", () => {
    const s = advanceFlame(null, "2026-06-08").state; // Mon
    const adv = advanceFlame(s, "2026-06-10"); // Wed — Tue missed
    expect(adv.event).toBe("ember_spent");
    expect(adv.state.length).toBe(2);
    expect(adv.state.embersUsedWeek).toBe(1);
  });

  it("resets (cost: nothing) when the gap exceeds one missed day", () => {
    const s = advanceFlame(null, "2026-06-01").state;
    const adv = advanceFlame(s, "2026-06-09");
    expect(adv.event).toBe("reset");
    expect(adv.state.length).toBe(1);
    // shards untouched — losing the flame debits nothing:
    expect(adv.state.shards).toBe(s.shards);
  });

  it("allows only EMBERS_PER_WEEK shields per ISO week", () => {
    // Mon 2026-06-08 … all within ISO week 2026-W24
    let s = advanceFlame(null, "2026-06-08").state;
    let adv = advanceFlame(s, "2026-06-10"); // Tue missed → ember
    expect(adv.event).toBe("ember_spent");
    adv = advanceFlame(adv.state, "2026-06-12"); // Thu missed → no ember left
    expect(adv.event).toBe("reset");
    expect(adv.state.length).toBe(1);
  });

  it("regrants the ember when the ISO week turns", () => {
    // Thu 2026-06-11 (W24) → skip Fri → Sat 2026-06-13: ember 1 spent in W24.
    let s = advanceFlame(null, "2026-06-11").state;
    let adv = advanceFlame(s, "2026-06-13");
    expect(adv.event).toBe("ember_spent");
    // Sun 2026-06-14 extends; skip Mon 2026-06-15 (W25); Tue 2026-06-16 → fresh ember.
    adv = advanceFlame(adv.state, "2026-06-14");
    expect(adv.event).toBe("extended");
    adv = advanceFlame(adv.state, "2026-06-16");
    expect(adv.event).toBe("ember_spent");
    expect(adv.state.length).toBe(4); // 11,(12),13,14,(15),16 → 4 check-ins counted... see note
  });
});

// ── 3. computeFlame — the audit-grade replay ────────────────────────────────

describe("computeFlame", () => {
  const today = "2026-06-10"; // Wednesday, ISO week 2026-W24

  it("returns an unlit zero-flame for empty history", () => {
    expect(computeFlame([], today)).toEqual({
      length: 0,
      embersLeft: EMBERS_PER_WEEK,
      state: "unlit",
      lastCheckIn: null,
      emberDays: [],
    });
  });

  it("is lit with length 1 on a first check-in today", () => {
    const f = computeFlame([today], today);
    expect(f).toMatchObject({ length: 1, state: "lit", lastCheckIn: today });
  });

  it("counts consecutive days and reports lit", () => {
    const f = computeFlame(["2026-06-07", "2026-06-08", "2026-06-09", "2026-06-10"], today);
    expect(f).toMatchObject({ length: 4, state: "lit", embersLeft: 1, emberDays: [] });
  });

  it("is waiting (not broken) when yesterday was the last check-in", () => {
    const f = computeFlame(["2026-06-08", "2026-06-09"], today);
    expect(f).toMatchObject({ length: 2, state: "waiting", lastCheckIn: "2026-06-09" });
  });

  it("waits on a one-day gap only while an ember is available", () => {
    // Last check-in Mon 06-08; Tue missed; today Wed. Ember free → waiting.
    const canBridge = computeFlame(["2026-06-07", "2026-06-08"], today);
    expect(canBridge.state).toBe("waiting");
    expect(canBridge.embersLeft).toBe(1);

    // Same shape but the week's ember already spent (Tue 06-02 missed → shielded
    // Wed 06-03 of the SAME ISO week? No — different week). Build it in-week:
    // W24: Mon 08 checked, Tue 09 missed+shielded by check-in Wed 10 — then
    // evaluate Fri 12 with Thu 11 missed: ember used, gap 2 → unlit.
    const spent = computeFlame(["2026-06-08", "2026-06-10"], "2026-06-12");
    expect(spent.embersLeft).toBe(0);
    expect(spent.state).toBe("unlit");
    expect(spent.length).toBe(0);
  });

  it("shields a single missed day and reports the ember receipt", () => {
    const f = computeFlame(["2026-06-07", "2026-06-09", "2026-06-10"], today);
    expect(f).toMatchObject({ length: 3, state: "lit", embersLeft: 0 });
    expect(f.emberDays).toEqual(["2026-06-08"]);
  });

  it("resets to a fresh flame after an unshieldable gap, costing nothing", () => {
    const f = computeFlame(["2026-06-01", "2026-06-02", "2026-06-09", "2026-06-10"], today);
    expect(f).toMatchObject({ length: 2, state: "lit" });
  });

  it("reports unlit with length 0 when the flame has gone cold", () => {
    const f = computeFlame(["2026-06-01", "2026-06-02"], today);
    expect(f).toMatchObject({ length: 0, state: "unlit", lastCheckIn: "2026-06-02" });
  });

  it("ignores duplicates, ordering, and days after today", () => {
    const messy = ["2026-06-10", "2026-06-09", "2026-06-09", "2026-06-08", "2026-07-01"];
    const clean = ["2026-06-08", "2026-06-09", "2026-06-10"];
    expect(computeFlame(messy, today)).toEqual(computeFlame(clean, today));
  });

  it("throws on malformed history rather than computing nonsense", () => {
    expect(() => computeFlame(["2026-6-9"], today)).toThrow(TypeError);
    expect(() => computeFlame(["2026-06-09"], "tomorrow")).toThrow(TypeError);
  });

  it("regrants the ember in a new ISO week", () => {
    // Ember spent in W24 (Tue 09 missed). Evaluated Mon 2026-06-15 (W25):
    // last check-in Sun 14 → waiting, ember fresh.
    const f = computeFlame(["2026-06-08", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"], "2026-06-15");
    expect(f).toMatchObject({ state: "waiting", embersLeft: 1, length: 6 });
    expect(f.emberDays).toEqual(["2026-06-09"]);
  });

  it("agrees with a straight advanceFlame fold over the same days", () => {
    const days = ["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-05", "2026-06-08", "2026-06-09", "2026-06-10"];
    let s: FlameState | null = null;
    for (const d of days) s = advanceFlame(s, d).state;
    const f = computeFlame(days, today);
    expect(f.length).toBe(s!.length);
    expect(f.lastCheckIn).toBe(s!.lastDay);
  });

  it("publishes the anti-guilt promise verbatim", () => {
    expect(FLAME_PROMISE).toBe(
      "The flame is for joy, not obligation — it never costs you anything to lose it.",
    );
  });
});

// ── 4. The reward table ─────────────────────────────────────────────────────

describe("DAILY_PACK_TABLE", () => {
  it("uses positive integer weights that sum to WEIGHT_TOTAL", () => {
    for (const r of DAILY_PACK_TABLE) {
      expect(Number.isInteger(r.weight), r.key).toBe(true);
      expect(r.weight, r.key).toBeGreaterThan(0);
    }
    expect(DAILY_PACK_TABLE.reduce((s, r) => s + r.weight, 0)).toBe(WEIGHT_TOTAL);
  });

  it("has unique keys and non-empty labels/messages", () => {
    const keys = DAILY_PACK_TABLE.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of DAILY_PACK_TABLE) {
      expect(r.label.trim().length, r.key).toBeGreaterThan(0);
      expect(r.message.trim().length, r.key).toBeGreaterThan(0);
    }
  });

  it("keeps insertion order equal to Postgres jsonb key order (verifier invariant)", () => {
    // jsonb object keys come back shorter-first, ties bytewise. The verify
    // page recomputes pickWeighted over the JSONB-stored weights; the server
    // rolls over insertion order. These must be the same walk.
    const keys = DAILY_PACK_TABLE.map((r) => r.key);
    const jsonbOrder = [...keys].sort((a, b) =>
      a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
    );
    expect(keys).toEqual(jsonbOrder);
  });

  it("dailyPackWeights mirrors the table exactly, in table order", () => {
    const w = dailyPackWeights();
    expect(Object.keys(w)).toEqual(DAILY_PACK_TABLE.map((r) => r.key));
    for (const r of DAILY_PACK_TABLE) expect(w[r.key]).toBe(r.weight);
  });

  it("packRewardByKey finds every key and misses unknowns", () => {
    for (const r of DAILY_PACK_TABLE) expect(packRewardByKey(r.key)).toBe(r);
    expect(packRewardByKey("nope")).toBeUndefined();
    expect(GOLDEN_SPARK_BONUS_SHARDS).toBeGreaterThan(0);
  });

  it("every reward is grantable for free — no purchase-gated outcome", () => {
    // The pack itself is free; values are gifts (credit/shards/boost/spark),
    // never a discount-on-purchase or other spend-to-redeem shape.
    for (const r of DAILY_PACK_TABLE) {
      expect(["spark", "badge_shard", "quest_boost", "credit"]).toContain(r.kind);
    }
  });
});

// ── 5. outcomeForRoll mirrors pickWeighted ──────────────────────────────────

/**
 * Reference copy of pickWeighted from apps/storefront/src/lib/bounty/rng.ts —
 * replicated verbatim so this suite fails if the package's mirror drifts.
 */
function referencePickWeighted<T extends string>(weights: Record<T, number>, roll: number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let cursor = roll * total;
  for (const [key, w] of entries) {
    cursor -= w;
    if (cursor <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

describe("outcomeForRoll", () => {
  it("matches the reference pickWeighted across the whole [0,1) range", () => {
    const weights = dailyPackWeights();
    for (let i = 0; i < 1000; i++) {
      const roll = i / 1000 + 0.0004; // interior points of each per-mille band
      expect(outcomeForRoll(roll).key, `roll=${roll}`).toBe(referencePickWeighted(weights, roll));
    }
  });

  it("matches the reference at exact cumulative boundaries", () => {
    const boundaries: number[] = [];
    let acc = 0;
    for (const r of DAILY_PACK_TABLE) {
      acc += r.weight;
      boundaries.push(acc / WEIGHT_TOTAL);
    }
    for (const b of boundaries.filter((x) => x < 1)) {
      expect(outcomeForRoll(b).key, `boundary=${b}`).toBe(referencePickWeighted(dailyPackWeights(), b));
    }
    expect(outcomeForRoll(0).key).toBe(DAILY_PACK_TABLE[0].key);
    expect(outcomeForRoll(0.9999999).key).toBe(DAILY_PACK_TABLE[DAILY_PACK_TABLE.length - 1].key);
  });

  it("rejects rolls outside [0,1)", () => {
    for (const bad of [-0.1, 1, 1.5, NaN, Infinity]) {
      expect(() => outcomeForRoll(bad)).toThrow(RangeError);
    }
  });
});

// ── 6. oddsAsPublished ──────────────────────────────────────────────────────

describe("oddsAsPublished", () => {
  it("publishes one row per reward, in table order, weights byte-identical", () => {
    const odds = oddsAsPublished();
    expect(odds.map((o) => o.key)).toEqual(DAILY_PACK_TABLE.map((r) => r.key));
    odds.forEach((o, i) => {
      expect(o.weight).toBe(DAILY_PACK_TABLE[i].weight);
      expect(o.outOf).toBe(WEIGHT_TOTAL);
    });
  });

  it("reduces fractions exactly: numerator/denominator === weight/outOf in lowest terms", () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    for (const o of oddsAsPublished()) {
      // Exact equality as cross-multiplication — no floats:
      expect(o.numerator * o.outOf).toBe(o.weight * o.denominator);
      expect(gcd(o.numerator, o.denominator)).toBe(1);
      expect(o.fraction).toBe(`${o.numerator}/${o.denominator}`);
    }
  });

  it("publishes the expected exact fractions for the current table", () => {
    const byKey = Object.fromEntries(oddsAsPublished().map((o) => [o.key, o.fraction]));
    expect(byKey).toEqual({
      spark: "3/5",
      shard_1: "1/5",
      credit_50: "3/50",
      credit_200: "19/1000",
      quest_boost: "3/25",
      golden_spark: "1/1000",
    });
  });

  it("odds sum to exactly 1 (as weights over the common denominator)", () => {
    const odds = oddsAsPublished();
    expect(odds.reduce((s, o) => s + o.weight, 0)).toBe(odds[0].outOf);
    expect(odds.reduce((s, o) => s + o.perThousand, 0)).toBe(1000);
  });
});

// ── 7. Quests ───────────────────────────────────────────────────────────────

describe("weekly quests", () => {
  const today = "2026-06-10"; // ISO week 2026-W24 (Mon 06-08 .. Sun 06-14)

  it("have unique keys, positive integer targets, and shard rewards", () => {
    const keys = WEEKLY_QUESTS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const q of WEEKLY_QUESTS) {
      expect(Number.isInteger(q.target), q.key).toBe(true);
      expect(q.target, q.key).toBeGreaterThanOrEqual(1);
      expect(q.rewardShards, q.key).toBeGreaterThanOrEqual(1);
    }
  });

  it("are all completable without spending money (v1 guarantee)", () => {
    // Every v1 quest progresses on browse/check/open/trade-in events — no
    // event requires a purchase. Guard the event vocabulary:
    const freeEvents = ["browse_set", "price_check", "open_verifier", "trade_in_completed"];
    for (const q of WEEKLY_QUESTS) expect(freeEvents, q.key).toContain(q.event);
  });

  it("questByKey / questsForEvent resolve as expected", () => {
    expect(questByKey("open_verifier")?.title).toBe("Trust, verified");
    expect(questByKey("nope")).toBeUndefined();
    expect(questsForEvent("browse_set").map((q) => q.key)).toEqual(["browse_sets"]);
  });

  it("counts distinct subjects for browse_sets — same set twice is one step", () => {
    const events: QuestEvent[] = [
      { event: "browse_set", day: "2026-06-08", subject: "OP01" },
      { event: "browse_set", day: "2026-06-09", subject: "OP01" },
      { event: "browse_set", day: "2026-06-09", subject: "OP05" },
    ];
    const p = evaluateQuests(events, today).find((x) => x.quest.key === "browse_sets")!;
    expect(p.raw).toBe(2);
    expect(p.complete).toBe(false);
  });

  it("lets subjectless boost events count one step each", () => {
    const events: QuestEvent[] = [
      { event: "browse_set", day: "2026-06-08", subject: "OP01" },
      { event: "browse_set", day: "2026-06-09" }, // quest boost, no subject
      { event: "browse_set", day: "2026-06-10", subject: null },
    ];
    const p = evaluateQuests(events, today).find((x) => x.quest.key === "browse_sets")!;
    expect(p.raw).toBe(3);
    expect(p.complete).toBe(true);
  });

  it("only counts events from today's ISO week", () => {
    const events: QuestEvent[] = [
      { event: "price_check", day: "2026-06-07" }, // Sunday of W23 — out
      { event: "price_check", day: "2026-06-08" }, // Monday of W24 — in
    ];
    const p = evaluateQuests(events, today).find((x) => x.quest.key === "price_check")!;
    expect(p.raw).toBe(1);
    expect(p.complete).toBe(true);
  });

  it("caps progress at target while reporting the raw count honestly", () => {
    const events: QuestEvent[] = Array.from({ length: 7 }, (_, i) => ({
      event: "browse_set",
      day: "2026-06-09",
      subject: `SET${i}`,
    }));
    const p = evaluateQuests(events, today).find((x) => x.quest.key === "browse_sets")!;
    expect(p.progress).toBe(3);
    expect(p.raw).toBe(7);
    expect(p.complete).toBe(true);
  });

  it("returns a row for every quest even with no events", () => {
    const all = evaluateQuests([], today);
    expect(all.map((p) => p.quest.key)).toEqual(WEEKLY_QUESTS.map((q) => q.key));
    for (const p of all) expect(p).toMatchObject({ progress: 0, raw: 0, complete: false });
  });
});

// ── 8. Badges ───────────────────────────────────────────────────────────────

const NO_STATS: VisitStats = {
  flameLength: 0,
  embersSpent: 0,
  shards: 0,
  questsCompletedInWeek: 0,
  questsEverCompleted: [],
  packOutcomesDrawn: [],
};

describe("badges", () => {
  it("have unique keys and a valid tier vocabulary", () => {
    const keys = BADGES.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const b of BADGES) {
      expect(["common", "uncommon", "rare", "secret"], b.key).toContain(b.tier);
    }
    expect(badgeByKey("first_flame")?.tier).toBe("common");
    expect(badgeByKey("nope")).toBeUndefined();
  });

  it("BADGE_CONDITIONS is complete in both directions", () => {
    for (const b of BADGES) {
      expect(BADGE_CONDITIONS[b.key], `missing condition for badge "${b.key}"`).toBeTruthy();
    }
    const badgeKeys = new Set(BADGES.map((b) => b.key));
    for (const key of Object.keys(BADGE_CONDITIONS)) {
      expect(badgeKeys.has(key), `condition for unknown badge "${key}"`).toBe(true);
    }
  });

  it("badge condition references resolve (quests, pack rewards, milestones)", () => {
    for (const [key, cond] of Object.entries(BADGE_CONDITIONS)) {
      if (cond.kind === "quest_completed") {
        expect(questByKey(cond.questKey), key).toBeTruthy();
      }
      if (cond.kind === "pack_outcome_drawn") {
        expect(packRewardByKey(cond.rewardKey), key).toBeTruthy();
      }
    }
    // FLAME_MILESTONE_BADGES and flame_length conditions agree:
    for (const m of FLAME_MILESTONE_BADGES) {
      const cond = BADGE_CONDITIONS[m.badgeKey];
      expect(cond).toEqual({ kind: "flame_length", atLeast: m.length });
    }
  });

  it("earns nothing from zero stats and everything from saturated stats", () => {
    expect(earnedBadges(NO_STATS)).toEqual([]);
    const everything: VisitStats = {
      flameLength: 1000,
      embersSpent: 5,
      shards: 100,
      questsCompletedInWeek: WEEKLY_QUESTS.length,
      questsEverCompleted: WEEKLY_QUESTS.map((q) => q.key),
      packOutcomesDrawn: DAILY_PACK_TABLE.map((r) => r.key),
    };
    expect(earnedBadges(everything)).toEqual(BADGES.map((b) => b.key));
  });

  it("awards flame milestones at exactly their thresholds", () => {
    expect(flameMilestoneBadges(0)).toEqual([]);
    expect(flameMilestoneBadges(1)).toEqual(["first_flame"]);
    expect(flameMilestoneBadges(7)).toEqual(["first_flame", "week_flame"]);
    expect(flameMilestoneBadges(29)).toEqual(["first_flame", "week_flame"]);
    expect(flameMilestoneBadges(30)).toEqual(["first_flame", "week_flame", "month_flame"]);
    expect(flameMilestoneBadges(100)).toEqual(["first_flame", "week_flame", "month_flame", "century_flame"]);
  });

  it("awards scenario badges from the matching stat", () => {
    expect(earnedBadges({ ...NO_STATS, embersSpent: 1 })).toContain("ember_saved");
    expect(earnedBadges({ ...NO_STATS, shards: SHARDWROUGHT_THRESHOLD })).toContain("shardwrought");
    expect(earnedBadges({ ...NO_STATS, questsEverCompleted: ["open_verifier"] })).toContain("trust_witness");
    expect(earnedBadges({ ...NO_STATS, questsCompletedInWeek: 4 })).toContain("quartet");
    expect(earnedBadges({ ...NO_STATS, packOutcomesDrawn: ["golden_spark"] })).toContain("first_light");
    expect(
      meetsBadgeCondition({ kind: "flame_length", atLeast: 7 }, { ...NO_STATS, flameLength: 6 }),
    ).toBe(false);
  });
});
