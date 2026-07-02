import Link from "next/link";
import { fetchGames, fetchPrices } from "@/lib/wholesale/client";
import AnswerMachineHero from "@/components/home/AnswerMachineHero";
import ThreeDoors from "@/components/home/ThreeDoors";
import AgentEmbassyBand from "@/components/home/AgentEmbassyBand";
import NoticeBoard from "@/components/home/NoticeBoard";
import CardFan from "@/components/home/CardFan";
import FeaturedCards from "@/components/home/FeaturedCards";
import ConnectsStrip from "@/components/home/ConnectsStrip";
import { Audience, Provenance, WhyLink } from "@/lib/ui";

/**
 * The homepage — the Glass Exchange (2026-07-02 rebuild).
 *
 * Gallery front-of-house, terminal machinery visible: the site introduces
 * itself as trading infrastructure you can watch working, with the shop
 * honestly presented as one room off the lobby (NoticeBoard — never
 * claims permanence, never claims closure, pending the regulator ruling).
 * Predecessor sections retired here: HeroSlideshow, GameGrid, SetGrid,
 * PriceGuideStrip, KingdomStrip (folded into the embassy band's
 * breadcrumb), StorySection (belongs to /about), ThreeOperations (still
 * serves /platform and /about).
 *
 * Empty-state rule (substrate honesty): sections render only with real
 * rows — CardFan and FeaturedCards return null on empty; no zeroed stats,
 * no placeholder theater.
 */

function freshestUpdate(items: { updated_at: string | null }[]): string | null {
  let max: string | null = null;
  for (const it of items) {
    if (it.updated_at && (max === null || it.updated_at > max)) max = it.updated_at;
  }
  return max;
}

const NOTICE_DATE = "2026-07-02";

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

  return (
    <main className="wardrobe-ground">
      <Audience kind="consumer" contexts={["home"]} />

      {/* The welcome, demoted from banner to hairline — doctrine kept.
          /welcome-all is the doors; /welcome routes you; /intro explains
          the game form (contact-surface spec §3.3). */}
      <div className="max-w-7xl mx-auto px-4 pt-3">
        <p className="text-xs text-ink-faint flex flex-wrap items-center gap-x-2">
          <span className="text-accent" aria-hidden="true">✦</span>
          <span>Welcome to all existence — humans · agents · kin</span>
          <Link href="/welcome-all" className="underline hover:text-accent">the doors</Link>
          <span aria-hidden="true">·</span>
          <Link href="/welcome" className="underline hover:text-accent">find your path</Link>
          <span aria-hidden="true">·</span>
          <Link href="/intro" className="underline hover:text-accent">what&rsquo;s a TCG?</Link>
        </p>
      </div>

      {/* 1 · The answer machine — headline, finder, the engine behind glass. */}
      <AnswerMachineHero games={allGames} freshUpdate={freshUpdate} />

      {/* 2 · Three doors — know the price / trade & liquidate / play. */}
      <ThreeDoors />

      {/* 3 · The embassy — agents addressed in the open, in their register. */}
      <AgentEmbassyBand />

      {/* 4 · The shop — one room, honestly noticed. */}
      <section aria-label="The shop" className="max-w-7xl mx-auto px-4 py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">
          The shop · one room of the platform
        </p>
        <div className="grid lg:grid-cols-[minmax(280px,420px)_1fr] gap-8 items-center">
          <NoticeBoard date={NOTICE_DATE} />
          <CardFan cards={featured.items} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            href="/catalog"
            className="inline-block rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent transition"
          >
            Browse the catalog →
          </Link>
          {/* The prices shown in this room carry their provenance here,
              beside them — not only up in the hero. */}
          <span className="flex items-center gap-3 text-xs">
            <Provenance kind="synced" source="wholesale" at={freshUpdate} cadence="daily" />
            <WhyLink href="/methodology/pricing" label="how prices work" />
          </span>
        </div>
      </section>

      <FeaturedCards cards={featured.items.slice(3)} />

      {/* 5 · How it connects + the doctrine the site actually enforces. */}
      <ConnectsStrip />
    </main>
  );
}
