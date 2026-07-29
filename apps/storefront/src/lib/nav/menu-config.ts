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
    ja: "マーケット",
    href: "/market",
    activePrefixes: ["/market", "/auctions"],
  },
  {
    label: "Prices",
    ja: "相場",
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
    ja: "遊ぶ",
    href: "/play",
    activePrefixes: ["/play", "/deck-builder", "/decks", "/leaderboards"],
  },
  {
    label: "Culture",
    ja: "文化",
    href: "/culture",
    activePrefixes: [
      "/culture",
      "/lineage",
      "/workshop",
      "/artists",
      "/duel-of-souls",
      "/pull-and-pause",
      "/pulls",
      "/answering-rhymes",
      "/gallery-next-door",
    ],
  },
  {
    label: "Community",
    ja: "広場",
    href: "/community",
    activePrefixes: ["/community", "/rewards", "/u"],
  },
] as const satisfies readonly NavItem[];

export const MORE_NAV_GROUPS = [
  {
    heading: "Start",
    heading_i18n: { ja: "入口" },
    items: [
      {
        label: "Start here",
        ja: "はじめに",
        href: "/start",
        description: "A quick tour",
        description_i18n: { ja: "ざっとひと巡り" },
      },
      {
        label: "Guides",
        ja: "手引き",
        href: "/guides",
        description: "Buying and playing help",
        description_i18n: { ja: "買い方と、遊び方" },
      },
      {
        label: "About",
        ja: "この店について",
        href: "/about",
        description: "Who we are",
        description_i18n: { ja: "どんな店か" },
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
    heading_i18n: { ja: "データと信頼" },
    items: [
      {
        label: "Data directory",
        ja: "データ目録",
        href: "/data",
        description: "API access and rights",
        description_i18n: { ja: "APIと、権利のこと" },
        activePrefixes: ["/data", "/api", "/agents", "/standards", "/scrapers"],
      },
      {
        label: "Methods & fees",
        ja: "決め方と手数料",
        href: "/methodology",
        description: "Prices, fees and decisions",
        description_i18n: { ja: "相場と手数料、その決めごと" },
      },
      {
        label: "Draw proof checks",
        ja: "検算",
        href: "/verify",
        description: "Consistency evidence and stated limits",
        description_i18n: { ja: "数字のつじつまと、その限界" },
      },
    ],
  },
] as const satisfies readonly NavGroup[];

export const MORE_NAV_FOOTER = [
  { label: "Contact", ja: "連絡先", href: "/contact" },
  { label: "Platform map", ja: "案内図", href: "/map" },
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
