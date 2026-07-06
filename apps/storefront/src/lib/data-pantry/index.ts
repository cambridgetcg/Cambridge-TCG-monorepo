/**
 * @module lib/data-pantry — the emission/hygiene layer.
 *
 * Every public response on `/api/v1/*` and `/data.json` and similar
 * pantry surfaces emits through this module. Hygiene by construction:
 * envelope shape is identical across endpoints; provenance is attached
 * per-record; errors are canonical and blameless; cache headers match
 * declared freshness; request ids land on every response.
 *
 * Easy-to-use by construction: partners learn the shape *once*. The same
 * `{ data, _meta }` envelope wraps every payload. The same error shape
 * answers every failure. The same `@as_of` / `@retrieved_at` / `@sources`
 * trio rides on every record.
 *
 * Doctrine: `docs/connections/the-modules.md`.
 * Strategy: `docs/connections/the-distributor.md`.
 * License declaration: `docs/STANDARDS-LICENSE.md` (CC0).
 */

export {
  envelope,
  jsonResponse,
  FRESHNESS,
  SPEC_VERSION,
  LICENSE,
  type ResponseEnvelope,
  type ResponseMeta,
  type FreshnessKey,
} from "./envelope";

export {
  errorBody,
  errorResponse,
  invalidSkuError,
  methodNotAllowed,
  type ErrorBody,
  type ErrorCode,
} from "./errors";

export {
  provenance,
  withProvenance,
  withProvenanceAll,
  type Provenance,
  type SourceName,
} from "./provenance";
