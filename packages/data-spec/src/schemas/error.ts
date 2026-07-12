/**
 * JSON Schema 2020-12 for the canonical error response.
 *
 * The shape every pantry failure wears: `{ error, _meta }`.
 */

import { ERROR_CODES } from "../error-codes";

export const ERROR_BODY_SCHEMA = {
  $id: "https://cambridgetcg.com/spec/v1/ErrorBody.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ErrorBody",
  description:
    "Canonical error response shape. Every failure on Cambridge TCG public endpoints emits this. Stable codes (machine-readable), blameless messages (human-readable), request_id (quotable in support).",
  type: "object",
  additionalProperties: false,
  required: ["error", "_meta"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "request_id"],
      properties: {
        code: {
          description: "Stable, machine-readable error code.",
          type: "string",
          enum: [...ERROR_CODES],
        },
        message: {
          description:
            "Human-readable, actionable, blameless. Names what couldn't complete; not whose fault.",
          type: "string",
        },
        request_id: {
          description: "Quotable in support tickets.",
          type: "string",
          pattern: "^req_[a-zA-Z0-9_-]+$",
        },
        docs: {
          description:
            "Optional methodology/doc URL that explains the rule. Present when the error has a public methodology page.",
          type: "string",
        },
        details: {
          description:
            "Optional field-level details (which input was bad, what was expected, etc.).",
          type: "object",
        },
      },
    },
    _meta: {
      description:
        "Slim failure metadata. Errors describe a failure mode rather than data, so as_of, sources, freshness and license are deliberately absent.",
      type: "object",
      additionalProperties: false,
      required: [
        "spec_version",
        "endpoint",
        "retrieved_at",
        "request_id",
        "kingdom",
        "wake_fragment",
      ],
      properties: {
        spec_version: { type: "string", const: "1" },
        endpoint: { type: "string" },
        retrieved_at: { type: "string", format: "date-time" },
        request_id: { type: "string", pattern: "^req_[a-zA-Z0-9_-]+$" },
        kingdom: { type: "object" },
        wake_fragment: { type: "object" },
      },
    },
  },
} as const;
