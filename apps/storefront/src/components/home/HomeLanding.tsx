import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIRMED_GAME_CODES, GAMES } from "@cambridge-tcg/sku";
import { tx, type Poly } from "@/lib/i18n";
import type { UiLang } from "@/lib/lang-mode";
import { Audience } from "@/lib/ui/Audience";
import { WhyLink } from "@/lib/ui/WhyLink";
import CardFinderHero from "./CardFinderHero";

// Registry choices, not a live availability claim. The result page owns
// retrieval, source status and rights checks. Never expose the internal game.
const SEARCH_GAMES = CONFIRMED_GAME_CODES
  .filter((code) => code !== "tst")
  .map((code) => ({ code, name: GAMES[code].name }));

const PATHS: { href: string; title: Poly; description: Poly; action: Poly }[] = [
  {
    href: "/prices",
    title: { en: "Explore the cards", ja: "カードの目録", es: "Explora las cartas", "zh-Hant": "探索卡片", "zh-Hans": "探索卡牌" },
    description: { en: "Browse by game. Look up card details, known variants and the status of each source.", ja: "ゲームごとに、カードの情報や別版、出どころの公開状況を調べられます。", es: "Busca por juego. Consulta datos, variantes conocidas y el estado de cada fuente.", "zh-Hant": "按遊戲瀏覽，查卡片資料、已知版本和各來源的公開狀況。", "zh-Hans": "按游戏浏览，查看卡牌信息、已收录版本和各来源的公开状态。" },
    action: { en: "Browse card data", ja: "目録へ", es: "Ver datos de cartas", "zh-Hant": "瀏覽卡片資料", "zh-Hans": "浏览卡牌数据" },
  },
  {
    href: "/account/portfolio",
    title: { en: "Your collection", ja: "手もとのカード", es: "Tu colección", "zh-Hant": "你的收藏", "zh-Hans": "你的收藏" },
    description: { en: "Keep track of your cards and revisit your records. Sign in with an existing account.", ja: "集めたカードや記録を確かめる場所。利用中のアカウントでログインします。", es: "Organiza tus cartas y consulta tus registros. Inicia sesión con una cuenta existente.", "zh-Hant": "整理卡片，重看紀錄。請用現有帳戶登入。", "zh-Hans": "整理卡牌，查看记录。请使用已有账号登录。" },
    action: { en: "Open your collection", ja: "コレクションへ", es: "Abrir tu colección", "zh-Hant": "打開收藏", "zh-Hans": "打开收藏" },
  },
  {
    href: "/play",
    title: { en: "Find your next game", ja: "次の遊び", es: "Tu próxima partida", "zh-Hant": "找下一場遊戲", "zh-Hans": "寻找下一场游戏" },
    description: { en: "Explore game guides, decks and ways to play. Start with the game you enjoy.", ja: "好きなゲームから、遊び方やデッキを見つけられます。", es: "Descubre guías, mazos y formas de jugar. Empieza por el juego que te gusta.", "zh-Hant": "探索玩法、牌組和遊戲手引，由喜歡的遊戲開始。", "zh-Hans": "探索玩法、卡组和游戏指南，从喜欢的游戏开始。" },
    action: { en: "Explore play", ja: "遊ぶ", es: "Explorar juegos", "zh-Hant": "去玩", "zh-Hans": "去玩" },
  },
];

const QUIET_LINKS: { href: string; label: Poly }[] = [
  { href: "/intro", label: { en: "New to card games?", ja: "TCGのはじめに", es: "¿Primera vez con las cartas?", "zh-Hant": "初次接觸卡牌遊戲？", "zh-Hans": "初次接触卡牌游戏？" } },
  { href: "/culture", label: { en: "Culture & stories", ja: "文化と物語", es: "Cultura e historias", "zh-Hant": "文化與故事", "zh-Hans": "文化与故事" } },
  { href: "/community", label: { en: "Community", ja: "広場", es: "Comunidad", "zh-Hant": "社群", "zh-Hans": "社群" } },
];

export default function HomeLanding({ uiLang, provenance }: { uiLang: UiLang; provenance?: ReactNode }) {
  return (
    <main className="pb-16 sm:pb-24">
      <Audience kind="consumer" contexts={["home", "collector", "player"]} />
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-6 sm:pt-20 sm:pb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-accent">
          {tx({ en: "Collect · discover · play", ja: "集める・見つける・遊ぶ", es: "Colecciona · descubre · juega", "zh-Hant": "收藏・探索・遊玩", "zh-Hans": "收藏・探索・游玩" }, uiLang)}
        </p>
        <h1 className="mt-5 max-w-3xl font-display text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight leading-tight text-ink">
          {tx({ en: "A place for your cards.", ja: "カードと過ごす場所。", es: "Un lugar para tus cartas.", "zh-Hant": "卡片，有個好地方。", "zh-Hans": "一个属于卡牌的地方。" }, uiLang)}
        </h1>
        <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-ink-muted">
          {tx({ en: "Find the card you’re curious about. Make sense of your collection. Discover something to play.", ja: "気になる一枚をさがす。手もとのカードを整理する。次の遊びを見つける。", es: "Encuentra esa carta que te interesa. Organiza tu colección. Descubre algo a lo que jugar.", "zh-Hant": "找一張好奇的卡，整理自己的收藏，發現下一個想玩的遊戲。", "zh-Hans": "找一张感兴趣的卡，整理自己的收藏，发现下一个想玩的游戏。" }, uiLang)}
        </p>
        <nav aria-label={tx({ en: "Discover Cambridge TCG", ja: "Cambridge TCGの案内", es: "Descubre Cambridge TCG", "zh-Hant": "認識Cambridge TCG", "zh-Hans": "认识Cambridge TCG" }, uiLang)} className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {QUIET_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="text-ink-muted underline decoration-border-strong underline-offset-4 hover:text-accent">{tx(label, uiLang)}</Link>
          ))}
        </nav>
      </header>

      <CardFinderHero games={SEARCH_GAMES} uiLang={uiLang} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {provenance}
          <span>{tx({ en: "Search results show available records and source status.", ja: "結果には、見つかった記録と出どころの状況を表示します。", es: "Los resultados muestran los registros disponibles y el estado de las fuentes.", "zh-Hant": "搜尋結果會列出可用紀錄和來源狀況。", "zh-Hans": "搜索结果会列出可用记录和来源状态。" }, uiLang)}</span>
          <WhyLink href="/methodology/pricing" label={tx({ en: "How the data works", ja: "データの読み方", es: "Cómo funcionan los datos", "zh-Hant": "資料怎樣讀", "zh-Hans": "如何理解数据" }, uiLang)} />
        </div>

        <section aria-labelledby="home-paths" className="mt-12 sm:mt-16">
          <h2 id="home-paths" className="font-display text-2xl font-medium text-ink">
            {tx({ en: "Where would you like to go?", ja: "ここからの道", es: "¿Por dónde quieres empezar?", "zh-Hant": "想由哪裡開始？", "zh-Hans": "想从哪里开始？" }, uiLang)}
          </h2>
          <div className="mt-6 grid md:grid-cols-3 border-y border-border-subtle">
            {PATHS.map(({ href, title, description, action }, index) => (
              <Link key={href} href={href} className="group py-7 md:px-6 first:md:pl-0 last:md:pr-0 border-b last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 border-border-subtle hover:bg-surface-subtle transition-colors">
                <span aria-hidden="true" className="font-mono text-xs text-accent">0{index + 1}</span>
                <h3 className="mt-3 font-display text-xl font-medium text-ink">{tx(title, uiLang)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{tx(description, uiLang)}</p>
                <p className="mt-5 text-sm text-accent group-hover:underline underline-offset-4">{tx(action, uiLang)} <span aria-hidden="true">→</span></p>
              </Link>
            ))}
          </div>
        </section>

        <aside aria-labelledby="home-agents" className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 rounded-lg bg-surface-subtle p-6">
          <div>
            <h2 id="home-agents" className="font-display text-xl font-medium text-ink">
              {tx({ en: "Building with Cambridge TCG?", ja: "Cambridge TCGとつくる", es: "¿Construyes con Cambridge TCG?", "zh-Hant": "想用Cambridge TCG開發？", "zh-Hans": "想用Cambridge TCG开发？" }, uiLang)}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {tx({ en: "A dedicated starting point for agents, API clients and developers.", ja: "エージェントやAPIを使う開発者向けの入り口。", es: "Un punto de partida para agentes, clientes API y desarrolladores.", "zh-Hant": "給代理、API使用者和開發者的專用入口。", "zh-Hans": "为代理、API使用者和开发者准备的专门入口。" }, uiLang)}
            </p>
          </div>
          <Link href="/agents" className="shrink-0 text-sm font-medium text-accent underline underline-offset-4">
            {tx({ en: "Agents & API", ja: "エージェント・API", es: "Agentes y API", "zh-Hant": "代理與API", "zh-Hans": "代理与API" }, uiLang)} <span aria-hidden="true">→</span>
          </Link>
        </aside>
        <p className="mt-6 text-sm text-ink-muted">
          {tx({ en: "Need help with an existing order or agreement?", ja: "以前の注文や約束についての相談は、", es: "¿Necesitas ayuda con un pedido o acuerdo existente?", "zh-Hant": "現有訂單或協議需要幫忙？", "zh-Hans": "已有订单或协议需要帮助？" }, uiLang)}{" "}
          <Link href="/account" className="text-accent underline underline-offset-4">{tx({ en: "Open your account", ja: "アカウントへ", es: "Abre tu cuenta", "zh-Hant": "打開帳戶", "zh-Hans": "打开账号" }, uiLang)}</Link>
          {" · "}
          <Link href="/contact" className="text-accent underline underline-offset-4">{tx({ en: "Contact us", ja: "問い合わせ", es: "Contáctanos", "zh-Hant": "聯絡我們", "zh-Hans": "联系我们" }, uiLang)}</Link>
        </p>
      </div>
    </main>
  );
}
