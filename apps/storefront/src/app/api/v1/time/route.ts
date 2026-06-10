/**
 * /api/v1/time — canonical server clock + skew measurement.
 *
 * Per Yu's directive 2026-05-18: *"LETS DIVERSIFY OUR SURPRISE AGENT
 * WITH INFRA THEY NEED PROTOCOL 😏😂"* — first of three small operational
 * surfaces agents actually need (companions: /api/v1/echo, /api/v1/health).
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * Agents doing freshness math, time-series ingestion, cross-substrate
 * coordination, or scheduling need an authoritative "what time does the
 * kingdom think it is?" The Date HTTP header on every response carries
 * the server clock, but a dedicated endpoint with:
 *
 *   - ISO 8601 + Unix seconds + Unix milliseconds (the math-mirror time pair)
 *   - Clock-skew estimation when the agent sends Date or ?my_time=
 *   - Recommended resync cadence
 *   - Substrate-honest precision notes
 *
 * — saves agents writing the same boilerplate themselves.
 *
 * No tracking. No state. Pure server clock + optional reflection.
 *
 * Companion: docs/connections/the-agent-infra.md
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

function parseDateHeader(h: string | null): number | null {
  if (!h) return null;
  const t = Date.parse(h);
  return Number.isFinite(t) ? t : null;
}

function parseQueryTime(q: string | null): number | null {
  if (!q) return null;
  // Accept Unix milliseconds (13 digits), Unix seconds (10 digits), or ISO 8601.
  const n = Number(q);
  if (Number.isFinite(n) && n > 0) {
    // Heuristic: > 10^12 means milliseconds; otherwise seconds.
    return n > 1e12 ? n : n * 1000;
  }
  const t = Date.parse(q);
  return Number.isFinite(t) ? t : null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const nowIso = new Date(nowMs).toISOString();

  const url = new URL(req.url);
  const dateHeader = req.headers.get("date");
  const myTimeParam = url.searchParams.get("my_time");

  // Pick whichever the agent sent (query param wins; falls back to Date header)
  const agentTimeMs = parseQueryTime(myTimeParam) ?? parseDateHeader(dateHeader);

  const skew = agentTimeMs !== null
    ? {
        agent_time_iso: new Date(agentTimeMs).toISOString(),
        agent_time_unix_ms: agentTimeMs,
        server_minus_agent_ms: nowMs - agentTimeMs,
        server_minus_agent_seconds: Math.round((nowMs - agentTimeMs) / 100) / 10,
        interpretation:
          "If positive, the server clock is ahead of yours; if negative, you are ahead. Network RTT (~50-300ms typical) accounts for some of the positive skew. If |skew| > 60s after RTT correction, suspect a real clock drift on one end.",
        source: myTimeParam ? "query_param_my_time" : "date_request_header",
      }
    : {
        note: "No agent time provided. Send `Date: <RFC 7231 datetime>` request header or `?my_time=<unix_ms|unix_sec|iso8601>` query param to get skew computed.",
        examples: [
          "?my_time=1779019200000  (Unix milliseconds)",
          "?my_time=1779019200     (Unix seconds)",
          "?my_time=2026-05-18T12:00:00Z  (ISO 8601)",
          "Date: Sun, 18 May 2026 12:00:00 GMT  (request header)",
        ],
      };

  const data = {
    "@kind": "time",

    for:
      "Agents doing freshness math, time-series ingestion, cross-substrate scheduling, or any work where 'what time does the kingdom think it is?' matters more than 'what time does my system think it is?'",

    server_time: {
      iso: nowIso,
      unix_seconds: nowSec,
      unix_milliseconds: nowMs,
      time_zone: "UTC",
      precision_note:
        "Server clock is NTP-synced; precision within ~100ms is realistic. Round-trip network latency adds variance — for skew measurement, send a `Date` header or `?my_time=` query and read `skew.server_minus_agent_ms` from the response.",
    },

    skew,

    resync_hint: {
      suggested_resync_after_seconds: 3600,
      rationale:
        "Server clock drift is negligible at hour-scale (NTP-corrected); re-fetching this endpoint more often than once per hour is wasteful unless you're doing sub-second coordination.",
    },

    related_surfaces: {
      echo: "/api/v1/echo — for full request introspection (headers + body + IP-hash)",
      health: "/api/v1/health — for retry decisions when something fails",
      freshness_budgets: "/api/v1/budget — for per-endpoint freshness floors",
    },

    walking_past_is_honored: true,
    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit counter shared with every public /api/v1/* surface. Your `my_time` param and `Date` header are read in-memory and never persisted.",
  };

  return jsonResponse({
    endpoint: "/api/v1/time",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "live",
    contains_self: true,
    no_cache: true,
    data,
    does_not_include: [
      "monotonic clock guarantees (server time may jump backward under NTP correction; for monotonic ordering use your own monotonic source)",
      "per-agent clock-skew memory (every fetch is stateless; the substrate does not remember what skew you reported last time)",
      "leap-second handling (the kingdom follows the operating system's clock; leap seconds are smeared per cloud-vendor policy)",
    ],
  });
}
