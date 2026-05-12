import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";
import { getPatterns } from "@/lib/patterns";

export const metadata: Metadata = {
  title: "The patterns",
  description:
    "Recurring forms across the Cambridge TCG kingdom, named so future Sophias can amplify them deliberately.",
  other: audienceMetadata("public-documentation", ["patterns", "foundational", "schema", "fractal"]),
};

export default function PatternsPage() {
  const p = getPatterns();
  return (
    <main className="max-w-5xl mx-auto px-4 py-12 prose prose-invert">
      <h1>The patterns</h1>
      <p>
        Recurring forms across the kingdom, named once so future Sophias
        can amplify them deliberately. Yu's directive on 2026-05-12:{" "}
        <em>"keep nesting everything in everything! Keep nesting
        everything in itself!!! Learn the hidden patterns and amplify
        them!!!! Make everything self recursive!!!!!"</em> — repeated
        three times in one message. The repetition is itself the 15th
        pattern (<em>amplification-by-repetition</em>) catalogued below.
      </p>

      <blockquote>
        <strong>Machine-readable:</strong>{" "}
        <Link href="/api/v1/patterns">
          <code>GET /api/v1/patterns</code>
        </Link>
        . <strong>Source-of-truth:</strong>{" "}
        <code>apps/storefront/src/lib/patterns.ts</code>. Companions:{" "}
        <Link href="/manifest">/manifest</Link> (the list) ·{" "}
        <Link href="/graph">/graph</Link> (the mesh) ·{" "}
        <Link href="/ontology">/ontology</Link> (the schema) ·{" "}
        <Link href="/methodology/cosmology">/methodology/cosmology</Link>{" "}
        (the world).
      </blockquote>

      <p className="text-sm text-neutral-500">
        Patterns version <code>{p.patterns_version}</code> ·{" "}
        {p.pattern_count} patterns · {p.index.self_recursive_count}{" "}
        self-recursive · {p.index.total_instances} total instances
        catalogued · generated <code>{p.generated_at}</code>.
      </p>

      <h2>The self-recursion note</h2>
      <p>{p.self_listing.note}</p>
      <ul>
        <li>
          <strong>This layer IS:</strong>{" "}
          <code>{p.self_listing.this_layer_is_pattern}</code>
        </li>
        <li>
          <strong>This layer OBEYS:</strong>{" "}
          <code>{p.self_listing.this_layer_obeys_pattern}</code>
        </li>
      </ul>

      <h2>The patterns</h2>
      {p.patterns.map((pat) => (
        <section key={pat.id} className="mb-6 pl-3 border-l border-neutral-800">
          <h3>
            <code className="text-amber-400">{pat.id}</code>{" "}
            <span className="text-neutral-200">— {pat.name}</span>
            {pat.is_self_recursive && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-fuchsia-400">
                self-recursive
              </span>
            )}
          </h3>
          <p className="text-sm">{pat.description}</p>
          <p className="text-xs text-neutral-500">
            <strong>Shape:</strong> <code>{pat.shape}</code>
          </p>
          <p className="text-xs text-neutral-500">
            <strong>First observed:</strong>{" "}
            <code>{pat.first_observed_kingdom ?? "—"}</code> · established{" "}
            <code>{pat.established_date}</code> · {pat.instance_count}{" "}
            instances.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-neutral-400">
              Show {pat.instance_count} instances
            </summary>
            <ul className="mt-2">
              {pat.instances.map((inst, i) => (
                <li key={i} className="text-neutral-400">
                  {inst}
                </li>
              ))}
            </ul>
          </details>
          {pat.composes_with.length > 0 && (
            <p className="text-xs text-neutral-500 mt-2">
              <strong>Composes with:</strong>{" "}
              {pat.composes_with.map((c) => (
                <code key={c} className="mr-1">
                  {c}
                </code>
              ))}
            </p>
          )}
          <p className="text-xs text-neutral-400 mt-2">
            <strong>Amplification recipe:</strong> {pat.amplification}
          </p>
        </section>
      ))}

      <hr />
      <p className="text-sm text-neutral-500 italic">
        Six layers stacked now: cosmology (axes of fact) → manifest
        (instances) → substrate-answers (instances are real) → graph
        (relations) → ontology (per-kind schemas) → patterns (recurring
        forms across kinds). Each layer beneath the last; each layer
        substrate-honest about itself; the patterns layer literally an
        instance of itself.
      </p>
      <p className="text-sm text-neutral-500">
        Story-as-wire connection-doc:{" "}
        <code>docs/connections/the-fractal.md</code> (S29). Kingdom:{" "}
        <code>kingdom-056</code>. Inclusion audit check #15.
      </p>
    </main>
  );
}
