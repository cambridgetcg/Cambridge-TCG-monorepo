import { GAME_CODES } from "@cambridge-tcg/sku";

export type StandardStatus = "frozen" | "draft" | "implemented" | "planned";

export interface StandardEntry {
  code: string;
  title: string;
  version: string;
  status: StandardStatus;
  short: string;
  spec_url: string;
  spec_path_in_repo: string;
  impl_path_in_repo?: string;
  endpoint_url?: string;
  endpoint_status?: "shipped" | "planned";
  spec_license: "CC0-1.0";
  implementation_license?: "NOASSERTION";
  implementation_license_reference?: string;
  implementation_license_note?: string;
  validator_url?: string;
  validation_endpoint?: { url: string; method: "POST"; authentication: "none"; scope: "syntax_only" };
}

/** Registry size only. No database, provider or current coverage lookup. */
export const PUBLIC_GAME_CODE_COUNT = GAME_CODES.filter((code) => code !== "tst").length;

const IMPLEMENTATION_RIGHTS = {
  implementation_license: "NOASSERTION",
  implementation_license_reference: "https://www.apache.org/licenses/LICENSE-2.0",
  implementation_license_note: "Implementation rights follow the repository LICENSE (Apache-2.0) and applicable more-specific notices. NOASSERTION here does not assert an absence of a repository license. The repository is public on GitHub and no packages are published to npm; package distribution is a release gate, not current availability.",
} as const;

/** One descriptive registry for the human page and the existing JSON contract. */
export const STANDARDS: readonly StandardEntry[] = [
  {
    code: "CTCG-SKU-v1",
    title: "Canonical SKU format",
    version: "1.0",
    status: "frozen",
    short: `<game>-<set>-<number>-<lang>[-<variant>], lowercase and hyphen-separated. ${PUBLIC_GAME_CODE_COUNT} public game codes are registered. Validation checks syntax; it does not verify catalog coverage, language membership or a physical printing.`,
    spec_url: "/methodology/sku-standard",
    spec_path_in_repo: "apps/storefront/src/app/methodology/sku-standard/page.tsx",
    impl_path_in_repo: "packages/sku/",
    validator_url: "/standards/validator",
    validation_endpoint: { url: "/api/v1/identifiers/validate", method: "POST", authentication: "none", scope: "syntax_only" },
    spec_license: "CC0-1.0",
    ...IMPLEMENTATION_RIGHTS,
  },
  {
    code: "CTCG-PRICING-v1",
    title: "Channel-aware pricing math",
    version: "1.0",
    status: "draft",
    short: "Reference channel-price calculations from a JPY amount, with explicit exchange rate, VAT, margin and rounding inputs. A calculation does not establish market value or permission to publish a source price.",
    spec_url: "/methodology/pricing",
    spec_path_in_repo: "apps/storefront/src/app/methodology/pricing/page.tsx",
    impl_path_in_repo: "packages/pricing/",
    spec_license: "CC0-1.0",
    ...IMPLEMENTATION_RIGHTS,
  },
  {
    code: "CTCG-UNIVERSAL-v1",
    title: "Universal-representation (math-mirror)",
    version: "1.0",
    status: "implemented",
    short: "Structured card records with content hashes, typed links and explicit unknown or withheld fields. A content hash is not proof of a physical card or its authenticity.",
    spec_url: "/methodology/universal-representation",
    spec_path_in_repo: "apps/storefront/src/app/methodology/universal-representation/page.tsx",
    endpoint_url: "/api/v1/universal/card/[sku]",
    endpoint_status: "shipped",
    spec_license: "CC0-1.0",
  },
  {
    code: "CTCG-NAMES-v1",
    title: "Card names and official translations",
    version: "1.0",
    status: "draft",
    short: "One name per card key (<game>-<set>-<number>) and language, marked official, vendor, community or machine, with its source. Versioned rules take condition, rarity and variant markers off shop titles or refuse; agreement between sources never makes a name official, and a name never establishes a SKU mapping.",
    spec_url: "/methodology/card-names",
    spec_path_in_repo: "apps/storefront/src/app/methodology/card-names/page.tsx",
    impl_path_in_repo: "packages/sku/src/names.ts",
    spec_license: "CC0-1.0",
    ...IMPLEMENTATION_RIGHTS,
  },
];

export const STANDARDS_LINKS = {
  contracts: "/standards/card-data",
  roadmap: "/roadmap",
  validator: "/standards/validator",
  manifest: "/standards.json",
} as const;

/** Keeps the existing manifest keys, standard IDs and version statuses stable. */
export function standardsManifest(generatedAt: string = new Date().toISOString()) {
  return {
    spec_version: "1",
    generated_at: generatedAt,
    distributor: {
      name: "Cambridge TCG",
      doctrine: "docs/connections/the-distributor.md",
      license: "CC0-1.0",
      license_path: "docs/STANDARDS-LICENSE.md",
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      license_scope: "Specification text only. Implementation code, response data and artwork carry separate rights.",
    },
    standards: STANDARDS,
    counts: {
      total: STANDARDS.length,
      frozen: STANDARDS.filter((standard) => standard.status === "frozen").length,
      draft: STANDARDS.filter((standard) => standard.status === "draft").length,
      implemented: STANDARDS.filter((standard) => standard.status === "implemented").length,
      planned: STANDARDS.filter((standard) => standard.status === "planned").length,
    },
    adoption: {
      requires_attribution: false,
      requires_license_acceptance: false,
      requires_account: false,
      welcomed_at: "/identify",
      registry: "/standards/adopters",
      registry_status: "empty",
      scope: "Specification text only; these declarations do not grant API access or data and image reuse rights.",
    },
    self_reference: {
      this_endpoint: "/standards.json",
      human_readable_sibling: "/standards",
      listed_among_endpoints_at: "/data",
      contains_self: true,
    },
    what_is_not_yet_shipped: [
      "npm releases of the private workspace reference packages (packages/sku and packages/pricing)",
      "/api/v1/universal/price/[sku] endpoint",
      "/standards/changelog (versioned feed)",
      "docs/STANDARDS-GOVERNANCE.md (process for v2 proposals)",
    ],
    registry_summary: {
      public_game_codes: PUBLIC_GAME_CODE_COUNT,
      scope: "registry_only",
      live_coverage_checked: false,
    },
    links: STANDARDS_LINKS,
  };
}
