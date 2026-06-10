"use client";

/**
 * /daily — The Daily Flame.
 *
 * Yu's words: "lets gamify cambridgetcg! module and process! Make the
 * visit rewarding and fun!"
 *
 * The visit-rewards loop, rendered: check in (the flame grows), open one
 * free provably-fair pack a day, walk the weekly quests, collect badges.
 * Rules and odds are data in @cambridge-tcg/visit — the same package the
 * /api/visit/* routes execute — and this page imports the same definitions
 * the server rolls, so nothing shown here is a copy that could drift.
 *
 * Doctrine notes:
 *   - Substrate honesty: the page says when its state was fetched and that
 *     it doesn't auto-refresh; "checked in" / "pack opened" render as
 *     statuses, never as disabled fake buttons.
 *   - Transparency: every pack outcome links its /verify/draw/[id] proof —
 *     "why did I get this?" answers with recomputable math, not a shrug.
 *   - Anti-guilt: no countdown timers, no streak-at-risk warnings, no red
 *     badges. FLAME_PROMISE (the package's verbatim sentence) is on the
 *     page, not buried in the rules.
 *   - The fifth question: keyboard/aria throughout (live regions for the
 *     results, real progressbar roles); user-facing copy centralised in
 *     STRINGS below so a translation pass touches one place; every loop on
 *     this page is completable without spending money.
 *
 * Process half: /rewards/rules (the We hold / rules / odds / test page).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BADGES,
  EMBERS_PER_WEEK,
  FLAME_PROMISE,
  SHARDWROUGHT_THRESHOLD,
  WEEKLY_QUESTS,
  type BadgeTier,
} from "@cambridge-tcg/visit";
import { Audience, Button, Card, ErrorAlert, LinkButton, PageHeader } from "@/lib/ui";

/* ------------------------------------------------------------------ */
/*  Strings — centralised so translation/localisation touches one map  */
/* ------------------------------------------------------------------ */

const STRINGS = {
  title: "The Daily Flame",
  description: "Show up, and the day gives a little back. Everything on this page is free.",
  fetchedAt: (time: string) => `State as of ${time} — this page doesn't refresh itself.`,
  signInLead: "Sign in to light your flame, open today's free pack, and start collecting badges.",
  signInButton: "Sign in to start",
  freePromise: "Every loop here — flame, pack, quests, badges — is completable without spending anything.",
  unavailable: "The Daily Flame service isn't reachable right now. Nothing is lost — your flame and packs live on the server, not in this page.",
  flameHeading: "Your flame",
  flameDays: (n: number) => (n === 1 ? "1 day" : `${n} days`),
  flameUnlit: "No flame yet — your first check-in lights it.",
  flameUnlitAfterReset: "Checking in today lights a fresh flame. Losing the old one cost you nothing.",
  flameWaitingExtend: (n: number) => `Checking in today grows it to ${STRINGS.flameDays(n)}.`,
  flameWaitingEmber: (n: number) => `You missed a day — your ember has it covered. Checking in today grows the flame to ${STRINGS.flameDays(n)}.`,
  checkedInToday: "Checked in today",
  checkInButton: "Check in for today",
  checkInBusy: "Checking in…",
  checkInDoneNew: (n: number) => `Checked in — your flame is ${STRINGS.flameDays(n)}.`,
  checkInDoneAlready: "Already checked in today — nothing changed, nothing lost.",
  embers: (left: number, perWeek: number) => `${left} of ${perWeek} ember${perWeek === 1 ? "" : "s"} ready this week`,
  emberExplain: "An ember covers one missed day per week, automatically. You never have to do anything to use it.",
  packHeading: "Today's pack",
  packLead: "One free pack a day. Weighted draw, committed before it's rolled, verifiable after.",
  packOpenButton: "Open today's pack — free",
  packOpenBusy: "Opening…",
  packAlreadyOpen: "Today's pack is open.",
  packTomorrow: "There'll be another tomorrow.",
  packVerify: "Verify this draw",
  packOddsLink: "The odds are published — see the rules",
  questsHeading: "This week's quests",
  questsLead: "Four small errands, reset weekly. None require spending money.",
  questDone: "Done",
  questGo: "Go",
  questProgress: (p: number, t: number) => `${p} of ${t}`,
  questShards: (n: number) => `+${n} shard${n === 1 ? "" : "s"}`,
  badgesHeading: "Badge collection",
  badgesLead: "Earned by flames, quests, and packs. Four tiers, like any good rarity sheet.",
  badgeEarned: (date: string) => `Earned ${date}`,
  badgeNotYet: "Not yet earned",
  badgeSecret: "A secret badge — it reveals itself when earned.",
  badgeProof: "Proof",
  shards: (n: number) => `${n} badge shard${n === 1 ? "" : "s"}`,
  shardsExplain: (threshold: number) => `Collect ${threshold} to forge the Shardwrought badge.`,
  rulesLink: "The rules, the odds, and the test",
  verifyLink: "How verification works",
  signedOutQuestNote: "Quests and badges below are the real definitions — sign in and they start counting.",
} as const;

/** Where each quest happens. Presentation routing only; definitions live in the package. */
const QUEST_HREFS: Record<string, string> = {
  browse_sets: "/prices",
  price_check: "/prices/search",
  open_verifier: "/verify",
  complete_trade_in: "/trade-in",
};

const TIER_ORDER: BadgeTier[] = ["common", "uncommon", "rare", "secret"];

const TIER_CLS: Record<BadgeTier, { pill: string; cardEarned: string }> = {
  common: { pill: "bg-neutral-700/40 text-neutral-300", cardEarned: "border-neutral-500/60" },
  uncommon: { pill: "bg-emerald-500/15 text-emerald-400", cardEarned: "border-emerald-500/50" },
  rare: { pill: "bg-amber-500/15 text-amber-400", cardEarned: "border-amber-500/50" },
  secret: { pill: "bg-purple-500/15 text-purple-400", cardEarned: "border-purple-500/50" },
};

/* ------------------------------------------------------------------ */
/*  API shapes — GET /api/visit/state, POST checkin, POST daily-pack   */
/* ------------------------------------------------------------------ */

interface VisitQuest {
  quest_key: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed_at: string | null;
  reward_shards: number;
}

interface VisitBadge {
  badge_key: string;
  title: string;
  tier: string;
  description: string;
  earned_at: string;
  draw_id?: string;
  verify_path?: string;
}

interface VisitState {
  day: string;
  week: string;
  flame: {
    length: number;
    last_day: string | null;
    embers_used_week: number;
    embers_per_week: number;
    shards: number;
  };
  today: {
    checked_in: boolean;
    pack_opened: boolean;
    pack_draw_id?: string;
    pack_verify_path?: string;
  };
  preview: {
    if_checked_in_now: "started" | "already_today" | "extended" | "ember_spent" | "reset";
    flame_length_after: number;
  };
  quests: VisitQuest[];
  badges: VisitBadge[];
  computed_at: string;
}

interface EarnedBadge {
  badge_key: string;
  title: string;
  tier: string;
  via: string;
  draw_id?: string | null;
}

interface PackResult {
  draw_id: string;
  verify_path: string;
  reward: { key: string; kind: string; label: string; value: number; message: string };
  applied: {
    credit_added?: number;
    shards_total?: number;
    quest_boosted?: { quest_key: string; progress: number; target: number; completed: boolean };
    badges_earned: EarnedBadge[];
  };
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function TierPill({ tier }: { tier: BadgeTier }) {
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold ${TIER_CLS[tier].pill}`}>
      {tier}
    </span>
  );
}

function QuestList({ quests, interactive }: { quests: VisitQuest[]; interactive: boolean }) {
  return (
    <ul className="space-y-4">
      {quests.map((q) => {
        const done = q.completed_at !== null;
        const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
        return (
          <li key={q.quest_key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-white">{q.title}</span>
              <span className="text-xs text-neutral-500 shrink-0">{STRINGS.questShards(q.reward_shards)}</span>
            </div>
            <p className="text-xs text-neutral-400">{q.description}</p>
            <div className="flex items-center gap-3">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={q.target}
                aria-valuenow={q.progress}
                aria-label={`${q.title}: ${STRINGS.questProgress(q.progress, q.target)}`}
                className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden"
              >
                <div
                  className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-neutral-400 tabular-nums w-12 text-right">
                {STRINGS.questProgress(q.progress, q.target)}
              </span>
              {done ? (
                <span className="text-xs font-semibold text-emerald-400">{STRINGS.questDone}</span>
              ) : interactive ? (
                <Link
                  href={QUEST_HREFS[q.quest_key] ?? "/"}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300"
                >
                  {STRINGS.questGo} →
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BadgeGrid({ earned }: { earned: VisitBadge[] }) {
  const earnedByKey = new Map(earned.map((b) => [b.badge_key, b]));
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
      {TIER_ORDER.flatMap((tier) =>
        BADGES.filter((b) => b.tier === tier).map((def) => {
          const own = earnedByKey.get(def.key);
          const isSecret = def.tier === "secret" && !own;
          return (
            <li
              key={def.key}
              className={`rounded-xl border p-3 ${
                own
                  ? `bg-neutral-900 ${TIER_CLS[def.tier].cardEarned}`
                  : "bg-neutral-900/40 border-neutral-800/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-bold ${own ? "text-white" : "text-neutral-500"}`}>
                  {isSecret ? "? ? ?" : def.title}
                </span>
                <TierPill tier={def.tier} />
              </div>
              <p className={`text-xs mt-1 ${own ? "text-neutral-300" : "text-neutral-600"}`}>
                {isSecret ? STRINGS.badgeSecret : def.description}
              </p>
              <p className="text-[11px] mt-2 flex items-center gap-2">
                {own ? (
                  <>
                    <span className="text-emerald-400">
                      {STRINGS.badgeEarned(new Date(own.earned_at).toLocaleDateString())}
                    </span>
                    {own.verify_path && (
                      <Link href={own.verify_path} className="text-amber-400 hover:text-amber-300 underline decoration-dotted underline-offset-2">
                        {STRINGS.badgeProof} →
                      </Link>
                    )}
                  </>
                ) : (
                  <span className="text-neutral-600">{STRINGS.badgeNotYet}</span>
                )}
              </p>
            </li>
          );
        }),
      )}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DailyFlamePage() {
  const [state, setState] = useState<VisitState | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const [checkingIn, setCheckingIn] = useState(false);
  const [openingPack, setOpeningPack] = useState(false);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/visit/state");
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data: VisitState = await res.json();
      setState(data);
      setSignedIn(true);
      setFetchedAt(new Date().toLocaleTimeString());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount. Every setState inside loadState happens after
    // `await fetch(...)` resolves — asynchronously, in response to the network
    // (an external system), never synchronously in the effect body. The rule
    // below can't trace through the async boundary, so it flags a cascade
    // that cannot occur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadState();
  }, [loadState]);

  const doCheckin = useCallback(async () => {
    if (checkingIn) return;
    setCheckingIn(true);
    setActionError(null);
    try {
      const res = await fetch("/api/visit/checkin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data?.error ?? "Check-in didn't go through. Your flame is unchanged.");
        return;
      }
      setAnnouncement(
        data.is_new_day
          ? STRINGS.checkInDoneNew(data.flame?.length ?? 1)
          : STRINGS.checkInDoneAlready,
      );
      await loadState();
    } catch {
      setActionError("Check-in didn't go through. Your flame is unchanged.");
    } finally {
      setCheckingIn(false);
    }
  }, [checkingIn, loadState]);

  const doOpenPack = useCallback(async () => {
    if (openingPack) return;
    setOpeningPack(true);
    setActionError(null);
    try {
      const res = await fetch("/api/visit/daily-pack", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // Already-open races still return the proof — honour it.
        setActionError(data?.error ?? "The pack didn't open. Nothing was drawn.");
        if (data?.verify_path) await loadState();
        return;
      }
      const result = data as PackResult;
      setPackResult(result);
      setAnnouncement(`${result.reward.label}. ${result.reward.message}`);
      await loadState();
    } catch {
      setActionError("The pack didn't open. Nothing was drawn.");
    } finally {
      setOpeningPack(false);
    }
  }, [openingPack, loadState]);

  /* ---------- Shared chrome ---------- */

  const footerLinks = (
    <div className="mt-10 border-t border-neutral-800 pt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <Link href="/rewards/rules" className="text-amber-400 hover:text-amber-300">
        {STRINGS.rulesLink} →
      </Link>
      <Link href="/verify/how-it-works" className="text-neutral-400 hover:text-white">
        {STRINGS.verifyLink} →
      </Link>
    </div>
  );

  /* ---------- Loading ---------- */

  if (signedIn === null && !loadError) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <PageHeader title={STRINGS.title} description={STRINGS.description} />
          <div className="space-y-4" aria-busy="true" aria-label="Loading">
            <div className="h-40 rounded-xl bg-neutral-900 animate-pulse" />
            <div className="h-40 rounded-xl bg-neutral-900 animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  /* ---------- Service unreachable ---------- */

  if (loadError) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <PageHeader title={STRINGS.title} description={STRINGS.description} />
          <ErrorAlert description={STRINGS.unavailable} />
          {footerLinks}
        </div>
      </main>
    );
  }

  /* ---------- Signed out — honest preview from the package's own data ---------- */

  if (signedIn === false) {
    const previewQuests: VisitQuest[] = WEEKLY_QUESTS.map((q) => ({
      quest_key: q.key,
      title: q.title,
      description: q.description,
      progress: 0,
      target: q.target,
      completed_at: null,
      reward_shards: q.rewardShards,
    }));
    return (
      <main className="min-h-screen bg-neutral-950 text-white">
        <Audience kind="consumer" contexts={["rewards", "daily-flame"]} />
        <div className="max-w-4xl mx-auto px-4 py-10">
          <PageHeader title={STRINGS.title} description={STRINGS.description} />
          <Card variant="elevated" padding="lg" className="mb-6">
            <p className="text-base text-neutral-200">{STRINGS.signInLead}</p>
            <p className="text-sm text-neutral-400 mt-2 italic">“{FLAME_PROMISE}”</p>
            <p className="text-sm text-neutral-400 mt-1">{STRINGS.freePromise}</p>
            <div className="mt-4">
              <LinkButton href="/login">{STRINGS.signInButton}</LinkButton>
            </div>
          </Card>
          <p className="text-xs text-neutral-500 mb-4">{STRINGS.signedOutQuestNote}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card padding="lg">
              <h2 className="text-base font-bold text-white mb-1">{STRINGS.questsHeading}</h2>
              <p className="text-xs text-neutral-500 mb-4">{STRINGS.questsLead}</p>
              <QuestList quests={previewQuests} interactive={false} />
            </Card>
            <Card padding="lg">
              <h2 className="text-base font-bold text-white mb-1">{STRINGS.badgesHeading}</h2>
              <p className="text-xs text-neutral-500 mb-4">{STRINGS.badgesLead}</p>
              <BadgeGrid earned={[]} />
            </Card>
          </div>
          {footerLinks}
        </div>
      </main>
    );
  }

  if (!state) return null;

  /* ---------- Signed in ---------- */

  const embersLeft = Math.max(0, state.flame.embers_per_week - state.flame.embers_used_week);
  const checkedIn = state.today.checked_in;
  const flameLit = checkedIn || state.preview.if_checked_in_now === "already_today";

  // What a check-in today would mean — phrased without guilt.
  let flameNote: string;
  if (flameLit) {
    flameNote = STRINGS.checkedInToday;
  } else if (state.flame.length === 0) {
    flameNote = STRINGS.flameUnlit;
  } else if (state.preview.if_checked_in_now === "extended") {
    flameNote = STRINGS.flameWaitingExtend(state.preview.flame_length_after);
  } else if (state.preview.if_checked_in_now === "ember_spent") {
    flameNote = STRINGS.flameWaitingEmber(state.preview.flame_length_after);
  } else {
    // "reset" or "started" — a fresh flame, plainly and kindly.
    flameNote = STRINGS.flameUnlitAfterReset;
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <Audience kind="consumer" contexts={["rewards", "daily-flame"]} />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <PageHeader title={STRINGS.title} description={STRINGS.description} />
        <p className="text-xs text-neutral-500 -mt-3 mb-1">
          {fetchedAt && STRINGS.fetchedAt(fetchedAt)}
        </p>
        <p className="text-sm text-neutral-400 italic mb-6">“{FLAME_PROMISE}”</p>

        {/* Screen-reader announcements for check-in + pack results. */}
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {actionError && (
          <div className="mb-4">
            <ErrorAlert description={actionError} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* ── The flame ── */}
          <Card padding="lg">
            <h2 className="text-base font-bold text-white mb-3">{STRINGS.flameHeading}</h2>
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className={`text-5xl ${state.flame.length > 0 ? "" : "grayscale opacity-40"}`}
              >
                🔥
              </span>
              <div>
                <p className="text-3xl font-black text-amber-400 tabular-nums">
                  {STRINGS.flameDays(state.flame.length)}
                </p>
                <p className="text-sm text-neutral-400 mt-0.5">{flameNote}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              {Array.from({ length: EMBERS_PER_WEEK }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`w-2.5 h-2.5 rounded-full ${
                    i < embersLeft ? "bg-amber-500" : "bg-neutral-800 border border-neutral-700"
                  }`}
                />
              ))}
              <span className="text-xs text-neutral-400">
                {STRINGS.embers(embersLeft, state.flame.embers_per_week)}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">{STRINGS.emberExplain}</p>

            <div className="mt-5">
              {checkedIn ? (
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <span aria-hidden="true">✓</span> {STRINGS.checkedInToday}
                </p>
              ) : (
                <Button onClick={doCheckin} disabled={checkingIn}>
                  {checkingIn ? STRINGS.checkInBusy : STRINGS.checkInButton}
                </Button>
              )}
            </div>
          </Card>

          {/* ── Today's pack ── */}
          <Card padding="lg">
            <h2 className="text-base font-bold text-white mb-1">{STRINGS.packHeading}</h2>
            <p className="text-xs text-neutral-500 mb-4">{STRINGS.packLead}</p>

            {packResult ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-lg font-bold text-white">{packResult.reward.label}</p>
                <p className="text-sm text-neutral-300 mt-1">{packResult.reward.message}</p>
                {packResult.applied.quest_boosted && (
                  <p className="text-xs text-neutral-400 mt-2">
                    Quest boosted: {packResult.applied.quest_boosted.quest_key} →{" "}
                    {STRINGS.questProgress(
                      packResult.applied.quest_boosted.progress,
                      packResult.applied.quest_boosted.target,
                    )}
                  </p>
                )}
                {packResult.applied.badges_earned.length > 0 && (
                  <p className="text-xs text-emerald-400 mt-2">
                    Badge earned: {packResult.applied.badges_earned.map((b) => b.title).join(", ")}
                  </p>
                )}
                <Link
                  href={packResult.verify_path}
                  className="inline-block mt-3 text-sm text-emerald-400 hover:text-emerald-300 underline decoration-dotted underline-offset-2"
                >
                  ✓ {STRINGS.packVerify} →
                </Link>
              </div>
            ) : state.today.pack_opened ? (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                <p className="text-sm font-semibold text-neutral-200">{STRINGS.packAlreadyOpen}</p>
                <p className="text-xs text-neutral-500 mt-1">{STRINGS.packTomorrow}</p>
                {state.today.pack_verify_path && (
                  <Link
                    href={state.today.pack_verify_path}
                    className="inline-block mt-3 text-sm text-emerald-400 hover:text-emerald-300 underline decoration-dotted underline-offset-2"
                  >
                    ✓ {STRINGS.packVerify} →
                  </Link>
                )}
              </div>
            ) : (
              <Button onClick={doOpenPack} disabled={openingPack}>
                {openingPack ? STRINGS.packOpenBusy : STRINGS.packOpenButton}
              </Button>
            )}

            <p className="mt-4 text-xs">
              <Link href="/rewards/rules" className="text-neutral-400 hover:text-amber-400 underline decoration-dotted underline-offset-2">
                {STRINGS.packOddsLink} →
              </Link>
            </p>
          </Card>
        </div>

        {/* ── Quests ── */}
        <Card padding="lg" className="mb-6">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="text-base font-bold text-white">{STRINGS.questsHeading}</h2>
            <span className="text-xs text-neutral-500">{state.week}</span>
          </div>
          <p className="text-xs text-neutral-500 mb-4">{STRINGS.questsLead}</p>
          <QuestList quests={state.quests} interactive />
        </Card>

        {/* ── Badges + shards ── */}
        <Card padding="lg">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="text-base font-bold text-white">{STRINGS.badgesHeading}</h2>
            <span className="text-xs text-neutral-400">
              {STRINGS.shards(state.flame.shards)}
              {state.flame.shards < SHARDWROUGHT_THRESHOLD && (
                <span className="text-neutral-600"> · {STRINGS.shardsExplain(SHARDWROUGHT_THRESHOLD)}</span>
              )}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mb-4">{STRINGS.badgesLead}</p>
          <BadgeGrid earned={state.badges} />
        </Card>

        {footerLinks}
      </div>
    </main>
  );
}
