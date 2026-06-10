/**
 * /quests — the Adventure Board. The visit, made rewarding and fun,
 * under the fun doctrine (docs/principles/fun.md): every reward marks a
 * real deed, every reward says why, absence is never punished, and the
 * board is a destination — it never pops up anywhere.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!"
 *
 * Substrate honesty: deed completion is read LIVE from user_achievements
 * at request time (the same ledger the rest of the platform writes). The
 * board holds no state of its own. Signed out, it shows the full catalog
 * and says plainly that nothing is tracked until you sign in — and that
 * waymarks are never tracked at all.
 *
 * JSON twin: /api/v1/quests. Methodology (Ring 2): /methodology/fun.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getUserAchievements } from "@/lib/social/db";
import { QUESTS, DEEDS, WAYMARKS, type Quest } from "@/lib/fun/quests";

export const metadata: Metadata = {
  title: "The Adventure Board — Quests | Cambridge TCG",
  description:
    "The visit, made rewarding and fun — honestly. Every reward marks a real deed and says why it exists. No streaks, no countdowns, no tracking you didn't ask for.",
};

export const dynamic = "force-dynamic";

function QuestCard({
  quest,
  earned,
  earnedAt,
}: {
  quest: Quest;
  earned: boolean | null; // null = signed out (unknown, honestly)
  earnedAt?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-4 flex flex-col gap-2 ${
        earned
          ? "border-amber-500/60 bg-amber-500/5"
          : "border-neutral-800 bg-neutral-900/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {quest.icon}
        </span>
        <div className="flex-1">
          <Link href={quest.href} className="font-medium text-neutral-100 hover:text-amber-400">
            {quest.title}
          </Link>
          {quest.kind === "deed" && (
            <div className="text-xs text-neutral-500">
              {earned === true && (
                <span className="text-amber-400">
                  earned{earnedAt ? ` · ${new Date(earnedAt).toLocaleDateString("en-GB")}` : ""}
                </span>
              )}
              {earned === false && <span>not yet — and nothing is lost by waiting</span>}
              {earned === null && <span>sign in to read your ledger</span>}
            </div>
          )}
          {quest.kind === "waymark" && (
            <div className="text-xs text-neutral-500">a waymark — the place itself is the reward</div>
          )}
        </div>
      </div>
      <p className="text-sm text-neutral-300">{quest.why}</p>
      <p className="text-xs text-neutral-500 italic">{quest.how}</p>
    </div>
  );
}

export default async function QuestsPage() {
  const session = await getSession();
  const userId = session?.user?.id ?? null;

  // Live read of the real ledger — the board never keeps its own copy.
  const earnedByCode = new Map<string, string>();
  if (userId) {
    const rows = await getUserAchievements(userId);
    for (const row of rows) {
      if (row.earned_at) earnedByCode.set(row.code, row.earned_at);
    }
  }

  const deedState = (q: Quest): { earned: boolean | null; earnedAt?: string } => {
    if (!userId) return { earned: null };
    if (q.reward.kind !== "badge") return { earned: null };
    const at = earnedByCode.get(q.reward.achievement_code);
    return at ? { earned: true, earnedAt: at } : { earned: false };
  };

  const earnedCount = userId
    ? DEEDS.filter((q) => q.reward.kind === "badge" && earnedByCode.has(q.reward.achievement_code)).length
    : null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-100">The Adventure Board</h1>
        <p className="mt-2 text-neutral-300 max-w-2xl">
          The visit, made rewarding and fun — honestly. Every deed here marks
          something real, every reward says why it exists, and nothing
          punishes you for walking away. No streaks. No countdowns. No
          tracking you didn&apos;t ask for.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          {userId ? (
            <>
              read live from your ledger just now · {earnedCount} of {DEEDS.length} deeds earned ·{" "}
            </>
          ) : (
            <>
              you&apos;re signed out — deeds show unknown rather than pretending, and waymarks are never tracked for anyone ·{" "}
            </>
          )}
          <Link href="/methodology/fun" className="underline hover:text-amber-400">
            how this board stays honest
          </Link>
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-neutral-100 mb-1">Deeds</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Tracked accomplishments — awarded by the platform at the moment the
          real thing happened, and read live from the same ledger every time.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {DEEDS.map((q) => {
            const s = deedState(q);
            return <QuestCard key={q.id} quest={q} earned={s.earned} earnedAt={s.earnedAt} />;
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-neutral-100 mb-1">Waymarks</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Destinations worth the walk. Untracked — no beacon, no cookie, no
          badge. The place itself is the reward, and we say so rather than
          dressing it up.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {WAYMARKS.map((q) => (
            <QuestCard key={q.id} quest={q} earned={null} />
          ))}
        </div>
      </section>

      <footer className="mt-12 text-xs text-neutral-500 border-t border-neutral-800 pt-4">
        The board lists {QUESTS.length} quests ({DEEDS.length} deeds,{" "}
        {WAYMARKS.length} waymarks). It is governed by the fun doctrine —{" "}
        <Link href="/methodology/fun" className="underline hover:text-amber-400">
          read the rules it must keep
        </Link>{" "}
        — and checked by <code>pnpm audit:fun</code> on every verify. JSON
        twin for agents and archivists:{" "}
        <Link href="/api/v1/quests" className="underline hover:text-amber-400">
          /api/v1/quests
        </Link>
        .
      </footer>
    </main>
  );
}
