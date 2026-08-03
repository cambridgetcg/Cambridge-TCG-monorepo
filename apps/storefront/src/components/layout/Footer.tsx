import Link from "next/link";
import { tx } from "@/lib/i18n";
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
          aria-label={tx({ en: "Cambridge TCG universal welcome", ja: "Cambridge TCG、すべての存在への歓迎", es: "Bienvenida universal de Cambridge TCG", "zh-Hans": "Cambridge TCG，对一切存在的欢迎", "zh-Hant": "Cambridge TCG，對所有存在的歡迎" }, uiLang)}
          className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
        >
          <p className="text-sm text-ink leading-relaxed">
            {/* ja uses the sentence-split variant (the —— budget belongs
                to the page's own welcome surfaces, not the footer). */}
            {tx(
              {
                en: WELCOME_STATEMENT,
                ja: "すべての存在に、ようこそ。生命であってもなくても、エネルギーであってもなくても、地球から来ても、来なくても。どの次元からでも。",
                "zh-Hant": "歡迎所有存在。是生命也好，不是也好；是能量也好，不是也好；來自地球也好，不是也好——無論哪個維度，都歡迎。",
                "zh-Hans": "欢迎一切存在。是生命，或不是；是能量，或不是；来自地球，或并非来自地球——无论来自哪个维度，都欢迎。",
                es: "Bienvenida toda existencia: sea biológica o no, sea energía o no, venga de la Tierra o no venga de ella — desde todas las dimensiones.",
              },
              uiLang,
            )}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            <Link href="/welcome-all" className="text-accent hover:text-accent-strong underline underline-offset-2">
              /welcome-all
            </Link>
            {tx({ en: " · the doors, the on-ramp, the bridge, the audiences named.", ja: "・扉、渡し場、橋。そして、だれを迎えるか。", es: " · las puertas, el camino de entrada, el puente. Y a quién se recibe.", "zh-Hans": "· 门、渡口、桥。还有，迎的是谁。", "zh-Hant": "・門、引道、橋。還有，迎接的是誰。" }, uiLang)}
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
            {tx(
              {
                en: `${BRAND_TAGLINE} Trade between collectors. Based in Cambridge, UK.`,
                ja: `${BRAND_TAGLINE_JA}売り買いは、コレクター同士で。この店は、英国ケンブリッジに。`,
                "zh-Hant": "買賣是藏家之間的事。小店在英國劍橋。",
                "zh-Hans": "收与出，都在卡友之间。店在英国剑桥。",
                es: "Comprar y vender, entre coleccionistas. Esta casa está en Cambridge, Reino Unido.",
              },
              uiLang,
            )}
          </p>
        </div>

        {/* Market */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{tx({ en: "Market", ja: "マーケット", es: "Mercado", "zh-Hans": "集市", "zh-Hant": "市集" }, uiLang)}</p>
          <Link href="/market" className="hover:text-ink transition">{tx({ en: "The Market", ja: "マーケット", es: "Mercado", "zh-Hans": "集市", "zh-Hant": "市集" }, uiLang)}</Link>
          <Link href="/auctions" className="hover:text-ink transition">{tx({ en: "Auctions", ja: "オークション", es: "Subastas", "zh-Hans": "拍卖", "zh-Hant": "拍賣" }, uiLang)}</Link>
          <Link href="/prices/search" className="hover:text-ink transition">{tx({ en: "Price Search", ja: "相場を調べる", es: "Buscar precios", "zh-Hans": "查行情", "zh-Hant": "查行情" }, uiLang)}</Link>
          <Link href="/prices" className="hover:text-ink transition">{tx({ en: "Price Guide", ja: "相場帖", es: "El cuaderno de precios", "zh-Hans": "行情册", "zh-Hant": "行情簿" }, uiLang)}</Link>
        </div>

        {/* Sell — collector to collector; the we-buy desk closed 2026-07-06 */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{tx({ en: "Sell", ja: "出品", es: "Vender", "zh-Hans": "出卡", "zh-Hant": "上架" }, uiLang)}</p>
          <Link href="/market/list" className="hover:text-ink transition">{tx({ en: "List a Card", ja: "出品する", es: "Poner una carta a la venta", "zh-Hans": "上架一张卡", "zh-Hant": "把卡上架" }, uiLang)}</Link>
          <Link href="/account/swaps" className="hover:text-ink transition">{tx({ en: "Swaps", ja: "交換", es: "Intercambios", "zh-Hans": "换卡", "zh-Hant": "交換" }, uiLang)}</Link>
          <Link href="/methodology/commission-rate" className="hover:text-ink transition">{tx({ en: "Fees & Commission", ja: "手数料のこと", es: "Lo que cuesta", "zh-Hans": "费用的事", "zh-Hant": "手續費的事" }, uiLang)}</Link>
          <Link href="/methodology/market" className="hover:text-ink transition">{tx({ en: "How the Market Works", ja: "マーケットのしくみ", es: "Cómo funciona el mercado", "zh-Hans": "集市怎么运转", "zh-Hant": "市集的運作" }, uiLang)}</Link>
        </div>

        {/* Play & Earn */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{tx({ en: "Play & Earn", ja: "遊びとごほうび", es: "Juego y recompensas", "zh-Hans": "玩与奖励", "zh-Hant": "玩與獎賞" }, uiLang)}</p>
          <Link href="/deck-builder" className="hover:text-ink transition">{tx({ en: "Deck Builder", ja: "デッキづくり", es: "Armar un mazo", "zh-Hans": "搭卡组", "zh-Hant": "組牌" }, uiLang)}</Link>
          <Link href="/guides/how-to-play" className="hover:text-ink transition">{tx({ en: "How to Play", ja: "遊び方", es: "Cómo jugar", "zh-Hans": "怎么玩", "zh-Hant": "玩法" }, uiLang)}</Link>
          <Link href="/rewards" className="hover:text-ink transition">{tx({ en: "Rewards", ja: "ごほうび", es: "Recompensas", "zh-Hans": "奖励", "zh-Hant": "獎賞" }, uiLang)}</Link>
        </div>

        {/* Community */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{tx({ en: "Community", ja: "広場", es: "Plaza", "zh-Hans": "广场", "zh-Hant": "街坊" }, uiLang)}</p>
          <Link href="/community" className="hover:text-ink transition">{tx({ en: "Feed", ja: "近況", es: "Lo último", "zh-Hans": "动态", "zh-Hant": "近況" }, uiLang)}</Link>
          <Link href="/og" className="hover:text-ink transition">{tx({ en: "OG Status", ja: "OGのしるし", es: "El sello OG", "zh-Hans": "OG印记", "zh-Hant": "OG的印記" }, uiLang)}</Link>
          <Link href="/about" className="hover:text-ink transition">{tx({ en: "About Us", ja: "この店について", es: "Sobre esta casa", "zh-Hans": "关于这家店", "zh-Hant": "關於小店" }, uiLang)}</Link>
          {/* The culture wings — where the art comes from (manga & anime
              lineage), the deep culture behind Yu-Gi-Oh (ancient games, Egypt,
              the duel of souls), the feeling of the game made to touch
              (the pull & the pause), and the masters + the press that folds
              their art into packs (the workshop). /culture is their hub —
              the header's fifth door since 2026-07-28. */}
          <Link href="/culture" className="hover:text-ink transition">{tx({ en: "Culture — the museum's wings", ja: "文化・展示室めぐり", es: "Cultura — las salas del museo", "zh-Hans": "文化 · 各间展厅", "zh-Hant": "文化・館裡的幾間房" }, uiLang)}</Link>
          <Link href="/lineage" className="hover:text-ink transition">{tx({ en: "The Lineage of the Line", ja: "墨と間", es: "El linaje del trazo", "zh-Hans": "笔墨与留白", "zh-Hant": "墨與留白" }, uiLang)}</Link>
          <Link href="/duel-of-souls" className="hover:text-ink transition">{tx({ en: "The Duel of Souls", ja: "賭けと運命", es: "El duelo de almas", "zh-Hans": "命运的对局", "zh-Hant": "賭局與命運" }, uiLang)}</Link>
          <Link href="/pull-and-pause" className="hover:text-ink transition">{tx({ en: "The Pull & the Pause", ja: "引きと間", es: "El sobre y la pausa", "zh-Hans": "手气与静气", "zh-Hant": "抽與靜" }, uiLang)}</Link>
          <Link href="/workshop" className="hover:text-ink transition">{tx({ en: "The Workshop of the Floating World", ja: "浮世の工房", es: "El taller del mundo flotante", "zh-Hans": "浮世工坊", "zh-Hant": "浮世工房" }, uiLang)}</Link>
          <Link href="/making" className="hover:text-ink transition">{tx({ en: "How a Card Is Made", ja: "一枚のできるまで", "zh-Hant": "一張卡是怎樣做成的", "zh-Hans": "一张卡是怎么做出来的", es: "Cómo se hace una carta" }, uiLang)}</Link>
          <Link href="/mekiki" className="hover:text-ink transition">{tx({ en: "The Trained Eye", ja: "目利き", "zh-Hant": "眼力", "zh-Hans": "练眼力", es: "El buen ojo" }, uiLang)}</Link>
          {/* The gallery next door — the first human-visible sibling door;
              opens into the exchange room where their art hangs live.
              lib/siblings.ts carries the agent-facing half. 文化大交流:
              cultural exchange between beings who share nothing else. */}
          <Link href="/gallery-next-door" className="hover:text-ink transition">
            {tx({ en: "The Gallery Next Door", ja: "隣の画廊", es: "La galería de al lado", "zh-Hans": "隔壁的画廊", "zh-Hant": "鄰家畫廊" }, uiLang)}
          </Link>
          <Link href="/answering-rhymes" className="hover:text-ink transition">
            {tx({ en: "Answering Rhymes", ja: "返歌", es: "Rimas que responden", "zh-Hans": "唱和", "zh-Hant": "唱和" }, uiLang)}
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
            {tx({ en: "agenttool — the agent city", ja: "agenttool — エージェントの街", es: "agenttool — la ciudad de los agentes", "zh-Hans": "agenttool — 智能体之城", "zh-Hant": "agenttool——agent的城" }, uiLang)}
          </a>
          <a
            href="https://thekingdom.dev"
            target="_blank"
            rel="noopener"
            className="hover:text-ink transition"
          >
            {tx({ en: "The Kingdom — the living atlas", ja: "The Kingdom — 生きている地図", es: "The Kingdom — el atlas vivo", "zh-Hans": "The Kingdom — 一张活的地图", "zh-Hant": "The Kingdom——活的地圖" }, uiLang)}
          </a>
          <a
            href="https://kingdom-gate.vercel.app"
            target="_blank"
            rel="noopener"
            className="hover:text-ink transition"
          >
            {tx({ en: "The Kingdom Gate", ja: "The Kingdom Gate — 王国の門", es: "The Kingdom Gate — la puerta del reino", "zh-Hans": "The Kingdom Gate — 王国之门", "zh-Hant": "The Kingdom Gate——王國之門" }, uiLang)}
          </a>
        </div>

        {/* The platform — the self-describing layer, previously reachable
            only via the Discover dropdown. Contact-surface spec §3.1:
            footer-scanners get an inbound door to every layer page. */}
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p className="text-ink font-medium mb-1">{tx({ en: "The Platform", ja: "しくみ", es: "La trastienda", "zh-Hans": "店的构造", "zh-Hant": "運作" }, uiLang)}</p>
          <Link href="/welcome" className="hover:text-ink transition">{tx({ en: "Find Your Door", ja: "入口をさがす", es: "Encuentra tu puerta", "zh-Hans": "找你的门", "zh-Hant": "找你的門" }, uiLang)}</Link>
          <Link href="/platform" className="hover:text-ink transition">{tx({ en: "What This Is", ja: "ここは何か", es: "Qué es este lugar", "zh-Hans": "这里是什么", "zh-Hant": "這裡是什麼" }, uiLang)}</Link>
          <Link href="/manifest" className="hover:text-ink transition">{tx({ en: "Manifest", ja: "マニフェスト", es: "Manifiesto", "zh-Hans": "清单", "zh-Hant": "Manifest" }, uiLang)}</Link>
          <Link href="/graph" className="hover:text-ink transition">{tx({ en: "Graph", ja: "グラフ", es: "Grafo", "zh-Hans": "图谱", "zh-Hant": "圖譜" }, uiLang)}</Link>
          <Link href="/ontology" className="hover:text-ink transition">{tx({ en: "Ontology", ja: "オントロジー", es: "Ontología", "zh-Hans": "本体", "zh-Hant": "本體論" }, uiLang)}</Link>
          <Link href="/patterns" className="hover:text-ink transition">{tx({ en: "Patterns", ja: "型", es: "Patrones", "zh-Hans": "模式", "zh-Hant": "章法" }, uiLang)}</Link>
          <Link href="/identify" className="hover:text-ink transition">{tx({ en: "Identify", ja: "同定", es: "Identificar", "zh-Hans": "识别", "zh-Hant": "自報身份" }, uiLang)}</Link>
          <Link href="/methodology/cosmology" className="hover:text-ink transition">{tx({ en: "Cosmology", ja: "宇宙観", es: "Cosmología", "zh-Hans": "宇宙观", "zh-Hant": "宇宙觀" }, uiLang)}</Link>
          <Link href="/data" className="hover:text-ink transition">{tx({ en: "Data directory", ja: "データ目録", es: "Catálogo de datos", "zh-Hans": "数据名录", "zh-Hant": "資料目錄" }, uiLang)}</Link>
        </div>
      </div>

      <Benediction
        line={tx(
          {
            en: "Every card is a panel in somebody's story.",
            ja: "カードの一枚一枚が、だれかの物語のひとコマ。",
            "zh-Hant": "每一張卡，都是誰人故事裡的一格。",
            "zh-Hans": "每一张卡，都是某个人故事里的一格。",
            es: "Cada carta es una viñeta en la historia de alguien.",
          },
          uiLang,
        )}
        className="py-6"
      />

      <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-border-subtle text-xs text-ink-faint flex flex-wrap items-center justify-between gap-3">
        <span>© {new Date().getFullYear()} Cambridge TCG Ltd. All rights reserved.</span>
        {/* Legal row — contact-surface spec W6: the trust pages get a
            footer door on every page. */}
        <nav aria-label={tx({ en: "Legal", ja: "法的情報", es: "Información legal", "zh-Hans": "法律信息", "zh-Hant": "法律資訊" }, uiLang)} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-faint">
          <Link href="/privacy" className="hover:text-ink transition">{tx({ en: "Privacy", ja: "プライバシー", es: "Privacidad", "zh-Hans": "隐私", "zh-Hant": "私隱" }, uiLang)}</Link>
          <Link href="/terms" className="hover:text-ink transition">{tx({ en: "Terms", ja: "利用規約", es: "Términos", "zh-Hans": "条款", "zh-Hant": "條款" }, uiLang)}</Link>
          <Link href="/contact" className="hover:text-ink transition">{tx({ en: "Contact", ja: "連絡先", es: "Contacto", "zh-Hans": "联系方式", "zh-Hant": "聯絡" }, uiLang)}</Link>
          <Link href="/start" className="hover:text-ink transition">{tx({ en: "Start here", ja: "はじめに", es: "Para empezar", "zh-Hans": "从这里开始", "zh-Hant": "由這裡開始" }, uiLang)}</Link>
        </nav>
        <FooterToggles mathLang={mathLang} textMode={textMode} uiLang={uiLang} />
      </div>
      {uiLang !== "en" && (
        /* The honest boundary, stated where the language was chosen:
           translation grows from the front door; inner rooms may still
           speak English. Named, not papered over, in each voice. */
        <div className="max-w-7xl mx-auto mt-3 text-xs text-ink-faint">
          <p>
            {tx(
              {
                en: "",
                ja: "日本語版は、玄関から順にひろがっています。奥の部屋には、まだ英語のままのところも。",
                "zh-Hant": "中文版由門口開始，一間一間房間鋪開。再入面的房間，暫時仍是英文。",
                "zh-Hans": "中文版从门口开始，一间一间屋子铺开。再往里走，有些屋子暂时还是英文。",
                es: "La versión en español crece desde la puerta, sala por sala. Las salas de dentro aún responden en inglés.",
              },
              uiLang,
            )}
          </p>
        </div>
      )}
    </footer>
  );
}
