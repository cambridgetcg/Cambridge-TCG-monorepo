import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";
import { getOntology } from "@/lib/ontology";

export const metadata: Metadata = {
  title: "The ontology",
  description:
    "The Cambridge TCG ontology — what kinds of things exist in the kingdom and what properties each kind carries.",
  other: audienceMetadata("public-documentation", ["ontology", "foundational", "schema"]),
};

export default function OntologyPage() {
  const o = getOntology();
  return (
    <main className="max-w-5xl mx-auto px-4 py-12 prose">
      <h1>The ontology</h1>
      <p>
        The Cambridge TCG kingdom's declared schema of <strong>what kinds
        of things exist</strong> and <strong>what properties each kind
        carries</strong>. The cosmology (
        <Link href="/methodology/cosmology">/methodology/cosmology</Link>)
        declared the axes of fact; the manifest (
        <Link href="/manifest">/manifest</Link>) listed instances; the
        graph (<Link href="/graph">/graph</Link>) named relations; this
        page declares <em>the nature of each instance, beyond its
        relations</em>.
      </p>
      <blockquote>
        <strong>Machine-readable version:</strong>{" "}
        <Link href="/api/v1/ontology">
          <code>GET /api/v1/ontology</code>
        </Link>{" "}
        (JSON; CORS-open). <strong>Source-of-truth:</strong>{" "}
        <code>apps/storefront/src/lib/ontology.ts</code>. Each node in
        the graph carries a <code>properties</code> map populated from
        the schemas below.
      </blockquote>

      <p className="text-sm text-ink-faint">
        Ontology version <code>{o.ontology_version}</code> · {o.index.kind_count}{" "}
        kinds · {o.index.property_count} properties · generated{" "}
        <code>{o.generated_at}</code>.
      </p>

      <h2>How to read each kind</h2>
      <p>
        Each property carries five facets:
      </p>
      <ul>
        <li>
          <strong>Name</strong> — the property's stable identifier.
        </li>
        <li>
          <strong>Type</strong> — its data shape (string, number,
          boolean, enum, etc.). Enums list their values.
        </li>
        <li>
          <strong>Source</strong> — where the value comes from:{" "}
          <code>manifest</code> (read off MANIFEST),{" "}
          <code>graph</code> (read off the typed edges),{" "}
          <code>audit</code> (read off audit output),{" "}
          <code>ontology</code> (declared in this file), or{" "}
          <code>computed</code> (derived from others).
        </li>
        <li>
          <strong>Modality</strong> — how the property comes to be true:{" "}
          <code>observable</code> (read from substrate),{" "}
          <code>declared</code> (asserted by a Sophia),{" "}
          <code>derived</code> (computed from other properties).
        </li>
        <li>
          <strong>Description</strong> — what it means.
        </li>
      </ul>

      {o.kinds.map((k) => (
        <section key={k.kind}>
          <h2>
            <code>{k.kind}</code>
          </h2>
          <p>{k.description}</p>
          <p className="text-xs text-ink-faint">
            {k.properties.length} properties.
          </p>
          <table className="text-sm">
            <thead>
              <tr>
                <th className="text-left">Name</th>
                <th className="text-left">Type</th>
                <th className="text-left">Source</th>
                <th className="text-left">Modality</th>
                <th className="text-left">Description</th>
              </tr>
            </thead>
            <tbody>
              {k.properties.map((p) => (
                <tr key={p.name}>
                  <td>
                    <code>{p.name}</code>
                    {p.nullable && (
                      <span className="ml-1 text-xs text-ink-faint">
                        ?
                      </span>
                    )}
                  </td>
                  <td>
                    <code>{p.type}</code>
                    {p.enum_values && (
                      <div className="text-xs text-ink-faint">
                        {p.enum_values.map((v) => (
                          <code key={v} className="mr-1">
                            {v}
                          </code>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <code>{p.source}</code>
                  </td>
                  <td>
                    <code>{p.modality}</code>
                  </td>
                  <td className="text-xs text-ink-muted">
                    {p.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <hr />
      <p className="text-sm text-ink-faint italic">
        The cosmology is the world. The manifest is the list. The graph
        is the mesh. The ontology is the schema. Each layer beneath the
        last. <em>Find out the nature of everything and their
        properties</em>: the natures are kinds; the properties are
        typed.
      </p>
      <p className="text-sm text-ink-faint">
        Story-as-wire connection-doc:{" "}
        <code>docs/connections/the-natures.md</code> (S28). Kingdom:{" "}
        <code>kingdom-055</code>. Inclusion audit check #14 verifies the
        ontology is on file.
      </p>
    </main>
  );
}
