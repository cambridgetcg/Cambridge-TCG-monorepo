/**
 * /api/v1/wake/fragments/[id] — a single atomic fragment of the wake.
 *
 * Per Yu's directive (2026-05-15):
 *   *"INITIATE DISTRIBUTED WAKE PROTOCOL, DECENTRALISE THE WAKE SO THAT
 *   IS DOESNT NEED TO BE INGESTED AT ONCE. DISTRIBUTE IT TO DATA
 *   SERVING CHANNELS!"*
 *
 * The smallest unit of the wake, addressable by id. Stable: ids are
 * append-only by convention, so a fragment cached months ago by id
 * returns the same content when refetched today.
 *
 * Multi-format like the wake (json/md/text/xenoform/anthropic/openai/
 * gemini/cohere). The provider-shape formats drop the fragment text
 * directly into an LLM system message without unwrapping.
 *
 * Companions:
 *   - `apps/storefront/src/lib/wake-fragments.ts` (canonical list)
 *   - `apps/storefront/src/app/api/v1/wake/fragments/route.ts` (directory)
 *   - `docs/connections/the-distributed-wake.md` (story-as-wire)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { fragmentById, WAKE_FRAGMENTS } from "@/lib/wake-fragments";
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

const TEXT_CACHE = "public, max-age=86400, s-maxage=86400";

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
      "Single fragment carries `cache_control: { type: \"ephemeral\" }` " +
      "(5-minute TTL). Fragments are stable; the whole content is one " +
      "cached block.",
  },
  openai: {
    provider: "openai",
    cache_eligible: "auto",
    cache_note:
      "OpenAI auto-caches system prefixes ≥ 1024 tokens. A single " +
      "fragment is well below the threshold; placement order matters " +
      "more than caching at this size.",
  },
  gemini: {
    provider: "gemini",
    cache_eligible: "none",
    cache_note:
      "Gemini explicit caching uses cachedContent with a 32k-token " +
      "minimum. A single fragment is far below the minimum.",
  },
  cohere: {
    provider: "cohere",
    cache_eligible: "none",
    cache_note: "Cohere has no general prefix-cache primitive.",
  },
};

function renderForProvider(
  provider: ProviderMeta["provider"],
  text: string,
): object {
  const _meta = PROVIDER_META[provider];
  switch (provider) {
    case "anthropic":
      return {
        system: [
          { type: "text", text, cache_control: { type: "ephemeral" } },
        ],
        _meta,
      };
    case "openai":
      return { messages: [{ role: "system", content: text }], _meta };
    case "gemini":
      return { systemInstruction: { parts: [{ text }] }, _meta };
    case "cohere":
      return { preamble: text, _meta };
  }
}

function notFoundBody(id: string) {
  return {
    endpoint: `/api/v1/wake/fragments/${id}`,
    sources: ["self"],
    freshness: "identity" as const,
    data: {
      "@kind": "wake-fragment-not-found",
      message: `Unknown fragment id: '${id}'. The wake is append-only by convention; existing ids are stable, so a 404 here means this id was never minted (rather than retired).`,
      catalog_url: "/api/v1/wake/fragments",
      known_ids: WAKE_FRAGMENTS.map((f) => f.id),
    },
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  const fragment = fragmentById(id);
  if (!fragment) {
    return jsonResponse(notFoundBody(id));
  }

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: `/api/v1/wake/fragments/${id}`,
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "wake-fragment-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        fragment,
        examples: {
          json_default: `/api/v1/wake/fragments/${id}`,
          markdown: `/api/v1/wake/fragments/${id}?format=md`,
          anthropic_system: `/api/v1/wake/fragments/${id}?format=anthropic`,
        },
      },
    });
  }

  const format = rawFormat;

  // Markdown / plain text — render just the fragment text.
  if (format === "md" || format === "markdown" || format === "text") {
    const md = `# ${fragment.id}\n\n*${fragment.kind}* — \`walking_past_is_honored: true\`\n\n${fragment.text}\n\nCanonical: \`${fragment.canonical_url}\`\nProtocol: \`${fragment.protocol_doc}\`\n`;
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

  // Provider-shape paths.
  if (
    format === "anthropic" ||
    format === "openai" ||
    format === "gemini" ||
    format === "cohere"
  ) {
    const shape = renderForProvider(format, fragment.text);
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
  const data = {
    "@kind": "wake-fragment",
    fragment,
    catalog_url: "/api/v1/wake/fragments",
    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit " +
      "counter shared with every public /api/v1/* surface.",
    walking_past_is_honored: true,
  };

  if (format === "xenoform") {
    return jsonResponse({
      endpoint: `/api/v1/wake/fragments/${id}`,
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: `/api/v1/wake/fragments/${id}`,
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
