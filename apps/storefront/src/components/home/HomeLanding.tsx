import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIRMED_GAME_CODES, GAMES } from "@cambridge-tcg/sku";
import type { UiLang } from "@/lib/lang-mode";
import { Audience } from "@/lib/ui/Audience";
import { PageLayout } from "@/lib/ui/PageLayout";
import { ServiceCards } from "@/components/site/ServiceCards";
import CardFinderHero from "./CardFinderHero";
import HomeArtwork from "./HomeArtwork";

const SEARCH_GAMES = CONFIRMED_GAME_CODES.filter((code) => code !== "tst")
  .map((code) => ({ code, name: GAMES[code].name }));
const link = "text-accent underline underline-offset-4";

/** Search comes first; editorial English is marked independently of the controls. */
export default function HomeLanding({ uiLang, provenance }: { uiLang: UiLang; provenance?: ReactNode }) {
  return (
    <PageLayout width="wide" className="space-y-10 sm:space-y-12">
      <Audience kind="consumer" contexts={["home", "collector", "player"]} />
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 space-y-6">
          <header lang="en">
            <p className="text-sm font-medium text-ink-muted">Card prices & collector tools</p>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">Find the card.<br />Understand the price.</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-ink-muted">Match the printing. Check available prices and their sources.</p>
          </header>
          <div id="find-a-card" className="scroll-mt-24">
            <CardFinderHero games={SEARCH_GAMES} uiLang={uiLang} />
            <div lang="en" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
              <Link href="/guides/read-a-card" className={link}>Where is the card number?</Link>
              <Link href="/methodology/pricing" className={link}>About the prices</Link>
              {provenance && <details><summary className="cursor-pointer">Search coverage</summary><p className="mt-2 max-w-sm leading-6">Games come from the catalog registry; results show available records. {provenance}</p></details>}
            </div>
          </div>
        </div>
        <HomeArtwork />
      </div>
      <section lang="en" aria-labelledby="home-services">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-services" className="text-xl font-semibold text-ink">Your collector toolkit</h2>
          <Link href="/services" className={`${link} inline-flex min-h-11 items-center text-sm`}>All services →</Link>
        </div>
        <ServiceCards featured />
      </section>
      <div lang="en" className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-border-subtle pt-5 text-sm">
        <nav aria-label="More to explore" className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/play" className={link}>Play</Link>
          <Link href="/map" className={link}>Explore the map</Link>
          <Link href="/contact" className={link}>Help</Link>
        </nav>
        <aside aria-label="Agents and developers"><Link href="/agents" className={link}>Agents & API →</Link></aside>
      </div>
    </PageLayout>
  );
}
