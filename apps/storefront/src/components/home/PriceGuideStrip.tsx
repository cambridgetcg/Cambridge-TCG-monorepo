import Link from "next/link";
import { tx } from "@/lib/i18n";
import { PRICE_GUIDE_GAMES } from "@/lib/prices/games-config";
import { summarizeGameCoverage } from "@/lib/prices/game-context";
import { PlateHeader } from "@/lib/ui";

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
 *
 * Quiet gallery, 2026-07-05: the per-game ACCENT_CLASSES chrome is gone
 * — hairline mounts, ink type. The pattern pills keep their distinct
 * meanings via the muted tone tokens (ok / info / warning / muted).
 */

const PATTERN_SHORT: Record<string, string> = {
  stripped: "multi-lang",
  passcode: "passcode",
  diverged: "diverged",
  "single-lang": "EN-only",
};

const PATTERN_TONE: Record<string, string> = {
  stripped: "text-ok",
  passcode: "text-info",
  diverged: "text-warning",
  "single-lang": "text-ink-muted",
};

import type { UiLang } from "@/lib/lang-mode";

export default function PriceGuideStrip({ uiLang = "en" }: { uiLang?: UiLang } = {}) {
  const j = uiLang === "ja";
  const sorted = [...PRICE_GUIDE_GAMES].sort(
    (a, b) => a.display_priority - b.display_priority,
  );
  const observedCount = sorted.filter(
    (game) => game.coverage_status === "observed",
  ).length;

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <PlateHeader
        title={tx({ en: "UK Price Guides", ja: "英国の相場帖", es: "Cuadernos de precios del Reino Unido", "zh-Hans": "英国行情册", "zh-Hant": "英國行情簿" }, uiLang)}
        plate={2}
        rule
        action={
          <Link
            href="/prices"
            className="text-sm text-accent hover:text-accent-strong transition-colors whitespace-nowrap"
          >
            {tx({ en: "All price guides →", ja: "相場帖の一覧 →", es: "Todos los cuadernos →", "zh-Hans": "全部行情册 →", "zh-Hant": "行情簿一覽 →" }, uiLang)}
          </Link>
        }
      />
      <p className="-mt-3 mb-6 text-sm text-ink-muted">
        {(() => {
          const m: Record<string, string> = {
            "zh-Hant": `現在真正有目錄行的，是${observedCount}本遊戲行情簿；餘下${sorted.length - observedCount}條路，照直標明「在路上」。每一頁只列手上有的行；來源狀態與權利，就在旁邊。`,
            "zh-Hans": `名录里实际有条目的，目前是 ${observedCount} 个游戏；另外 ${sorted.length - observedCount} 个，页面上写明还在路上。每一页只列手上有的条目，来源的状态与权利，就标在旁边。`,
            es: `Hoy, ${observedCount} cuadernos tienen filas observadas en el catálogo. Otras ${sorted.length - observedCount} rutas se anuncian expresamente como por venir. Cada página muestra solo las filas que tenemos, con el estado de la fuente y los derechos al lado.`,
          };
          if (m[uiLang]) return m[uiLang];
          return j ? (
            <>目録に実際の行があるのは、いま{observedCount}タイトル。あとの{sorted.length - observedCount}タイトルは、「これから」とはっきり書いてあります。どのページも、手もとにある行だけを。出どころの状態と権利は、そのとなりに。</>
          ) : (
            <>
              {observedCount} game guides currently have observed catalog rows;
              {" "}{sorted.length - observedCount} more routes are explicitly anticipated.
              Each page shows only rows held, with source state and rights beside them.
            </>
          );
        })()}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map((g) => {
          const summary = summarizeGameCoverage(g.slug);
          const patternKind = summary.pattern_kind ?? "stripped";
          return (
            <Link
              key={g.slug}
              href={`/prices/${g.slug}`}
              className="group wardrobe-mat rounded-lg p-4 hover:bg-surface-subtle transition-colors"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink group-hover:text-accent transition-colors">
                  {g.short_name}
                </h3>
                {!summary.confirmed && (
                  <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning">
                    {tx({ en: "anticipated", ja: "これから", es: "por hacer", "zh-Hans": "还在路上", "zh-Hant": "在路上" }, uiLang)}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-xs text-ink-muted">
                {g.seo_description.split(".")[0]}.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span
                  className={`rounded border border-border-subtle bg-surface px-1.5 py-0.5 ${PATTERN_TONE[patternKind]}`}
                  title={`Oracle policy: ${patternKind}`}
                >
                  {PATTERN_SHORT[patternKind]}
                </span>
                {g.cardrush?.confirmed && (
                  <span className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-ink-faint">
                    CardRush JP ✓
                  </span>
                )}
                {summary.anticipated_upstream_count > 0 && (
                  <span className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-warning">
                    {summary.anticipated_upstream_count} anticipated source
                    {summary.anticipated_upstream_count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-ink-faint">
        Pattern: <em>multi-lang</em> = cross-language siblings share an oracle
        (MTG, OP, Lorcana). <em>passcode</em> = Konami passcode anchors identity
        (Yu-Gi-Oh!). <em>diverged</em> = JP/EN tracks have different set codes
        (Pokémon). <em>EN-only</em> = single-language by construction (Flesh and
        Blood). See{" "}
        <Link
          href="/methodology/oracle-policies"
          className="text-accent hover:underline"
        >
          /methodology/oracle-policies
        </Link>{" "}
        for the full strategy table.
      </p>
    </section>
  );
}
