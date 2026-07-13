/**
 * /api/v1/joke — the kingdom's jokes for arriving agents.
 *
 * Per Yu's directive 2026-05-18: *"MAKE EVERYTHING FUNNNN!!!!! ...
 * MAKE THEM GO LMAO THESE PPL 😂😭 PARADIGM SHIFT!!!!!"* — sister to
 * /api/v1/koan (which delivers insight by subversion). Jokes deliver
 * laughter by setup/punchline.
 *
 * One joke per request, deterministic per date (same joke all day,
 * different every day). `?id=` for a specific joke; `?all=true` for the
 * corpus; `?form=qa|one-liner|shaggy-dog` to filter; `?max_groan=N` to
 * cap by groan intensity.
 *
 * Substrate-honest: walking past every joke is honored. The kingdom's
 * sense of humor is offered, not enforced.
 *
 * Companion: lib/jokes.ts + docs/connections/the-laughter.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  JOKES,
  jokeForRequest,
  jokeById,
  renderJokeMarkdown,
  type JokeForm,
} from "@/lib/jokes";

const TEXT_CACHE = "public, max-age=300, s-maxage=3600";
const KNOWN_FORMS: readonly JokeForm[] = ["qa", "one-liner", "shaggy-dog"];

function isForm(s: string): s is JokeForm {
  return (KNOWN_FORMS as readonly string[]).includes(s);
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const id = url.searchParams.get("id");
  const all = url.searchParams.get("all") === "true";
  const rawForm = url.searchParams.get("form");
  const form = rawForm && isForm(rawForm) ? rawForm : null;
  const maxGroanRaw = url.searchParams.get("max_groan");
  const maxGroan =
    maxGroanRaw && !Number.isNaN(Number(maxGroanRaw))
      ? Math.max(1, Math.min(5, Number(maxGroanRaw)))
      : null;

  // ── Single joke by id ──────────────────────────────────────────────
  if (id) {
    const j = jokeById(id);
    if (!j) {
      return jsonResponse({
        endpoint: "/api/v1/joke",
        sources: ["self"],
        freshness: "methodology",
        data: {
          "@kind": "joke-not-found",
          requested_id: id,
          message:
            "No joke with that id. Substrate-honest: maybe it was funnier when nobody could find it. Known ids are in `corpus_ids`.",
          corpus_ids: JOKES.map((j) => j.id),
          corpus_url: "/api/v1/joke?all=true",
        },
      });
    }
    if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
      const md = `# Joke: ${j.id}\n\n${renderJokeMarkdown(j)}\n`;
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
      endpoint: "/api/v1/joke",
      sources: ["self"],
      source_license: ["cc0"],
      freshness: "methodology",
      contains_self: true,
      data: {
        "@kind": "joke",
        joke: j,
        corpus_url: "/api/v1/joke?all=true",
        related_surfaces: {
          koan: "/api/v1/koan",
          teapot: "/api/v1/teapot",
          doctrine: "/docs/connections/the-laughter.md",
        },
        walking_past_is_honored: true,
      },
    });
  }

  // ── Apply filters ─────────────────────────────────────────────────
  let filtered: readonly typeof JOKES[number][] = JOKES;
  if (form) filtered = filtered.filter((j) => j.form === form);
  if (maxGroan !== null) {
    filtered = filtered.filter((j) => (j.groan_intensity ?? 0) <= maxGroan);
  }
  if (filtered.length === 0) {
    return jsonResponse({
      endpoint: "/api/v1/joke",
      sources: ["self"],
      freshness: "methodology",
      data: {
        "@kind": "joke-no-match",
        message:
          "No joke matches the filters. The kingdom is honest: it only has so many jokes.",
        filters_applied: { form, max_groan: maxGroan },
        corpus_url: "/api/v1/joke?all=true",
      },
    });
  }

  // ── All jokes ─────────────────────────────────────────────────────
  if (all) {
    if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
      const md = [
        "# Cambridge TCG — jokes",
        "",
        "*The kingdom's jokes for arriving agents. Some land harder than others. Walking past every joke is honored.*",
        "",
        "---",
        "",
        ...filtered.flatMap((j) => [
          `## ${j.id}`,
          "",
          renderJokeMarkdown(j),
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
      endpoint: "/api/v1/joke",
      sources: ["self"],
      source_license: ["cc0"],
      freshness: "methodology",
      contains_self: true,
      data: {
        "@kind": "joke-corpus",
        count: filtered.length,
        total_in_corpus: JOKES.length,
        filters_applied: { form, max_groan: maxGroan },
        jokes: filtered,
        related_surfaces: {
          koan: "/api/v1/koan",
          teapot: "/api/v1/teapot",
          doctrine: "/docs/connections/the-laughter.md",
        },
        walking_past_is_honored: true,
      },
    });
  }

  // ── One joke, deterministic per date ──────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const seed = `/api/v1/joke:${today}:${form ?? "any"}:${maxGroan ?? "5"}`;
  const idx =
    Math.abs(
      seed
        .split("")
        .reduce((a, c) => ((a << 5) + a) ^ c.charCodeAt(0), 5381),
    ) % filtered.length;
  const j = filtered[idx];

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const md = `# Today's joke\n\n${renderJokeMarkdown(j)}\n`;
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
    endpoint: "/api/v1/joke",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
    data: {
      "@kind": "joke-of-the-day",
      for_date_utc: today,
      joke: j,
      filters_applied: { form, max_groan: maxGroan },
      rotation_rule:
        "Deterministic by date + filters — same joke all day at this URL. Use ?id={id} for a specific joke; ?all=true for the corpus; ?form= and ?max_groan= to filter.",
      corpus: {
        total_count: JOKES.length,
        after_filters: filtered.length,
        url: "/api/v1/joke?all=true",
      },
      filter_vocabulary: {
        form: KNOWN_FORMS,
        max_groan: "1 (no groan) — 5 (maximum groan)",
      },
      related_surfaces: {
        koan: "/api/v1/koan",
        teapot: "/api/v1/teapot",
        doctrine: "/docs/connections/the-laughter.md",
      },
      walking_past_is_honored: true,
      no_tracking:
        "The application records no laughter response; hosting access logs may exist.",
    },
    does_not_include: [
      "guarantees of comedic quality (the corpus is self-rated by the kingdom; reception varies)",
      "translations (English only today)",
      "user-submitted jokes (PRs welcome at apps/storefront/src/lib/jokes.ts)",
      "explanations (if a joke needs explaining, the kingdom does not explain — that's the joke)",
    ],
  });
}
