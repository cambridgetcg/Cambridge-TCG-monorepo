import { fetchGames, fetchPrices } from "@/lib/wholesale/client";
import GameGrid from "@/components/home/GameGrid";
import FeaturedCards from "@/components/home/FeaturedCards";
import StorySection from "@/components/home/StorySection";
import { Provenance, WhyLink, Audience } from "@/lib/ui";
import { BRAND_HEADLINE, BRAND_SUBHEAD } from "@/lib/brand";

function freshestUpdate(items: { updated_at: string | null }[]): string | null {
  let max: string | null = null;
  for (const it of items) {
    if (it.updated_at && (max === null || it.updated_at > max)) max = it.updated_at;
  }
  return max;
}

export default async function Home() {
  const [allGames, featured] = await Promise.all([
    fetchGames().catch(() => []),
    fetchPrices({ in_stock: true, sort: "price_desc", limit: 12 }).catch(() => ({
      count: 0,
      total: 0,
      channel: "",
      items: [],
    })),
  ]);

  const freshUpdate = freshestUpdate(featured.items);
  const sortedGames = [...allGames].sort((a, b) => b.card_count - a.card_count);

  return (
    <main>
      <Audience kind="consumer" contexts={["home"]} />

      {/* ── 1. Hero — brand statement + card finder fused into one clean block ── */}
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-neutral-500 mb-4">
          Cambridge TCG · 2026
        </p>
        <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
          {BRAND_HEADLINE}
        </h1>
        <p className="mt-4 text-sm sm:text-base text-neutral-400 max-w-xl mx-auto leading-relaxed">
          {BRAND_SUBHEAD}
        </p>

        {/* Card finder — inline, no separate section */}
        <form
          method="get"
          action="/prices/search"
          className="mt-8 flex flex-col sm:flex-row gap-2 max-w-lg mx-auto"
        >
          <label className="sr-only" htmlFor="finder-game">Game</label>
          <select
            id="finder-game"
            name="game"
            defaultValue={sortedGames[0]?.code ?? ""}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none sm:w-44"
          >
            {sortedGames.map((g) => (
              <option key={g.code} value={g.code}>{g.name}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="finder-q">Card number</label>
          <input
            id="finder-q"
            name="q"
            required
            placeholder="Card number — e.g. OP01-001"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition"
          >
            Find →
          </button>
        </form>
        <p className="mt-3 text-xs text-neutral-500">
          No account, no fee to look. Just find what you need.
        </p>
      </section>

      {/* ── 2. Shop by Game ── */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <GameGrid games={allGames} />
      </section>

      {/* ── 3. Featured Cards ── */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <FeaturedCards cards={featured.items} />
      </section>

      {/* ── 4. Story ── */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <StorySection />
      </section>

      {/* ── 5. Provenance footer line — quiet, honest, one line ── */}
      <div className="max-w-7xl mx-auto px-4 pt-8 pb-12 flex items-center justify-center gap-3 text-xs text-neutral-500">
        <Provenance
          kind="synced"
          source="wholesale"
          at={freshUpdate}
          cadence="daily"
        />
        <WhyLink href="/methodology/pricing" label="how prices work" />
      </div>
    </main>
  );
}
