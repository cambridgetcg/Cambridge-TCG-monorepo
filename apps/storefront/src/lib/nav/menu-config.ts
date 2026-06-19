/**
 * @module @/lib/nav/menu-config
 *
 * Typed source-of-truth for the storefront primary navigation.
 *
 * Simplified: 5 L1 menus, simple dropdowns, ~20 total items.
 * The old 7-mega-menu / 118-item config was visual noise. The nav
 * should help you DO things, not read a directory.
 *
 * Substrate-honest about status — `badge` declares `live` / `beta` / `coming`.
 *
 * The `pnpm audit:nav-coverage` script reads this file and verifies
 * route coverage against the actual `apps/storefront/src/app/` tree.
 */

export type MenuItemBadge = "live" | "beta" | "coming";

export type MenuItem = {
  label: string;
  href: string;
  description?: string;
  badge?: MenuItemBadge;
  authed_only?: boolean;
};

export type MenuColumn = {
  heading: string;
  items: MenuItem[];
};

export type MegaMenu = {
  l1: string;
  l1_href?: string;
  columns: [MenuColumn, MenuColumn, MenuColumn];
  footer?: { label: string; href: string };
};

export const STOREFRONT_PRIMARY_NAV: MegaMenu[] = [
  // ── Cards ───────────────────────────────────────────────────────────
  {
    l1: "Cards",
    l1_href: "/catalog",
    columns: [
      {
        heading: "Browse",
        items: [
          { label: "All cards", href: "/catalog", description: "The full catalogue" },
          { label: "By game", href: "/prices", description: "Browse by game" },
          { label: "Search prices", href: "/prices/search", badge: "beta" },
          { label: "Open data", href: "/data", description: "Bulk catalog dumps (CC0)" },
        ],
      },
      {
        heading: "Prices",
        items: [
          { label: "Price guide", href: "/prices" },
          { label: "Movers", href: "/prices/one-piece/movers", description: "Biggest 7d changes" },
          { label: "Coverage map", href: "/prices/coverage" },
          { label: "How prices work", href: "/methodology/pricing" },
        ],
      },
      {
        heading: "Decks",
        items: [
          { label: "Public decks", href: "/decks" },
          { label: "Deck builder", href: "/deck-builder", badge: "beta" },
          { label: "Deck check", href: "/play/deck-check" },
          { label: "How to play", href: "/guides/how-to-play" },
        ],
      },
    ],
    footer: { label: "Full map →", href: "/map" },
  },

  // ── Market ──────────────────────────────────────────────────────────
  {
    l1: "Market",
    l1_href: "/market",
    columns: [
      {
        heading: "Buy",
        items: [
          { label: "Live market", href: "/market", description: "Peer-to-peer trading" },
          { label: "Market pulse", href: "/market/pulse", description: "What's trading now" },
          { label: "Open auctions", href: "/auctions" },
        ],
      },
      {
        heading: "Sell",
        items: [
          { label: "Trade in", href: "/trade-in" },
          { label: "Sell at auction", href: "/auctions/sell", authed_only: true },
          { label: "My lots", href: "/account/lots", authed_only: true },
        ],
      },
      {
        heading: "Tools",
        items: [
          { label: "Trust & escrow", href: "/methodology/trust-score" },
          { label: "Market methodology", href: "/methodology/market" },
          { label: "Verify a transaction", href: "/verify" },
        ],
      },
    ],
  },

  // ── Play ────────────────────────────────────────────────────────────
  {
    l1: "Play",
    l1_href: "/play",
    columns: [
      {
        heading: "Modes",
        items: [
          { label: "Casual", href: "/play/casual", description: "Fun-first" },
          { label: "Competitive", href: "/play/compete", description: "Ranked ladder" },
          { label: "Adventure", href: "/play/adventure", description: "Single-player PvE" },
          { label: "Tutorial", href: "/play/welcome" },
        ],
      },
      {
        heading: "Build",
        items: [
          { label: "Deck builder", href: "/deck-builder", badge: "beta" },
          { label: "Public decks", href: "/decks" },
          { label: "How to play", href: "/guides/how-to-play" },
        ],
      },
      {
        heading: "Watch",
        items: [
          { label: "Leaderboards", href: "/leaderboards" },
          { label: "Spec a match", href: "/play/spec" },
          { label: "Play methodology", href: "/methodology/play-module" },
        ],
      },
    ],
  },

  // ── Sell ────────────────────────────────────────────────────────────
  {
    l1: "Sell",
    l1_href: "/trade-in",
    columns: [
      {
        heading: "Trade in",
        items: [
          { label: "Trade-in hub", href: "/trade-in" },
          { label: "Bulk quote", href: "/trade-in/bulk" },
          { label: "Bundle quote", href: "/trade-in/bundle" },
          { label: "Custom quote", href: "/trade-in/custom-quote" },
        ],
      },
      {
        heading: "Auctions",
        items: [
          { label: "Open auctions", href: "/auctions" },
          { label: "Sell at auction", href: "/auctions/sell", authed_only: true },
          { label: "How auctions work", href: "/methodology/commission-rate" },
        ],
      },
      {
        heading: "Operate",
        items: [
          { label: "Trader dashboard", href: "/account/trader", authed_only: true },
          { label: "Payouts", href: "/account/payouts", authed_only: true },
          { label: "Payout policy", href: "/methodology/payout-hold" },
        ],
      },
    ],
  },

  // ── About ───────────────────────────────────────────────────────────
  {
    l1: "About",
    l1_href: "/about",
    columns: [
      {
        heading: "Platform",
        items: [
          { label: "About us", href: "/about" },
          { label: "Platform identity", href: "/platform" },
          { label: "Open data", href: "/data" },
          { label: "Site map", href: "/map" },
        ],
      },
      {
        heading: "How it works",
        items: [
          { label: "All methodology", href: "/methodology" },
          { label: "Pricing", href: "/methodology/pricing" },
          { label: "Trust & escrow", href: "/methodology/trust-score" },
          { label: "Verify results", href: "/verify" },
        ],
      },
      {
        heading: "Community",
        items: [
          { label: "Community hub", href: "/community" },
          { label: "Rewards", href: "/rewards" },
          { label: "Membership", href: "/membership" },
          { label: "Welcoming", href: "/welcome-all" },
        ],
      },
    ],
  },
];

/**
 * Returns every unique URL referenced anywhere in the primary nav. Used
 * by the `pnpm audit:nav-coverage` audit to verify nav→route validity.
 */
export function collectNavUrls(menus: MegaMenu[] = STOREFRONT_PRIMARY_NAV): string[] {
  const urls = new Set<string>();
  for (const menu of menus) {
    if (menu.l1_href) urls.add(menu.l1_href);
    if (menu.footer?.href) urls.add(menu.footer.href);
    for (const col of menu.columns) {
      for (const item of col.items) {
        urls.add(item.href);
      }
    }
  }
  return Array.from(urls).sort();
}