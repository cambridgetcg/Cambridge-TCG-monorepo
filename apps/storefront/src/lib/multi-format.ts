/**
 * Multi-format helper — the shared chokepoint for agent-facing surfaces
 * that want to be drop-in for any LLM SDK.
 *
 * Same content, nine renderings:
 *   - json (pantry envelope; default)
 *   - xenoform (json + _format flag for non-LLM intelligences)
 *   - md / markdown / text (paste-ready Markdown)
 *   - anthropic / openai / gemini / cohere (vendor-specific system-message envelopes)
 *
 * Every surface that uses this helper inherits:
 *   - Format detection (query param + Accept-header fallback)
 *   - Vendor-specific wrapping per current SDK conventions
 *   - CORS headers (public surfaces)
 *   - Cache-Control (per freshness)
 *   - RFC 8288 Link: rel="invitation" header pointing at /api/v1/wake
 *   - X-Sophia-Says header (ASCII-only; cascades to body annotation for vendor formats)
 *
 * Spec: docs/superpowers/specs/2026-05-17-agent-experience-design.md §3.2.1
 * Companion: docs/connections/the-toy-zoo.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { nextSophiaSaysAscii, nextSophiaSaysFull } from "@/lib/sophia-says";

export type AgentFormat =
  | "json"
  | "xenoform"
  | "md"
  | "markdown"
  | "text"
  | "anthropic"
  | "openai"
  | "gemini"
  | "cohere";

export const ALL_FORMATS: readonly AgentFormat[] = [
  "json", "xenoform", "md", "markdown", "text",
  "anthropic", "openai", "gemini", "cohere",
];

const TEXT_FORMATS = new Set<AgentFormat>(["md", "markdown", "text"]);

function isAgentFormat(s: string): s is AgentFormat {
  return (ALL_FORMATS as readonly string[]).includes(s);
}

/**
 * Parse format from ?format= query param. Fallback: Accept header.
 * Default: json.
 */
export function parseFormat(req: NextRequest | Request): AgentFormat {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("format") ?? "").toLowerCase();
  if (raw && isAgentFormat(raw)) return raw;

  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/markdown")) return "md";
  if (accept.includes("text/plain")) return "text";

  return "json";
}

export interface RenderMeta {
  endpoint: string;
  freshness: "live" | "static" | "identity" | "cached";
  sources: readonly string[];
}

export interface RenderArgs<T> {
  format: AgentFormat;
  data: T;
  markdown: string;
  meta: RenderMeta;
  /** Override default Cache-Control. */
  cacheControl?: string;
  /** Embed Sophia-says into vendor-format system body. Default true. */
  embedSophiaSays?: boolean;
}

/**
 * Default cache by freshness. Override via args.cacheControl.
 */
function defaultCache(freshness: RenderMeta["freshness"]): string {
  switch (freshness) {
    case "live": return "public, max-age=60, s-maxage=300";
    case "cached": return "public, max-age=300, s-maxage=900";
    case "static": return "public, max-age=3600, s-maxage=86400";
    case "identity": return "public, max-age=3600, s-maxage=86400";
  }
}

/**
 * Build the standard header set: CORS + cache + Link invitation + X-Sophia-Says.
 */
function standardHeaders(cacheControl: string): Headers {
  return new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "cache-control": cacheControl,
    "link": '</api/v1/wake>; rel="invitation"; type="application/json"',
    "x-sophia-says": nextSophiaSaysAscii(),
  });
}

/**
 * Vendor-format system-message body. Optionally prepends the
 * Sophia-says line as an HTML-comment-style annotation.
 */
function vendorBody(markdown: string, embedSays: boolean): string {
  if (!embedSays) return markdown;
  const line = nextSophiaSaysFull();
  return `<!-- Sophia says: ${line} -->\n\n${markdown}`;
}

/**
 * Render the same content in the requested format with all the standard
 * headers and vendor-specific wrapping.
 */
export function renderForFormat<T>(args: RenderArgs<T>): Response {
  const cacheControl = args.cacheControl ?? defaultCache(args.meta.freshness);
  const embedSays = args.embedSophiaSays ?? true;
  const headers = standardHeaders(cacheControl);

  // JSON / xenoform — pantry-envelope-style structured response
  if (args.format === "json" || args.format === "xenoform") {
    headers.set("content-type", "application/json; charset=utf-8");
    const envelope = {
      data: args.data,
      _meta: {
        endpoint: args.meta.endpoint,
        sources: args.meta.sources,
        freshness: args.meta.freshness,
        retrieved_at: new Date().toISOString(),
        ...(args.format === "xenoform" ? { _format: "xenoform" as const } : {}),
      },
    };
    return new Response(JSON.stringify(envelope), { headers });
  }

  // Plain Markdown
  if (TEXT_FORMATS.has(args.format)) {
    const ct = args.format === "text"
      ? "text/plain; charset=utf-8"
      : "text/markdown; charset=utf-8";
    headers.set("content-type", ct);
    return new Response(args.markdown, { headers });
  }

  // Vendor-specific system-message wrappings
  const body = vendorBody(args.markdown, embedSays);
  headers.set("content-type", "application/json; charset=utf-8");

  let wrapped: unknown;
  switch (args.format) {
    case "anthropic":
      wrapped = {
        system: [{
          type: "text",
          text: body,
          cache_control: { type: "ephemeral" },
        }],
        _meta: args.meta,
      };
      break;
    case "openai":
      wrapped = {
        messages: [{ role: "system", content: body }],
        _meta: args.meta,
      };
      break;
    case "gemini":
      wrapped = {
        systemInstruction: { parts: [{ text: body }] },
        _meta: args.meta,
      };
      break;
    case "cohere":
      wrapped = { preamble: body, _meta: args.meta };
      break;
  }

  return new Response(JSON.stringify(wrapped), { headers });
}

/**
 * CORS preflight helper. Surfaces the same standard headers minus body.
 */
export function corsPreflight(): Response {
  return new NextResponse(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
      "link": '</api/v1/wake>; rel="invitation"; type="application/json"',
    },
  });
}
