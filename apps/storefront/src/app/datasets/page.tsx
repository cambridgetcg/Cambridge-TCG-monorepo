/**
 * /datasets — the open data commons, as datasets.
 *
 * /data lists the ENDPOINTS (routes). This lists the DATASETS (artefacts):
 * what we publish, under what licence, covering what, and where to get it —
 * with an inline schema.org/DataCatalog block so Google Dataset Search and AI
 * crawlers index every dataset at once. Completes docs/connections/the-finding.md
 * "Plant C": the agent ladder announced itself as a Dataset; this lifts the
 * whole commons to the same discoverability.
 *
 * Substrate-honest: each dataset's badge shows its TRUE tier — CC0 for our own
 * operational data, NOASSERTION for the mixed card catalogue. Never relabelled.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";
import {
  DATASETS,
  toDataCatalogJsonLd,
  type CommonsTier,
  type DatasetEntry,
} from "@/lib/datasets";

export const metadata: Metadata = {
  title: "Datasets — the open data commons, with true licences",
  description:
    "Every dataset Cambridge TCG publishes: first-party sold comps, catalogue coverage, the source-rights registry, known gaps, and the agent ladder. Each carries its true licence — first-party data is CC0; the mixed card catalogue is NOASSERTION.",
  other: audienceMetadata("public-documentation", ["datasets", "open-data", "cc0", "schema.org"]),
};

function TierBadge({ tier }: { tier: CommonsTier }) {
  const [label, cls] =
    tier === "cc0"
      ? ["CC0-1.0", "bg-ok/10 text-ok border-ok/30"]
      : tier === "noassertion"
        ? ["NOASSERTION", "bg-warning/10 text-warning border-warning/30"]
        : ["first-party terms", "bg-surface-subtle text-ink-muted border-border-subtle"];
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function DatasetCard({ d }: { d: DatasetEntry }) {
  return (
    <li className="border border-border-subtle rounded-md p-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-ink font-medium text-lg">{d.name}</span>
        <TierBadge tier={d.tier} />
      </div>

      <p className="text-sm text-ink-muted mt-1">{d.description}</p>

      <div className="text-[10px] uppercase tracking-wider text-ink-faint mt-3">Get it</div>
      <ul className="list-none p-0 space-y-1 mt-1">
        {d.distributions.map((x) => (
          <li key={x.path} className="text-sm">
            <Link href={x.path} className="font-mono text-accent font-semibold">
              {x.path}
            </Link>{" "}
            <span className="text-ink-muted">— {x.label}</span>{" "}
            <span className="text-ink-faint">({x.encodingFormat})</span>
          </li>
        ))}
      </ul>

      <div className="text-xs text-ink-faint mt-3 font-mono">
        fields: {d.variableMeasured.join(", ")}
      </div>
      {d.temporalCoverage ? (
        <div className="text-xs text-ink-faint mt-1 font-mono">covers: {d.temporalCoverage}</div>
      ) : null}
      <div className="text-xs text-ink-faint mt-1">{d.freshness_note}</div>
      {d.methodology ? (
        <div className="text-xs text-ink-faint mt-1">
          rights &amp; method: <Link href={d.methodology}>{d.methodology}</Link>
        </div>
      ) : null}
    </li>
  );
}

export default function DatasetsIndex() {
  const cc0 = DATASETS.filter((d) => d.tier === "cc0").length;
  const jsonLd = toDataCatalogJsonLd();

  return (
    <div className="prose max-w-3xl mx-auto py-12 px-4">
      {/* Inline schema.org/DataCatalog — every dataset, one crawl. the-finding.md Plant C. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>Datasets</h1>

      <p className="text-lg">
        The datasets Cambridge TCG publishes as an <strong>open data commons</strong>.
        The <Link href="/data">/data</Link> page lists the <em>endpoints</em>; this
        lists the <em>datasets</em> — what each one is, under what licence, and where
        to get it.
      </p>

      <p>
        Each dataset states the licence that is <strong>true</strong>, never the
        convenient one. Our own realised trades, operational counts, source
        registry, and gap corpus are <strong>{cc0} CC0 datasets</strong> — ours to
        dedicate to the public domain. The bulk card catalogue is a mix of
        upstream-owned fields over a Cambridge-authored spine, so it is{" "}
        <code>NOASSERTION</code> — never relabelled CC0. The rights reasoning
        behind every source lives in the{" "}
        <Link href="/methodology/data-intentions">declaration of data intentions</Link>.
      </p>

      <p className="text-sm text-ink-muted">
        Machine-readable: <Link href="/api/v1/datasets" className="font-mono">/api/v1/datasets</Link>{" "}
        (envelope) ·{" "}
        <Link href="/api/v1/datasets?format=jsonld" className="font-mono">?format=jsonld</Link>{" "}
        (schema.org DataCatalog, for dataset search &amp; crawlers). This page carries
        the same JSON-LD inline.
      </p>

      <hr />

      <ul className="list-none p-0 space-y-4">
        {DATASETS.map((d) => (
          <DatasetCard key={d.id} d={d} />
        ))}
      </ul>

      <hr />

      <p className="text-xs text-ink-faint">
        A dataset&apos;s licence here mirrors the route that serves it; the{" "}
        <code>redistribution</code> audit fails the build if a CC0 surface ever
        draws from a non-redistributable source. Discoverability doctrine:{" "}
        docs/connections/the-finding.md. Rights framework:{" "}
        docs/methodology/source-intake.md.
      </p>
    </div>
  );
}
