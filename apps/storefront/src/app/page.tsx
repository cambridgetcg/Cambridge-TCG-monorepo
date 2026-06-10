import Link from "next/link";
import { fetchGames, fetchPrices, fetchSets } from "@/lib/wholesale/client";
import HeroSlideshow from "@/components/home/HeroSlideshow";
import GameGrid from "@/components/home/GameGrid";
import SetGrid from "@/components/home/SetGrid";
import PriceGuideStrip from "@/components/home/PriceGuideStrip";
import FeaturedCards from "@/components/home/FeaturedCards";
import CardFinderHero from "@/components/home/CardFinderHero";
import StorySection from "@/components/home/StorySection";
import { Provenance, WhyLink, Audience, WelcomeAll } from "@/lib/ui";
import { BrandStatement, ThreeOperations } from "@/lib/brand";

function freshestUpdate(items: { updated_at: string | null }[]): string | null {
  let max: string | null = null;
  for (const it of items) {
    if (it.updated_at && (max === null || it.updated_at > max)) max = it.updated_at;
  }
  return max;
}

export default async function Home() {
  const [allGames, featured, opSets] = await Promise.all([
    fetchGames().catch(() => []),
    fetchPrices({ in_stock: true, sort: "price_desc", limit: 12 }).catch(() => ({
      count: 0,
      total: 0,
      channel: "",
      items: [],
    })),
    fetchSets("one-piece").catch(() => []),
  ]);

  // Take latest 8 sets (sorted by release_date desc, then code desc)
  const latestSets = [...opSets]
    .sort((a, b) => {
      if (a.release_date && b.release_date)
        return b.release_date.localeCompare(a.release_date);
      return b.code.localeCompare(a.code);
    })
    .slice(0, 8);

  // Fetch one card thumbnail per set in parallel
  const setsWithThumbs = await Promise.all(
    latestSets.map(async (set) => {
      const res = await fetchPrices({ game: "one-piece", set: set.code, limit: 1 }).catch(
        () => ({ count: 0, total: 0, channel: "", items: [] })
      );
      return { ...set, thumb: res.items[0] ?? null };
    })
  );

  const freshUpdate = freshestUpdate(featured.items);

  return (
    <main>
      <Audience kind="consumer" contexts={["home"]} />
      {/* Universal welcome ribbon — small, calm, links to /welcome-all and
          /intro. The visible philosophy at the platform's front door.
          See docs/connections/the-welcome-all.md (#26). */}
      <div className="max-w-7xl mx-auto px-4 pt-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-amber-400" aria-hidden="true">✦</span>
          <span className="text-neutral-300">
            <strong>Welcome to all existence</strong> — biological and
            non-biological, from earth and not from earth, from any dimension.
          </span>
          <Link
            href="/welcome-all"
            className="text-amber-400 hover:text-amber-300 underline ml-auto"
          >
            the doors →
          </Link>
          <Link
            href="/intro"
            className="text-neutral-500 hover:text-amber-400 underline"
          >
            new to TCG?
          </Link>
        </div>
      </div>
      {/* THE PRIMARY IDENTITY — Cambridge TCG as the TCG world's data
          aggregator. Replaces the retail-first frame; the retail surfaces
          below are reframed as one of three operations sharing the same
          substrate. See docs/connections/the-rebrand.md (kingdom-080). */}
      <BrandStatement size="hero" />
      <ThreeOperations />

      {/* The front door — find any card by number, any game, no account,
          no fee to look. Reuses the kingdom-090 search substrate via
          /prices/search. North star: let people find what they need. */}
      <CardFinderHero games={allGames} />

      {/* Established retail showcase below the new identity. Same
          components as before; reframed by the headers above. Cart,
          checkout, search all unchanged — the load-bearing shift is
          rhetorical, not commercial. */}
      <div className="max-w-7xl mx-auto px-4 pt-2 mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Retail operation · live
      </div>
      <HeroSlideshow />
      <GameGrid games={allGames} />
      <PriceGuideStrip />
      <SetGrid sets={setsWithThumbs} gameSlug="one-piece" />
      <StorySection />
      <div className="max-w-7xl mx-auto px-4 pt-8 flex items-center gap-3 text-xs">
        {/* <Provenance> is math-aware internally as of kingdom-078 Phase B(1).
            The Phase A <MathLang> wrapper that previously lived here did the
            toggle twice — once outside, once inside. Removed in kingdom-081
            for substrate honesty; the toggle still works (Provenance reads
            the cookie itself). See docs/connections/the-math-language.md (#27). */}
        <Provenance
          kind="synced"
          source="wholesale"
          at={freshUpdate}
          cadence="daily"
        />
        <WhyLink href="/methodology/pricing" label="how prices work" />
      </div>
      <FeaturedCards cards={featured.items} />
    </main>
  );
}
