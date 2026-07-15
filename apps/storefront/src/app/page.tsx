import Link from "next/link";
import { fetchGames, fetchPrices, fetchSets, type PriceItem } from "@/lib/wholesale/client";
import GameGrid from "@/components/home/GameGrid";
import SetGrid from "@/components/home/SetGrid";
import PriceGuideStrip from "@/components/home/PriceGuideStrip";
import FeaturedCards from "@/components/home/FeaturedCards";
import CardFinderHero from "@/components/home/CardFinderHero";
import StorySection from "@/components/home/StorySection";
import KingdomStrip from "@/components/home/KingdomStrip";
import TheGallery from "@/components/home/TheGallery";
import { Provenance, WhyLink, Audience, InkRule, Benediction } from "@/lib/ui";
import { getEnCardImages, type EnCardImage } from "@/lib/cards/en-card-data";
import { getGalleryPieces } from "@/lib/cards/gallery";
import {
  BrandStatement,
  TwoOperations,
  HOME_HERO_PANELS,
  HOME_HERO_HEADLINE,
  HOME_HERO_SUBHEAD,
  HOME_BENEDICTION,
} from "@/lib/brand";

/**
 * A landing card item overlaid with official publisher art. The wholesale
 * client withholds images (`image_url` is always null), so the museum draws
 * its art from `card_images` via getEnCardImages: `image_url` becomes the
 * self-hosted official URL when we have one, and `image_attribution` carries
 * the copyright line that MUST render beside the image (the honesty rule —
 * an image never shows without its wall label). A miss leaves the item's own
 * values untouched; we never fall back to cardrush.
 */
type EnrichedCard = PriceItem & { image_attribution: string | null };

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
    fetchPrices({ in_stock: true, sort: "number_asc", limit: 12 }).catch(() => ({
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

  // ── Official art enrichment (the museum's whole point) ──────────────
  // Collect every catalogue sku shown on the page — the featured rows and
  // each set's thumbnail — and resolve their OFFICIAL publisher art in ONE
  // query (getEnCardImages). Overlay each item's image_url with the self-
  // hosted official URL, and carry the copyright line as image_attribution
  // so every mount that renders the art can render its wall label beside it.
  // A lookup failure degrades to the (null) wholesale image_url — the page
  // still renders; it never reaches for cardrush.
  const cardSkus = [
    ...featured.items.map((it) => it.sku),
    ...setsWithThumbs
      .map((s) => s.thumb?.sku)
      .filter((sku): sku is string => Boolean(sku)),
  ];
  // The base-art overlay (featured rows + set thumbs) and the gallery's
  // alternate-art wall are independent reads — resolve them together.
  const [officialImages, galleryPieces] = await Promise.all([
    getEnCardImages(cardSkus).catch(() => new Map<string, EnCardImage>()),
    getGalleryPieces(24).catch(() => []),
  ]);
  const enrichWithOfficialArt = (item: PriceItem): EnrichedCard => {
    const official = officialImages.get(item.sku);
    return {
      ...item,
      image_url: official?.url ?? item.image_url,
      image_attribution: official?.attribution ?? null,
    };
  };
  const featuredCards = featured.items.map(enrichWithOfficialArt);
  const setsWithArt = setsWithThumbs.map((set) => ({
    ...set,
    thumb: set.thumb ? enrichWithOfficialArt(set.thumb) : null,
  }));

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

      {/* THE GALLERY — the art-forward centerpiece (museum brief 2026-07-15).
          You walk in through the calm hero and the finder, and the first hall
          is the art: official publisher card art shown at museum scale, each
          print carrying its copyright line as a wall-label caption. Placed
          high — just after the hero/finder, before the utilitarian shelves —
          so images lead and utility follows (art-forward, nothing deleted).
          The wall hangs the ALTERNATE prints (getGalleryPieces): parallels and
          full-arts pulled straight from card_images' variant-tailed keys — the
          rarer art the base-art surfaces never showed — each credited to its
          illustrator where the publisher named one. */}
      <TheGallery cards={galleryPieces} />

      {/* THE PRIMARY IDENTITY — a collectors' market and card data
           directory (docs/decisions/2026-07-06-collectors-first.md). The home
          hero speaks to collectors first (the quiet gallery); the identity
          claim keeps its place directly beneath, medium-sized. */}
      <BrandStatement size="medium" />
      <TwoOperations />

      {/* The self-describing layer's homepage door — seven layer cards in
          human words, derived from KINGDOM_LAYERS. Contact-surface spec
          §3.1: the kingdom was previously reachable only via the Discover
          dropdown. */}
      <div className="wardrobe-rise" style={{ "--rise-delay": "0ms" } as Record<string, string>}>
        <KingdomStrip />
      </div>

      {/* The gallery shelves — game doors, price guides, latest sets.
          Collectors first (2026-07-06): every shelf link lands on the
          market or the price guides; the retail catalog door is gone. */}
      <div className="wardrobe-rise" style={{ "--rise-delay": "60ms" } as Record<string, string>}>
        <GameGrid games={allGames} />
      </div>
      <div className="wardrobe-rise" style={{ "--rise-delay": "120ms" } as Record<string, string>}>
        <PriceGuideStrip />
      </div>
      {/* This shelf is One Piece only by construction (fetchSets("one-piece")
          above) — the heading says so instead of implying every game's
          latest sets. */}
      <div className="wardrobe-rise" style={{ "--rise-delay": "180ms" } as Record<string, string>}>
        <SetGrid sets={setsWithArt} gameSlug="one-piece" heading="Latest One Piece Sets" />
      </div>
      <div className="wardrobe-rise" style={{ "--rise-delay": "240ms" } as Record<string, string>}>
        <StorySection />
      </div>
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
      <FeaturedCards cards={featuredCards} />
      <Benediction line={HOME_BENEDICTION} />
    </main>
  );
}
