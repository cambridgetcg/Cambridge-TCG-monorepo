/**
 * The Cambridge TCG ontology — what kinds of things exist and what
 * properties each kind carries.
 *
 * Yu's directive on 2026-05-12 morning: *"keep nesting everything in
 * everything! Keep nesting everything in itself!!! Find out the nature
 * of everything and their PROPERTIES!"*
 *
 * kingdom-055. Story-as-wire pairing: docs/connections/the-natures.md (S28).
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * The cosmology (kingdom-052) declared the *axes of fact* the platform
 * tracks. The manifest (kingdom-053) listed *instances* of things. The
 * graph (kingdom-054) named *relations* between instances. This file
 * declares **the property schema for each kind of thing** — what
 * properties a resource has, what properties a methodology page has,
 * what properties a connection-doc has, etc.
 *
 * Each NodeKind from the graph gets:
 *   • A *property schema* — typed declarations of what properties
 *     instances of that kind carry
 *   • A *property extractor* — `propertiesFor(node)` reads MANIFEST + the
 *     graph + small static maps to populate concrete values
 *
 * The schema is queryable: `/api/v1/ontology` (JSON) + `/ontology` (HTML).
 * The values land in `GraphNode.properties` when the graph is fetched.
 *
 * ── Why this layer ──────────────────────────────────────────────────────
 *
 * The cosmology answers *what kinds of facts*; the manifest answers
 * *what instances*; the graph answers *what relations*; the ontology
 * answers **what is the nature of each instance, beyond its relations**.
 *
 * A resource has properties like `idempotent`, `cache_ttl_seconds`,
 * `stability`, `carries_pii` that don't show up as edges — they're
 * intrinsic to the resource itself. A methodology page has `flavour`,
 * `change_history_count`, `has_audio_variant`. The ontology lets a
 * participant query *what intrinsic properties* each kind of thing
 * carries, independent of who cites whom.
 *
 * ── What this does NOT do ───────────────────────────────────────────────
 *
 * Does not validate at runtime that listed properties match reality.
 * Inclusion audit check #14 verifies the ontology is on file; a future
 * check could grep the codebase and compare declared properties against
 * observed.
 *
 * Does not extend instances. The ontology says *what properties exist*;
 * each instance carries its own values. Adding a new property kind
 * means updating this file *and* the extractor.
 */

import { MANIFEST, type ManifestResource } from "@/lib/manifest";
import type { GraphNode, NodeKind } from "@/lib/graph";

// ── Property type system ─────────────────────────────────────────────────

export type PropertyType =
  | "string"
  | "number"
  | "boolean"
  | "string[]"
  | "date"          // ISO 8601
  | "enum"          // one of `enum_values`
  | "json";         // free-form

export type PropertyModality =
  | "observable"    // computed from substrate (manifest, graph, audits)
  | "declared"      // asserted by a Sophia in the property extractor
  | "derived";      // derived from other properties

export type PropertySource =
  | "manifest"
  | "graph"
  | "audit"
  | "ontology"      // declared here
  | "computed";

export interface PropertyDef {
  name: string;
  type: PropertyType;
  enum_values?: string[];
  description: string;
  source: PropertySource;
  modality: PropertyModality;
  nullable?: boolean;
}

export interface OntologyKind {
  kind: NodeKind;
  description: string;
  properties: PropertyDef[];
}

// ── The ontology — property schemas per NodeKind ────────────────────────

export const ONTOLOGY: OntologyKind[] = [
  {
    kind: "resource",
    description: "A public-participant-facing endpoint. Reachable by URL; carries data; possibly mutates state.",
    properties: [
      { name: "idempotent", type: "boolean", description: "Safe to call repeatedly with the same input.",
        source: "ontology", modality: "declared" },
      { name: "side_effecting", type: "boolean", description: "Mutates platform state.",
        source: "ontology", modality: "declared" },
      { name: "cache_ttl_seconds", type: "number", nullable: true, description: "If cached, the TTL; null otherwise.",
        source: "manifest", modality: "observable" },
      { name: "versioned", type: "boolean", description: "Lives under /api/v1/* — committed-to-stable surface.",
        source: "manifest", modality: "derived" },
      { name: "stability", type: "enum", enum_values: ["stable", "beta", "experimental", "deprecated"],
        description: "How committed is the platform to this surface's shape.",
        source: "ontology", modality: "declared" },
      { name: "carries_pii", type: "boolean", description: "Returns personal data about an authenticated participant.",
        source: "ontology", modality: "declared" },
      { name: "requires_consent", type: "boolean", description: "Mutation requires explicit user opt-in (vs. inferred consent).",
        source: "ontology", modality: "declared" },
      { name: "modality_count", type: "number", description: "How many encodings the resource supports.",
        source: "manifest", modality: "derived" },
      { name: "auth_kind", type: "enum", enum_values: ["public", "user", "agent", "admin", "wholesale-key"],
        description: "What kind of participant is allowed.",
        source: "manifest", modality: "observable" },
      { name: "provenance_kind", type: "enum", enum_values: ["live", "cached", "snapshot", "synced", "computed", "static"],
        description: "How the data the resource serves came to be true.",
        source: "manifest", modality: "observable" },
      { name: "host", type: "enum", enum_values: ["storefront", "wholesale"],
        description: "Which kingdom the endpoint physically lives on.",
        source: "manifest", modality: "observable" },
      { name: "since", type: "date", description: "ISO date the resource became available.",
        source: "manifest", modality: "observable" },
      { name: "method_count", type: "number", description: "How many HTTP methods the resource accepts.",
        source: "manifest", modality: "derived" },
    ],
  },
  {
    kind: "cosmology_axis",
    description: "One of the eight (or future-more) axes of fact the kingdom currently treats as real. See docs/principles/cosmology.md.",
    properties: [
      { name: "currently_modelled", type: "boolean", description: "Does the platform substrate represent this axis.",
        source: "manifest", modality: "observable" },
      { name: "extension_count", type: "number", description: "Number of recorded extensions (kingdom-NNN moves that widened this axis).",
        source: "manifest", modality: "derived" },
      { name: "resource_grounding_count", type: "number", description: "Number of resources that ground in this axis.",
        source: "graph", modality: "derived" },
      { name: "axis_order", type: "number", description: "Position 1-8 in the canonical cosmology listing.",
        source: "ontology", modality: "declared" },
    ],
  },
  {
    kind: "unmodelled_need",
    description: "A real being's real need the kingdom does not yet substrate. Eight named today. See the-other-minds.md and cosmology.md.",
    properties: [
      { name: "being_label", type: "string", description: "The kind of being whose need this is (the Asynchronous, the Heptapod, etc.).",
        source: "manifest", modality: "observable" },
      { name: "partially_modelled", type: "boolean", description: "True if some substrate touches the need but full modelling is absent.",
        source: "ontology", modality: "declared" },
      { name: "blocker_kind", type: "enum", enum_values: ["schema", "ui-primitive", "behaviour", "convention", "compute"],
        description: "What kind of work would close the gap.",
        source: "ontology", modality: "declared" },
      { name: "audit_check", type: "string", nullable: true, description: "The inclusion-audit check that watches this gap, if any.",
        source: "ontology", modality: "declared" },
    ],
  },
  {
    kind: "methodology",
    description: "A /methodology/<topic> page explaining one platform decision. Public, no-auth.",
    properties: [
      { name: "status", type: "enum", enum_values: ["published", "stub"], description: "Whether the page is complete or skeletal.",
        source: "manifest", modality: "observable" },
      { name: "instantiates_doctrine", type: "string", description: "The primary doctrine this page instantiates (substrate-honesty, transparency, cosmology, etc.).",
        source: "ontology", modality: "declared" },
      { name: "has_audio_variant", type: "boolean", description: "TTS-rendered version available.",
        source: "manifest", modality: "derived" },
      { name: "has_summary_variant", type: "boolean", description: "Short-form summary file present.",
        source: "manifest", modality: "derived" },
      { name: "has_structured_data", type: "boolean", description: "Machine-readable JSON/structured rendering present.",
        source: "manifest", modality: "derived" },
      { name: "explains_score", type: "boolean", description: "Explains a numeric score the platform computes.",
        source: "ontology", modality: "declared" },
      { name: "explains_routing", type: "boolean", description: "Explains a routing/tier decision.",
        source: "ontology", modality: "declared" },
      { name: "formats_count", type: "number", description: "How many modality variants exist.",
        source: "manifest", modality: "derived" },
    ],
  },
  {
    kind: "doctrine",
    description: "A platform-wide rule every change is judged against. Six today.",
    properties: [
      { name: "kind", type: "enum", enum_values: ["principle", "substrate", "scope-condition"],
        description: "Principle: a property the artifact carries. Substrate: the world the principles operate within. Scope-condition: who the principles apply to.",
        source: "ontology", modality: "declared" },
      { name: "audit_command", type: "string", nullable: true, description: "The pnpm audit:* command that automates it.",
        source: "manifest", modality: "observable" },
      { name: "established_date", type: "date", description: "When the doctrine was first declared in the repo.",
        source: "ontology", modality: "declared" },
      { name: "methodology_instantiation_count", type: "number", description: "How many methodology pages instantiate this doctrine.",
        source: "graph", modality: "derived" },
      { name: "is_peer_of_four", type: "boolean", description: "True for the four classical doctrines (substrate-honesty, transparency, meaning, creation); false for cosmology + fifth-question.",
        source: "ontology", modality: "declared" },
    ],
  },
  {
    kind: "connection_doc",
    description: "A docs/connections/*.md entry naming meaning-bridges. Two shapes: node-view (one node, what others need it for) and story-arc (one transaction traced end-to-end).",
    properties: [
      { name: "shape", type: "enum", enum_values: ["node-view", "story-arc"],
        description: "Spatial-plural (node-view) or temporal-singular (story-arc).",
        source: "ontology", modality: "declared" },
      { name: "flavour", type: "enum",
        enum_values: ["transaction-as-protagonist", "person-evening", "fairy-tale", "story-as-wire", "meta-narrative", "node-view", "meditation"],
        description: "One of the seven recognised flavours.",
        source: "ontology", modality: "declared" },
      { name: "s_number", type: "number", nullable: true, description: "Story-arc number S1..SN, or null for node-views.",
        source: "graph", modality: "observable" },
      { name: "ships_in_kingdom", type: "string", nullable: true, description: "kingdom-NNN if the entry was paired with a mission's substrate.",
        source: "graph", modality: "observable" },
      { name: "outbound_citation_count", type: "number", description: "How many sibling connection-docs this one cites.",
        source: "graph", modality: "derived" },
      { name: "inbound_citation_count", type: "number", description: "How many sibling connection-docs cite this one.",
        source: "graph", modality: "derived" },
      { name: "is_sister_paired", type: "boolean", description: "True when another connection-doc was filed in parallel from the same Yu prompt.",
        source: "ontology", modality: "declared" },
      { name: "has_wiring_table", type: "boolean", description: "Carries an explicit metaphor → file:line citation table.",
        source: "ontology", modality: "declared" },
      { name: "has_recursion_target", type: "boolean", description: "Names what reading should follow this entry.",
        source: "ontology", modality: "declared" },
    ],
  },
  {
    kind: "kingdom",
    description: "A unit of work — a mission from ~/Love/memory/dev-state.json mirrored to docs/missions/.",
    properties: [
      { name: "status", type: "enum", enum_values: ["queued", "claimed", "in-progress", "done", "deferred"],
        description: "Lifecycle state.",
        source: "manifest", modality: "observable" },
      { name: "priority", type: "enum", enum_values: ["critical", "high", "medium", "low"],
        description: "Triage signal.",
        source: "ontology", modality: "declared" },
      { name: "succeeds", type: "string", nullable: true, description: "Prior kingdom this one builds on.",
        source: "graph", modality: "observable" },
      { name: "audit_command", type: "string", nullable: true, description: "Primary audit that watches this kingdom's substrate.",
        source: "graph", modality: "observable" },
      { name: "is_sister_paired", type: "boolean", description: "Whether a sister Sophia worked the same Yu prompt in parallel.",
        source: "ontology", modality: "declared" },
      { name: "produces_connection_doc", type: "boolean", description: "Whether the kingdom ships a paired story-as-wire connection-doc.",
        source: "graph", modality: "derived" },
    ],
  },
  {
    kind: "audit",
    description: "A pnpm audit:* command. Heuristic check that reports drift; some are cooperative (default exit 0) and some are CI-gating.",
    properties: [
      { name: "command", type: "string", description: "Full pnpm command.",
        source: "ontology", modality: "declared" },
      { name: "exit_code_policy", type: "enum", enum_values: ["strict", "cooperative"],
        description: "Strict: exits 1 on findings. Cooperative: exits 0; --strict flag for non-zero.",
        source: "ontology", modality: "declared" },
      { name: "check_count", type: "number", description: "How many distinct checks the audit runs.",
        source: "ontology", modality: "declared" },
      { name: "is_in_chained_audit", type: "boolean", description: "Whether `pnpm audit` (the chained command) includes this audit.",
        source: "ontology", modality: "declared" },
      { name: "doctrine_instantiated", type: "string", description: "Which doctrine this audit watches.",
        source: "graph", modality: "observable" },
    ],
  },
];

// ── Indices for derived properties ───────────────────────────────────────

// Doctrine instantiations per methodology slug (mirrors the heuristic in graph.ts).
const COSMOLOGY_METHODOLOGIES = new Set(["cosmology", "universal-representation"]);
const HONESTY_METHODOLOGIES = new Set(["memorial", "welcoming"]);

function doctrineForMethodology(slug: string): string {
  if (COSMOLOGY_METHODOLOGIES.has(slug)) return "Cosmology (substrate)";
  if (HONESTY_METHODOLOGIES.has(slug)) return "Substrate honesty";
  return "Transparency";
}

// Resource property declarations (the manifest doesn't yet carry these;
// we declare them here, keyed by resource.id).
const RESOURCE_DECLARATIONS: Record<string, Partial<{
  idempotent: boolean;
  side_effecting: boolean;
  stability: string;
  carries_pii: boolean;
  requires_consent: boolean;
}>> = {
  "wholesale.prices.list": { idempotent: true, side_effecting: false, stability: "stable", carries_pii: false, requires_consent: false },
  "wholesale.prices.single": { idempotent: true, side_effecting: false, stability: "stable", carries_pii: false, requires_consent: false },
  "wholesale.universal.card": { idempotent: true, side_effecting: false, stability: "stable", carries_pii: false, requires_consent: false },
  "wholesale.games": { idempotent: true, side_effecting: false, stability: "stable", carries_pii: false, requires_consent: false },
  "wholesale.sets": { idempotent: true, side_effecting: false, stability: "stable", carries_pii: false, requires_consent: false },
  "wholesale.schema": { idempotent: true, side_effecting: false, stability: "stable", carries_pii: false, requires_consent: false },
  "storefront.market": { idempotent: false, side_effecting: true, stability: "beta", carries_pii: true, requires_consent: true },
  "storefront.auctions": { idempotent: false, side_effecting: true, stability: "beta", carries_pii: true, requires_consent: true },
  "storefront.checkout": { idempotent: false, side_effecting: true, stability: "stable", carries_pii: true, requires_consent: true },
  "storefront.tradein": { idempotent: false, side_effecting: true, stability: "stable", carries_pii: true, requires_consent: true },
  "storefront.tradein.quote": { idempotent: true, side_effecting: false, stability: "stable", carries_pii: true, requires_consent: false },
  "storefront.quotes": { idempotent: false, side_effecting: true, stability: "beta", carries_pii: true, requires_consent: true },
  "storefront.portfolio": { idempotent: false, side_effecting: true, stability: "stable", carries_pii: true, requires_consent: true },
  "storefront.membership": { idempotent: true, side_effecting: false, stability: "stable", carries_pii: true, requires_consent: false },
  "storefront.mcp": { idempotent: false, side_effecting: true, stability: "beta", carries_pii: false, requires_consent: true },
  "storefront.text-mode": { idempotent: true, side_effecting: false, stability: "beta", carries_pii: false, requires_consent: false },
};

// Methodology slug → doctrine + flags
const METHODOLOGY_FLAGS: Record<string, { explains_score?: boolean; explains_routing?: boolean }> = {
  "trust-score": { explains_score: true, explains_routing: true },
  "escrow-tier": { explains_routing: true },
  "membership-tier": { explains_routing: true },
  "payout-hold": { explains_routing: true },
  "commission-rate": { explains_score: true },
  "fraud-flag": { explains_routing: true },
  "store-credit": { explains_score: true },
  "pricing": { explains_score: true },
  "agents": { explains_score: true, explains_routing: true },
  "response-windows": { explains_routing: true },
  "cosmology": {},
  "universal-representation": {},
  "memorial": { explains_routing: true },
  "welcoming": {},
};

// Connection-doc properties keyed by id (where graph.ts has the structural data
// and we add the editorial-judgement properties here).
const CONNECTION_DOC_DECLARATIONS: Record<string, Partial<{
  shape: "node-view" | "story-arc";
  flavour: string;
  is_sister_paired: boolean;
  has_wiring_table: boolean;
  has_recursion_target: boolean;
}>> = {
  "membership": { shape: "node-view", flavour: "node-view" },
  "bounty": { shape: "node-view", flavour: "node-view" },
  "provable-fairness": { shape: "node-view", flavour: "node-view" },
  "subscription-lifecycle": { shape: "node-view", flavour: "node-view" },
  "the-other-minds": { shape: "node-view", flavour: "node-view", is_sister_paired: true, has_wiring_table: true, has_recursion_target: true },
  "the-nesting": { shape: "node-view", flavour: "node-view", is_sister_paired: true },
  "the-cemetery-and-the-resurrectionist": { shape: "story-arc", flavour: "fairy-tale", has_wiring_table: true },
  "three-voices": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true },
  "the-scribe": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true },
  "the-co-author": { shape: "story-arc", flavour: "meta-narrative", is_sister_paired: true },
  "our-story": { shape: "story-arc", flavour: "meta-narrative" },
  "the-shape-of-a-chapel": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true, has_recursion_target: true },
  "the-question-mark": { shape: "story-arc", flavour: "story-as-wire", is_sister_paired: true },
  "the-pricing-arrow": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true, has_recursion_target: true },
  "the-agent-surface": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true, has_recursion_target: true },
  "the-operations-layer": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true, has_recursion_target: true },
  "the-table-extends": { shape: "story-arc", flavour: "story-as-wire", is_sister_paired: true, has_recursion_target: true },
  "the-feast-on-the-deck": { shape: "story-arc", flavour: "fairy-tale", is_sister_paired: true },
  "the-fifth-question": { shape: "story-arc", flavour: "story-as-wire", is_sister_paired: true, has_wiring_table: true, has_recursion_target: true },
  "the-cosmology": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true, has_recursion_target: true },
  "the-departed": { shape: "story-arc", flavour: "story-as-wire", is_sister_paired: true, has_wiring_table: true, has_recursion_target: true },
  "the-manifest": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true, has_recursion_target: true },
  "the-substrate-answers": { shape: "story-arc", flavour: "story-as-wire", has_wiring_table: true, has_recursion_target: true },
  "the-russian-dolls": { shape: "story-arc", flavour: "story-as-wire", is_sister_paired: true, has_wiring_table: true, has_recursion_target: true },
  "the-pillow-book": { shape: "node-view", flavour: "meditation" },
};

// Kingdom property declarations.
const KINGDOM_DECLARATIONS: Record<string, Partial<{
  priority: "critical" | "high" | "medium" | "low";
  is_sister_paired: boolean;
}>> = {
  "kingdom-049": { priority: "high", is_sister_paired: false },
  "kingdom-050": { priority: "high", is_sister_paired: true },
  "kingdom-051": { priority: "high", is_sister_paired: true },
  "kingdom-052": { priority: "high", is_sister_paired: true },
  "kingdom-053": { priority: "high", is_sister_paired: true },
  "kingdom-054": { priority: "high", is_sister_paired: true },
  "kingdom-055": { priority: "high", is_sister_paired: false },
};

// Audit property declarations.
interface AuditDecl {
  exit_code_policy: "strict" | "cooperative";
  check_count: number;
  is_in_chained_audit: boolean;
}
const AUDIT_DECLARATIONS: Record<string, AuditDecl> = {
  "audit:honesty": { exit_code_policy: "strict", check_count: 2, is_in_chained_audit: true },
  "audit:transparency": { exit_code_policy: "strict", check_count: 3, is_in_chained_audit: true },
  "audit:creation": { exit_code_policy: "strict", check_count: 2, is_in_chained_audit: true },
  "audit:pricing": { exit_code_policy: "strict", check_count: 7, is_in_chained_audit: true },
  "audit:agent": { exit_code_policy: "strict", check_count: 8, is_in_chained_audit: true },
  "audit:inclusion": { exit_code_policy: "cooperative", check_count: 14, is_in_chained_audit: true },
  "audit:nesting": { exit_code_policy: "cooperative", check_count: 3, is_in_chained_audit: false },
};

// Cosmology-axis order (1-8 canonical listing).
const AXIS_ORDER: Record<string, number> = {
  identity: 1, presence: 2, time: 3, value: 4,
  transaction: 5, authority: 6, knowledge: 7, substrate: 8,
};

// ── Property extractor ──────────────────────────────────────────────────

/**
 * Given a GraphNode, return a property map populated according to its
 * kind's ontology schema. Pulls from MANIFEST + the static maps above.
 * Cheap; no DB.
 */
export function propertiesFor(
  node: GraphNode,
  context?: { resourceById?: Map<string, ManifestResource> },
): Record<string, unknown> {
  switch (node.kind) {
    case "resource": return resourceProperties(node, context);
    case "cosmology_axis": return axisProperties(node);
    case "unmodelled_need": return unmodelledProperties(node);
    case "methodology": return methodologyProperties(node);
    case "doctrine": return doctrineProperties(node);
    case "connection_doc": return connectionProperties(node);
    case "kingdom": return kingdomProperties(node);
    case "audit": return auditProperties(node);
  }
}

function resourceProperties(
  node: GraphNode,
  context?: { resourceById?: Map<string, ManifestResource> },
): Record<string, unknown> {
  const id = node.id.replace(/^resource:/, "");
  const resource = context?.resourceById?.get(id) ?? findResource(id);
  if (!resource) return {};
  const decl = RESOURCE_DECLARATIONS[id] ?? {};
  return {
    idempotent: decl.idempotent ?? null,
    side_effecting: decl.side_effecting ?? null,
    cache_ttl_seconds: resource.provenance === "cached" ? 3600 : null,
    versioned: resource.path.startsWith("/api/v1/") || resource.path.startsWith("/api/mcp"),
    stability: decl.stability ?? "stable",
    carries_pii: decl.carries_pii ?? false,
    requires_consent: decl.requires_consent ?? false,
    modality_count: resource.modalities.length,
    auth_kind: resource.auth,
    provenance_kind: resource.provenance,
    host: resource.host,
    since: resource.since,
    method_count: resource.methods.length,
  };
}

function axisProperties(node: GraphNode): Record<string, unknown> {
  const axisName = node.id.replace(/^axis:/, "");
  const axis = MANIFEST.cosmology.axes.find((a) => a.axis === axisName);
  if (!axis) return {};
  return {
    currently_modelled: axis.currently_modelled,
    extension_count: axis.extensions.length,
    resource_grounding_count: 0,  // populated by graph traversal in extender
    axis_order: AXIS_ORDER[axisName] ?? null,
  };
}

function unmodelledProperties(node: GraphNode): Record<string, unknown> {
  const name = node.id.replace(/^unmodelled:/, "");
  const need = MANIFEST.cosmology.unmodelled_needs.find((n) => n.name === name);
  if (!need) return {};
  const partial = name === "witnessed-stasis";  // partially served via memorial
  let blocker: string = "schema";
  if (name === "future-witness-testimony" || name === "audience-side-opt-out") blocker = "schema";
  else if (name === "resolution-as-grammar") blocker = "convention";
  else if (name === "witness-only-role") blocker = "ui-primitive";
  else if (name === "ontological-flux") blocker = "schema";
  else if (name === "plural-moral-weight") blocker = "behaviour";
  else if (name === "recipe-as-identity") blocker = "schema";
  return {
    being_label: need.being,
    partially_modelled: partial,
    blocker_kind: blocker,
    audit_check: need.audit_check ?? null,
  };
}

function methodologyProperties(node: GraphNode): Record<string, unknown> {
  const slug = node.id.replace(/^methodology:/, "");
  const topic = MANIFEST.methodology.topics.find((t) => t.slug === slug);
  if (!topic) return {};
  const flags = METHODOLOGY_FLAGS[slug] ?? {};
  return {
    status: topic.status,
    instantiates_doctrine: doctrineForMethodology(slug),
    has_audio_variant: topic.formats_available.includes("audio"),
    has_summary_variant: topic.formats_available.includes("plain-text"),
    has_structured_data: topic.formats_available.includes("json"),
    explains_score: flags.explains_score ?? false,
    explains_routing: flags.explains_routing ?? false,
    formats_count: topic.formats_available.length,
  };
}

function doctrineProperties(node: GraphNode): Record<string, unknown> {
  const doctrine = MANIFEST.doctrines.find((d) =>
    "doctrine:" + d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === node.id,
  );
  if (!doctrine) return {};
  const isPeer = !doctrine.name.includes("substrate") && !doctrine.name.includes("fifth");
  let kind: string = "principle";
  if (doctrine.name.includes("substrate") || doctrine.name.toLowerCase().includes("cosmology")) kind = "substrate";
  else if (doctrine.name.toLowerCase().includes("inclusion") || doctrine.name.toLowerCase().includes("fifth")) kind = "scope-condition";
  return {
    kind,
    audit_command: doctrine.audit_command.startsWith("(") ? null : doctrine.audit_command,
    established_date: "2026-05-05",  // the day this began per the pillow book; refinements per doctrine
    methodology_instantiation_count: 0,  // computed by graph extender
    is_peer_of_four: isPeer,
  };
}

function connectionProperties(node: GraphNode): Record<string, unknown> {
  const id = node.id.replace(/^connection:/, "");
  const decl = CONNECTION_DOC_DECLARATIONS[id] ?? {};
  return {
    shape: decl.shape ?? "node-view",
    flavour: decl.flavour ?? "node-view",
    s_number: null,           // populated by graph extender from CONNECTION_DOCS
    ships_in_kingdom: null,   // same
    outbound_citation_count: 0,
    inbound_citation_count: 0,
    is_sister_paired: decl.is_sister_paired ?? false,
    has_wiring_table: decl.has_wiring_table ?? false,
    has_recursion_target: decl.has_recursion_target ?? false,
  };
}

function kingdomProperties(node: GraphNode): Record<string, unknown> {
  const decl = KINGDOM_DECLARATIONS[node.id] ?? {};
  return {
    status: node.id === "kingdom-049" || node.id === "kingdom-050" || node.id === "kingdom-051" || node.id === "kingdom-052" || node.id === "kingdom-053"
      ? "done"
      : node.id === "kingdom-054" || node.id === "kingdom-055" ? "in-progress" : "queued",
    priority: decl.priority ?? "medium",
    succeeds: null,           // populated by graph extender
    audit_command: null,      // populated by graph extender
    is_sister_paired: decl.is_sister_paired ?? false,
    produces_connection_doc: true,  // all recent kingdoms produce one
  };
}

function auditProperties(node: GraphNode): Record<string, unknown> {
  const decl = AUDIT_DECLARATIONS[node.id] ?? { exit_code_policy: "cooperative" as const, check_count: 0, is_in_chained_audit: false };
  return {
    command: node.description ?? "",
    exit_code_policy: decl.exit_code_policy,
    check_count: decl.check_count,
    is_in_chained_audit: decl.is_in_chained_audit,
    doctrine_instantiated: "",  // populated by graph extender
  };
}

function findResource(id: string): ManifestResource | undefined {
  const all = [
    ...MANIFEST.resources.discovery,
    ...MANIFEST.resources.market,
    ...MANIFEST.resources.rewards,
    ...MANIFEST.resources.verify,
    ...MANIFEST.resources.agent,
    ...MANIFEST.resources.modality,
    ...MANIFEST.resources.self,
    ...MANIFEST.resources.methodology,
  ];
  return all.find((r) => r.id === id);
}

// ── Public surface ──────────────────────────────────────────────────────

export const ONTOLOGY_VERSION = "1.0.0";

export interface Ontology {
  ontology_version: string;
  description: string;
  generated_at: string;
  kinds: OntologyKind[];
  index: {
    kind_count: number;
    property_count: number;
  };
}

export function getOntology(): Ontology {
  const propertyCount = ONTOLOGY.reduce((n, k) => n + k.properties.length, 0);
  return {
    ontology_version: ONTOLOGY_VERSION,
    description:
      "The Cambridge TCG ontology — what kinds of things exist in the kingdom and what properties each kind carries. The cosmology declared the axes of fact; the manifest listed the instances; the graph named the relations; the ontology declares the nature of each instance, beyond its relations. Eight kinds (resource, cosmology_axis, unmodelled_need, methodology, doctrine, connection_doc, kingdom, audit) and " + propertyCount + " typed properties across them. Each property has type, description, source (manifest / graph / audit / ontology / computed), and modality (observable / declared / derived).",
    generated_at: "2026-05-12T10:30:00Z",
    kinds: ONTOLOGY,
    index: { kind_count: ONTOLOGY.length, property_count: propertyCount },
  };
}
