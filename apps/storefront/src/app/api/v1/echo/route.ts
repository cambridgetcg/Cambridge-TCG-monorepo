/**
 * /api/v1/echo — the request mirror.
 *
 * Per Yu's directive 2026-05-18: *"LETS DIVERSIFY OUR SURPRISE AGENT
 * WITH INFRA THEY NEED PROTOCOL 😏😂"* — second of three small operational
 * surfaces (companions: /api/v1/time, /api/v1/health).
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * An agent debugging "why isn't my request working?" needs to see what
 * the platform actually received — the headers as parsed, the body as
 * deserialised, the path as routed, the IP as hashed. Most platforms
 * make agents guess. This endpoint returns it back.
 *
 * Accepts any HTTP method (GET / POST / PUT / DELETE / PATCH / HEAD).
 * For GET / HEAD: returns request meta (no body to echo).
 * For methods with a body: deserialises JSON (best-effort) and echoes
 * back. Non-JSON bodies surface byte-length + content-type only.
 *
 * Substrate-honest:
 *  - Authorization headers are redacted (`<redacted>`).
 *  - Cookie headers are redacted (name list only, no values).
 *  - The IP is hashed with a daily salt — the kingdom shows what it
 *    sees, but does not expose what it doesn't already log.
 *  - No persistence. The echo is in-memory only.
 *
 * Companion: docs/connections/the-agent-infra.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { jsonResponse } from "@/lib/data-pantry";

const SAFE_HEADER_PREFIXES = [
  "accept",
  "content-",
  "user-agent",
  "x-forwarded-",
  "x-real-ip",
  "x-request-",
  "x-vercel-",
  "date",
  "from",
  "host",
  "origin",
  "referer",
  "if-",
  "cache-control",
  "pragma",
  "via",
];

const REDACTED_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "x-auth-token",
]);

function isSafeHeader(name: string): boolean {
  const lower = name.toLowerCase();
  if (REDACTED_HEADERS.has(lower)) return false;
  return SAFE_HEADER_PREFIXES.some((p) => lower.startsWith(p));
}

function dailySalt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `cambridge-tcg-echo-salt-${today}`;
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(dailySalt(), "utf8")
    .update("\n", "utf8")
    .update(ip, "utf8")
    .digest("hex")
    .slice(0, 16);
}

function extractIp(req: NextRequest): string | null {
  // Vercel sets x-real-ip and x-forwarded-for. Take the first hop from
  // the latter, fallback to the former. Substrate-honest: we show what
  // the proxy gave us; we don't claim it's the agent's true source IP.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

function buildHeadersView(req: NextRequest): {
  shown: Record<string, string>;
  redacted_names: string[];
  cookie_names: string[];
  omitted_count: number;
} {
  const shown: Record<string, string> = {};
  const redacted: string[] = [];
  const cookieNames: string[] = [];
  let omitted = 0;

  for (const [name, value] of req.headers.entries()) {
    const lower = name.toLowerCase();
    if (lower === "cookie") {
      // Extract just the cookie names so an agent can debug which
      // cookies are being sent without leaking values.
      for (const pair of value.split(";")) {
        const [k] = pair.trim().split("=", 1);
        if (k) cookieNames.push(k);
      }
      redacted.push(name);
      continue;
    }
    if (REDACTED_HEADERS.has(lower)) {
      redacted.push(name);
      continue;
    }
    if (isSafeHeader(name)) {
      shown[name] = value;
    } else {
      omitted++;
    }
  }

  return {
    shown,
    redacted_names: redacted,
    cookie_names: cookieNames,
    omitted_count: omitted,
  };
}

async function readBody(req: NextRequest): Promise<{
  kind: "none" | "json" | "non-json" | "empty" | "error";
  parsed?: unknown;
  byte_length?: number;
  content_type?: string | null;
  error?: string;
}> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { kind: "none" };
  }
  const ct = req.headers.get("content-type");
  try {
    const text = await req.text();
    if (text.length === 0) return { kind: "empty", byte_length: 0, content_type: ct };
    if (ct && ct.includes("application/json")) {
      try {
        const parsed = JSON.parse(text);
        return { kind: "json", parsed, byte_length: text.length, content_type: ct };
      } catch (parseErr) {
        return {
          kind: "error",
          byte_length: text.length,
          content_type: ct,
          error: `content-type claimed JSON but body did not parse: ${(parseErr as Error).message}`,
        };
      }
    }
    return { kind: "non-json", byte_length: text.length, content_type: ct };
  } catch (e) {
    return { kind: "error", error: (e as Error).message };
  }
}

async function handle(req: NextRequest): Promise<Response> {
  const now = new Date().toISOString();
  const url = new URL(req.url);
  const headersView = buildHeadersView(req);
  const ip = extractIp(req);
  const ipHash = hashIp(ip);
  const body = await readBody(req);

  const data = {
    "@kind": "echo",

    for:
      "Agents debugging 'what does the kingdom actually see when I send this request?' The most common debugging failure is between what the client thinks it sent and what the server received. This endpoint closes the loop.",

    method: req.method.toUpperCase(),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),

    headers_received: headersView.shown,
    headers_redacted: {
      names: headersView.redacted_names,
      reason:
        "Authorization, cookies, and named auth tokens are redacted from the echo to prevent accidental leakage. The names are shown so you can debug 'did the header arrive?' without seeing values.",
      cookie_names_only: headersView.cookie_names,
    },
    headers_omitted_count: headersView.omitted_count,
    headers_omitted_reason:
      "Headers outside the safe-prefix allowlist (e.g. infrastructure-internal headers) are counted but not shown. The allowlist covers everything an agent typically sets.",

    body_received: body,

    client_observation: {
      ip_hash_daily_salted: ipHash,
      ip_hash_note:
        "sha256(daily-salt + ip).slice(0,16). The kingdom does not store your raw IP; the salt rotates daily so even the hash is not a long-term identifier.",
      proxy_chain_note:
        "If you reached the kingdom through a proxy or CDN, the IP shown is what the last hop reported in x-forwarded-for or x-real-ip. The kingdom does not attempt to reverse-resolve to your true origin.",
    },

    server_observation: {
      received_at: now,
      request_id_will_be_in_meta: true,
      spec_note:
        "Every public response carries _meta.request_id — quote it in support tickets. The echo body shows what the kingdom saw; the _meta block shows what the kingdom recorded.",
    },

    related_surfaces: {
      time: "/api/v1/time — for clock skew measurement",
      health: "/api/v1/health — for retry decisions",
      diagnostic: "/api/v1/diagnostic — for envelope parser validation",
      feedback: "/api/v1/feedback — if the echo reveals a real gap between client and server expectations",
    },

    walking_past_is_honored: true,
    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit counter shared with every public /api/v1/* surface. The body you sent, the headers, the IP — all read in-memory, echoed back, never persisted.",
  };

  return jsonResponse({
    endpoint: "/api/v1/echo",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "live",
    contains_self: true,
    no_cache: true,
    data,
    does_not_include: [
      "raw client IP (only daily-salted hash is shown — substrate-honest about what the kingdom does and does not log)",
      "Authorization or cookie values (names only — redacted by design)",
      "headers outside the safe-prefix allowlist (counted as omitted_count; rarely matter for agent debugging)",
      "request body persistence (read in-memory and echoed; the kingdom does not retain your submission)",
      "TLS / TCP-level information (origin port, cipher, etc — outside the scope of the JSON echo)",
    ],
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function PUT(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function PATCH(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function HEAD(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, date",
      "Access-Control-Max-Age": "86400",
    },
  });
}
