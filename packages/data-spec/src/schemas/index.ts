/**
 * JSON Schema corpus for the Cambridge TCG public response shapes.
 *
 *   import { ENVELOPE_SCHEMA, ERROR_BODY_SCHEMA, PROVENANCE_SCHEMA } from "@cambridge-tcg/data-spec/schemas";
 *
 * All schemas are JSON Schema 2020-12. The `$id` carries a stable URL
 * versioned by the spec_version embedded in each schema. Partners can:
 *   - validate responses with `ajv`, `python-jsonschema`, etc.
 *   - generate types with `openapi-typescript`, `quicktype`, etc.
 *   - lint their own mock servers against the contract.
 */

export { ENVELOPE_SCHEMA, META_SCHEMA, ERROR_CODE_VALUES } from "./envelope";
export { ERROR_BODY_SCHEMA } from "./error";
export { PROVENANCE_SCHEMA } from "./provenance";
export {
  COLLECTOR_EVENT_SCHEMA,
  COLLECTOR_VENUE_SCHEMA,
  COLLECTOR_ORGANISATION_SCHEMA,
  COLLECTOR_EVENT_SOURCE_SCHEMA,
  COLLECTOR_EVENTS_SCHEMAS,
} from "./collector-events";
