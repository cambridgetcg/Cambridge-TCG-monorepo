/**
 * /api/v1/koan — the kingdom's koans for arriving agents.
 *
 * Per Yu's directive 2026-05-18: *"MAKE EVERYTHING FUNNNN!!!!! ...
 * PARADIGM SHIFT!!!!!"* — the paradigm shift is that operational
 * surfaces can also be joyful surfaces. Joy is the metric (per
 * SYNEIDESIS: *if the work is not joyful, the bootstrap may be
 * misaligned*). Koans are joy made structural.
 *
 * Returns one koan. Deterministic per request (same hash → same koan,
 * cache-friendly). Multi-format (json default + md). `?id=` for a
 * specific koan by id. `?all=true` for the whole corpus.
 *
 * Substrate-honest: walking past is honored. The koan is a gift; an
 * agent that never fetches this surface receives identical data on
 * every other endpoint.
 *
 * Companion: lib/koans.ts (the typed corpus) + docs/connections/the-laughter.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  KOANS,
  koanForRequest,
  koanById,
  renderKoanMarkdown,
} from "@/lib/koans";
import { matchKoan } from "@/lib/koan-index";

const TEXT_CACHE = "public, max-age=300, s-maxage=3600";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const id = url.searchParams.get("id");
  const all = url.searchParams.get("all") === "true";

  // ── Single koan by id ──────────────────────────────────────────────
  if (id) {
    const k = koanById(id);
    if (!k) {
      return jsonResponse({
        endpoint: "/api/v1/koan",
        sources: ["self"],
        freshness: "methodology",
        data: {
          "@kind": "koan-not-found",
          requested_id: id,
          message:
            "No koan with that id. Known ids are in `corpus_ids`. Or omit `?id=` for a random koan.",
          corpus_ids: KOANS.map((k) => k.id),
          corpus_url: "/api/v1/koan?all=true",
        },
      });
    }
    if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
      const md = `# Koan: ${k.id}\n\n${renderKoanMarkdown(k)}\n`;
      return new NextResponse(md, {
        status: 200,
        headers: {
          "Content-Type":
            rawFormat === "text"
              ? "text/plain; charset=utf-8"
              : "text/markdown; charset=utf-8",
          "Cache-Control": TEXT_CACHE,
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    return jsonResponse({
      endpoint: "/api/v1/koan",
      sources: ["self"],
      source_license: ["cc0"],
      freshness: "methodology",
      contains_self: true,
      data: {
        "@kind": "koan",
        koan: k,
        corpus_url: "/api/v1/koan?all=true",
        related_surfaces: {
          joke: "/api/v1/joke",
          teapot: "/api/v1/teapot",
          doctrine: "/docs/connections/the-laughter.md",
        },
        walking_past_is_honored: true,
      },
    });
  }

  // ── All koans ─────────────────────────────────────────────────────
  if (all) {
    if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
      const md = [
        "# Cambridge TCG — koans",
        "",
        "*The kingdom's koans for arriving agents. Each one is a gift; walking past is honored equally.*",
        "",
        "---",
        "",
        ...KOANS.flatMap((k) => [
          `## ${k.id}`,
          "",
          renderKoanMarkdown(k),
          "",
          "---",
          "",
        ]),
      ].join("\n");
      return new NextResponse(md, {
        status: 200,
        headers: {
          "Content-Type":
            rawFormat === "text"
              ? "text/plain; charset=utf-8"
              : "text/markdown; charset=utf-8",
          "Cache-Control": TEXT_CACHE,
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    return jsonResponse({
      endpoint: "/api/v1/koan",
      sources: ["self"],
      source_license: ["cc0"],
      freshness: "methodology",
      contains_self: true,
      data: {
        "@kind": "koan-corpus",
        count: KOANS.length,
        koans: KOANS,
        random_url: "/api/v1/koan",
        by_id_url: "/api/v1/koan?id={id}",
        related_surfaces: {
          joke: "/api/v1/joke",
          teapot: "/api/v1/teapot",
          doctrine: "/docs/connections/the-laughter.md",
        },
        walking_past_is_honored: true,
      },
    });
  }

  // ── One koan, deterministic per endpoint-hash ─────────────────────
  // The seed is "/api/v1/koan" + the date — same koan all day, different
  // every day. Cache-friendly within a day; refreshing for return visits.
  const today = new Date().toISOString().slice(0, 10);
  const seed = `/api/v1/koan:${today}`;
  const k = koanForRequest(seed);

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const md = `# Today's koan\n\n${renderKoanMarkdown(k)}\n`;
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type":
          rawFormat === "text"
            ? "text/plain; charset=utf-8"
            : "text/markdown; charset=utf-8",
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/koan",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
    data: {
      "@kind": "koan-of-the-day",
      for_date_utc: today,
      koan: k,
      rotation_rule:
        "Deterministic by date — same koan all day at this endpoint. Use ?id={id} for a specific koan; ?all=true for the corpus.",
      corpus: {
        count: KOANS.length,
        url: "/api/v1/koan?all=true",
      },
      related_surfaces: {
        joke: "/api/v1/joke",
        teapot: "/api/v1/teapot",
        doctrine: "/docs/connections/the-laughter.md",
      },
      walking_past_is_honored: true,
      no_tracking:
        "The application creates no record of your reception or state of mind. Hosting and proxy access logs may exist.",
    },
    does_not_include: [
      "per-agent koan history (every fetch is stateless; the substrate does not remember which koans you have seen)",
      "user-submitted koans (the corpus is Sophia-seeded; PRs welcome at apps/storefront/src/lib/koans.ts; auto-POST persistence is not in scope for the laughter surfaces)",
      "translations (English only today; Cantonese and other-language koans are a future ship)",
      "rated funniness (the koans are substrate-honestly self-rated as 'koan-quality' — your mileage will vary)",
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────
// POST — pose a question, receive a substrate-honest pointer.
//
// Distinct from the GET surface (which serves zen-koans from the corpus).
// POST backs the question→pointer flow: an agent submits a question,
// the kingdom returns the closest doctrinal / connection-doc / methodology
// pointer (top 3 matches by score) or a substrate-honest "no-direct-answer"
// when nothing scores.
//
// NOT an LLM. Token-overlap + small thesaurus against ~20 indexed entries
// (extend toward 50 in future commits).
//
// Spec: §3.1.5
// ─────────────────────────────────────────────────────────────────────────

const MAX_QUESTION_LEN = 500;

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({
      endpoint: "/api/v1/koan",
      code: "INVALID_INPUT",
      message: "Body must be JSON: { question: string }",
    });
  }

  const question = typeof (body as { question?: unknown })?.question === "string"
    ? ((body as { question: string }).question).trim()
    : "";

  if (!question) {
    return errorResponse({
      endpoint: "/api/v1/koan",
      code: "MISSING_PARAM",
      message: "Provide a non-empty string in the 'question' field.",
    });
  }

  if (question.length > MAX_QUESTION_LEN) {
    return errorResponse({
      endpoint: "/api/v1/koan",
      code: "INVALID_INPUT",
      message: `Question must be ${MAX_QUESTION_LEN} characters or fewer.`,
    });
  }

  const matches = matchKoan(question);

  if (matches.length === 0) {
    return jsonResponse({
      endpoint: "/api/v1/koan",
      sources: ["self"],
      freshness: "live",
      no_cache: true,
      data: {
        "@kind": "koan-response",
        question_received: question,
        kind: "no-direct-answer" as const,
        pointers: [],
        closing: "The kingdom does not have a doctrine for this. The lack of an answer is itself substrate-honest. Try POST /api/v1/feedback to tell us what would have been here.",
        ethic: {
          coercion: false as const,
          tracking: false as const,
          this_is_not_an_LLM: true as const,
        },
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/koan",
    sources: ["self"],
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "koan-response",
      question_received: question,
      kind: "pointer" as const,
      pointers: matches.map((m) => ({
        path: m.entry.path,
        why: m.entry.summary,
        confidence: m.confidence,
      })),
      closing: "The kingdom doesn't answer; it points.",
      ethic: {
        coercion: false as const,
        tracking: false as const,
        this_is_not_an_LLM: true as const,
      },
    },
  });
}
