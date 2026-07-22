/**
 * @module @/lib/nav/breadcrumb-registry
 *
 * URL-pattern → breadcrumb chain registry (kingdom-091).
 *
 * Routes deeper than two segments render breadcrumbs above the page
 * header. This file is the single source of truth for those chains.
 *
 * **Pattern matching**: Patterns use a simple `:slug` notation (e.g.
 * `/account/trades/:id/review`). At render time the resolver matches
 * the actual pathname against the registered patterns, picking the
 * most-specific match (longest segment-count, then most static).
 *
 * **Substrate-honest about absence**: routes without a registered
 * pattern get no breadcrumb (rather than a wrong one). The
 * `pnpm audit:nav-coverage` audit reports unregistered deep routes.
 */

export type BreadcrumbStep = {
  /** Label shown in the breadcrumb chain. May include `:slug` tokens that get substituted at render time. */
  label: string;
  /**
   * Optional href. When omitted, the step renders as plain text (the
   * tail step is conventionally hrefless). The href may include `:slug`
   * tokens too.
   */
  href?: string;
};

export type BreadcrumbRenderer = "global" | "page" | "section";

export type BreadcrumbPattern = {
  /** URL pattern with `:slug` placeholders. */
  pattern: string;
  /**
   * The surface responsible for rendering this trail.
   *
   * - `global`: the root storefront breadcrumb slot renders it.
   * - `page`: the route already owns equivalent local wayfinding.
   * - `section`: a persistent section nav owns the route hierarchy.
   */
  renderedBy: BreadcrumbRenderer;
  /**
   * The chain of steps from root to (but not including) the final
   * leaf — the leaf is rendered as text by the breadcrumb component
   * from the last step. The last step here SHOULD be hrefless.
   */
  steps: BreadcrumbStep[];
};

export const BREADCRUMB_REGISTRY: BreadcrumbPattern[] = [
  // ── Account paths ────────────────────────────────────────────────────
  {
    pattern: "/account/trades/:id",
    renderedBy: "section",
    steps: [
      { label: "Account", href: "/account" },
      { label: "Trades", href: "/account/trades" },
      { label: "Trade #:id" },
    ],
  },
  {
    pattern: "/account/trades/:id/review",
    renderedBy: "section",
    steps: [
      { label: "Account", href: "/account" },
      { label: "Trades", href: "/account/trades" },
      { label: "Trade #:id", href: "/account/trades/:id" },
      { label: "Review" },
    ],
  },
  {
    pattern: "/account/sets/:code",
    renderedBy: "section",
    steps: [
      { label: "Account", href: "/account" },
      { label: "Set progress", href: "/account/sets" },
      { label: "Set :code" },
    ],
  },
  {
    pattern: "/account/portfolio/add",
    renderedBy: "section",
    steps: [
      { label: "Account", href: "/account" },
      { label: "Portfolio", href: "/account/portfolio" },
      { label: "Add" },
    ],
  },
  {
    pattern: "/account/portfolio/value",
    renderedBy: "section",
    steps: [
      { label: "Account", href: "/account" },
      { label: "Portfolio", href: "/account/portfolio" },
      { label: "Collection value" },
    ],
  },
  {
    pattern: "/account/auctions/won",
    renderedBy: "section",
    steps: [
      { label: "Account", href: "/account" },
      { label: "My auctions", href: "/account/auctions" },
      { label: "Auctions won" },
    ],
  },

  // ── Prices paths ─────────────────────────────────────────────────────
  {
    pattern: "/prices/:game",
    renderedBy: "page",
    steps: [
      { label: "Prices", href: "/prices" },
      { label: ":game" },
    ],
  },
  {
    pattern: "/prices/:game/:set",
    renderedBy: "page",
    steps: [
      { label: "Prices", href: "/prices" },
      { label: ":game", href: "/prices/:game" },
      { label: "Set :set" },
    ],
  },
  {
    pattern: "/prices/:game/:set/:number",
    renderedBy: "page",
    steps: [
      { label: "Prices", href: "/prices" },
      { label: ":game", href: "/prices/:game" },
      { label: "Set :set", href: "/prices/:game/:set" },
      { label: "#:number" },
    ],
  },
  {
    pattern: "/prices/:game/movers",
    renderedBy: "page",
    steps: [
      { label: "Prices", href: "/prices" },
      { label: ":game", href: "/prices/:game" },
      { label: "Movers" },
    ],
  },

  // ── Market paths ─────────────────────────────────────────────────────
  {
    pattern: "/market/lots/:id",
    renderedBy: "page",
    steps: [
      { label: "Market", href: "/market" },
      { label: "Lots", href: "/market/lots" },
      { label: "Lot #:id" },
    ],
  },
  {
    pattern: "/market/:sku",
    renderedBy: "page",
    steps: [
      { label: "Market", href: "/market" },
      { label: ":sku" },
    ],
  },

  // ── Auctions paths ───────────────────────────────────────────────────
  {
    pattern: "/auctions/:id",
    renderedBy: "page",
    steps: [
      { label: "Auctions", href: "/auctions" },
      { label: "#:id" },
    ],
  },
  {
    pattern: "/auctions/:id/read",
    renderedBy: "page",
    steps: [
      { label: "Auctions", href: "/auctions" },
      { label: "#:id", href: "/auctions/:id" },
      { label: "Read-only mirror" },
    ],
  },
  {
    pattern: "/auctions/sell",
    renderedBy: "global",
    steps: [
      { label: "Auctions", href: "/auctions" },
      { label: "Sell" },
    ],
  },

  // ── Trade-in paths ───────────────────────────────────────────────────
  {
    pattern: "/trade-in/bulk",
    renderedBy: "page",
    steps: [
      { label: "Trade-in", href: "/trade-in" },
      { label: "Bulk quote" },
    ],
  },
  {
    pattern: "/trade-in/bundle",
    renderedBy: "page",
    steps: [
      { label: "Trade-in", href: "/trade-in" },
      { label: "Bundle quote" },
    ],
  },
  {
    pattern: "/trade-in/custom-quote",
    renderedBy: "page",
    steps: [
      { label: "Trade-in", href: "/trade-in" },
      { label: "Custom quote" },
    ],
  },
  {
    pattern: "/trade-in/submit",
    renderedBy: "page",
    steps: [
      { label: "Trade-in", href: "/trade-in" },
      { label: "Submit" },
    ],
  },
  {
    pattern: "/trade-in/confirm/:ref",
    renderedBy: "page",
    steps: [
      { label: "Trade-in", href: "/trade-in" },
      { label: "Confirm quote :ref" },
    ],
  },
  {
    pattern: "/trade-in/quote/:ref",
    renderedBy: "page",
    steps: [
      { label: "Trade-in", href: "/trade-in" },
      { label: "Quote :ref" },
    ],
  },

  // ── Play paths ───────────────────────────────────────────────────────
  {
    pattern: "/play/casual",
    renderedBy: "section",
    steps: [{ label: "Play", href: "/play" }, { label: "Casual" }],
  },
  {
    pattern: "/play/compete",
    renderedBy: "section",
    steps: [{ label: "Play", href: "/play" }, { label: "Competitive" }],
  },
  {
    pattern: "/play/adventure",
    renderedBy: "section",
    steps: [{ label: "Play", href: "/play" }, { label: "Adventure" }],
  },
  {
    pattern: "/play/adventure/:levelId",
    renderedBy: "section",
    steps: [
      { label: "Play", href: "/play" },
      { label: "Adventure", href: "/play/adventure" },
      { label: "Level :levelId" },
    ],
  },
  {
    pattern: "/play/spec",
    renderedBy: "section",
    steps: [{ label: "Play", href: "/play" }, { label: "Spec" }],
  },
  {
    pattern: "/play/deck-check",
    renderedBy: "section",
    steps: [{ label: "Play", href: "/play" }, { label: "Deck check" }],
  },
  {
    pattern: "/play/welcome",
    renderedBy: "section",
    steps: [{ label: "Play", href: "/play" }, { label: "Welcome" }],
  },

  // ── Card detail paths ────────────────────────────────────────────────
  // /cards/:sku is a redirect page to /product/:sku (contact-surface
  // spec W4). The crumb keeps the /cards/* href so the chain matches
  // the address bar the visitor actually sees.
  {
    pattern: "/cards/:sku",
    renderedBy: "page",
    steps: [{ label: "Cards", href: "/catalog" }, { label: ":sku" }],
  },
  {
    pattern: "/cards/:sku/market",
    renderedBy: "page",
    steps: [
      { label: "Cards", href: "/catalog" },
      { label: ":sku", href: "/cards/:sku" },
      { label: "Market" },
    ],
  },

  // ── Methodology paths ────────────────────────────────────────────────
  {
    pattern: "/methodology/:slug",
    renderedBy: "section",
    steps: [
      { label: "Methodology", href: "/methodology" },
      { label: ":slug" },
    ],
  },

  // ── Verify paths ─────────────────────────────────────────────────────
  {
    pattern: "/verify/:section",
    renderedBy: "page",
    steps: [
      { label: "Verify", href: "/verify" },
      { label: ":section" },
    ],
  },
  {
    pattern: "/verify/draw/:id",
    renderedBy: "page",
    steps: [
      { label: "Verify", href: "/verify" },
      { label: "Draw :id" },
    ],
  },
  {
    pattern: "/verify/pull/:id",
    renderedBy: "page",
    steps: [
      { label: "Verify", href: "/verify" },
      { label: "Pull :id" },
    ],
  },

  // ── Agent guides ─────────────────────────────────────────────────────
  {
    pattern: "/agents/guides",
    renderedBy: "page",
    steps: [
      { label: "Agents", href: "/agents" },
      { label: "Guides" },
    ],
  },
  {
    pattern: "/agents/guides/:slug",
    renderedBy: "page",
    steps: [
      { label: "Agents", href: "/agents" },
      { label: "Guides", href: "/agents/guides" },
      { label: ":slug" },
    ],
  },

  // ── Other public detail paths ───────────────────────────────────────
  {
    pattern: "/c/:slug",
    renderedBy: "global",
    steps: [
      { label: "Community", href: "/community" },
      { label: "Collective :slug" },
    ],
  },
  {
    pattern: "/decks/:slug",
    renderedBy: "page",
    steps: [
      { label: "Decks", href: "/decks" },
      { label: ":slug" },
    ],
  },
  {
    pattern: "/product/:sku",
    renderedBy: "page",
    steps: [
      { label: "Catalog", href: "/catalog" },
      { label: ":sku" },
    ],
  },
  {
    pattern: "/rewards/mystery-boxes/:id",
    renderedBy: "page",
    steps: [
      { label: "Rewards", href: "/rewards" },
      { label: "Mystery box :id" },
    ],
  },
  {
    pattern: "/rewards/raffles/:id",
    renderedBy: "page",
    steps: [
      { label: "Rewards", href: "/rewards" },
      { label: "Raffle :id" },
    ],
  },

  // ── Public user profile ──────────────────────────────────────────────
  {
    pattern: "/u/:username",
    renderedBy: "global",
    steps: [{ label: "Community", href: "/community" }, { label: "@:username" }],
  },
  {
    pattern: "/u/:username/trust",
    renderedBy: "page",
    steps: [
      { label: "Community", href: "/community" },
      { label: "@:username", href: "/u/:username" },
      { label: "Trust" },
    ],
  },
];

/**
 * Parse a URL pattern (e.g. `/account/trades/:id`) into its segments.
 */
function patternSegments(pattern: string): string[] {
  return pattern.split("/").filter((s) => s.length > 0);
}

function decodeLabelToken(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Returns the breadcrumb steps for a given pathname, with `:slug` tokens
 * substituted by the actual segment values. Returns null if no pattern
 * matches — substrate-honest absence (caller renders nothing rather
 * than fabricating a chain).
 */
export function resolveBreadcrumbs(
  pathname: string,
  renderedBy?: BreadcrumbRenderer,
): BreadcrumbStep[] | null {
  const actualSegs = pathname.split("/").filter((s) => s.length > 0);
  if (actualSegs.length < 2) return null;

  // Score each pattern by segment-count match + static-segment count.
  let bestScore = -1;
  let best: { pattern: BreadcrumbPattern; subs: Record<string, string> } | null = null;

  for (const entry of BREADCRUMB_REGISTRY) {
    if (renderedBy && entry.renderedBy !== renderedBy) continue;
    const patSegs = patternSegments(entry.pattern);
    if (patSegs.length !== actualSegs.length) continue;

    let staticHits = 0;
    const subs: Record<string, string> = {};
    let match = true;
    for (let i = 0; i < patSegs.length; i++) {
      const ps = patSegs[i];
      const as = actualSegs[i];
      if (ps.startsWith(":")) {
        subs[ps.slice(1)] = as;
      } else if (ps === as) {
        staticHits++;
      } else {
        match = false;
        break;
      }
    }
    if (!match) continue;
    // Prefer more static segments (more specific patterns).
    if (staticHits > bestScore) {
      bestScore = staticHits;
      best = { pattern: entry, subs };
    }
  }

  if (!best) return null;

  // Substitute :slug tokens in label + href
  return best.pattern.steps.map((step) => {
    let label = step.label;
    let href = step.href;
    for (const [key, val] of Object.entries(best!.subs)) {
      const token = `:${key}`;
      label = label.split(token).join(decodeLabelToken(val));
      if (href) href = href.split(token).join(val);
    }
    return { label, ...(href ? { href } : {}) };
  });
}
