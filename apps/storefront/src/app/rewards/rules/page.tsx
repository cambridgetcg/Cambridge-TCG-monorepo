/**
 * /rewards/rules — the Daily Flame's process page.
 *
 * The legible-standard shape: We hold / The rules in plain words /
 * The odds / The test. The odds table below is not a copy of anything —
 * it is rendered from @cambridge-tcg/visit's oddsAsPublished(), which is
 * derived from the same DAILY_PACK_TABLE the /api/visit/daily-pack route
 * commits into every verifiable draw. One table, three surfaces (this
 * page, the server's roll, the verifier); zero places for them to drift.
 *
 * Companion surfaces: /daily (the loop itself), /verify/how-it-works
 * (the commit-reveal math), /verify/draw/[id] (any single pack's proof).
 */

import Link from "next/link";
import type { Metadata } from "next";
import {
  BADGES,
  EMBERS_PER_WEEK,
  FLAME_PROMISE,
  SHARDWROUGHT_THRESHOLD,
  WEEKLY_QUESTS,
  WEIGHT_TOTAL,
  oddsAsPublished,
} from "@cambridge-tcg/visit";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Daily Flame — rules, odds, and the test | Cambridge TCG",
  description:
    "The complete rules of the Daily Flame: how the streak works, what an ember is, the exact published odds of the daily pack (rendered from the same table the server rolls), and how to recompute any draw yourself.",
  other: audienceMetadata("public-documentation", ["rewards", "fairness", "daily-flame"]),
};

export default function DailyFlameRulesPage() {
  const odds = oddsAsPublished();

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <Audience kind="public-documentation" />
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
        <header>
          <Link href="/daily" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← The Daily Flame
          </Link>
          <h1 className="text-3xl font-bold mt-2 mb-2">The Daily Flame — rules, odds, and the test</h1>
          <p className="text-neutral-400">
            Everything the daily loop does, in plain words, with the exact numbers the server
            uses. If anything on this page is wrong, the system is wrong — please tell us.
          </p>
        </header>

        {/* ── We hold ── */}
        <Section title="We hold">
          <ul className="space-y-3 list-none">
            <Held>
              {FLAME_PROMISE} Losing the flame debits nothing, locks nothing, and downgrades
              nothing. It is a number returning to one.
            </Held>
            <Held>
              Every loop on the daily page — the flame, the pack, the quests, the badges — is
              completable without spending money. There are no purchase-gated streaks and no
              countdown timers, here or anywhere in this loop.
            </Held>
            <Held>
              Every daily pack is a commit-reveal draw on the same substrate as every other
              random outcome on this platform. The seed is committed before the roll; the proof
              is yours to recompute at any time.
            </Held>
            <Held>
              The odds below are rendered from the same table the server rolls —{" "}
              <Code>@cambridge-tcg/visit</Code>&apos;s <Code>DAILY_PACK_TABLE</Code>, via{" "}
              <Code>oddsAsPublished()</Code>. This page and the server cannot disagree, because
              neither holds its own copy.
            </Held>
          </ul>
        </Section>

        {/* ── The rules ── */}
        <Section title="The rules, in plain words">
          <Rule heading="The flame">
            Check in once a day while signed in, and the flame grows by one. Checking in twice
            does nothing extra and costs nothing — the gesture is idempotent. A day is the
            database&apos;s calendar day (UTC), one clock for everyone.
          </Rule>
          <Rule heading="Embers">
            Miss a single day and an ember covers it — automatically, with nothing to click,{" "}
            {EMBERS_PER_WEEK} per week (the week is the ISO calendar week). Out of embers, or
            away longer than a day? The flame resets to one on your next visit. That reset is
            the entire consequence. We don&apos;t message you about it, shame you for it, or
            charge you to undo it — there is nothing to undo.
          </Rule>
          <Rule heading="The daily pack">
            One free pack per day. Opening it is a weighted draw with the odds published below,
            rolled through commit-reveal (kind <Code>daily_pack</Code> in the{" "}
            <Code>verifiable_draws</Code> table). Your draw row stores the weights as they were
            at the moment of commitment, so even if we tune the table later, your past draws
            verify against what was true then.
          </Rule>
          <Rule heading="Quests">
            {WEEKLY_QUESTS.length} small quests reset each week:{" "}
            {WEEKLY_QUESTS.map((q) => q.title.toLowerCase()).join(", ")}. Each pays badge
            shards. None requires a purchase — including the one that asks you to open the
            fairness verifier, which exists so that the trust surface is something you have
            actually seen, not something we claim.
          </Rule>
          <Rule heading="Badges and shards">
            Badges come in four tiers — common, uncommon, rare, secret —{" "}
            {BADGES.length} in all, earned through flames, quests, and packs. Shards accumulate
            from packs and quest rewards; {SHARDWROUGHT_THRESHOLD} shards earn the Shardwrought
            badge. Secret badges reveal their conditions when earned; none of them requires
            spending money, and the curious can read the conditions in the open source.
          </Rule>
        </Section>

        {/* ── The odds ── */}
        <Section title="The odds">
          <p>
            Each daily pack draws exactly one outcome. Weights are integers out of{" "}
            {WEIGHT_TOTAL} — read them as packs-per-thousand.
          </p>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Daily pack outcomes with their exact weights and probabilities
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Outcome</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Key</th>
                  <th scope="col" className="py-2 pr-3 font-semibold text-right">Weight</th>
                  <th scope="col" className="py-2 pr-3 font-semibold text-right">Per 1,000 packs</th>
                  <th scope="col" className="py-2 font-semibold text-right">Chance</th>
                </tr>
              </thead>
              <tbody>
                {odds.map((o) => (
                  <tr key={o.key} className="border-t border-neutral-800">
                    <td className="py-2 pr-3 text-white">{o.label}</td>
                    <td className="py-2 pr-3">
                      <code className="text-xs font-mono text-neutral-400">{o.key}</code>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-300">
                      {o.weight} / {o.outOf}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-300">
                      {o.perThousand}
                    </td>
                    <td className="py-2 text-right tabular-nums text-amber-400 font-semibold">
                      {o.percent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500">
            Source of truth: <Code>oddsAsPublished()</Code> in <Code>@cambridge-tcg/visit</Code>{" "}
            — the same package whose <Code>dailyPackWeights()</Code> the server commits into
            every draw. The keys in the table above are the literal keys you will find in your
            draw&apos;s committed weights on its verify page. The{" "}
            <Link href="/verify/health" className="text-amber-400 hover:text-amber-300 underline">
              public drift dashboard
            </Link>{" "}
            compares observed outcomes against these declared weights over time.
          </p>
        </Section>

        {/* ── The test ── */}
        <Section title="The test: recompute your own draw">
          <p>
            Pick any pack you have opened. Its result links to{" "}
            <Code>/verify/draw/[id]</Code> — the seed we committed before rolling, the salt, the
            nonce, the weights, and the outcome. Re-run the hash in your own browser and check
            that it reproduces your result. If you can recompute your own draw, you don&apos;t
            have to trust this page; if you can&apos;t, we broke our promise and we want to know.
          </p>
          <p>
            The same applies to the flame itself: your check-in dates plus the rules above fully
            determine your flame. The package&apos;s <Code>computeFlame()</Code> replays the
            published rules over raw dates — the platform has no private arithmetic about you.
          </p>
          <p>
            <Link href="/verify/how-it-works" className="text-amber-400 hover:text-amber-300 underline">
              How the verification works, step by step →
            </Link>
          </p>
        </Section>

        <div className="border-t border-neutral-800 pt-6 text-xs text-neutral-500">
          The Daily Flame is run by the same machinery this page describes — there is no second,
          private rulebook. Questions or corrections: email us and we&apos;ll fix it and publish
          the correction.
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold mb-3 text-white">{title}</h2>
      <div className="text-sm text-neutral-400 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function Held({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="text-amber-400 shrink-0 select-none">—</span>
      <span className="text-neutral-300">{children}</span>
    </li>
  );
}

function Rule({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-1">{heading}</h3>
      <p>{children}</p>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[13px] bg-neutral-900 border border-neutral-800 rounded px-1 py-0.5 font-mono text-neutral-300">
      {children}
    </code>
  );
}
