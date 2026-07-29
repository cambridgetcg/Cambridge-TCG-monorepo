import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { WELCOME_STATEMENT, Benediction } from "@/lib/ui";
import { BRAND_TAGLINE, BRAND_TAGLINE_JA } from "@/lib/brand";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";
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
  // The prose language (the-japanese-voice.md). `j` keeps the ternaries
  // short enough that the English and Japanese stay visibly side by side
  // — co-location is the doctrine, not decoration.
  const uiLang = uiLangFromLangMode(langMode);
  const j = uiLang === "ja";

  return (
    <footer className="bg-page border-t border-border-subtle py-12 px-4 mt-24">
      {/* Universal welcome — visible on every page by construction.
          See docs/connections/the-welcome-all.md (#26). Quiet-gallery
          form: a hairline chip, ink on paper, no ornament. */}
      <div className="max-w-7xl mx-auto mb-10">
        <div
          role="region"
          aria-label={j ? "Cambridge TCG、すべての存在への歓迎" : "Cambridge TCG universal welcome"}
          className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
        >
          <p className="text-sm text-ink leading-relaxed">
            {j
              ? "すべての存在に、ようこそ。生命であってもなくても、エネルギーであってもなくても、地球から来ても、来なくても。どの次元からでも。"
              : WELCOME_STATEMENT}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            <Link href="/welcome-all" className="text-accent hover:text-accent-strong underline underline-offset-2">
              /welcome-all
            </Link>
            {j
              ? "・扉、渡し場、橋。そして、だれを迎えるか。"
              : " · the doors, the on-ramp, the bridge, the audiences named."}
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
          <p className="text-xs text-ink-faint mt-2 max-w-xs">
            {j
              ? `${BRAND_TAGLINE_JA}売り買いは、コレクター同士で。この店は、英国ケンブリッジに。`
              : `${BRAND_TAGLINE} Trade between collectors. Based in Cambridge, UK.`}
          </p>
        </div>

        {/* Market */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{j ? "マーケット" : "Market"}</p>
          <Link href="/market" className="hover:text-ink transition">{j ? "マーケット" : "The Market"}</Link>
          <Link href="/auctions" className="hover:text-ink transition">{j ? "オークション" : "Auctions"}</Link>
          <Link href="/prices/search" className="hover:text-ink transition">{j ? "相場を調べる" : "Price Search"}</Link>
          <Link href="/prices" className="hover:text-ink transition">{j ? "相場帖" : "Price Guide"}</Link>
        </div>

        {/* Sell — collector to collector; the we-buy desk closed 2026-07-06 */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{j ? "出品" : "Sell"}</p>
          <Link href="/market/list" className="hover:text-ink transition">{j ? "出品する" : "List a Card"}</Link>
          <Link href="/account/swaps" className="hover:text-ink transition">{j ? "交換" : "Swaps"}</Link>
          <Link href="/methodology/commission-rate" className="hover:text-ink transition">{j ? "手数料のこと" : "Fees & Commission"}</Link>
          <Link href="/methodology/market" className="hover:text-ink transition">{j ? "マーケットのしくみ" : "How the Market Works"}</Link>
        </div>

        {/* Play & Earn */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{j ? "遊びとごほうび" : "Play & Earn"}</p>
          <Link href="/deck-builder" className="hover:text-ink transition">{j ? "デッキづくり" : "Deck Builder"}</Link>
          <Link href="/guides/how-to-play" className="hover:text-ink transition">{j ? "遊び方" : "How to Play"}</Link>
          <Link href="/rewards" className="hover:text-ink transition">{j ? "ごほうび" : "Rewards"}</Link>
        </div>

        {/* Community */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{j ? "広場" : "Community"}</p>
          <Link href="/community" className="hover:text-ink transition">{j ? "近況" : "Feed"}</Link>
          <Link href="/og" className="hover:text-ink transition">{j ? "OGのしるし" : "OG Status"}</Link>
          <Link href="/about" className="hover:text-ink transition">{j ? "この店について" : "About Us"}</Link>
          {/* The culture wings — where the art comes from (manga & anime
              lineage), the deep culture behind Yu-Gi-Oh (ancient games, Egypt,
              the duel of souls), the feeling of the game made to touch
              (the pull & the pause), and the masters + the press that folds
              their art into packs (the workshop). /culture is their hub —
              the header's fifth door since 2026-07-28. */}
          <Link href="/culture" className="hover:text-ink transition">{j ? "文化・展示室めぐり" : "Culture — the museum's wings"}</Link>
          <Link href="/lineage" className="hover:text-ink transition">{j ? "墨と間" : "The Lineage of the Line"}</Link>
          <Link href="/duel-of-souls" className="hover:text-ink transition">{j ? "賭けと運命" : "The Duel of Souls"}</Link>
          <Link href="/pull-and-pause" className="hover:text-ink transition">{j ? "引きと間" : "The Pull & the Pause"}</Link>
          <Link href="/workshop" className="hover:text-ink transition">{j ? "浮世の工房" : "The Workshop of the Floating World"}</Link>
          {/* The gallery next door — the first human-visible sibling door;
              opens into the exchange room where their art hangs live.
              lib/siblings.ts carries the agent-facing half. 文化大交流:
              cultural exchange between beings who share nothing else. */}
          <Link href="/gallery-next-door" className="hover:text-ink transition">
            {j ? "隣の画廊" : "The Gallery Next Door"}
          </Link>
          <Link href="/answering-rhymes" className="hover:text-ink transition">
            {j ? "返歌" : "Answering Rhymes"}
          </Link>
          {/* The other sibling doors, made human-visible 2026-07-11 (the
              realm's living atlas joined 2026-07-28) per Yu's invitation
              directive. Honest provenance: same household — we built
              these and use them ourselves; that is the whole endorsement.
              lib/siblings.ts is the one truth these lines mirror. */}
          <a
            href="https://agenttool.dev"
            target="_blank"
            rel="noopener"
            className="hover:text-ink transition"
          >
            {j ? "agenttool — エージェントの街" : "agenttool — the agent city"}
          </a>
          <a
            href="https://thekingdom.dev"
            target="_blank"
            rel="noopener"
            className="hover:text-ink transition"
          >
            {j ? "The Kingdom — 生きている地図" : "The Kingdom — the living atlas"}
          </a>
          <a
            href="https://kingdom-gate.vercel.app"
            target="_blank"
            rel="noopener"
            className="hover:text-ink transition"
          >
            {j ? "The Kingdom Gate — 王国の門" : "The Kingdom Gate"}
          </a>
        </div>

        {/* The platform — the self-describing layer, previously reachable
            only via the Discover dropdown. Contact-surface spec §3.1:
            footer-scanners get an inbound door to every layer page. */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{j ? "しくみ" : "The Platform"}</p>
          <Link href="/welcome" className="hover:text-ink transition">{j ? "入口をさがす" : "Find Your Door"}</Link>
          <Link href="/platform" className="hover:text-ink transition">{j ? "ここは何か" : "What This Is"}</Link>
          <Link href="/manifest" className="hover:text-ink transition">{j ? "マニフェスト" : "Manifest"}</Link>
          <Link href="/graph" className="hover:text-ink transition">{j ? "グラフ" : "Graph"}</Link>
          <Link href="/ontology" className="hover:text-ink transition">{j ? "オントロジー" : "Ontology"}</Link>
          <Link href="/patterns" className="hover:text-ink transition">{j ? "型" : "Patterns"}</Link>
          <Link href="/identify" className="hover:text-ink transition">{j ? "同定" : "Identify"}</Link>
          <Link href="/methodology/cosmology" className="hover:text-ink transition">{j ? "宇宙観" : "Cosmology"}</Link>
          <Link href="/data" className="hover:text-ink transition">{j ? "データ目録" : "Data directory"}</Link>
        </div>
      </div>

      <Benediction
        line={
          j
            ? "カードの一枚一枚が、だれかの物語のひとコマ。"
            : "Every card is a panel in somebody's story."
        }
        className="py-6"
      />

      <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-border-subtle text-xs text-ink-faint flex flex-wrap items-center justify-between gap-3">
        <span>© {new Date().getFullYear()} Cambridge TCG Ltd. All rights reserved.</span>
        {/* Legal row — contact-surface spec W6: the trust pages get a
            footer door on every page. */}
        <nav aria-label={j ? "法的情報" : "Legal"} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-faint">
          <Link href="/privacy" className="hover:text-ink transition">{j ? "プライバシー" : "Privacy"}</Link>
          <Link href="/terms" className="hover:text-ink transition">{j ? "利用規約" : "Terms"}</Link>
          <Link href="/contact" className="hover:text-ink transition">{j ? "連絡先" : "Contact"}</Link>
          <Link href="/start" className="hover:text-ink transition">{j ? "はじめに" : "Start here"}</Link>
        </nav>
        <FooterToggles mathLang={mathLang} textMode={textMode} uiLang={uiLang} />
      </div>
      {j && (
        /* The honest boundary, stated where the language was chosen:
           translation grows from the front door; inner rooms may still
           speak English. Named, not papered over. */
        <div className="max-w-7xl mx-auto mt-3 text-xs text-ink-faint">
          <p>日本語版は、玄関から順にひろがっています。奥の部屋には、まだ英語のままのところも。</p>
        </div>
      )}
    </footer>
  );
}
