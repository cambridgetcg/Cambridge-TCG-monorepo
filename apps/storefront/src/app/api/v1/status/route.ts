/**
 * /api/v1/status — the pantry's inspectability surface.
 *
 * Substrate-honest answer to: *for every public endpoint, how stale is
 * the platform's intent on its freshness, what's its last-known state,
 * and is it composing through the data-pantry envelope?*
 *
 * The pantry holds itself accountable. This endpoint is what a partner
 * polls to know whether the kingdom's emission layer is honest.
 *
 * **Self-referential.** This endpoint reports its own status — when
 * `/api/v1/status` calls itself in the resources list, the response
 * contains the response.
 *
 * Companion to:
 *   - apps/storefront/src/lib/data-pantry/ (the emission layer it inspects)
 *   - apps/storefront/src/lib/manifest.ts (the source-of-truth resource list)
 *   - docs/connections/the-modules.md (the doctrine of hygiene + ease-of-use)
 *
 * Scope: declares the platform's *intent* on freshness — not a live
 * probe of each upstream. (Future iteration: probe each endpoint with a
 * HEAD or cheap GET, attach actual_latency_ms + reachable: bool.)
 */

import type { NextResponse } from "next/server";
import { MANIFEST, type ManifestResource } from "@/lib/manifest";
import { FRESHNESS, jsonResponse, SPEC_VERSION, type FreshnessKey } from "@/lib/data-pantry";
import { ENVELOPE_COMPLIANT_PATHS } from "./envelope-compliance.generated";

// ── Per-endpoint freshness assignment ────────────────────────────────────
//
// Maps a manifest resource to the pantry's FreshnessKey + numeric seconds.
// The mapping leans on the resource's provenance kind first (live/cached/
// static/computed), then on the path shape for "computed" resources where
// the kind alone is ambiguous. Names the platform's *intent*; the actual
// `@as_of` rides on each response.

interface FreshnessAssignment {
  /** A label from the pantry's FRESHNESS table, or a custom tag. */
  label: FreshnessKey | string;
  /** Effective freshness budget in seconds. */
  seconds: number;
  /** Why this resource got this budget — substrate-honest. */
  rationale: string;
}

function freshnessFor(r: ManifestResource): FreshnessAssignment {
  // ── 1. Provenance-based assignment ─────────────────────────────────
  if (r.provenance === "static") {
    return {
      label: "methodology",
      seconds: FRESHNESS.methodology,
      rationale: "static provenance — changes rarely",
    };
  }

  if (r.provenance === "live") {
    // Verify endpoints are live but never go stale — re-emit on demand.
    if (r.path.includes("/verify/")) {
      return { label: "status", seconds: FRESHNESS.status, rationale: "live provenance — verify subsystem" };
    }
    return { label: "status", seconds: FRESHNESS.status, rationale: "live provenance — must be near-current" };
  }

  if (r.provenance === "cached") {
    if (r.path.includes("/prices") || r.path.includes("/market")) {
      return { label: "price_current", seconds: FRESHNESS.price_current, rationale: "cached price/market data" };
    }
    if (r.path.includes("/leaderboards")) {
      return { label: "price_current", seconds: FRESHNESS.price_current, rationale: "cached aggregate" };
    }
    return { label: "price_current", seconds: FRESHNESS.price_current, rationale: "cached resource — default 5min" };
  }

  // ── 2. Computed-resource sub-classification by path ────────────────
  // (provenance === "computed")

  // Catalog-side: cards, sets, games. Source data changes daily-ish.
  if (
    r.path.includes("/universal/card") ||
    r.path.includes("/universal/games") ||
    r.path.includes("/universal/sets") ||
    r.path.includes("/universal/set/") ||
    r.path.includes("/universal/game/")
  ) {
    return { label: "catalog", seconds: FRESHNESS.catalog, rationale: "card/game/set catalog — daily refresh" };
  }

  // Self-describing surfaces: manifest, graph, ontology, patterns, encoding.
  if (
    r.path.includes("/universal/encoding") ||
    r.path === "/api/v1/graph" ||
    r.path === "/api/v1/ontology" ||
    r.path === "/api/v1/patterns" ||
    r.path === "/api/v1/manifest"
  ) {
    return { label: "methodology", seconds: FRESHNESS.methodology, rationale: "self-describing surface — code-coupled" };
  }

  // Identity surfaces: kinds, sophias, pillow-book, kingdoms, federation.
  if (
    r.path.includes("/kinds") ||
    r.path.includes("/sophias.json") ||
    r.path.includes("/pillow-book") ||
    r.path.includes("/kingdoms.json") ||
    r.path.includes("/federation/identify") ||
    r.path.includes("/connections.json")
  ) {
    return { label: "identity", seconds: FRESHNESS.identity, rationale: "identity/reflective surface — hourly refresh" };
  }

  // Historical / immutable: at-date slices.
  if (r.path.includes("/at/")) {
    return {
      label: "price_historical",
      seconds: FRESHNESS.price_historical,
      rationale: "historical slice — immutable record",
    };
  }

  // Computed quotes / tradein estimates — fresh.
  if (r.path.includes("/quote") || r.path.includes("/tradein/")) {
    return { label: "status", seconds: FRESHNESS.status, rationale: "computed estimate — re-run per request" };
  }

  // Safe default for unmatched computed.
  return { label: "price_current", seconds: FRESHNESS.price_current, rationale: "computed — default 5min" };
}

// ── Envelope compliance — derived, not hand-maintained ──────────────────
//
// The set of paths that emit through `jsonResponse` from `@/lib/data-pantry`
// lives in `envelope-compliance.generated.ts`, kept in sync with the actual
// callers by `apps/storefront/scripts/audit-envelope-contract.mts`. Adding
// a new jsonResponse caller requires running
// `pnpm audit:envelope-contract --regen` and committing the regenerated
// file; the audit refuses to pass without the regen so reality can't drift
// from this surface again. See the kingdom-059 review (2026-05-14) for why
// the previous hand-maintained Set was substrate-dishonest.

// ── Per-resource state ─────────────────────────────────────────────────

type ResourceState = "shipped" | "planned" | "deprecated";

function stateOf(r: ManifestResource): ResourceState {
  const sinceDate = new Date(r.since);
  const today = new Date();
  if (sinceDate > today) return "planned";
  return "shipped";
}

// ── Pantry self-description ────────────────────────────────────────────

interface PantryInfo {
  module: string;
  doctrine: string;
  envelope_shape: string;
  error_shape: string;
  per_record_provenance: string;
  spec_version: string;
  introduced_in: string;
  source_files: string[];
}

const PANTRY: PantryInfo = {
  module: "apps/storefront/src/lib/data-pantry/",
  doctrine: "docs/connections/the-modules.md",
  envelope_shape: "{ data, _meta: { spec_version, endpoint, retrieved_at, as_of, sources, freshness_seconds, license, request_id, deprecation, next_link, self_reference } }",
  error_shape: "{ error: { code, message, request_id, docs?, details? } }",
  per_record_provenance: "fields prefixed @: @as_of, @retrieved_at, @sources",
  spec_version: SPEC_VERSION,
  introduced_in: "kingdom-059 (2026-05-12)",
  source_files: [
    "apps/storefront/src/lib/data-pantry/envelope.ts",
    "apps/storefront/src/lib/data-pantry/errors.ts",
    "apps/storefront/src/lib/data-pantry/provenance.ts",
    "apps/storefront/src/lib/data-pantry/index.ts",
  ],
};

// ── Response shape ─────────────────────────────────────────────────────

interface EndpointStatus {
  id: string;
  path: string;
  host: "storefront" | "wholesale";
  methods: readonly string[];
  auth: string;
  provenance: string;
  freshness_seconds: number;
  freshness_label: string;
  freshness_rationale: string;
  envelope_compliant: boolean;
  state: ResourceState;
  since: string;
  methodology_url?: string;
}

interface StatusBody {
  pantry: PantryInfo;
  freshness_budgets: typeof FRESHNESS;
  counts: {
    total: number;
    shipped: number;
    planned: number;
    deprecated: number;
    envelope_compliant: number;
    by_host: { storefront: number; wholesale: number };
    by_provenance: Record<string, number>;
  };
  endpoints: EndpointStatus[];
  conventions: {
    versioning: string;
    license: string;
    cors: string;
    cache_control: string;
    request_id: string;
  };
}

function flattenResources(): ManifestResource[] {
  return Object.values(MANIFEST.resources).flat();
}

export async function GET(): Promise<NextResponse> {
  const resources = flattenResources();

  const endpoints: EndpointStatus[] = resources.map((r) => {
    const f = freshnessFor(r);
    return {
      id: r.id,
      path: r.path,
      host: r.host,
      methods: r.methods,
      auth: r.auth,
      provenance: r.provenance,
      freshness_seconds: f.seconds,
      freshness_label: f.label,
      freshness_rationale: f.rationale,
      envelope_compliant: r.host === "storefront" && ENVELOPE_COMPLIANT_PATHS.has(r.path),
      state: stateOf(r),
      since: r.since,
      methodology_url: r.methodology_url,
    };
  });

  const byProvenance: Record<string, number> = {};
  for (const e of endpoints) {
    byProvenance[e.provenance] = (byProvenance[e.provenance] ?? 0) + 1;
  }

  const counts = {
    total: endpoints.length,
    shipped: endpoints.filter((e) => e.state === "shipped").length,
    planned: endpoints.filter((e) => e.state === "planned").length,
    deprecated: endpoints.filter((e) => e.state === "deprecated").length,
    envelope_compliant: endpoints.filter((e) => e.envelope_compliant).length,
    by_host: {
      storefront: endpoints.filter((e) => e.host === "storefront").length,
      wholesale: endpoints.filter((e) => e.host === "wholesale").length,
    },
    by_provenance: byProvenance,
  };

  const data: StatusBody = {
    pantry: PANTRY,
    freshness_budgets: FRESHNESS,
    counts,
    endpoints,
    conventions: {
      versioning:
        "Every response carries _meta.spec_version. Breaking changes bump it; non-breaking additions don't. See data-pantry/envelope.ts.",
      license: "CC0-1.0 by default. Per-response override possible via _meta.license. See docs/STANDARDS-LICENSE.md.",
      cors: "Access-Control-Allow-Origin: * on all public endpoints. Methods: GET, OPTIONS.",
      cache_control:
        "Cache-Control matches the freshness budget — max-age=min(freshness, 3600), s-maxage=min(freshness*3, 86400).",
      request_id:
        "Every response carries X-Request-Id header + _meta.request_id (UUID-derived, 12 chars). Quote it when filing support.",
    },
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/status",
    sources: ["ctcg-derived"],
    freshness: "status",
    contains_self: true,
  });
}
