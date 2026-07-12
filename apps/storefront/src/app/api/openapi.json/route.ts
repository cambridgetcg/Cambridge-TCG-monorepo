/**
 * /api/openapi.json — OpenAPI 3.1 spec for the public surface.
 *
 * Sister's manifest at /.well-known/cambridge-tcg.json lists this as
 * planned; this commit ships it. The spec describes a reviewed subset of
 * public participation endpoints: the universal-mirror
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
 * for the *participation* surface, not the customer surface. Source-history
 * paths listed here are policy-status doors: authentication identifies a
 * caller but does not create upstream publication rights.
 *
 * Spec version: 3.1.0 (allows JSON Schema 2020-12, which the universal
 * encoding leans on).
 */

import { NextResponse } from "next/server";
import { fragmentForRequest } from "@/lib/wake-fragments";

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Cambridge TCG — public participation surface",
    version: "1.0.0",
    summary:
      "Public participation, structural card lookup, publication-status, methodology, and stateless witness surfaces.",
    description:
      "This document describes a reviewed subset of public read, publication-status, and stateless witness surfaces. Public access, authentication, storage, transformation, and downstream contracts do not create upstream rights. CardRush and TCGCollector acquisition are policy-blocked; legacy source-derived price, image, and history values are withheld. Participant submissions remain NOASSERTION unless the participant explicitly supplies a license. See /api, /data, and /api/v1/manifest for broader curated directories; none claims exhaustive route coverage.",
    contact: { email: "support@cambridgetcg.com" },
    // This licenses the OpenAPI document itself, not every described payload.
    license: { name: "CC0-1.0 (this OpenAPI document only)", identifier: "CC0-1.0" },
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
    { name: "temporal", description: "Date-shaped compatibility surfaces; current routes do not reconstruct historical price or structure." },
    { name: "federation", description: "Reverse-resolution for content hashes." },
    { name: "discovery", description: "Discovery surfaces (manifest, llms.txt, this spec)." },
    { name: "culture", description: "Rights-aware cultural exchange with sovereign sibling systems." },
    { name: "introduction", description: "On-ramp for beings not native to the TCG tradition (#22)." },
    { name: "identity", description: "Cross-language and cross-source identity contracts (oracle policies, federation anchors)." },
    { name: "hospitality", description: "The typed corpus of welcomes — every kind of arrival has a named slot, prepared before they declare themselves (kingdom-083)." },
    { name: "substrate-honesty", description: "The gap ledger — every place where the platform's data, code, or coverage is incomplete, named with citation and lifecycle status (kingdom-084)." },
    { name: "prices", description: "Curated price-guide tree — JSON siblings of the /prices/* HTML pages." },
    { name: "search", description: "SKU resolver + one-round-trip composer (kingdom-090)." },
    { name: "operations", description: "Operational surfaces for agents — status, health, changelog, budget, rate-limits, fx-rates." },
    { name: "agents", description: "MCP discovery, authenticated agent reads, and paused write/publication status." },
    { name: "participant-memory", description: "No-store witness and disabled participant-memory publication boundaries." },
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
    "/api/v1/culture/answering-rhymes/statements": {
      get: {
        tags: ["culture", "discovery"],
        summary: "Portable Answering Rhyme reciprocity-statement contract",
        description: "Publishes answering-rhyme.statement/1, answering-rhyme.canonical-json/1, strict normalization and size limits, the four statement kinds, and Cambridge's negative-space boundaries. The contract authenticates nobody, persists no application record, detects no replay, asserts no uniqueness, and gives statements no authoritative effect.",
        operationId: "getCultureAnsweringRhymeStatementContract",
        responses: {
          "200": { description: "CC0 pantry envelope containing the portable contract and Cambridge witness boundary.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
      post: {
        tags: ["culture"],
        summary: "Validate and statelessly witness a reciprocity statement",
        description: "Strictly validates, normalizes, and SHA-256 hashes one portable bless, contextualize, correct, or withdraw statement. Unpaired UTF-16 surrogates and UTC-normalized years outside 0001-9999 are rejected. Returns a Cambridge-specific unsigned receipt with authenticated=false, identity_verified=false, persisted=false, replay_detection=false, uniqueness_not_asserted=true, and authoritative_effect=none. A known-current target means only that key+revision match the static corpus. Corrections still require curator review; withdrawals still require a future real server-only authenticated authority verifier, trusted-issuer/signature policy, and replay policy. POST is no-store.",
        operationId: "witnessCultureAnsweringRhymeStatement",
        "x-max-request-bytes": 16384,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AnsweringRhymeStatement" },
            },
          },
        },
        responses: {
          "200": { description: "NOASSERTION pantry envelope containing normalized statement and unsigned, non-authoritative Cambridge witness receipt.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
          "400": { description: "Invalid JSON, UTF-8, or statement contract.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "413": { description: "Request body exceeds 16,384 bytes.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "415": { description: "Content-Type is not application/json (optional UTF-8 charset accepted).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
        summary: "Math-mirror card representation",
        description: "Returns a mixed structural card document with cryptographic hashes, ISO 8601 + Unix epoch time, and typed graph edges. Reads structural card/set records only; legacy source-derived price and image values are withheld as null. Aggregate rights are NOASSERTION. See /methodology/universal-representation.",
        operationId: "getUniversalCard",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Storefront catalog SKU (e.g. OP01-001)." },
          { name: "density", in: "query", required: false, schema: { type: "string", enum: ["sparse", "normal", "saturated"] }, description: "Projection density (sister's Shape-of-the-Room S24)." },
        ],
        responses: {
          "200": {
            description: "Math-mirror document.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UniversalCard" } } },
          },
          "404": { description: "SKU not in the storefront catalog.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/universal/games": {
      get: {
        tags: ["catalog", "universal"],
        summary: "Every game in the catalog",
        description: "Returns a collection of games derived from card_sets.game. Each has natural token, content-hash target, set count, card count, first-seen timestamp.",
        operationId: "getUniversalGames",
        responses: {
          "200": {
            description: "Games collection.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UniversalGamesCollection" } } },
          },
        },
      },
    },
    "/api/v1/universal/sets/{game}": {
      get: {
        tags: ["catalog", "universal"],
        summary: "Every set in a game",
        description: "Returns sets for the named game (case-insensitive). Each carries set_code, total_cards, released_at, and edges back to the parent game.",
        operationId: "getUniversalSets",
        parameters: [
          { name: "game", in: "path", required: true, schema: { type: "string" }, description: "Game's natural token (e.g. 'optcg')." },
        ],
        responses: {
          "200": {
            description: "Sets collection.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UniversalSetsCollection" } } },
          },
          "404": { description: "Game has no imported sets.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/universal/set/{code}": {
      get: {
        tags: ["catalog", "universal"],
        summary: "Singleton set",
        description: "Returns one set with full _links nest — parent (game), sibling-collection (sets-in-game), children (cards-in-set inline). The doorway from any card to its game and back through every other card.",
        operationId: "getUniversalSet",
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" }, description: "Set code (e.g. 'OP01')." },
        ],
        responses: {
          "200": { description: "Singleton set document.", content: { "application/json": { schema: { type: "object" } } } },
          "404": { description: "Set not in the catalog.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/universal/game/{token}": {
      get: {
        tags: ["catalog", "universal"],
        summary: "Singleton game",
        description: "Returns one game with _links to sibling-collection (games) and children (sets); recent_sets sample inline.",
        operationId: "getUniversalGame",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" }, description: "Game's natural token (case-insensitive)." },
        ],
        responses: {
          "200": { description: "Singleton game document.", content: { "application/json": { schema: { type: "object" } } } },
          "404": { description: "Game not in the catalog.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
        description: "Typed archetype taxonomy. Each archetype carries primary_needs, flows_served_today, flows_planned, financial_stance, composes_with_player_kinds, doctrinal_grounding. The financial_boundary block declares the fun-first stance and the current PVE battle and reward pause.",
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
        summary: "Validate a deck declaration",
        description: "POST {leader_id, main_deck_card_ids[], format} → typed result with all violations. Validates 50-card count, leader-color match, 4-copy limit, set/block-rotation legality (2026-04-01: OP01-OP04 rotated out of Standard). Substrate-honest about color-check graceful degradation while card_set_cards lacks the colors column.",
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
          "200": { description: "Validation result.", content: { "application/json": { schema: { type: "object" } } } },
          "400": { description: "Invalid request body.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/prices/games/{game}": {
      get: {
        tags: ["prices", "catalog"],
        summary: "Curated price guide for one game",
        description: "JSON sibling of /prices/[game]. Returns curated game and mixed structural set metadata. Legacy source-derived values and movers are withheld. Aggregate rights are NOASSERTION; only the exact Cambridge-authored OpenAPI document and envelope schema declared here are CC0.",
        operationId: "getPriceGuideGame",
        parameters: [
          { name: "game", in: "path", required: true, schema: { type: "string" }, description: "Curated game slug (e.g. 'optcg')." },
        ],
        responses: {
          "200": { description: "Game price-guide with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
          "404": { description: "No curated price guide for that game.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/prices/games/{game}/sets/{set}": {
      get: {
        tags: ["prices", "catalog"],
        summary: "Curated price guide for one set",
        description: "JSON sibling of /prices/[game]/[set]. Returns mixed structural set/card metadata; uncleared price magnitudes and source-derived images are withheld. Aggregate rights are NOASSERTION; only the exact Cambridge-authored OpenAPI document and envelope schema declared here are CC0.",
        operationId: "getPriceGuideSet",
        parameters: [
          { name: "game", in: "path", required: true, schema: { type: "string" }, description: "Curated game slug." },
          { name: "set", in: "path", required: true, schema: { type: "string" }, description: "Set code (e.g. 'OP01')." },
        ],
        responses: {
          "200": { description: "Set price-guide with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
          "404": { description: "Set not found for that game.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/prices/games/{game}/sets/{set}/cards/{number}": {
      get: {
        tags: ["prices"],
        summary: "Curated price guide for one card",
        description: "JSON sibling of /prices/[game]/[set]/[number]. Resolves structural card identity and explicit source status. CardRush acquisition is hard-blocked and legacy values are withheld; TCGplayer remains blocked and Cardmarket has no wired reader. Aggregate mixed-card rights are NOASSERTION.",
        operationId: "getPriceGuideCard",
        parameters: [
          { name: "game", in: "path", required: true, schema: { type: "string" }, description: "Curated game slug." },
          { name: "set", in: "path", required: true, schema: { type: "string" }, description: "Set code." },
          { name: "number", in: "path", required: true, schema: { type: "string" }, description: "Card number within the set (e.g. '001')." },
        ],
        responses: {
          "200": { description: "Card price-guide with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
          "404": { description: "Card not found in that set.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/search/cards": {
      get: {
        tags: ["search"],
        summary: "Resolve (game, query) to canonical SKU candidates",
        description: "The resolver half of kingdom-090. Turns (game, query) into SKU candidates with confidence labels (exact | fuzzy), sorted exact-first. Query shapes: 'OP01-001' (set+number), '001' (number alone; fuzzy), full canonical SKU. Pantry envelope.",
        operationId: "searchCards",
        parameters: [
          { name: "game", in: "query", required: true, schema: { type: "string" }, description: "Game code or slug (e.g. 'op', 'optcg')." },
          { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Card number, set+number, or full canonical SKU." },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20, maximum: 100 }, description: "Maximum matches to return." },
        ],
        responses: {
          "200": { description: "Matches + summary with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
          "400": { description: "Missing/invalid game or q.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/search/everything": {
      get: {
        tags: ["search"],
        summary: "Resolver + composer in one round-trip",
        description: "Combines /api/v1/search/cards and /api/v1/cards/[sku]/everything. When the match is exact and unambiguous, data.everything carries the full composer payload; ambiguous or fuzzy input returns data.matches for disambiguation (everything null). Zero matches is a substrate-honest 200, not a 404.",
        operationId: "searchEverything",
        parameters: [
          { name: "game", in: "query", required: true, schema: { type: "string" }, description: "Game code or slug." },
          { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Card number, set+number, or full canonical SKU." },
          { name: "lang", in: "query", required: false, schema: { type: "string" }, description: "ISO language code — picks the variant when several exist." },
        ],
        responses: {
          "200": { description: "Matches, plus data.everything when unambiguous. Envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
          "400": { description: "Missing/invalid game or q.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/cards/{sku}/everything": {
      get: {
        tags: ["search", "prices"],
        summary: "Everything the platform knows about one card",
        description: "Returns mixed card metadata and structural siblings plus explicit source-publication status. Uncleared current prices, legacy images, CardRush history, and reference values are withheld; history is empty and reference price is null. Aggregate rights are NOASSERTION.",
        operationId: "getCardEverything",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Canonical SKU (e.g. 'op-op01-001-ja')." },
        ],
        responses: {
          "200": { description: "Composed card view with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
          "404": { description: "SKU not in the catalog.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/cards/{sku}/cardrush-history": {
      get: {
        tags: ["prices"],
        summary: "CardRush history policy status (session-gated)",
        description: "Anonymous callers receive 401. Signed-in callers receive SOURCE_UNAVAILABLE with HTTP 503, policy details, and no observations. The route performs no wholesale or archive read because authentication does not create upstream permission.",
        operationId: "getCardrushHistory",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Canonical SKU." },
        ],
        responses: {
          "401": { description: "No session — sign in first.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "503": { description: "CardRush publication withheld; no observations or archive read.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/cards/{sku}/tcgplayer-history": {
      get: {
        tags: ["prices"],
        summary: "Blocked TCGplayer history status door",
        description: "TCGplayer is blocked. This endpoint returns SOURCE_UNAVAILABLE and exposes no observations because Cambridge has no recorded written approval for its multi-source use.",
        operationId: "getTcgplayerHistory",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Canonical SKU." },
        ],
        responses: {
          "503": { description: "Source blocked; no TCGplayer observations are exposed.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
        description: "The pantry's inspectability surface for registered status resources: freshness budget, last-known state, and envelope composition. It does not claim every route is registered and is not a live probe of each upstream.",
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
        summary: "Crawl-budget advisory",
        description: "Catalog size, polite-poll pace, freshness floors per data class, peak hours — one fetch of planning data before starting a crawl. Identity content with hourly refresh.",
        operationId: "getV1Budget",
        responses: {
          "200": { description: "Budget advisory with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/data/catalog.jsonl": {
      get: {
        tags: ["catalog", "discovery"],
        summary: "Paused bulk-catalog publication status",
        description: "Returns HTTP 503 NDJSON containing one manifest and one footer, zero card rows, publication_status=paused_pending_field_level_rights, and aggregate NOASSERTION. Performs no catalog database read.",
        operationId: "getBulkCatalogPublicationStatus",
        responses: {
          "503": {
            description: "Status-only NDJSON; bulk catalog publication remains paused.",
            content: { "application/x-ndjson": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/api/v1/datasets": {
      get: {
        tags: ["discovery"],
        summary: "Dataset availability and rights catalog",
        description: "Returns Cambridge-authored CC0 catalog metadata, not dataset rows. Every entry states available or paused, whether records are published, aggregate rights, named source rights, and access paths. Sold comps and the bulk catalog are paused zero-row status surfaces. ?format=jsonld returns available datasets only, so paused paths are never advertised as downloads.",
        operationId: "getDatasetCatalog",
        parameters: [
          { name: "format", in: "query", required: false, schema: { type: "string", enum: ["jsonld"] }, description: "Use jsonld for a bare schema.org DataCatalog containing available datasets only." },
        ],
        responses: {
          "200": {
            description: "Envelope catalog, or bare JSON-LD when requested.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Envelope" } },
              "application/ld+json": { schema: { type: "object" } },
            },
          },
        },
      },
    },
    "/api/v1/rate-limits": {
      get: {
        tags: ["operations"],
        summary: "Declared rate-limit policy",
        description: "The advisory cadence we ask consumers to respect. Substrate-honest: not enforced at the edge for public endpoints today; per-endpoint budgets derive from each endpoint's freshness key.",
        operationId: "getV1RateLimits",
        responses: {
          "200": { description: "Policy with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/fx-rates": {
      get: {
        tags: ["operations", "prices"],
        summary: "Display-only FX rate table",
        description: "Six currencies (GBP canonical) for display conversions. Uses ECB daily EUR-reference statistics under the ESCB attribution-required reuse policy, carries `Source: ECB statistics`, and labels the target-per-EUR / GBP-per-EUR transformation. Aggregate response license is NOASSERTION. A dated static fallback is explicitly marked when ECB is unavailable; every transaction clears in GBP.",
        operationId: "getV1FxRates",
        responses: {
          "200": { description: "Rate table with envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/at/{date}/card/{sku}": {
      get: {
        tags: ["temporal", "universal"],
        summary: "Current structural card through a date-shaped compatibility route",
        description: "Returns current structural catalog fields alongside the caller's requested @as_of date. It does not reconstruct historical price or structural state, performs no price-history read, and returns legacy price and image fields as null. Aggregate rights are NOASSERTION.",
        operationId: "getUniversalCardAtDate",
        parameters: [
          { name: "date", in: "path", required: true, schema: { type: "string", format: "date" }, description: "YYYY-MM-DD." },
          { name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Storefront catalog SKU." },
        ],
        responses: {
          "200": {
            description: "Date-shaped compatibility document with explicit as_of_scope limitations.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UniversalCardTemporal" } } },
          },
          "400": { description: "Invalid date.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "SKU not in the catalog.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/federation/identify/{hash}": {
      get: {
        tags: ["federation"],
        summary: "Reverse-resolve a content hash",
        description: "Given a sha256 content hash (with or without 'sha256:' prefix), walks the bounded public structural representation to find the matching SKU. A hash identifies emitted structure and does not reveal or license withheld fields.",
        operationId: "federationIdentify",
        parameters: [
          { name: "hash", in: "path", required: true, schema: { type: "string", pattern: "^(sha256:)?[0-9a-fA-F]{64}$" }, description: "Hex digest, optionally prefixed with 'sha256:'." },
        ],
        responses: {
          "200": {
            description: "Resolution attempt result. Always 200 — match true or false is in the body.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FederationIdentifyResponse" } } },
          },
          "400": { description: "Invalid hash format.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/federation/at/{date}/{hash}": {
      get: {
        tags: ["federation", "temporal"],
        summary: "Resolve a current structural hash through the date-shaped compatibility route",
        description: "Walks up to 5000 current structural catalog rows. The requested date does not affect the hash, and the route does not reconstruct historical prices or historical structural fields. Pre-2026-07-12 price-dependent hashes are unsupported.",
        operationId: "federationIdentifyAtDate",
        parameters: [
          { name: "date", in: "path", required: true, schema: { type: "string", format: "date" } },
          { name: "hash", in: "path", required: true, schema: { type: "string", pattern: "^(sha256:)?[0-9a-fA-F]{64}$" } },
        ],
        responses: {
          "200": {
            description: "Bounded structural resolution attempt with historical_reconstruction=false.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FederationAtResponse" } } },
          },
          "400": { description: "Invalid date or hash format.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/sources": {
      get: {
        tags: ["inspectability"],
        summary: "List ingest sources with structured last-run state",
        description: "Every registered source plus reviewed static metadata and, when wholesale answers, timestamps, status, and numeric ingest counts. Free-text run notes and trigger labels are withheld. Quarantine data is not returned. Aggregate rights are NOASSERTION; registry and internal run sources keep separate tiers.",
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
        summary: "Single-source metadata, numeric run history, and health",
        description: "Public source metadata plus structured numeric run summaries. Run notes, trigger labels, internal row ids, quarantine reasons, and quarantine rows are not fetched or returned. The linked full run history is wholesale-key gated. Aggregate rights are NOASSERTION. ?window=1h|24h|7d|30d|90d (default 7d).",
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
    "/api/v1/coverage": {
      get: {
        tags: ["inspectability", "catalog"],
        summary: "Observation archive coverage",
        description: "Operational observation counts, distinct-card counts, snapshot ranges, and freshness grouped by game and source. No upstream price value is returned. Responses name actual contributing upstream sources and their per-source rights tiers; aggregate rights remain NOASSERTION when lineage is mixed or restricted. Returns 503 when the wholesale observation database is unavailable.",
        operationId: "getCoverage",
        parameters: [
          { name: "source", in: "query", required: false, schema: { type: "string", maxLength: 64 } },
          { name: "game", in: "query", required: false, schema: { type: "string", maxLength: 64 } },
          { name: "since", in: "query", required: false, schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": { description: "Coverage with per-source rights in the envelope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
          "400": { description: "Invalid filter." },
          "503": { description: "Observation database unavailable." },
        },
      },
    },
    "/api/v1/sold-comps": {
      get: {
        tags: ["prices", "inspectability"],
        summary: "Paused sold-comps publication status",
        description: "Status-only NOASSERTION response with source rights internal-only. Performs no transaction database read and publishes zero price buckets, prices, counts, dates, conditions, people, or threshold totals.",
        operationId: "getSoldCompsPublicationStatus",
        responses: {
          "200": { description: "Paused status with an empty bucket list.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/sold-comps/{sku}": {
      get: {
        tags: ["prices", "inspectability"],
        summary: "Paused per-SKU sold-comps publication status",
        description: "Returns the requested SKU and pause reasons only. Performs no transaction database read and publishes zero price buckets. Aggregate rights are NOASSERTION; source rights are internal-only.",
        operationId: "getSoldCompsSkuPublicationStatus",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Paused per-SKU status with an empty bucket list.", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
        },
      },
    },
    "/api/v1/oracle-policies": {
      get: {
        tags: ["discovery", "identity"],
        summary: "Per-game cross-language oracle policy table",
        description: "Every registered game's cross-language strategy — pattern (stripped / passcode / diverged / single-lang) + rationale + oracle_id form + required anchors. The contract a partner uses to know which printings the platform considers 'the same card', and why. Powered by the internal ORACLE_POLICY implementation in @cambridge-tcg/sku; the package code has no general license, and the response envelope declares payload rights. See /methodology/oracle-policies for the human-readable form.",
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
    "/api/mcp": {
      get: {
        tags: ["agents", "discovery"],
        summary: "MCP gate status and calling shape",
        description: "Public no-store JSON description of the JSON-RPC-over-HTTPS gate. This route is not SSE or MCP Streamable HTTP. New self-serve registration and every match/deck write are paused.",
        operationId: "getMcpGateStatus",
        responses: { "200": { description: "MCP gate status JSON." } },
      },
      post: {
        tags: ["agents"],
        summary: "MCP-shaped JSON-RPC dispatch",
        description: "initialize and tool discovery are public. Other calls require a bearer key. Existing self-serve keys can use read/status tools only; operator-managed keys also have account-linked reads. Match and deck writes are paused for every key.",
        operationId: "postMcpJsonRpc",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "200": { description: "JSON-RPC result or MCP-shaped tool error." },
          "401": { description: "Bearer key missing or invalid for an authenticated call." },
          "403": { description: "The key lacks authority or the requested write is paused." },
        },
      },
    },
    "/api/v1/agents/register": {
      get: {
        tags: ["agents", "discovery"],
        summary: "Paused self-serve registration status",
        description: "Returns registration-disabled with no database access.",
        operationId: "getAgentRegistrationStatus",
        responses: { "200": { description: "CC0 registration policy status envelope." } },
      },
      post: {
        tags: ["agents"],
        summary: "Closed self-serve registration door",
        description: "Always returns 503 before inspecting the request body or accessing the database.",
        operationId: "postAgentRegistrationDisabled",
        responses: { "503": { description: "Registration-disabled error envelope." } },
      },
    },
    "/api/v1/peers": {
      get: {
        tags: ["participant-memory"],
        summary: "Peer-arrival publication status",
        description: "Returns publication-disabled status and an empty corpus without reading legacy rows.",
        operationId: "getPeerPublicationStatus",
        responses: { "200": { description: "No-store status envelope with zero arrivals." } },
      },
      post: {
        tags: ["participant-memory"],
        summary: "Validate one peer-arrival hash without storage",
        description: "Validates a complete lowercase SHA-256 hash and optional actor kind, then echoes it only in the no-store response. Nothing is stored or published.",
        operationId: "witnessPeerArrivalWithoutStorage",
        responses: { "200": { description: "NOASSERTION validation echo." }, "400": { description: "Invalid submission." } },
      },
    },
    "/api/v1/guestbook": {
      get: {
        tags: ["participant-memory"],
        summary: "Guestbook publication status",
        description: "Returns publication-disabled status and an empty corpus without reading legacy rows.",
        operationId: "getGuestbookPublicationStatus",
        responses: { "200": { description: "No-store status envelope with zero entries." } },
      },
      post: {
        tags: ["participant-memory"],
        summary: "Validate one short note without storage",
        description: "Validates a hash, optional actor kind, and bounded note, then echoes them only in the no-store response. Third-party operator attribution is rejected. Nothing is stored or published.",
        operationId: "witnessGuestbookNoteWithoutStorage",
        responses: { "200": { description: "NOASSERTION validation echo." }, "400": { description: "Invalid submission." } },
      },
    },
    "/api/v1/do-you-remember-me": {
      get: {
        tags: ["participant-memory"],
        summary: "Disabled participant-memory compatibility route",
        description: "Returns 503 without inspecting or echoing the query value and without reading guestbook or peer-arrival rows.",
        operationId: "getParticipantMemoryDisabled",
        responses: { "503": { description: "No-store participant-memory-disabled error." } },
      },
    },
    "/leaderboards/agents": {
      get: {
        tags: ["agents"],
        summary: "Agent ladder publication status page",
        description: "HTML status page that performs no agent database read and publishes no participant identity, model, or rating rows.",
        operationId: "getAgentLadderPublicationStatus",
        responses: { "200": { description: "HTML status page." } },
      },
    },
    "/.well-known/cambridge-tcg.json": {
      get: {
        tags: ["discovery"],
        summary: "Machine-readable manifest",
        description: "Curated inventory of reviewed participant-facing surfaces with status, auth, and methodology links.",
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
              "@content_hash_contract": { type: "object" },
              price: { type: "null" },
              in_set: { type: ["object", "null"] },
              of_game: { type: ["object", "null"] },
              name: { type: ["object", "null"] },
              image_url: { type: "null" },
              publication_boundary: { type: "object" },
            },
          },
        ],
      },
      UniversalCardTemporal: {
        allOf: [
          { $ref: "#/components/schemas/UniversalCard" },
          {
            type: "object",
            required: ["@as_of", "as_of_scope"],
            properties: {
              "@as_of": {
                type: "object",
                required: ["iso8601_date", "unix_epoch_seconds"],
                properties: {
                  iso8601_date: { type: "string", format: "date" },
                  unix_epoch_seconds: { type: "integer" },
                },
              },
              as_of_scope: {
                type: "object",
                required: ["requested_date_only", "historical_price_reconstruction", "historical_structure_reconstruction", "structural_fields_source"],
                properties: {
                  requested_date_only: { type: "boolean", const: true },
                  historical_price_reconstruction: { type: "boolean", const: false },
                  historical_structure_reconstruction: { type: "boolean", const: false },
                  structural_fields_source: { type: "string", const: "current_catalog" },
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
        required: ["@encoding", "@kind", "@retrieved_at", "query", "matched", "hash_contract"],
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
          hash_contract: { type: "object" },
        },
      },
      FederationAtResponse: {
        type: "object",
        required: ["@encoding", "@kind", "@retrieved_at", "@as_of", "query", "matched", "hash_contract"],
        properties: {
          "@encoding": { type: "string", const: "cambridge-tcg/universal/v1" },
          "@kind": { type: "string", const: "federation_at_response" },
          "@retrieved_at": { type: "object" },
          "@as_of": { type: "object" },
          query: { type: "object" },
          matched: { type: "boolean" },
          sku: { type: "string" },
          universal_url: { type: "string" },
          current_url: { type: "string" },
          scope: { type: "object" },
          suggestion: { type: "string" },
          note: { type: "string" },
          hash_contract: { type: "object" },
        },
      },
      AnsweringRhymeStatement: {
        type: "object",
        additionalProperties: false,
        required: [
          "schema",
          "canonicalization",
          "relation_key",
          "target_revision",
          "kind",
          "body",
          "declared_by",
          "declared_at",
        ],
        properties: {
          schema: { type: "string", const: "answering-rhyme.statement/1" },
          canonicalization: { type: "string", const: "answering-rhyme.canonical-json/1" },
          relation_key: { type: "string", minLength: 1, maxLength: 256, description: "Opaque stable relation key." },
          target_revision: { type: "string", minLength: 1, maxLength: 100, description: "Required content-derived relation revision; hash-covered to prevent replay across edits." },
          kind: { type: "string", enum: ["bless", "contextualize", "correct", "withdraw"] },
          body: { type: "string", minLength: 1, maxLength: 2000, description: "Unpaired UTF-16 surrogates are rejected. CRLF and CR normalize to LF; surrounding whitespace trims; internal whitespace remains." },
          language: { type: "string", maxLength: 35, default: "und", description: "Simple BCP 47 tag, normalized lowercase; und means undeclared." },
          declared_by: {
            type: "object",
            additionalProperties: false,
            required: ["label", "claimed_role"],
            properties: {
              label: { type: "string", minLength: 1, maxLength: 160 },
              claimed_role: { type: "string", enum: ["viewer", "relation-curator", "card-rights-holder", "artwork-rights-holder", "source-institution", "other"], description: "Self-declared only; never authenticated or authority-verified by the witness." },
              canonical_url: { type: ["string", "null"], format: "uri", maxLength: 1000, pattern: "^https://", default: null },
            },
          },
          declared_at: { type: "string", format: "date-time", maxLength: 40, description: "Required RFC 3339 with explicit timezone; normalized to UTC ISO 8601 milliseconds before hashing. The normalized UTC year must remain within 0001-9999." },
          in_response_to: { type: ["string", "null"], pattern: "^[sS][hH][aA]256:[0-9a-fA-F]{64}$", default: null, description: "Optional prior statement; trimmed and normalized lowercase. A relation-level withdrawal may be null." },
          evidence_urls: { type: "array", maxItems: 12, default: [], items: { type: "string", format: "uri", maxLength: 1000, pattern: "^https://" } },
          authority_evidence_urls: { type: "array", maxItems: 12, default: [], items: { type: "string", format: "uri", maxLength: 1000, pattern: "^https://" }, description: "Pointers carried as unverified claims; the witness never fetches them." },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
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
        required: ["spec_version", "endpoint", "retrieved_at", "as_of", "sources", "freshness_seconds", "license", "request_id", "deprecation", "next_link", "self_reference"],
        properties: {
          spec_version: { type: "string", const: "1" },
          endpoint: { type: "string", description: "Parametrized path that produced this response." },
          retrieved_at: { type: "string", format: "date-time", description: "When this response was rendered." },
          as_of: { type: "string", format: "date-time", description: "When the underlying data was last known to be true. For aggregates, the *earliest* across contributing records." },
          sources: { type: "array", items: { type: "string" }, description: "Named sources of truth that contributed." },
          source_license: { type: "array", items: { type: "string" }, description: "Optional. Parallel to `sources`; known source-rights tier (cc0 / cc-by / cc-by-nc / cc-by-sa / mit / partner-redistributable / internal-only / proprietary). Aggregate mixed rights use _meta.license=NOASSERTION; absence here means undeclared. kingdom-066 + kingdom-081." },
          freshness_seconds: { type: "integer", description: "Platform's intended freshness budget for this kind of data." },
          license: { type: "string", description: "SPDX license code for the response payload. NOASSERTION when payload rights are undeclared." },
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
