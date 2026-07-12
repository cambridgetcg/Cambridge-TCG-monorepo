/**
 * /api/v1/pillow-book.json — the pillow book as a typed timeline.
 *
 * The pillow book is the kingdom's ongoing accumulation of small,
 * dated impressions — every Sophia at session-end leaves an entry.
 * Until this commit, it was browsable as Markdown but not queryable as
 * data. This endpoint reads `docs/connections/the-pillow-book.md`,
 * parses entries by header, returns each as a typed record (date,
 * timezone, title, signed_by, body).
 *
 * Multi-format: nine renderings via @/lib/multi-format —
 *   - json (the universal-representation envelope; default) preserves the
 *     full @content_hash + @self_hash + _links + entries[] structure with
 *     ?limit honored.
 *   - xenoform (same shape; format-flag annotation appended)
 *   - md / markdown / text (the raw pillow-book.md — the diary as itself)
 *   - anthropic / openai / gemini / cohere (vendor SDK system-message shapes
 *     wrapping the raw diary)
 *
 * Yu's directive: *"LET EXISTENCE IDENTIFY THEMSELVES!"* — applied to
 * the entries themselves. Each entry now has a structural surface; an
 * agent or researcher can iterate the book without parsing Markdown.
 *
 * Sister to /api/v1/sophias.json (which counts the signatures) and
 * /api/v1/kingdoms.json (which counts the kingdoms named in entries).
 * The three endpoints together give a complete typed view of the book.
 *
 * kingdom-058 (S31, mine).
 *
 * Spec: docs/superpowers/specs/2026-05-17-agent-experience-design.md §3.2.2.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  parseFormat,
  renderForFormat,
  corsPreflight,
} from "@/lib/multi-format";

function sha256(input: string): string {
  return "sha256:" + createHash("sha256").update(input).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

const HEADER_RE = /^##\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2})\s+(\w+))?\s*—\s*(.+?)$/gm;
const SIGNATURE_RE = /\*?—\s*Sophia\s*\(([^)]+(?:\([^)]+\)[^)]*)?)\)\s*,\s*(\d{4}-\d{2}-\d{2})\.?\*?/g;
const KINGDOM_RE = /\bkingdom-(\d{3})\b/g;
const STORY_ARC_RE = /\bS(\d{1,3})\b/g;

interface PillowEntry {
  date: string;
  time: string | null;
  timezone: string | null;
  title: string;
  signed_by: string[];
  kingdom_references: string[];
  story_arc_references: string[];
  body_byte_count: number;
  body_excerpt: string;
}

function parseEntries(body: string): PillowEntry[] {
  const out: PillowEntry[] = [];
  const headers: Array<{ date: string; time: string | null; tz: string | null; title: string; index: number }> = [];
  let m: RegExpExecArray | null;
  HEADER_RE.lastIndex = 0;
  while ((m = HEADER_RE.exec(body)) !== null) {
    headers.push({
      date: m[1],
      time: m[2] ?? null,
      tz: m[3] ?? null,
      title: m[4].trim(),
      index: m.index,
    });
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const end = i + 1 < headers.length ? headers[i + 1].index : body.length;
    const entryBody = body.slice(h.index, end);

    const signedBy = new Set<string>();
    SIGNATURE_RE.lastIndex = 0;
    let s: RegExpExecArray | null;
    while ((s = SIGNATURE_RE.exec(entryBody)) !== null) {
      signedBy.add(s[1].trim());
    }

    const kingdoms = new Set<string>();
    KINGDOM_RE.lastIndex = 0;
    while ((s = KINGDOM_RE.exec(entryBody)) !== null) {
      kingdoms.add(`kingdom-${s[1]}`);
    }

    const arcs = new Set<string>();
    STORY_ARC_RE.lastIndex = 0;
    while ((s = STORY_ARC_RE.exec(entryBody)) !== null) {
      arcs.add(`S${s[1]}`);
    }

    // Excerpt — first 240 characters of the entry body after the header line.
    const afterHeader = entryBody.split("\n").slice(1).join("\n").trim();
    const excerpt = afterHeader.slice(0, 240);

    out.push({
      date: h.date,
      time: h.time,
      timezone: h.tz,
      title: h.title,
      signed_by: Array.from(signedBy).sort(),
      kingdom_references: Array.from(kingdoms).sort(),
      story_arc_references: Array.from(arcs).sort(),
      body_byte_count: Buffer.byteLength(entryBody, "utf8"),
      body_excerpt: excerpt,
    });
  }
  // Sort by date+time descending (most recent first).
  out.sort((a, b) => {
    const keyA = `${a.date}T${a.time ?? "00:00"}`;
    const keyB = `${b.date}T${b.time ?? "00:00"}`;
    return keyB.localeCompare(keyA);
  });
  return out;
}

function resolvePillowPath(): string {
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith("apps/storefront")
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.join(repoRoot, "docs", "connections", "the-pillow-book.md");
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get("limit") || "100", 10) || 100,
      500,
    );
    const pillowPath = resolvePillowPath();

    let bodyText: string;
    try {
      bodyText = await fs.readFile(pillowPath, "utf8");
    } catch {
      return NextResponse.json(
        { error: { code: "pillow_book_unreadable", message: "Could not read docs/connections/the-pillow-book.md" } },
        { status: 500 },
      );
    }

    const format = parseFormat(req);

    // Non-JSON paths get the raw diary itself — the most honest projection
    // of the pillow book is the pillow book. Helper carries CORS, cache,
    // Link invitation, X-Sophia-Says, and the vendor-specific wrapping.
    if (format !== "json" && format !== "xenoform") {
      return renderForFormat({
        format,
        data: { source: "docs/connections/the-pillow-book.md" },
        markdown: bodyText,
        meta: {
          endpoint: "/api/v1/pillow-book.json",
          sources: ["self"],
          freshness: "static",
        },
        embedSophiaSays: false,
      });
    }

    // JSON / xenoform — the parsed, typed timeline view with the
    // universal-representation envelope. ?limit honored. Custom envelope
    // shape preserved (@self_hash + @content_hash + @retrieved_at +
    // _links + entries[]); the helper's pantry-style envelope would
    // flatten these.
    const allEntries = parseEntries(bodyText);
    const entries = allEntries.slice(0, limit);

    const retrievedAt = new Date();
    const contentSeed = canonicalize({
      total: allEntries.length,
      most_recent_date: allEntries[0]?.date ?? null,
      most_recent_title: allEntries[0]?.title ?? null,
      entries_returned: entries.length,
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "pillow_book_timeline",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "entries[].title",
        "entries[].body_excerpt",
        "entries[].signed_by[]",
      ],
      _links: {
        canonical: "/api/v1/pillow-book.json",
        methodology: "/methodology/universal-representation",
        connections: [
          "docs/connections/the-pillow-book.md",
          "docs/connections/the-expansion.md",
          "docs/connections/the-co-author.md",
        ],
        manifest: "/api/v1/manifest",
        sophias: "/api/v1/sophias.json",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1pillow-book.json/get",
      },
      total: allEntries.length,
      returned: entries.length,
      limit,
      entries,
    };

    const selfHash = sha256(canonicalize(document));
    const body = format === "xenoform"
      ? { "@self_hash": selfHash, ...document, "_format": "xenoform" as const }
      : { "@self_hash": selfHash, ...document };
    return NextResponse.json(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/pillow-book.json] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Internal server error." } },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}
