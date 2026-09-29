import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIRMED_GAME_CODES, GAMES } from "@cambridge-tcg/sku";
import type { UiLang } from "@/lib/lang-mode";
import { Audience } from "@/lib/ui/Audience";
import { PageLayout } from "@/lib/ui/PageLayout";
import { ReadingTrails } from "@/components/site/RoomDirectory";
import CardFinderHero from "./CardFinderHero";

const SEARCH_GAMES = CONFIRMED_GAME_CODES.filter((code) => code !== "tst")
  .map((code) => ({ code, name: GAMES[code].name }));
const link = "text-accent underline underline-offset-4";

/** English editorial copy is marked; search keeps the chosen UI language. */
export default function HomeLanding({ uiLang, provenance }: { uiLang: UiLang; provenance?: ReactNode }) {
  return (
    <PageLayout width="wide" className="space-y-12 sm:space-y-16">
      <Audience kind="consumer" contexts={["home", "collector", "player"]} />
      <header lang="en" className="max-w-3xl">
        <p className="text-sm font-medium tracking-wide text-ink-muted">A place for cards, and the things around them</p>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">There is more to a card.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-muted">A picture to look at. A small set of rules. Something you keep, remember or play. Start with the part that interests you.</p>
        <nav aria-label="Ways into Cambridge TCG" className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-base font-medium">
          <a href="#find-a-card" className={`${link} inline-flex min-h-11 items-center`}>Meet a card</a>
          <Link href="/culture" className={`${link} inline-flex min-h-11 items-center`}>Follow a story</Link>
          <Link href="/play" className={`${link} inline-flex min-h-11 items-center`}>Take a seat</Link>
        </nav>
      </header>
      <section lang="en" aria-labelledby="look-closely" className="grid gap-8 border-y border-border-subtle py-8 md:grid-cols-[1fr_1.3fr] md:gap-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">A first reading</p>
          <h2 id="look-closely" className="mt-3 font-display text-2xl font-semibold text-ink">The same card. A different copy.</h2>
        </div>
        <div className="space-y-4 text-base leading-7 text-ink-muted">
          <p>Two cards can share a name while their language, printing or finish differs. Two copies of the same printing can have different wear—and different stories.</p>
          <p>Before a price or a collection entry, there is a simpler question: which card are you looking at?</p>
          <Link href="/guides/read-a-card" className={`${link} inline-flex min-h-11 items-center`}>Read a card, one detail at a time →</Link>
        </div>
      </section>
      <div id="find-a-card" className="scroll-mt-24">
        <CardFinderHero games={SEARCH_GAMES} uiLang={uiLang} />
        <p lang="en" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-6 text-ink-muted">
          Game choices come from the registered catalog. {provenance}
          <Link href="/prices" className={link}>Browse by game</Link>
          <Link href="/methodology/pricing" className={link}>How the data works</Link>
        </p>
      </div>
      <section lang="en" aria-labelledby="follow-thread">
        <h2 id="follow-thread" className="font-display text-2xl font-semibold text-ink">Follow a thread</h2>
        <p className="mb-6 mt-2 max-w-2xl leading-7 text-ink-muted">A few connected stops. Each one gives you something to carry into the next.</p>
        <ReadingTrails />
      </section>
      <section lang="en" aria-labelledby="your-place" className="grid gap-8 border-t border-border-subtle pt-8 md:grid-cols-2">
        <div>
          <h2 id="your-place" className="font-display text-xl font-semibold text-ink">Keep what matters to you</h2>
          <p className="mt-3 max-w-prose text-sm leading-6 text-ink-muted">Your collection has its own space for cards and records. Sign in with an existing account.</p>
          <Link href="/account/portfolio" prefetch={false} className={`${link} mt-3 inline-flex min-h-11 items-center text-sm`}>Your collection →</Link>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Find your way around</h2>
          <p className="mt-3 max-w-prose text-sm leading-6 text-ink-muted">Eight rooms, with a plain explanation of what each is for. Guides, stories, people and the sources behind the records.</p>
          <Link href="/map" className={`${link} mt-3 inline-flex min-h-11 items-center text-sm`}>Open the map →</Link>
        </div>
      </section>
      <aside lang="en" aria-labelledby="home-agents" className="border-t border-border-subtle pt-6">
        <h2 id="home-agents" className="text-base font-semibold text-ink">Building with card data?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Start with the card identifier and price contracts. Keep the exact printing, currency, source and observation time together.</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link href="/standards/card-data" className={link}>SKU & price contracts</Link>
          <Link href="/agents" className={link}>Agents & API</Link>
        </div>
      </aside>
      <p lang="en" className="text-sm leading-6 text-ink-muted">Existing orders or agreements: <Link href="/account" prefetch={false} className={link}>Your account</Link>{" · "}<Link href="/contact" className={link}>Get help</Link></p>
    </PageLayout>
  );
}
