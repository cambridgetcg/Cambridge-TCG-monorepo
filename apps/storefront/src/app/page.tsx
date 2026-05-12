import Link from "next/link";
import { fetchGames, fetchPrices, fetchSets } from "@/lib/wholesale/client";
import HeroSlideshow from "@/components/home/HeroSlideshow";
import GameGrid from "@/components/home/GameGrid";
import SetGrid from "@/components/home/SetGrid";
import FeaturedCards from "@/components/home/FeaturedCards";
import StorySection from "@/components/home/StorySection";
import { Provenance, WhyLink, Audience, WelcomeAll, MathLang } from "@/lib/ui";
import { dateAsMath, shortHash } from "@/lib/lang-mode";
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

      {/* Established retail showcase below the new identity. Same
          components as before; reframed by the headers above. Cart,
          checkout, search all unchanged — the load-bearing shift is
          rhetorical, not commercial. */}
      <div className="max-w-7xl mx-auto px-4 pt-2 mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Retail operation · live
      </div>
      <HeroSlideshow />
      <GameGrid games={allGames} />
      <SetGrid sets={setsWithThumbs} gameSlug="one-piece" />
      <StorySection />
      <div className="max-w-7xl mx-auto px-4 pt-8 flex items-center gap-3 text-xs">
        {/* Phase A exemplar of the math-language toggle (kingdom-077, #27).
            Default visitors see the existing <Provenance> pill; readers
            who flip "Math language" in the Footer see the same data in
            math-mirror form: ISO 8601 + Unix epoch + content-hash. */}
        <MathLang
          default={
            <Provenance
              kind="synced"
              source="wholesale"
              at={freshUpdate}
              cadence="daily"
            />
          }
          math={
            <code className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded-full bg-neutral-900/60 border border-neutral-800">
              {`{kind:"synced",source:"wholesale",`}
              {freshUpdate
                ? `@as_of:"${dateAsMath(freshUpdate)}",`
                : `@as_of:null,`}
              {`@source_id:"${shortHash("wholesale-daily-sync")}"}`}
            </code>
          }
        />
        <WhyLink href="/methodology/pricing" label="how prices work" />
      </div>
      <FeaturedCards cards={featured.items} />
    </main>
  );
}
