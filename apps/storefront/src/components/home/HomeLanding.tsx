import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIRMED_GAME_CODES, GAMES } from "@cambridge-tcg/sku";
import { tx, type Poly } from "@/lib/i18n";
import type { UiLang } from "@/lib/lang-mode";
import { Audience } from "@/lib/ui/Audience";
import { WhyLink } from "@/lib/ui/WhyLink";
import { PageLayout } from "@/lib/ui/PageLayout";
import { PageHeader } from "@/lib/ui/PageHeader";
import { Section } from "@/lib/ui/Section";
import { ActionCard } from "@/lib/ui/ActionCard";
import CardFinderHero from "./CardFinderHero";

// Registry choices, not a live availability claim. The result page owns
// retrieval, source status and rights checks. Never expose the internal game.
const SEARCH_GAMES = CONFIRMED_GAME_CODES
  .filter((code) => code !== "tst")
  .map((code) => ({ code, name: GAMES[code].name }));

const PATHS: { href: string; title: Poly; description: Poly }[] = [
  {
    href: "/prices",
    title: { en: "Explore the cards", ja: "カードの目録", es: "Explora las cartas", "zh-Hant": "探索卡片", "zh-Hans": "探索卡牌" },
    description: { en: "Browse by game. Look up card details, known variants and the status of each source.", ja: "ゲームごとに、カードの情報や別版、出どころの公開状況を調べられます。", es: "Busca por juego. Consulta datos, variantes conocidas y el estado de cada fuente.", "zh-Hant": "按遊戲瀏覽，查卡片資料、已知版本和各來源的公開狀況。", "zh-Hans": "按游戏浏览，查看卡牌信息、已收录版本和各来源的公开状态。" },
  },
  {
    href: "/account/portfolio",
    title: { en: "Your collection", ja: "手もとのカード", es: "Tu colección", "zh-Hant": "你的收藏", "zh-Hans": "你的收藏" },
    description: { en: "Keep track of your cards and revisit your records. Sign in with an existing account.", ja: "集めたカードや記録を確かめる場所。利用中のアカウントでログインします。", es: "Organiza tus cartas y consulta tus registros. Inicia sesión con una cuenta existente.", "zh-Hant": "整理卡片，重看紀錄。請用現有帳戶登入。", "zh-Hans": "整理卡牌，查看记录。请使用已有账号登录。" },
  },
  {
    href: "/play",
    title: { en: "Find your next game", ja: "次の遊び", es: "Tu próxima partida", "zh-Hant": "找下一場遊戲", "zh-Hans": "寻找下一场游戏" },
    description: { en: "Explore game guides, decks and ways to play. Start with the game you enjoy.", ja: "好きなゲームから、遊び方やデッキを見つけられます。", es: "Descubre guías, mazos y formas de jugar. Empieza por el juego que te gusta.", "zh-Hant": "探索玩法、牌組和遊戲手引，由喜歡的遊戲開始。", "zh-Hans": "探索玩法、卡组和游戏指南，从喜欢的游戏开始。" },
  },
];

const LEARN_LINKS: { href: string; label: Poly }[] = [
  { href: "/intro", label: { en: "New to card games?", ja: "TCGのはじめに", es: "¿Primera vez con las cartas?", "zh-Hant": "初次接觸卡牌遊戲？", "zh-Hans": "初次接触卡牌游戏？" } },
  { href: "/culture", label: { en: "Culture & stories", ja: "文化と物語", es: "Cultura e historias", "zh-Hant": "文化與故事", "zh-Hans": "文化与故事" } },
  { href: "/community", label: { en: "Community", ja: "広場", es: "Comunidad", "zh-Hant": "社群", "zh-Hans": "社群" } },
];

export default function HomeLanding({ uiLang, provenance }: { uiLang: UiLang; provenance?: ReactNode }) {
  return (
    <PageLayout className="space-y-8">
      <Audience kind="consumer" contexts={["home", "collector", "player"]} />
      <PageHeader
        size="large"
        title={tx({ en: "Cards, collections and play", ja: "カード・コレクション・遊び", es: "Cartas, colecciones y juegos", "zh-Hant": "卡片、收藏與遊戲", "zh-Hans": "卡牌、收藏与游戏" }, uiLang)}
        description={tx({ en: "Search card data, organise your collection or choose a game.", ja: "カードを調べる、手もとのカードを整理する、遊びを見つける。", es: "Busca datos de cartas, organiza tu colección o elige un juego.", "zh-Hant": "查卡片資料、整理收藏，或選一個遊戲。", "zh-Hans": "查卡牌资料、整理收藏，或选一个游戏。" }, uiLang)}
      />

      <div>
        <CardFinderHero games={SEARCH_GAMES} uiLang={uiLang} />
        <details className="mt-3 text-sm leading-6 text-ink-muted">
          <summary className="w-fit cursor-pointer rounded font-medium text-ink">
            {tx({ en: "About this search", ja: "検索について", es: "Acerca de esta búsqueda", "zh-Hant": "關於搜尋", "zh-Hans": "关于搜索" }, uiLang)}
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>{tx({ en: "Game choices come from the registered catalog. Results show available records and source status.", ja: "登録済みのゲームから選べます。結果には、見つかった記録と出どころの状況を表示します。", es: "Los juegos proceden del catálogo registrado. Los resultados muestran los registros disponibles y el estado de las fuentes.", "zh-Hant": "遊戲選項來自已登記目錄，結果列出可用紀錄和來源狀況。", "zh-Hans": "游戏选项来自已登记目录，结果列出可用记录和来源状态。" }, uiLang)}</span>
            {provenance}
            <WhyLink href="/methodology/pricing" label={tx({ en: "How the data works", ja: "データの読み方", es: "Cómo funcionan los datos", "zh-Hant": "資料怎樣讀", "zh-Hans": "如何理解数据" }, uiLang)} />
          </div>
        </details>
      </div>

      <Section id="home-paths" title={tx({ en: "Choose a task", ja: "やりたいことから", es: "Elige una tarea", "zh-Hant": "想做甚麼？", "zh-Hans": "想做什么？" }, uiLang)}>
        <div className="grid gap-4 md:grid-cols-3">
          {PATHS.map(({ href, title, description }) => (
            <ActionCard key={href} href={href} title={tx(title, uiLang)} description={tx(description, uiLang)} />
          ))}
        </div>
      </Section>

      <Section title={tx({ en: "Learn and explore", ja: "学ぶ・見つける", es: "Aprende y explora", "zh-Hant": "學習與探索", "zh-Hans": "学习与探索" }, uiLang)}>
        <nav aria-label={tx({ en: "Discover Cambridge TCG", ja: "Cambridge TCGの案内", es: "Descubre Cambridge TCG", "zh-Hant": "認識Cambridge TCG", "zh-Hans": "认识Cambridge TCG" }, uiLang)} className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link href="/guides" className="min-h-11 inline-flex items-center text-accent underline underline-offset-4">{tx({ en: "Guides", ja: "手引き", es: "Guías", "zh-Hant": "手引", "zh-Hans": "指南" }, uiLang)}</Link>
          {LEARN_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="min-h-11 inline-flex items-center text-accent underline underline-offset-4">{tx(label, uiLang)}</Link>
          ))}
        </nav>
      </Section>

      <aside aria-labelledby="home-agents" className="flex flex-col gap-3 border-t border-border-subtle pt-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="home-agents" className="text-base font-semibold text-ink">
            {tx({ en: "Agents & developers", ja: "エージェントと開発者", es: "Agentes y desarrolladores", "zh-Hant": "代理與開發者", "zh-Hans": "代理与开发者" }, uiLang)}
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            {tx({ en: "API documentation, resource discovery and access rules.", ja: "APIの資料、リソースの一覧、利用条件。", es: "Documentación API, recursos y reglas de acceso.", "zh-Hant": "API文件、資源目錄和使用條件。", "zh-Hans": "API文档、资源目录和使用条件。" }, uiLang)}
          </p>
        </div>
        <Link href="/agents" className="min-h-11 inline-flex shrink-0 items-center text-sm font-medium text-accent underline underline-offset-4">
          {tx({ en: "Open the agent guide", ja: "エージェントの手引きへ", es: "Abrir la guía para agentes", "zh-Hant": "打開代理手引", "zh-Hans": "打开代理指南" }, uiLang)} <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </aside>
      <p className="text-sm leading-6 text-ink-muted">
        {tx({ en: "Existing orders or agreements:", ja: "以前の注文や約束の記録は、", es: "Pedidos o acuerdos existentes:", "zh-Hant": "現有訂單或協議：", "zh-Hans": "已有订单或协议：" }, uiLang)}{" "}
        <Link href="/account" className="text-accent underline underline-offset-4">{tx({ en: "Your account", ja: "アカウント", es: "Tu cuenta", "zh-Hant": "你的帳戶", "zh-Hans": "你的账号" }, uiLang)}</Link>
        {" · "}
        <Link href="/contact" className="text-accent underline underline-offset-4">{tx({ en: "Get help", ja: "問い合わせ", es: "Ayuda", "zh-Hant": "尋求幫忙", "zh-Hans": "寻求帮助" }, uiLang)}</Link>
      </p>
    </PageLayout>
  );
}
