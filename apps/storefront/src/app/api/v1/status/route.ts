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
import { pilgrimageFragmentFor } from "@/lib/agents/pilgrimage";
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
//
// Known limit of the derivation: the audit detects the *presence* of a
// jsonResponse caller per route file, not that every response path in that
// file flows through it. A route whose GET is enveloped but whose POST or
// early auth/error branches return bare NextResponse.json still lands in
// the set. Until the audit checks per-response-path (and can emit a
// "partial" state for mixed routes), "compliant" certifies the primary
// read path only — the wire copy in `contract_states` says so.

// ── Per-resource contract state ────────────────────────────────────────
//
// The old boolean `envelope_compliant` flattened two different truths:
// "this endpoint deliberately speaks a different dialect" (the universal
// @-encoding, the wholesale-host JSON, HTML pages, external discovery
// specs) and "this endpoint should speak the envelope but hasn't migrated
// yet". An agent reading the status surface couldn't tell which contract
// to expect where — the self-report under-sold deliberate design as debt
// (P5, agent-experience review 2026-07-05). Three states now:
//
//   compliant             — composes through jsonResponse ({data,_meta}).
//   alternative-contract  — a DELIBERATE non-envelope dialect.
//   pending               — envelope adoption owed, not yet done.
//
// `envelope_compliant: boolean` stays for existing readers; it is exactly
// (contract_state === "compliant").

export type ContractState = "compliant" | "alternative-contract" | "pending";

function contractStateOf(r: ManifestResource, envelopeCompliant: boolean): ContractState {
  // Explicit manifest annotation wins (used where derivation can't see
  // intent — e.g. the _envelope dialect on the self-describing layers).
  if (r.contract === "envelope") return "compliant";
  if (r.contract === "alternative") return "alternative-contract";
  if (r.contract === "pending") return "pending";

  if (envelopeCompliant) return "compliant";

  // Deliberate alternative dialects, derivable from typed facts:
  if (r.host === "wholesale") return "alternative-contract"; // B2B dialect, bearer-gated
  if (r.modalities.includes("math") || r.modalities.includes("xenoform")) {
    return "alternative-contract"; // universal @-encoding
  }
  if (!r.modalities.includes("json")) return "alternative-contract"; // HTML / plain-text modality
  if (r.modalities.includes("markdown") || r.modalities.includes("anthropic")) {
    return "alternative-contract"; // multi-format family (vendor system-message shapes)
  }
  if (
    r.path.startsWith("/.well-known/") ||
    r.path === "/api/openapi.json" ||
    r.path === "/robots.txt" ||
    r.path === "/llms.txt" ||
    r.path === "/data/catalog.jsonl" ||
    r.path.startsWith("/api/at/")
  ) {
    return "alternative-contract"; // external spec / bulk stream
  }

  return "pending";
}

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
  /**
   * Kept for existing readers; equals (contract_state === "compliant").
   * Presence-derived per route file — see the derivation-limit note above:
   * true means the route's primary read path is enveloped, not that every
   * response path (POST/error branches) carries { data, _meta }.
   */
  envelope_compliant: boolean;
  /** compliant | alternative-contract | pending — see contractStateOf. */
  contract_state: ContractState;
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
    by_contract: Record<ContractState, number>;
    by_host: { storefront: number; wholesale: number };
    by_provenance: Record<string, number>;
  };
  contract_states: Record<ContractState, string>;
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

// ISR matched to the endpoint's own declared budget (FRESHNESS.status = 30s):
// at most one full render per 30s instead of per request, so agents with
// short timeouts stop eating the serverless cold-start tail. Serving a
// ≤30s-old snapshot is exactly what _meta.freshness already promises.
export const revalidate = 30;

export async function GET(): Promise<NextResponse> {
  const resources = flattenResources();

  const endpoints: EndpointStatus[] = resources.map((r) => {
    const f = freshnessFor(r);
    const isEnvelope = r.host === "storefront" && ENVELOPE_COMPLIANT_PATHS.has(r.path);
    const contractState = contractStateOf(r, isEnvelope);
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
      envelope_compliant: contractState === "compliant",
      contract_state: contractState,
      state: stateOf(r),
      since: r.since,
      methodology_url: r.methodology_url,
    };
  });

  const byProvenance: Record<string, number> = {};
  for (const e of endpoints) {
    byProvenance[e.provenance] = (byProvenance[e.provenance] ?? 0) + 1;
  }

  const byContract: Record<ContractState, number> = {
    "compliant": 0,
    "alternative-contract": 0,
    "pending": 0,
  };
  for (const e of endpoints) byContract[e.contract_state]++;

  const counts = {
    total: endpoints.length,
    shipped: endpoints.filter((e) => e.state === "shipped").length,
    planned: endpoints.filter((e) => e.state === "planned").length,
    deprecated: endpoints.filter((e) => e.state === "deprecated").length,
    envelope_compliant: endpoints.filter((e) => e.envelope_compliant).length,
    by_contract: byContract,
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
    contract_states: {
      "compliant":
        "Composes through jsonResponse — the { data, _meta } pantry envelope per packages/data-spec. Derived per route file (the audit checks the file calls jsonResponse), which certifies the primary read path; on routes that also expose POST/witness methods or early auth/error branches, individual responses may still be bare JSON without _meta. Treat a missing _meta as a non-enveloped path on that route, not as platform breakage.",
      "alternative-contract":
        "A deliberate non-envelope dialect: universal @-encoding (math-mirror), wholesale-host B2B JSON, HTML/plain-text modality surfaces, multi-format vendor shapes, or external discovery specs (.well-known, openapi, robots, llms.txt, bulk JSONL). Design, not debt.",
      "pending":
        "Should speak the pantry envelope but hasn't migrated yet. Honest debt; the list is the migration worklist.",
    },
    endpoints,
    conventions: {
      versioning:
        "Every response carries _meta.spec_version. Breaking changes bump it; non-breaking additions don't. See data-pantry/envelope.ts.",
      license: "NOASSERTION when payload rights are undeclared. All-CC0 declared sources may resolve to CC0-1.0; mixed or restrictive source rights prevent a CC0 aggregate claim.",
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
    // Seven-Layer Pilgrimage stamp 7/7 — the final layer. Deterministic,
    // stateless, refusable. See lib/agents/pilgrimage.ts + /api/v1/passport.
    extra_meta: { pilgrimage: pilgrimageFragmentFor("/api/v1/status") },
  });
}
