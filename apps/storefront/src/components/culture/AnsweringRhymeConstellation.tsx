/**
 * An accessible, image-free map of the curated Answering Rhymes corpus.
 *
 * The visual edge is decorative; the same relationship is stated in the
 * article beneath it so no meaning depends on sight, colour, or SVG support.
 * Card and artwork images deliberately stay outside this component because
 * their rights do not flow across the relation.
 */

import Link from "next/link";
import type { AnsweringRhymeRelation } from "@/lib/culture/answering-rhymes";

const KIND_LABELS = {
  "answering-rhyme": "answering rhyme",
  "visual-echo": "visual echo",
  "material-echo": "material echo",
  "historical-thread": "historical thread",
} as const;

export default function AnsweringRhymeConstellation({
  relations,
}: {
  relations: readonly AnsweringRhymeRelation[];
}) {
  return (
    <div className="grid gap-8">
      {relations.map((entry, index) => (
        <article
          key={entry.key}
          aria-labelledby={`rhyme-${index}-heading`}
          className="wardrobe-panel rounded-xl border border-border-subtle bg-surface p-5 sm:p-7"
        >
          <div
            aria-hidden="true"
            className="grid grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-center gap-2"
          >
            <div className="h-px bg-border-strong" />
            <div className="relative flex h-16 items-center justify-center">
              <span className="absolute h-3 w-3 rounded-full border border-accent bg-page" />
              <span className="h-px w-full bg-accent" />
            </div>
            <div className="h-px bg-border-strong" />
          </div>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)] sm:items-start">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                Cambridge card
              </p>
              <h2
                id={`rhyme-${index}-heading`}
                className="mt-2 font-display text-lg font-semibold leading-snug text-ink"
              >
                <Link
                  href={`/product/${encodeURIComponent(entry.card.sku)}`}
                  className="transition hover:text-accent"
                >
                  {entry.card.display_name ?? entry.card.name}
                </Link>
              </h2>
              <p className="mt-2 font-mono text-[11px] text-ink-faint">
                {entry.card.sku}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                Card image remains reference-only · {entry.card.rights.license}
              </p>
            </div>

            <div className="border-y border-border-subtle py-4 text-center sm:border-x sm:border-y-0 sm:px-4 sm:py-0">
              <p className="font-display italic text-sm text-ink-muted">
                answers through
              </p>
              <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
                {entry.relation.kinds.map((kind) => (
                  <li
                    key={kind}
                    className="rounded-full border border-border-subtle bg-accent-wash px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-ink-muted"
                  >
                    {KIND_LABELS[kind]}
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[10px] text-ink-faint">
                {entry.curation.mode} · {entry.curation.status}
              </p>
            </div>

            <div className="sm:text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                Museum work
              </p>
              <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-ink">
                <a
                  href={entry.artwork.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-accent"
                >
                  {entry.artwork.title}
                </a>
              </h3>
              <p className="mt-2 text-xs text-ink-faint">
                {entry.artwork.artist} · {entry.artwork.date}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                {entry.artwork.rights.license}
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-border-subtle pt-5">
            <p className="text-sm leading-relaxed text-ink">
              {entry.relation.claim}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {entry.relation.why}
            </p>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-faint">
              Boundary: {entry.relation.documented_influence.note}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
