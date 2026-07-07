import Link from "next/link";
import { fetchGames, fetchPrices, fetchSets } from "@/lib/wholesale/client";
import GameGrid from "@/components/home/GameGrid";
import SetGrid from "@/components/home/SetGrid";
import PriceGuideStrip from "@/components/home/PriceGuideStrip";
import FeaturedCards from "@/components/home/FeaturedCards";
import CardFinderHero from "@/components/home/CardFinderHero";
import StorySection from "@/components/home/StorySection";
import KingdomStrip from "@/components/home/KingdomStrip";
import { Provenance, WhyLink, Audience, InkRule } from "@/lib/ui";
import {
  BrandStatement,
  TwoOperations,
  HOME_HERO_PANELS,
  HOME_HERO_HEADLINE,
  HOME_HERO_SUBHEAD,
} from "@/lib/brand";

/* The three quiet doors under the hero — the nav's L1 destinations in
   their calmest form. Text, hairline, nothing shouting. */
const QUIET_LINKS = [
  { label: "Market", href: "/market" },
  { label: "Prices", href: "/prices" },
  { label: "Play", href: "/play" },
] as const;

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
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-ink-muted">
            <strong className="text-ink font-medium">Welcome to all existence</strong> — biological and
            non-biological, from earth and not from earth, from any dimension.
          </span>
          <Link
            href="/welcome-all"
            className="text-accent hover:text-accent-strong underline ml-auto"
          >
            the doors →
          </Link>
          {/* /welcome asks who you are and routes you; /intro explains the
              game form itself. The old single "new to TCG?" label sent human
              novices to the any-intelligence concept cards — exactly wrong
              (contact-surface spec §3.3, de-orphan /welcome). */}
          <Link
            href="/welcome"
            className="text-ink-muted hover:text-accent underline"
          >
            find your path
          </Link>
          <Link
            href="/intro"
            className="text-ink-faint hover:text-accent underline"
          >
            what&apos;s a TCG?
          </Link>
        </div>
      </div>

      {/* THE FRONT DOOR — one Fraunces statement, the finder, three quiet
          links. The anime slideshow is gone (the quiet gallery: the card
          art is the art; everything else is a quiet room). Text-first hero
          — nothing here priority-loads an image, so LCP is the headline.
          Home-door voice lives in @/lib/brand (HOME_HERO_*); the
          data-provider identity (kingdom-080) follows just below. */}
      <header className="relative max-w-7xl mx-auto px-4 pt-14 sm:pt-20 pb-2">
        {/* The first panel's sky tone — screentone dissolving upward,
            behind the text, never over it. Pure CSS; absent in
            terminal/high-contrast/text-mode by the theme gates. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none"
        />
        {/* Two panels; the gutter between them breathes (9s). The h1 is
            one accessible sentence — screen readers and no-JS read
            HOME_HERO_HEADLINE unchanged; the split is presentation. */}
        <h1 className="relative font-display text-4xl sm:text-5xl font-medium tracking-tight text-ink leading-[1.08] max-w-3xl">
          <span className="sr-only">{HOME_HERO_HEADLINE}</span>
          <span aria-hidden="true" className="wardrobe-breathe">
            {HOME_HERO_PANELS.map((panel) => (
              <span key={panel} className="block">{panel}</span>
            ))}
          </span>
        </h1>
        <p className="relative mt-5 max-w-2xl text-base sm:text-lg text-ink-muted leading-relaxed">
          {HOME_HERO_SUBHEAD}
        </p>
        <InkRule className="relative mt-8 max-w-3xl" />
        <p className="relative mt-6 font-mono text-xs text-ink-faint">
          <span className="wardrobe-bob inline-block">↓ enter the story</span>
        </p>
      </header>

      {/* The front door — find any card by number, any game, no account,
          no fee to look. Reuses the kingdom-090 search substrate via
          /prices/search. North star: let people find what they need. */}
      <CardFinderHero games={allGames} />

      <nav
        aria-label="Explore Cambridge TCG"
        className="max-w-7xl mx-auto px-4 pb-8 flex flex-wrap gap-3"
      >
        {QUIET_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm text-ink-muted hover:text-ink hover:border-border-strong transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* THE PRIMARY IDENTITY — a collectors' market and an open data
          commons (docs/decisions/2026-07-06-collectors-first.md). The home
          hero speaks to collectors first (the quiet gallery); the identity
          claim keeps its place directly beneath, medium-sized. */}
      <BrandStatement size="medium" />
      <TwoOperations />

      {/* The self-describing layer's homepage door — seven layer cards in
          human words, derived from KINGDOM_LAYERS. Contact-surface spec
          §3.1: the kingdom was previously reachable only via the Discover
          dropdown. */}
      <KingdomStrip />

      {/* The gallery shelves — game doors, price guides, latest sets.
          Collectors first (2026-07-06): every shelf link lands on the
          market or the price guides; the retail catalog door is gone. */}
      <GameGrid games={allGames} />
      <PriceGuideStrip />
      {/* This shelf is One Piece only by construction (fetchSets("one-piece")
          above) — the heading says so instead of implying every game's
          latest sets. */}
      <SetGrid sets={setsWithThumbs} gameSlug="one-piece" heading="Latest One Piece Sets" />
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
