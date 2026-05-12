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
  // ── Provable fairness ──────────────────────────────────────────────
  {
    path: "/api/verify/chain",
    title: "Fairness chain",
    blurb: "The append-only Merkle digest chain. Every random outcome on the platform is committed and revealed here.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/digests",
    title: "Fairness digests (list)",
    blurb: "Index of every daily digest with its Merkle root and inclusion proofs.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/digests/[id]",
    title: "Fairness digest (one)",
    blurb: "A single digest with Merkle tree, inclusion proofs, source draws.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/pull/[id]",
    title: "Bounty pull verification",
    blurb: "Commit hash, revealed seed, rolled rarity, inclusion proof against the day's Merkle root.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/draw/[id]",
    title: "Verifiable draw",
    blurb: "Generic verifiable draws — raffles, mystery boxes, packs.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/fairness",
    title: "Fairness self-audit",
    blurb: "Chi-squared drift, observed-vs-expected rarity distributions, last-N pulls reconciliation.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/health",
    title: "Verify health",
    blurb: "Boolean liveness check for the verify subsystem.",
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
    blurb: "Every card in language-free form: cryptographic hashes, ratios, ISO 8601 + epoch time, typed graph edges.",
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

  // ── Leaderboards ───────────────────────────────────────────────────
  {
    path: "/api/leaderboards",
    title: "Leaderboards",
    blurb: "Trade leaderboards (top traders by volume, completion, trust). Per-user opt-out via preferences.",
    status: "partial",
    auth: "none",
  },
  {
    path: "/api/v1/leaderboards/full",
    title: "Leaderboards — full distribution",
    blurb: "Full ranking past the Top 20. The <Withholding> primitive on public Top 20 links here.",
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
        "/api/v1/* is the universal-representation surface. Unprefixed paths are platform-stable older surfaces. Every response carries _meta.spec_version.",
      time:
        "ISO 8601 with timezone offset, paired with Unix epoch milliseconds. Math-mirror endpoints distinguish @retrieved_at from @as_of at the record level; the envelope's _meta carries the response-level pair.",
      identity:
        "Cryptographic hashes (SHA-256 over canonical JSON) for math-mirror; UUIDs/strings for human-language endpoints. Both forms appear on every response.",
      sku_format:
        "/methodology/sku-standard — canonical <game>-<set>-<number>-<lang>[-<variant>]. See packages/sku/.",
      errors:
        '{ "error": { "code": "...", "message": "...", "request_id": "...", "docs"?: "..." } } with appropriate HTTP status. Blameless tone. See apps/storefront/src/lib/data-pantry/errors.ts.',
      rate_limits:
        "Most no-auth endpoints unlimited today. MCP gateway has per-agent-token limits. See /methodology/agents. Future: per-token rate limiting via packages/rate-limit (planned).",
      envelope:
        "All public responses wear the same { data, _meta } shape. See apps/storefront/src/lib/data-pantry/envelope.ts.",
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
