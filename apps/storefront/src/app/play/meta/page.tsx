// The competitive meta — a dated, sourced snapshot for every player.
// Tier claims cite tournament data; decklists LINK to their publishers;
// the as-of banner is the substrate-honesty contract: a meta page that
// hides its age is lying by omission.

import Link from "next/link";
import { META_SNAPSHOT } from "@/lib/play/meta-snapshot";

export const metadata = {
  title: "The Competitive Meta — One Piece TCG | Cambridge TCG",
  description:
    "A dated, sourced snapshot of the OPTCG competitive metagame: tier list grounded in tournament results, winning decklists (linked to their publishers), and the tournament circuit — official and community.",
};

const TIER_TONES: Record<string, string> = {
  S: "bg-danger/10 text-danger border-danger/40",
  A: "bg-accent-wash text-accent border-accent/40",
  B: "bg-surface-subtle text-ink-muted border-border-strong",
};

export default function MetaPage() {
  const m = META_SNAPSHOT;
  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-display font-semibold">
            The competitive meta
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-ink-muted">
            What&apos;s winning, who won with it, and where to play next —
            grounded in tournament results, with every claim linked to its
            source.
          </p>
          <p className="mt-3 inline-block rounded-lg bg-surface-subtle border border-border-subtle px-3 py-1.5 text-xs text-ink-muted">
            Snapshot as of <span className="font-mono">{m.asOf}</span> ·
            data window {m.dataWindow} · latest set {m.latestSet} · metas
            move — the sources below are live
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-8 space-y-10">
        {/* ── Format context ── */}
        <section aria-labelledby="format-context">
          <h2 id="format-context" className="text-xl font-semibold mb-3">
            The format, first
          </h2>
          <ul className="space-y-2">
            {m.formatContext.map((line) => (
              <li
                key={line}
                className="rounded-lg border border-border-subtle bg-surface px-4 py-2.5 text-sm text-ink-muted"
              >
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Tier list ── */}
        <section aria-labelledby="tiers">
          <h2 id="tiers" className="text-xl font-semibold mb-4">
            Leader tier list
          </h2>
          <div className="space-y-3">
            {m.tiers.map((t) => (
              <article
                key={t.leaderCard}
                className="rounded-lg border border-border-subtle bg-surface p-4 flex gap-4"
              >
                <span
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border text-lg font-display font-semibold ${
                    TIER_TONES[t.tier]
                  }`}
                >
                  {t.tier}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="font-semibold">{t.leaderName}</h3>
                    <span className="font-mono text-xs text-ink-faint">
                      {t.leaderCard}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {t.color} · {t.archetype}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{t.why}</p>
                  {t.representation && (
                    <p className="mt-1 text-xs text-ink-faint font-mono">
                      {t.representation}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Recent tournament results ── */}
        <section aria-labelledby="results">
          <h2 id="results" className="text-xl font-semibold mb-1">
            Recent tournament results
          </h2>
          <p className="text-sm text-ink-muted mb-4">
            Winning decklists link to the publishers who cover them.
          </p>
          <div className="space-y-2">
            {m.recentResults.map((r) => (
              <article
                key={`${r.name}${r.date}`}
                className="rounded-lg border border-border-subtle bg-surface px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{r.name}</p>
                  <p className="text-xs text-ink-faint">
                    {r.date}
                    {r.region ? ` · ${r.region}` : ""}
                    {r.size ? ` · ${r.size}` : ""}
                  </p>
                </div>
                <div className="text-sm text-ink-muted">
                  🏆 {r.winnerLeader}
                  {r.winnerName ? (
                    <span className="text-ink-faint"> — {r.winnerName}</span>
                  ) : null}
                </div>
                <div className="flex gap-3 text-xs">
                  {r.decklistUrl && (
                    <a
                      href={r.decklistUrl}
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent-strong"
                    >
                      decklist →
                    </a>
                  )}
                  <a
                    href={r.sourceUrl}
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-strong"
                  >
                    coverage →
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Where to play ── */}
        <section aria-labelledby="circuit" className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 id="circuit" className="text-xl font-semibold mb-3">
              Official circuit
            </h2>
            <ul className="space-y-2">
              {m.officialCircuit.map((c) => (
                <li key={c.url} className="rounded-lg border border-border-subtle bg-surface px-4 py-3">
                  <a
                    href={c.url}
                    rel="noopener noreferrer"
                    className="font-medium text-sm text-accent hover:text-accent-strong"
                  >
                    {c.name} →
                  </a>
                  <p className="text-xs text-ink-muted mt-0.5">{c.what}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-3">Community platforms</h2>
            <ul className="space-y-2">
              {m.communityCircuit.map((c) => (
                <li key={c.url} className="rounded-lg border border-border-subtle bg-surface px-4 py-3">
                  <a
                    href={c.url}
                    rel="noopener noreferrer"
                    className="font-medium text-sm text-accent hover:text-accent-strong"
                  >
                    {c.name} →
                  </a>
                  <p className="text-xs text-ink-muted mt-0.5">{c.what}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Honesty footer ── */}
        <section className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-4 text-sm text-ink-muted space-y-2">
          <p>
            <strong className="text-ink">How this page is made:</strong> tier
            placements are grounded in published tournament results (meta
            share, top cuts) — researched, cross-checked, and dated. We link
            to decklists and coverage at their publishers rather than
            republishing them. The banlist this meta lives under is{" "}
            <Link href="/play/banlist" className="text-accent hover:text-accent-strong">
              here
            </Link>
            , enforced by our own tables.
          </p>
          <p className="text-xs text-ink-faint">
            Sources for this snapshot:{" "}
            {m.sources.map((s, i) => (
              <span key={s}>
                {i > 0 && " · "}
                <a href={s} rel="noopener noreferrer" className="hover:text-ink">
                  {new URL(s).hostname}
                </a>
              </span>
            ))}
          </p>
          <p className="text-ink-faint text-xs">
            Machine-readable twin: <span className="font-mono">/api/v1/play/meta</span>
          </p>
        </section>

        <nav className="flex flex-wrap gap-3 border-t border-border-subtle pt-5 text-sm">
          <Link href="/play/banlist" className="text-accent hover:text-accent-strong">
            Banned &amp; restricted
          </Link>
          <Link href="/play/starters" className="text-accent hover:text-accent-strong">
            Start with a starter
          </Link>
          <Link href="/play" className="text-accent hover:text-accent-strong">
            Back to play
          </Link>
        </nav>
      </div>
    </main>
  );
}
