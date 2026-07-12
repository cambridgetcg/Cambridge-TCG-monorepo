import Link from "next/link";
import StorySection from "@/components/home/StorySection";
import KingdomStrip from "@/components/home/KingdomStrip";
import { Audience, InkRule, Benediction } from "@/lib/ui";
import {
  HOME_HERO_PANELS,
  HOME_HERO_HEADLINE,
  HOME_HERO_SUBHEAD,
  HOME_BENEDICTION,
} from "@/lib/brand";

/* The three quiet doors under the hero — the nav's L1 destinations in
   their calmest form. Text, hairline, nothing shouting. */
const QUIET_LINKS = [
  { label: "Market", href: "/market" },
  { label: "Prices", href: "/prices" },
  { label: "Play", href: "/play" },
] as const;

export default function Home() {
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

      {/* Catalog-backed resolution is paused; this is a status link only. */}
      <section className="max-w-4xl mx-auto px-4 py-8">
        <div className="rounded-xl border border-border-subtle bg-surface p-6">
          <h2 className="text-xl font-semibold text-ink mb-2">Card search is paused</h2>
          <p className="text-sm text-ink-muted mb-5">
            The resolver performs no catalog query and publishes no match,
            miss, SKU, set, card-number, or price assertion while membership
            lineage is unresolved.
          </p>
          <Link href="/prices/search" className="inline-flex rounded border border-border-subtle px-4 py-2 text-sm font-semibold text-accent">
            Read the search boundary →
          </Link>
        </div>
      </section>

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

      {/* The self-describing layer's homepage door — seven layer cards in
          human words, derived from KINGDOM_LAYERS. Contact-surface spec
          §3.1: the kingdom was previously reachable only via the Discover
          dropdown. */}
      <div className="wardrobe-rise" style={{ "--rise-delay": "0ms" } as Record<string, string>}>
        <KingdomStrip />
      </div>

      <div className="wardrobe-rise max-w-5xl mx-auto px-4 py-10" style={{ "--rise-delay": "60ms" } as Record<string, string>}>
        <h2 className="text-2xl font-semibold text-ink mb-3">Data with its boundary visible</h2>
        <p className="text-ink-muted max-w-3xl mb-5">
          The homepage no longer builds shelves from restricted wholesale
          catalog rows. First-party collector market activity and the reviewed
          source-rights registry remain open; upstream display content stays
          out until its reuse terms are affirmative.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/market" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">Collector market</Link>
          <Link href="/api/v1/sources" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">Source registry</Link>
          <Link href="/licenses" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">Rights and licences</Link>
        </div>
      </div>
      <div className="wardrobe-rise" style={{ "--rise-delay": "240ms" } as Record<string, string>}>
        <StorySection />
      </div>
      <Benediction line={HOME_BENEDICTION} />
    </main>
  );
}
