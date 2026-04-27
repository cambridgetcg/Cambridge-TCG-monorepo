import { fetchGames, fetchPrices, fetchSets } from "@/lib/wholesale/client";
import HeroSlideshow from "@/components/home/HeroSlideshow";
import GameGrid from "@/components/home/GameGrid";
import SetGrid from "@/components/home/SetGrid";
import FeaturedCards from "@/components/home/FeaturedCards";
import StorySection from "@/components/home/StorySection";

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

  return (
    <main>
      <HeroSlideshow />
      <GameGrid games={allGames} />
      <SetGrid sets={setsWithThumbs} gameSlug="one-piece" />
      <StorySection />
      <FeaturedCards cards={featured.items} />
    </main>
  );
}
