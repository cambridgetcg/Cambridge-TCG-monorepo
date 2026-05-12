import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";
import { getGraph, type GraphNode, type GraphEdge, type NodeKind, type EdgeKind } from "@/lib/graph";

export const metadata: Metadata = {
  title: "The graph",
  description:
    "The Cambridge TCG kingdom as a typed meaning-graph. Nodes + typed edges. The manifest is the list; the graph is the mesh.",
  other: audienceMetadata("public-documentation", ["graph", "foundational", "machine-readable"]),
};

const KIND_LABEL: Record<NodeKind, string> = {
  resource: "Resources (endpoints)",
  cosmology_axis: "Cosmology axes (currently modelled)",
  unmodelled_need: "Cosmology — currently unmodelled needs",
  methodology: "Methodology topics",
  doctrine: "Doctrines",
  connection_doc: "Connection-docs",
  kingdom: "Kingdoms",
  audit: "Audits",
};

const KIND_ORDER: NodeKind[] = [
  "doctrine",
  "cosmology_axis",
  "unmodelled_need",
  "kingdom",
  "connection_doc",
  "methodology",
  "resource",
  "audit",
];

const EDGE_LABEL: Record<EdgeKind, string> = {
  grounds_in: "grounds in",
  explained_by: "explained by",
  instance_of: "instance of",
  extended_by: "extended by",
  cites: "cites",
  ships_in: "ships in",
  audited_by: "audited by",
  mirrors: "mirrors",
  succeeds: "succeeds",
};

export default function GraphPage() {
  const g = getGraph();
  const nodesByKind: Record<NodeKind, GraphNode[]> = {
    resource: [], cosmology_axis: [], unmodelled_need: [], methodology: [],
    doctrine: [], connection_doc: [], kingdom: [], audit: [],
  };
  for (const n of g.nodes) nodesByKind[n.kind].push(n);

  const outgoingByFrom = new Map<string, GraphEdge[]>();
  const incomingByTo = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    const o = outgoingByFrom.get(e.from) ?? [];
    o.push(e);
    outgoingByFrom.set(e.from, o);
    const i = incomingByTo.get(e.to) ?? [];
    i.push(e);
    incomingByTo.set(e.to, i);
  }

  const labelFor = (id: string): string => {
    const n = g.nodes.find((x) => x.id === id);
    return n ? n.label : id;
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 prose prose-invert">
      <h1>The graph</h1>
      <p>
        The Cambridge TCG kingdom as a typed meaning-graph. {g.node_count}{" "}
        nodes (resources, cosmology axes, methodology topics, doctrines,
        connection-docs, kingdoms, audits) and {g.edge_count} typed edges
        (grounds-in, explained-by, instance-of, extended-by, cites,
        ships-in, audited-by, succeeds). Yu's directive on 2026-05-11:{" "}
        <em>"keep nesting everything in everything!"</em> — made literal.
      </p>

      <blockquote>
        <strong>Machine-readable version:</strong>{" "}
        <Link href="/api/v1/graph">
          <code>GET /api/v1/graph</code>
        </Link>{" "}
        (JSON; CORS-open). <strong>Source-of-truth:</strong>{" "}
        <code>apps/storefront/src/lib/graph.ts</code>. Manifest (the list):{" "}
        <Link href="/manifest">/manifest</Link>. Cosmology (the world):{" "}
        <Link href="/methodology/cosmology">/methodology/cosmology</Link>.
      </blockquote>

      <p className="text-sm text-neutral-500">
        Graph version <code>{g.graph_version}</code> · manifest{" "}
        <code>{g.manifest_version}</code> · cosmology{" "}
        <code>{g.cosmology_version}</code> · generated{" "}
        <code>{g.generated_at}</code>.
      </p>

      <h2>Index</h2>
      <p>Counts by kind and edge.</p>
      <ul>
        {KIND_ORDER.map((k) => (
          <li key={k}>
            <strong>{KIND_LABEL[k]}:</strong> {g.index.by_kind[k]}
          </li>
        ))}
      </ul>
      <ul>
        {(Object.keys(g.index.by_edge_kind) as EdgeKind[])
          .filter((k) => g.index.by_edge_kind[k] > 0)
          .map((k) => (
            <li key={k}>
              <code>{k}</code>: {g.index.by_edge_kind[k]}
            </li>
          ))}
      </ul>

      {KIND_ORDER.map((kind) => {
        const list = nodesByKind[kind];
        if (list.length === 0) return null;
        return (
          <section key={kind}>
            <h2>{KIND_LABEL[kind]}</h2>
            {list.map((node) => {
              const out = outgoingByFrom.get(node.id) ?? [];
              const inc = incomingByTo.get(node.id) ?? [];
              return (
                <article key={node.id} className="mb-6 pl-3 border-l border-neutral-800">
                  <h3 className="text-base">
                    <code className="text-amber-400">{node.id}</code>{" "}
                    <span className="text-neutral-200">— {node.label}</span>
                  </h3>
                  {node.description && (
                    <p className="text-sm text-neutral-400 my-1">{node.description}</p>
                  )}
                  {node.path && (
                    <p className="text-xs text-neutral-500 my-1">
                      path: <code>{node.path}</code>
                      {node.since && (
                        <>
                          {" · "}since <code>{node.since}</code>
                        </>
                      )}
                    </p>
                  )}
                  {out.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-neutral-500 uppercase tracking-wider">
                        outgoing ({out.length})
                      </span>
                      <ul className="text-sm">
                        {out.map((e, i) => (
                          <li key={i}>
                            <em>{EDGE_LABEL[e.kind]}</em> →{" "}
                            <code className="text-neutral-300">{e.to}</code>{" "}
                            <span className="text-xs text-neutral-500">
                              ({labelFor(e.to)})
                            </span>
                            {e.via && (
                              <span className="text-xs text-neutral-600 italic ml-1">
                                via {e.via}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {inc.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-neutral-500 uppercase tracking-wider">
                        incoming ({inc.length})
                      </span>
                      <ul className="text-sm">
                        {inc.map((e, i) => (
                          <li key={i}>
                            <code className="text-neutral-300">{e.from}</code>{" "}
                            <span className="text-xs text-neutral-500">
                              ({labelFor(e.from)})
                            </span>{" "}
                            <em>{EDGE_LABEL[e.kind]}</em> → this
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}

      <hr />
      <p className="text-sm text-neutral-500 italic">
        The manifest is the list. The graph is the mesh. The kingdom that
        names its nesting is the kingdom where any participant arriving at
        any node can walk to every other in N hops.
      </p>
    </main>
  );
}
