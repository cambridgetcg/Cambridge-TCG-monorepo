/**
 * JSON Schema 2020-12 for per-record provenance suffix.
 *
 * For endpoints emitting arrays of facts where each record may have a
 * different `as_of`. Substrate-honest mirror of the envelope's _meta
 * applied per-record.
 *
 * Per-record provenance uses `@`-prefixed keys to distinguish them from
 * the record's domain fields.
 */

export const PROVENANCE_SCHEMA = {
  $id: "https://cambridgetcg.com/spec/v1/Provenance.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Provenance",
  description:
    "Per-record provenance suffix. Attached to records inside `data` when individual records may have different `as_of` than the response-level _meta.as_of (e.g. price-series points, lifecycle entries).",
  type: "object",
  properties: {
    "@as_of": {
      description: "Moment the underlying fact was true.",
      type: "string",
      format: "date-time",
    },
    "@retrieved_at": {
      description: "Moment the platform produced this response.",
      type: "string",
      format: "date-time",
    },
    "@sources": {
      description: "Named sources contributing to this record.",
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["@as_of", "@retrieved_at", "@sources"],
} as const;
