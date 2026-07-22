// The official banned/restricted list, as this house enforces it.
// One truth: this page renders the same banlist.ts that the deck checker,
// the builder's warnings, and refereed-room setup enforce.

import Link from "next/link";
import {
  BANLIST_EFFECTIVE,
  BANLIST_SOURCE,
  BANNED_CARD_NUMBERS,
  BANNED_PAIRS,
} from "@/lib/play/banlist";
import { statsFor } from "@/lib/play/card-stats";

export const metadata = {
  title: "Banned & Restricted — One Piece TCG | Cambridge TCG",
  description:
    "The official OPTCG banned and restricted list, with the effective date and Bandai's official source — the same list our deck checker and refereed tables enforce.",
};

export default function BanlistPage() {
  const banned = Array.from(BANNED_CARD_NUMBERS);
  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-display font-semibold">
            Banned &amp; Restricted
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-ink-muted">
            The official list, effective{" "}
            <span className="font-mono">{BANLIST_EFFECTIVE}</span>. This is the
            same list our{" "}
            <Link href="/play/deck-check" className="text-accent hover:text-accent-strong">
              deck checker
            </Link>
            , the deck-builder&apos;s warnings, and refereed tables enforce —
            what you read here is what the table rules.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-3">
            Banned cards{" "}
            <span className="text-ink-faint text-sm font-normal">
              — cannot be included in any deck
            </span>
          </h2>
          <ul className="space-y-2">
            {banned.map((n) => (
              <li
                key={n}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-2.5"
              >
                <span className="font-mono text-sm text-danger">{n}</span>
                <span className="text-sm text-ink">
                  {statsFor(n)?.name ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">
            Banned pairs{" "}
            <span className="text-ink-faint text-sm font-normal">
              — legal alone, never together in one deck
            </span>
          </h2>
          <ul className="space-y-2">
            {BANNED_PAIRS.map(([a, b]) => (
              <li
                key={`${a}${b}`}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-2.5"
              >
                <span className="font-mono text-sm">
                  {a} <span className="text-ink-faint">+</span> {b}
                </span>
                <span className="text-sm text-ink-muted">
                  {statsFor(a)?.name ?? a} + {statsFor(b)?.name ?? b}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-4 text-sm text-ink-muted space-y-2">
          <p>
            There is currently no &quot;restricted&quot; (limited-copies)
            category in force. Since{" "}
            <span className="font-mono">2026-04-01</span> the official game
            runs two constructed formats: <strong className="text-ink">Standard</strong>{" "}
            (the game&apos;s first block rotation — Block 1, the OP01–OP04
            era, left the pool) and <strong className="text-ink">Extra</strong>{" "}
            (the full card pool). This banned list plus the{" "}
            <Link href="/methodology/starter-decks" className="text-accent hover:text-accent-strong">
              construction rules
            </Link>{" "}
            governs both; our checker validates construction and this list but
            does not yet enforce Standard set-rotation — see the{" "}
            <Link href="/play/meta" className="text-accent hover:text-accent-strong">
              meta page
            </Link>{" "}
            for the format context.
          </p>
          <p>
            This page is a point-in-time mirror, re-verified when Bandai posts
            restriction news. The official source is always authoritative:{" "}
            <a
              href={BANLIST_SOURCE}
              className="text-accent hover:text-accent-strong"
              rel="noopener noreferrer"
            >
              Bandai&apos;s banned/restricted page →
            </a>
          </p>
          <p className="text-ink-faint text-xs">
            Machine-readable twin: <span className="font-mono">/api/v1/play/banlist</span>
          </p>
        </section>

        <nav className="flex flex-wrap gap-3 border-t border-border-subtle pt-5 text-sm">
          <Link href="/play/meta" className="text-accent hover:text-accent-strong">
            The competitive meta
          </Link>
          <Link href="/play/deck-check" className="text-accent hover:text-accent-strong">
            Check a deck
          </Link>
          <Link href="/play" className="text-accent hover:text-accent-strong">
            Back to play
          </Link>
        </nav>
      </div>
    </main>
  );
}
