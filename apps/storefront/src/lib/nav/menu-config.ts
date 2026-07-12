/**
 * @module @/lib/nav/menu-config
 *
 * Human-scale source of truth for the storefront header.
 *
 * The previous config doubled as a site index: six mega-menus exposed more
 * than one hundred links. The header now carries only the four things most
 * visitors come to do, plus a small More menu. The complete corpus remains
 * reachable through the linked hubs and `/map`.
 */

export type NavItem = {
  label: string;
  href: string;
  description?: string;
  /** Route prefixes that keep this section highlighted on deeper pages. */
  activePrefixes?: readonly string[];
};

export type NavGroup = {
  heading: string;
  items: readonly NavItem[];
};

export const PRIMARY_NAV_ITEMS = [
  {
    label: "Market",
    href: "/market",
    activePrefixes: ["/market", "/auctions"],
  },
  {
    label: "Prices",
    href: "/prices",
    activePrefixes: ["/prices", "/find", "/catalog", "/cards", "/product", "/glossary"],
  },
  {
    label: "Play",
    href: "/play",
    activePrefixes: ["/play", "/deck-builder", "/decks", "/leaderboards"],
  },
  {
    label: "Community",
    href: "/community",
    activePrefixes: ["/community", "/membership", "/rewards", "/bounty", "/u"],
  },
] as const satisfies readonly NavItem[];

export const MORE_NAV_GROUPS = [
  {
    heading: "Start",
    items: [
      {
        label: "Start here",
        href: "/start",
        description: "A quick tour",
      },
      {
        label: "Guides",
        href: "/guides",
        description: "Buying and playing help",
      },
      {
        label: "About",
        href: "/about",
        description: "Who we are",
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
    items: [
      {
        label: "Data directory",
        href: "/data",
        description: "API access and rights",
        activePrefixes: ["/data", "/api", "/agents", "/standards", "/scrapers"],
      },
      {
        label: "Methods & fees",
        href: "/methodology",
        description: "Prices, fees and decisions",
      },
      {
        label: "Draw proof checks",
        href: "/verify",
        description: "Consistency evidence and stated limits",
      },
    ],
  },
] as const satisfies readonly NavGroup[];

export const MORE_NAV_FOOTER = [
  { label: "Contact", href: "/contact" },
  { label: "Platform map", href: "/map" },
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
