/** Authored product direction. Status describes source review, never live coverage. */
export const PLATFORM = {
  title: "Cambridge TCG — open-source TCG data infrastructure",
  description: "Building open-source tools and shared standards for card identity, images, prices and market data.",
  mission: "Make trading-card data easier to identify, connect and use responsibly.",
  codeReference: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo",
} as const;

export const DATA_FOUNDATIONS = [
  {
    id: "sku", title: "SKU & identity", icon: "card",
    purpose: "Give each printing a clear, traceable identity.",
    status: "Foundation implemented",
    current: "Versioned syntax, validation and bounded card lookup. A valid SKU is not proof of an exact printing.",
    next: "Evidence-backed source mappings with language, finish and variant preserved. Keep ambiguous matches unresolved.",
    acceptance: "Collision fixtures pass; every exact mapping carries evidence; raw source IDs and correction history survive normalization.",
    href: "/standards/validator", linkLabel: "Try the identifier validator",
  },
  {
    id: "images", title: "Images & rights", icon: "eye",
    purpose: "Connect artwork to the right card and its permissions.",
    status: "Reference contract implemented",
    current: "Market and universal-card reads label English base images as references and share source checks. Other image readers, catalogue provenance and cache removal remain open.",
    next: "One image contract: exact or reference image, source, credit, allowed uses, dimensions, checksum and removal status.",
    acceptance: "Human and API paths apply the same reviewed permissions. Unknown rights stay withheld; corrections and removals reach caches.",
    href: "/legal/card-images", linkLabel: "Read current image policy",
  },
  {
    id: "pricing", title: "Prices & provenance", icon: "tape",
    purpose: "Keep the amount, source and meaning together.",
    status: "Partial integrations",
    current: "Native decimal amounts, currency, source metrics and retained history contracts exist. Member access and imports determine availability.",
    next: "Reproducible permitted imports, mapping review, freshness reporting and comparison only across compatible observations.",
    acceptance: "No guessed zero, FX or source average. Units, metric, printing, condition, time and source/use permission travel with every record.",
    href: "/prices", linkLabel: "Explore available prices",
  },
  {
    id: "market", title: "Market observations", icon: "pulse",
    purpose: "Separate asking prices, sales and market summaries.",
    status: "Integration design planned",
    current: "Existing listing and history code is not a unified market feed. New paid commerce remains retired.",
    next: "A source-qualified observation contract that distinguishes listings, completed sales, aggregates and computed references.",
    acceptance: "Asks never become sold prices. Aggregates identify their sample, exclusions and delay; personal trading records require an approved publication basis.",
    href: "/methodology/cross-source-pricing", linkLabel: "Understand source differences",
  },
] as const;

export const DELIVERY_STAGES = [
  {
    id: "baseline", title: "Reconcile the foundations", status: "In progress", dependsOn: [],
    outcome: "Align image/text publication paths, inventory code and data rights, and verify a clean public release route.",
    gate: "One reviewed policy per source and use; consistent human/API output; release scan and reproducible build evidence.",
  },
  {
    id: "identity", title: "Make identity dependable", status: "Planned", dependsOn: ["baseline"],
    outcome: "Version printing identity and source crosswalks, with ambiguity, evidence and corrections as first-class records.",
    gate: "Golden fixtures cover aliases, leading zeros, languages, reprints and finishes without silent merges.",
  },
  {
    id: "observations", title: "Connect images and prices", status: "Planned", dependsOn: ["identity"],
    outcome: "Attach rights-labelled image records and native price observations to the same printing contract.",
    gate: "Field-level permission, attribution, native units, freshness and removal behavior pass shared contract fixtures.",
  },
  {
    id: "integrations", title: "Pilot permitted providers", status: "Planned", dependsOn: ["observations"],
    outcome: "Expand reviewed Scryfall and Cardmarket paths; assess a multilingual Pokémon catalog and licensed market inputs.",
    gate: "Permission recorded; imports are repeatable and bounded; mapping quality, failures and source coverage are measurable.",
  },
  {
    id: "distribution", title: "Release interoperable tools", status: "Planned", dependsOn: ["integrations"],
    outcome: "Publish independently usable packages, conformance fixtures and client examples; expose qualified market data through the same read layer.",
    gate: "External consumers reproduce fixtures; compatibility and correction policies are documented; repository/package access and every published field are verified.",
  },
] as const;

/** Public-safe fields only. No internal notes, credentials or proposed callable URLs. */
export const INTEGRATION_ROADMAP = {
  schema: "cambridgetcg.integration-roadmap/1",
  reviewed_at: "2026-09-29",
  scope: "planning_snapshot",
  positioning: PLATFORM.description,
  timing: "Dependency-ordered milestones; no release dates or live-service guarantees.",
  release_status: "Reference packages are workspace-only. Public repository access and package distribution require verification before release.",
  rights: "Code, specification text, images and source data have separate terms. Normalization does not create redistribution rights.",
  foundations: DATA_FOUNDATIONS,
  stages: DELIVERY_STAGES,
  links: { html: "/roadmap", agents: "/agents", standards: "/standards", contracts: "/api/v1/contracts/card-data" },
} as const;
