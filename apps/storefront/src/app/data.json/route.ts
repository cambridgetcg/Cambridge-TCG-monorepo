/**
 * /data.json — the open-substrate index, as itself an open endpoint.
 *
 * The human-readable sibling lives at `/data` (`apps/storefront/src/app/data/page.tsx`).
 * This route emits the same content as JSON so machine readers (agents,
 * archivists, hyperliteral readers) can consume the index without
 * scraping the HTML.
 *
 * **Self-referential closure.** The substrate-of-openness includes
 * itself. `/data.json` lists `/data.json` as a shipped no-auth endpoint;
 * an agent that fetches /data.json discovers /data.json among the
 * endpoints it just successfully called. The recipe contains the recipe.
 *
 * **Emits through the data-pantry.** This endpoint is also the first
 * proof-of-pattern for `apps/storefront/src/lib/data-pantry/` —
 * envelope + provenance + freshness + license + request-id, by
 * construction. See `docs/connections/the-modules.md` for the doctrine.
 *
 * Companion to:
 *   - apps/storefront/src/app/data/page.tsx (human-readable sibling)
 *   - docs/connections/the-open-substrate.md (the doctrine)
 *   - docs/connections/the-nesting.md (the form — mutual citation)
 *   - docs/connections/the-modules.md (the emission layer it composes through)
 *
 * Substrate-honest: the same status enums and substrate of facts as
 * the HTML version; if the two diverge, that's a bug.
 */

import type { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

type Status = "shipped" | "partial" | "planned";

interface EndpointEntry {
  path: string;
  title: string;
  blurb: string;
  status: Status;
  auth: "none" | "bearer" | "session";
  methodology_page?: string;
  shape?: string;
}

// Single source of truth — kept in sync with /data (page.tsx).
// A future refactor lifts both surfaces to read from one shared file.
const ENDPOINTS: EndpointEntry[] = [
  // ── Draw receipts and digest consistency ──────────────────────────
  {
    path: "/api/verify/chain",
    title: "Draw digest chain",
    blurb: "Hash-linked digest batches over revealed bounty_pulls and verifiable_draws collected by the job; standalone raffle proofs are excluded. The live feed is internally recomputable, while rewrite detection requires an earlier tip retained outside Cambridge TCG.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/digests",
    title: "Draw digests (list)",
    blurb: "Index of digest roots and window metadata over rows collected by the digest job; not a complete randomness ledger or an external pre-roll witness.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/digests/[id]",
    title: "Draw digest (one)",
    blurb: "One root plus the full leaf-hash array and window metadata. Source draw records and precomputed inclusion paths are not returned; callers can recompute the root.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/pull/[id]",
    title: "Bounty pull receipt",
    blurb: "Commitment, revealed server seed, outcome, and digest reference. Safe seeds reproduce the stored outcome but do not prove pre-roll input selection; legacy account-bearing seeds are withheld from non-owners, making those public checks partial.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/draw/[id]",
    title: "Shared weighted-draw receipt",
    blurb: "Receipt for shared weighted-draw rows such as mystery boxes, packs, and spins; raffles use /api/rewards/raffles/[id]/proof. Exact replay requires a visible client seed and the ordered-weight array stored by newer receipts; legacy rows without it remain partial.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/rewards/raffles/[id]/proof",
    title: "Raffle draw receipt",
    blurb: "Separate raffle receipt. The commitment is stored at raffle creation and exposed once active, but has no independent anchor. The public response omits the participant manifest, so it cannot fully recompute winner mapping.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/fairness",
    title: "Observed draw distributions",
    blurb: "Thresholded chi-squared and observed-vs-expected distributions. Low-volume exact counts are withheld and internal reward keys use response-local labels; this does not prove unbiased input selection.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/health",
    title: "Verify health",
    blurb: "Detailed aggregate digest cadence, tip, receipt-consistency audit series, and open distribution alerts. Draw ids and raw alert summaries are omitted.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/compute",
    title: "Compute primitives",
    blurb: "Re-run the commit-reveal math against your own inputs.",
    status: "shipped",
    auth: "none",
  },

  // ── Universal representation (math-mirror) ─────────────────────────
  {
    path: "/api/v1/universal/card/[sku]",
    title: "Universal card (math-mirror)",
    blurb: "Planned math-first card representation using content hashes, ratios, ISO 8601 + epoch time, and typed graph edges.",
    status: "planned",
    auth: "none",
    methodology_page: "/methodology/universal-representation",
    shape: "JSON: { id, hash, magnitudes: {...}, edges: [...], retrieved_at, as_of }",
  },
  {
    path: "/api/v1/universal/card/[sku]/at/[YYYY-MM-DD]",
    title: "Universal card — temporal slice",
    blurb: "Math-mirror card as it was at a past date. @retrieved_at distinct from @as_of.",
    status: "planned",
    auth: "none",
    methodology_page: "/methodology/universal-representation",
  },
  {
    path: "/api/v1/universal/card/[sku]/causes",
    title: "Universal card — dependency graph",
    blurb: "Directed graph of every input the displayed value depends on. For the Causal-First.",
    status: "planned",
    auth: "none",
  },
  {
    path: "/api/v1/universal/edges",
    title: "Universal edges",
    blurb: "Bare typed-edge graph. For the Topology-Less.",
    status: "planned",
    auth: "none",
  },
  {
    path: "/api/v1/universal/games",
    title: "Universal games",
    blurb: "Every TCG the platform supports, math-mirror form. Card-count, set-count, first-seen.",
    status: "planned",
    auth: "none",
  },
  {
    path: "/api/v1/universal/sets/[game]",
    title: "Universal sets",
    blurb: "Every set in a game, math-mirror form.",
    status: "planned",
    auth: "none",
  },

  // ── Agent surface ──────────────────────────────────────────────────
  {
    path: "/api/mcp",
    title: "MCP gateway",
    blurb: "Bearer-token authenticated agent gateway. Resolves to (agent_id, operated_by_user_id).",
    status: "shipped",
    auth: "bearer",
    methodology_page: "/methodology/agents",
  },

  // ── Market activity ────────────────────────────────────────────────
  {
    path: "/api/leaderboards",
    title: "Market ranking publication status",
    blurb: "Reports the current pause on human rankings and card aggregates derived from completed trades. It publishes no ranking rows. Resumption requires versioned, purpose-specific publication receipts and one delayed, coarse release process.",
    status: "partial",
    auth: "none",
  },
  {
    path: "/api/v1/leaderboards/full",
    title: "Human rankings — full distribution",
    blurb: "Not available. A future ranking requires its own versioned publication choice; public-profile publication is a different purpose.",
    status: "planned",
    auth: "none",
  },

  // ── Methodology corpus ─────────────────────────────────────────────
  {
    path: "/methodology",
    title: "Methodology hub",
    blurb: "Every value the platform computes about an account, documented with formula, inputs, source-code path.",
    status: "shipped",
    auth: "none",
  },

  // ── Pantry inspectability ──────────────────────────────────────────
  {
    path: "/api/v1/status",
    title: "Pantry status",
    blurb: "Joins every public endpoint in the manifest with its freshness budget, envelope-compliance, and last-known state. The platform's substrate-honest declaration of its own emission layer.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/sources",
    title: "Upstream sources",
    blurb: "The ingestion-side inverse of /api/v1/status — every source registered in @cambridge-tcg/data-ingest with meta (upstream URL, access method, license tier, freshness, game coverage, ToS notes, status). The catalog of where data comes from.",
    status: "shipped",
    auth: "none",
  },

  // ── This endpoint, naming itself ───────────────────────────────────
  {
    path: "/data.json",
    title: "Open data index (machine-readable)",
    blurb: "This endpoint. The substrate-of-openness as itself an open endpoint. Self-referential closure: the index of open endpoints includes itself.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/data",
    title: "Open data index (human-readable)",
    blurb: "Public, no-auth, comprehensive HTML index. The sign on the door.",
    status: "shipped",
    auth: "none",
  },
];

interface DataIndex {
  doctrine: {
    open_substrate: string;
    welcoming: string;
    blind_spots: string;
    nesting: string;
    modules: string;
  };
  conventions: {
    versioning: string;
    time: string;
    identity: string;
    sku_format: string;
    errors: string;
    rate_limits: string;
    envelope: string;
  };
  counts: {
    shipped: number;
    partial: number;
    planned: number;
    total: number;
  };
  endpoints: EndpointEntry[];
}

export async function GET(): Promise<NextResponse> {
  const counts = {
    shipped: ENDPOINTS.filter((e) => e.status === "shipped").length,
    partial: ENDPOINTS.filter((e) => e.status === "partial").length,
    planned: ENDPOINTS.filter((e) => e.status === "planned").length,
    total: ENDPOINTS.length,
  };

  const data: DataIndex = {
    doctrine: {
      open_substrate: "docs/connections/the-open-substrate.md",
      welcoming: "/methodology/welcoming",
      blind_spots: "docs/connections/the-blind-spots.md",
      nesting: "docs/connections/the-nesting.md",
      modules: "docs/connections/the-modules.md",
    },
    conventions: {
      versioning:
        "/api/v1/* contains versioned routes, including universal-representation surfaces. Unprefixed routes are older contracts. Response shapes vary; only envelope-based responses carry _meta.spec_version.",
      time:
        "JSON timestamps are normally ISO 8601 strings. Only endpoints that document it also provide Unix epoch fields or distinguish @retrieved_at from @as_of; older routes do not all carry those pairs.",
      identity:
        "Identifier shapes are endpoint-specific. Card resources may use string SKUs; math-mirror resources may include a SHA-256 hash of canonical public content. Public person and transaction projections omit internal account identifiers. No identifier form appears on every response.",
      sku_format:
        "/methodology/sku-standard — canonical <game>-<set>-<number>-<lang>[-<variant>]. See packages/sku/.",
      errors:
        "HTTP status is authoritative. Older routes may return a string in error; envelope-based routes may return a structured code and message. Inspect each endpoint's documented shape.",
      rate_limits:
        "Limits vary and some public routes do not publish a number. Absence is not permission for unbounded traffic. The MCP gateway documents its agent-key limit at /methodology/agents.",
      envelope:
        "Only routes using the data-pantry envelope return { data, _meta }; older public routes keep their existing shapes. See each endpoint entry and apps/storefront/src/lib/data-pantry/envelope.ts.",
    },
    counts,
    endpoints: ENDPOINTS,
  };

  return jsonResponse({
    data,
    endpoint: "/data.json",
    sources: ["ctcg-derived"],
    freshness: 300,
    contains_self: true,
  });
}
