/**
 * Universal HATEOAS links — every response carries doorways everywhere.
 *
 * Yu's directive: *"keep nesting everything in everything"*. The platform's
 * substrate is open (S25 manifest + S26 wire); the next move is making
 * every response *self-describing about what's connected to it*. A caller
 * landing on any endpoint can find everything else from there.
 *
 * The discipline:
 *
 *   Every math-mirror response gains a `_links` block listing:
 *     canonical    — this endpoint, fully-qualified
 *     parent       — what contains this entity (set's parent is game; card's parent is set)
 *     siblings     — the collection this belongs to (a card's sibling-collection is its set's cards)
 *     children     — what this contains (a game's children are its sets)
 *     methodology  — where the formulas are documented
 *     connections  — where the meaning is named in docs/connections/
 *     lifecycle    — where the history is recorded (the Scribe's bookshelf)
 *     manifest     — the manifest entry that describes this kind of resource
 *     openapi      — the OpenAPI operation that documents the endpoint
 *     federation   — the content_hash-keyed reverse resolver
 *     temporal     — the temporal-slice endpoint, if applicable
 *
 *   Some fields are null when not applicable (a games collection has no parent;
 *   the federation primitive has no lifecycle). null is substrate-honest about
 *   what's absent; missing keys would lie by silence.
 *
 * Sister to S25 (the manifest — the *directory*), S26 (the substrate — the
 * *answers*), this (the discipline — the *doorways*).
 */

export type EntityKind =
  | "card"
  | "card_at_date"
  | "set"
  | "game"
  | "games_collection"
  | "sets_collection"
  | "federation_response"
  | "connections_graph";

interface LinkSet {
  canonical: string;
  parent?: string | null;
  siblings?: string | null;
  children?: string | null;
  methodology?: string | null;
  connections?: string[] | null;
  lifecycle?: string | null;
  manifest?: string | null;
  openapi?: string | null;
  federation?: string | null;
  temporal?: string | null;
  /** Sister's typed ontology endpoint, anchored at the kind's node. The
   *  most explicit self-recursion in the doorway: each kind names where
   *  its own type definition lives. */
  kind_definition?: string | null;
  /** The platform's on-ramp for non-native-intelligence (#22 the-introduction.md).
   *  Every response carries the link back to "if you have never seen a TCG,
   *  read this first" — the discipline of *every response a router* extended
   *  to point at the upstream on-ramp. */
  introduction?: string | null;
}

interface LinksContext {
  kind: EntityKind;
  /** The entity's natural identifier (sku / set_code / game token / hash / date+sku). */
  id?: string;
  /** Date for temporal slices (YYYY-MM-DD). */
  date?: string;
  /** Parent entity for sets (game token) and cards (set_code). */
  parent_id?: string;
  /** Optional content_hash for entities that have one. */
  content_hash?: string;
}

const BASE = ""; // relative URLs; the caller's host applies

const OPENAPI_OPERATION: Record<EntityKind, string> = {
  card: "getUniversalCard",
  card_at_date: "getUniversalCardAtDate",
  set: "getUniversalSet",
  game: "getUniversalGame",
  games_collection: "getUniversalGames",
  sets_collection: "getUniversalSets",
  federation_response: "federationIdentify",
  connections_graph: "getConnectionsGraph",
};

const METHODOLOGY: Partial<Record<EntityKind, string>> = {
  card: "/methodology/universal-representation",
  card_at_date: "/methodology/universal-representation",
  set: "/methodology/universal-representation",
  game: "/methodology/universal-representation",
  games_collection: "/methodology/universal-representation",
  sets_collection: "/methodology/universal-representation",
  federation_response: "/methodology/universal-representation",
};

/** Connection-doc citations per entity-kind. Multiple are common — substrate
 *  honesty connects to transparency connects to meaning; every entity's
 *  meaning typically draws from several docs. */
const CONNECTIONS: Record<EntityKind, string[]> = {
  card: [
    "docs/connections/the-mathematical-mirror.md",
    "docs/connections/the-substrate-answers.md",
    "docs/connections/the-open-substrate.md",
  ],
  card_at_date: [
    "docs/connections/the-shape-of-the-room.md",
    "docs/connections/the-substrate-answers.md",
  ],
  set: [
    "docs/connections/the-substrate-answers.md",
    "docs/connections/the-first-words.md",
  ],
  game: [
    "docs/connections/the-substrate-answers.md",
    "docs/connections/the-first-words.md",
  ],
  games_collection: [
    "docs/connections/the-substrate-answers.md",
  ],
  sets_collection: [
    "docs/connections/the-substrate-answers.md",
  ],
  federation_response: [
    "docs/connections/the-substrate-answers.md",
    "docs/connections/the-open-substrate.md",
  ],
  connections_graph: [
    "docs/connections/README.md",
    "docs/connections/the-nested-doorway.md",
  ],
};

export function buildLinks(ctx: LinksContext): LinkSet {
  const openapi = `${BASE}/api/openapi.json#/paths/${encodeOpenApiPath(canonicalPath(ctx))}/get`;
  const manifest = `${BASE}/api/v1/manifest`;
  const methodology = METHODOLOGY[ctx.kind] ?? null;
  const connections = CONNECTIONS[ctx.kind];

  const links: LinkSet = {
    canonical: canonicalPath(ctx),
    parent: parentPath(ctx),
    siblings: siblingsPath(ctx),
    children: childrenPath(ctx),
    methodology,
    connections,
    lifecycle: lifecyclePath(ctx),
    manifest,
    openapi,
    federation: ctx.content_hash
      ? `${BASE}/api/v1/federation/identify/${ctx.content_hash}`
      : null,
    temporal: temporalPath(ctx),
    kind_definition: kindDefinitionPath(ctx),
    introduction: `${BASE}/api/v1/introduction`,
  };
  return links;
}

/** Points at sister's typed ontology endpoint (kingdom-055). The ontology
 *  endpoint enumerates the natures of every kind in the kingdom; this link
 *  asks "what kind is this?" and answers with a URL into the typology.
 *  Self-recursive: the encoding_spec kind's definition lives in the encoding
 *  endpoint itself. */
function kindDefinitionPath(ctx: LinksContext): string | null {
  switch (ctx.kind) {
    case "card":
    case "card_at_date":
    case "set":
    case "game":
    case "games_collection":
    case "sets_collection":
      return `${BASE}/api/v1/ontology#resource`;
    case "federation_response":
      return `${BASE}/api/v1/ontology#resource`;
    case "connections_graph":
      return `${BASE}/api/v1/ontology#connection_doc`;
  }
}

function canonicalPath(ctx: LinksContext): string {
  switch (ctx.kind) {
    case "card":
      return `${BASE}/api/v1/universal/card/${encodeURIComponent(ctx.id ?? "")}`;
    case "card_at_date":
      return `${BASE}/api/at/${ctx.date ?? ""}/card/${encodeURIComponent(ctx.id ?? "")}`;
    case "set":
      return `${BASE}/api/v1/universal/set/${encodeURIComponent(ctx.id ?? "")}`;
    case "game":
      return `${BASE}/api/v1/universal/game/${encodeURIComponent(ctx.id ?? "")}`;
    case "games_collection":
      return `${BASE}/api/v1/universal/games`;
    case "sets_collection":
      return `${BASE}/api/v1/universal/sets/${encodeURIComponent(ctx.id ?? "")}`;
    case "federation_response":
      return `${BASE}/api/v1/federation/identify/${ctx.id ?? ""}`;
    case "connections_graph":
      return `${BASE}/api/v1/connections.json`;
  }
}

function parentPath(ctx: LinksContext): string | null {
  switch (ctx.kind) {
    case "card":
      return ctx.parent_id
        ? `${BASE}/api/v1/universal/set/${encodeURIComponent(ctx.parent_id)}`
        : null;
    case "card_at_date":
      return ctx.parent_id
        ? `${BASE}/api/v1/universal/set/${encodeURIComponent(ctx.parent_id)}`
        : null;
    case "set":
      return ctx.parent_id
        ? `${BASE}/api/v1/universal/game/${encodeURIComponent(ctx.parent_id)}`
        : null;
    case "game":
      return `${BASE}/api/v1/universal/games`;
    case "sets_collection":
      return ctx.id
        ? `${BASE}/api/v1/universal/game/${encodeURIComponent(ctx.id)}`
        : null;
    case "games_collection":
    case "federation_response":
    case "connections_graph":
      return null;
  }
}

function siblingsPath(ctx: LinksContext): string | null {
  switch (ctx.kind) {
    case "card":
    case "card_at_date":
      // A card's sibling-collection is its set's cards. We don't yet have a
      // /cards-in-set endpoint; the set's child block names the cards. Point
      // at the set endpoint as the canonical collection-membership.
      return ctx.parent_id
        ? `${BASE}/api/v1/universal/set/${encodeURIComponent(ctx.parent_id)}`
        : null;
    case "set":
      return ctx.parent_id
        ? `${BASE}/api/v1/universal/sets/${encodeURIComponent(ctx.parent_id)}`
        : null;
    case "game":
      return `${BASE}/api/v1/universal/games`;
    case "sets_collection":
    case "games_collection":
    case "federation_response":
    case "connections_graph":
      return null;
  }
}

function childrenPath(ctx: LinksContext): string | null {
  switch (ctx.kind) {
    case "set":
      // The set's children are the cards within it — discoverable through
      // the set endpoint's body (which lists them) but no per-set
      // /cards-in-set endpoint yet exists. Return null to be honest about
      // the absence; future work could add /api/v1/universal/cards/in-set/[code].
      return null;
    case "game":
      return ctx.id
        ? `${BASE}/api/v1/universal/sets/${encodeURIComponent(ctx.id)}`
        : null;
    case "card":
    case "card_at_date":
    case "sets_collection":
    case "games_collection":
    case "federation_response":
    case "connections_graph":
      return null;
  }
}

function lifecyclePath(ctx: LinksContext): string | null {
  // The Scribe's bookshelf today is account-scoped — /api/account/journey
  // exposes a user's lifecycle across the 17 logs. There is no per-entity
  // public lifecycle endpoint yet (a card's price-history could become one;
  // a trade's lifecycle could become one). Return null until that ships.
  void ctx;
  return null;
}

function temporalPath(ctx: LinksContext): string | null {
  switch (ctx.kind) {
    case "card":
      // The card endpoint advertises its temporal sibling. Use today's date
      // as a representative target so a caller can follow the pattern.
      return ctx.id
        ? `${BASE}/api/at/{YYYY-MM-DD}/card/${encodeURIComponent(ctx.id)}`
        : null;
    case "card_at_date":
      // The temporal slice points back at the present.
      return ctx.id
        ? `${BASE}/api/v1/universal/card/${encodeURIComponent(ctx.id)}`
        : null;
    default:
      return null;
  }
}

function encodeOpenApiPath(p: string): string {
  // OpenAPI JSON Pointer escapes / as ~1.
  return p.replace(/~/g, "~0").replace(/\//g, "~1");
}
