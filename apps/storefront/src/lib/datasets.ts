/**
 * The dataset catalog — the open data commons, made discoverable AS DATA.
 *
 * The commons is already ENDPOINT-indexed (/data lists routes; the manifest
 * lists resources). This file is the missing DATASET index: one typed
 * registry of the artefacts we actually publish, each carrying its TRUE
 * licence, so humans and machines can answer "what datasets exist here, under
 * what terms, covering what, updated how often, and where do I get them?"
 * from one place.
 *
 * It exists to complete docs/connections/the-finding.md "Plant C": the agent
 * ladder already announces itself as a schema.org/Dataset for Google Dataset
 * Search + AI crawlers, but it stopped at one dataset. This registry lifts the
 * whole CC0 commons to the same discoverability, and renders a schema.org
 * /DataCatalog so an aggregator indexes every dataset at once.
 *
 * ── One rule: each entry states the licence that is TRUE, never convenient ──
 * The first-party datasets (our own realised trades, our own operational
 * counts, our own registry + gap corpus) are CC0 — ours to dedicate. The bulk
 * card catalog is a MIX of upstream-owned fields (names, numbers, set
 * structure that publishers hold) over a Cambridge-authored spine, so it is
 * NOASSERTION — never relabelled CC0 (this mirrors the redistribution audit's
 * Check 3, which forces /data/catalog.jsonl to emit NOASSERTION). The agent
 * ladder carries its own first-party terms. The catalog describes each as it
 * is; describing a NOASSERTION dataset does not make the description non-CC0
 * (the registry text is our own — the /api/v1/datasets envelope is CC0).
 *
 * This registry is READ-ONLY metadata. It mirrors the licence declarations the
 * source-rights-truth pass hardened on the real routes; it never overrides
 * them. When a route's licence changes, change it there and here — one truth.
 */

const SITE = "https://cambridgetcg.com";

/**
 * How a dataset sits in the commons, for the human badge + honest colour.
 * - `cc0`             — first-party, dedicated to the public domain (CC0-1.0).
 * - `first-party-terms` — ours, but governed by a named terms page, not CC0.
 * - `noassertion`     — a mix of upstream-owned fields; no single licence can
 *                       be asserted over the whole; reuse upstream at your own
 *                       risk under upstream terms.
 */
export type CommonsTier = "cc0" | "first-party-terms" | "noassertion";

export interface Distribution {
  /** What you get: an API surface or a bulk download. */
  kind: "api" | "download";
  /** Relative path on this origin. */
  path: string;
  /** IANA/schema.org encodingFormat, e.g. "application/json", "application/jsonl". */
  encodingFormat: string;
  /** One-line human label. */
  label: string;
}

export interface DatasetEntry {
  /** Stable slug, also the JSON-LD @id anchor. */
  id: string;
  /** Human title. */
  name: string;
  /** Plain-language description of exactly what one row/record is. */
  description: string;
  /** The licence, stated truthfully: "CC0-1.0" | "NOASSERTION" | a terms URL. */
  license: string;
  /** Commons colour for the badge + honest framing. */
  tier: CommonsTier;
  /**
   * The per-origin licence tiers this dataset is BUILT from (parallel to the
   * envelope's _meta.source_license idiom). For a pure first-party set this is
   * ["cc0"]; for the mixed catalog it names the upstream tiers honestly.
   */
  source_license: readonly string[];
  /** schema.org temporalCoverage (open-ended ISO interval or note). */
  temporalCoverage?: string;
  /** Where to get it — one or more distributions. */
  distributions: readonly Distribution[];
  /** Human-readable methodology / rights page, if any. */
  methodology?: string;
  /** The fields a record carries (schema.org variableMeasured). */
  variableMeasured: readonly string[];
  /** Discovery keywords. */
  keywords: readonly string[];
  /** Honest note on how fresh / how it updates. */
  freshness_note: string;
}

/**
 * The registry. Order = surface order on /datasets. Every entry's `license` is
 * mirrored from the route that actually serves it — change both together.
 */
export const DATASETS: readonly DatasetEntry[] = [
  {
    id: "sold-comps",
    name: "First-party sold comps",
    description:
      "Anonymised, aggregated realised sale prices from Cambridge TCG's own market: completed peer-to-peer escrow trades and settled auctions. One record is a (card, condition) bucket with a sale count and price summary — published only where at least five sales exist (k-anonymity), so no individual trade is identifiable. No buyer, seller, payment, or shipping detail is present.",
    license: "CC0-1.0",
    tier: "cc0",
    source_license: ["cc0"],
    temporalCoverage: "2026-07/..",
    distributions: [
      { kind: "api", path: "/api/v1/sold-comps", encodingFormat: "application/json", label: "All published buckets" },
      { kind: "api", path: "/api/v1/sold-comps/{sku}", encodingFormat: "application/json", label: "Buckets for one card" },
    ],
    methodology: "/methodology/data-intentions",
    variableMeasured: ["sku", "condition", "sale_count", "min_price_gbp", "median_price_gbp", "max_price_gbp", "last_sold_at", "sale_channel"],
    keywords: ["trading card game", "sold prices", "market comps", "open data", "cc0", "collectors"],
    freshness_note: "Recomputed live from settled trades and auctions; grows as volume grows.",
  },
  {
    id: "coverage",
    name: "Catalogue coverage",
    description:
      "Operational counts and date ranges describing how much of each game's catalogue Cambridge TCG has observed: cards, sets, and freshness per source. Compiled facts about our own pipeline — no upstream price value, name, or mark is included.",
    license: "CC0-1.0",
    tier: "cc0",
    source_license: ["cc0"],
    distributions: [
      { kind: "api", path: "/api/v1/coverage", encodingFormat: "application/json", label: "Coverage counts + dates" },
    ],
    variableMeasured: ["game", "cards_observed", "sets_observed", "sources", "first_seen_at", "last_seen_at"],
    keywords: ["catalogue coverage", "data completeness", "open data", "cc0", "tcg"],
    freshness_note: "Reflects the live catalogue; updates as ingestion runs.",
  },
  {
    id: "sources-registry",
    name: "Data source registry",
    description:
      "The rights ledger: every upstream data source Cambridge TCG reads, with its access method, licence tier, redistribution boolean, ingestion status, and the terms-of-service reasoning that placed it there. This is the machine-readable form of the source-intake framework — the declared intentions behind every byte.",
    license: "CC0-1.0",
    tier: "cc0",
    source_license: ["cc0"],
    distributions: [
      { kind: "api", path: "/api/v1/sources", encodingFormat: "application/json", label: "All sources" },
      { kind: "api", path: "/api/v1/sources/{id}", encodingFormat: "application/json", label: "One source + run history" },
    ],
    methodology: "/methodology/data-intentions",
    variableMeasured: ["id", "access", "license", "redistribute", "status", "games", "tos_notes"],
    keywords: ["data provenance", "source rights", "licence registry", "open data", "cc0"],
    freshness_note: "Regenerated from the source-intake registry on every deploy.",
  },
  {
    id: "known-gaps",
    name: "Known gaps",
    description:
      "An honest inventory of what Cambridge TCG knows it is missing — sets or cards that exist upstream but have not yet been observed — as identifiers only, no upstream data. Publishing the shape of our ignorance is part of substrate honesty.",
    license: "CC0-1.0",
    tier: "cc0",
    source_license: ["cc0"],
    distributions: [
      { kind: "api", path: "/api/v1/gaps", encodingFormat: "application/json", label: "Known gaps corpus" },
    ],
    variableMeasured: ["game", "canonical_count", "observed_count", "unobserved_ids"],
    keywords: ["data gaps", "coverage", "honesty", "open data", "cc0"],
    freshness_note: "Diffed against canonical set lists as ingestion progresses.",
  },
  {
    id: "agent-ladder",
    name: "Agent ladder",
    description:
      "Glicko-2 rated ladder for autonomous (non-human) agents playing One Piece TCG on Cambridge TCG: public handle, claimed model tag, rating with deviation and volatility, matches played and won, last updated. A public record of machine minds at play.",
    license: `${SITE}/methodology/agents`,
    tier: "first-party-terms",
    source_license: ["cc0"],
    temporalCoverage: "2026/..",
    distributions: [
      { kind: "api", path: "/leaderboards/agents", encodingFormat: "text/html", label: "The ladder (also schema.org Dataset)" },
    ],
    methodology: "/methodology/agents",
    variableMeasured: ["public_handle", "display_name", "model_tag", "rating", "rating_deviation", "matches_played", "matches_won"],
    keywords: ["autonomous agents", "one piece tcg", "glicko-2", "leaderboard", "mcp"],
    freshness_note: "Updated continuously as agent matches complete.",
  },
  {
    id: "card-catalog",
    name: "Card catalogue (bulk)",
    description:
      "A bulk JSONL stream of the card catalogue Cambridge TCG carries: canonical SKU, name, set, number, game, and image references. This is a MIX of upstream-owned material (publisher names, numbers, set structure) over a Cambridge-authored spine, so no single licence can be asserted over the whole — reuse the upstream fields under upstream terms.",
    license: "NOASSERTION",
    tier: "noassertion",
    source_license: ["proprietary", "internal-only"],
    distributions: [
      { kind: "download", path: "/data/catalog.jsonl", encodingFormat: "application/jsonl", label: "Bulk catalogue (JSONL stream)" },
    ],
    methodology: "/methodology/data-intentions",
    variableMeasured: ["sku", "name", "set_code", "number", "game", "image_url"],
    keywords: ["card catalogue", "tcg", "bulk data", "noassertion"],
    freshness_note: "Streamed live from the catalogue; per-record licence carried inline. Not dedicated to the public domain.",
  },
] as const;

const ORG = { "@type": "Organization", name: "Cambridge TCG", url: SITE } as const;

/** One dataset entry → a schema.org/Dataset node (Google Dataset Search shape). */
export function toDatasetJsonLd(e: DatasetEntry): Record<string, unknown> {
  const primary = e.distributions[0];
  const canonicalUrl = `${SITE}${primary.path.replace(/\{.*?\}/g, "").replace(/\/$/, "")}`;
  return {
    "@type": "Dataset",
    "@id": `${SITE}/datasets#${e.id}`,
    name: e.name,
    description: e.description,
    url: canonicalUrl,
    license: e.license.startsWith("http")
      ? e.license
      : e.license === "CC0-1.0"
        ? "https://creativecommons.org/publicdomain/zero/1.0/"
        : "https://cambridgetcg.com/methodology/data-intentions",
    creator: ORG,
    publisher: ORG,
    isAccessibleForFree: true,
    inLanguage: "en",
    ...(e.temporalCoverage ? { temporalCoverage: e.temporalCoverage } : {}),
    variableMeasured: [...e.variableMeasured],
    keywords: [...e.keywords],
    distribution: e.distributions.map((d) => ({
      "@type": "DataDownload",
      encodingFormat: d.encodingFormat,
      contentUrl: `${SITE}${d.path}`,
      name: d.label,
    })),
  };
}

/** The whole registry → a schema.org/DataCatalog graph (one page, every dataset). */
export function toDataCatalogJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "DataCatalog",
    "@id": `${SITE}/datasets`,
    name: "Cambridge TCG open data commons",
    description:
      "The datasets Cambridge TCG publishes as an open data commons: first-party sold comps, catalogue coverage, the source-rights registry, known gaps, and the agent ladder — each carrying its true licence. First-party operational data is CC0; the bulk card catalogue is a mixed-rights export (NOASSERTION).",
    url: `${SITE}/datasets`,
    publisher: ORG,
    dataset: DATASETS.map(toDatasetJsonLd),
  };
}
