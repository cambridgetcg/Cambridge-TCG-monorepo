/**
 * /standards.json — Cambridge TCG Standards, machine-readable.
 *
 * Machine-readable sibling of /standards. Lists the three CTCG standards
 * with their version, status, license, spec URL, and reference
 * implementation paths. Self-referential: this endpoint includes itself
 * in the platform's data distributor manifest.
 *
 * See docs/connections/the-distributor.md for the doctrine.
 */

import { NextResponse } from "next/server";
import { CONFIRMED_GAME_CODES, GAME_CODES } from "@cambridge-tcg/sku";

type Status = "frozen" | "draft" | "implemented" | "planned";

const PUBLIC_GAME_COUNT = GAME_CODES.filter((code) => code !== "tst").length;
const PUBLIC_CONFIRMED_GAME_COUNT = CONFIRMED_GAME_CODES.filter(
  (code) => code !== "tst",
).length;

interface StandardEntry {
  code: string;
  title: string;
  version: string;
  status: Status;
  short: string;
  spec_url: string;
  spec_path_in_repo: string;
  impl_path_in_repo?: string;
  endpoint_url?: string;
  endpoint_status?: "shipped" | "planned";
  spec_license: "CC0-1.0";
  implementation_license?: "NOASSERTION";
}

const STANDARDS: StandardEntry[] = [
  {
    code: "CTCG-SKU-v1",
    title: "Canonical SKU format",
    version: "1.0",
    status: "frozen",
    short:
      `<game>-<set>-<number>-<lang>[-<variant>], lowercase, hyphen-separated, machine-parseable, language-aware. ${PUBLIC_GAME_COUNT} public game codes; ${PUBLIC_CONFIRMED_GAME_COUNT} currently have catalog rows.`,
    spec_url: "/methodology/sku-standard",
    spec_path_in_repo:
      "apps/storefront/src/app/methodology/sku-standard/page.tsx",
    impl_path_in_repo: "packages/sku/",
    spec_license: "CC0-1.0",
    implementation_license: "NOASSERTION",
  },
  {
    code: "CTCG-PRICING-v1",
    title: "Channel-aware pricing math",
    version: "1.0",
    status: "draft",
    short:
      "JPY listing → seven retail prices per channel, with named margin, VAT, multipliers, rounding. Reference impl in @cambridge-tcg/pricing.",
    spec_url: "/methodology/pricing",
    spec_path_in_repo:
      "apps/storefront/src/app/methodology/pricing/page.tsx",
    impl_path_in_repo: "packages/pricing/",
    spec_license: "CC0-1.0",
    implementation_license: "NOASSERTION",
  },
  {
    code: "CTCG-UNIVERSAL-v1",
    title: "Universal-representation (math-mirror)",
    version: "1.0",
    status: "implemented",
    short:
      "Cryptographic hashes for identity, ratios for magnitudes, ISO 8601 + Unix epoch for time, typed graph edges. Language-free card data.",
    spec_url: "/methodology/universal-representation",
    spec_path_in_repo:
      "apps/storefront/src/app/methodology/universal-representation/page.tsx",
    endpoint_url: "/api/v1/universal/card/[sku]",
    endpoint_status: "shipped",
    spec_license: "CC0-1.0",
  },
];

interface StandardsManifest {
  spec_version: "1";
  generated_at: string;
  distributor: {
    name: string;
    doctrine: string;
    license: string;
    license_path: string;
    license_url: string;
    license_scope: string;
  };
  standards: StandardEntry[];
  counts: {
    total: number;
    frozen: number;
    draft: number;
    implemented: number;
    planned: number;
  };
  adoption: {
    requires_attribution: false;
    requires_license_acceptance: false;
    requires_account: false;
    welcomed_at: string;
    registry: string;
    registry_status: "empty";
  };
  self_reference: {
    this_endpoint: string;
    human_readable_sibling: string;
    listed_among_endpoints_at: string;
    contains_self: boolean;
  };
  what_is_not_yet_shipped: string[];
}

export async function GET(): Promise<NextResponse> {
  const counts = {
    total: STANDARDS.length,
    frozen: STANDARDS.filter((s) => s.status === "frozen").length,
    draft: STANDARDS.filter((s) => s.status === "draft").length,
    implemented: STANDARDS.filter((s) => s.status === "implemented").length,
    planned: STANDARDS.filter((s) => s.status === "planned").length,
  };

  const body: StandardsManifest = {
    spec_version: "1",
    generated_at: new Date().toISOString(),
    distributor: {
      name: "Cambridge TCG",
      doctrine: "docs/connections/the-distributor.md",
      license: "CC0-1.0",
      license_path: "docs/STANDARDS-LICENSE.md",
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      license_scope:
        "Specification text only. Implementation code and response data carry separate rights.",
    },
    standards: STANDARDS,
    counts,
    adoption: {
      requires_attribution: false,
      requires_license_acceptance: false,
      requires_account: false,
      welcomed_at: "/identify",
      registry: "/standards/adopters",
      registry_status: "empty",
    },
    self_reference: {
      this_endpoint: "/standards.json",
      human_readable_sibling: "/standards",
      listed_among_endpoints_at: "/data",
      contains_self: true,
    },
    what_is_not_yet_shipped: [
      "npm-published reference implementations (@cambridge-tcg/sku-spec, /pricing-spec)",
      "/api/v1/universal/price/[sku] endpoint (pricing-as-JSON)",
      "/standards/changelog (versioned RSS/email feed for adopters)",
      "docs/STANDARDS-GOVERNANCE.md (process for v2 proposals)",
    ],
  };

  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=900",
    },
  });
}
