/**
 * @module @/lib/nav/menu-config
 *
 * Human-scale source of truth for the storefront header.
 *
 * The previous config doubled as a site index: six mega-menus exposed more
 * than one hundred links. The header now carries only the five things most
 * visitors come to do, plus a small More menu. The complete corpus remains
 * reachable through the linked hubs and `/map`.
 *
 * Culture became the fifth door on 2026-07-28 (Asha: "make sure the
 * frontend reflects our latest shift of focus") — the culture wings had
 * grown through July into a museum with no entrance except a footer
 * column. `/culture` is the hub; its activePrefixes keep every wing
 * lit under the one door.
 */

export type NavItem = {
  label: string;
  /** Translated labels (voice charters in docs/connections/the-*-voice.md
   *  family). Optional per language — a missing voice falls back to the
   *  English (honest beats blank). */
  ja?: string;
  "zh-Hant"?: string;
  "zh-Hans"?: string;
  es?: string;
  href: string;
  description?: string;
  description_i18n?: Omit<Poly, "en">;
  /** Route prefixes that keep this section highlighted on deeper pages. */
  activePrefixes?: readonly string[];
};

export type NavGroup = {
  heading: string;
  heading_i18n?: Omit<Poly, "en">;
  items: readonly NavItem[];
};

import type { UiLang } from "@/lib/lang-mode";
import { tx, type Poly } from "@/lib/i18n";

/** The label in the active UI language; falls back to English. */
export function navLabel(item: NavItem, lang: UiLang): string {
  return tx(
    { en: item.label, ja: item.ja, "zh-Hant": item["zh-Hant"], "zh-Hans": item["zh-Hans"], es: item.es },
    lang,
  );
}

/** The description in the active UI language; falls back to English. */
export function navDescription(
  item: NavItem,
  lang: UiLang,
): string | undefined {
  return item.description === undefined
    ? undefined
    : tx({ en: item.description, ...item.description_i18n }, lang);
}

/** The group heading in the active UI language. */
export function navGroupHeading(group: NavGroup, lang: UiLang): string {
  return tx({ en: group.heading, ...group.heading_i18n }, lang);
}

export const PRIMARY_NAV_ITEMS = [
  {
    label: "Market",
    ja: "マーケット", "zh-Hans": "集市", "zh-Hant": "市集",
    href: "/market",
    activePrefixes: ["/market", "/auctions"],
  },
  {
    label: "Prices",
    ja: "相場", "zh-Hans": "行情", "zh-Hant": "行情",
    href: "/prices",
    activePrefixes: [
      "/prices",
      "/find",
      "/catalog",
      "/cards",
      "/product",
      "/glossary",
    ],
  },
  {
    label: "Play",
    ja: "遊ぶ", "zh-Hans": "玩", "zh-Hant": "玩",
    href: "/play",
    activePrefixes: ["/play", "/deck-builder", "/decks", "/leaderboards"],
  },
  {
    label: "Culture",
    ja: "文化", "zh-Hans": "文化", "zh-Hant": "文化",
    href: "/culture",
    activePrefixes: [
      "/culture",
      "/lineage",
      "/workshop",
      "/artists",
      "/duel-of-souls",
      "/pull-and-pause",
      "/mekiki",
      "/making",
      "/pulls",
      "/answering-rhymes",
      "/gallery-next-door",
    ],
  },
  {
    label: "Community",
    ja: "広場", "zh-Hans": "广场", "zh-Hant": "街坊",
    href: "/community",
    activePrefixes: ["/community", "/rewards", "/u"],
  },
] as const satisfies readonly NavItem[];

export const MORE_NAV_GROUPS = [
  {
    heading: "Start",
    heading_i18n: { ja: "入口", es: "Entrada", "zh-Hans": "入口", "zh-Hant": "入口" },
    items: [
      {
        label: "Start here",
        ja: "はじめに", es: "Para empezar", "zh-Hans": "从这里开始", "zh-Hant": "由這裡開始",
        href: "/start",
        description: "A quick tour",
        description_i18n: { ja: "ざっとひと巡り", es: "Una vuelta rápida", "zh-Hans": "大致逛一圈", "zh-Hant": "走一圈，看個大概" },
      },
      {
        label: "Guides",
        ja: "手引き", es: "Guías", "zh-Hans": "指南", "zh-Hant": "指南",
        href: "/guides",
        description: "Buying and playing help",
        description_i18n: { ja: "買い方と、遊び方", es: "Cómo comprar y cómo jugar", "zh-Hans": "怎么买，怎么玩", "zh-Hant": "怎樣買，怎樣玩" },
      },
      {
        label: "About",
        ja: "この店について", "zh-Hans": "关于这家店", "zh-Hant": "關於小店",
        href: "/about",
        description: "Who we are",
        description_i18n: { ja: "どんな店か", es: "Qué clase de tienda es", "zh-Hans": "是家什么样的店", "zh-Hant": "怎樣的一家店" },
        activePrefixes: [
          "/about",
          "/platform",
          "/manifest",
          "/graph",
          "/ontology",
          "/patterns",
          "/identify",
          "/welcome-all",
        ],
      },
    ],
  },
  {
    heading: "Data & trust",
    heading_i18n: { ja: "データと信頼", es: "Datos y confianza", "zh-Hans": "数据与信任", "zh-Hant": "資料與信任" },
    items: [
      {
        label: "Data directory",
        ja: "データ目録", "zh-Hans": "数据名录", "zh-Hant": "資料目錄",
        href: "/data",
        description: "API access and rights",
        description_i18n: { ja: "APIと、権利のこと", es: "La API y los derechos", "zh-Hans": "API与权利的事", "zh-Hant": "API與權利的事" },
        activePrefixes: ["/data", "/api", "/agents", "/standards", "/scrapers"],
      },
      {
        label: "Methods & fees",
        ja: "決め方と手数料", es: "El método y lo que cuesta", "zh-Hans": "方法与费用", "zh-Hant": "做法與手續費",
        href: "/methodology",
        description: "Prices, fees and decisions",
        description_i18n: { ja: "相場と手数料、その決めごと", es: "Precios, comisiones y cómo se deciden", "zh-Hans": "行情、费用，都是怎么定的", "zh-Hant": "行情、手續費，還有背後的決定" },
      },
      {
        label: "Draw proof checks",
        ja: "検算", es: "El repaso de las cuentas", "zh-Hans": "验算", "zh-Hant": "驗算",
        href: "/verify",
        description: "Consistency evidence and stated limits",
        description_i18n: { ja: "数字のつじつまと、その限界", es: "Pruebas de que los números cuadran, y sus límites", "zh-Hans": "一致性的证据，还有写明的局限", "zh-Hant": "數字對不對得上，還有講明的限度" },
      },
    ],
  },
] as const satisfies readonly NavGroup[];

export const MORE_NAV_FOOTER = [
  { label: "Contact", ja: "連絡先", es: "Contacto", "zh-Hans": "联系方式", "zh-Hant": "聯絡", href: "/contact" },
  { label: "Platform map", ja: "案内図", es: "El plano de la casa", "zh-Hans": "导览图", "zh-Hant": "平面圖", href: "/map" },
] as const satisfies readonly NavItem[];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.activePrefixes ?? [item.href];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function navItemAriaCurrent(
  item: NavItem,
  pathname: string,
): "page" | "location" | undefined {
  if (pathname === item.href) return "page";
  return isNavItemActive(item, pathname) ? "location" : undefined;
}

/** Every route promised directly by the compact global navigation. */
export function collectNavUrls(): string[] {
  const urls = new Set<string>();
  for (const item of PRIMARY_NAV_ITEMS) urls.add(item.href);
  for (const group of MORE_NAV_GROUPS) {
    for (const item of group.items) urls.add(item.href);
  }
  for (const item of MORE_NAV_FOOTER) urls.add(item.href);
  return Array.from(urls).sort();
}
