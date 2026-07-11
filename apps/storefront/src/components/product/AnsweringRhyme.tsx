/**
 * AnsweringRhyme — the human-facing half of the Cambridge × Artbitrage
 * relation corpus.
 *
 * Pure server component. It renders the curation and outbound references but
 * intentionally renders no card image: the corpus keeps that URL only for
 * identity/provenance and declares its rights NOASSERTION/reference-only.
 */

import {
  getAnsweringRhymesBySku,
  type AnsweringRhymeKind,
} from "@/lib/culture/answering-rhymes";

const KIND_LABELS: Record<AnsweringRhymeKind, string> = {
  "answering-rhyme": "Answering rhyme",
  "visual-echo": "Visual echo",
  "material-echo": "Material echo",
  "historical-thread": "Historical thread",
};

export default function AnsweringRhyme({ sku }: { sku: string }) {
  const relations = getAnsweringRhymesBySku(sku);
  if (relations.length === 0) return null;

  return (
    <section
      aria-labelledby="answering-rhyme-heading"
      className="mt-16 rounded-xl border border-border-subtle bg-surface p-5 sm:p-6"
    >
      <header className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          Cambridge × Artbitrage
        </p>
        <h2
          id="answering-rhyme-heading"
          className="mt-1 font-display text-xl font-semibold text-ink"
        >
          Answering Rhyme
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">
          A curated relation between two objects, with its evidence and limits
          left visible. An echo is not an attribution of influence.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {relations.map((entry) => (
          <article key={entry.key} className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {entry.relation.kinds.map((kind) => (
                <span
                  key={kind}
                  className="rounded-full border border-border-subtle bg-surface-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
                >
                  {KIND_LABELS[kind]}
                </span>
              ))}
            </div>

            <p className="text-base leading-relaxed text-ink">
              {entry.relation.claim}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href={entry.card.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg border border-border-subtle bg-page p-3 transition hover:border-border-strong"
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Cambridge card record
                </span>
                <span className="mt-1 block text-sm font-medium text-ink group-hover:text-accent">
                  {entry.card.display_name ?? entry.card.name}{" "}
                  <span aria-hidden="true">&#8599;</span>
                </span>
                <span className="mt-1 block font-mono text-[11px] text-ink-faint">
                  {entry.card.sku}
                </span>
              </a>

              <a
                href={entry.artwork.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg border border-border-subtle bg-page p-3 transition hover:border-border-strong"
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Museum original
                </span>
                <span className="mt-1 block text-sm font-medium text-ink group-hover:text-accent">
                  {entry.artwork.title} <span aria-hidden="true">&#8599;</span>
                </span>
                <span className="mt-1 block text-[11px] text-ink-faint">
                  {entry.artwork.artist} · {entry.artwork.date} ·{" "}
                  {entry.artwork.source_name}
                </span>
              </a>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Why
                </dt>
                <dd className="mt-1 leading-relaxed text-ink-muted">
                  {entry.relation.why}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Curation
                </dt>
                <dd className="mt-1 leading-relaxed text-ink-muted">
                  {entry.curation.mode} · {entry.curation.status}.{" "}
                  {entry.curation.note}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Confidence
                </dt>
                <dd className="mt-1 leading-relaxed text-ink-muted">
                  {entry.confidence.level} · {entry.confidence.reason}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Rights
                </dt>
                <dd className="mt-1 leading-relaxed text-ink-muted">
                  Card image: {entry.card.rights.use},{" "}
                  {entry.card.rights.license}. Museum image:{" "}
                  {entry.artwork.rights.license}. {entry.rights.boundary}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-3 text-xs">
              <a
                href={entry.provenance.artbitrage_room_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent transition hover:text-accent-strong"
              >
                Enter The Answering Rhymes{" "}
                <span aria-hidden="true">&#8599;</span>
              </a>
              <a
                href={entry.provenance.artbitrage_record_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-faint transition hover:text-ink"
              >
                Inspect artwork evidence <span aria-hidden="true">&#8599;</span>
              </a>
              <span className="text-ink-faint">As of {entry.as_of}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
