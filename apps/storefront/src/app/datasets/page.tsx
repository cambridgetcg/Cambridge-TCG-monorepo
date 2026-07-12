/**
 * /datasets — dataset availability and rights.
 *
 * /data lists the ENDPOINTS (routes). This lists the DATASETS (artefacts):
 * what is available, what is paused, the aggregate rights, and where each
 * surface lives. The inline schema.org graph includes available datasets only.
 *
 * CC0 covers the authored catalog descriptions, not the records described.
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
  title: "Dataset status catalog",
  description:
    "Available Cambridge TCG datasets and paused publication surfaces, with aggregate rights and named source rights.",
  other: audienceMetadata("public-documentation", ["datasets", "data-rights", "schema.org"]),
};

function TierBadge({ tier }: { tier: CommonsTier }) {
  const [label, cls] =
    tier === "cc0"
      ? ["CC0-1.0", "bg-ok/10 text-ok border-ok/30"]
      : ["NOASSERTION", "bg-warning/10 text-warning border-warning/30"];
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function AvailabilityBadge({ availability }: { availability: DatasetEntry["availability"] }) {
  const [label, cls] = availability === "available"
    ? ["available", "bg-ok/10 text-ok border-ok/30"]
    : ["paused", "bg-surface-subtle text-ink-muted border-border-subtle"];
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
        <AvailabilityBadge availability={d.availability} />
      </div>

      <p className="text-sm text-ink-muted mt-1">{d.description}</p>

      <div className="text-[10px] uppercase tracking-wider text-ink-faint mt-3">
        {d.availability === "available" ? "Get it" : "Status"}
      </div>
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
        fields: {d.variableMeasured.length > 0 ? d.variableMeasured.join(", ") : "none (status only)"}
      </div>
      <div className="text-xs text-ink-faint mt-2">
        Sources: {d.sourceRights.map((right) => `${right.source} (${right.license})`).join("; ")}
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
  const available = DATASETS.filter((d) => d.availability === "available").length;
  const paused = DATASETS.length - available;
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
        The <Link href="/data">/data</Link> page lists endpoints. This page lists
        dataset-shaped resources: <strong>{available} available</strong> and{" "}
        <strong>{paused} paused</strong>, with their aggregate rights and source
        rights stated separately.
      </p>

      <p>
        <code>CC0-1.0</code> on the catalog response covers these Cambridge-authored
        descriptions only. It does not license the records they describe. Mixed or
        undeclared record rights remain <code>NOASSERTION</code>; paused paths are
        status notices and are excluded from the crawler dataset graph. The rights
        reasoning behind every source lives in the{" "}
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
        Availability and rights here mirror the serving route. The{" "}
        <code>redistribution</code> audit protects the catalog-metadata boundary.
        Discoverability doctrine:{" "}
        docs/connections/the-finding.md. Rights framework:{" "}
        docs/methodology/source-intake.md.
      </p>
    </div>
  );
}
