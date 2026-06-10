// @cambridge-tcg/visit — the Daily Flame's pure-compute core.
//
// Yu's commission: "lets gamify cambridgetcg! module and process! Make the
// visit rewarding and fun!"
//
// This package is the single source of truth for every rule of the visit-
// rewards loop: how the flame grows, when an ember saves it, what the daily
// pack can contain (and at what odds), which weekly quests exist, and which
// badges can be earned. The API routes in apps/storefront/src/app/api/visit/
// execute these rules; the /rewards/rules page publishes them. Both import
// from HERE, so the odds the user reads are byte-for-byte the weights the
// server rolls. That identity is the transparency claim — don't fork it.
//
// Deliberately zero-dependency and database-free, like @cambridge-tcg/pricing:
// pure functions over plain values, so the same rules are testable, auditable,
// and publishable without a connection string.
//
// Anti-guilt by design (the part that is policy, not code): the flame is for
// joy, not obligation. Losing it never costs anything — no balance is
// debited, no tier drops, no quest locks. An ember (one per ISO week,
// automatic) shields a single missed day before the flame resets. The reset
// itself is just a number returning to 1.

// ── Days and weeks ─────────────────────────────────────────────────────────
//
// A "day" everywhere in this module is a calendar date string `YYYY-MM-DD`
// as the *database* sees it (CURRENT_DATE, UTC on our RDS). The routes pass
// the DB's date in; this package never consults a wall clock. One clock, the
// database's — that's the substrate-honesty stance on time here.

/** Parse a `YYYY-MM-DD` string as a UTC timestamp (ms). */
function dayToUtcMs(day: string): number {
  const [y, m, d] = day.split("-").map((s) => parseInt(s, 10));
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `a` to `b` (positive when b is after a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayToUtcMs(b) - dayToUtcMs(a)) / 86_400_000);
}

/**
 * Throw a TypeError unless `day` is a real calendar date in `YYYY-MM-DD`
 * form (rejects both `2026-6-9` and impossible dates like `2026-02-31`).
 * Used by the audit-grade entry points (`computeFlame`) where inputs come
 * from history a user may be recomputing — garbage must be loud, not NaN.
 */
export function assertDay(day: string): void {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new TypeError(`not a YYYY-MM-DD day: ${JSON.stringify(day)}`);
  const [y, mo, d] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  const round = new Date(Date.UTC(y, mo - 1, d));
  if (round.getUTCFullYear() !== y || round.getUTCMonth() !== mo - 1 || round.getUTCDate() !== d) {
    throw new TypeError(`not a real calendar date: ${day}`);
  }
}

/** `day` shifted by `delta` whole days (pure UTC arithmetic, no clock). */
export function addDays(day: string, delta: number): string {
  return new Date(dayToUtcMs(day) + delta * 86_400_000).toISOString().slice(0, 10);
}

/**
 * ISO 8601 week key for a `YYYY-MM-DD` day, e.g. "2026-W24".
 * Weeks start Monday; week 1 contains the year's first Thursday.
 * Used for the ember allowance (one per week) and quest periods.
 */
export function isoWeekOf(day: string): string {
  const date = new Date(dayToUtcMs(day));
  // Shift to the Thursday of this week — its year is the ISO week-year.
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4DayNum = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4DayNum * 86_400_000;
  const week = Math.floor((date.getTime() - week1Monday) / (7 * 86_400_000)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// ── The flame ──────────────────────────────────────────────────────────────

export const EMBERS_PER_WEEK = 1;

export interface FlameState {
  /** Consecutive-day count, ember-shielded days included. 0 = never lit. */
  length: number;
  /** Embers spent during `emberWeek`. Resets implicitly when the week turns. */
  embersUsedWeek: number;
  /** ISO week key (`isoWeekOf`) that `embersUsedWeek` refers to. */
  emberWeek: string | null;
  /** Last day (YYYY-MM-DD, DB clock) a check-in landed. */
  lastDay: string | null;
  /** Badge shards collected from daily packs / quests. */
  shards: number;
}

export type FlameEvent =
  | "started" // first check-in ever (or after a reset day-zero state)
  | "already_today" // idempotent re-check-in; nothing changed
  | "extended" // checked in the day after lastDay
  | "ember_spent" // one missed day, shielded automatically by this week's ember
  | "reset"; // gap too wide / no ember left — flame returns to 1, cost: nothing

export interface FlameAdvance {
  state: FlameState;
  event: FlameEvent;
}

export function emptyFlame(): FlameState {
  return { length: 0, embersUsedWeek: 0, emberWeek: null, lastDay: null, shards: 0 };
}

/**
 * Advance a flame for a check-in on `today` (YYYY-MM-DD, the DB's date).
 * Pure: returns the next state + what happened, mutates nothing.
 *
 * Rules:
 *   same day            → unchanged            (idempotent)
 *   gap of 1 day        → length + 1           (continued)
 *   gap of 2 days       → ember if available:  length + 1, ember spent
 *                         (the single missed day is shielded, automatically)
 *   wider gap / no ember→ length = 1           (reset — costs nothing)
 */
export function advanceFlame(prev: FlameState | null, today: string): FlameAdvance {
  const base = prev ?? emptyFlame();
  const week = isoWeekOf(today);
  const embersUsed = base.emberWeek === week ? base.embersUsedWeek : 0;

  if (base.lastDay === null || base.length === 0) {
    return {
      state: { ...base, length: 1, lastDay: today, embersUsedWeek: embersUsed, emberWeek: week },
      event: "started",
    };
  }

  const gap = daysBetween(base.lastDay, today);

  if (gap <= 0) {
    return { state: { ...base, embersUsedWeek: embersUsed, emberWeek: week }, event: "already_today" };
  }
  if (gap === 1) {
    return {
      state: { ...base, length: base.length + 1, lastDay: today, embersUsedWeek: embersUsed, emberWeek: week },
      event: "extended",
    };
  }
  if (gap === 2 && embersUsed < EMBERS_PER_WEEK) {
    return {
      state: {
        ...base,
        length: base.length + 1,
        lastDay: today,
        embersUsedWeek: embersUsed + 1,
        emberWeek: week,
      },
      event: "ember_spent",
    };
  }
  return {
    state: { ...base, length: 1, lastDay: today, embersUsedWeek: embersUsed, emberWeek: week },
    event: "reset",
  };
}

/**
 * The anti-guilt sentence, verbatim, as /rewards/rules publishes it.
 * Single source of truth so the copy can't drift from the policy.
 */
export const FLAME_PROMISE =
  "The flame is for joy, not obligation — it never costs you anything to lose it.";

/** What the flame looks like from `today`'s point of view. */
export type FlameGlow =
  | "lit" // checked in today
  | "waiting" // alive — a check-in today would extend it (directly or via this week's ember)
  | "unlit"; // no live flame; the next check-in starts a new one at 1 (cost: nothing)

export interface ComputedFlame {
  /** Length of the live flame. 0 when `state` is "unlit". */
  length: number;
  /** Embers still available in `today`'s ISO week (0..EMBERS_PER_WEEK). */
  embersLeft: number;
  state: FlameGlow;
  /** Most recent check-in on or before `today`, if any. */
  lastCheckIn: string | null;
  /** Missed days an ember shielded, oldest first — the "why is my flame alive" receipt. */
  emberDays: string[];
}

/**
 * Recompute a flame from raw check-in history — the audit-grade twin of
 * `advanceFlame`. Where `advanceFlame` is the incremental step the check-in
 * route runs, this replays the *same* step over the full history, so the two
 * can never disagree: anyone holding their check-in dates can recompute the
 * flame the platform shows them (the rules page's "recompute your own flame"
 * test cites this function).
 *
 * Pure and deterministic: `today` is passed in (YYYY-MM-DD on the DB clock),
 * never read from a wall clock. Duplicates and ordering in `checkInDates`
 * don't matter; days after `today` are ignored (they haven't happened from
 * the caller's point of view); malformed dates throw a TypeError.
 *
 * State semantics:
 *   "lit"     — `today` is in the history.
 *   "waiting" — the flame survives if a check-in lands today (gap of 1 day,
 *               or gap of 2 with an ember available this ISO week).
 *   "unlit"   — no live flame. `length` reports 0; the next check-in starts
 *               at 1. Losing the flame debits nothing (see FLAME_PROMISE).
 */
export function computeFlame(checkInDates: readonly string[], today: string): ComputedFlame {
  assertDay(today);
  for (const d of checkInDates) assertDay(d);

  const days = [...new Set(checkInDates)]
    .filter((d) => daysBetween(d, today) >= 0)
    .sort();

  let state: FlameState | null = null;
  const emberDays: string[] = [];
  for (const day of days) {
    const adv = advanceFlame(state, day);
    if (adv.event === "ember_spent") emberDays.push(addDays(day, -1));
    state = adv.state;
  }

  if (state === null || state.lastDay === null) {
    return { length: 0, embersLeft: EMBERS_PER_WEEK, state: "unlit", lastCheckIn: null, emberDays: [] };
  }

  const embersLeft =
    state.emberWeek === isoWeekOf(today)
      ? Math.max(0, EMBERS_PER_WEEK - state.embersUsedWeek)
      : EMBERS_PER_WEEK;

  const gap = daysBetween(state.lastDay, today);
  const alive = gap === 1 || (gap === 2 && embersLeft > 0);
  const glow: FlameGlow = gap === 0 ? "lit" : alive ? "waiting" : "unlit";

  return {
    length: glow === "unlit" ? 0 : state.length,
    embersLeft,
    state: glow,
    lastCheckIn: state.lastDay,
    emberDays,
  };
}

// ── The daily pack — reward table (THE published odds) ────────────────────
//
// One free weighted draw per signed-in visitor per day, rolled through the
// provable-draw substrate (verifiable_draws, kind 'daily_pack') — never
// Math.random. Weights are integers out of WEIGHT_TOTAL so a human can read
// them as "per thousand packs". The /rewards/rules page renders THIS array;
// the daily-pack route commits THESE weights into the draw row. If you tune
// an outcome, you have tuned the page, the roll, and the verifier together —
// which is the only honest way to tune it.

export type PackRewardKind = "spark" | "badge_shard" | "quest_boost" | "credit";

export interface PackReward {
  /** Stable key — committed into verifiable_draws.weights and outcome.picked. */
  key: string;
  kind: PackRewardKind;
  label: string;
  /** What lands, in the unit of `kind`: shards count, quest +progress, credit in GBP. Sparks carry 0. */
  value: number;
  /** Integer weight out of WEIGHT_TOTAL. */
  weight: number;
  /** The kind word shown with the outcome. Sparks are mostly this. */
  message: string;
}

export const WEIGHT_TOTAL = 1000;

// INVARIANT (verifier correctness — tested in __tests__): rows are ordered so
// that the keys' insertion order equals Postgres jsonb key order (shorter keys
// first, ties bytewise). `verifiable_draws.weights` is JSONB; when the
// /verify/draw/[id] page recomputes pickWeighted from the stored weights, it
// walks keys in jsonb order. If insertion order differed, the cumulative
// ranges would shift and an honest draw could fail verification. Same walk
// order on both sides = byte-for-byte reproducible outcome.
export const DAILY_PACK_TABLE: readonly PackReward[] = [
  {
    key: "spark",
    kind: "spark",
    label: "A spark",
    value: 0,
    weight: 600,
    message: "The flame glows a little brighter for your visit. Good to see you today.",
  },
  {
    key: "shard_1",
    kind: "badge_shard",
    label: "1 badge shard",
    value: 1,
    weight: 200,
    message: "A shard for the collection. Ten of these become something.",
  },
  {
    key: "credit_50",
    kind: "credit",
    label: "£0.50 store credit",
    value: 0.5,
    weight: 60,
    message: "Fifty pence of store credit, no strings.",
  },
  {
    key: "credit_200",
    kind: "credit",
    label: "£2.00 store credit",
    value: 2.0,
    weight: 19,
    message: "Two pounds of store credit. A good pull.",
  },
  {
    key: "quest_boost",
    kind: "quest_boost",
    label: "Quest boost (+1 progress)",
    value: 1,
    weight: 120,
    message: "One of this week's quests just moved forward on its own.",
  },
  {
    key: "golden_spark",
    kind: "credit",
    label: "The golden spark — £5.00 credit + 3 shards",
    value: 5.0,
    weight: 1,
    message: "The golden spark. One in a thousand packs. Today it was yours.",
  },
] as const;

/** Sanity: the table's weights must sum to WEIGHT_TOTAL. Checked at import. */
const _sum = DAILY_PACK_TABLE.reduce((s, r) => s + r.weight, 0);
if (_sum !== WEIGHT_TOTAL) {
  throw new Error(`DAILY_PACK_TABLE weights sum to ${_sum}, expected ${WEIGHT_TOTAL}`);
}

/** Shards riding along with the golden spark (in addition to its credit). */
export const GOLDEN_SPARK_BONUS_SHARDS = 3;

/**
 * The weights map handed to commitDraw — derived from DAILY_PACK_TABLE so the
 * committed `verifiable_draws.weights` JSONB is the same numbers the rules
 * page publishes. pickWeighted normalises internally; integers stay legible.
 */
export function dailyPackWeights(): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const r of DAILY_PACK_TABLE) weights[r.key] = r.weight;
  return weights;
}

export function packRewardByKey(key: string): PackReward | undefined {
  return DAILY_PACK_TABLE.find((r) => r.key === key);
}

/**
 * Map a roll in [0, 1) to its pack reward — a byte-equivalent mirror of
 * `pickWeighted` in apps/storefront/src/lib/bounty/rng.ts walked over
 * DAILY_PACK_TABLE order (== jsonb order, see the table invariant). This is
 * what lets the rules page answer its own test — "can you recompute your own
 * draw?" — without importing app code: take the revealed seeds, recompute the
 * roll, feed it here, compare. If this function and pickWeighted ever
 * disagree, a draw that was honest would fail verification; the mirror is
 * load-bearing, keep it identical.
 */
export function outcomeForRoll(roll: number): PackReward {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError(`roll must be in [0, 1), got ${roll}`);
  }
  let cursor = roll * WEIGHT_TOTAL;
  for (const r of DAILY_PACK_TABLE) {
    cursor -= r.weight;
    if (cursor <= 0) return r;
  }
  return DAILY_PACK_TABLE[DAILY_PACK_TABLE.length - 1];
}

/**
 * The odds exactly as /rewards/rules publishes them — derived from
 * DAILY_PACK_TABLE, the same array dailyPackWeights() feeds to commitDraw.
 * One source, two surfaces: the page renders this, the server rolls this.
 * They cannot disagree because neither holds its own copy.
 */
export interface PublishedOdds {
  key: string;
  kind: PackRewardKind;
  label: string;
  message: string;
  /** The integer weight committed into verifiable_draws.weights. */
  weight: number;
  /** What the weights sum to (WEIGHT_TOTAL). */
  outOf: number;
  /**
   * weight/outOf reduced to lowest terms — the EXACT odds, integer over
   * integer, no float in sight. 600/1000 publishes as 3/5; 1/1000 stays
   * 1/1000. `percent` below is the friendly reading; this is the truth.
   */
  numerator: number;
  denominator: number;
  /** The exact fraction as text, e.g. "3/5", "1/1000". */
  fraction: string;
  /** weight/outOf as a human percentage, e.g. "60%", "1.9%", "0.1%". */
  percent: string;
  /** weight/outOf as packs-per-thousand — the plain-words reading. */
  perThousand: number;
}

/** Greatest common divisor (Euclid), for exact fraction reduction. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function oddsAsPublished(): PublishedOdds[] {
  return DAILY_PACK_TABLE.map((r) => {
    const g = gcd(r.weight, WEIGHT_TOTAL);
    const numerator = r.weight / g;
    const denominator = WEIGHT_TOTAL / g;
    return {
      key: r.key,
      kind: r.kind,
      label: r.label,
      message: r.message,
      weight: r.weight,
      outOf: WEIGHT_TOTAL,
      numerator,
      denominator,
      fraction: `${numerator}/${denominator}`,
      percent: `${parseFloat(((r.weight / WEIGHT_TOTAL) * 100).toFixed(2))}%`,
      perThousand: Math.round((r.weight / WEIGHT_TOTAL) * 1000),
    };
  });
}

// ── Weekly quests — data-defined, no purchase required ─────────────────────
//
// Quests reset each ISO week (same week key as embers). Every quest in v1 is
// completable for free; "open the fairness verifier" deliberately teaches the
// trust surface — the quest that pays you to learn how to audit us.

export interface QuestDef {
  key: string;
  title: string;
  description: string;
  /** Progress needed to complete. */
  target: number;
  /** The event name routes report to award progress. */
  event: string;
  /** Shards awarded on completion. */
  rewardShards: number;
  /**
   * When true, progress counts DISTINCT `subject`s (e.g. three *different*
   * sets), not raw events. Events without a subject (e.g. a quest boost from
   * a daily pack) still count one step each — a boost is never wasted.
   */
  distinctSubjects?: boolean;
}

export const WEEKLY_QUESTS: readonly QuestDef[] = [
  {
    key: "browse_sets",
    title: "Set explorer",
    description: "Browse three different card sets this week.",
    target: 3,
    event: "browse_set",
    rewardShards: 1,
    distinctSubjects: true,
  },
  {
    key: "price_check",
    title: "Price checker",
    description: "Price-check any card this week.",
    target: 1,
    event: "price_check",
    rewardShards: 1,
  },
  {
    key: "open_verifier",
    title: "Trust, verified",
    description:
      "Open the fairness verifier once and see how any draw on this platform can be recomputed by you.",
    target: 1,
    event: "open_verifier",
    rewardShards: 2,
  },
  {
    key: "complete_trade_in",
    title: "Trade-in traveller",
    description: "Complete a trade-in submission this week.",
    target: 1,
    event: "trade_in_completed",
    rewardShards: 2,
  },
] as const;

export function questByKey(key: string): QuestDef | undefined {
  return WEEKLY_QUESTS.find((q) => q.key === key);
}

export function questsForEvent(event: string): QuestDef[] {
  return WEEKLY_QUESTS.filter((q) => q.event === event);
}

/**
 * One recorded quest-relevant action. Routes persist these; this package
 * only ever evaluates them. `subject` discriminates "different" things for
 * distinctSubjects quests (e.g. the set code for browse_set); null/absent
 * subjects each count one step (quest boosts arrive subjectless).
 */
export interface QuestEvent {
  /** Matches QuestDef.event. */
  event: string;
  /** YYYY-MM-DD on the DB clock — the day the action happened. */
  day: string;
  /** Optional discriminator for distinct counting. */
  subject?: string | null;
}

export interface QuestProgress {
  quest: QuestDef;
  /** Progress toward target, capped at target (what the UI bars show). */
  progress: number;
  /** Uncapped observed count — substrate honesty: you really did browse 7 sets. */
  raw: number;
  complete: boolean;
}

/**
 * Evaluate weekly quest progress from raw events — pure and deterministic.
 * Only events in `today`'s ISO week count (same week key as embers, so the
 * whole loop turns over on the same Monday). Events from other weeks are
 * ignored, not errors: callers may pass an unfiltered history and get the
 * current week's truth back.
 */
export function evaluateQuests(
  events: readonly QuestEvent[],
  today: string,
  defs: readonly QuestDef[] = WEEKLY_QUESTS,
): QuestProgress[] {
  const week = isoWeekOf(today);
  return defs.map((quest) => {
    const relevant = events.filter((e) => e.event === quest.event && isoWeekOf(e.day) === week);
    let raw: number;
    if (quest.distinctSubjects) {
      const subjects = new Set<string>();
      let subjectless = 0;
      for (const e of relevant) {
        if (e.subject == null) subjectless += 1;
        else subjects.add(e.subject);
      }
      raw = subjects.size + subjectless;
    } else {
      raw = relevant.length;
    }
    return { quest, progress: Math.min(raw, quest.target), raw, complete: raw >= quest.target };
  });
}

// ── Badges — the TCG-native collection ─────────────────────────────────────

export type BadgeTier = "common" | "uncommon" | "rare" | "secret";

export interface BadgeDef {
  key: string;
  tier: BadgeTier;
  title: string;
  description: string;
}

export const BADGES: readonly BadgeDef[] = [
  { key: "first_flame", tier: "common", title: "First flame", description: "Checked in for the first time." },
  { key: "week_flame", tier: "common", title: "Week of flame", description: "Kept the flame for 7 days." },
  { key: "month_flame", tier: "uncommon", title: "Month of flame", description: "Kept the flame for 30 days." },
  { key: "century_flame", tier: "rare", title: "Century flame", description: "Kept the flame for 100 days." },
  { key: "ember_saved", tier: "uncommon", title: "Saved by an ember", description: "An ember shielded your flame from a missed day." },
  { key: "trust_witness", tier: "uncommon", title: "Trust witness", description: "Completed the fairness-verifier quest — you know how to audit us now." },
  { key: "quartet", tier: "rare", title: "The quartet", description: "Completed all four weekly quests in a single week." },
  { key: "shardwrought", tier: "rare", title: "Shardwrought", description: "Collected 10 badge shards." },
  { key: "first_light", tier: "secret", title: "First light", description: "Drew the golden spark from a daily pack." },
] as const;

export function badgeByKey(key: string): BadgeDef | undefined {
  return BADGES.find((b) => b.key === key);
}

/** Shards needed for the `shardwrought` badge. */
export const SHARDWROUGHT_THRESHOLD = 10;

/** Flame-length milestones → badge keys, in ascending order. */
export const FLAME_MILESTONE_BADGES: ReadonlyArray<{ length: number; badgeKey: string }> = [
  { length: 1, badgeKey: "first_flame" },
  { length: 7, badgeKey: "week_flame" },
  { length: 30, badgeKey: "month_flame" },
  { length: 100, badgeKey: "century_flame" },
] as const;

/** Badge keys a flame of `length` qualifies for (the route inserts idempotently). */
export function flameMilestoneBadges(length: number): string[] {
  return FLAME_MILESTONE_BADGES.filter((m) => length >= m.length).map((m) => m.badgeKey);
}

// ── Badge award conditions — data, not prose ───────────────────────────────
//
// Every badge's earn-condition is declared here as data, so the award logic
// is one switch over one table, and the rules page can render conditions
// from the same source the server evaluates. The one "secret" badge
// (first_light) is hidden on the page for the joy of finding it — but its
// condition is still declared HERE, in public source, per transparency
// rule 7: what's hidden is hidden for a stated reason, never unauditable.

export type BadgeCondition =
  | { kind: "flame_length"; atLeast: number }
  | { kind: "embers_spent"; atLeast: number }
  | { kind: "shards"; atLeast: number }
  | { kind: "quests_completed_in_week"; atLeast: number }
  | { kind: "quest_completed"; questKey: string }
  | { kind: "pack_outcome_drawn"; rewardKey: string };

/**
 * The numbers badges are judged against. Routes assemble this from rows the
 * user can already see (their flame, their shards, their quest history, their
 * draws) — there is no hidden stat. All-time fields stay earned even after a
 * flame resets: badges are a collection, not a leash.
 */
export interface VisitStats {
  /** Current (or best, caller's choice — document on the surface) flame length. */
  flameLength: number;
  /** Embers ever spent shielding this user's flame. */
  embersSpent: number;
  /** Badge shards currently collected. */
  shards: number;
  /** Weekly quests completed in a single ISO week (the best such week). */
  questsCompletedInWeek: number;
  /** Quest keys ever completed (any week). */
  questsEverCompleted: readonly string[];
  /** Pack reward keys ever drawn from a daily pack. */
  packOutcomesDrawn: readonly string[];
}

/** Every badge's earn-condition, keyed by BadgeDef.key. Complete by test. */
export const BADGE_CONDITIONS: Readonly<Record<string, BadgeCondition>> = {
  first_flame: { kind: "flame_length", atLeast: 1 },
  week_flame: { kind: "flame_length", atLeast: 7 },
  month_flame: { kind: "flame_length", atLeast: 30 },
  century_flame: { kind: "flame_length", atLeast: 100 },
  ember_saved: { kind: "embers_spent", atLeast: 1 },
  trust_witness: { kind: "quest_completed", questKey: "open_verifier" },
  quartet: { kind: "quests_completed_in_week", atLeast: WEEKLY_QUESTS.length },
  shardwrought: { kind: "shards", atLeast: SHARDWROUGHT_THRESHOLD },
  first_light: { kind: "pack_outcome_drawn", rewardKey: "golden_spark" },
};

/** Pure predicate: does `stats` satisfy `condition`? */
export function meetsBadgeCondition(condition: BadgeCondition, stats: VisitStats): boolean {
  switch (condition.kind) {
    case "flame_length":
      return stats.flameLength >= condition.atLeast;
    case "embers_spent":
      return stats.embersSpent >= condition.atLeast;
    case "shards":
      return stats.shards >= condition.atLeast;
    case "quests_completed_in_week":
      return stats.questsCompletedInWeek >= condition.atLeast;
    case "quest_completed":
      return stats.questsEverCompleted.includes(condition.questKey);
    case "pack_outcome_drawn":
      return stats.packOutcomesDrawn.includes(condition.rewardKey);
  }
}

/**
 * Badge keys `stats` qualifies for, in BADGES order — deterministic, pure.
 * The route inserts these idempotently; a badge once granted is never
 * revoked by this function going false again (e.g. flame reset): revocation
 * is not a concept the Daily Flame has.
 */
export function earnedBadges(stats: VisitStats): string[] {
  return BADGES.filter((b) => {
    const cond = BADGE_CONDITIONS[b.key];
    return cond !== undefined && meetsBadgeCondition(cond, stats);
  }).map((b) => b.key);
}
