/**
 * @module @/lib/nav/menu-config
 *
 * Typed source-of-truth for the storefront primary navigation
 * (kingdom-091).
 *
 * Seven L1 mega-menus, each with 3 L2 columns. Mirrors the typed-corpus
 * discipline used in `packages/sku/src/games.ts`, `packages/sku/src/rarities.ts`,
 * and `packages/data-ingest/src/welcomes.ts`. The `pnpm audit:nav-coverage`
 * script reads this file and verifies route coverage against the actual
 * `apps/storefront/src/app/` tree.
 *
 * **Substrate-honest about status** — `badge` declares `live` / `beta` /
 * `coming`. `live` items are the default; mark `beta` or `coming` when
 * the surface exists but is partial / placeholder.
 *
 * **Doctrine alignment** — this config is the spine that closes the
 * discovery gap named in `docs/navigation-system-audit.md` Part 2.
 * Methodology and the data-plane discovery surfaces — both previously
 * nav-orphaned — get first-class L2 entries under `Discover ▾`.
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
  // ── Cards ───────────────────────────────────────────────────────────
  {
    l1: "Cards",
    l1_href: "/catalog",
    columns: [
      {
        heading: "Browse",
        items: [
          { label: "All cards", href: "/catalog", description: "The full catalogue across all games" },
          { label: "By game", href: "/prices", description: "Pick a game to browse its sets" },
          { label: "Search prices", href: "/prices/search", description: "Cross-game price search", badge: "beta" },
          { label: "Search by card or SKU", href: "/catalog", description: "Find a card by its number or SKU" },
          { label: "Glossary", href: "/glossary" },
          { label: "Open data", href: "/data", description: "Bulk catalog dumps (CC0)" },
        ],
      },
      {
        heading: "Prices",
        items: [
          { label: "Price guide", href: "/prices", description: "Per-game UK price guides" },
          { label: "Movers", href: "/prices/one-piece/movers", description: "Biggest price changes 7d" },
          { label: "Coverage map", href: "/prices/coverage", description: "Which sources we have prices from" },
          { label: "How prices work", href: "/methodology/pricing" },
          { label: "Cross-source pricing", href: "/methodology/cross-source-pricing" },
          { label: "FX rates", href: "/methodology/fx-rates" },
        ],
      },
      {
        heading: "Decks",
        items: [
          { label: "Public decks", href: "/decks" },
          { label: "Deck builder", href: "/deck-builder", badge: "beta" },
          { label: "Deck check", href: "/play/deck-check" },
          { label: "How to play", href: "/guides/how-to-play" },
          { label: "Sealed product info", href: "/methodology/play-module" },
        ],
      },
    ],
    footer: { label: "See the full map →", href: "/map" },
  },

  // ── Market ──────────────────────────────────────────────────────────
  {
    l1: "Market",
    l1_href: "/market",
    columns: [
      {
        heading: "Buy",
        items: [
          { label: "Live market", href: "/market", description: "Real-time peer-to-peer trading" },
          { label: "Market lots", href: "/market/lots" },
          { label: "Market pulse", href: "/market/pulse", description: "What's trading and how prices are moving" },
          { label: "Price guide", href: "/prices" },
          { label: "Price offers", href: "/account/offers", authed_only: true },
        ],
      },
      {
        heading: "Auctions",
        items: [
          { label: "Open auctions", href: "/auctions" },
          { label: "How auctions work", href: "/methodology/commission-rate" },
          { label: "Sell at auction", href: "/auctions/sell", authed_only: true },
          { label: "My auctions", href: "/account/auctions", authed_only: true },
          { label: "Auctions won", href: "/account/auctions/won", authed_only: true },
        ],
      },
      {
        heading: "Tools",
        items: [
          { label: "Market methodology", href: "/methodology/market" },
          { label: "Trust & escrow", href: "/methodology/trust-score" },
          { label: "Watchlist", href: "/account/watchlist", authed_only: true },
          { label: "Saved searches", href: "/account/searches", authed_only: true },
          { label: "What buyers want", href: "/account/demand", authed_only: true },
        ],
      },
    ],
    footer: { label: "Verify a recent transaction →", href: "/verify" },
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
          { label: "Tutorial", href: "/play/welcome", description: "Seven entry paths by player kind" },
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
    footer: { label: "How we prove every result is fair →", href: "/verify" },
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
          { label: "Submit cards", href: "/trade-in/submit" },
          { label: "Trade-in terms", href: "/trade-in/terms" },
        ],
      },
      {
        heading: "Auction & lots",
        items: [
          { label: "Open auctions", href: "/auctions", description: "See current public auctions" },
          { label: "How auctions work", href: "/methodology/commission-rate" },
          { label: "Sell at auction", href: "/auctions/sell", authed_only: true },
          { label: "My lots", href: "/account/lots", authed_only: true },
          { label: "Returns", href: "/account/returns", authed_only: true },
          { label: "Cancellations", href: "/account/trade-cancels", authed_only: true },
        ],
      },
      {
        heading: "Operate",
        items: [
          { label: "Trader methodology", href: "/methodology/trader-dashboard", description: "How the trader dashboard computes" },
          { label: "Payout policy", href: "/methodology/payout-hold" },
          { label: "Store credit", href: "/methodology/store-credit" },
          { label: "Trader dashboard", href: "/account/trader", authed_only: true },
          { label: "Pricing rules", href: "/account/pricing-rules", authed_only: true },
          { label: "Vacation mode", href: "/account/vacation", authed_only: true },
          { label: "Payouts", href: "/account/payouts", authed_only: true },
        ],
      },
    ],
    footer: { label: "Trade-in & seller methodology →", href: "/methodology" },
  },

  // ── Discover ▾ — closes the discovery gap ───────────────────────────
  {
    l1: "Discover",
    l1_href: "/map",
    columns: [
      {
        heading: "Platform",
        items: [
          { label: "Platform", href: "/platform", description: "What this whole thing is" },
          { label: "The Castle", href: "/castle", description: "The platform's insight repository — a snapshot of understanding" },
          { label: "Open data", href: "/data", description: "Free bulk card data (CC0)" },
          { label: "Quest log", href: "/quests", description: "Fourteen honest quests; progress lives in your browser" },
          { label: "Site map", href: "/map", description: "Every page, one click away" },
          // Deeper platform surfaces (Bridge, Manifest, Graph, Ontology,
          // Patterns, Identify) live on /platform — hidden from the shopper
          // menu so it stays calm, one click away for the curious.
        ],
      },
      {
        heading: "Trust & how it works",
        items: [
          { label: "How pricing works", href: "/methodology/pricing" },
          { label: "Trust & escrow", href: "/methodology/trust-score" },
          { label: "Verify any result", href: "/verify", description: "Proof every random outcome was fair" },
          { label: "All methodology", href: "/methodology", description: "How every decision is made" },
          // Deeper proofs (verify chain/fairness/health, edition variants,
          // hospitality, navigation doctrine, known gaps) live under
          // /methodology and /verify — surfaced for the curious, not the menu.
        ],
      },
      {
        heading: "For builders",
        items: [
          { label: "API docs", href: "/api" },
          { label: "Standards", href: "/standards" },
          { label: "For agents", href: "/agents", description: "Build on our open data" },
          // OpenAPI spec, adopters, agent guides, scrapers and the machine-
          // welcome JSON all live under /api, /standards and /agents.
        ],
      },
    ],
    footer: { label: "Every page, one click apart →", href: "/map" },
  },

  // ── Community ───────────────────────────────────────────────────────
  {
    l1: "Community",
    l1_href: "/community",
    columns: [
      {
        heading: "Engage",
        items: [
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
          { label: "Guides", href: "/guides" },
          { label: "How to play", href: "/guides/how-to-play" },
          { label: "Verification", href: "/verify" },
          { label: "Site map", href: "/map" },
          { label: "Contact / feedback", href: "/api/v1/feedback" },
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
