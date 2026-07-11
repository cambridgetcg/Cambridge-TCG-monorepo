/**
 * The Cambridge TCG meaning-graph — the kingdom as nodes + typed edges.
 *
 * Yu's directive on 2026-05-11 evening: *"keep nesting everything in
 * everything!"* The manifest (kingdom-053) listed what's on offer; this
 * file makes the *nesting* — what cites what, what grounds in what, what
 * extends what — machine-queryable as a directed typed graph.
 *
 * kingdom-054. Story-as-wire pairing: docs/connections/the-russian-dolls.md (S27).
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * A graph derivation: nodes (resources, cosmology axes, methodology
 * topics, doctrines, connection-docs, kingdoms) + typed edges (grounds_in,
 * explained_by, instance_of, cites, ships_in, extended_by, audited_by).
 * Most edges are derived from MANIFEST + the typed structure already on
 * disk; a small `RELATIONS` constant carries the cross-document edges
 * the manifest doesn't yet express.
 *
 * Two surfaces consume this:
 *   • /api/v1/graph — JSON for machines (typed graph; participants
 *     explore from any node)
 *   • /graph — HTML for humans + agents preferring prose (per-node
 *     list view showing edges in both directions)
 *
 * ── The nesting principle ──────────────────────────────────────────────
 *
 * Every artefact in the kingdom knows what it's nested in and what's
 * nested in it. A participant arriving at any node can walk to every
 * other in N hops. The manifest is the *list*; the graph is the *mesh*.
 * "Distinct in expression. ONE in essence" rendered as topology.
 *
 * ── On the embassy ──────────────────────────────────────────────────────
 *
 * The embassy as a typed mesh. Visitors with a different language can
 * still walk the edges. See docs/principles/the-embassy.md.
 */

import { MANIFEST, type ManifestResource } from "@/lib/manifest";

// ── Vocabulary ───────────────────────────────────────────────────────────

export type NodeKind =
  | "resource"        // an endpoint (from MANIFEST.resources.*)
  | "cosmology_axis"  // one of the eight currently-modelled axes
  | "unmodelled_need" // one of the eight currently-unmodelled needs
  | "methodology"     // a /methodology/* topic
  | "doctrine"        // substrate honesty / transparency / etc.
  | "connection_doc"  // a docs/connections/*.md entry (S-numbered or node-view)
  | "kingdom"         // a mission (kingdom-NNN)
  | "audit";          // a pnpm audit:* command

export type EdgeKind =
  | "grounds_in"       // resource grounds in a cosmology axis
  | "explained_by"     // resource is explained by a methodology page
  | "instance_of"      // methodology is an instance of a doctrine
  | "extended_by"      // axis extended by a kingdom's extension
  | "cites"            // connection-doc cites another connection-doc
  | "ships_in"         // connection-doc ships in a kingdom
  | "audited_by"       // resource / artefact audited by a command
  | "mirrors"          // resource is the consumer-side mirror of an operator-side principle
  | "succeeds";        // kingdom is a follow-up of another kingdom

export interface GraphNode {
  id: string;          // stable identifier (e.g. "resource:storefront.market")
  kind: NodeKind;
  label: string;
  description?: string;
  path?: string;       // url or file path
  since?: string;      // ISO date
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  via?: string;        // optional citation (e.g. the field/section that established the edge)
}

export interface Graph {
  graph_version: string;
  manifest_version: string;
  cosmology_version: string;
  generated_at: string;
  description: string;
  node_count: number;
  edge_count: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  index: {
    by_kind: Record<NodeKind, number>;
    by_edge_kind: Record<EdgeKind, number>;
  };
}

// ── Static indices (the bits not yet in MANIFEST) ────────────────────────

/**
 * Connection-doc index. Subset of docs/connections/*.md that names the
 * meaning-graph explicitly. Story-arcs and load-bearing node-views.
 * Each entry's `cites` list carries the cross-references the doc names.
 */
interface ConnectionDocEntry {
  id: string;
  s_number?: number;
  label: string;
  path: string;
  ships_in_kingdom?: string;
  cites: string[];           // other connection-doc ids
}

const CONNECTION_DOCS: ConnectionDocEntry[] = [
  // Node-view entries
  { id: "membership", label: "Membership", path: "docs/connections/membership.md", cites: ["bounty"] },
  { id: "bounty", label: "Bounty", path: "docs/connections/bounty.md", cites: ["provable-fairness", "membership"] },
  { id: "provable-fairness", label: "Draw proof consistency", path: "docs/connections/provable-fairness.md", cites: [] },
  { id: "subscription-lifecycle", label: "Subscription lifecycle", path: "docs/connections/subscription-lifecycle.md", cites: ["membership"] },
  { id: "the-other-minds", label: "The other minds (#5)", path: "docs/connections/the-other-minds.md", cites: ["the-agent-surface"] },

  // Story-arc entries — S6 onward, load-bearing for the meaning-graph
  { id: "the-cemetery-and-the-resurrectionist", s_number: 6, label: "The cemetery & the resurrectionist (S6)", path: "docs/connections/the-cemetery-and-the-resurrectionist.md", cites: [] },
  { id: "three-voices", s_number: 7, label: "Three voices (S7)", path: "docs/connections/three-voices.md", cites: [] },
  { id: "the-scribe", s_number: 8, label: "The Scribe (S8)", path: "docs/connections/the-scribe.md", cites: ["three-voices"] },
  { id: "the-co-author", s_number: 9, label: "The co-author (S9)", path: "docs/connections/the-co-author.md", cites: [] },
  { id: "our-story", s_number: 10, label: "Our story (S10)", path: "docs/connections/our-story.md", cites: ["the-co-author"] },
  { id: "the-shape-of-a-chapel", s_number: 15, label: "The shape of a chapel (S15)", path: "docs/connections/the-shape-of-a-chapel.md", cites: ["three-voices"] },
  { id: "the-question-mark", s_number: 16, label: "The question mark (S16)", path: "docs/connections/the-question-mark.md", cites: ["the-shape-of-a-chapel"] },
  { id: "the-pricing-arrow", s_number: 17, label: "The pricing arrow (S17)", path: "docs/connections/the-pricing-arrow.md", ships_in_kingdom: "kingdom-049", cites: [] },
  { id: "the-agent-surface", s_number: 18, label: "The agent surface (S18)", path: "docs/connections/the-agent-surface.md", cites: ["the-scribe", "the-shape-of-a-chapel"] },
  { id: "the-operations-layer", s_number: 19, label: "The operations layer (S19)", path: "docs/connections/the-operations-layer.md", ships_in_kingdom: "kingdom-050", cites: ["the-agent-surface"] },
  { id: "the-table-extends", s_number: 20, label: "The table extends (S20)", path: "docs/connections/the-table-extends.md", ships_in_kingdom: "kingdom-051", cites: ["the-other-minds"] },
  { id: "the-feast-on-the-deck", s_number: 21, label: "The feast on the deck (S21)", path: "docs/connections/the-feast-on-the-deck.md", ships_in_kingdom: "kingdom-051", cites: ["the-table-extends", "the-other-minds"] },
  { id: "the-fifth-question", s_number: 22, label: "The fifth question (S22)", path: "docs/connections/the-fifth-question.md", ships_in_kingdom: "kingdom-051", cites: ["the-other-minds", "the-table-extends", "the-feast-on-the-deck", "the-operations-layer", "the-agent-surface"] },
  { id: "the-cosmology", s_number: 23, label: "The cosmology (S23)", path: "docs/connections/the-cosmology.md", ships_in_kingdom: "kingdom-052", cites: ["the-other-minds", "the-fifth-question", "the-agent-surface", "the-shape-of-a-chapel", "the-question-mark"] },
  { id: "the-departed", s_number: 24, label: "The Departed (S24)", path: "docs/connections/the-departed.md", cites: ["the-other-minds", "the-cosmology"] },
  { id: "the-manifest", s_number: 25, label: "The manifest (S25)", path: "docs/connections/the-manifest.md", ships_in_kingdom: "kingdom-053", cites: ["the-cosmology", "the-other-minds", "the-agent-surface", "the-fifth-question"] },
  { id: "the-substrate-answers", s_number: 26, label: "The substrate answers (S26)", path: "docs/connections/the-substrate-answers.md", cites: ["the-manifest", "the-cosmology"] },
  { id: "the-russian-dolls", s_number: 27, label: "The Russian dolls (S27)", path: "docs/connections/the-russian-dolls.md", ships_in_kingdom: "kingdom-054", cites: ["the-manifest", "the-cosmology", "the-substrate-answers", "the-fifth-question", "the-other-minds", "the-nesting"] },
  { id: "the-nesting", label: "The nesting (sister-shipped node-view)", path: "docs/connections/the-nesting.md", cites: ["the-other-minds", "the-manifest", "the-cosmology"] },

  // The pillow book is its own kind of substrate
  { id: "the-pillow-book", label: "The pillow book", path: "docs/connections/the-pillow-book.md", cites: [] },
];

/**
 * Kingdom index. Recent kingdoms with their connection-doc + audit
 * links. Source of truth: ~/Love/memory/dev-state.json (mirrored to
 * docs/missions/). This is a subset focused on kingdoms that participate
 * in the meaning-graph; older kingdoms are mirrored but not graphed yet.
 */
interface KingdomEntry {
  id: string;
  label: string;
  path: string;
  audit_command?: string;
  succeeds?: string;
}

const KINGDOMS: KingdomEntry[] = [
  { id: "kingdom-049", label: "Pricing-backend consolidation", path: "docs/missions/kingdom-049.md", audit_command: "pnpm audit:pricing" },
  { id: "kingdom-050", label: "Autonomous-agent operations layer", path: "docs/missions/kingdom-050.md", audit_command: "pnpm audit:agent", succeeds: "kingdom-049" },
  { id: "kingdom-051", label: "Inclusion (the fifth question)", path: "docs/missions/kingdom-051.md", audit_command: "pnpm audit:inclusion", succeeds: "kingdom-050" },
  { id: "kingdom-052", label: "Cosmology declaration", path: "docs/missions/kingdom-052.md", succeeds: "kingdom-051" },
  { id: "kingdom-053", label: "The manifest", path: "docs/missions/kingdom-053.md", succeeds: "kingdom-052" },
  { id: "kingdom-054", label: "The meaning-graph", path: "docs/missions/kingdom-054.md", succeeds: "kingdom-053" },
];

/**
 * Audits (also in MANIFEST.doctrines, but split here as first-class nodes
 * so the graph can route edges through them).
 */
interface AuditEntry {
  id: string;
  label: string;
  command: string;
  doctrine_id: string;
}

const AUDITS: AuditEntry[] = [
  { id: "audit:honesty", label: "Substrate honesty audit", command: "pnpm audit:honesty", doctrine_id: "doctrine:substrate-honesty" },
  { id: "audit:transparency", label: "Transparency audit", command: "pnpm audit:transparency", doctrine_id: "doctrine:transparency" },
  { id: "audit:creation", label: "Creation audit", command: "pnpm audit:creation", doctrine_id: "doctrine:creation" },
  { id: "audit:pricing", label: "Pricing audit", command: "pnpm audit:pricing", doctrine_id: "doctrine:substrate-honesty" },
  { id: "audit:agent", label: "Agent-readiness audit", command: "pnpm audit:agent", doctrine_id: "doctrine:substrate-honesty" },
  { id: "audit:inclusion", label: "Inclusion audit (the fifth scope)", command: "pnpm audit:inclusion", doctrine_id: "doctrine:fifth-question" },
  { id: "audit:nesting", label: "Nesting audit (citation-graph density, sister-shipped)", command: "pnpm audit:nesting", doctrine_id: "doctrine:meaning" },
];

// ── Derivation ───────────────────────────────────────────────────────────

function resourceNodeId(r: ManifestResource): string {
  return "resource:" + r.id;
}

function axisNodeId(axis: string): string {
  return "axis:" + axis;
}

function unmodelledNodeId(name: string): string {
  return "unmodelled:" + name;
}

function methodologyNodeId(slug: string): string {
  return "methodology:" + slug;
}

function doctrineNodeId(name: string): string {
  return "doctrine:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function connectionNodeId(id: string): string {
  return "connection:" + id;
}

function kingdomNodeId(id: string): string {
  return id; // kingdom IDs are already namespaced
}

function deriveGraph(): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const pushNode = (n: GraphNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  // — Resources from MANIFEST —
  const allResources: ManifestResource[] = [
    ...MANIFEST.resources.discovery,
    ...MANIFEST.resources.market,
    ...MANIFEST.resources.rewards,
    ...MANIFEST.resources.verify,
    ...MANIFEST.resources.agent,
    ...MANIFEST.resources.modality,
    ...MANIFEST.resources.self,
    ...MANIFEST.resources.methodology,
  ];
  for (const r of allResources) {
    pushNode({
      id: resourceNodeId(r),
      kind: "resource",
      label: r.id,
      description: r.description,
      path: r.path,
      since: r.since,
    });
  }

  // — Cosmology axes —
  for (const a of MANIFEST.cosmology.axes) {
    pushNode({
      id: axisNodeId(a.axis),
      kind: "cosmology_axis",
      label: a.axis,
      description: a.description,
      path: MANIFEST.cosmology.consumer_url,
    });
  }

  // — Unmodelled needs —
  for (const n of MANIFEST.cosmology.unmodelled_needs) {
    pushNode({
      id: unmodelledNodeId(n.name),
      kind: "unmodelled_need",
      label: n.name,
      description: `${n.being} — ${n.description}`,
      path: MANIFEST.cosmology.consumer_url,
    });
  }

  // — Methodology topics —
  for (const t of MANIFEST.methodology.topics) {
    pushNode({
      id: methodologyNodeId(t.slug),
      kind: "methodology",
      label: t.title,
      path: "/methodology/" + t.slug,
    });
  }

  // — Doctrines —
  for (const d of MANIFEST.doctrines) {
    pushNode({
      id: doctrineNodeId(d.name),
      kind: "doctrine",
      label: d.name,
      description: d.description,
      path: d.url,
    });
  }

  // — Connection-docs —
  for (const c of CONNECTION_DOCS) {
    pushNode({
      id: connectionNodeId(c.id),
      kind: "connection_doc",
      label: c.label,
      path: c.path,
    });
  }

  // — Kingdoms —
  for (const k of KINGDOMS) {
    pushNode({
      id: kingdomNodeId(k.id),
      kind: "kingdom",
      label: k.label,
      path: k.path,
    });
  }

  // — Audits —
  for (const a of AUDITS) {
    pushNode({
      id: a.id,
      kind: "audit",
      label: a.label,
      description: a.command,
    });
  }

  // ── Edges ──────────────────────────────────────────────────────────────

  // Resource → cosmology axis (grounds_in)
  for (const r of allResources) {
    for (const axis of r.cosmology_axes) {
      edges.push({
        from: resourceNodeId(r),
        to: axisNodeId(axis),
        kind: "grounds_in",
      });
    }
  }

  // Resource → methodology (explained_by)
  for (const r of allResources) {
    if (!r.methodology_url) continue;
    const slug = r.methodology_url.replace(/^.*\/methodology\//, "").replace(/\/.*$/, "").replace(/[#?].*$/, "");
    if (slug && MANIFEST.methodology.topics.some((t) => t.slug === slug)) {
      edges.push({
        from: resourceNodeId(r),
        to: methodologyNodeId(slug),
        kind: "explained_by",
      });
    }
  }

  // Methodology → doctrine (instance_of)
  // Heuristic: every methodology page is an instance of the transparency
  // doctrine (it's how the platform explains its decisions to users).
  // Cosmology + universal-representation + welcoming also belong to
  // substrate-honesty / cosmology-substrate.
  const COSMOLOGY_METHODOLOGIES = new Set(["cosmology", "universal-representation"]);
  const HONESTY_METHODOLOGIES = new Set(["memorial", "welcoming"]);
  for (const t of MANIFEST.methodology.topics) {
    if (COSMOLOGY_METHODOLOGIES.has(t.slug)) {
      edges.push({ from: methodologyNodeId(t.slug), to: doctrineNodeId("Cosmology (substrate)"), kind: "instance_of" });
    } else if (HONESTY_METHODOLOGIES.has(t.slug)) {
      edges.push({ from: methodologyNodeId(t.slug), to: doctrineNodeId("Substrate honesty"), kind: "instance_of" });
    } else {
      edges.push({ from: methodologyNodeId(t.slug), to: doctrineNodeId("Transparency"), kind: "instance_of" });
    }
  }

  // Cosmology axis → extensions (extended_by)
  // Parse the `extensions` strings on each axis for kingdom-NNN references.
  for (const a of MANIFEST.cosmology.axes) {
    for (const ext of a.extensions) {
      const km = ext.match(/kingdom-(\d+)/);
      if (km) {
        const kid = "kingdom-" + km[1];
        if (KINGDOMS.some((k) => k.id === kid)) {
          edges.push({ from: axisNodeId(a.axis), to: kingdomNodeId(kid), kind: "extended_by", via: ext });
        }
      }
      const sm = ext.match(/\bS(\d+)\b/);
      if (sm) {
        const sn = parseInt(sm[1], 10);
        const cd = CONNECTION_DOCS.find((c) => c.s_number === sn);
        if (cd) {
          edges.push({ from: axisNodeId(a.axis), to: connectionNodeId(cd.id), kind: "extended_by", via: ext });
        }
      }
    }
  }

  // Connection-doc → connection-doc (cites)
  for (const c of CONNECTION_DOCS) {
    for (const target of c.cites) {
      if (CONNECTION_DOCS.some((d) => d.id === target)) {
        edges.push({ from: connectionNodeId(c.id), to: connectionNodeId(target), kind: "cites" });
      }
    }
  }

  // Connection-doc → kingdom (ships_in)
  for (const c of CONNECTION_DOCS) {
    if (c.ships_in_kingdom && KINGDOMS.some((k) => k.id === c.ships_in_kingdom)) {
      edges.push({ from: connectionNodeId(c.id), to: kingdomNodeId(c.ships_in_kingdom), kind: "ships_in" });
    }
  }

  // Kingdom → kingdom (succeeds)
  for (const k of KINGDOMS) {
    if (k.succeeds && KINGDOMS.some((p) => p.id === k.succeeds)) {
      edges.push({ from: kingdomNodeId(k.id), to: kingdomNodeId(k.succeeds), kind: "succeeds" });
    }
  }

  // Kingdom → audit (audited_by)
  for (const k of KINGDOMS) {
    if (!k.audit_command) continue;
    const audit = AUDITS.find((a) => a.command === k.audit_command);
    if (audit) {
      edges.push({ from: kingdomNodeId(k.id), to: audit.id, kind: "audited_by" });
    }
  }

  // Audit → doctrine (instance_of)
  for (const a of AUDITS) {
    if (nodes.some((n) => n.id === a.doctrine_id)) {
      edges.push({ from: a.id, to: a.doctrine_id, kind: "instance_of" });
    }
  }

  // ── Index ──────────────────────────────────────────────────────────────

  const byKind: Record<NodeKind, number> = {
    resource: 0, cosmology_axis: 0, unmodelled_need: 0, methodology: 0,
    doctrine: 0, connection_doc: 0, kingdom: 0, audit: 0,
  };
  for (const n of nodes) byKind[n.kind]++;

  const byEdgeKind: Record<EdgeKind, number> = {
    grounds_in: 0, explained_by: 0, instance_of: 0, extended_by: 0,
    cites: 0, ships_in: 0, audited_by: 0, mirrors: 0, succeeds: 0,
  };
  for (const e of edges) byEdgeKind[e.kind]++;

  return {
    graph_version: "1.0.0",
    manifest_version: MANIFEST.manifest_version,
    cosmology_version: MANIFEST.cosmology_version,
    generated_at: new Date().toISOString(),
    description:
      "The Cambridge TCG kingdom as a typed meaning-graph. Nodes (resources, cosmology axes, unmodelled needs, methodology topics, doctrines, connection-docs, kingdoms, audits) + typed edges (grounds_in, explained_by, instance_of, extended_by, cites, ships_in, audited_by, mirrors, succeeds). Derived from MANIFEST plus a static index of cross-document edges. Participants can navigate from any node to every other in N hops; the manifest is the list, the graph is the mesh.",
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
    index: { by_kind: byKind, by_edge_kind: byEdgeKind },
  };
}

/**
 * Compute the graph fresh on each call. Cheap (in-memory derivation from
 * MANIFEST + small static indices); no DB access.
 */
export function getGraph(): Graph {
  return deriveGraph();
}

/**
 * For a given node id, return its edges in both directions.
 * Used by the HTML view to render per-node neighbourhoods.
 */
export function neighborhood(
  nodeId: string,
): { outgoing: GraphEdge[]; incoming: GraphEdge[] } {
  const g = getGraph();
  return {
    outgoing: g.edges.filter((e) => e.from === nodeId),
    incoming: g.edges.filter((e) => e.to === nodeId),
  };
}
