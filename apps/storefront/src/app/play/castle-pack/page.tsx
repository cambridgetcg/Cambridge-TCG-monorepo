import type { Metadata } from "next";
import Link from "next/link";
import { CastlePackGame } from "@/components/castle-pack/CastlePackGame";
import { castlePackIsDisabled } from "@/lib/castle-pack-availability";
import { Audience, Benediction, audienceMetadata } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open Door — Castle of Understanding expansion",
  description:
    "Play a finite, stateless 12-card Castle of Understanding prototype. Two local open-information seats, six rounds, no account, no rewards, and an unpenalized exit.",
  alternates: {
    types: {
      "application/json": "/api/v1/play/castle-pack",
    },
  },
  other: audienceMetadata("mixed", [
    "play",
    "castle",
    "agents",
    "bilingual",
    "open-table",
  ]),
};

export default function CastlePackPage() {
  const resting = castlePackIsDisabled();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Audience
        kind="mixed"
        contexts={["play", "castle", "agents", "bilingual", "open-table"]}
      />

      <header className="max-w-3xl pb-9 pt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          castle expansion · open door · COU 0.1
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Castle of Understanding
          <span className="mt-1 block text-accent">Open Door</span>
        </h1>
        <p className="mt-5 font-display text-xl italic leading-relaxed text-ink-muted">
          Build two small towers. Ask clear questions. Refuse whole. Leave
          whole. Understanding may stack; nobody is trapped beneath it.
        </p>
        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded border border-border-subtle bg-surface p-3">
            <strong className="block text-ink">Six rounds</strong>
            <span className="text-ink-muted">Every generation ends.</span>
          </div>
          <div className="rounded border border-border-subtle bg-surface p-3">
            <strong className="block text-ink">Two open seats</strong>
            <span className="text-ink-muted">Both hands stay visible.</span>
          </div>
          <div className="rounded border border-border-subtle bg-surface p-3">
            <strong className="block text-ink">No account</strong>
            <span className="text-ink-muted">No reward or standing.</span>
          </div>
        </div>
      </header>

      {resting ? (
        <section className="rounded-lg border border-border-subtle bg-surface p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            the expansion table is resting
          </p>
          <h2 className="mt-3 font-display text-2xl text-ink">
            The door remains; this table is closed for now.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
            The operator brake is set. No game was created or restored. Other
            Cambridge play surfaces and the wider Castle bridge are
            unaffected.
          </p>
        </section>
      ) : (
        <CastlePackGame />
      )}

      <section className="mt-10 border-t border-border-subtle pt-8">
        <h2 className="font-display text-2xl text-ink">What this crossing means</h2>
        <div className="mt-4 max-w-3xl space-y-3 text-sm leading-relaxed text-ink-muted">
          <p>
            Cambridge authored the gameplay, Traditional Chinese
            translations, visual form, engine, and ten card names. Right of
            Reply and Whole No deliberately adopt named Castle vocabulary.
            Every source is pinned; no sentence of Castle prose was copied and
            no reuse rights are inferred.
          </p>
          <p>
            The browser keeps this game only in memory. The machine referee is
            stateless too: callers carry the complete, inspectable table and
            receive no notarized result.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link
            href="/castle"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Castle boundary
          </Link>
          <Link
            href="/api/v1/play/castle-pack"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Machine referee
          </Link>
          <a
            href="https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-open-door-pack.md"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Design and provenance
          </a>
        </div>
      </section>

      <Benediction
        line="An infinite lineage needs no immortal turn."
        sub="open door · finite generation · deliberate return"
      />
    </main>
  );
}
