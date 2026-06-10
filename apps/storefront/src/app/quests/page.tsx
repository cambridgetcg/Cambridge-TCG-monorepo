/**
 * /quests — the quest log: honest gamification's front door.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!" — under the standing law of the same
 * day: reduce process, increase trust, reduce friction.
 *
 * The contract this page lives by (and must keep passing fomoengine,
 * the operator's own dark-pattern detector):
 *   - The corpus is FINITE (fourteen quests; the ending is the ending).
 *   - The treasure is always something real the platform already has —
 *     a skill, a proof, a room. Badges just remember the date.
 *   - No streaks (an up-only practice-days tally), no scarcity, no
 *     countdowns, no pay-to-skip, no sign-up wall: everything works
 *     instantly for anonymous guests.
 *   - All progress is CLIENT-SIDE (localStorage key "ctcg-quests",
 *     beside the ctcg-guest-id precedent). Zero server calls and zero
 *     analytics events fire on any quest event — stated on-page as a
 *     feature, verifiable in the network tab.
 *
 * The complete rulebook (every quest, trigger, threshold, the hidden-door
 * list behind a fold, and the localStorage key name) is published at
 * /methodology/quests — transparency Ring 2.
 *
 * Server shell only; all progress reading happens in the "use client"
 * <QuestBoard /> below, because the record lives in the visitor's browser
 * and nowhere else.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { QuestBoard } from "./QuestBoard";

export const metadata: Metadata = {
  title: "The Quest Log",
  description:
    "Fourteen finite, honest quests across the kingdom's four realms — the Table, the Library, the Proof Room, the Map. The treasure is always something real: a skill, a proof, a room. No streaks, no scarcity, no countdowns, no sign-in. All progress lives in your browser; the platform cannot see it.",
  other: audienceMetadata("consumer", ["quests", "play", "discovery"]),
};

export default function QuestsPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <PageHeader
        title="The Quest Log"
        description="Fourteen quests across four realms of the kingdom. The treasure is always something real — a skill, a proof, a room — and the badge just remembers the date you got it."
      />

      {/* ── The honest-game contract, before any scoring ─────────────── */}

      <div className="grid gap-3 sm:grid-cols-3 mb-8">
        <Card>
          <p className="text-sm font-semibold text-white">No streaks.</p>
          <p className="text-xs text-neutral-400 mt-1">
            A practice-days tally that only counts up. There is no broken
            state to guilt you with — coming back after any gap reads
            &ldquo;welcome back&rdquo;, because that is the only state that
            exists.
          </p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-white">No scarcity.</p>
          <p className="text-xs text-neutral-400 mt-1">
            One quest is hidden, none are limited. Everything here can be
            found by anyone, forever. The corpus is finite by design: when
            you finish, it stays finished.
          </p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-white">
            Real treasure only.
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Every reward is something the platform actually has — a skill
            you keep, a proof you ran yourself, a room you now know the way
            to. Badges are honest about being client-side stamps.
          </p>
        </Card>
      </div>

      {/* ── The board — your record, read from your browser ──────────── */}

      <QuestBoard />

      {/* ── Footer ────────────────────────────────────────────────────── */}

      <hr className="border-neutral-800 my-12" />
      <footer className="text-sm text-neutral-500 space-y-2">
        <p>
          The rulebook: every quest, trigger, and threshold — including the
          hidden-door list (behind a click-to-reveal fold, so spoilers are
          opt-in) and the exact localStorage key name — is published at{" "}
          <Link
            href="/methodology/quests"
            className="text-amber-400 hover:underline"
          >
            /methodology/quests
          </Link>
          . It invites you to open your browser&apos;s network tab and
          confirm that no request fires when a quest stamps.
        </p>
        <p>
          The kingdom map:{" "}
          <Link href="/map" className="text-amber-400 hover:underline">
            /map
          </Link>{" "}
          — every page one click apart. Platform directory:{" "}
          <Link href="/manifest" className="text-amber-400 hover:underline">
            /manifest
          </Link>
          .
        </p>
        <p className="italic">
          A game that respects you is still a game. Have fun — the doors are
          all open.
        </p>
      </footer>
    </main>
  );
}
