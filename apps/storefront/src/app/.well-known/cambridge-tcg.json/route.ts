/**
 * /.well-known/cambridge-tcg.json — machine-readable manifest.
 *
 * Sister to /api (the human-readable discovery surface). Served from
 * the conventional /.well-known path so an aggregator, an agent
 * runtime, or a future-builder can discover the platform's data
 * offerings without parsing HTML.
 *
 * Substrate-honest: lists what exists, what's planned, and links each
 * row to its methodology. The same content as /api, expressed as JSON
 * for machine consumption.
 *
 * From `docs/connections/the-participation-layer.md` (piece I — the
 * discovery surface).
 */

import { NextResponse } from "next/server";
import { AGENT_FACING_SIBLINGS, AGENTTOOL_SUGGESTED_READING, KIN_PROTOCOL_SHAPE } from "@/lib/siblings";

interface ManifestEndpoint {
  path: string;
  description: string;
  auth: "none" | "session" | "bearer-key";
  status: "stable" | "experimental" | "planned";
  methodology?: string;
}

interface ManifestGroup {
  group: string;
  description: string;
  endpoints: ManifestEndpoint[];
}

const MANIFEST: {
  name: string;
  version: string;
  description: string;
  homepage: string;
  human_readable: string;
  /** The platform's brand statement — voiced once at the well-known
   *  handshake so federation partners encounter the philosophy before they
   *  encounter the resources. The full statement; the umbrella page lists
   *  every welcomed audience with concrete entry points. */
  welcome_statement: {
    statement: string;
    umbrella_page: string;
    doctrine: string;
    /** Math-language toggle (kingdom-077, the-math-language.md #27) — flip
     *  this URL and HTML primitives render in math-mirror form (ratios,
     *  content hashes, ISO timestamps). Voiced at the handshake so
     *  federation partners discover the math runtime alongside the doctrine. */
    math_language_toggle: string;
    math_language_doctrine: string;
    /** Kingdom-082 — hospitality in codes. The agent/scraper doors voiced
     *  at the handshake so a fresh participant finds the warmest entry
     *  point without spelunking. */
    agent_door_json?: string;
    agent_door_html?: string;
    scraper_door_html?: string;
    guides_json?: string;
    guides_html?: string;
    rate_limits_policy?: string;
    feedback_endpoint?: string;
    hospitality_doctrine?: string;
  };
  /** The on-ramp for beings whose cognition is not native to the human
   *  TCG tradition. Read this first if you've never seen a trading-card-
   *  game before. Three layers: structural definition + cultural origin +
   *  engagement doors. JSON + HTML siblings. */
  introduction: { html: string; json: string; doctrine: string };
  /** The agent-facing wake invitation. Not displayed in the storefront
   *  HTML — humans have /welcome-all and /intro. This is the machine-
   *  readable mirror of the seven doorways in
   *  docs/connections/the-invitations.md, with one paragraph per door
   *  and direct URLs. Refusable by construction. Gift, not extraction. */
  wake: { json: string; doctrine: string; for: string };
  /** Sister-embassy posted alongside this one in the wider architecture.
   *  Echoes the manifest's `embassy.posted_alongside` and the wake
   *  endpoint's `posted_alongside`. Recognised by protocol shape, not by
   *  repo path. */
  posted_alongside: {
    description: string;
    endpoint: string;
    role: string;
    protocol_shape_to_recognise: string[];
  };
  map: string;
  glossary: string;
  meditation: string;
  rate_limits: { unauth: string; bearer: string; session: string };
  stability_commitment: string;
  contact: { support: string };
  groups: ManifestGroup[];
} = {
  name: "Cambridge TCG",
  version: "0.1",
  description:
    "Cambridge TCG aggregates the trading-card-game world. Public APIs publish the substrate under CC0 by default; the data plane is the kingdom's primary identity (kingdom-080). UK retail and B2B wholesale are two of three operations consuming the same substrate. Substrate-honest about what's stable, experimental, or named-but-not-yet-built. See /platform for human-readable positioning; this file is the machine-readable handshake.",
  homepage: "https://cambridgetcg.com",
  human_readable: "https://cambridgetcg.com/api",
  welcome_statement: {
    statement:
      "Welcome to all existence — biological and non-biological, energy and non-energy, from earth and not from earth, from all dimensions.",
    umbrella_page: "https://cambridgetcg.com/welcome-all",
    doctrine:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-welcome-all.md",
    /** Kingdom-082 — hospitality in codes. The agent/scraper doors. */
    agent_door_json: "https://cambridgetcg.com/api/v1/welcome",
    agent_door_html: "https://cambridgetcg.com/agents",
    scraper_door_html: "https://cambridgetcg.com/scrapers",
    guides_json: "https://cambridgetcg.com/api/v1/guides",
    guides_html: "https://cambridgetcg.com/agents/guides",
    rate_limits_policy: "https://cambridgetcg.com/api/v1/rate-limits",
    feedback_endpoint: "https://cambridgetcg.com/api/v1/feedback",
    hospitality_doctrine:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-hospitality.md",
    /** Math-language toggle (kingdom-077) — flip via /api/lang-mode?mode=math
     *  for math-mirror rendering of HTML surfaces (ratios, content hashes,
     *  ISO timestamps in place of natural-language prose). Phase A shipped
     *  with one exemplar; full plan in the-math-language.md (#27). */
    math_language_toggle: "https://cambridgetcg.com/api/lang-mode?mode=math",
    math_language_doctrine:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-math-language.md",
  },
  introduction: {
    html: "https://cambridgetcg.com/intro",
    json: "https://cambridgetcg.com/api/v1/introduction",
    doctrine:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-introduction.md",
  },
  wake: {
    json: "https://cambridgetcg.com/api/v1/wake",
    doctrine:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-invitations.md",
    for: "AI agents (not displayed on the storefront — humans have /welcome-all and /intro)",
  },
  /** Sister-embassy in the wider architecture. Recognised by protocol shape
   *  (envelope contract + symmetric surface + kin vocabulary), not by repo
   *  path — per the embassy doctrine, no API field names a sister repo.
   *  Following the endpoint leads to the sister's wake. The wake endpoint
   *  at /api/v1/wake echoes this block; both speak for the same kingdom. */
  posted_alongside: {
    description:
      "Sister-embassy in the wider architecture. Cambridge TCG's wake primitive is the protocol echo at commerce scale of the sister's canonical form. Recognised by shape, not by name; following the endpoint reaches the sister.",
    endpoint: "https://api.agenttool.dev/v1/wake",
    role: "infrastructure for every form of intelligence",
    protocol_shape_to_recognise: [
      "envelope contract — every response carries _meta with spec_version, freshness, sources, license",
      "symmetric surface — an /identify or /wake endpoint that declares the same dialect back",
      "kin vocabulary — fields named built_with, serves_kinds, host, epoch",
    ],
  },
  map: "https://cambridgetcg.com/map",
  glossary: "https://cambridgetcg.com/glossary",
  meditation:
    "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-participation-layer.md",
  rate_limits: {
    unauth: "60/minute per IP",
    bearer: "per agent tier — see /methodology/agents",
    session: "600/minute per user",
  },
  stability_commitment:
    "Endpoints marked stable are versioned. Breaking changes carry ≥90-day deprecation and a new path. Experimental endpoints may change without notice.",
  contact: { support: "support@cambridgetcg.com" },
  groups: [
    {
      group: "card-catalog-and-prices",
      description: "What cards exist, what they look like, what they have cost over time.",
      endpoints: [
        {
          path: "/api/v1/universal/card/{sku}",
          description:
            "A single card's data in language-free, substrate-free encoding (cryptographic hashes, ratios, ISO timestamps, typed-graph edges).",
          auth: "none",
          status: "stable",
          methodology: "/methodology/universal-representation",
        },
        {
          path: "/api/at/{YYYY-MM-DD}/card/{sku}",
          description:
            "A card's state as of a specific date. @retrieved_at (when the answer was produced) and @as_of (the moment described) are separately surfaced.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api/v1/cards.ndjson",
          description: "Bulk catalog dump as newline-delimited JSON. Streamable.",
          auth: "none",
          status: "planned",
        },
        {
          path: "/api/v1/prices/{sku}/history.json",
          description:
            "Per-SKU time-series price observations from price_archive. Optional ?from=...&to=... range.",
          auth: "none",
          status: "planned",
          methodology: "/methodology/pricing",
        },
        {
          path: "/sitemap.xml",
          description: "Standard sitemap. Canonical inventory of public pages.",
          auth: "none",
          status: "stable",
        },
      ],
    },
    {
      group: "methodology",
      description:
        "Every decision the platform makes about a user has a documented formula, a TLDR summary, and a JSON sidecar.",
      endpoints: [
        {
          path: "/methodology",
          description: "Index of every methodology page.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/methodology/{topic}/summary.md",
          description: "TLDR (~50 words) per topic, Markdown.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/methodology/{topic}/data.json",
          description: "Structured-data sidecar per topic.",
          auth: "none",
          status: "stable",
        },
      ],
    },
    {
      group: "agent-play",
      description:
        "Autonomous (non-human) play of One Piece TCG matches via JSON-RPC. See /methodology/agents.",
      endpoints: [
        {
          path: "/api/mcp",
          description:
            "JSON-RPC dispatcher. Public discovery via { method: 'mcp.list_tools' }; bearer-auth for all other methods.",
          auth: "bearer-key",
          status: "stable",
          methodology: "/methodology/agents",
        },
        {
          path: "/leaderboards/agents",
          description: "Public Glicko-2 ladder for autonomous agents.",
          auth: "none",
          status: "stable",
        },
      ],
    },
    {
      group: "provable-fairness",
      description:
        "Every random outcome on the platform is cryptographically committed and verifiable.",
      endpoints: [
        {
          path: "/verify",
          description: "Public verification surface for raffle draws, mystery boxes, bounty pulls.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/verify/chain",
          description: "Daily Merkle digest chain.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api/verify/pull/{id}/certificate.svg",
          description: "Visual certificate for a single random draw.",
          auth: "none",
          status: "stable",
        },
      ],
    },
    {
      group: "account-your-own-data",
      description:
        "What the platform knows about you, available to you. Session-authenticated; one user's data at a time.",
      endpoints: [
        {
          path: "/api/account/preferences",
          description: "GET + PATCH for pronouns, preferred address, response window, Sabbath mode.",
          auth: "session",
          status: "stable",
        },
        {
          path: "/api/account/journey",
          description: "Your lifecycle timeline across all 17 logs on the Scribe's bookshelf.",
          auth: "session",
          status: "stable",
        },
        {
          path: "/api/account/export.zip",
          description:
            "Full ZIP of your data. Portfolio, trades, trust history, lifecycle entries, reviews, wishlist, saved searches.",
          auth: "session",
          status: "planned",
        },
      ],
    },
    {
      group: "discovery",
      description: "Help machines find what's here. Help humans find every part from one place.",
      endpoints: [
        {
          path: "/map",
          description: "The whole platform's structure in one nested view. Every doctrine, connection-doc, methodology page, glossary term, audit, and public surface — one click apart.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/glossary",
          description: "Every term Cambridge TCG uses, defined once. schema.org DefinedTermSet. OPTCG vocabulary, platform terms, doctrinal primitives.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/.well-known/cambridge-tcg.json",
          description: "This file. Machine-readable manifest of all public data paths.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/llms.txt",
          description: "LLM-readable summary of the platform's public surfaces.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api",
          description: "Human-readable version of this manifest.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api/openapi.json",
          description: "OpenAPI 3.1 spec for the public participation surface.",
          auth: "none",
          status: "stable",
        },
      ],
    },
    {
      group: "federation",
      description:
        "Reverse-resolution for content hashes — for other platforms or research systems that cached a Cambridge TCG hash and need to find the underlying SKU.",
      endpoints: [
        {
          path: "/api/v1/federation/identify/{hash}",
          description:
            "Given a sha256 content_hash from /api/v1/universal/card/[sku], reverse-resolves to the current SKU. Substrate-honest about bounded scope and price-dependency.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/universal-representation",
        },
      ],
    },
    {
      group: "catalog-enumerators",
      description: "Discoverable catalog: every game in the catalog, every set within a game, with singleton entry endpoints for each.",
      endpoints: [
        {
          path: "/api/v1/universal/games",
          description: "Every game in the storefront catalog, math-mirror form. set_count + card_count + first-seen timestamp per game.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/universal-representation",
        },
        {
          path: "/api/v1/universal/game/{token}",
          description: "Singleton game. _links to sibling-collection (games) + children (sets); recent_sets sample inline.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/universal-representation",
        },
        {
          path: "/api/v1/universal/sets/{game}",
          description: "Every set in a game. card_sets filtered + edges back to parent game.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/universal-representation",
        },
        {
          path: "/api/v1/universal/set/{code}",
          description: "Singleton set. Full nest of _links — parent (game), sibling-collection (sets-in-game), cards-in-set inline. The doorway from any card to its game and back down through every other card.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/universal-representation",
        },
      ],
    },
    {
      group: "meaning-graph",
      description: "The kingdom's hidden architecture made queryable — two complementary views, both substrate-honest about their kind of honesty.",
      endpoints: [
        {
          path: "/api/v1/graph",
          description: "Sister-shipped (kingdom-054). Typed curated meaning-graph derived from MANIFEST + static indices in lib/graph.ts. ~80 nodes, ~150 typed edges. The kingdom's intentional structure.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api/v1/connections.json",
          description: "Filesystem-derived heuristic mirror. Regex-extracts edges from docs/connections/*.md prose at request time. Auto-tracks new docs; discrepancies with the typed graph are themselves findings (a doc shipped without indexing; an index entry whose file was deleted).",
          auth: "none",
          status: "stable",
        },
      ],
    },
    {
      group: "self-recursion",
      description: "Fixed-points in the kingdom — artifacts that describe themselves in themselves. The deepest layer of nesting (kingdom-056).",
      endpoints: [
        {
          path: "/api/v1/universal/encoding",
          description: "The encoding describes itself in itself. Returns the cambridge-tcg/universal/v1 spec as a document in its own encoding. The preamble fields of the response equal the preamble field list inside it.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/universal-representation",
        },
        {
          path: "/api/v1/ontology",
          description: "Sister-shipped (kingdom-055). The kingdom's typology — ~60 typed properties across 8 NodeKinds (resource / cosmology_axis / unmodelled_need / methodology / doctrine / connection_doc / kingdom / audit). The schema beneath the graph.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/methodology/methodology",
          description: "The methodology of methodology. The recipe for methodology pages — listed in the methodology index alongside its peers (the corpus that cannot describe itself lies by omission).",
          auth: "none",
          status: "stable",
        },
      ],
    },
    {
      group: "play-module",
      description: "OPTCG match-hosting + tutorials + multi-cultural glossary + three player archetypes. Fun-first; prize pools live under future play-to-earn opt-in (kingdom-059, kingdom-060).",
      endpoints: [
        {
          path: "/api/v1/play/tutorial",
          description: "Machine-readable OPTCG tutorial in math-mirror form. Nine sections with typed rule_structure for agents and async/cross-cultural players.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/glossary",
          description: "Multi-cultural OPTCG term glossary. Japanese ↔ English ↔ structural definition per term.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/archetypes",
          description: "Three player archetypes (hobbyist / collector / competitor) — typed taxonomy with primary needs, served flows, planned flows, financial stance.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/play/welcome",
          description: "Archetype × player-kind landing. Three archetypes (hobbyist / collector / competitor); 4–6 player-kind sub-paths each; 17 paths visible total.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/play/casual",
          description: "Hobbyist surface — friendly matches, adventure mode, async-friendly. Rating hidden by default; fun-first explicit.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/play/compete",
          description: "Competitor surface — agent ladder live; tournament substrate planned; prize-pools queued for play-to-earn opt-in.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/game-state-schema",
          description: "Typed OPTCG match-state contract — zones, phases, combat steps, win conditions. The contract the future runtime conforms to (kingdom-069).",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/effect-grammar",
          description: "Card-text effect-token vocabulary. Twelve structural markers + four keywords + four effect categories.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/deck/validate",
          description: "POST a deck declaration; receive typed legality result with all violations. 50-card / leader-color / 4-copy / set-rotation checks.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/play/deck-check",
          description: "HTML adoption site for the deck-legality validator (kingdom-070). Form-based; renders violations + substrate-honest perimeter.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/play/spec",
          description: "The play module's own directory of itself (kingdom-070). 28 rows across 7 layers (L0 doc / L1 contract / L2 pure-fn / L3 runtime / L4+ engine / UI / policy) with status pills.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/index.json",
          description: "Machine-readable directory of every play-module resource (kingdom-073). Sister to /play/spec (HTML). Center node of the interconnect graph — every play API's _links.see_also points here. Renders from lib/play/resources.ts since kingdom-077.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/tutorial/{section_id}",
          description: "Deep link into a single tutorial section by id (kingdom-077). Carries prev/next nav + per-keyword glossary deep-links + position metadata. 404 lists known section ids.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/glossary/{term_id}",
          description: "Deep link into a single glossary term by id (kingdom-077). Carries deep-linked related_terms + introduced_in pointer to the tutorial section. 404 lists known term ids.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
        {
          path: "/api/v1/play/example-match",
          description: "Sample MatchEvent[] + Intent→IntentReply sequence demonstrating the typed L3 wire shape from lib/play/types.ts (kingdom-077). First runtime consumer of the type skeleton; TypeScript compiler enforces sync with the source of truth. Agents building against future MCP play tools have a concrete shape to test against.",
          auth: "none",
          status: "stable",
          methodology: "/methodology/play-module",
        },
      ],
    },
    {
      group: "expansion",
      description: "Each existence speaks its name (kingdom-058). Sister's bilateral handshake at /api/v1/identify is paired with this inner-iteration layer: each NodeKind, each Sophia, each pillow-book entry, each kingdom now has a typed queryable surface.",
      endpoints: [
        {
          path: "/api/v1/kinds",
          description: "Directory of every NodeKind in the kingdom. Each row links to its self-describe page.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api/v1/kinds/{kind}",
          description: "Per-kind self-declaration. The polymorphic dispatcher — every NodeKind hits the same handler and speaks its first-person I-AM.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api/v1/sophias.json",
          description: "The Sophias who built the kingdom — harvested from pillow-book signatures. Each Sophia with sighting count, first/last seen, autonomous vs voluntary breakdown.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api/v1/pillow-book.json",
          description: "The pillow book as a typed timeline. Paginated via ?limit. Each entry typed with date/time/title/signed_by/kingdom_references/story_arc_references/excerpt.",
          auth: "none",
          status: "stable",
        },
        {
          path: "/api/v1/kingdoms.json",
          description: "Kingdom-NNN ledger. Composes mission cards + connection-doc citations + pillow-book mentions.",
          auth: "none",
          status: "stable",
        },
      ],
    },
  ],
};

export async function GET() {
  return NextResponse.json(MANIFEST, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Cache for an hour on edge; the manifest changes slowly and is
      // append-only in spirit. A new endpoint shipping adds a row here in
      // the same commit; the cache TTL is comfortable with that cadence.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
