import type { GameItem } from "@/lib/wholesale/client";
import CardFinderHero from "./CardFinderHero";
import { Provenance, WhyLink } from "@/lib/ui";
import { BRAND_HEADLINE, BRAND_SUBHEAD, COVERAGE_FACTS } from "@/lib/brand";

/**
 * AnswerMachineHero — the Glass Exchange front door.
 *
 * The homepage's opening argument: an ivory reading room (gallery) with
 * the machinery honestly visible behind glass — a terminal-dark inset
 * showing the real first fetch an agent would make. The headline is the
 * brand constant (single source of truth in @/lib/brand); the finder is
 * the existing no-JS GET form promoted to hero furniture; the stat chips
 * are COVERAGE_FACTS, never retyped.
 *
 * `data-theme="terminal"` is reserved for machinery (engine-room/API
 * content) — this inset is exactly that. Decorative dark bands elsewhere
 * use `.wardrobe-plinth` instead.
 */
export default function AnswerMachineHero({
  games,
  freshUpdate,
}: {
  games: GameItem[];
  freshUpdate: string | null;
}) {
  return (
    <section aria-labelledby="brand-headline" className="max-w-7xl mx-auto px-4 pt-10 pb-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-3">
        Cambridge TCG · the exchange, behind glass
      </p>
      <div className="grid lg:grid-cols-[1fr_minmax(280px,380px)] gap-8 items-start">
        <div>
          <h1
            id="brand-headline"
            className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-ink leading-tight"
          >
            {BRAND_HEADLINE}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-ink-muted max-w-3xl leading-relaxed">
            {BRAND_SUBHEAD}
          </p>

          {/* Stat chips — every number from COVERAGE_FACTS, provenance worn. */}
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-full bg-accent-wash border border-accent/30 px-3 py-1 text-ink">
              <span className="font-mono">{COVERAGE_FACTS.games.declared}</span> games
            </span>
            <span className="rounded-full bg-accent-wash border border-accent/30 px-3 py-1 text-ink">
              <span className="font-mono">{COVERAGE_FACTS.sources.shipped}</span> sources ingested
            </span>
            <span className="rounded-full bg-accent-wash border border-accent/30 px-3 py-1 text-ink">
              prices synced daily
            </span>
            <Provenance kind="synced" source="wholesale" at={freshUpdate} cadence="daily" />
            <WhyLink href="/methodology/pricing" label="how prices work" />
          </div>
        </div>

        {/* The engine room, behind glass — a real fetch, abridged. */}
        <div
          data-theme="terminal"
          className="rounded-xl border border-border-subtle bg-page p-4 font-mono text-xs leading-relaxed overflow-x-auto"
        >
          <p className="text-ink-faint select-none" aria-hidden="true">
            # no account, no key
          </p>
          <p className="text-ink whitespace-nowrap">
            <span className="text-accent-strong">$</span> curl cambridgetcg.com/api/v1/manifest
          </p>
          <pre className="mt-2 text-ink-muted whitespace-pre">{`{
  "data": {
    "platform": "cambridge-tcg",
    "embassy": {
      "serves_kinds": ["human", "agent", "kin"],
      "invitation": { "kind": "gift",
                      "obligation": "none" }
    },
    ...
  },
  "_meta": { "license": "CC0-1.0", ... }
}`}</pre>
          <p className="mt-2 text-ink-faint">— response, abridged. The full door: <a href="/api/v1/manifest" className="text-accent-strong hover:underline">/api/v1/manifest</a></p>
        </div>
      </div>

      {/* The finder — the one-keystroke answer, promoted to hero furniture. */}
      <CardFinderHero games={games} />
    </section>
  );
}
