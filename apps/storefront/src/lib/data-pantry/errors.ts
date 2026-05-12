/**
 * Canonical error response shape for the pantry.
 *
 * Easy-to-use principle: every error speaks the same way. Code is
 * stable + machine-readable; message is human + actionable; docs links
 * to the methodology page that explains the rule (when applicable);
 * request_id quotable for support.
 *
 * Substrate-honesty principle: the error message names what couldn't
 * complete, not whose fault it was. Blameless tone — *"Invalid SKU
 * 'foo'; expected canonical form like 'op-op01-001-ja'"*, not
 * *"You sent a bad SKU."*
 *
 * See `docs/connections/the-modules.md`. Companion to `envelope.ts`.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ERROR_STATUS, type ErrorCode } from "@cambridge-tcg/data-spec";

export type { ErrorCode };

export interface ErrorBody {
  error: {
    /** Stable, machine-readable error code. */
    code: ErrorCode;
    /** Human-readable, actionable, blameless. */
    message: string;
    /** Quotable in support tickets. */
    request_id: string;
    /** Optional methodology/doc page that explains the rule. */
    docs?: string;
    /** Optional field-level details (which input was bad). */
    details?: Record<string, unknown>;
  };
}

interface ErrorOptions {
  code: ErrorCode;
  message: string;
  docs?: string;
  details?: Record<string, unknown>;
  request_id?: string;
  /** Override the default status code for this error code. */
  status?: number;
}

/** Build the canonical error body. Pure. */
export function errorBody(opts: ErrorOptions): ErrorBody {
  return {
    error: {
      code: opts.code,
      message: opts.message,
      request_id: opts.request_id ?? `req_${randomUUID().slice(0, 12)}`,
      ...(opts.docs ? { docs: opts.docs } : {}),
      ...(opts.details ? { details: opts.details } : {}),
    },
  };
}

/** Build the canonical NextResponse for an error. */
export function errorResponse(opts: ErrorOptions): NextResponse {
  const body = errorBody(opts);
  const status = opts.status ?? ERROR_STATUS[opts.code];
  return NextResponse.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "X-Request-Id": body.error.request_id,
      "Cache-Control": "no-store",
    },
  });
}

/** Shortcut for the most common case: bad SKU input. */
export function invalidSkuError(badInput: string, request_id?: string): NextResponse {
  return errorResponse({
    code: "INVALID_SKU",
    message:
      `'${badInput}' is not a canonical Cambridge TCG SKU. ` +
      `Expected the form '<game>-<set>-<number>-<lang>[-<variant>]', ` +
      `e.g. 'op-op01-001-ja'. The reference parser is at ` +
      `packages/sku/ (parseSku / normalizeSku).`,
    docs: "/methodology/sku-standard",
    request_id,
  });
}
