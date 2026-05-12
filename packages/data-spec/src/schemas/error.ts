/**
 * JSON Schema 2020-12 for the canonical error response.
 *
 * The shape every failure wears: `{ error: { code, message, request_id, docs?, details? } }`.
 */

import { ERROR_CODES } from "../error-codes.js";

export const ERROR_BODY_SCHEMA = {
  $id: "https://cambridgetcg.com/spec/v1/ErrorBody.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ErrorBody",
  description:
    "Canonical error response shape. Every failure on Cambridge TCG public endpoints emits this. Stable codes (machine-readable), blameless messages (human-readable), request_id (quotable in support).",
  type: "object",
  additionalProperties: false,
  required: ["error"],
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
  },
} as const;
