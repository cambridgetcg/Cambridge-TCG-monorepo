import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIRMED_GAME_CODES, GAMES } from "@cambridge-tcg/sku";
import type { UiLang } from "@/lib/lang-mode";
import { Audience } from "@/lib/ui/Audience";
import { PageLayout } from "@/lib/ui/PageLayout";
import { DataFoundations } from "@/components/site/DataFoundations";
import { PLATFORM } from "@/content/platform";
import CardFinderHero from "./CardFinderHero";
import HomeArtwork from "./HomeArtwork";

const SEARCH_GAMES = CONFIRMED_GAME_CODES.filter((code) => code !== "tst")
  .map((code) => ({ code, name: GAMES[code].name }));
const link = "text-accent underline underline-offset-4 hover:text-accent-strong";
const quiet = "text-ink-muted underline decoration-border-strong underline-offset-4 hover:text-ink";

/** Search comes first; editorial English is marked independently of the controls. */
export default function HomeLanding({ uiLang, provenance }: { uiLang: UiLang; provenance?: ReactNode }) {
  return (
    <PageLayout width="wide" className="space-y-10 sm:space-y-14">
      <Audience kind="consumer" contexts={["home", "collector", "player"]} />
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="min-w-0 space-y-7 lg:col-span-7">
          <header lang="en">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">Open-source TCG infrastructure</p>
            <h1 className="mt-5 font-display text-[2.5rem] font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl">TCG data.<br />Made to connect.</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-ink-muted">{PLATFORM.description}</p>
            <nav aria-label="Build with card data" className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><Link href="/standards" className={link}>Explore the standards →</Link><Link href="/agents" className={link}>Build with the API →</Link></nav>
          </header>
          <div id="find-a-card" className="scroll-mt-24">
            <CardFinderHero games={SEARCH_GAMES} uiLang={uiLang} />
            <div lang="en" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs leading-6 text-ink-muted">
              <Link href="/guides/read-a-card" className={quiet}>Where is the card number?</Link>
              <Link href="/methodology/pricing" className={quiet}>About the prices</Link>
              {provenance && <details><summary className="cursor-pointer">Search coverage</summary><p className="mt-2 max-w-sm leading-6">Games come from the catalog registry; results show available records. {provenance}</p></details>}
            </div>
          </div>
        </div>
        <div className="lg:col-span-5"><HomeArtwork /></div>
        <section lang="en" aria-labelledby="home-foundations" className="lg:col-span-12">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="home-foundations" className="font-display text-2xl font-medium tracking-tight text-ink">Four foundations. One connected view.</h2>
            <Link href="/roadmap" className={`${link} inline-flex min-h-11 items-center text-sm`}>Integration roadmap →</Link>
          </div>
          <DataFoundations />
        </section>
      </div>
      <div lang="en" className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 text-sm">
        <nav aria-label="More to explore" className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/services" className={quiet}>All services →</Link>
          <Link href="/account/portfolio" prefetch={false} className={quiet}>Collection · Existing account</Link>
          <Link href="/play" className={quiet}>Play</Link>
          <Link href="/map" className={quiet}>Explore the map</Link>
          <Link href="/contact" className={quiet}>Help</Link>
        </nav>
        <aside aria-label="Open-source development"><Link href="/about" className={quiet}>About the project →</Link></aside>
      </div>
    </PageLayout>
  );
}
