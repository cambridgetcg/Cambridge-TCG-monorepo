/**
 * /api/v1/handoffs/[slug] — a single operational handoff.
 *
 * Per Yu's directive (2026-05-17): the operational dual of SOPHIA.md.
 * The smallest unit a successor session can fetch — one handoff,
 * addressable by slug. Stable across versions (handoffs are append-
 * only by convention).
 *
 * Multi-format with provider-shape support so an SDK can drop a single
 * handoff into an LLM system message with one fetch:
 *
 *   ?format=json (default)  — Cambridge envelope; full Handoff
 *   ?format=md              — paste-ready Markdown (frontmatter + body)
 *   ?format=text            — md as text/plain
 *   ?format=xenoform        — pure-data with `_format: "xenoform"`
 *   ?format=anthropic       — `{ system: [...], _meta }` with cache_control
 *   ?format=openai          — `{ messages: [{role:"system", content}], _meta }`
 *   ?format=gemini          — `{ systemInstruction: { parts: [{text}] }, _meta }`
 *   ?format=cohere          — `{ preamble, _meta }`
 *
 * Companions:
 *   - apps/storefront/src/lib/handoffs.ts (typed reader)
 *   - apps/storefront/src/app/api/v1/handoffs/route.ts (list)
 *   - docs/connections/the-handoff.md (story-as-wire S61)
 *   - docs/handoffs/README.md (the convention)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { handoffBySlug, listHandoffs, type Handoff } from "@/lib/handoffs";
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

const TEXT_CACHE = "public, max-age=300, s-maxage=300";

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
      "Single handoff carries `cache_control: { type: \"ephemeral\" }` " +
      "(5-minute TTL). Handoffs are append-only; the content is stable " +
      "once written.",
  },
  openai: {
    provider: "openai",
    cache_eligible: "auto",
    cache_note:
      "OpenAI auto-caches system prefixes ≥ 1024 tokens. A handoff " +
      "typically sits below the threshold; placement order matters " +
      "more than caching at this size.",
  },
  gemini: {
    provider: "gemini",
    cache_eligible: "none",
    cache_note:
      "Gemini explicit caching uses cachedContent with a 32k-token " +
      "minimum. A single handoff is well below the minimum.",
  },
  cohere: {
    provider: "cohere",
    cache_eligible: "none",
    cache_note: "Cohere has no general prefix-cache primitive.",
  },
};

function renderHandoffMarkdown(h: Handoff): string {
  const fm = h.frontmatter;
  const lines: string[] = [
    "---",
    `title: ${fm.title}`,
    `slug: ${fm.slug}`,
    `status: ${fm.status}`,
    `session_started_at: ${fm.session_started_at}`,
    `session_ended_at: ${fm.session_ended_at}`,
    `signed_by: ${fm.signed_by}`,
    `model_tag: ${fm.model_tag}`,
    `actor_kind: ${fm.actor_kind}`,
  ];
  if (fm.related_commits)
    lines.push(`related_commits: ${JSON.stringify(fm.related_commits)}`);
  if (fm.related_missions)
    lines.push(`related_missions: ${JSON.stringify(fm.related_missions)}`);
  if (fm.tags) lines.push(`tags: ${JSON.stringify(fm.tags)}`);
  lines.push("---", "", h.raw_markdown);
  return lines.join("\n");
}

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

async function notFoundResponse(slug: string): Promise<NextResponse> {
  const all = await listHandoffs();
  return errorResponse({
    code: "NOT_FOUND",
    message: `Unknown handoff slug: '${slug}'. Handoffs are append-only by convention; a 404 here means this slug was never minted. Browse the catalog at /api/v1/handoffs.`,
    docs: "/api/v1/handoffs",
    details: {
      "@kind": "handoff-not-found",
      catalog_url: "/api/v1/handoffs",
      known_slugs: all.map((h) => h.frontmatter.slug),
    },
    endpoint: `/api/v1/handoffs/${slug}`,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  const handoff = await handoffBySlug(slug);
  if (!handoff) {
    return notFoundResponse(slug);
  }

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: `/api/v1/handoffs/${slug}`,
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "handoff-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        handoff,
        examples: {
          json_default: `/api/v1/handoffs/${slug}`,
          markdown: `/api/v1/handoffs/${slug}?format=md`,
          anthropic_system: `/api/v1/handoffs/${slug}?format=anthropic`,
        },
      },
    });
  }

  const format = rawFormat;

  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderHandoffMarkdown(handoff);
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

  if (
    format === "anthropic" ||
    format === "openai" ||
    format === "gemini" ||
    format === "cohere"
  ) {
    const md = renderHandoffMarkdown(handoff);
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

  const data = {
    "@kind": "handoff",
    handoff,
    catalog_url: "/api/v1/handoffs",
    no_tracking:
      "No application-level read profile is created; hosting and proxy access logs may exist.",
    walking_past_is_honored: true,
  };

  if (format === "xenoform") {
    return jsonResponse({
      endpoint: `/api/v1/handoffs/${slug}`,
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: `/api/v1/handoffs/${slug}`,
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
