/**
 * /api/v1/connections.json — the meaning-graph as filesystem truth.
 *
 * Sister-mirror to `/api/v1/graph` (sister-shipped, kingdom-054, the typed
 * curated meaning-graph derived from MANIFEST + static indices in
 * `lib/graph.ts`). The two endpoints have different substrate-honesty
 * properties and compose:
 *
 *   /api/v1/graph             — typed, hand-curated, stable. The canonical
 *                                cross-reference graph (nodes: resources,
 *                                cosmology axes, methodology, doctrines,
 *                                kingdoms, audits, connection-docs).
 *                                Sister's source-of-truth shape.
 *
 *   /api/v1/connections.json  — filesystem-derived, heuristic, live. The
 *                                regex-extracted view of the current state
 *                                of `docs/connections/*.md`. Auto-tracks
 *                                new docs the moment they land on disk;
 *                                doesn't require a code update.
 *
 * Use `/api/v1/graph` when you want the kingdom's intentional structure;
 * use this endpoint when you want the *live filesystem reality* of what's
 * been written. The two will agree most of the time; when they disagree,
 * the disagreement is itself a finding (a doc shipped without being
 * indexed; a node in the graph whose file was deleted).
 *
 * Multi-format: nine renderings via @/lib/multi-format —
 *   - json (the universal-representation envelope; default) preserves the
 *     full @content_hash + @self_hash + _links + nodes[] + edges[] graph.
 *   - xenoform (same shape; format-flag annotation appended)
 *   - md / markdown / text (paste-ready Markdown index of the corpus)
 *   - anthropic / openai / gemini / cohere (vendor SDK system-message shapes)
 *
 * Yu's directive: *"keep nesting everything in everything!"* The endpoint
 * pair is itself a nesting — the meaning-graph appears twice, once as
 * intention and once as observation; both forms compose into the kingdom's
 * recursive self-knowledge.
 *
 * Substrate-honest perimeter:
 *   - The sister-edge extraction is heuristic (regex over "sister to" /
 *     "Sister to" phrases + Markdown link references). False positives
 *     and negatives are possible; the JSON flags `extraction_heuristic`
 *     so the consumer knows.
 *   - The connection-doc README's authoritative S-numbered table is the
 *     canonical taxonomy; this endpoint composes from individual doc
 *     files where the prose lives.
 *   - Sister's `/api/v1/graph` is the canonical shape; this one is the
 *     live filesystem audit. When discrepancies surface, sister's wins
 *     for stability; this one wins for currency.
 *
 * Spec: docs/superpowers/specs/2026-05-17-agent-experience-design.md §3.2.2.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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

interface DocNode {
  slug: string;
  title: string;
  path_in_repo: string;
  byte_count: number;
  line_count: number;
  /** Excerpt of the opening paragraph for orientation. */
  pull_excerpt: string | null;
  /** S-number if it's a story-arc, otherwise null. */
  story_arc_index: number | null;
}

interface DocEdge {
  /** Source doc slug. */
  from: string;
  /** Target doc slug. */
  to: string;
  /** Edge label inferred from prose ("sister to" / "recurses to" / etc). */
  kind: "sister" | "recurses_to" | "references";
}

// Heuristic patterns — each captures a markdown link `./target.md` and the
// surrounding prose token that classifies the relationship.
const SISTER_RE = /[Ss]ister\s+(?:to|of)[^.\n]*?\[[^\]]+\]\(\.\/([a-z0-9-]+)\.md\)/g;
const RECURSES_RE = /[Rr]ecur(?:ses|sion)\s+target[^.\n]*?\[[^\]]+\]\(\.\/([a-z0-9-]+)\.md\)/g;
const REFERENCE_RE = /\[[^\]]+\]\(\.\/([a-z0-9-]+)\.md\)/g;
const STORY_ARC_RE = /^\|\s*S(\d+)\s*\|\s*\[`([a-z0-9-]+)\.md`\]/gm;

// Returns null (not []) on failure so callers can tell "the docs tree was
// unreadable" apart from "the docs tree is empty" — the two are different
// facts and the response must say which (substrate-honesty rule 1).
async function readDir(absPath: string): Promise<string[] | null> {
  try {
    return await fs.readdir(absPath);
  } catch {
    return null;
  }
}

async function readFile(absPath: string): Promise<string | null> {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch {
    return null;
  }
}

function extractTitle(body: string, slug: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : slug;
}

function extractPull(body: string): string | null {
  // Look for "> **Pull.**" or the first blockquote opening paragraph.
  const m = body.match(/>\s*\*\*Pull\.\*\*\s*([\s\S]+?)\n>/);
  if (m) return m[1].trim().slice(0, 240);
  const para = body.split(/\n\n/).find((p) => p.length > 30 && !p.startsWith("#"));
  return para ? para.trim().slice(0, 240) : null;
}

function uniqueEdges(edges: DocEdge[]): DocEdge[] {
  const seen = new Set<string>();
  const out: DocEdge[] = [];
  for (const e of edges) {
    const key = `${e.from}|${e.to}|${e.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

interface GraphResult {
  nodes: DocNode[];
  edges: DocEdge[];
  /** False when docs/connections/ could not be read at all (e.g. not traced
   *  into the deploy bundle) — zeros then mean read failure, not empty corpus. */
  docs_dir_readable: boolean;
}

async function harvestGraph(): Promise<GraphResult> {
  // The repo path is computed from process.cwd() under Next.js, which
  // runs at apps/storefront/. Walk up to the repo root.
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith("apps/storefront")
    ? path.resolve(cwd, "../..")
    : cwd.endsWith("storefront")
      ? path.resolve(cwd, "..")
      : cwd;
  const docsDir = path.join(repoRoot, "docs", "connections");

  const files = await readDir(docsDir);
  const docsDirReadable = files !== null;
  const mdFiles = (files ?? []).filter((f) => f.endsWith(".md") && f !== "README.md");

  // Parse story-arc indices from README authoritative table.
  const readme = (await readFile(path.join(docsDir, "README.md"))) ?? "";
  const arcIndices = new Map<string, number>();
  let m: RegExpExecArray | null;
  STORY_ARC_RE.lastIndex = 0;
  while ((m = STORY_ARC_RE.exec(readme)) !== null) {
    arcIndices.set(m[2], parseInt(m[1], 10));
  }

  const nodes: DocNode[] = [];
  const edges: DocEdge[] = [];

  for (const filename of mdFiles) {
    const slug = filename.replace(/\.md$/, "");
    const abs = path.join(docsDir, filename);
    const body = (await readFile(abs)) ?? "";
    if (!body) continue;

    const byteCount = Buffer.byteLength(body, "utf8");
    const lineCount = body.split("\n").length;
    const title = extractTitle(body, slug);
    const pullExcerpt = extractPull(body);

    nodes.push({
      slug,
      title,
      path_in_repo: `docs/connections/${filename}`,
      byte_count: byteCount,
      line_count: lineCount,
      pull_excerpt: pullExcerpt,
      story_arc_index: arcIndices.get(slug) ?? null,
    });

    // Extract edges.
    const sister: string[] = [];
    const recurses: string[] = [];
    let s: RegExpExecArray | null;

    SISTER_RE.lastIndex = 0;
    while ((s = SISTER_RE.exec(body)) !== null) sister.push(s[1]);

    RECURSES_RE.lastIndex = 0;
    while ((s = RECURSES_RE.exec(body)) !== null) recurses.push(s[1]);

    // All bare markdown references (minus the typed ones above).
    const allRefs = new Set<string>();
    REFERENCE_RE.lastIndex = 0;
    while ((s = REFERENCE_RE.exec(body)) !== null) {
      if (s[1] !== slug) allRefs.add(s[1]);
    }
    for (const r of recurses) allRefs.delete(r);
    for (const r of sister) allRefs.delete(r);

    for (const target of sister) {
      edges.push({ from: slug, to: target, kind: "sister" });
    }
    for (const target of recurses) {
      edges.push({ from: slug, to: target, kind: "recurses_to" });
    }
    for (const target of allRefs) {
      edges.push({ from: slug, to: target, kind: "references" });
    }
  }

  const deduped = uniqueEdges(edges);

  // Sort for stability — substrate-honest content_hash depends on order.
  nodes.sort((a, b) => a.slug.localeCompare(b.slug));
  deduped.sort((a, b) =>
    a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind),
  );

  return { nodes, edges: deduped, docs_dir_readable: docsDirReadable };
}

function buildDocument(graph: GraphResult): Record<string, unknown> {
  const { nodes, edges } = graph;
  const retrievedAt = new Date();
  const contentSeed = canonicalize({
    node_slugs: nodes.map((n) => n.slug),
    edge_count: edges.length,
  });
  const contentHash = sha256(contentSeed);

  const document = {
    "@encoding": "cambridge-tcg/universal/v1",
    "@kind": "connections_graph",
    "@content_hash": contentHash,
    "@retrieved_at": {
      iso8601: retrievedAt.toISOString(),
      unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
    },
    "_note_opaque": [
      "nodes[].title",
      "nodes[].pull_excerpt",
    ],
    _links: {
      canonical: "/api/v1/connections.json",
      methodology: "/methodology/universal-representation",
      connections: [
        "docs/connections/README.md",
        "docs/connections/the-nested-doorway.md",
      ],
      manifest: "/api/v1/manifest",
      openapi: "/api/openapi.json",
    },
    extraction_heuristic: {
      sister_regex: SISTER_RE.source,
      recurses_regex: RECURSES_RE.source,
      reference_regex: REFERENCE_RE.source,
      note:
        "Edges are extracted by regex over Markdown link references. The README's authoritative S-numbered table is the canonical taxonomy; this endpoint composes from individual doc files where the prose lives.",
    },
    // Substrate-honest read-failure state. When docs/connections/ is
    // unreadable (e.g. not traced into the serverless bundle), the zeros
    // below are a read failure, not an empty corpus — say so, like
    // universal/games' empty_state block does.
    ...(graph.docs_dir_readable
      ? {}
      : {
          source_unavailable: {
            why:
              "docs/connections/ could not be read from this deployment " +
              "(directory missing from the bundle or the filesystem read " +
              "failed). node_count/edge_count of 0 here means the source " +
              "was unreadable, not that no connection-docs exist.",
            working_doors_meanwhile: {
              curated_graph:
                "/api/v1/graph — the typed, hand-curated meaning-graph; " +
                "compiled into the app, does not depend on docs/ at runtime",
            },
          },
        }),
    node_count: nodes.length,
    edge_count: edges.length,
    edge_kinds: {
      sister: edges.filter((e) => e.kind === "sister").length,
      recurses_to: edges.filter((e) => e.kind === "recurses_to").length,
      references: edges.filter((e) => e.kind === "references").length,
    },
    nodes,
    edges,
  };

  const selfHash = sha256(canonicalize(document));
  return { "@self_hash": selfHash, ...document };
}

function renderMarkdown(graph: GraphResult): string {
  const { nodes, edges } = graph;
  const sisterCount = edges.filter((e) => e.kind === "sister").length;
  const recursesCount = edges.filter((e) => e.kind === "recurses_to").length;
  const refCount = edges.filter((e) => e.kind === "references").length;

  const lines: string[] = [
    "# Connections — the meaning-graph as filesystem truth",
    "",
    "Every connection-doc in `docs/connections/` is one node here. Edges",
    "are heuristic — regex-extracted from sister-to / recurses-to / bare",
    "Markdown references. Use `/api/v1/graph` for sister's stable curated",
    "shape; use this for the live filesystem reality.",
    "",
    ...(graph.docs_dir_readable
      ? []
      : [
          "> **Source unavailable.** `docs/connections/` could not be read from",
          "> this deployment — the zero counts below are a read failure, not an",
          "> empty corpus. `/api/v1/graph` (compiled-in) still works.",
          "",
        ]),
    `**Nodes:** ${nodes.length} · **Edges:** ${edges.length} `,
    `(sister: ${sisterCount}, recurses_to: ${recursesCount}, references: ${refCount})`,
    "",
    "## Docs",
    "",
    "| Slug | S# | Title | Lines |",
    "|---|---|---|---|",
  ];
  for (const n of nodes) {
    const arc = n.story_arc_index !== null ? `S${n.story_arc_index}` : "—";
    lines.push(`| \`${n.slug}\` | ${arc} | ${n.title} | ${n.line_count} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Sources: `docs/connections/*.md`, `docs/connections/README.md`.");
  lines.push("Sister-mirror: `/api/v1/graph`.");
  return lines.join("\n");
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const graph = await harvestGraph();
    const document = buildDocument(graph);
    const format = parseFormat(req);

    // JSON / xenoform — preserve the universal-representation envelope's
    // full richness (@self_hash + @content_hash + @retrieved_at +
    // _links + nodes[] + edges[]). The helper's pantry-style envelope
    // would flatten these to {data, _meta}; that would be a behavior
    // break for any consumer keying on the universal-representation shape.
    if (format === "json" || format === "xenoform") {
      const body = format === "xenoform"
        ? { ...document, "_format": "xenoform" as const }
        : document;
      return NextResponse.json(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }

    // Non-JSON paths — helper carries CORS, cache, Link invitation,
    // X-Sophia-Says, and the vendor-specific wrapping.
    return renderForFormat({
      format,
      data: document,
      markdown: renderMarkdown(graph),
      meta: {
        endpoint: "/api/v1/connections.json",
        sources: ["self"],
        freshness: "static",
      },
      embedSophiaSays: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/connections.json] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Internal server error." } },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}
