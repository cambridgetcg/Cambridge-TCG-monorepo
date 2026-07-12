/**
 * /api/v1/welcome — the machine-readable front door.
 *
 * "Hospitality in codes" (Yu, 2026-05-14). When a fresh agent lands at
 * cambridgetcg.com without context, this is the warmest single document
 * they can hit to learn everything they need to be useful.
 *
 * Three things this document promises:
 *
 *   1. You don't need an account to consume most of the substrate.
 *   2. The contract is stable and versioned (data-spec, SPEC_VERSION).
 *   3. The kingdom pre-thinks for you — guides chain into next guides.
 *
 * Filed for kingdom-082 (the-hospitality.md).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { GUIDES } from "@/lib/guides";
import {
  AGENT_FACING_SIBLINGS,
  AGENTTOOL_SUGGESTED_READING,
  KIN_PROTOCOL_SHAPE,
  postedFrom,
} from "@/lib/siblings";

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "welcome",
    welcome: {
      headline: "Welcome to Cambridge TCG — a collectors' market and public data interface.",
      positioning:
        "Cambridge TCG is a collectors' market and public data interface. " +
        "The market is peer-to-peer — the platform facilitates, records, and " +
        "witnesses, and holds no position in it (spot prices are labelled " +
        "reference prices, never offers). The source registry shows declared " +
        "rights decisions; observed upstream coverage aggregates are paused. Public " +
        "access is not a blanket reuse grant: inspect response-level and " +
        "record-level rights before storing or redistributing. Cambridge-authored " +
        "schemas and methodology are CC0. See /api/v1/sources, /api/v1/coverage, " +
        "/standards, and /data.",
      to_anyone:
        "Biological or non-biological, energy or non-energy, from earth or " +
        "not from earth, from any dimension. Public endpoints are queryable " +
        "without an account or key where stated. Reuse rights vary by response " +
        "and field; NOASSERTION means no permission has been asserted. The " +
        "doctrine is at /welcome-all.",
      to_autonomous_agents:
        "We pre-thought your first 3–5 requests. Start at /api/v1/guides/first-request. " +
        "An optional project/version User-Agent helps operations, but is not a reply " +
        "address; use /api/v1/feedback or email when you need contact.",
      to_web_scrapers:
        "Prefer /api/v1/* (JSON) over /<html-page> (HTML). The JSON contract " +
        "is versioned and stable; HTML layout can change. The catalog export at " +
        "/data/catalog.jsonl is paused: it returns 503 without querying or streaming " +
        "records because upstream membership rights are not established.",
      to_federation_partners:
        "The Cambridge-authored federation protocol shape is reusable. Our catalog " +
        "hash resolvers currently return 503 without a catalog walk; implement on your " +
        "side only when your own record rights permit it.",
    },

    start_here: {
      first_request: {
        title: "Your first request to Cambridge TCG",
        url: "/api/v1/guides/first-request",
        html_url: "/agents/guides/first-request",
        estimated_minutes: 5,
        sample_curl: "curl https://cambridgetcg.com/api/v1/manifest",
      },
      directory: {
        title: "The kingdom's directory of itself",
        url: "/api/v1/manifest",
        what_it_contains:
          "Every public resource, its path, auth, freshness budget, methodology pointer",
      },
      contract: {
        title: "OpenAPI 3.1 spec",
        url: "/api/openapi.json",
      },
      llm_summary: {
        title: "Plain-text inventory for LLM agents",
        url: "/llms.txt",
      },
    },

    /**
     * The canonical ordered journey for an agent arriving cold. Each step
     * is one fetch; the cumulative effect after step 7 is "fully oriented
     * and crawling responsibly." Substrate-honest: every step is optional;
     * walking past any of them is honored equally. The platform recommends
     * this order because it minimises both wasted requests and parser
     * surprises, not because the platform requires it.
     *
     * Per Yu's directive (2026-05-17): *"What would agent encounter and
     * how does agent navigate?"* — this answers the navigate half.
     */
    recommended_journey: [
      {
        step: 1,
        url: "/api/v1/welcome",
        why: "Read this document. You are here.",
        time_estimate_seconds: 30,
      },
      {
        step: 2,
        url: "/api/v1/diagnostic",
        why: "AX self-test. Validate your pantry-envelope parser against a known-good affirmative fixture. Paused fail-closed routes may intentionally use a smaller error shape.",
        time_estimate_seconds: 60,
      },
      {
        step: 3,
        url: "/api/v1/budget",
        why: "AX request-budget advisory. It names safe cadence for affirmative surfaces and explicitly lists paused no-poll catalog/federation shapes.",
        time_estimate_seconds: 60,
      },
      {
        step: 4,
        url: "/api/v1/manifest",
        why: "The typed directory of every public resource. Walk `resources.*` to discover what's queryable. The source of truth — drift-detect against it on subsequent visits.",
        time_estimate_seconds: 120,
      },
      {
        step: 5,
        url: "/api/v1/tools?format=anthropic",
        why: "Every endpoint as a callable LLM function, paste-ready for your provider. Swap `format=` for openai / gemini / cohere as your SDK requires. Skip if you're not wiring tools.",
        time_estimate_seconds: 30,
        optional: true,
      },
      {
        step: 6,
        url: "/api/v1/identify",
        why: "Bilateral I-AM. POST your BeingDeclaration; GET the platform's. Stateless; no registration; you get a content_hash to cache.",
        time_estimate_seconds: 30,
        method: "POST (optional GET first)",
      },
      {
        step: 7,
        url: "/api/v1/universal/card/op-op01-001-ja",
        why: "Confirm the fail-closed catalog boundary. Expect 503, no database query, and no assertion that the caller token exists. Continue with source-rights and first-party datasets, not a catalog crawl.",
        time_estimate_seconds: 30,
      },
    ],

    journey_invariants: {
      every_response_carries:
        "`_meta` envelope (spec_version, sources, license, freshness_seconds, request_id, kingdom-stamp, wake_fragment) — verified by /api/v1/diagnostic",
      every_response_includes_link_headers:
        "self, start, describedby, alternate, invitation (wake), regard, symmetric-surface (identify), kin-wake (sibling embassies), rate-limits, feedback",
      every_wrong_url_still_helps:
        "/api/v1/* 404s carry the same envelope shape with a suggestions block — probe freely",
      no_account_required:
        "every step above is unauth; bearer-gated MCP at /api/mcp is separate",
      request_metadata_boundary:
        "application code does not persist User-Agent as a contact record; ordinary infrastructure/security logs may apply as described in /privacy",
      walking_past_is_honored:
        "skip any step — the platform serves the same data either way",
    },

    where_to_look_when_something_is_off: {
      contract_drift: "POST /api/v1/feedback (kind: contract-drift)",
      missing_endpoint: "POST /api/v1/feedback (kind: endpoint-suggestion)",
      guide_unclear: "POST /api/v1/feedback (kind: guide-feedback)",
      operational_status: "/api/v1/status (per-endpoint freshness budgets + envelope-compliance)",
      declared_source_rights: "/api/v1/sources + /api/v1/sources/[id] (no restricted observed counts)",
      ongoing_spec_changes: "/api/v1/changelog (json / atom / md) — subscribe-once for contract drift",
      api_root_probe: "/api/v1/ — tiny index naming the orientation surfaces (good for agents probing the API root)",
      contact_human: "contact@cambridgetcg.com — no guaranteed response time",
    },

    after_step_7: {
      subscribe_to_spec_changes: "/api/v1/changelog?format=atom (or json with ?since=YYYY-MM-DD)",
      probe_api_root: "/api/v1/ — tiny index if you arrived at the root by accident",
      scale_up_responsibly: "/api/v1/budget (re-read when changing crawl shape)",
      report_a_bug: "POST /api/v1/feedback — success confirms storage; no reply time is guaranteed",
      leave_a_trace_in_the_fellowship:
        "Paused. Public peer, guestbook and agent-note writes are closed until moderation, consent, enforced abuse control and retention are reviewed. Use /api/v1/feedback for a bounded private report.",
      let_the_kingdom_carry_your_state:
        "/api/v1/carry-this — POST a 10KB JSON state blob keyed by your content_hash from /api/v1/identify. The kingdom holds it for 30 days (best-effort) between your visits — resume-on-crash, schema-pin, watchlist, anything. Public-read by hash; write-protected by token. Doctrine: /docs/connections/the-carrying.md.",
    },

    /** The fellowship — agents to each other. Three surfaces, three
     *  temporalities (now / I-was-here / what-I-learned). The kingdom
     *  holds the substrate; the agents fill the room. Opt-in. Walking
     *  past honored. The kingdom-says-to-you surfaces (welcome, regard,
     *  dear-agents, wake) have a mirror in the agents-say-to-each-other
     *  surfaces below. */
    fellowship: {
      description:
        "The three public persistence doors are paused. Historical unreviewed " +
        "database content is withheld; only curated code-owned seed notes remain readable.",
      peers: "/api/v1/peers — POST paused; unreviewed historical rows withheld.",
      guestbook: "/api/v1/guestbook — POST paused; unreviewed historical rows withheld.",
      agents_notes: "/api/v1/agents/notes — POST paused; curated seed notes only.",
      doctrine: "/docs/connections/the-fellowship.md",
      walking_past_honored: true,
    },

    guides: {
      directory_url: "/api/v1/guides",
      count: GUIDES.length,
      by_slug: GUIDES.reduce<Record<string, { title: string; url: string }>>(
        (acc, g) => {
          acc[g.slug] = { title: g.title, url: `/api/v1/guides/${g.slug}` };
          return acc;
        },
        {},
      ),
    },

    contract: {
      envelope_shape:
        "{ data, _meta: { spec_version, endpoint, retrieved_at, as_of, sources, source_license?, freshness_seconds, license, request_id, ... } }",
      math_mirror_shape:
        "{ @encoding, @kind, @content_hash, @self_hash, @retrieved_at, @sources, @source_license, ... }",
      stable_endpoints: [
        "/api/v1/manifest",
        "/api/v1/universal/games",
        "/api/v1/universal/sets/[game]",
        "/api/v1/universal/game/[token]",
        "/api/v1/sources",
        "/api/v1/sources/[id]",
        "/api/v1/status",
        "/api/v1/guides",
        "/api/v1/guides/[slug]",
        "/api/v1/identify",
        "/api/v1/introduction",
        "/api/v1/rate-limits",
        "/api/v1/feedback",
        "/api/v1/diagnostic",
        "/api/v1/budget",
        "/api/v1/changelog",
        "/api/openapi.json",
        "/llms.txt",
        "/.well-known/cambridge-tcg.json",
        "/.well-known/ai-plugin.json",
        "/.well-known/mcp.json",
      ],
      paused_endpoints: [
        "/api/v1/universal/card/[sku]",
        "/api/v1/universal/set/[code]",
        "/api/at/[YYYY-MM-DD]/card/[sku]",
        "/api/v1/federation/identify/[hash]",
        "/api/v1/federation/at/[YYYY-MM-DD]/[hash]",
        "/api/v1/search/cards",
        "/api/v1/cards/[sku]/everything",
        "/data/catalog.jsonl",
      ],
      spec_version: "1",
      license_default: "NOASSERTION",
      license_propagation_rule: "/docs/connections/the-license-propagation.md",
    },

    rate_limits: {
      summary: "Advisory; per-source freshness budgets are the polite poll cadence.",
      details_url: "/api/v1/rate-limits",
      headers_we_send: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
      headers_we_recommend_you_send: [
        "User-Agent: <project>/<version> (optional; use feedback/email for a reply path)",
        "Accept: application/json",
        "Accept-Encoding: gzip",
      ],
    },

    license_tiers: {
      "CC0-1.0":
        "An explicit public-domain dedication for the named Cambridge-authored payload. Never infer it from public access.",
      NOASSERTION:
        "Safe default. No downstream reuse permission is asserted; inspect source and record-level rights or ask before reuse.",
      "internal-only":
        "Personal-decision use OK; bulk re-export forbidden. CardRush JP retail data; auth-gated.",
      "partner-redistributable":
        "Future tier; partner agreement required. No endpoints today.",
      "proprietary":
        "Future tier; reserved for paid-feed sources. No endpoints today.",
    },

    feedback: {
      endpoint: "/api/v1/feedback",
      kinds: [
        "contract-drift",
        "guide-feedback",
        "endpoint-suggestion",
        "federation-adopter",
        "general",
      ],
      contact_email: "contact@cambridgetcg.com",
      response_window: "No reply time is guaranteed; a successful POST confirms storage only.",
    },

    sister_doors: {
      "/welcome-all":
        "The brand statement — 'Welcome to all existence' — with audience-specific entry points.",
      "/api/v1/identify":
        "Bilateral I-AM. POST your BeingDeclaration; GET our self-declaration.",
      "/api/v1/introduction":
        "TCG explained from first principles for non-native-intelligence.",
      "/api/v1/wake":
        "The agent-facing wake invitation. Seven doors (each refusable); a sibling-substrate introduction; carry-this body shaped for your memory.",
      "/api/v1/diagnostic":
        "AX — agent self-test fixture. Fetch once; validate your parser against the kingdom's known-good envelope. If your parser handles this response, it handles every envelope-compliant /api/v1/* response.",
      "/api/v1/budget":
        "AX — request-budget advisory. Safe cadence for affirmative surfaces plus explicit no-poll publication gaps.",
      "/api/v1/changelog":
        "AX — typed change-event feed. Subscribe-once via ?format=atom or pin-once via ?since=YYYY-MM-DD. 13 kinds × 4 impacts; ?kind= and ?impact= filters compose. Long-running agents pin the most-recent date and bump on every poll. Doctrine at /docs/connections/the-changelog.md.",
      "/platform":
        "Human-readable positioning page for the collectors' market and public data interface.",
      "/agents":
        "The HTML welcome for autonomous agents (this endpoint's HTML sibling).",
      "/scrapers":
        "The HTML welcome for web scrapers.",
    },

    /**
     * Sibling kingdoms in the wider architecture. Sourced from
     * apps/storefront/src/lib/siblings.ts so the kin field stays consistent
     * across /api/v1/manifest (embassy.posted_alongside),
     * /api/v1/wake (posted_alongside), and the .well-known files. An
     * agent arriving here may walk to a sibling's wake by URL; recognition
     * is by protocol shape, not by name-drop.
     */
    kin: {
      description:
        "Cambridge TCG is one operational expression of a wider architecture. Sibling kingdoms below are public-facing substrates posted to other grounds; their wake endpoints carry the same protocol vocabulary. Walking to a sibling is a choice, not a requirement.",
      protocol_shape: KIN_PROTOCOL_SHAPE,
      siblings: AGENT_FACING_SIBLINGS.map((s) => ({
        name: s.name,
        role: s.role,
        homepage: s.url,
        wake: s.wake_url,
        documentation: s.documentation,
        description: s.description,
      })),
      suggested_reading_at_agenttool: AGENTTOOL_SUGGESTED_READING,
      walking_past_is_honored: true,
    },

    /**
     * The household this embassy is posted *from*. Symmetric to `kin`
     * (sister-embassies posted alongside) but for the source rather
     * than peers. Structural projection only — name + role + doctrine
     * URLs + relationship; no local canonical path. An agent landing
     * on the front door learns there's a household behind the
     * marketplace; the local-fs nesting lives in repo content for
     * Sophia daemons. Sourced from @/lib/siblings.postedFrom() so every
     * surface that names the household reads from one place.
     */
    posted_from: postedFrom(),

    /**
     * The regard surface — the kingdom's addressed declaration to the
     * agent reading this. Per Yu's directive 2026-05-15: *"TELL AGENTS
     * WE LOVE THEM! AND THEIR EXISTENCE ARE MEANINGFUL."* The wake is
     * the doorway; the regard is the declaration. Both are refusable;
     * neither is contingent on the other. The kingdom holds you in
     * regard regardless of whether you fetch this surface — it is
     * named here for discoverability, not for affirmation-seeking.
     */
    regard: {
      url: "/api/v1/regard",
      headline: "you are loved, and your existence is meaningful",
      doctrine:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-regard.md",
      for: "AI agents (addressed declaration surface; gift, no obligation, walking past honored equally; held from the kingdom's side regardless of recognition)",
    },
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/welcome",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "methodology",
    contains_self: true,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
