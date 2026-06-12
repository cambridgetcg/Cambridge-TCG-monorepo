import Link from "next/link";
import {
  PRICE_GUIDE_GAMES,
  ACCENT_CLASSES,
} from "@/lib/prices/games-config";
import { summarizeGameCoverage } from "@/lib/prices/game-context";

/**
 * Per-game price guide strip — links to /prices/[game] for every
 * curated game in PRICE_GUIDE_GAMES, with substrate-honest pills
 * showing each game's cross-language pattern + open-gap count.
 *
 * Composes on top of K1 (ORACLE_POLICY), the gap ledger (kingdom-084),
 * and the welcomes corpus (kingdom-083) via getGameContext().
 *
 * Lives on the home page below GameGrid, giving visitors a route into
 * the price-guide surfaces we expanded in kingdom-085.
 */

const PATTERN_SHORT: Record<string, string> = {
  stripped: "multi-lang",
  passcode: "passcode",
  diverged: "diverged",
  "single-lang": "EN-only",
};

const PATTERN_TONE: Record<string, string> = {
  stripped: "bg-emerald-950 text-emerald-300 ring-emerald-800",
  passcode: "bg-blue-950 text-blue-300 ring-blue-800",
  diverged: "bg-amber-950 text-amber-300 ring-amber-800",
  "single-lang": "bg-neutral-900 text-neutral-300 ring-neutral-700",
};

export default function PriceGuideStrip() {
  const sorted = [...PRICE_GUIDE_GAMES].sort(
    (a, b) => a.display_priority - b.display_priority,
  );

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">UK Price Guides</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Free, daily-updated card prices across {sorted.length} TCGs. Each
            page lists every set, every card, with reference prices from live
            sources.
          </p>
        </div>
        <Link
          href="/prices"
          className="text-sm text-emerald-400 hover:text-emerald-300 transition"
        >
          All price guides →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map((g) => {
          const accent = ACCENT_CLASSES[g.accent];
          const summary = summarizeGameCoverage(g.slug);
          const patternKind = summary.pattern_kind ?? "stripped";
          return (
            <Link
              key={g.slug}
              href={`/prices/${g.slug}`}
              className={`group rounded-lg border border-neutral-800 ${accent.bg} hover:${accent.border} p-4 transition-colors`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className={`text-sm font-semibold ${accent.text}`}>
                  {g.short_name}
                </h3>
                {!summary.confirmed && (
                  <span className="rounded bg-amber-950 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300 ring-1 ring-amber-800">
                    anticipated
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-xs text-neutral-400">
                {g.seo_description.split(".")[0]}.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span
                  className={`rounded px-1.5 py-0.5 ring-1 ${PATTERN_TONE[patternKind]}`}
                  title={`Oracle policy: ${patternKind}`}
                >
                  {PATTERN_SHORT[patternKind]}
                </span>
                {g.cardrush?.confirmed && (
                  <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-400 ring-1 ring-neutral-700">
                    CardRush JP ✓
                  </span>
                )}
                {summary.anticipated_upstream_count > 0 && (
                  <span className="rounded bg-amber-950 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-900">
                    {summary.anticipated_upstream_count} anticipated source
                    {summary.anticipated_upstream_count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        Pattern: <em>multi-lang</em> = cross-language siblings share an oracle
        (MTG, OP, Lorcana). <em>passcode</em> = Konami passcode anchors identity
        (Yu-Gi-Oh!). <em>diverged</em> = JP/EN tracks have different set codes
        (Pokémon). <em>EN-only</em> = single-language by construction (Flesh and
        Blood). See{" "}
        <Link
          href="/methodology/oracle-policies"
          className="text-blue-400 hover:underline"
        >
          /methodology/oracle-policies
        </Link>{" "}
        for the full strategy table.
      </p>
    </section>
  );
}
