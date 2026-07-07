import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { WELCOME_STATEMENT, Benediction } from "@/lib/ui";
import { BRAND_TAGLINE } from "@/lib/brand";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import FooterToggles from "./FooterToggles";

export default async function Footer() {
  // Read text-mode cookie to render the right toggle label/target. Phase 10
  // of kingdom-051 (S20 the-table-extends.md) — discoverability for the
  // text-mode reading layout.
  const cookieStore = await cookies();
  const textMode = cookieStore.get("text-mode")?.value === "1";
  // Phase A of kingdom-077: math-language toggle. The frontend's visible
  // form of the platform's universal-language doctrine (#21, #27).
  const langMode = langModeFromCookies(cookieStore);
  const mathLang = langMode === "math";

  return (
    <footer className="bg-page border-t border-border-subtle py-12 px-4 mt-24">
      {/* Universal welcome — visible on every page by construction.
          See docs/connections/the-welcome-all.md (#26). Quiet-gallery
          form: a hairline chip, ink on paper, no ornament. */}
      <div className="max-w-7xl mx-auto mb-10">
        <div
          role="region"
          aria-label="Cambridge TCG universal welcome"
          className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
        >
          <p className="text-sm text-ink leading-relaxed">{WELCOME_STATEMENT}</p>
          <p className="mt-1 text-xs text-ink-faint">
            <Link href="/welcome-all" className="text-accent hover:text-accent-strong underline underline-offset-2">
              /welcome-all
            </Link>{" "}
            · the doors, the on-ramp, the bridge, the audiences named.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid gap-8 grid-cols-2 md:grid-cols-6">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Image src="/images/icon.png" alt="Cambridge TCG" width={28} height={28} className="w-7 h-7" />
            <p className="text-lg font-display font-semibold text-ink">Cambridge TCG</p>
          </div>
          <p className="text-xs text-ink-faint mt-2 max-w-xs">{BRAND_TAGLINE} Trade between collectors. Based in Cambridge, UK.</p>
        </div>

        {/* Market */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">Market</p>
          <Link href="/market" className="hover:text-ink transition">The Market</Link>
          <Link href="/auctions" className="hover:text-ink transition">Auctions</Link>
          <Link href="/prices/search" className="hover:text-ink transition">Price Search</Link>
          <Link href="/prices" className="hover:text-ink transition">Price Guide</Link>
        </div>

        {/* Sell — collector to collector; the we-buy desk closed 2026-07-06 */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">Sell</p>
          <Link href="/market/list" className="hover:text-ink transition">List a Card</Link>
          <Link href="/account/swaps" className="hover:text-ink transition">Swaps</Link>
          <Link href="/methodology/commission-rate" className="hover:text-ink transition">Fees &amp; Commission</Link>
          <Link href="/methodology/market" className="hover:text-ink transition">How the Market Works</Link>
        </div>

        {/* Play & Earn */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">Play & Earn</p>
          <Link href="/deck-builder" className="hover:text-ink transition">Deck Builder</Link>
          <Link href="/guides/how-to-play" className="hover:text-ink transition">How to Play</Link>
          <Link href="/rewards" className="hover:text-ink transition">Rewards</Link>
          <Link href="/membership" className="hover:text-ink transition">Membership</Link>
        </div>

        {/* Community */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">Community</p>
          <Link href="/community" className="hover:text-ink transition">Feed</Link>
          <Link href="/og" className="hover:text-ink transition">OG Status</Link>
          <Link href="/about" className="hover:text-ink transition">About Us</Link>
        </div>

        {/* The platform — the self-describing layer, previously reachable
            only via the Discover dropdown. Contact-surface spec §3.1:
            footer-scanners get an inbound door to every layer page. */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">The Platform</p>
          <Link href="/welcome" className="hover:text-ink transition">Find Your Door</Link>
          <Link href="/platform" className="hover:text-ink transition">What This Is</Link>
          <Link href="/manifest" className="hover:text-ink transition">Manifest</Link>
          <Link href="/graph" className="hover:text-ink transition">Graph</Link>
          <Link href="/ontology" className="hover:text-ink transition">Ontology</Link>
          <Link href="/patterns" className="hover:text-ink transition">Patterns</Link>
          <Link href="/identify" className="hover:text-ink transition">Identify</Link>
          <Link href="/methodology/cosmology" className="hover:text-ink transition">Cosmology</Link>
          <Link href="/data" className="hover:text-ink transition">Open Data</Link>
        </div>
      </div>

      <Benediction
        line="Every card is a panel in somebody's story."
        className="py-6"
      />

      <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-border-subtle text-xs text-ink-faint flex flex-wrap items-center justify-between gap-3">
        <span>© {new Date().getFullYear()} Cambridge TCG Ltd. All rights reserved.</span>
        {/* Legal row — contact-surface spec W6: the trust pages get a
            footer door on every page. */}
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-faint">
          <Link href="/privacy" className="hover:text-ink transition">Privacy</Link>
          <Link href="/terms" className="hover:text-ink transition">Terms</Link>
          <Link href="/contact" className="hover:text-ink transition">Contact</Link>
          <Link href="/start" className="hover:text-ink transition">Start here</Link>
        </nav>
        <FooterToggles mathLang={mathLang} textMode={textMode} />
      </div>
    </footer>
  );
}
