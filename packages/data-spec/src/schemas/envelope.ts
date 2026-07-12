/**
 * JSON Schema 2020-12 for the Cambridge TCG response envelope.
 *
 * The shape every public response wears: `{ data, _meta }`.
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
    "The _meta block carried on every public Cambridge TCG response. Tells the caller spec version, when the response was rendered, when the data was last true, which sources fed it, the freshness budget, license, request id, self-reference if applicable, and (optional) per-source redistribution licenses.",
  type: "object",
  additionalProperties: false,
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
        "SPDX license code for the response payload. NOASSERTION when payload rights are not declared; all-CC0 source declarations may resolve to CC0-1.0.",
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
  },
} as const;

export const ENVELOPE_SCHEMA = {
  $id: "https://cambridgetcg.com/spec/v1/Envelope.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ResponseEnvelope",
  description:
    "The canonical Cambridge TCG response envelope. Every public response on /api/v1/* (and /data.json, /standards.json, etc.) wears this shape: { data, _meta }. Partners learn it once.",
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
