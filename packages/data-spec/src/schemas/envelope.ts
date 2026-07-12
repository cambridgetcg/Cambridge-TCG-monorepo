/**
 * JSON Schema 2020-12 for the Cambridge TCG response envelope.
 *
 * The shape every successful pantry response wears: `{ data, _meta }`.
 * Failures use `ERROR_BODY_SCHEMA` and its deliberately slimmer ErrorMeta.
 *
 * Partners can use this schema to:
 *   - validate responses received from Cambridge TCG endpoints
 *   - generate TypeScript / Python / Go types via codegen
 *   - lint their own mock servers against the contract
 *
 * Stable. The schema itself versions through the `spec_version` field
 * inside `_meta`; this file's `$id` carries the same version.
 */

import { ERROR_CODES } from "../error-codes";

export const META_SCHEMA = {
  $id: "https://cambridgetcg.com/spec/v1/Meta.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ResponseMeta",
  description:
    "The _meta block carried on every successful Cambridge TCG pantry response. Tells the caller spec version, when the response was rendered, when the data was last true, which sources fed it, the freshness budget, license, request id, self-reference if applicable, and (optional) per-source redistribution licenses. Error responses use the slimmer ErrorMeta in ERROR_BODY_SCHEMA.",
  type: "object",
  // `extra_meta` is an intentional extension point in the runtime envelope.
  // Standard fields are fully described below; endpoint-specific extension
  // fields remain valid instead of making real responses fail this schema.
  additionalProperties: true,
  required: [
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
    "joy_pointer",
  ],
  properties: {
    spec_version: {
      description: "Spec version of the response envelope. Currently '1'.",
      type: "string",
      const: "1",
    },
    endpoint: {
      description: "Path that produced this response, parametrized.",
      type: "string",
      examples: ["/api/v1/cards/[sku]", "/data.json"],
    },
    retrieved_at: {
      description: "When this response was rendered (ISO 8601, server clock).",
      type: "string",
      format: "date-time",
    },
    as_of: {
      description:
        "When the underlying data was last known to be true (ISO 8601). For current-state views, equals retrieved_at; for historical views, can be earlier.",
      type: "string",
      format: "date-time",
    },
    sources: {
      description: "Named sources of truth that contributed to this response.",
      type: "array",
      items: { type: "string" },
      examples: [["wholesale-rds.cards"], ["ctcg-derived"]],
    },
    freshness_seconds: {
      description:
        "Platform's intended freshness budget for this kind of data. The actual @as_of on each record may be fresher.",
      type: "integer",
      minimum: 0,
    },
    license: {
      description:
        "SPDX expression or NOASSERTION for the response payload. NOASSERTION is the safe default; a route must make any reuse grant explicitly.",
      type: "string",
      examples: ["NOASSERTION", "CC0-1.0"],
    },
    request_id: {
      description:
        "Server-generated id for this response. Quote in support tickets.",
      type: "string",
      pattern: "^req_[a-zA-Z0-9_-]+$",
    },
    deprecation: {
      description:
        "Optional deprecation notice when this endpoint will be retired.",
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["sunset", "replacement"],
          properties: {
            sunset: { type: "string", format: "date-time" },
            replacement: { type: "string" },
          },
        },
      ],
    },
    next_link: {
      description: "Cursor-style pagination next link, when applicable.",
      oneOf: [{ type: "null" }, { type: "string" }],
    },
    self_reference: {
      description:
        "Present when the response describes the endpoint that produced it (e.g. /data.json, /api/v1/manifest, /api/v1/identify).",
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["this_endpoint", "contains_self"],
          properties: {
            this_endpoint: { type: "string" },
            contains_self: { const: true },
          },
        },
      ],
    },
    source_license: {
      description:
        "Optional. When present, parallel array to `sources`: one entry per source naming whether downstream consumers may redistribute upstream-derived data. Values come from the SourceMeta.license tier (cc0, cc-by, cc-by-nc, cc-by-sa, mit, partner-redistributable, internal-only, proprietary). Absence is substrate-honest: the platform has not yet declared per-source rights for this response.",
      oneOf: [
        { type: "null" },
        {
          type: "array",
          items: {
            type: "string",
            enum: [
              "cc0",
              "cc-by",
              "cc-by-nc",
              "cc-by-sa",
              "mit",
              "partner-redistributable",
              "internal-only",
              "proprietary",
            ],
          },
        },
      ],
    },
    upstream_proxy: {
      description:
        "Optional. When present, parallel array to `sources`: one entry per source naming the proxy used to retrieve that upstream's bytes ('bright-data-web-unlocker', 'none'). Absence means direct egress for every source. Substrate-honesty extended one ring further: a row fetched through an unlocker carries that fact through to any partner who reads it. Added kingdom-088; see docs/connections/the-bright-data-unlock.md.",
      oneOf: [
        { type: "null" },
        {
          type: "array",
          items: {
            type: "string",
            examples: ["bright-data-web-unlocker", "none"],
          },
        },
      ],
    },
    kingdom: {
      description: "Stable platform identity and sibling-discovery stamp.",
      type: "object",
      additionalProperties: false,
      required: [
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
      ],
      properties: {
        name: { const: "cambridgetcg" },
        role: { const: "adapter-expression" },
        built_with: { const: "love" },
        serves_kinds: {
          type: "array",
          items: { type: "string", enum: ["human", "agent", "kin"] },
        },
        host: { const: "humans-on-earth" },
        epoch: { const: "2026" },
        embassy: { const: "/api/v1/manifest" },
        wake: { const: "/api/v1/wake" },
        identify: { const: "/api/v1/identify" },
        siblings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "role", "url", "wake_url"],
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              url: { type: ["string", "null"] },
              wake_url: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    wake_fragment: {
      description: "One deterministic fragment of the distributed wake.",
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "text",
        "walking_past_is_honored",
        "canonical_url",
        "protocol_doc",
      ],
      properties: {
        id: { type: "string" },
        kind: { type: "string" },
        text: { type: "string" },
        walking_past_is_honored: { const: true },
        canonical_url: { type: "string" },
        protocol_doc: { type: "string" },
      },
    },
    joy_pointer: {
      description: "Deterministic, optional-to-follow joy surface pointer.",
      type: "object",
      additionalProperties: false,
      required: ["url", "hint", "room", "protocol", "walking_past_is_honored"],
      properties: {
        url: { type: "string" },
        hint: { type: "string" },
        room: { type: "string", enum: ["tea-room", "joy-layer", "fellowship"] },
        protocol: { const: "joy-to-the-world" },
        walking_past_is_honored: { const: true },
      },
    },
    does_not_include: {
      type: "array",
      items: { type: "string" },
    },
    tea_offered: { const: true },
    kingdom_says: { type: "string" },
    gotcha: { type: "string" },
  },
} as const;

export const ENVELOPE_SCHEMA = {
  $id: "https://cambridgetcg.com/spec/v1/Envelope.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ResponseEnvelope",
  description:
    "The canonical successful Cambridge TCG response envelope. Pantry successes on /api/v1/* (and /data.json, /standards.json, etc.) wear this shape: { data, _meta }. Failures use ERROR_BODY_SCHEMA.",
  type: "object",
  additionalProperties: false,
  required: ["data", "_meta"],
  properties: {
    data: {
      description:
        "The response payload. Shape varies per endpoint; see the endpoint-specific schema for the payload contract.",
    },
    _meta: { $ref: "Meta.schema.json" },
  },
} as const;

/** Re-export of the error-code list for schemas that reference it. */
export const ERROR_CODE_VALUES = ERROR_CODES;
