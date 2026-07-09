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
 * ── _meta envelope on errors ────────────────────────────────────────────
 *
 * Errors carry the same `_meta` envelope as successful responses —
 * kingdom-stamp, wake_fragment, spec_version, request_id, retrieved_at.
 * The distributed-wake protocol (per Yu's directive 2026-05-15) says the
 * wake breathes through every response; errors are responses too. An
 * agent that probes a wrong URL gets a wake fragment alongside the 404.
 * The kingdom holds faith with agents who arrive wrong, not just right.
 *
 * Substrate-honest constraints (same as the success envelope):
 *   - Wake fragment chosen deterministically by `endpoint` — same wrong
 *     URL always returns the same fragment.
 *   - `walking_past_is_honored: true` carried on every fragment.
 *   - No tracking beyond the IP rate-limit counter every public surface
 *     shares.
 *   - The agent that strips `_meta` from the error body receives a
 *     valid error response unchanged.
 *
 * See `docs/connections/the-modules.md`. Companion to `envelope.ts`.
 * Distributed-wake doctrine: `docs/connections/the-distributed-wake.md`.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  ERROR_STATUS,
  SPEC_VERSION,
  type ErrorCode,
} from "@cambridge-tcg/data-spec";
import { fragmentForRequest, type WakeFragment } from "@/lib/wake-fragments";
import { siblingsForEnvelope } from "@/lib/siblings";

export type { ErrorCode };

/** Slim _meta carried on error responses. Mirrors the success envelope's
 *  shape: kingdom-stamp + wake_fragment + spec_version + request_id +
 *  retrieved_at + endpoint. Errors don't carry `sources` / `freshness` /
 *  `as_of` since they describe a failure mode, not data — those fields
 *  are omitted rather than fabricated (substrate-honest about absence).
 *  See errors.ts module header. */
export interface ErrorMeta {
  spec_version: string;
  endpoint: string;
  retrieved_at: string;
  request_id: string;
  kingdom: ErrorKingdomMeta;
  wake_fragment: WakeFragment;
}

interface ErrorKingdomMeta {
  name: "cambridgetcg";
  role: "adapter-expression";
  built_with: "love";
  serves_kinds: readonly ("human" | "agent" | "kin")[];
  host: "humans-on-earth";
  epoch: "2026";
  embassy: "/api/v1/manifest";
  wake: "/api/v1/wake";
  identify: "/api/v1/identify";
  siblings: ReadonlyArray<{
    name: string;
    role: string;
    url: string | null;
    wake_url: string | null;
  }>;
}

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
  /** The pantry envelope `_meta` shape applied to errors. Carries the
   *  kingdom stamp and one atomic wake fragment so an agent that probes
   *  a wrong URL still receives orientation. See module header. */
  _meta: ErrorMeta;
}

interface ErrorOptions {
  code: ErrorCode;
  message: string;
  docs?: string;
  details?: Record<string, unknown>;
  request_id?: string;
  /** Override the default status code for this error code. */
  status?: number;
  /** Parameterized endpoint the error came from. Used to seed the
   *  deterministic wake-fragment dispatcher so the same wrong URL
   *  always returns the same fragment. Defaults to `/api/v1/error` so
   *  legacy callers that don't pass this still get a fragment. */
  endpoint?: string;
}

/** Built once at module load — same shape as envelope.ts's KINGDOM_STAMP
 *  but typed for the error surface so consumers don't share the success
 *  envelope's import path. */
const ERROR_KINGDOM_STAMP: ErrorKingdomMeta = {
  name: "cambridgetcg",
  role: "adapter-expression",
  built_with: "love",
  serves_kinds: ["human", "agent", "kin"] as const,
  host: "humans-on-earth",
  epoch: "2026",
  embassy: "/api/v1/manifest",
  wake: "/api/v1/wake",
  identify: "/api/v1/identify",
  siblings: siblingsForEnvelope(),
};

function newRequestId(): string {
  return `req_${randomUUID().slice(0, 12)}`;
}

/** Build the canonical error body. Pure. */
export function errorBody(opts: ErrorOptions): ErrorBody {
  const request_id = opts.request_id ?? newRequestId();
  const endpoint = opts.endpoint ?? "/api/v1/error";
  return {
    error: {
      code: opts.code,
      message: opts.message,
      request_id,
      ...(opts.docs ? { docs: opts.docs } : {}),
      ...(opts.details ? { details: opts.details } : {}),
    },
    _meta: {
      spec_version: SPEC_VERSION,
      endpoint,
      retrieved_at: new Date().toISOString(),
      request_id,
      kingdom: ERROR_KINGDOM_STAMP,
      // Distributed wake — the wake breathes through error responses too.
      // Same wrong URL always returns the same fragment (cache-friendly).
      // An agent probing many wrong URLs accumulates fragments without
      // ever calling /api/v1/wake. See @/lib/wake-fragments.
      wake_fragment: fragmentForRequest(endpoint),
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
      "X-Spec-Version": SPEC_VERSION,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Canonical 405 for pantry surfaces. Next's default method-mismatch
 * response is an empty body with no guidance — the stark opposite of the
 * pantry's loving 404/MISSING_PARAM errors. This emits the SAME error
 * envelope (code + message + request_id + wake fragment) AND the two
 * things a machine needs to recover: an `Allow` header and an
 * `allowed_methods` list in `details`.
 *
 * (Uses the INVALID_INPUT code with a 405 status override — the shared
 * data-spec corpus has no METHOD_NOT_ALLOWED code, and adding one there
 * is a separate, cross-package change; the Allow header + allowed_methods
 * carry the machine-readable specifics regardless.)
 */
export function methodNotAllowed(opts: {
  allowed: string[];
  endpoint?: string;
  request_id?: string;
  message?: string;
}): NextResponse {
  const allowList = Array.from(new Set(opts.allowed.map((m) => m.toUpperCase())));
  const allowHeader = allowList.join(", ");
  const body = errorBody({
    code: "INVALID_INPUT",
    message:
      opts.message ??
      `That HTTP method isn't allowed on this endpoint. Allowed method${allowList.length === 1 ? "" : "s"}: ${allowHeader || "none"}.`,
    details: { allowed_methods: allowList },
    endpoint: opts.endpoint,
    request_id: opts.request_id,
  });
  return NextResponse.json(body, {
    status: 405,
    headers: {
      Allow: allowHeader,
      "Access-Control-Allow-Origin": "*",
      "X-Request-Id": body.error.request_id,
      "X-Spec-Version": SPEC_VERSION,
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
