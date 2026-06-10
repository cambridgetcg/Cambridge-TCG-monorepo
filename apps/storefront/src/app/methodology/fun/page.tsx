/**
 * /methodology/fun — how the Adventure Board stays honest.
 *
 * Player-facing mirror (transparency Ring 2) of docs/principles/fun.md.
 * The board (/quests) links here from its header and footer; every claim
 * on this page is enforced by `pnpm audit:fun` in the verify chain.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!"
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Fun, Played Fair — Methodology",
  description:
    "The rules the Adventure Board must keep: every reward marks a real deed and says why; absence is never punished; urgency is never manufactured; tracking is declared, including its absence.",
  other: audienceMetadata("public-documentation", ["fun", "methodology"]),
};

export default function FunMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["fun", "methodology"]} />
      <main className="max-w-3xl mx-auto px-4 py-12 prose prose-invert prose-neutral">
        <h1>Fun, Played Fair</h1>
        <p>
          The <Link href="/quests">Adventure Board</Link> makes the visit
          rewarding and fun. Gamification is also the most weaponized pattern
          in commerce — breakable streaks, decaying points, countdown
          scarcity — so before shipping any of it, we wrote the rules down.
          These are not aspirations; an audit in our build pipeline fails the
          build when the code drifts from them.
        </p>

        <h2>The rules the board must keep</h2>
        <ol>
          <li>
            <strong>A reward marks a real deed.</strong> Badges attach to
            things that actually happened — an order, a trade, a completed
            set — never to manufactured behavior like daily check-ins.
          </li>
          <li>
            <strong>Every reward says why it exists and how it is
            detected.</strong> On the card itself, not in fine print. If the
            honest reason would embarrass us, the mechanic doesn&apos;t ship.
          </li>
          <li>
            <strong>Absence is never punished.</strong> No streaks that
            break, no points that decay, no badges that expire. Leave for a
            year; everything you earned is still yours.
          </li>
          <li>
            <strong>Urgency is never manufactured.</strong> You will not find
            a countdown or an &quot;almost gone&quot; here unless it is
            provably true and labeled with its source.
          </li>
          <li>
            <strong>Play never gates commerce or safety.</strong> Prices,
            stock, and warnings are identical whether you have every badge or
            none.
          </li>
          <li>
            <strong>Chance is provable.</strong> Anything random rides the
            same rail as everything else here:{" "}
            <Link href="/verify">verify it yourself</Link>.
          </li>
          <li>
            <strong>Fun is quiet.</strong> The board is a destination. It
            never pops up, never interrupts, never pleads.
          </li>
          <li>
            <strong>Tracking is declared — including its absence.</strong>{" "}
            Deeds say &quot;read live from your ledger.&quot; Waymarks say
            &quot;nothing tracks this visit.&quot; You always know which kind
            you are touching.
          </li>
        </ol>

        <h2>Deeds and waymarks</h2>
        <p>
          <strong>Deeds</strong> are tracked accomplishments. They are awarded
          by the platform at the moment the real thing happens, and the board
          reads your ledger live every time you look — it keeps no copy of
          its own. Signed out, deeds show <em>unknown</em> rather than a
          pretend state.
        </p>
        <p>
          <strong>Waymarks</strong> are destinations worth the walk — the
          castle, the price recipe, the fairness proof. They are untracked:
          no beacon, no cookie, no badge. The place itself is the reward, and
          we say so plainly. Waymarks are our proof that fun does not require
          surveillance.
        </p>

        <h2>How it is enforced</h2>
        <p>
          The quest catalog is code (<code>src/lib/fun/quests.ts</code>), and
          an audit (<code>pnpm audit:fun</code>) runs in the same gate as our
          honesty and transparency audits. It fails the build if any quest is
          missing its why or how, points at a route that doesn&apos;t exist,
          claims a badge that isn&apos;t in the achievement ledger&apos;s
          seeds, or if manufactured-urgency vocabulary appears anywhere in
          the storefront source. The full doctrine lives in the repository at{" "}
          <code>docs/principles/fun.md</code>.
        </p>

        <p>
          <Link href="/quests">→ Back to the Adventure Board</Link>
        </p>
      </main>
    </>
  );
}
