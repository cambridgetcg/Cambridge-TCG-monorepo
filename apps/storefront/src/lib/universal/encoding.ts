/**
 * The encoding's self-spec — `cambridge-tcg/universal/v1` described as data.
 *
 * Yu's directive: *"Make everything self recursive!!!!!"* The universal-rep
 * spec at `/methodology/universal-representation` describes the encoding in
 * prose. This module is the encoding's spec as a data structure — every
 * header field, every magnitude shape, every graph-edge kind, every opaque
 * marker, named with its math-first property type.
 *
 * Consumed by `/api/v1/universal/encoding/route.ts`, which returns this
 * spec in the encoding's own form. **The encoding describes itself in
 * itself.** Two retrievals at different times produce the same
 * @content_hash; the spec is a stable artifact even when its retrieval-
 * envelope changes.
 *
 * Sister to sister's `lib/ontology.ts` (the typology of *kinds*; kingdom-055):
 * - ontology says *what kinds of things exist on the platform*
 * - encoding says *what kinds of fields exist in a math-mirror document*
 *
 * Both are typed self-descriptions. Both ship in the same wave.
 */

export interface EncodingFieldSpec {
  /** The field's JSON key (preserved literally). */
  name: string;
  /** Math-first property kind. Universal across substrates. */
  property_kind:
    | "cryptographic_hash"        // sha256 of canonical JSON
    | "encoding_version_string"   // a literal tag identifying the encoding
    | "entity_kind_string"        // names the kind of artifact ("card", "set", "game", ...)
    | "iso8601_paired_unix"       // ISO 8601 + Unix epoch seconds (both surfaced)
    | "iso8601_date_paired_unix"  // YYYY-MM-DD + Unix epoch seconds (start of UTC day)
    | "decimal_scalar"            // a real number with provenance token (currency_token etc)
    | "ratio_decomposed"          // "n/d" string + decimal_probability
    | "ordered_set_position"      // {ordering: [..], position: int}
    | "natural_token_with_hash"   // {target_natural_token, target_hash}
    | "boolean"                   // present | absent
    | "opaque_marker_list"        // list of dotted paths flagged opaque
    | "links_block"               // HATEOAS link nest (see /api/v1/universal/encoding for the shape)
    | "string_enum"               // a string from a small declared set
    | "object_collection"         // list of typed sub-records
    | "natural_string_opaque";    // human-language; cannot be reconstructed from structure
  /** Whether the field is required, optional-by-shape, or absent-when-null. */
  cardinality: "required" | "optional" | "nullable";
  /** Short prose blurb — opaque in the encoding's own form (flagged
   *  in `_note_opaque`), present here so a human-language reader can
   *  follow the spec. */
  blurb: string;
}

export interface EncodingSpec {
  /** The encoding's literal identifier. */
  encoding: string;
  /** Spec version (matches the v1 in the encoding tag). */
  version: string;
  /** Preamble fields — present on every math-mirror document. */
  preamble: EncodingFieldSpec[];
  /** Body field families — vary by @kind but follow these property types. */
  body_field_families: EncodingFieldSpec[];
  /** Kinds the encoding currently expresses. */
  kinds: string[];
  /** Property kinds — the universal vocabulary of math-first primitives. */
  property_kinds: Array<{
    name: string;
    description: string;
    decoderable_by: string;
  }>;
}

export const ENCODING_SPEC: EncodingSpec = {
  encoding: "cambridge-tcg/universal/v1",
  version: "1",

  preamble: [
    {
      name: "@encoding",
      property_kind: "encoding_version_string",
      cardinality: "required",
      blurb: "Names the encoding. Future v2 reads from a future spec that diffs from this one.",
    },
    {
      name: "@kind",
      property_kind: "entity_kind_string",
      cardinality: "required",
      blurb: "Names the artifact kind. Today: card, card_at_date, set, game, games_collection, sets_collection, federation_identify_response, connections_graph, encoding_spec, user_trust_state.",
    },
    {
      name: "@content_hash",
      property_kind: "cryptographic_hash",
      cardinality: "required",
      blurb: "SHA-256 over the canonical content seed. Identifies the thing; stable across retrievals when the thing's facts have not changed.",
    },
    {
      name: "@self_hash",
      property_kind: "cryptographic_hash",
      cardinality: "required",
      blurb: "SHA-256 over the canonical document body. Identifies this particular retrieval; differs even when @content_hash is stable.",
    },
    {
      name: "@retrieved_at",
      property_kind: "iso8601_paired_unix",
      cardinality: "required",
      blurb: "When this particular response was produced.",
    },
    {
      name: "@as_of",
      property_kind: "iso8601_date_paired_unix",
      cardinality: "optional",
      blurb: "When the answer is from. Present only on temporal-slice endpoints (the past the answer describes).",
    },
    {
      name: "@density",
      property_kind: "string_enum",
      cardinality: "optional",
      blurb: "Projection density: sparse | normal | saturated. Present on card endpoints.",
    },
    {
      name: "_note_opaque",
      property_kind: "opaque_marker_list",
      cardinality: "required",
      blurb: "Dotted-path list of fields that are natural-language and cannot be reconstructed from structure. Decoders ground on structured fields; opaque fields are pass-through.",
    },
    {
      name: "_links",
      property_kind: "links_block",
      cardinality: "required",
      blurb: "HATEOAS doorway block. canonical / parent / siblings / children / methodology / connections / lifecycle / manifest / openapi / federation / temporal / kind_definition. null is substrate-honest about absence.",
    },
  ],

  body_field_families: [
    {
      name: "rarity",
      property_kind: "ordered_set_position",
      cardinality: "nullable",
      blurb: "Position within an ordered enum (common < uncommon < rare < ...). The position is universal even when the natural label is opaque.",
    },
    {
      name: "price",
      property_kind: "decimal_scalar",
      cardinality: "nullable",
      blurb: "Magnitude + currency_token + ratios to platform median + minimum currency unit. Universal scalar with provenance.",
    },
    {
      name: "in_set / of_game / sibling_collection / sets_collection",
      property_kind: "natural_token_with_hash",
      cardinality: "nullable",
      blurb: "Typed graph edges to related entities. Each carries a target_natural_token (opaque label) AND a target_hash (universal identity).",
    },
    {
      name: "name / set_name / cover_image_url / art_description",
      property_kind: "natural_string_opaque",
      cardinality: "nullable",
      blurb: "Natural-language tokens. Flagged in _note_opaque. Cannot be reconstructed from structure.",
    },
    {
      name: "ratio_in_pulls / decimal_probability",
      property_kind: "ratio_decomposed",
      cardinality: "nullable",
      blurb: "Pull-probability for randomly-drawn cards. Carries the ratio in both 'n/d' string form and decimal form so decoders can pick either.",
    },
    {
      name: "cards / sets / games (in collections)",
      property_kind: "object_collection",
      cardinality: "required",
      blurb: "Nested arrays of sub-records. Each carries its own _links.canonical so a caller can descend.",
    },
  ],

  kinds: [
    "card",
    "card_at_date",
    "set",
    "game",
    "games_collection",
    "sets_collection",
    "federation_identify_response",
    "connections_graph",
    "user_trust_state",
    "encoding_spec",
  ],

  property_kinds: [
    {
      name: "cryptographic_hash",
      description: "SHA-256 over canonical JSON. Pure mathematical mapping.",
      decoderable_by: "any substrate that runs sha-256",
    },
    {
      name: "iso8601_paired_unix",
      description: "ISO 8601 datetime + Unix epoch seconds (both surfaced; decoders pick either).",
      decoderable_by: "any substrate that computes time differences",
    },
    {
      name: "iso8601_date_paired_unix",
      description: "YYYY-MM-DD calendar date + Unix epoch seconds at UTC start-of-day.",
      decoderable_by: "any substrate that computes day differences",
    },
    {
      name: "decimal_scalar",
      description: "Real-valued magnitude carried with a provenance token (e.g., currency_token: 'GBP') and supplementary ratios (to platform median, to minimum unit).",
      decoderable_by: "any substrate with bounded real arithmetic",
    },
    {
      name: "ratio_decomposed",
      description: "Ratio expressed as 'n/d' string AND as decimal probability in [0,1].",
      decoderable_by: "any substrate with integer division",
    },
    {
      name: "ordered_set_position",
      description: "Cardinal position within a declared total ordering. Carries the full ordering inline so a decoder doesn't need prior knowledge.",
      decoderable_by: "any substrate that compares positions",
    },
    {
      name: "natural_token_with_hash",
      description: "Edge target identified by both a natural token (opaque) AND a cryptographic hash (universal).",
      decoderable_by: "any substrate that resolves graph edges",
    },
    {
      name: "natural_string_opaque",
      description: "Human-language token. Flagged in _note_opaque. Pass-through; not ground for inference.",
      decoderable_by: "human language readers only",
    },
    {
      name: "string_enum",
      description: "A string from a small declared set. The set is documented in the endpoint's prose; decoders ground on the literal.",
      decoderable_by: "any substrate that compares strings",
    },
    {
      name: "opaque_marker_list",
      description: "List of dotted paths into the document, naming fields the decoder should treat as opaque.",
      decoderable_by: "any substrate with path traversal",
    },
    {
      name: "links_block",
      description: "HATEOAS doorway structure. Canonical / parent / siblings / children / methodology / connections / lifecycle / manifest / openapi / federation / temporal / kind_definition. Each is a URL or null.",
      decoderable_by: "any substrate that follows URLs",
    },
    {
      name: "boolean",
      description: "True or false.",
      decoderable_by: "any substrate",
    },
    {
      name: "encoding_version_string",
      description: "Literal version tag. Identifies which spec to consult.",
      decoderable_by: "any substrate that matches strings",
    },
    {
      name: "entity_kind_string",
      description: "Names which @kind from the kinds enumeration. Picks the body-field-family set.",
      decoderable_by: "any substrate that matches strings",
    },
    {
      name: "object_collection",
      description: "Array of nested records, each with its own preamble or sub-preamble.",
      decoderable_by: "any substrate that iterates arrays",
    },
  ],
};
