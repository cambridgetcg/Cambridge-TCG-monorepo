/**
 * @module @/lib/nav/menu-config
 *
 * Typed source-of-truth for the storefront primary navigation
 * (kingdom-091; recentred collectors-first for kingdom-101, 2026-07-06).
 *
 * Six L1 mega-menus, each with 3 L2 columns. Mirrors the typed-corpus
 * discipline used in `packages/sku/src/games.ts`, `packages/sku/src/rarities.ts`,
 * and `packages/data-ingest/src/welcomes.ts`. The `pnpm audit:nav-coverage`
 * script reads this file and verifies route coverage against the actual
 * `apps/storefront/src/app/` tree.
 *
 * **Substrate-honest about status** — `badge` declares `live` / `beta` /
 * `coming`. `live` items are the default; mark `beta` or `coming` when
 * the surface exists but is partial / placeholder.
 *
 * **Collectors first (2026-07-06)** — the house left the market floor
 * (docs/decisions/2026-07-06-collectors-first.md). The nav recentres on
 * Market (primary), Prices & Data, Play, Community. The retail "Cards"
 * catalog entries repoint to the market and the price guides; the Cart
 * and Sell-to-us doors are gone; "List a card" and "Swaps" surface
 * prominently. Discover ▾ and About ▾ keep the self-describing and
 * doctrine surfaces reachable.
 */

export type MenuItemBadge = "live" | "beta" | "coming";

export type MenuItem = {
  label: string;
  href: string;
  description?: string;
  badge?: MenuItemBadge;
  /** Render only when the user is authenticated. */
  authed_only?: boolean;
};

export type MenuColumn = {
  heading: string;
  items: MenuItem[];
};

export type MegaMenu = {
  /** L1 label rendered on the top nav. */
  l1: string;
  /** Optional landing href when the L1 itself is clicked. */
  l1_href?: string;
  columns: [MenuColumn, MenuColumn, MenuColumn];
  /** Optional footer link rendered below the columns. */
  footer?: { label: string; href: string };
};

export const STOREFRONT_PRIMARY_NAV: MegaMenu[] = [
  // ── Market — the primary door ───────────────────────────────────────
  {
    l1: "Market",
    l1_href: "/market",
    columns: [
      {
        heading: "Trade",
        items: [
          { label: "Live market", href: "/market", description: "Peer-to-peer trading between collectors" },
          { label: "Ways to buy a card", href: "/guides/buying", description: "Every channel — our P2P market, Cardmarket, CardRush via a Japan proxy, grading" },
          { label: "List a card", href: "/market/list", description: "Name your price — list a card in a minute" },
          { label: "Swaps", href: "/methodology/swaps", description: "Card-for-card, no money in the middle" },
          { label: "My swaps", href: "/account/swaps", authed_only: true },
          { label: "Market lots", href: "/market/lots" },
          { label: "Market pulse", href: "/market/pulse", description: "Volume + spread heatmap" },
          { label: "Price offers", href: "/account/offers", authed_only: true },
        ],
      },
      {
        heading: "Auctions",
        items: [
          { label: "Open auctions", href: "/auctions" },
          { label: "Fees & commission", href: "/methodology/commission-rate" },
          { label: "Sell at auction", href: "/auctions/sell", authed_only: true },
          { label: "My auctions", href: "/account/auctions", authed_only: true },
          { label: "Auctions won", href: "/account/auctions/won", authed_only: true },
          { label: "My lots", href: "/account/lots", authed_only: true },
        ],
      },
      {
        heading: "Sell & operate",
        items: [
          { label: "Market methodology", href: "/methodology/market" },
          { label: "Trust & escrow", href: "/methodology/trust-score" },
          { label: "Payout policy", href: "/methodology/payout-hold" },
          { label: "Trader dashboard", href: "/account/trader", authed_only: true },
          { label: "Payouts", href: "/account/payouts", authed_only: true },
          { label: "Pricing rules", href: "/account/pricing-rules", authed_only: true },
          { label: "Vacation mode", href: "/account/vacation", authed_only: true },
          { label: "Returns", href: "/account/returns", authed_only: true },
          { label: "Cancellations", href: "/account/trade-cancels", authed_only: true },
          { label: "Watchlist", href: "/account/watchlist", authed_only: true },
          { label: "Saved searches", href: "/account/searches", authed_only: true },
        ],
      },
    ],
    footer: { label: "Verify a recent transaction →", href: "/verify" },
  },

  // ── Prices & Data — the open data commons ───────────────────────────
  {
    l1: "Prices & Data",
    l1_href: "/prices",
    columns: [
      {
        heading: "Find a card",
        items: [
          { label: "Search prices", href: "/prices/search", description: "Card number → price, history, sources, variants — in one view", badge: "beta" },
          { label: "Browse the market", href: "/market", description: "Every card's live book, collector to collector" },
          { label: "By game", href: "/prices", description: "Pick a game to browse its sets" },
          { label: "Glossary", href: "/glossary" },
        ],
      },
      {
        heading: "Prices",
        items: [
          { label: "Price guide", href: "/prices", description: "Per-game UK reference prices — labelled, sourced, free" },
          // Movers is per-game (/prices/<game>/movers); the nav sends
          // people to the game-agnostic landing rather than silently
          // assuming One Piece for a tri-game catalog.
          { label: "Movers", href: "/prices", description: "Pick a game for its biggest 7-day price changes" },
          { label: "Coverage map", href: "/prices/coverage", description: "Per-source coverage rollup" },
          { label: "How prices work", href: "/methodology/pricing" },
          { label: "Cross-source pricing", href: "/methodology/cross-source-pricing" },
          { label: "FX rates", href: "/methodology/fx-rates" },
        ],
      },
      {
        heading: "Open data",
        items: [
          { label: "Open data", href: "/data", description: "Bulk catalog dumps, free to use (CC0)" },
          { label: "API docs", href: "/api" },
          { label: "OpenAPI spec", href: "/api/openapi.json" },
          { label: "Standards", href: "/standards" },
          { label: "For agents", href: "/agents" },
        ],
      },
    ],
    footer: { label: "See the full map →", href: "/map" },
  },

  // ── Play ────────────────────────────────────────────────────────────
  {
    l1: "Play",
    l1_href: "/play",
    columns: [
      {
        heading: "Modes",
        items: [
          { label: "Casual", href: "/play/casual", description: "Fun-first hobbyist mode" },
          { label: "Competitive", href: "/play/compete", description: "Ranked play; agent ladder" },
          { label: "Adventure", href: "/play/adventure", description: "Single-player PvE journey" },
          { label: "Spec a match", href: "/play/spec", description: "Watch a live game" },
          { label: "Tutorial", href: "/play/tutorial", description: "Never played? The rules from zero" },
          { label: "Choose your path", href: "/play/welcome", description: "Seven entry paths by player kind" },
        ],
      },
      {
        heading: "Build",
        items: [
          { label: "Deck builder", href: "/deck-builder", badge: "beta" },
          { label: "Deck check", href: "/play/deck-check" },
          { label: "Public decks", href: "/decks" },
          { label: "My decks", href: "/decks", authed_only: true },
          { label: "How to play", href: "/guides/how-to-play" },
        ],
      },
      {
        heading: "Watch & learn",
        items: [
          { label: "Leaderboards", href: "/leaderboards" },
          { label: "Agent leaderboard", href: "/leaderboards/agents" },
          { label: "Play methodology", href: "/methodology/play-module" },
          { label: "For agent builders", href: "/methodology/agents" },
          { label: "My agents", href: "/account/agents", authed_only: true },
        ],
      },
    ],
    footer: { label: "Inspect draw proofs and limits →", href: "/verify" },
  },

  // ── Community ───────────────────────────────────────────────────────
  {
    l1: "Community",
    l1_href: "/community",
    columns: [
      {
        heading: "Engage",
        items: [
          { label: "Start here", href: "/start", description: "New? Plain words, no jargon" },
          { label: "Community hub", href: "/community" },
          { label: "New here?", href: "/community/welcome" },
          { label: "Membership", href: "/membership", description: "Tiers, benefits, and what they include" },
          { label: "Following", href: "/account/following", authed_only: true },
          { label: "Followers", href: "/account/followers", authed_only: true },
          { label: "Collectives", href: "/account/collectives", authed_only: true },
        ],
      },
      {
        heading: "Rewards",
        items: [
          { label: "Rewards hub", href: "/rewards" },
          { label: "Reward packs", href: "/rewards/packs" },
          { label: "Spin wheel", href: "/rewards/spin" },
          { label: "My prizes", href: "/account/rewards", authed_only: true },
          { label: "Reward methodology", href: "/methodology/membership-tier" },
        ],
      },
      {
        heading: "Recognise",
        items: [
          { label: "Bounty program", href: "/bounty" },
          { label: "Leaderboards", href: "/leaderboards" },
          { label: "Agent leaderboard", href: "/leaderboards/agents" },
          { label: "Trust scores", href: "/methodology/trust-score" },
          { label: "Memorial accounts", href: "/methodology/memorial" },
          { label: "Sabbath mode", href: "/methodology/sabbath" },
        ],
      },
    ],
    footer: { label: "Welcoming statement — every kind of being →", href: "/welcome-all" },
  },

  // ── Discover ▾ — closes the discovery gap ───────────────────────────
  {
    l1: "Discover",
    // /platform is the human start-here (thesis, stats, onward paths);
    // /map is the full index, linked below. Contact-surface spec §3.1.
    l1_href: "/platform",
    columns: [
      {
        heading: "Platform",
        items: [
          { label: "Platform", href: "/platform", description: "What this place is and who it serves" },
          { label: "Open data", href: "/data", description: "Bulk catalog dumps, free to use (CC0)" },
          { label: "Bridge", href: "/bridge", description: "Introduce any two beings to each other" },
          { label: "Manifest", href: "/manifest", description: "Everything on offer, in one directory" },
          { label: "Graph", href: "/graph", description: "How every piece connects" },
          { label: "Ontology", href: "/ontology", description: "What each kind of thing is" },
          { label: "Patterns", href: "/patterns", description: "The shapes that keep recurring" },
          { label: "Identify", href: "/identify", description: "We declare ourselves — you can too" },
          { label: "Site map", href: "/map" },
        ],
      },
      {
        heading: "Methodology",
        items: [
          { label: "All methodology", href: "/methodology", description: "Index of 32 decisions" },
          { label: "Navigation doctrine", href: "/methodology/navigation", badge: "live" },
          { label: "Trust & escrow", href: "/methodology/trust-score" },
          { label: "Pricing", href: "/methodology/pricing" },
          { label: "Edition variants", href: "/methodology/edition-variants" },
          { label: "Hospitality", href: "/methodology/hospitality" },
          { label: "Draw proof checks", href: "/verify", description: "Consistency evidence and stated limits" },
          { label: "How verification works", href: "/verify/how-it-works" },
          { label: "Verify chain", href: "/verify/chain" },
          { label: "Observed distribution", href: "/verify/fairness" },
          { label: "Health check", href: "/verify/health" },
          { label: "Known gaps", href: "/methodology/known-gaps" },
        ],
      },
      {
        heading: "For builders",
        items: [
          { label: "API docs", href: "/api" },
          { label: "OpenAPI spec", href: "/api/openapi.json" },
          { label: "Standards", href: "/standards" },
          { label: "Adopters", href: "/standards/adopters" },
          { label: "For agents", href: "/agents" },
          { label: "Agent guides", href: "/agents/guides" },
          { label: "For scrapers", href: "/scrapers" },
          { label: "Machine welcome (JSON)", href: "/api/v1/welcome" },
        ],
      },
    ],
    footer: { label: "Every page, one click apart →", href: "/map" },
  },

  // ── About ───────────────────────────────────────────────────────────
  {
    l1: "About",
    l1_href: "/about",
    columns: [
      {
        heading: "Our story",
        items: [
          { label: "About", href: "/about" },
          { label: "Welcoming statement", href: "/welcome-all" },
          { label: "Platform identity", href: "/platform" },
          { label: "Methodology of methodology", href: "/methodology/methodology" },
          { label: "Cosmology", href: "/methodology/cosmology" },
        ],
      },
      {
        heading: "How we operate",
        items: [
          { label: "All methodology", href: "/methodology" },
          { label: "Hospitality", href: "/methodology/hospitality" },
          { label: "Welcoming", href: "/methodology/welcoming" },
          { label: "Known gaps", href: "/methodology/known-gaps" },
          { label: "Navigation doctrine", href: "/methodology/navigation" },
          { label: "Upstream sources", href: "/methodology/upstream-sources" },
        ],
      },
      {
        heading: "Support",
        items: [
          { label: "Start here", href: "/start", description: "New? Plain words, no jargon" },
          { label: "Guides", href: "/guides" },
          { label: "Buying guide", href: "/guides/buying" },
          { label: "How to play", href: "/guides/how-to-play" },
          { label: "Verification", href: "/verify" },
          { label: "Site map", href: "/map" },
          // /contact is the human contact surface (contact-surface spec
          // W6); earlier targets dumped humans into raw JSON or /about.
          { label: "Contact / feedback", href: "/contact" },
        ],
      },
    ],
    footer: { label: "The full doctrine + audit corpus →", href: "/methodology" },
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
