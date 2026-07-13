/**
 * Public dataset inventory.
 *
 * This registry describes what a caller can actually retrieve today. It also
 * names paused publication surfaces separately so a status endpoint cannot be
 * mistaken for a live dataset. The descriptions are Cambridge-authored CC0
 * metadata; that license does not change the rights or availability of any
 * dataset being described.
 */

const SITE = "https://cambridgetcg.com";

export type CommonsTier = "cc0" | "noassertion";
export type DatasetAvailability = "available" | "paused";

export interface Distribution {
  /** Whether the path serves records or only publication status. */
  kind: "api" | "download" | "status";
  path: string;
  encodingFormat: string;
  label: string;
}

export interface DatasetSourceRight {
  /** Source name used by the serving surface, or a clearly named dynamic set. */
  source: string;
  /** The source tier as emitted, or an honest declaration that it varies. */
  license: string;
  note?: string;
}

export interface DatasetEntry {
  id: string;
  name: string;
  description: string;
  /** Aggregate rights for the dataset records, not for this catalog entry. */
  license: string;
  tier: CommonsTier;
  availability: DatasetAvailability;
  recordsPublished: boolean;
  sourceRights: readonly DatasetSourceRight[];
  temporalCoverage?: string;
  distributions: readonly Distribution[];
  methodology?: string;
  variableMeasured: readonly string[];
  keywords: readonly string[];
  freshness_note: string;
}

/**
 * Entries mirror the serving surfaces. Paused entries remain visible for
 * transparency, but `toDataCatalogJsonLd` deliberately excludes them because
 * a zero-row status response is not a published dataset.
 */
export const DATASETS: readonly DatasetEntry[] = [
  {
    id: "coverage",
    name: "Observation coverage",
    description:
      "Current summaries and bounded, zero-filled daily histories from the observation archive: operational row counts, distinct-card breadth, game identifiers, snapshot ranges, and freshness. Each response separately names the Cambridge aggregation, its internal catalog game-mapping dependency, and the upstream sources that actually contributed. Aggregate rights remain NOASSERTION.",
    license: "NOASSERTION",
    tier: "noassertion",
    availability: "available",
    recordsPublished: true,
    sourceRights: [
      {
        source: "cambridge-tcg.coverage-aggregation",
        license: "cc0",
        note: "Cambridge-authored aggregation shape and explanatory metadata only.",
      },
      {
        source: "cambridge-tcg.catalog-game-mapping",
        license: "proprietary",
        note: "Conservative rights tier for the internal cards-to-games mapping used to derive game identifiers.",
      },
      {
        source: "dynamic upstream lineage",
        license: "varies per response",
        note: "Actually observed upstream ids retain their reviewed tiers; unknown ids default to proprietary. Read each response's parallel _meta.sources and _meta.source_license arrays.",
      },
    ],
    distributions: [
      {
        kind: "api",
        path: "/api/v1/coverage",
        encodingFormat: "application/json",
        label: "Current coverage summary and breakdowns",
      },
      {
        kind: "api",
        path: "/api/v1/coverage/history",
        encodingFormat: "application/json",
        label: "Bounded daily coverage history",
      },
    ],
    methodology: "/methodology/data-intentions",
    variableMeasured: [
      "observations",
      "distinct_cards",
      "earliest_snapshot",
      "latest_snapshot",
      "days_of_coverage",
      "freshest_age_hours",
      "completed_days",
      "observed_completed_days",
      "zero_observation_completed_days",
      "observation_completed_day_ratio",
      "observed_days_including_current",
      "game",
      "source",
    ],
    keywords: ["catalogue coverage", "observation archive", "data completeness", "tcg"],
    freshness_note:
      "Both coverage routes are computed from the wholesale observation database on request; each returns 503 when that database cannot answer, the per-process three-read ceiling is full, or the coverage role reaches its three-connection limit.",
  },
  {
    id: "sources-registry",
    name: "Data source registry",
    description:
      "The registered upstream source inventory: access method, source license tier, redistribution flag, ingestion status, game coverage, and reviewed terms notes. Structured numeric run summaries appear only when the wholesale service answers; free-text run and quarantine fields are withheld. Aggregate rights remain NOASSERTION.",
    license: "NOASSERTION",
    tier: "noassertion",
    availability: "available",
    recordsPublished: true,
    sourceRights: [
      {
        source: "ctcg-derived",
        license: "proprietary",
        note: "Reviewed static source-registry metadata.",
      },
      {
        source: "wholesale-rds.ingest_run",
        license: "internal-only when present",
        note: "Only timestamps, status, and numeric counts are projected publicly.",
      },
    ],
    distributions: [
      {
        kind: "api",
        path: "/api/v1/sources",
        encodingFormat: "application/json",
        label: "Registered sources and current status",
      },
    ],
    methodology: "/methodology/data-intentions",
    variableMeasured: [
      "id",
      "access",
      "license",
      "redistribute",
      "status",
      "games",
      "tos_notes",
      "last_run",
    ],
    keywords: ["data provenance", "source rights", "license registry", "tcg"],
    freshness_note:
      "Registry metadata changes on deploy; last-run blocks depend on the live wholesale service.",
  },
  {
    id: "known-gaps",
    name: "Known platform gaps",
    description:
      "A static ledger of known platform deficiencies. Each record names a gap, its domain, code or documentation citation, typed primitive, audit, lifecycle status, and the strength created by making the gap inspectable. It is not a list of missing cards or upstream identifiers.",
    license: "CC0-1.0",
    tier: "cc0",
    availability: "available",
    recordsPublished: true,
    sourceRights: [
      {
        source: "cambridge-tcg.known-gaps-registry",
        license: "cc0",
        note: "The typed corpus and its doctrine explicitly dedicate this authored ledger to CC0.",
      },
    ],
    distributions: [
      {
        kind: "api",
        path: "/api/v1/gaps",
        encodingFormat: "application/json",
        label: "Current platform gap ledger",
      },
    ],
    methodology: "/methodology/known-gaps",
    variableMeasured: [
      "id",
      "name",
      "domain",
      "citation",
      "primitive",
      "audit",
      "status",
      "strength",
    ],
    keywords: ["known gaps", "data quality", "transparency", "platform status"],
    freshness_note: "Updated when the typed gap ledger changes and the application is deployed.",
  },
  {
    id: "uk-collector-events",
    name: "UK collector events — reviewed demonstrator",
    description:
      "A four-event, source-backed demonstrator of public trading-card events, established public venues, public organisations or brands, field-level evidence, explicit conflicts, and tri-state accessibility facts. One record is an event listing with stable opaque ids and revision metadata. It is not a comprehensive UK directory and contains no people, direct personal contacts, attendee lists, vendor lists, images, or copied marketing prose.",
    license: "NOASSERTION",
    tier: "noassertion",
    availability: "available",
    recordsPublished: true,
    sourceRights: [
      {
        source: "collector-events reviewed public-page evidence set",
        license: "public-pages-no-open-data-grant",
        note: "Exact source ids and rights reviews are published at /api/v1/collector-events/sources; only minimal bare facts are admitted.",
      },
      {
        source: "Postcodes.io postcode geometry",
        license: "OS OpenData Licence",
        note: "Attributed postcode centroids only, never venue entrances.",
      },
    ],
    temporalCoverage: "2026-08/2026-10",
    distributions: [
      { kind: "api", path: "/api/v1/collector-events", encodingFormat: "application/json", label: "Events with filters and field evidence" },
      { kind: "api", path: "/api/v1/collector-venues", encodingFormat: "application/json", label: "Public venues and approximate postcode centroids" },
      { kind: "api", path: "/api/v1/collector-organisations", encodingFormat: "application/json", label: "Public organisations and organisation-level links" },
      { kind: "download", path: "/api/v1/collector-events/calendar.ics", encodingFormat: "text/calendar", label: "iCalendar feed (conflicts omitted by default)" },
      { kind: "download", path: "/api/v1/collector-events/map.geojson", encodingFormat: "application/geo+json", label: "GeoJSON event map (postcode centroids)" },
      { kind: "api", path: "/api/v1/collector-events/schema", encodingFormat: "application/json", label: "CC0 JSON Schema bundle" },
    ],
    methodology: "/methodology/collector-events",
    variableMeasured: ["event id", "name", "status", "time relation", "integrity state", "schedule", "venue", "organisation roles", "accessibility", "conflicts", "field sources", "review due date"],
    keywords: ["UK collector events", "trading card show", "event calendar", "GeoJSON", "iCalendar", "provenance", "NOASSERTION"],
    freshness_note: "Manually reviewed demonstrator on a weekly review cadence. Every event carries its last successful check and next review due time; stale review state is visible rather than masked.",
  },
  {
    id: "agent-ladder",
    name: "Agent ladder publication status",
    description:
      "Global agent-ladder publication is paused. Registration and bearer authentication do not grant permission for indexed leaderboard publication, and existing agent rows have no versioned ladder-publication receipt. The page performs no agent database read and publishes no handle, profile, match, or rating row.",
    license: "NOASSERTION",
    tier: "noassertion",
    availability: "paused",
    recordsPublished: false,
    sourceRights: [
      {
        source: "agent-ladder-publication-policy",
        license: "cc0",
        note: "The status description is Cambridge-authored; no agent row is included.",
      },
    ],
    distributions: [
      {
        kind: "status",
        path: "/leaderboards/agents",
        encodingFormat: "text/html",
        label: "Publication status; zero agent rows",
      },
    ],
    methodology: "/methodology/agents",
    variableMeasured: [],
    keywords: ["autonomous agents", "leaderboard", "publication status", "paused"],
    freshness_note:
      "Paused until an explicit agent-ladder-publication-v1 choice and withdrawal boundary are stored.",
  },
  {
    id: "sold-comps",
    name: "Sold comps publication status",
    description:
      "Sold-comps record publication is paused. The public paths return policy status only, with zero price buckets and no transaction database read. They do not publish prices, counts, dates, conditions, people, or threshold totals.",
    license: "NOASSERTION",
    tier: "noassertion",
    availability: "paused",
    recordsPublished: false,
    sourceRights: [
      { source: "publication-policy", license: "internal-only" },
    ],
    distributions: [
      {
        kind: "status",
        path: "/api/v1/sold-comps",
        encodingFormat: "application/json",
        label: "Publication status; zero record buckets",
      },
    ],
    methodology: "/methodology/data-intentions",
    variableMeasured: [],
    keywords: ["sold comps", "publication status", "paused"],
    freshness_note: "Paused pending a purpose-specific publication rule and privacy review.",
  },
  {
    id: "card-catalog",
    name: "Bulk card catalog publication status",
    description:
      "Bulk card-row publication is paused pending field-level upstream lineage and a reviewed publication rule. The public path returns HTTP 503 with one manifest, one footer, and zero card rows; it performs no catalog database read.",
    license: "NOASSERTION",
    tier: "noassertion",
    availability: "paused",
    recordsPublished: false,
    sourceRights: [
      { source: "ctcg-publication-policy", license: "cc0" },
    ],
    distributions: [
      {
        kind: "status",
        path: "/data/catalog.jsonl",
        encodingFormat: "application/x-ndjson",
        label: "HTTP 503 publication status; zero card rows",
      },
    ],
    methodology: "/methodology/data-intentions",
    variableMeasured: [],
    keywords: ["card catalog", "bulk data", "publication status", "paused"],
    freshness_note: "Paused pending field-level rights decisions; Retry-After is one day.",
  },
] as const;

export const AVAILABLE_DATASETS = DATASETS.filter(
  (entry) => entry.availability === "available" && entry.recordsPublished,
);

const ORG = { "@type": "Organization", name: "Cambridge TCG", url: SITE } as const;

function jsonLdLicense(license: string): string {
  return license === "CC0-1.0"
    ? "https://creativecommons.org/publicdomain/zero/1.0/"
    : license;
}

/** One available entry to a schema.org Dataset node. */
export function toDatasetJsonLd(entry: DatasetEntry): Record<string, unknown> {
  const primary = entry.distributions[0];
  const canonicalUrl = `${SITE}${primary.path.replace(/\{.*?\}/g, "").replace(/\/$/, "")}`;
  const rights = entry.license === "NOASSERTION"
    ? {
        usageInfo: `${SITE}${entry.methodology ?? "/methodology/data-intentions"}`,
        conditionsOfAccess:
          "Free to access. No response-wide reuse licence is asserted; review the dataset methodology and attached source rights before reuse.",
      }
    : {
        license: jsonLdLicense(entry.license),
      };
  return {
    "@type": "Dataset",
    "@id": `${SITE}/datasets#${entry.id}`,
    name: entry.name,
    description: entry.description,
    url: canonicalUrl,
    ...rights,
    creator: ORG,
    publisher: ORG,
    isAccessibleForFree: true,
    inLanguage: "en",
    ...(entry.temporalCoverage ? { temporalCoverage: entry.temporalCoverage } : {}),
    variableMeasured: [...entry.variableMeasured],
    keywords: [...entry.keywords],
    distribution: entry.distributions.map((distribution) => ({
      "@type": "DataDownload",
      encodingFormat: distribution.encodingFormat,
      contentUrl: `${SITE}${distribution.path}`,
      name: distribution.label,
    })),
  };
}

/** The crawler graph contains available datasets only, never paused status paths. */
export function toDataCatalogJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "DataCatalog",
    "@id": `${SITE}/datasets`,
    name: "Cambridge TCG dataset status catalog",
    description:
      "An inventory of datasets that Cambridge TCG currently publishes, including bounded observation-coverage history and the reviewed UK collector-events demonstrator. Aggregate rights remain NOASSERTION where records mix sources or the serving route has not declared reusable rights. Paused, zero-row publication surfaces are documented on the human and envelope views but excluded from this crawler graph.",
    url: `${SITE}/datasets`,
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    publisher: ORG,
    dataset: AVAILABLE_DATASETS.map(toDatasetJsonLd),
  };
}
