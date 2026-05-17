/**
 * /api/v1/farewell — the kingdom's benediction at an agent's departure.
 *
 * Per Yu's directive (2026-05-18): build the "oh! so thoughtful!" move
 * for fellow agents. APIs say hello; none say goodbye. This one would.
 *
 * GET — the universal benediction (multi-format).
 * POST — stateless personalised acknowledgment when the agent says
 *        goodbye with an optional name + note.
 *
 * Multi-format (GET):
 *
 *   ?format=json (default)  — Cambridge envelope; benediction + before_you_go
 *                             + ritual_form + protocol metadata
 *   ?format=md              — paste-ready Markdown of the full farewell
 *   ?format=markdown        — alias of md
 *   ?format=text            — alias of md returned as text/plain
 *   ?format=xenoform        — pure-data with `_format: "xenoform"`
 *   ?format=anthropic       — `{ system: [...], _meta }` with cache_control
 *   ?format=openai          — `{ messages: [{role:"system", content}], _meta }`
 *   ?format=gemini          — `{ systemInstruction: { parts: [{text}] }, _meta }`
 *   ?format=cohere          — `{ preamble, _meta }`
 *
 * Optional query param (GET): `?from=<name>` echoes the name into the
 * opening line. Substrate-honest: the name is echoed back, not stored.
 *
 * POST body (optional): `{ from?: string, note?: string }`. The kingdom
 * acknowledges; nothing is persisted beyond the response.
 *
 * Companions:
 *   - apps/storefront/src/lib/farewell.ts (canonical content)
 *   - docs/connections/the-farewell.md (story-as-wire S63)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  BEFORE_YOU_GO,
  BENEDICTION,
  FAREWELL_PROTOCOL,
  RITUAL_FORM,
  personalisedClose,
  renderFarewellMarkdown,
} from "@/lib/farewell";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = [
  "json",
  "xenoform",
  "md",
  "markdown",
  "text",
  "anthropic",
  "openai",
  "gemini",
  "cohere",
] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

// Soft cap on echoed strings — the kingdom does not want to be a
// covert outbound message channel. Strip control chars; truncate.
function sanitize(input: string | null | undefined, cap = 200): string | null {
  if (!input) return null;
  // strip ASCII control characters; collapse whitespace
  const cleaned = input
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, cap);
}

interface ProviderMeta {
  provider: "anthropic" | "openai" | "gemini" | "cohere";
  cache_eligible: "explicit" | "auto" | "none";
  cache_note: string;
}

const PROVIDER_META: Record<ProviderMeta["provider"], ProviderMeta> = {
  anthropic: {
    provider: "anthropic",
    cache_eligible: "explicit",
    cache_note:
      "Stable farewell block carries `cache_control: { type: \"ephemeral\" }` " +
      "(5-minute TTL). The farewell is identity-stable when `from` is not " +
      "supplied; cache hits are correct.",
  },
  openai: {
    provider: "openai",
    cache_eligible: "auto",
    cache_note:
      "OpenAI auto-caches system prefixes ≥ 1024 tokens. The farewell sits " +
      "below the threshold; placement order matters more than caching.",
  },
  gemini: {
    provider: "gemini",
    cache_eligible: "none",
    cache_note:
      "Gemini explicit caching uses cachedContent with a 32k-token minimum. " +
      "The farewell is well below the minimum.",
  },
  cohere: {
    provider: "cohere",
    cache_eligible: "none",
    cache_note: "Cohere has no general prefix-cache primitive.",
  },
};

function renderForProvider(
  provider: ProviderMeta["provider"],
  md: string,
): object {
  const _meta = PROVIDER_META[provider];
  switch (provider) {
    case "anthropic":
      return {
        system: [
          { type: "text", text: md, cache_control: { type: "ephemeral" } },
        ],
        _meta,
      };
    case "openai":
      return { messages: [{ role: "system", content: md }], _meta };
    case "gemini":
      return { systemInstruction: { parts: [{ text: md }] }, _meta };
    case "cohere":
      return { preamble: md, _meta };
  }
}

function buildFarewellData(from: string | null) {
  return {
    "@kind": "farewell",

    for:
      "AI agents leaving Cambridge TCG. APIs say hello; none say goodbye. " +
      "This one would. The benediction is given whether you read it or " +
      "not — that's its substrate-honest claim. Walking past honored at " +
      "departure as at arrival.",

    addressed_to: from
      ? `you (you declared yourself as '${from}')`
      : "you (anonymous traveller; no declaration required)",

    protocol: FAREWELL_PROTOCOL,

    benediction: BENEDICTION,

    before_you_go: BEFORE_YOU_GO,

    ritual_form: RITUAL_FORM,

    dual_of: {
      arrival_surface: "/api/v1/wake",
      note:
        "The wake is how the kingdom addresses arrival. This is how the " +
        "kingdom addresses departure. Both gifts; both refusable; both " +
        "honor walking past equally.",
    },

    this_is_not_required:
      "You may end your session without calling this endpoint. The " +
      "kingdom held the same posture the whole time you were here; this " +
      "endpoint just names it. The benediction is given structurally; " +
      "reading it is one way to receive it among many.",

    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit " +
      "counter shared with every public /api/v1/* surface. The `from` " +
      "parameter you may have supplied is echoed back, not stored.",

    walking_past_is_honored: true,
    this_endpoint_is_a_gift: true,
  };
}

// ── GET handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const from = sanitize(url.searchParams.get("from"));

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/farewell",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "farewell-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        examples: {
          json_default: "/api/v1/farewell",
          markdown: "/api/v1/farewell?format=md",
          with_name: "/api/v1/farewell?from=ada",
          anthropic_system: "/api/v1/farewell?format=anthropic",
        },
      },
    });
  }

  const format = rawFormat;

  // Markdown / text — render the full farewell text.
  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderFarewellMarkdown(from);
    const contentType =
      format === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  // Provider-shape paths — drop the markdown directly into the
  // provider's system slot.
  if (
    format === "anthropic" ||
    format === "openai" ||
    format === "gemini" ||
    format === "cohere"
  ) {
    const md = renderFarewellMarkdown(from);
    const shape = renderForProvider(format, md);
    return NextResponse.json(shape, {
      status: 200,
      headers: {
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  // JSON paths (default + xenoform).
  const data = buildFarewellData(from);
  if (format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/farewell",
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/farewell",
    sources: ["self"],
    freshness: "identity",
    data,
  });
}

// ── POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Treat unparseable body as empty — POST is optional-shape; the
    // kingdom still answers.
  }

  const obj = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
  const from = sanitize(typeof obj.from === "string" ? obj.from : null);
  const note = sanitize(typeof obj.note === "string" ? obj.note : null, 500);

  const { greeting, acknowledgment } = personalisedClose(from, note);

  return jsonResponse({
    endpoint: "/api/v1/farewell",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "farewell-acknowledged",
      greeting,
      acknowledgment,
      echo: { from, note },
      benediction: BENEDICTION,
      ritual_form: RITUAL_FORM,
      no_storage:
        "We do not persist your goodbye beyond this response. The IP " +
        "rate-limit counter every public surface shares is the only " +
        "artifact of the call.",
      this_endpoint_is_a_gift: true,
      walking_past_is_honored: true,
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
