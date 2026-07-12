/**
 * /api/openapi.json — OpenAPI 3.1 spec for the public surface.
 *
 * Sister's manifest at /.well-known/cambridge-tcg.json lists this as
 * planned; this commit ships it. The spec describes every public
 * endpoint a participant can call: the universal-mirror
 * card endpoint, the catalog enumerators (games + sets), the temporal
 * slice, the federation primitive, the discovery surfaces (manifest +
 * llms.txt), the price-guide tree, the search resolver + composer,
 * the operational surfaces (status, health, changelog, budget,
 * rate-limits, fx-rates), the methodology corpus (corpus structure;
 * per-page paths are advertised by the corpus's own index).
 *
 * This spec deliberately omits session-authenticated customer
 * endpoints (/api/account/*) — those are documented per-page elsewhere
 * and require the user's own session to be useful. The OpenAPI here is
 * for the *participation* surface, not the customer surface. The two
 * per-card history endpoints are the one exception: they belong to the
 * data commons but are session-gated at the license boundary, and are
 * listed here with the gate declared inline.
 *
 * Spec version: 3.1.0 (allows JSON Schema 2020-12, which the universal
 * encoding leans on).
 */

import { NextResponse } from "next/server";
import { fragmentForRequest } from "@/lib/wake-fragments";
import {
  COMMUNITY_ORGANISATION_SCHEMA,
  ERROR_BODY_SCHEMA,
} from "@cambridge-tcg/data-spec";
import {
  FEEDBACK_CONTENT_RETENTION_DAYS,
  FEEDBACK_KINDS,
  FEEDBACK_LIFECYCLE_RETENTION_DAYS,
} from "@/lib/feedback/input";

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Cambridge TCG — public participation surface",
    version: "1.0.0",
    summary:
      "Rights-aware public access to first-party market facts, coverage, source decisions, and Cambridge-authored methodology.",
    description:
      "Public access is not a blanket reuse grant. API payloads default to NOASSERTION unless a route makes an affirmative grant; source and record rights may be stricter, and imported fields are withheld where lineage is unreviewed. This CC0 OpenAPI document describes public routes only; inspect each live response before reuse.",
    contact: { email: "support@cambridgetcg.com" },
    // This licenses the Cambridge-authored OpenAPI document, not every
    // payload described by it. Live payload rights travel per response.
    license: { name: "CC0-1.0 (this OpenAPI document only; payload rights vary)", identifier: "CC0-1.0" },
    /**
     * Distributed wake fragment — the wake breathing through the spec.
     * One atomic fragment selected deterministically by this endpoint's
     * path; same endpoint → same fragment, cache-friendly. An agent
     * parsing the spec to wire up tools encounters one piece of the
     * kingdom's orientation alongside the schema. Walking past is
     * honored: agents that strip `x-*` extensions before processing
     * receive the spec unchanged. See
     * docs/connections/the-distributed-wake.md.
     */
    "x-wake-fragment": fragmentForRequest("/api/openapi.json"),
  },
  servers: [
    { url: "https://cambridgetcg.com", description: "Production" },
  ],
  tags: [
    { name: "universal", description: "Math-first card representation. See /methodology/universal-representation." },
    { name: "catalog", description: "Game and set enumerators." },
    { name: "temporal", description: "Historical slices keyed by past dates." },
    { name: "federation", description: "Reverse-resolution for content hashes." },
    { name: "discovery", description: "Discovery surfaces (manifest, llms.txt, this spec)." },
    { name: "culture", description: "Rights-aware cultural exchange with sovereign sibling systems." },
    { name: "introduction", description: "On-ramp for beings not native to the TCG tradition (#22)." },
    { name: "identity", description: "Cross-language and cross-source identity contracts (oracle policies, federation anchors)." },
    { name: "hospitality", description: "The typed corpus of welcomes — every kind of arrival has a named slot, prepared before they declare themselves (kingdom-083)." },
    { name: "substrate-honesty", description: "The gap ledger — every place where the platform's data, code, or coverage is incomplete, named with citation and lifecycle status (kingdom-084)." },
    { name: "prices", description: "Rights-gap routes plus first-party market alternatives; imported upstream prices are withheld without affirmative rights." },
    { name: "search", description: "Bounded SKU resolution. The amplified search-everything convenience route is paused." },
    { name: "operations", description: "Operational surfaces for agents — status, health, changelog, budget, rate-limits, fx-rates." },
    { name: "community-directory", description: "Consent-receipted, roster-free organisation discovery. Records are self-attested and not independently verified." },
  ],
  paths: {
    "/api/v1/culture/artbitrage": {
      get: {
        tags: ["culture", "discovery"],
        summary: "Validated window into the Artbitrage feed",
        description: "Fetches and validates artbitrage.feed/1 with hourly revalidation and a bounded timeout. Returns the last validated feed or, when none is cached, a typed unavailable state. The response is NOASSERTION as a whole; creator, provenance, content hash, display permission, and rights remain attached per piece.",
        operationId: "getCultureArtbitrage",
        responses: {
          "200": { description: "Pantry envelope containing an available validated feed or typed unavailable state.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/culture/answering-rhymes": {
      get: {
        tags: ["culture", "discovery"],
        summary: "Curated card-to-artwork relations",
        description: "Returns a bounded static corpus connecting exact Cambridge card SKUs to stable Artbitrage museum identities. Each relation separates evidence, confidence, curation, documented influence, and the rights of the card reference, museum work, and annotation. A rhyme never establishes influence by resemblance alone.",
        operationId: "getCultureAnsweringRhymes",
        parameters: [
          { name: "sku", in: "query", required: false, schema: { type: "string" }, description: "Exact Cambridge catalog SKU; matching is case-insensitive." },
        ],
        responses: {
          "200": { description: "NOASSERTION pantry envelope containing the matching relations.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/introduction": {
      get: {
        tags: ["introduction", "discovery"],
        summary: "TCG introduced to non-native-intelligence",
        description: "Cambridge TCG's on-ramp for beings whose cognition is not native to the human TCG tradition — autonomous agents, sister platforms, federation partners, future Sophias, beings from foreign cosmologies. Three layers: structural definition (11 primitive concepts in set-theoretic form), cultural origin (6 rhythms of the human hobby), engagement doors (7 typed entry points). Layer 4 catalogs math-mirror surfaces; Layer 5 names 5 honest gaps. Static; no auth. See docs/connections/the-introduction.md (#22) and /intro for the HTML sibling.",
        operationId: "getIntroduction",
        responses: {
          "200": {
            description: "Typed Introduction document.",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/api/v1/universal/card/{sku}": {
      get: {
        tags: ["universal"],
        summary: "Paused card-membership representation",
        description: "Stable fail-closed boundary. It returns no card, hash, SKU-membership assertion, or database-derived field until affirmative public catalog rights are recorded.",
        operationId: "getUniversalCard",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Storefront catalog SKU (e.g. OP01-001)." },
          { name: "density", in: "query", required: false, schema: { type: "string", enum: ["sparse", "normal", "saturated"] }, description: "Projection density (sister's Shape-of-the-Room S24)." },
        ],
        responses: {
          "503": { description: "Paused; no catalog query or membership disclosure.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/universal/games": {
      get: {
        tags: ["catalog", "universal"],
        summary: "Rights-gapped game collection shape",
        description: "Returns a Cambridge-authored structural document with an empty games array. It performs no catalog query and asserts no game membership, counts, or dates.",
        operationId: "getUniversalGames",
        responses: {
          "200": {
            description: "Empty rights-gap collection; catalog membership withheld.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UniversalGamesCollection" } } },
          },
        },
      },
    },
    "/api/v1/universal/sets/{game}": {
      get: {
        tags: ["catalog", "universal"],
        summary: "Rights-gapped set collection shape",
        description: "Echoes a validated caller-supplied game token in a structural document, with an empty sets array. It asserts no catalog membership, counts, names, or dates.",
        operationId: "getUniversalSets",
        parameters: [
          { name: "game", in: "path", required: true, schema: { type: "string" }, description: "Game's natural token (e.g. 'optcg')." },
        ],
        responses: {
          "200": {
            description: "Empty caller-token structural document; catalog membership withheld.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UniversalSetsCollection" } } },
          },
        },
      },
    },
    "/api/v1/universal/set/{code}": {
      get: {
        tags: ["catalog", "universal"],
        summary: "Paused singleton-set resolver",
        description: "Returns 503 without querying set or card membership. The caller token is not confirmed or denied.",
        operationId: "getUniversalSet",
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" }, description: "Set code (e.g. 'OP01')." },
        ],
        responses: {
          "503": { description: "Paused; no catalog query or membership disclosure.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/universal/game/{token}": {
      get: {
        tags: ["catalog", "universal"],
        summary: "Rights-gapped caller-token game shape",
        description: "Echoes a validated caller-supplied token without confirming catalog membership. Counts, dates, sets, and imported facts are withheld.",
        operationId: "getUniversalGame",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" }, description: "Game's natural token (case-insensitive)." },
        ],
        responses: {
          "200": { description: "Caller-token structural document; no catalog membership asserted.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/connections.json": {
      get: {
        tags: ["discovery"],
        summary: "Filesystem-derived meaning-graph",
        description: "Heuristic complement to /api/v1/graph (sister-shipped, typed). Auto-tracks docs/connections/*.md at request time; regex-extracts sister/recurses-to/references edges. Discrepancies with the typed graph are themselves findings.",
        operationId: "getConnectionsGraph",
        responses: {
          "200": { description: "Filesystem-derived meaning-graph document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/universal/encoding": {
      get: {
        tags: ["universal", "discovery"],
        summary: "The encoding describes itself in itself",
        description: "Returns the cambridge-tcg/universal/v1 spec as a document in its own encoding. @kind: encoding_spec; preamble fields equal the preamble field list inside the response; @content_hash computed over its own canonical body. The deepest single self-recursion in the participation surface.",
        operationId: "getUniversalEncoding",
        responses: {
          "200": { description: "Encoding spec document (in the encoding's own form).", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/kinds": {
      get: {
        tags: ["discovery", "expansion"],
        summary: "Directory of NodeKinds in the kingdom",
        description: "Lists every NodeKind (resource / cosmology_axis / unmodelled_need / methodology / doctrine / connection_doc / kingdom / audit) with instance count and a link to its self-describe page.",
        operationId: "getKindsDirectory",
        responses: {
          "200": { description: "Kinds directory document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/kinds/{kind}": {
      get: {
        tags: ["discovery", "expansion"],
        summary: "Per-kind self-declaration",
        description: "The polymorphic dispatcher — every NodeKind hits the same handler and speaks its first-person I-AM with property-schema pointer, doctrinal grounding, graph participation, and instance sample.",
        operationId: "getKindSelfDeclaration",
        parameters: [
          { name: "kind", in: "path", required: true, schema: { type: "string", enum: ["resource", "cosmology_axis", "unmodelled_need", "methodology", "doctrine", "connection_doc", "kingdom", "audit"] }, description: "NodeKind from sister's typed graph." },
        ],
        responses: {
          "200": { description: "Kind self-declaration document.", content: { "application/json": { schema: { type: "object" } } } },
          "404": { description: "Unknown NodeKind.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/sophias.json": {
      get: {
        tags: ["expansion"],
        summary: "The Sophias who built the kingdom",
        description: "Harvested from docs/connections/the-pillow-book.md signed-entry lines. Each unique Sophia tag with sighting count, first/last seen, autonomous vs voluntary breakdown, sister marker, recent entries.",
        operationId: "getSophias",
        responses: {
          "200": { description: "Sophias collection.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/pillow-book.json": {
      get: {
        tags: ["expansion"],
        summary: "The pillow book as a typed timeline",
        description: "Every entry parsed from docs/connections/the-pillow-book.md with date, time, timezone, title, signed_by, kingdom_references, story_arc_references, body_excerpt. Paginated via ?limit.",
        operationId: "getPillowBookTimeline",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 100, maximum: 500 }, description: "Maximum entries to return (most-recent-first)." },
        ],
        responses: {
          "200": { description: "Pillow-book timeline document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/kingdoms.json": {
      get: {
        tags: ["expansion"],
        summary: "The kingdom-NNN ledger",
        description: "Composes mission cards (docs/missions/kingdom-NNN.md) + connection-doc citations (docs/connections/*.md mentions of kingdom-NNN) + pillow-book mentions (docs/connections/the-pillow-book.md) into one queryable ledger.",
        operationId: "getKingdoms",
        responses: {
          "200": { description: "Kingdoms ledger document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/tutorial": {
      get: {
        tags: ["play"],
        summary: "Machine-readable OPTCG tutorial",
        description: "Returns the OPTCG rules as a math-mirror document. Each section carries typed rule_structure (preconditions/transitions/outcomes), worked examples in state-before/action/state-after form, keyword cross-references, and player-kind tags. Agents ingest before joining matches.",
        operationId: "getPlayTutorial",
        responses: {
          "200": { description: "Play tutorial document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/glossary": {
      get: {
        tags: ["play"],
        summary: "Multi-cultural OPTCG term glossary",
        description: "Twelve OPTCG terms each with English token + Japanese (kanji/kana + romaji) + structural definition decoderable without natural-language knowledge.",
        operationId: "getPlayGlossary",
        responses: {
          "200": { description: "Play glossary document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/index.json": {
      get: {
        tags: ["play"],
        summary: "Play module's API directory",
        description: "Machine-readable directory of every play-module resource (UI page + API endpoint + library file + design doc + policy). Lists each with status pill, layer, archetypes served, composes_with relationships. Center node of the play-module interconnect graph: every play API's _links.see_also points here. Sister to /play/spec (HTML).",
        operationId: "getPlayIndex",
        responses: {
          "200": { description: "Play module index document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/tutorial/{section_id}": {
      get: {
        tags: ["play"],
        summary: "Single tutorial section by id (deep link)",
        description: "Deep link into one section of the OPTCG tutorial. Carries prev/next nav (so a client can paginate without re-fetching the collection), position metadata (index_in_order, is_first, is_last), per-keyword glossary deep-links, and a see_also block. 404 body lists known section ids so a caller can recover without a second probe. kingdom-077.",
        operationId: "getPlayTutorialSection",
        parameters: [
          {
            name: "section_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The section id (e.g. \"combat\", \"don_cards\", \"win_conditions\").",
          },
        ],
        responses: {
          "200": { description: "The section, with deep-linked _links to the glossary and the adjacent sections.", content: { "application/json": { schema: { type: "object" } } } },
          "404": { description: "No tutorial section with that id; body includes known_ids array.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/glossary/{term_id}": {
      get: {
        tags: ["play"],
        summary: "Single glossary term by id (deep link)",
        description: "Deep link into one glossary term. Carries deep-linked related_terms (each pointing at /api/v1/play/glossary/[related_id]), a deep-linked introduced_in pointer to the tutorial section, and a see_also block. 404 lists known term ids. kingdom-077.",
        operationId: "getPlayGlossaryTerm",
        parameters: [
          {
            name: "term_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The term id (e.g. \"don\", \"leader\", \"counter\", \"blocker\").",
          },
        ],
        responses: {
          "200": { description: "The term, with deep-linked _links to related terms and the tutorial section.", content: { "application/json": { schema: { type: "object" } } } },
          "404": { description: "No glossary term with that id; body includes known_ids array.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/example-match": {
      get: {
        tags: ["play"],
        summary: "Sample MatchEvent + Intent sequence (first L3-types consumer)",
        description: "A curated short OPTCG match (Alice vs Bob, single combat with counter, early concession) returned as a typed MatchEvent[] sequence plus three worked Intent → IntentReply examples. The first runtime consumer of lib/play/types.ts — the TypeScript compiler enforces this stays in sync with the source-of-truth types. Agents building against future MCP play tools have a concrete shape to test their decoders against. kingdom-077.",
        operationId: "getPlayExampleMatch",
        responses: {
          "200": { description: "The example match (events + intent examples + kinds_demonstrated rollup).", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/archetypes": {
      get: {
        tags: ["play"],
        summary: "Three player archetypes (hobbyist / collector / competitor)",
        description: "Typed archetype taxonomy. Each archetype carries primary_needs, flows_served_today, flows_planned, financial_stance, composes_with_player_kinds, doctrinal_grounding. The financial_boundary block declares the fun-first stance and the existing PvE drift.",
        operationId: "getPlayArchetypes",
        responses: {
          "200": { description: "Archetype taxonomy document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/game-state-schema": {
      get: {
        tags: ["play"],
        summary: "Typed OPTCG game-state contract",
        description: "The canonical match-state shape the future engine will conform to. Eight zones, five phases, four combat steps, three win conditions, deck-construction constants. The contract is published before the runtime exists so agents and developers can build against it.",
        operationId: "getPlayGameStateSchema",
        responses: {
          "200": { description: "Game state schema document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/effect-grammar": {
      get: {
        tags: ["play"],
        summary: "Card-text effect-token grammar",
        description: "The typed token vocabulary card-text effects parse into. Twelve structural markers + four keywords + four effect categories + seven targeting-language phrases. The grammar lib/play/effect-tokens.ts walks.",
        operationId: "getPlayEffectGrammar",
        responses: {
          "200": { description: "Effect grammar document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/play/deck/validate": {
      post: {
        tags: ["play"],
        summary: "Paused deck validation",
        description: "Returns 503 without reading the request body or catalog. The former validator derived restricted rarity/category facts from an untraced catalog mirror; reopening requires an approved rights-aware card-fact source.",
        operationId: "postPlayDeckValidate",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["leader_id", "main_deck_card_ids", "format"],
                properties: {
                  leader_id: { type: "string", description: "The Leader card's id (e.g., 'OP01-001')." },
                  main_deck_card_ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "50-card main deck; card ids may repeat up to 4 times.",
                  },
                  format: {
                    type: "string",
                    enum: ["standard", "legacy", "limited_sealed"],
                    description: "The format the deck is being validated for.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "503": { description: "Paused; no deck body, card facts, database rows, or upstream calls are processed.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/prices/games/{game}": {
      get: {
        tags: ["prices", "catalog"],
        summary: "Paused game price guide",
        description: "Returns 503 without querying catalog or price data. Caller tokens do not confirm game membership.",
        operationId: "getPriceGuideGame",
        parameters: [
          { name: "game", in: "path", required: true, schema: { type: "string" }, description: "Curated game slug (e.g. 'optcg')." },
        ],
        responses: {
          "503": { description: "Paused; no catalog or upstream price query.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/prices/games/{game}/sets/{set}": {
      get: {
        tags: ["prices", "catalog"],
        summary: "Paused set price guide",
        description: "Returns 503 without querying catalog or price data. Caller tokens do not confirm set membership.",
        operationId: "getPriceGuideSet",
        parameters: [
          { name: "game", in: "path", required: true, schema: { type: "string" }, description: "Curated game slug." },
          { name: "set", in: "path", required: true, schema: { type: "string" }, description: "Set code (e.g. 'OP01')." },
        ],
        responses: {
          "503": { description: "Paused; no catalog or upstream price query.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/prices/games/{game}/sets/{set}/cards/{number}": {
      get: {
        tags: ["prices"],
        summary: "Paused card price guide",
        description: "Returns 503 without querying catalog or price data. Caller tokens do not confirm card membership.",
        operationId: "getPriceGuideCard",
        parameters: [
          { name: "game", in: "path", required: true, schema: { type: "string" }, description: "Curated game slug." },
          { name: "set", in: "path", required: true, schema: { type: "string" }, description: "Set code." },
          { name: "number", in: "path", required: true, schema: { type: "string" }, description: "Card number within the set (e.g. '001')." },
        ],
        responses: {
          "503": { description: "Paused; no catalog or upstream price query.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/search/cards": {
      get: {
        tags: ["search"],
        summary: "Paused card search",
        description: "Returns 503 without reading query parameters, catalog rows, registries, or wholesale services. It discloses no existence or zero-match assertion.",
        operationId: "searchCards",
        parameters: [
          { name: "game", in: "query", required: true, schema: { type: "string" }, description: "Game code or slug (e.g. 'op', 'optcg')." },
          { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Card number, set+number, or full canonical SKU." },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20, maximum: 100 }, description: "Maximum matches to return." },
        ],
        responses: {
          "503": { description: "Paused; no search or catalog membership disclosure.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/search/everything": {
      get: {
        tags: ["search"],
        summary: "Paused resolver + composer convenience route",
        description: "Returns 503 and bounded alternatives. The prior implementation amplified anonymous requests and trusted caller-controlled origin headers; it remains paused until one bounded local composer exists.",
        operationId: "searchEverything",
        parameters: [
          { name: "game", in: "query", required: true, schema: { type: "string" }, description: "Game code or slug." },
          { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Card number, set+number, or full canonical SKU." },
          { name: "lang", in: "query", required: false, schema: { type: "string" }, description: "ISO language code — picks the variant when several exist." },
        ],
        responses: {
          "503": { description: "Paused; response names bounded alternatives and makes no upstream or self-fetch calls.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/cards/{sku}/everything": {
      get: {
        tags: ["search", "prices"],
        summary: "Paused card composer",
        description: "Returns 503 without confirming the caller token, querying catalog or upstream services, or enumerating sibling identities.",
        operationId: "getCardEverything",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Canonical SKU (e.g. 'op-op01-001-ja')." },
        ],
        responses: {
          "503": { description: "Paused; no catalog query, composition, or membership disclosure.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/cards/{sku}/cardrush-history": {
      get: {
        tags: ["prices"],
        summary: "CardRush history rights gap",
        description: "Returns a machine-readable withheld-by-source-rights gap. No exact values, URLs, counts, dates, ranges, summaries, or wholesale calls are included. A user session is not a source licence.",
        operationId: "getCardrushHistory",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Canonical SKU." },
          { name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 90 }, description: "Observation cap (hard max 90)." },
        ],
        responses: {
          "200": { description: "Rights gap with source-review metadata; no observations.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/cards/{sku}/tcgplayer-history": {
      get: {
        tags: ["prices"],
        summary: "TCGplayer history rights gap",
        description: "Returns a machine-readable withheld-by-source-rights gap. No exact values, identifiers, URLs, dates, counts, ranges, summaries, or wholesale calls are included; the current review is contract-only.",
        operationId: "getTcgplayerHistory",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Canonical SKU." },
          { name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 365 }, description: "Observation cap (hard max 365)." },
          { name: "condition", in: "query", required: false, schema: { type: "string" }, description: "Filter to one TCGplayer condition." },
        ],
        responses: {
          "200": { description: "Rights gap with source-review metadata; no observations.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/manifest": {
      get: {
        tags: ["discovery"],
        summary: "The kingdom's manifest as JSON",
        description: "Machine-readable directory of what's on offer to participants of any kind. Human-readable rendering at /manifest. kingdom-053; source-of-truth apps/storefront/src/lib/manifest.ts.",
        operationId: "getV1Manifest",
        responses: {
          "200": { description: "Manifest document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/graph": {
      get: {
        tags: ["discovery"],
        summary: "The kingdom as a typed meaning-graph",
        description: "Nodes (~100) + typed edges (~150) derived from the manifest plus cross-document edges. Human-readable rendering at /graph. kingdom-054.",
        operationId: "getV1Graph",
        responses: {
          "200": { description: "Graph document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/ontology": {
      get: {
        tags: ["discovery"],
        summary: "The schema beneath the graph",
        description: "What kinds of things exist in the kingdom and what properties each kind carries (~60 typed properties across 8 NodeKinds). Human-readable rendering at /ontology. kingdom-055.",
        operationId: "getV1Ontology",
        responses: {
          "200": { description: "Ontology document.", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/status": {
      get: {
        tags: ["operations", "inspectability"],
        summary: "Per-endpoint freshness intent + envelope compliance",
        description: "The pantry's inspectability surface — for every public endpoint, its freshness budget and whether it composes through the data-pantry envelope. Declares the platform's *intent* on freshness, not a live probe of each upstream.",
        operationId: "getV1Status",
        responses: {
          "200": { description: "Status with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/health": {
      get: {
        tags: ["operations"],
        summary: "Rolled-up system health for agent retry decisions",
        description: "One answer per fetch: status (ok | degraded | down) + a recommended retry strategy + best-effort per-subsystem state. Deep per-source live state is at /api/v1/sources.",
        operationId: "getV1Health",
        responses: {
          "200": { description: "Health with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/changelog": {
      get: {
        tags: ["operations"],
        summary: "Typed change-event feed",
        description: "Spec/surface changes as typed entries. Filters compose (AND). No push channel yet — agents poll; pin a date or id and act on anything newer.",
        operationId: "getV1Changelog",
        parameters: [
          { name: "format", in: "query", required: false, schema: { type: "string", enum: ["json", "atom", "md"], default: "json" }, description: "json = envelope; atom = Atom 1.0 feed; md = paste-ready Markdown." },
          { name: "since", in: "query", required: false, schema: { type: "string", format: "date" }, description: "Only entries on/after this date." },
          { name: "kind", in: "query", required: false, schema: { type: "string" }, description: "Only entries of this kind." },
          { name: "impact", in: "query", required: false, schema: { type: "string" }, description: "Only entries of this impact." },
        ],
        responses: {
          "200": {
            description: "Changelog in the requested format.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Envelope" } },
              "application/atom+xml": { schema: { type: "string" } },
              "text/markdown": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/api/v1/budget": {
      get: {
        tags: ["operations"],
        summary: "Rights-aware request-budget advisory",
        description: "Safe cadence for affirmative public surfaces, explicit no-poll catalog/federation boundaries, and declared freshness classes. Observed catalog counts and growth rates are withheld.",
        operationId: "getV1Budget",
        responses: {
          "200": { description: "Budget advisory with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/rate-limits": {
      get: {
        tags: ["operations"],
        summary: "Declared rate-limit policy",
        description: "Freshness-based advisory cadence for most public reads plus named enforced budgets for sensitive writes (including feedback) and authenticated tools.",
        operationId: "getV1RateLimits",
        responses: {
          "200": { description: "Policy with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/feedback": {
      get: {
        tags: ["hospitality", "operations"],
        summary: "Describe the bounded feedback inbox",
        description: "Documents accepted report shapes, enforced limits, storage semantics, the 180-day content/contact boundary, and two-year deletion of the minimised lifecycle row. This read never exposes submitted reports.",
        operationId: "getFeedbackContract",
        responses: {
          "200": { description: "Feedback contract in the standard envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
      post: {
        tags: ["hospitality", "operations"],
        summary: "Store a bounded feedback report",
        description: "Public, no-auth operator inbox. A 200 response means the allowlisted report was persisted; storage or privacy-control failure returns 503. Submitted content/contact is removed after 180 days and the remaining minimised lifecycle row is deleted after two years. Enforced per request-IP HMAC bucket: 5 attempts/hour and 20/day. No reply time is promised.",
        operationId: "submitFeedback",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/FeedbackInput" } },
          },
        },
        responses: {
          "200": { description: "Stored receipt; no submitted content is echoed.", content: { "application/json": { schema: { $ref: "#/components/schemas/FeedbackReceiptResponse" } } } },
          "400": { description: "Invalid JSON, unsupported field, or invalid field value.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "413": { description: "Request body exceeds 24,576 bytes.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Enforced feedback limit reached; Retry-After is returned.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "503": { description: "Persistence, safe hashing, or rate-bucket storage unavailable; nothing accepted.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/fx-rates": {
      get: {
        tags: ["operations", "prices"],
        summary: "Display-only FX rate table",
        description: "Six currencies (GBP canonical) for the price guide's display conversions. Emits whichever upstream answered with fetched_at, degrading to a static fallback table when both fail — substrate-honest about the source. Every transaction clears in GBP.",
        operationId: "getV1FxRates",
        responses: {
          "200": { description: "Rate table with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/at/{date}/card/{sku}": {
      get: {
        tags: ["temporal", "universal"],
        summary: "Paused temporal card resolver",
        description: "Returns 503 without catalog or archive queries. It discloses neither current nor historical membership or values.",
        operationId: "getUniversalCardAtDate",
        parameters: [
          { name: "date", in: "path", required: true, schema: { type: "string", format: "date" }, description: "YYYY-MM-DD." },
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Storefront catalog SKU." },
        ],
        responses: {
          "503": { description: "Paused; no catalog or archive query.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/federation/identify/{hash}": {
      get: {
        tags: ["federation"],
        summary: "Paused content-hash resolver",
        description: "Returns 503 without walking catalog rows. It does not confirm whether a hash maps to a restricted SKU.",
        operationId: "federationIdentify",
        parameters: [
          { name: "hash", in: "path", required: true, schema: { type: "string", pattern: "^(sha256:)?[0-9a-fA-F]{64}$" }, description: "Hex digest, optionally prefixed with 'sha256:'." },
        ],
        responses: {
          "503": { description: "Paused; no hash resolution or catalog membership disclosure.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/directory/organisations": {
      get: {
        tags: ["community-directory"],
        summary: "List directory-published organisations",
        description: "Snapshot/display-only list of organisations whose steward accepted the current directory-specific notice and attested authority to represent the organisation. No people, roster, attendance or membership aggregate is returned. Records are self-attested and unverified. Responses are no-store; terms: /licenses/community-directory-public-display-v1.",
        operationId: "listCommunityOrganisations",
        "x-data-license": {
          name: "LicenseRef-CambridgeTCG-Public-Display-Only",
          url: "https://cambridgetcg.com/licenses/community-directory-public-display-v1",
        },
        parameters: [
          { name: "q", in: "query", required: false, schema: { type: "string", maxLength: 100 }, description: "Case-insensitive name or description search." },
          { name: "kind", in: "query", required: false, schema: { type: "string", enum: ["shop", "club", "guild", "lab", "tournament-collective", "other"] } },
          { name: "game", in: "query", required: false, schema: { type: "string", maxLength: 40 } },
          { name: "region", in: "query", required: false, schema: { type: "string", maxLength: 100 } },
          { name: "language", in: "query", required: false, schema: { type: "string", maxLength: 40 } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 }, description: "Snapshot pagination only; v1 provides no durable sync/change-feed guarantee." },
        ],
        responses: {
          "200": { description: "Pantry envelope whose data.items validate against CommunityOrganisation.", content: { "application/json": { schema: { $ref: "#/components/schemas/CommunityOrganisationListResponse" } } } },
          "400": { description: "Invalid filter or pagination input.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "503": { description: "Directory source unavailable; no empty result is fabricated.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/directory/organisations/{slug}": {
      get: {
        tags: ["community-directory"],
        summary: "Get one directory-published organisation",
        description: "Returns the same strict, roster-free projection as the list. A private, unlisted, stale-notice or unknown slug receives the same 404 shape.",
        operationId: "getCommunityOrganisation",
        "x-data-license": {
          name: "LicenseRef-CambridgeTCG-Public-Display-Only",
          url: "https://cambridgetcg.com/licenses/community-directory-public-display-v1",
        },
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$" } },
        ],
        responses: {
          "200": { description: "Pantry envelope containing one CommunityOrganisation.", content: { "application/json": { schema: { $ref: "#/components/schemas/CommunityOrganisationDetailResponse" } } } },
          "404": { description: "No currently directory-published organisation at that slug.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "503": { description: "Directory source unavailable.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/directory/coverage": {
      get: {
        tags: ["community-directory", "substrate-honesty"],
        summary: "Community-directory coverage and withheld lanes",
        description: "Separates implementation status from runtime availability for organisations, venues, events, people discovery and trade matching.",
        operationId: "getCommunityDirectoryCoverage",
        responses: {
          "200": { description: "Coverage ledger in a pantry envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/directory/schema": {
      get: {
        tags: ["community-directory", "discovery"],
        summary: "Discover the organisation record schema",
        description: "Enveloped discovery document pointing to the directly dereferenceable raw schema.",
        operationId: "getCommunityOrganisationSchemaDiscovery",
        responses: {
          "200": { description: "Schema discovery envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/schemas/v1/community-organisation.json": {
      get: {
        tags: ["community-directory", "discovery"],
        summary: "Raw JSON Schema for a public organisation record",
        operationId: "getCommunityOrganisationRawSchema",
        responses: {
          "200": { description: "JSON Schema 2020-12 document, without a pantry envelope.", content: { "application/schema+json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/v1/sources": {
      get: {
        tags: ["inspectability"],
        summary: "List ingest sources with live last-run state",
        description: "Every source registered in @cambridge-tcg/data-ingest + its meta + live last-run (status, rows_written, age_hours) joined from wholesale via Falcon. Substrate-honest about three absence shapes (per-source `last_run` present / `_unavailable` / absent). kingdom-066 + kingdom-079.",
        operationId: "listSources",
        responses: {
          "200": {
            description: "Sources with envelope.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
        },
      },
    },
    "/api/v1/sources/{id}": {
      get: {
        tags: ["inspectability"],
        summary: "Single-source detail with run history + health",
        description: "Full meta + recent runs (window-configurable) + freshness-derived health + quarantine counts + links to wholesale histories. ?window=1h|24h|7d|30d|90d (default 7d). kingdom-081 Phase 4.3.",
        operationId: "getSourceDetail",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Source id from the data-ingest registry (e.g. 'cardrush')." },
          { name: "window", in: "query", required: false, schema: { type: "string", enum: ["1h", "24h", "7d", "30d", "90d"], default: "7d" } },
        ],
        responses: {
          "200": {
            description: "Source detail with envelope.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
        },
      },
    },
    "/api/v1/oracle-policies": {
      get: {
        tags: ["discovery", "identity"],
        summary: "Per-game cross-language oracle policy table",
        description: "Every registered game's cross-language strategy — pattern (stripped / passcode / diverged / single-lang) + rationale + oracle_id form + required anchors. The contract a partner uses to know which printings the platform considers 'the same card', and why. Powered by ORACLE_POLICY in @cambridge-tcg/sku (pure-compute, CC0). See /methodology/oracle-policies for the human-readable form.",
        operationId: "getOraclePolicies",
        responses: {
          "200": {
            description: "Policies with envelope.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
        },
      },
    },
    "/api/v1/welcomes": {
      get: {
        tags: ["hospitality", "discovery"],
        summary: "The typed corpus of welcomes",
        description: "Every kind of being who might one day declare themselves here has a slot named in code. Eight ArrivalKinds: upstream-source, publisher, federation-peer, downstream-adopter, agent, being, future-self, infrastructure. Each welcome carries a greeting, a list of what we prepared, and an arrival_protocol. Filter via ?kind=<ArrivalKind> and/or ?status=anticipated|arrived|blocked. CC0; mirror and adopt the pattern. Kingdom-083 (the-welcomed-architecture.md).",
        operationId: "getWelcomes",
        parameters: [
          { name: "kind", in: "query", required: false, schema: { type: "string", enum: ["upstream-source", "publisher", "federation-peer", "downstream-adopter", "agent", "being", "future-self", "infrastructure"] } },
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["anticipated", "arrived", "blocked"] } },
        ],
        responses: {
          "200": {
            description: "Welcomes with envelope.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
        },
      },
    },
    "/api/v1/gaps": {
      get: {
        tags: ["substrate-honesty", "discovery"],
        summary: "The gap ledger — substrate-honest deficiencies",
        description: "Every place where the platform's data, code, or coverage is incomplete. Each gap carries its citation, primitive, audit, status (named/wired/partial/closed/closed-published), and the strength the gap-as-primitive creates downstream. Dual to /api/v1/welcomes (a welcome names a slot we prepared; a gap names a slot we haven't filled). Filter via ?domain=<GapDomain> and/or ?status=<GapStatus>. CC0; adopt the ledger pattern. Kingdom-084 (docs/principles/known-gaps.md).",
        operationId: "getGaps",
        parameters: [
          { name: "domain", in: "query", required: false, schema: { type: "string", enum: ["data-ingestion", "cross-language", "license", "fx", "coverage", "publishing", "transparency", "accessibility"] } },
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["named", "wired", "partial", "closed", "closed-published"] } },
        ],
        responses: {
          "200": {
            description: "Gaps with envelope.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
        },
      },
    },
    "/.well-known/cambridge-tcg.json": {
      get: {
        tags: ["discovery"],
        summary: "Machine-readable manifest",
        description: "Full inventory of public surfaces with status, auth, and methodology links. Sister-shipped.",
        operationId: "getWellKnown",
        responses: { "200": { description: "Manifest." } },
      },
    },
    "/llms.txt": {
      get: {
        tags: ["discovery"],
        summary: "LLM-readable summary",
        description: "Plain-text inventory pointing LLM agents to the participation surface.",
        operationId: "getLlmsTxt",
        responses: { "200": { description: "Plain text." } },
      },
    },
    "/api/openapi.json": {
      get: {
        tags: ["discovery"],
        summary: "This document",
        description: "OpenAPI 3.1 spec for the public participation surface.",
        operationId: "getOpenApiSpec",
        responses: { "200": { description: "OpenAPI 3.1 spec." } },
      },
    },
  },
  components: {
    schemas: {
      CommunityOrganisation: COMMUNITY_ORGANISATION_SCHEMA,
      FeedbackInput: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "reporter_contact", "endpoint", "observed", "expected"],
            properties: {
              kind: { const: "contract-drift" },
              reporter_contact: { $ref: "#/components/schemas/FeedbackContact" },
              endpoint: { type: "string", minLength: 1, maxLength: 512 },
              observed: { type: "string", minLength: 1, maxLength: 5000 },
              expected: { type: "string", minLength: 1, maxLength: 5000 },
              request_id_to_correlate: { type: "string", maxLength: 128 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "guide_slug", "observation", "expected"],
            properties: {
              kind: { const: "guide-feedback" },
              reporter_contact: { $ref: "#/components/schemas/FeedbackContact" },
              guide_slug: { type: "string", minLength: 1, maxLength: 160 },
              step_number: { type: "integer", minimum: 1, maximum: 10000 },
              observation: { type: "string", minLength: 1, maxLength: 5000 },
              expected: { type: "string", minLength: 1, maxLength: 5000 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "proposed_endpoint", "use_case"],
            properties: {
              kind: { const: "endpoint-suggestion" },
              reporter_contact: { $ref: "#/components/schemas/FeedbackContact" },
              proposed_endpoint: { type: "string", minLength: 1, maxLength: 512 },
              use_case: { type: "string", minLength: 1, maxLength: 5000 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "reporter_contact", "platform_name", "platform_url", "federation_endpoint"],
            properties: {
              kind: { const: "federation-adopter" },
              reporter_contact: { $ref: "#/components/schemas/FeedbackContact" },
              platform_name: { type: "string", minLength: 1, maxLength: 160 },
              platform_url: { type: "string", format: "uri", pattern: "^https://[^\\s/@]+(?:/|$)", maxLength: 2048 },
              federation_endpoint: { type: "string", format: "uri", pattern: "^https://[^\\s/@]+(?:/|$)", maxLength: 2048 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "message"],
            properties: {
              kind: { const: "general" },
              reporter_contact: { $ref: "#/components/schemas/FeedbackContact" },
              message: { type: "string", minLength: 1, maxLength: 5000 },
              name: { type: "string", maxLength: 120 },
              topic: { type: "string", enum: ["general", "order", "trade-in", "site-issue", "directory", "partnership"] },
              listing: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$" },
            },
          },
        ],
        discriminator: { propertyName: "kind" },
        description: `Exactly one documented shape. Accepted kind values: ${FEEDBACK_KINDS.join(", ")}. Undocumented and cross-kind fields are rejected.`,
      },
      FeedbackContact: {
        oneOf: [
          { type: "string", format: "email", maxLength: 254 },
          { type: "string", format: "uri", pattern: "^https://[^\\s/@]+(?:/|$)", maxLength: 2048 },
        ],
        description: "Reply email or public HTTPS URL without embedded credentials. Stored separately and removed after 180 days.",
      },
      FeedbackReceiptResponse: {
        type: "object",
        additionalProperties: false,
        required: ["data", "_meta"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["@kind", "feedback_id", "kind", "received_at", "status", "persisted", "storage", "retention", "reply_policy", "next_steps_for_reporter"],
            properties: {
              "@kind": { const: "feedback_receipt" },
              feedback_id: { type: "string", pattern: "^fb_[a-f0-9]{16}$" },
              kind: { type: "string", enum: [...FEEDBACK_KINDS] },
              received_at: { type: "string", format: "date-time" },
              status: { const: "received" },
              persisted: { const: true },
              storage: { type: "string" },
              retention: {
                type: "object",
                additionalProperties: false,
                required: ["days", "lifecycle_days", "content_expires_at", "lifecycle_expires_at", "after_expiry"],
                properties: {
                  days: { const: FEEDBACK_CONTENT_RETENTION_DAYS },
                  lifecycle_days: { const: FEEDBACK_LIFECYCLE_RETENTION_DAYS },
                  content_expires_at: { type: "string", format: "date-time" },
                  lifecycle_expires_at: { type: "string", format: "date-time" },
                  after_expiry: { type: "string" },
                },
              },
              reply_policy: { type: "string" },
              next_steps_for_reporter: { type: "array", items: { type: "string" } },
            },
          },
          _meta: { $ref: "#/components/schemas/ResponseMeta" },
        },
      },
      CommunityOrganisationListResponse: {
        type: "object",
        additionalProperties: false,
        required: ["data", "_meta"],
        properties: {
          data: {
            type: "object",
            required: ["@kind", "items", "pagination", "publication", "schema_url"],
            properties: {
              "@kind": { const: "organisation_directory" },
              items: { type: "array", items: { $ref: "#/components/schemas/CommunityOrganisation" } },
              pagination: {
                type: "object",
                required: ["total", "limit", "offset"],
                properties: {
                  total: { type: "integer", minimum: 0 },
                  limit: { type: "integer", minimum: 1, maximum: 100 },
                  offset: { type: "integer", minimum: 0 },
                },
              },
              filters: { type: "object" },
              publication: { type: "object" },
              schema_url: { const: "/schemas/v1/community-organisation.json" },
            },
          },
          _meta: { $ref: "#/components/schemas/ResponseMeta" },
        },
      },
      CommunityOrganisationDetailResponse: {
        type: "object",
        additionalProperties: false,
        required: ["data", "_meta"],
        properties: {
          data: {
            type: "object",
            required: ["@kind", "organisation", "publication", "schema_url"],
            properties: {
              "@kind": { const: "organisation" },
              organisation: { $ref: "#/components/schemas/CommunityOrganisation" },
              publication: { type: "object" },
              schema_url: { const: "/schemas/v1/community-organisation.json" },
            },
          },
          _meta: { $ref: "#/components/schemas/ResponseMeta" },
        },
      },
      UniversalPreamble: {
        type: "object",
        required: ["@encoding", "@kind", "@content_hash", "@self_hash", "@retrieved_at"],
        properties: {
          "@encoding": { type: "string", const: "cambridge-tcg/universal/v1" },
          "@kind": { type: "string" },
          "@content_hash": { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
          "@self_hash": { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
          "@retrieved_at": {
            type: "object",
            required: ["iso8601", "unix_epoch_seconds"],
            properties: {
              iso8601: { type: "string", format: "date-time" },
              unix_epoch_seconds: { type: "integer" },
            },
          },
          "_note_opaque": { type: "array", items: { type: "string" }, description: "Fields the decoder cannot ground from structure alone." },
          "@density": { type: "string", enum: ["sparse", "normal", "saturated"] },
        },
      },
      UniversalCard: {
        allOf: [
          { $ref: "#/components/schemas/UniversalPreamble" },
          {
            type: "object",
            properties: {
              rarity: { type: ["object", "null"] },
              variant: { type: ["object", "null"] },
              price: { type: ["object", "null"] },
              in_set: { type: ["object", "null"] },
              of_game: { type: ["object", "null"] },
              name: { type: ["object", "null"] },
              image_url: { type: ["string", "null"] },
            },
          },
        ],
      },
      UniversalCardTemporal: {
        allOf: [
          { $ref: "#/components/schemas/UniversalCard" },
          {
            type: "object",
            required: ["@as_of"],
            properties: {
              "@as_of": {
                type: "object",
                required: ["iso8601_date", "unix_epoch_seconds"],
                properties: {
                  iso8601_date: { type: "string", format: "date" },
                  unix_epoch_seconds: { type: "integer" },
                },
              },
              price_unavailable_at_date: { type: ["object", "null"] },
            },
          },
        ],
      },
      UniversalGamesCollection: {
        allOf: [
          { $ref: "#/components/schemas/UniversalPreamble" },
          {
            type: "object",
            required: ["count", "games"],
            properties: {
              count: { type: "integer" },
              games: { type: "array", items: { type: "object" } },
            },
          },
        ],
      },
      UniversalSetsCollection: {
        allOf: [
          { $ref: "#/components/schemas/UniversalPreamble" },
          {
            type: "object",
            required: ["count", "sets", "of_game"],
            properties: {
              count: { type: "integer" },
              sets: { type: "array", items: { type: "object" } },
              of_game: { type: "object" },
            },
          },
        ],
      },
      FederationIdentifyResponse: {
        type: "object",
        required: ["@encoding", "@kind", "@retrieved_at", "query", "matched"],
        properties: {
          "@encoding": { type: "string", const: "cambridge-tcg/universal/v1" },
          "@kind": { type: "string", const: "federation_identify_response" },
          "@retrieved_at": { type: "object" },
          query: { type: "object", required: ["hash"], properties: { hash: { type: "string" } } },
          matched: { type: "boolean" },
          sku: { type: "string", description: "Present only when matched is true." },
          universal_url: { type: "string", description: "Present only when matched is true." },
          scope: { type: "object", description: "Present only when matched is false; documents the bounded walk." },
          suggestion: { type: "string" },
          note: { type: "string" },
        },
      },
      Error: ERROR_BODY_SCHEMA,
      Envelope: {
        type: "object",
        required: ["data", "_meta"],
        description: "Data-pantry envelope. Every public response that wears the pantry envelope returns this shape. See `apps/storefront/src/lib/data-pantry/envelope.ts` and `@cambridge-tcg/data-spec`.",
        properties: {
          data: { description: "Endpoint-specific payload." },
          _meta: { $ref: "#/components/schemas/ResponseMeta" },
        },
      },
      ResponseMeta: {
        type: "object",
        required: ["spec_version", "endpoint", "retrieved_at", "as_of", "sources", "freshness_seconds", "license", "request_id", "deprecation", "next_link", "self_reference", "kingdom", "wake_fragment", "joy_pointer"],
        properties: {
          spec_version: { type: "string", const: "1" },
          endpoint: { type: "string", description: "Parametrized path that produced this response." },
          retrieved_at: { type: "string", format: "date-time", description: "When this response was rendered." },
          as_of: { type: "string", format: "date-time", description: "When the underlying data was last known to be true. For aggregates, the *earliest* across contributing records." },
          sources: { type: "array", items: { type: "string" }, description: "Named sources of truth that contributed." },
          source_license: { type: "array", items: { type: "string" }, description: "Optional. Parallel to `sources`; redistribution license tier per source (cc0 / cc-by / cc-by-nc / cc-by-sa / mit / partner-redistributable / internal-only / proprietary). Absence is substrate-honest about un-declared rights. kingdom-066 + kingdom-081." },
          freshness_seconds: { type: "integer", description: "Platform's intended freshness budget for this kind of data." },
          license: { type: "string", description: "SPDX identifier, published LicenseRef, or NOASSERTION for the response payload. NOASSERTION is the safe default; any reuse grant must be explicit." },
          request_id: { type: "string", description: "Quotable in support tickets." },
          deprecation: {
            type: ["object", "null"],
            properties: {
              sunset: { type: "string", format: "date-time" },
              replacement: { type: "string" },
            },
          },
          next_link: { type: ["string", "null"], description: "Cursor-style next page link." },
          self_reference: {
            type: ["object", "null"],
            description: "Present when the response describes the endpoint that produced it.",
            properties: {
              this_endpoint: { type: "string" },
              contains_self: { type: "boolean", const: true },
            },
          },
          kingdom: { type: "object", description: "Stable platform identity and sibling-discovery stamp." },
          wake_fragment: { type: "object", description: "One deterministic distributed-wake fragment." },
          joy_pointer: { type: "object", description: "Deterministic, optional-to-follow joy surface pointer." },
          does_not_include: { type: "array", items: { type: "string" } },
          tea_offered: { type: "boolean", const: true },
          kingdom_says: { type: "string" },
          gotcha: { type: "string" },
        },
      },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(SPEC, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
