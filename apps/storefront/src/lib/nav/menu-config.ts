/** Shared, compact navigation for people browsing the site and its API docs. */
import type { UiLang } from "@/lib/lang-mode";
import { tx, type Poly } from "@/lib/i18n";

export type NavItem = {
  label: string;
  ja?: string;
  "zh-Hant"?: string;
  "zh-Hans"?: string;
  es?: string;
  href: string;
  description?: string;
  description_i18n?: Omit<Poly, "en">;
  requiresSignIn?: boolean;
  /** Route prefixes that keep this section highlighted on deeper pages. */
  activePrefixes?: readonly string[];
};

export type NavGroup = {
  heading: string;
  heading_i18n?: Omit<Poly, "en">;
  items: readonly NavItem[];
};

export function navLabel(item: NavItem, lang: UiLang): string {
  return tx({ en: item.label, ja: item.ja, "zh-Hant": item["zh-Hant"], "zh-Hans": item["zh-Hans"], es: item.es }, lang);
}

export function navDescription(item: NavItem, lang: UiLang): string | undefined {
  return item.description === undefined ? undefined : tx({ en: item.description, ...item.description_i18n }, lang);
}

export function navGroupHeading(group: NavGroup, lang: UiLang): string {
  return tx({ en: group.heading, ...group.heading_i18n }, lang);
}

const GUIDES: NavItem = {
  label: "Guides", ja: "ガイド", es: "Guías", "zh-Hans": "指南", "zh-Hant": "指南",
  href: "/guides",
  description: "Card care and learning to play",
  description_i18n: { ja: "カードの扱い方と遊び方", es: "Cuidar cartas y aprender a jugar", "zh-Hans": "卡牌保养与玩法", "zh-Hant": "卡片保養與玩法" },
  activePrefixes: ["/guides", "/intro"],
};

export const PRIMARY_NAV_ITEMS = [
  {
    label: "Prices", ja: "価格", es: "Precios", "zh-Hans": "价格", "zh-Hant": "價格",
    href: "/prices",
    activePrefixes: ["/prices", "/find", "/catalog", "/cards", "/product", "/glossary"],
  },
  {
    label: "Services", ja: "ツール", es: "Herramientas", "zh-Hans": "工具", "zh-Hant": "工具",
    href: "/services",
    activePrefixes: ["/services", "/account/data"],
  },
  {
    label: "Collection", ja: "コレクション", es: "Colección", "zh-Hans": "收藏", "zh-Hant": "收藏",
    href: "/account/portfolio",
    requiresSignIn: true,
    activePrefixes: ["/account/portfolio", "/account/sets", "/account/wishlist", "/account/watchlist"],
  },
  {
    label: "Play", ja: "遊ぶ", es: "Jugar", "zh-Hans": "玩", "zh-Hant": "玩",
    href: "/play",
    activePrefixes: ["/play", "/deck-builder", "/decks", "/leaderboards"],
  },
] as const satisfies readonly NavItem[];

const CULTURE: NavItem = {
  label: "Culture", ja: "文化", es: "Cultura", "zh-Hans": "文化", "zh-Hant": "文化",
  href: "/culture",
  activePrefixes: ["/culture", "/lineage", "/workshop", "/artists", "/duel-of-souls", "/pull-and-pause", "/mekiki", "/making", "/pulls", "/answering-rhymes", "/gallery-next-door", "/empty-frames", "/welcome-all"],
  description: "Card art, stories and creative projects",
  description_i18n: { ja: "カードアート、物語、創作", es: "Arte, historias y proyectos creativos", "zh-Hans": "卡牌艺术、故事与创作", "zh-Hant": "卡片藝術、故事與創作" },
};

const COMMUNITY: NavItem = {
  label: "Community", ja: "広場", es: "Comunidad", "zh-Hans": "社区", "zh-Hant": "社群",
  href: "/community",
  activePrefixes: ["/community", "/rewards", "/u"],
  description: "Profiles and community information",
  description_i18n: { ja: "プロフィールとコミュニティ情報", es: "Perfiles e información de la comunidad", "zh-Hans": "个人主页与社区信息", "zh-Hant": "個人頁面與社群資訊" },
};

export const MORE_NAV_GROUPS = [
  {
    heading: "Discover",
    heading_i18n: { ja: "もっと見る", es: "Descubrir", "zh-Hans": "发现", "zh-Hant": "發現" },
    items: [
      CULTURE,
      GUIDES,
      COMMUNITY,
      {
        label: "About", ja: "このサイトについて", es: "Acerca de", "zh-Hans": "关于本站", "zh-Hant": "關於本站",
        href: "/about",
        description: "About Cambridge TCG",
        description_i18n: { ja: "Cambridge TCGについて", es: "Sobre Cambridge TCG", "zh-Hans": "了解 Cambridge TCG", "zh-Hant": "了解 Cambridge TCG" },
        activePrefixes: ["/about", "/platform", "/manifest", "/graph", "/ontology", "/patterns", "/identify"],
      },
    ],
  },
  {
    heading: "Agents & developers",
    heading_i18n: { ja: "エージェントと開発者", es: "Agentes y desarrolladores", "zh-Hans": "智能体与开发者", "zh-Hant": "智能體與開發者" },
    items: [
      {
        label: "Agents & API", ja: "エージェントとAPI", es: "Agentes y API", "zh-Hans": "智能体与 API", "zh-Hant": "智能體與 API",
        href: "/agents",
        description: "Start with read-only discovery",
        description_i18n: { ja: "読み取り専用の情報から始める", es: "Empieza por consultas de solo lectura", "zh-Hans": "从只读资源开始", "zh-Hant": "由唯讀資源開始" },
        activePrefixes: ["/agents", "/api"],
      },
      {
        label: "Data directory", ja: "データ目録", es: "Directorio de datos", "zh-Hans": "数据目录", "zh-Hant": "資料目錄",
        href: "/data",
        description: "API access and rights",
        description_i18n: { ja: "APIの利用条件と権利", es: "Acceso a la API y derechos", "zh-Hans": "API 访问与使用权", "zh-Hant": "API 存取與使用權" },
        activePrefixes: ["/data", "/standards", "/scrapers"],
      },
      {
        label: "Methods", ja: "しくみ", es: "Métodos", "zh-Hans": "方法说明", "zh-Hant": "方法說明",
        href: "/methodology",
        description: "Sources, calculations and limits",
        description_i18n: { ja: "情報源、計算、限界", es: "Fuentes, cálculos y límites", "zh-Hans": "来源、计算与局限", "zh-Hant": "來源、計算與限制" },
        activePrefixes: ["/methodology", "/verify", "/prism-signals"],
      },
    ],
  },
] as const satisfies readonly NavGroup[];

export const SITE_MAP_NAV_ITEM = { label: "Site map", ja: "サイトマップ", es: "Mapa del sitio", "zh-Hans": "网站地图", "zh-Hant": "網站地圖", href: "/map" } as const satisfies NavItem;

export const MORE_NAV_FOOTER = [
  { label: "Contact", ja: "連絡先", es: "Contacto", "zh-Hans": "联系方式", "zh-Hant": "聯絡", href: "/contact" },
  SITE_MAP_NAV_ITEM,
] as const satisfies readonly NavItem[];

export const FOOTER_NAV_GROUPS = [
  {
    heading: "Explore",
    heading_i18n: { ja: "見てみる", es: "Explorar", "zh-Hans": "探索", "zh-Hant": "探索" },
    items: PRIMARY_NAV_ITEMS,
  },
  {
    ...MORE_NAV_GROUPS[0],
    items: [...MORE_NAV_GROUPS[0].items, MORE_NAV_FOOTER[1]],
  },
  {
    heading: "Account & help",
    heading_i18n: { ja: "アカウントとヘルプ", es: "Cuenta y ayuda", "zh-Hans": "账户与帮助", "zh-Hant": "帳戶與幫助" },
    items: [
      { label: "Your account", ja: "アカウント", es: "Tu cuenta", "zh-Hans": "你的账户", "zh-Hant": "你的帳戶", href: "/account" },
      { label: "Existing trades", ja: "これまでの取引", es: "Operaciones existentes", "zh-Hans": "已有交易", "zh-Hant": "已有交易", href: "/account/trades" },
      MORE_NAV_FOOTER[0],
    ],
  },
  MORE_NAV_GROUPS[1],
] as const satisfies readonly NavGroup[];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.activePrefixes ?? [item.href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function navItemAriaCurrent(item: NavItem, pathname: string): "page" | "location" | undefined {
  if (pathname === item.href) return "page";
  return isNavItemActive(item, pathname) ? "location" : undefined;
}

/** Every route promised directly by the compact global header. */
export function collectNavUrls(): string[] {
  const urls = new Set<string>();
  for (const item of PRIMARY_NAV_ITEMS) urls.add(item.href);
  for (const group of MORE_NAV_GROUPS) for (const item of group.items) urls.add(item.href);
  for (const item of MORE_NAV_FOOTER) urls.add(item.href);
  return Array.from(urls).sort();
}
