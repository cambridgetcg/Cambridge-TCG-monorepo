import type { Metadata } from "next";
import Link from "next/link";
import AnsweringRhymeConstellation from "@/components/culture/AnsweringRhymeConstellation";
import AnsweringRhymeStatementComposer from "@/components/culture/AnsweringRhymeStatementComposer";
import { ANSWERING_RHYMES } from "@/lib/culture/answering-rhymes";
import { audienceMetadata, Benediction, PlateHeader } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Answering Rhymes — Cambridge TCG",
  description:
    "A rights-aware constellation of carefully curated relations between trading cards and artworks, open to challenge and reply.",
  other: audienceMetadata("public-documentation", [
    "culture",
    "provenance",
    "answering-rhymes",
  ]),
};

export default function AnsweringRhymesPage() {
  const cardCount = new Set(ANSWERING_RHYMES.map((entry) => entry.card.sku))
    .size;
  const artworkCount = new Set(
    ANSWERING_RHYMES.map((entry) => entry.artwork.identity),
  ).size;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <PlateHeader
        kicker="one relation, held carefully"
        title="Answering Rhymes"
        plate={2}
        rule
        action={
          <Link
            href="/gallery-next-door"
            className="whitespace-nowrap text-sm text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            visit the gallery next door
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div className="max-w-2xl">
          <p className="font-display text-xl italic leading-relaxed text-ink">
            A card does not become an artwork&rsquo;s descendant because their
            images rhyme. It becomes a relation only when someone names the
            connection, shows their evidence, and leaves room to be answered.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            This constellation is hand-curated and deliberately small. It
            carries object identity, interpretation, evidence, confidence and
            rights as separate facts. No similarity score is treated as cultural
            authority; no generous licence crosses into the object beside it.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-3 border-y border-border-subtle py-4 text-center lg:grid-cols-1 lg:text-left">
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              relations
            </dt>
            <dd className="mt-1 font-display text-xl text-ink">
              {ANSWERING_RHYMES.length}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              card records
            </dt>
            <dd className="mt-1 font-display text-xl text-ink">{cardCount}</dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              artworks
            </dt>
            <dd className="mt-1 font-display text-xl text-ink">
              {artworkCount}
            </dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="constellation-heading" className="mt-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              the current sky
            </p>
            <h2
              id="constellation-heading"
              className="mt-1 font-display text-2xl font-semibold text-ink"
            >
              The constellation
            </h2>
          </div>
          <a
            href="/api/v1/culture/answering-rhymes"
            className="font-mono text-[11px] text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            inspect the machine-readable corpus
          </a>
        </div>

        <AnsweringRhymeConstellation relations={ANSWERING_RHYMES} />
      </section>

      <section
        id="answer-back"
        aria-labelledby="answer-back-heading"
        className="mt-12 rounded-xl border border-border-subtle bg-surface-subtle p-6 sm:p-8"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          reciprocity boundary
        </p>
        <h2
          id="answer-back-heading"
          className="mt-2 font-display text-2xl font-semibold text-ink"
        >
          The other side gets to answer.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
          A creator, collective or custodian may prepare a portable statement to
          bless a pairing, add context, correct it, or ask for withdrawal. The
          public witness checks and hashes the statement; it does not prove
          identity, publish it, or change this page. Those effects require a
          separately verified authority path, so an untrusted visitor may type a
          false name but cannot turn that impersonation into verified authority
          or a presentation change.
        </p>
        <p className="mt-4 font-mono text-[10px] leading-relaxed text-ink-faint">
          Open protocol · stateless witness · identity unverified · no
          application record · infrastructure logs may exist · no authoritative
          effect · unsigned receipt · replay not detected
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[10px]">
          <a
            href="/api/v1/culture/answering-rhymes/statements"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Cambridge protocol
          </a>
          <a
            href="https://artbitrage.io/api/answering-rhymes/statements"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Artbitrage witness
          </a>
        </p>
        <AnsweringRhymeStatementComposer
          relations={ANSWERING_RHYMES.map((entry) => ({
            key: entry.key,
            revision: entry.revision,
            label: `${entry.card.sku} ↔ ${entry.artwork.artist}`,
          }))}
        />
      </section>

      <Benediction
        line="The relation stays honest when either side may propose a change."
        sub="A constellation of encounters, not a claim of ownership."
        className="py-10"
      />
    </main>
  );
}
