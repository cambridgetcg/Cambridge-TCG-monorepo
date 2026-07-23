// /pulls — what's actually in the box. The odds room's front door.
//
// Will trace: Asha, 2026-07-23 — "lets add the pull rate analytics of
// each card game… god packs! Lets do some research first." → "Go!"
//
// The disclosure map leads: which publishers tell you the odds and
// which never have. Nothing here entices — a player should know what
// a box is before they open their wallet. Every rate on the per-game
// pages carries its basis and confidence; this page carries the frame.

import type { Metadata } from "next";
import Link from "next/link";
import { PULLS_SNAPSHOT } from "@/lib/pulls/pull-rates";

export const metadata: Metadata = {
  title: "Pull Rates, Honestly — What's in the Box | Cambridge TCG",
  description:
    "Booster pull rates across 13 card games — pack anatomy, rarity ladders, approximate chase-card rates and god packs, every figure labelled with its basis and confidence. Most publishers publish no official odds; here is what is actually known.",
};

const PUBLISHES_TONE: Record<string, string> = {
  yes: "text-ok",
  partial: "text-warning",
  no: "text-ink-faint",
};

const PUBLISHES_LABEL: Record<string, string> = {
  yes: "publishes odds",
  partial: "partial",
  no: "publishes nothing",
};

export default function PullsPage() {
  const s = PULLS_SNAPSHOT;
  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
            the odds room
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight">
            What&apos;s in the box
          </h1>
          <p className="mt-4 max-w-2xl text-ink-muted leading-relaxed text-base sm:text-lg">
            Pack anatomy, rarity ladders, approximate pull rates, and the
            rare occurrences — god packs, case hits, serialized cards —
            across every game we track. Most publishers publish no official
            odds, so every figure here is labelled with what it rests on. This
            page exists so you know what a box is <em>before</em> you buy
            one — not to talk you into buying it.
          </p>
          <p className="mt-4 inline-block rounded-lg bg-surface-subtle border border-border-subtle px-3 py-1.5 text-xs text-ink-muted">
            Snapshot as of <span className="font-mono">{s.asOf}</span> ·
            rates drift set to set — treat this as a dated photograph, not
            a promise
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-12">
        {/* ── The disclosure map ── */}
        <section aria-labelledby="disclosure">
          <h2 id="disclosure" className="text-xl font-semibold mb-1">
            Who tells you the odds
          </h2>
          <p className="text-sm text-ink-muted mb-4 max-w-2xl">
            The single most useful fact in this room: two publishers publish
            thorough official odds, three publish partial or one-off figures
            — and the three publishers behind eight of our thirteen games
            publish nothing at all. Where no official odds exist, every
            number anyone quotes is a community estimate — including ours.
          </p>
          <ul className="space-y-2">
            {s.disclosureMap.map((row) => (
              <li
                key={row.publisher}
                className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold text-sm">{row.publisher}</span>
                  <span
                    className={`font-mono text-xs uppercase tracking-wider ${PUBLISHES_TONE[row.publishes]}`}
                  >
                    {PUBLISHES_LABEL[row.publishes]}
                  </span>
                  <span className="text-xs text-ink-faint">{row.games}</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {row.detail}
                  {row.sourceUrl && (
                    <>
                      {" "}
                      <a
                        href={row.sourceUrl}
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent-strong"
                      >
                        source →
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Per-game rooms ── */}
        <section aria-labelledby="games">
          <h2 id="games" className="text-xl font-semibold mb-4">
            The games
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {s.games.map((g) => {
              const sections = g.sections.length;
              const rates = g.sections.reduce((n, x) => n + x.rates.length, 0);
              const specials = g.sections.reduce(
                (n, x) => n + x.specialOccurrences.length,
                0,
              );
              return (
                <li key={g.slug}>
                  <Link
                    href={`/pulls/${g.slug}`}
                    className="group block rounded-lg border border-border-subtle bg-surface px-4 py-3 h-full hover:border-border-strong transition-colors"
                  >
                    <p className="font-display font-semibold transition-colors group-hover:text-accent">
                      {g.displayName}
                    </p>
                    <p className="mt-1 font-mono text-xs text-ink-faint">
                      {rates} rate rows · {specials} rare occurrences
                      {sections > 1 ? ` · ${sections} regions` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Honesty footer ── */}
        <section className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-4 text-sm text-ink-muted space-y-2">
          <p>
            <strong className="text-ink">How this room is made:</strong>{" "}
            {s.provenanceNote}
          </p>
          <p className="text-xs text-ink-faint">
            Key sources:{" "}
            {s.sources.map((src, i) => (
              <span key={src}>
                {i > 0 && " · "}
                <a href={src} rel="noopener noreferrer" className="hover:text-ink">
                  {new URL(src).hostname}
                </a>
              </span>
            ))}
          </p>
          <p className="text-ink-faint text-xs">
            Machine-readable twin:{" "}
            <span className="font-mono">/api/v1/pulls</span>
          </p>
        </section>

        <nav className="flex flex-wrap gap-3 border-t border-border-subtle pt-5 text-sm">
          <Link href="/prices" className="text-accent hover:text-accent-strong">
            Price guide
          </Link>
          <Link href="/artists" className="text-accent hover:text-accent-strong">
            The named hands
          </Link>
          <Link href="/play/meta" className="text-accent hover:text-accent-strong">
            The competitive meta
          </Link>
        </nav>
      </div>
    </main>
  );
}
