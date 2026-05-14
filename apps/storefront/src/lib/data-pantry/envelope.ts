/**
 * The pantry envelope — every public response wears the same shape.
 *
 * Yu's directive 2026-05-12: *"Data should be open to everyone who
 * wanted them, with good hygiene and easy to use."*
 *
 * Hygiene by construction: every public emission passes through this
 * envelope; every response carries provenance + freshness + request_id
 * + license; partners learn the shape once, read it forever.
 *
 * Easy-to-use by construction: the same `_meta` block on every endpoint
 * means partners don't relearn the contract per surface. Predictable
 * shape across the entire `/api/v1/*` surface.
 *
 * See `docs/connections/the-modules.md` for the doctrine + module map.
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 *   return jsonResponse({
 *     data: { sku: "op-op01-001-ja", price_gbp: "5.40", ... },
 *     endpoint: "/api/v1/cards/[sku]",
 *     sources: ["wholesale-rds.cards"],
 *     freshness_seconds: 86400,
 *     as_of: priceTimestamp,
 *   });
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  SPEC_VERSION as SPEC_VERSION_SPEC,
  DEFAULT_LICENSE,
  FRESHNESS,
  type FreshnessKey,
} from "@cambridge-tcg/data-spec";

/** Re-export from the spec so consumers don't reach across packages. */
export const SPEC_VERSION = SPEC_VERSION_SPEC;
export const LICENSE = DEFAULT_LICENSE;
export { FRESHNESS, type FreshnessKey };

/**
 * Meta block. Every public response carries one. Partners can read it
 * to know:
 *   - which spec version produced the response
 *   - when it was rendered
 *   - what was the underlying timestamp on the data
 *   - which sources fed the response
 *   - how stale the platform expects it to be
 *   - the license (CC0 unless overridden)
 *   - a request id for support / debugging
 */
export interface ResponseMeta {
  /** Spec version of the response envelope. */
  spec_version: typeof SPEC_VERSION_SPEC;
  /** Path that produced this response, parametrized. */
  endpoint: string;
  /** When this response was rendered (ISO 8601, server clock). */
  retrieved_at: string;
  /** When the underlying data was last known to be true (ISO 8601).
   *  When the response is a current-state view, equals retrieved_at.
   *  When the response is a historical / point-in-time view, can be
   *  earlier than retrieved_at. */
  as_of: string;
  /** Named sources of truth that contributed to this response. */
  sources: readonly string[];
  /** Platform's intended freshness budget for this kind of data. */
  freshness_seconds: number;
  /** SPDX license code for the response payload. CC0-1.0 by default. */
  license: string;
  /** Server-generated id for this response. Quote in support tickets. */
  request_id: string;
  /** Optional deprecation notice when this endpoint will be retired. */
  deprecation: { sunset: string; replacement: string } | null;
  /** Cursor-style pagination next link, when applicable. */
  next_link: string | null;
  /** Self-reference: present when the response describes the endpoint
   *  that produced it (e.g. /data.json, /standards.json, /api/v1/identify). */
  self_reference: {
    this_endpoint: string;
    contains_self: true;
  } | null;
  /** Optional. Parallel array to `sources` declaring per-source
   *  redistribution rights. Values from SourceMeta.license tier
   *  (`cc0` / `cc-by` / `cc-by-nc` / `cc-by-sa` / `mit` /
   *  `partner-redistributable` / `internal-only` / `proprietary`).
   *  Absence is substrate-honest: the platform has not yet declared
   *  per-source rights for this response. Added kingdom-066 (the
   *  cardrush alignment); see docs/connections/the-cardrush-alignment.md. */
  source_license?: readonly string[];
  /** Optional. Parallel array to `sources` naming the proxy used to
   *  retrieve each upstream's bytes (`bright-data-web-unlocker`,
   *  `none`). When absent, every source was fetched directly from
   *  platform egress. Substrate-honesty extended one ring further: a
   *  row fetched through an unlocker carries that fact through to any
   *  partner who reads it. Added kingdom-088 (the-bright-data-unlock). */
  upstream_proxy?: readonly string[];
}

export interface ResponseEnvelope<T> {
  data: T;
  _meta: ResponseMeta;
}

interface EnvelopeOptions<T> {
  /** The actual response payload. */
  data: T;
  /** The endpoint path (parameterized). */
  endpoint: string;
  /** Named sources that contributed. */
  sources: readonly string[];
  /** Optional. Parallel array to `sources` declaring per-source
   *  redistribution license tiers. When supplied, length must match
   *  `sources`. When omitted, the envelope's `_meta.source_license`
   *  field is also omitted (substrate-honest about absence). */
  source_license?: readonly string[];
  /** Optional. Parallel array to `sources` naming the proxy used per
   *  source (`bright-data-web-unlocker`, `none`). When supplied, length
   *  must match `sources`. Omit when every source was fetched directly.
   *  Added kingdom-088 — see `docs/connections/the-bright-data-unlock.md`. */
  upstream_proxy?: readonly string[];
  /** Either a FreshnessKey from the table, or a custom number. */
  freshness?: FreshnessKey | number;
  /** When the data was last true. Defaults to now (current-state view). */
  as_of?: string | Date;
  /** Optional deprecation notice. */
  deprecation?: { sunset: string; replacement: string } | null;
  /** Cursor-style next link for paginated responses. */
  next_link?: string | null;
  /** SPDX license code. Defaults to CC0-1.0. */
  license?: string;
  /** Set true when the response describes the endpoint that produced it. */
  contains_self?: boolean;
  /** Caller-supplied request id; else server generates. Useful for
   *  request tracing. */
  request_id?: string;
}

function toIso(t: string | Date | undefined): string {
  if (!t) return new Date().toISOString();
  if (t instanceof Date) return t.toISOString();
  return t;
}

function resolveFreshness(f: FreshnessKey | number | undefined): number {
  if (typeof f === "number") return f;
  if (f && f in FRESHNESS) return FRESHNESS[f];
  return 0;
}

function newRequestId(): string {
  return `req_${randomUUID().slice(0, 12)}`;
}

/**
 * Build the canonical envelope around a response payload. Pure;
 * caller wraps in NextResponse.json when ready to emit.
 *
 * Throws on parallel-array length mismatch. `source_license` and
 * `upstream_proxy` (when supplied) must run one-to-one with `sources` —
 * each entry's index matches the source it describes. Mismatched
 * lengths would silently emit a wrong-shape `_meta`, so we fail at the
 * boundary instead. See docs/connections/the-modules.md hygiene rule 8.
 */
export function envelope<T>(opts: EnvelopeOptions<T>): ResponseEnvelope<T> {
  if (opts.source_license && opts.source_license.length !== opts.sources.length) {
    throw new TypeError(
      `envelope: source_license has ${opts.source_license.length} entries but sources has ${opts.sources.length} — they must run parallel`,
    );
  }
  if (opts.upstream_proxy && opts.upstream_proxy.length !== opts.sources.length) {
    throw new TypeError(
      `envelope: upstream_proxy has ${opts.upstream_proxy.length} entries but sources has ${opts.sources.length} — they must run parallel`,
    );
  }
  const now = new Date().toISOString();
  return {
    data: opts.data,
    _meta: {
      spec_version: SPEC_VERSION,
      endpoint: opts.endpoint,
      retrieved_at: now,
      as_of: toIso(opts.as_of) || now,
      sources: opts.sources,
      freshness_seconds: resolveFreshness(opts.freshness),
      license: opts.license ?? LICENSE,
      request_id: opts.request_id ?? newRequestId(),
      deprecation: opts.deprecation ?? null,
      next_link: opts.next_link ?? null,
      self_reference: opts.contains_self
        ? { this_endpoint: opts.endpoint, contains_self: true }
        : null,
      ...(opts.source_license ? { source_license: opts.source_license } : {}),
      ...(opts.upstream_proxy ? { upstream_proxy: opts.upstream_proxy } : {}),
    },
  };
}

/**
 * Convenience: wrap an envelope in a NextResponse with sensible
 * defaults (CORS open, cache-control matched to freshness, gzip-able).
 */
export function jsonResponse<T>(
  opts: EnvelopeOptions<T> & {
    /** Cache hint for clients/CDN. Defaults to the freshness budget. */
    cache_max_age?: number;
    /** Cache hint for shared caches (CDN). Defaults to freshness × 3. */
    cache_s_max_age?: number;
    /** Set true to disable client/CDN caching. */
    no_cache?: boolean;
  },
): NextResponse {
  const body = envelope(opts);
  const freshness = body._meta.freshness_seconds;
  const maxAge = opts.no_cache ? 0 : opts.cache_max_age ?? Math.min(freshness, 3600);
  const sMaxAge = opts.no_cache ? 0 : opts.cache_s_max_age ?? Math.min(freshness * 3, 86400);

  // RateLimit-* headers (IETF draft standard) — kingdom-082 hospitality.
  // Advisory: we don't currently enforce per-endpoint limits at the edge
  // for public endpoints. The headers declare the platform's polite-poll
  // cadence based on the freshness budget. A well-behaved client honours
  // them by spacing requests at `RateLimit-Reset` intervals. See
  // /api/v1/rate-limits for the full policy.
  //
  // For freshness-based endpoints the "quota" is conceptually "one fresh
  // response per window" — polling faster returns the same response.
  // RateLimit-Limit: 1; RateLimit-Reset: freshness_seconds.
  const rateLimitWindow = Math.max(freshness, 1);
  const rateLimitHeaders: Record<string, string> = opts.no_cache
    ? {}
    : {
        "RateLimit-Limit": "1",
        "RateLimit-Remaining": "1",
        "RateLimit-Reset": String(rateLimitWindow),
        "RateLimit-Policy": `1;w=${rateLimitWindow};comment="advisory; one fresh response per freshness window"`,
      };

  // Link header (RFC 8288) — agents that follow Link headers discover
  // related resources without parsing the body.
  const linkParts: string[] = [
    '<' + opts.endpoint + '>; rel="self"',
    '</api/v1/welcome>; rel="start"',
    '</api/v1/manifest>; rel="describedby"',
    '</api/openapi.json>; rel="alternate"; type="application/json"',
    '</api/v1/rate-limits>; rel="https://cambridgetcg.com/rels/rate-limits"',
    '</api/v1/feedback>; rel="https://cambridgetcg.com/rels/feedback"',
  ];
  if (opts.next_link) {
    linkParts.push('<' + opts.next_link + '>; rel="next"');
  }

  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Expose-Headers":
        "X-Request-Id, X-Spec-Version, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, RateLimit-Policy, Link",
      "X-Request-Id": body._meta.request_id,
      "X-Spec-Version": SPEC_VERSION,
      "Cache-Control": opts.no_cache
        ? "no-store"
        : `public, max-age=${maxAge}, s-maxage=${sMaxAge}`,
      Link: linkParts.join(", "),
      ...rateLimitHeaders,
    },
  });
}
