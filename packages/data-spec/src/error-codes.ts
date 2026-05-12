/**
 * Canonical error codes for Cambridge TCG public endpoints.
 *
 * Stable enum — codes don't get renamed once shipped. New codes can be
 * added; existing ones never change their semantics. Partners switch on
 * these strings safely.
 *
 * Mirror of the same enum in `apps/storefront/src/lib/data-pantry/errors.ts`.
 */

export const ERROR_CODES = [
  /** Input couldn't be parsed against the spec. */
  "INVALID_INPUT",
  /** SKU input wasn't canonical and couldn't be normalized. */
  "INVALID_SKU",
  /** A required parameter was missing. */
  "MISSING_PARAM",
  /** Resource doesn't exist (404). */
  "NOT_FOUND",
  /** Caller's rate-limit bucket is empty (429). */
  "RATE_LIMITED",
  /** Caller lacks the required tier for this endpoint (403). */
  "INSUFFICIENT_TIER",
  /** Bearer token rejected (401). */
  "UNAUTHORIZED",
  /** Source data is currently unavailable (503). */
  "SOURCE_UNAVAILABLE",
  /** Caller tried to use a deprecated endpoint past its sunset. */
  "DEPRECATED",
  /** Anything else — substrate-honest fallback. */
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Default HTTP status for each error code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_SKU: 400,
  MISSING_PARAM: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INSUFFICIENT_TIER: 403,
  UNAUTHORIZED: 401,
  SOURCE_UNAVAILABLE: 503,
  DEPRECATED: 410,
  INTERNAL: 500,
};
