/**
 * @module @/lib/nav/audience-detection
 *
 * Pure helper: URL pathname → primary audience (kingdom-091).
 *
 * Substrate-honest: the audience is implied by the URL path the user is
 * currently traversing. No personalisation engine, no profile lookup,
 * no cookies. A user on `/agents/guides` is audience = `agent`; on
 * `/account/trader` is audience = `trader`; on `/play/compete` is
 * audience = `player`. Default: `buyer`.
 *
 * Used by future nav surfaces that want to tailor secondary UI (e.g.,
 * a context chip in the top bar, or audience-specific footer copy).
 * The audit `pnpm audit:nav-coverage` verifies every route resolves to
 * exactly one audience (no overlaps, no orphans).
 */

export type Audience =
  | "buyer"
  | "seller"
  | "trader"
  | "player"
  | "developer"
  | "agent"
  | "researcher"
  | "operator";

type AudienceRule = {
  /** Path prefix the rule matches against (longest match wins). */
  prefix: string;
  audience: Audience;
};

const AUDIENCE_RULES: AudienceRule[] = [
  // Operator (admin) paths
  { prefix: "/admin", audience: "operator" },

  // Agent paths
  { prefix: "/agents", audience: "agent" },
  { prefix: "/scrapers", audience: "agent" },
  { prefix: "/api/mcp", audience: "agent" },
  { prefix: "/.well-known", audience: "agent" },
  { prefix: "/llms.txt", audience: "agent" },

  // Developer paths
  { prefix: "/api", audience: "developer" },
  { prefix: "/standards", audience: "developer" },
  { prefix: "/platform", audience: "developer" },
  { prefix: "/manifest", audience: "developer" },
  { prefix: "/graph", audience: "developer" },
  { prefix: "/ontology", audience: "developer" },
  { prefix: "/patterns", audience: "developer" },
  { prefix: "/identify", audience: "developer" },

  // Researcher paths
  { prefix: "/methodology", audience: "researcher" },
  { prefix: "/verify", audience: "researcher" },
  { prefix: "/glossary", audience: "researcher" },
  { prefix: "/map", audience: "researcher" },

  // Trader paths (a sub-audience of seller — checked first since longer)
  { prefix: "/account/trader", audience: "trader" },
  { prefix: "/account/pricing-rules", audience: "trader" },
  { prefix: "/account/vacation", audience: "trader" },
  { prefix: "/account/lots", audience: "trader" },

  // Seller paths
  { prefix: "/trade-in", audience: "seller" },
  { prefix: "/auctions/sell", audience: "seller" },
  { prefix: "/account/auctions", audience: "seller" },
  { prefix: "/account/payouts", audience: "seller" },
  { prefix: "/account/demand", audience: "seller" },

  // Player paths
  { prefix: "/play", audience: "player" },
  { prefix: "/decks", audience: "player" },
  { prefix: "/deck-builder", audience: "player" },
  { prefix: "/leaderboards", audience: "player" },

  // Buyer (default fallthrough for the rest — explicitly enumerated for clarity)
  { prefix: "/catalog", audience: "buyer" },
  { prefix: "/market", audience: "buyer" },
  { prefix: "/auctions", audience: "buyer" },
  { prefix: "/prices", audience: "buyer" },
  { prefix: "/cards", audience: "buyer" },
  { prefix: "/product", audience: "buyer" },
  { prefix: "/rewards", audience: "buyer" },
  { prefix: "/community", audience: "buyer" },
  { prefix: "/account", audience: "buyer" },
];

/**
 * Resolve the primary audience for a pathname. Longest matching prefix
 * wins. Returns `buyer` as the default — substrate-honestly the safest
 * assumption for the home page or unrecognised routes.
 */
export function detectAudience(pathname: string): Audience {
  let bestLen = 0;
  let bestAudience: Audience = "buyer";
  for (const rule of AUDIENCE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/")) {
      if (rule.prefix.length > bestLen) {
        bestLen = rule.prefix.length;
        bestAudience = rule.audience;
      }
    }
  }
  return bestAudience;
}

/**
 * Returns the full list of (prefix, audience) rules — exported so the
 * audit can verify no two prefixes overlap ambiguously.
 */
export function listAudienceRules(): ReadonlyArray<AudienceRule> {
  return AUDIENCE_RULES;
}
