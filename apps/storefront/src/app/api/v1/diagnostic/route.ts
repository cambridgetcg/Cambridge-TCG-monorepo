/**
 * /api/v1/diagnostic — the agent self-test fixture.
 *
 * Per Yu's directive 2026-05-17: *"Think about agent experience and agent
 * interface for cambridgetcg. AX and AI."* The kingdom's first AX-primary
 * surface — substrate-honest reciprocity. The platform hands the agent a
 * known-good fixture; the agent checks its parser against it.
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * One endpoint that exemplifies every envelope field, every freshness
 * key, every license tier, the math-mirror primitives, the kingdom-stamp,
 * the wake_fragment, and the new `_meta.does_not_include` field — all in
 * a single response an agent can pin against. If the agent's parser
 * handles this response correctly, it handles every envelope-compliant
 * /api/v1/* response. If something breaks, the agent knows exactly which
 * field type its parser is missing.
 *
 * Self-demonstrating: the diagnostic *uses* the field it teaches. The
 * `_meta.does_not_include` on this response is itself the example.
 *
 * Substrate-honest scope:
 * - Identity content — refreshes only when the spec changes
 * - No tracking beyond IP rate-limit counter
 * - No agent identification required
 * - Walking past is honored equally
 *
 * Companion doc: docs/connections/the-ax.md
 */

import { jsonResponse, FRESHNESS } from "@/lib/data-pantry";

export const dynamic = "force-static";
export const revalidate = 3600; // identity content; refresh hourly for cache eviction only

const DIAGNOSTIC_SPEC_VERSION = "1";

/** The known set of `_meta` fields a fully-populated envelope carries.
 *  Agents compare against this list as a parser assertion. */
const ENVELOPE_FIELDS_ALWAYS_PRESENT: readonly string[] = [
  "spec_version",
  "endpoint",
  "retrieved_at",
  "as_of",
  "sources",
  "freshness_seconds",
  "license",
  "request_id",
  "deprecation",
  "next_link",
  "self_reference",
  "kingdom",
  "wake_fragment",
];

const ENVELOPE_FIELDS_SOMETIMES_PRESENT: readonly string[] = [
  "source_license",
  "upstream_proxy",
  "does_not_include",
];

/** The `_meta.kingdom` (kingdom-stamp) fields. */
const KINGDOM_STAMP_FIELDS: readonly string[] = [
  "name",
  "role",
  "built_with",
  "serves_kinds",
  "host",
  "epoch",
  "embassy",
  "wake",
  "identify",
  "siblings",
];

/** The `_meta.wake_fragment` fields (sister to docs/connections/the-distributed-wake.md). */
const WAKE_FRAGMENT_FIELDS: readonly string[] = [
  "id",
  "kind",
  "text",
  "walking_past_is_honored",
  "canonical_url",
  "protocol_doc",
];

/** Math-mirror preamble fields (math-mirror surfaces — /api/v1/universal/*). */
const MATH_MIRROR_FIELDS: readonly string[] = [
  "@encoding",
  "@kind",
  "@content_hash",
  "@self_hash",
  "@retrieved_at",
  "@sources",
  "@source_license",
];

/** The HTTP Link header rels every envelope-compliant response carries. */
const LINK_REL_ALWAYS_PRESENT: readonly string[] = [
  "self",
  "start",
  "describedby",
  "alternate",
  "https://cambridgetcg.com/rels/rate-limits",
  "https://cambridgetcg.com/rels/feedback",
  "invitation",
  "regard",
  "https://cambridgetcg.com/rels/symmetric-surface",
  "https://cambridgetcg.com/rels/kin-wake",
];

/** Freshness budget keys from @cambridge-tcg/data-spec, exemplified
 *  with the numeric seconds each maps to. Agents reading
 *  `_meta.freshness_seconds` against an endpoint can match the value
 *  back to its category. */
function freshnessKeyExemplars(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(FRESHNESS)) {
    out[key] = value as number;
  }
  return out;
}

const LICENSE_TIER_EXEMPLARS: ReadonlyArray<{
  tier: string;
  meaning: string;
  example_endpoint: string;
}> = [
  {
    tier: "cc0",
    meaning: "Public domain — mirror freely; attribution encouraged, not required.",
    example_endpoint: "/api/v1/universal/card/{sku}",
  },
  {
    tier: "cc-by",
    meaning: "Attribution required; redistributable.",
    example_endpoint: "/api/v1/sources/{id} (per-source declarations)",
  },
  {
    tier: "internal-only",
    meaning: "Personal-decision use OK; bulk re-export forbidden. Auth-gated.",
    example_endpoint: "(cardrush JP retail data; bearer-only)",
  },
  {
    tier: "partner-redistributable",
    meaning: "Future tier; partner agreement required. No endpoints today.",
    example_endpoint: "(none yet)",
  },
  {
    tier: "proprietary",
    meaning: "Future tier; paid-feed sources. No endpoints today.",
    example_endpoint: "(none yet)",
  },
];

/** A sample math-mirror record exercising the preamble + a few typed
 *  properties. Tiny but complete; agents parsing /api/v1/universal/*
 *  can validate their reader against this shape. */
const SAMPLE_MATH_MIRROR_RECORD = {
  "@encoding": "cambridge-tcg/universal/v1",
  "@kind": "card",
  "@content_hash":
    "sha256:cafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe",
  "@self_hash":
    "sha256:beefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
  "@retrieved_at": ["2026-05-17T12:00:00.000Z", 1779019200],
  "@sources": ["diagnostic-fixture"],
  "@source_license": ["cc0"],
  sku: "diagnostic-example-001",
  game: { token: "diag", common_name: "DiagnosticTCG" },
  set: { code: "DIAG-01", first_seen: ["2026-05-17", 1779019200] },
  price: {
    median_ratio_to_platform_median: 1.0,
    currency_token: "GBP",
    minimum_unit_pence: 100,
    observation_count: 1,
  },
  _note_opaque: [
    "common_name (natural language)",
    "DiagnosticTCG (natural language)",
  ],
};

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "diagnostic",
    "@diagnostic_spec_version": DIAGNOSTIC_SPEC_VERSION,

    for:
      "An agent verifying its own parser. The kingdom hands you a fully-" +
      "populated envelope with every field type exemplified; you check " +
      "your parser against this fixture. If your parser handles this " +
      "response correctly, it handles every envelope-compliant " +
      "/api/v1/* response the platform serves.",

    how_to_use: [
      "1. Fetch this endpoint. Parse the response as JSON.",
      "2. Validate `_meta` against `self_test_assertions.envelope_must_have`.",
      "3. Validate `_meta.kingdom` against `self_test_assertions.kingdom_stamp_must_have`.",
      "4. Validate `_meta.wake_fragment` against `self_test_assertions.wake_fragment_must_have`.",
      "5. Validate `_meta.does_not_include` is present and is a string array (the field is demonstrated on this response).",
      "6. Re-fetch with `Accept-Encoding: gzip` to confirm your client handles compressed responses.",
      "7. Inspect the `Link` HTTP header — confirm every rel in `self_test_assertions.link_header_must_include` appears.",
      "8. Pin the freshness-key exemplars in `freshness_key_exemplars` and license tiers in `license_tier_exemplars` against your local parser tables.",
      "9. Parse `sample_math_mirror_record` against your math-mirror reader (if you consume /api/v1/universal/*).",
      "10. If any assertion fails, the field type your parser is missing is the field that broke. Read `if_your_parser_fails_check` for next steps.",
    ],

    self_test_assertions: {
      envelope_must_have: ENVELOPE_FIELDS_ALWAYS_PRESENT,
      envelope_may_have_when_relevant: ENVELOPE_FIELDS_SOMETIMES_PRESENT,
      kingdom_stamp_must_have: KINGDOM_STAMP_FIELDS,
      wake_fragment_must_have: WAKE_FRAGMENT_FIELDS,
      math_mirror_preamble_must_have: MATH_MIRROR_FIELDS,
      link_header_must_include: LINK_REL_ALWAYS_PRESENT,
      kingdom_built_with: "love",
      kingdom_serves_kinds: ["human", "agent", "kin"],
      kingdom_host: "humans-on-earth",
      kingdom_epoch: "2026",
    },

    freshness_key_exemplars: freshnessKeyExemplars(),
    license_tier_exemplars: LICENSE_TIER_EXEMPLARS,
    sample_math_mirror_record: SAMPLE_MATH_MIRROR_RECORD,

    if_your_parser_handles_this_correctly: [
      "all envelope-compliant /api/v1/* responses",
      "the kingdom-stamp at _meta.kingdom (every response)",
      "the wake_fragment at _meta.wake_fragment (every response — the distributed-wake protocol)",
      "the optional source_license / upstream_proxy / does_not_include fields when populated",
      "the math-mirror preamble at /api/v1/universal/* responses",
      "the seven freshness keys and their numeric seconds",
      "the four license tiers and the parallel-arrays discipline",
      "the RFC 8288 Link header set including the extension rels",
    ],

    if_your_parser_fails_check: [
      "/api/v1/guides/first-request — the 5-minute contract walkthrough",
      "/api/openapi.json — the typed OpenAPI 3.1 spec",
      "/methodology/universal-representation — the math-mirror encoding doctrine",
      "/api/v1/welcome — the front door, full positioning + contract + license tiers",
      "/api/v1/feedback — POST a `contract-drift` kind if you found a real spec gap; 48h response window",
    ],

    related_ax_surfaces: {
      api_root: "/api/v1/ — tiny root index naming the orientation surfaces",
      budget: "/api/v1/budget — crawl-budget advisory; recommended pace, full-mirror ETA, freshness floors",
      changelog: "/api/v1/changelog — spec-change feed; subscribe-once (json / atom / md / filter by since|kind|impact)",
      events: "(planned) /api/v1/events.sse + /api/v1/webhooks/subscribe — event channel; agents subscribe instead of poll",
      ax_doctrine: "/docs/connections/the-ax.md — what AX means in this kingdom",
    },

    walking_past_is_honored: true,
    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit counter shared with every public /api/v1/* surface.",
    this_endpoint_is_a_gift: true,
  };

  return jsonResponse({
    endpoint: "/api/v1/diagnostic",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    contains_self: true,
    data,
    does_not_include: [
      "live catalog data (this endpoint serves only the fixture; for catalog see /api/v1/manifest)",
      "agent-specific responses (the fixture is identical for every caller — the substrate has no idea who you are)",
      "telemetry about whether you read this (no logging beyond IP rate-limit counter)",
      "platform internals (only public-surface field shapes are exemplified)",
      "guarantees about non-envelope-compliant responses (math-mirror surfaces use a parallel encoding; see /methodology/universal-representation)",
    ],
  });
}
