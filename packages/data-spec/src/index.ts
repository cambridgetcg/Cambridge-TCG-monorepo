/**
 * @module @cambridge-tcg/data-spec
 *
 * The Cambridge TCG public-response specification — schemas, error
 * codes, and freshness budgets — packaged so partners can consume the
 * contract without depending on the platform's runtime emission code.
 *
 * The pantry holds itself to this spec. `apps/storefront/src/lib/data-pantry/`
 * is the runtime that emits responses matching this spec; this package
 * is the *publishable contract* that names what the responses look like.
 *
 * ── What's in here ──────────────────────────────────────────────────
 *
 *   import {
 *     ENVELOPE_SCHEMA,   // JSON Schema for { data, _meta }
 *     META_SCHEMA,       // JSON Schema for the _meta block alone
 *     ERROR_BODY_SCHEMA, // JSON Schema for failures
 *     PROVENANCE_SCHEMA, // JSON Schema for per-record @-prefixed provenance
 *     FRESHNESS,         // Numeric freshness budgets per data kind
 *     ERROR_CODES,       // Stable error code enum
 *     SPEC_VERSION,      // "1" — bump on breaking changes
 *     DEFAULT_LICENSE,   // "NOASSERTION"
 *   } from "@cambridge-tcg/data-spec";
 *
 * ── Versioning ──────────────────────────────────────────────────────
 *
 * Stable. Breaking changes bump `SPEC_VERSION`. Non-breaking additions
 * (new error code, new optional field on _meta) do not.
 *
 * ── License ─────────────────────────────────────────────────────────
 *
 * The package code and schemas are CC0-1.0; response payload rights are
 * endpoint- and source-specific. See `docs/STANDARDS-LICENSE.md`.
 */

export { SPEC_VERSION, DEFAULT_LICENSE, FRESHNESS, type FreshnessKey } from "./freshness";
export { ERROR_CODES, ERROR_STATUS, type ErrorCode } from "./error-codes";
export {
  ENVELOPE_SCHEMA,
  META_SCHEMA,
  ERROR_BODY_SCHEMA,
  PROVENANCE_SCHEMA,
  ERROR_CODE_VALUES,
} from "./schemas/index";
