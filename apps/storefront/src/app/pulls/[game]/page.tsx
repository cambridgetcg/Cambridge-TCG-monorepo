// /pulls/[game] — one game's odds room: pack anatomy, rarity ladder,
// the rate table with basis + confidence on every row, and the rare
// occurrences (god packs, case hits, serialized cards). Ranges are
// shown as ranges; disagreements between sources are said out loud.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PULLS_SNAPSHOT, pullsForGame } from "@/lib/pulls/pull-rates";

interface Props {
  params: Promise<{ game: string }>;
}

export function generateStaticParams() {
  return PULLS_SNAPSHOT.games.map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game } = await params;
  const g = pullsForGame(game);
  if (!g) return { title: "Pull Rates — Cambridge TCG" };
  return {
    title: `${g.displayName} Pull Rates — What's in the Box | Cambridge TCG`,
    description: `${g.displayName} booster pull rates: pack and box anatomy, rarity ladder, approximate chase rates and rare occurrences like god packs — every figure labelled with its basis and confidence.`,
  };
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: "text-ok",
  medium: "text-warning",
  low: "text-ink-faint",
};

export default async function GamePullsPage({ params }: Props) {
  const { game } = await params;
  const g = pullsForGame(game);
  if (!g) notFound();

  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
          <nav className="mb-6">
            <Link
              href="/pulls"
              className="font-mono text-xs text-ink-faint hover:text-accent"
            >
              ← the odds room
            </Link>
          </nav>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            {g.displayName} — what&apos;s in the box
          </h1>
          <p className="mt-3 inline-block rounded-lg bg-surface-subtle border border-border-subtle px-3 py-1.5 text-xs text-ink-muted">
            Snapshot as of{" "}
            <span className="font-mono">{PULLS_SNAPSHOT.asOf}</span> · every
            rate carries its basis — estimates are estimates
          </p>
          <div className="mt-5 max-w-3xl rounded-lg border border-border-subtle bg-surface px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">
              Does the publisher tell you the odds?
            </p>
            <p className="text-sm text-ink-muted">{g.officialOdds}</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-12">
        {g.sections.map((s, si) => (
          <section key={si} className="space-y-8">
            {(s.region || g.sections.length > 1) && (
              <h2 className="text-2xl font-display font-semibold border-b border-border-subtle pb-2">
                {s.region ?? `Part ${si + 1}`}
              </h2>
            )}
            <p className="text-xs text-ink-faint font-mono -mt-4">{s.era}</p>

            {/* ── Pack anatomy ── */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Pack anatomy</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(
                  [
                    ["Cards per pack", s.packStructure.cardsPerPack],
                    ["Packs per box", s.packStructure.packsPerBox],
                    ["Boxes per case", s.packStructure.boxesPerCase],
                  ] as const
                ).map(
                  ([label, value]) =>
                    value && (
                      <div
                        key={label}
                        className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
                      >
                        <dt className="text-[10px] uppercase tracking-wider text-ink-faint">
                          {label}
                        </dt>
                        <dd className="mt-1 text-sm text-ink">{value}</dd>
                      </div>
                    ),
                )}
              </dl>
              {s.packStructure.guaranteedSlots && (
                <p className="mt-3 text-sm text-ink-muted">
                  <strong className="text-ink">Guaranteed slots:</strong>{" "}
                  {s.packStructure.guaranteedSlots}
                </p>
              )}
              {s.packStructure.notes && (
                <p className="mt-2 text-xs text-ink-faint leading-relaxed">
                  {s.packStructure.notes}
                </p>
              )}
            </div>

            {/* ── Rarity ladder ── */}
            {s.rarityLadder.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Rarity ladder</h3>
                <ol className="space-y-1.5">
                  {s.rarityLadder.map((r) => (
                    <li key={r} className="text-sm text-ink-muted flex gap-2">
                      <span className="text-ink-faint select-none">·</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ── The rate table ── */}
            {s.rates.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-1">
                  Approximate rates
                </h3>
                <p className="text-sm text-ink-muted mb-3">
                  Confidence is part of the data: a low-confidence range is
                  an honest answer, a precise-looking number without a basis
                  is not.
                </p>
                <div className="space-y-2">
                  {s.rates.map((r, i) => (
                    <article
                      key={`${r.tier}${i}`}
                      className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-semibold text-sm">{r.tier}</span>
                        <span
                          className={`font-mono text-[10px] uppercase tracking-wider ${CONFIDENCE_TONE[r.confidence]}`}
                        >
                          {r.confidence} confidence
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-ink">{r.rate}</p>
                      <p className="mt-1.5 text-xs text-ink-muted">
                        <span className="text-ink-faint">Basis:</span>{" "}
                        {r.basis}
                        {r.sourceUrl && (
                          <>
                            {" "}
                            <a
                              href={r.sourceUrl}
                              rel="noopener noreferrer"
                              className="text-accent hover:text-accent-strong"
                            >
                              source →
                            </a>
                          </>
                        )}
                      </p>
                      {r.regionNote && (
                        <p className="mt-1 text-xs text-ink-faint">
                          {r.regionNote}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {/* ── Rare occurrences ── */}
            {s.specialOccurrences.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">
                  Rare occurrences — god packs, case hits, oddities
                </h3>
                <div className="space-y-2">
                  {s.specialOccurrences.map((o) => (
                    <article
                      key={o.name}
                      className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
                    >
                      <p className="font-semibold text-sm">{o.name}</p>
                      <p className="mt-1 text-sm text-ink-muted">{o.what}</p>
                      <p className="mt-1.5 text-xs text-ink-muted">
                        <span className="text-ink-faint">
                          Approximate frequency:
                        </span>{" "}
                        {o.approxFrequency}
                      </p>
                      {o.whichSets && (
                        <p className="mt-1 text-xs text-ink-faint">
                          Sets: {o.whichSets}
                        </p>
                      )}
                      {o.sourceUrl && (
                        <a
                          href={o.sourceUrl}
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-accent hover:text-accent-strong"
                        >
                          source →
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}

        {/* ── Honesty footer ── */}
        <section className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-4 text-sm text-ink-muted space-y-2">
          <p>
            Rates drift between sets, print waves, and regions; where our
            sources disagreed we kept the disagreement visible instead of
            averaging it away. Nothing on this page is investment or
            purchase advice — it exists so you know what a box is before
            you buy one.
          </p>
          <p className="text-ink-faint text-xs">
            Machine-readable twin:{" "}
            <span className="font-mono">/api/v1/pulls</span> · snapshot{" "}
            <span className="font-mono">{PULLS_SNAPSHOT.asOf}</span>
          </p>
        </section>

        <nav className="flex flex-wrap gap-3 border-t border-border-subtle pt-5 text-sm">
          <Link href="/pulls" className="text-accent hover:text-accent-strong">
            All games
          </Link>
          <Link
            href={`/prices/${g.slug}`}
            className="text-accent hover:text-accent-strong"
          >
            {g.displayName} price guide
          </Link>
        </nav>
      </div>
    </main>
  );
}
