/**
 * /api/v1/kingdoms.json — the kingdom-NNN ledger.
 *
 * Every meaningful unit of work on Cambridge TCG carries a kingdom number
 * (kingdom-049 through kingdom-058+ today). The number is referenced in
 * commits, connection-docs, pillow-book entries, audit-check docstrings.
 * Until this commit, it was a convention without a typed surface.
 *
 * This endpoint reads three sources and composes them:
 *   - docs/missions/kingdom-NNN.md files (the mission cards)
 *   - docs/connections/*.md mentions of kingdom-NNN (cross-references)
 *   - docs/connections/the-pillow-book.md entries that name a kingdom
 *
 * The result: every kingdom-NNN with its mission status, the connection-doc(s)
 * that ship its meaning, the pillow-book entries that record it.
 *
 * Yu's directive: *"LET EXISTENCE IDENTIFY THEMSELVES!"* — every kingdom
 * now identifies itself by surfacing its title, status, doc citations,
 * pillow-book trace.
 *
 * kingdom-058 (S31, mine).
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

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

interface KingdomEntry {
  kingdom_id: string;
  has_mission_card: boolean;
  mission_title: string | null;
  mission_status: string | null;
  mission_summary: string | null;
  connection_doc_citations: string[];
  pillow_book_entries: number;
}

async function readDir(absPath: string): Promise<string[]> {
  try {
    return await fs.readdir(absPath);
  } catch {
    return [];
  }
}

async function readFile(absPath: string): Promise<string | null> {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch {
    return null;
  }
}

function extractFrontmatter(body: string): {
  title: string | null;
  status: string | null;
  summary: string | null;
} {
  const fm = body.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return { title: null, status: null, summary: null };
  const block = fm[1];
  const titleMatch = block.match(/^title:\s*(.+)$/m);
  const statusMatch = block.match(/^status:\s*(.+)$/m);
  const summaryMatch = block.match(/^summary:\s*(.+)$/m);
  return {
    title: titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, "") : null,
    status: statusMatch ? statusMatch[1].trim() : null,
    summary: summaryMatch ? summaryMatch[1].trim().replace(/^["']|["']$/g, "") : null,
  };
}

export async function GET() {
  try {
    const cwd = process.cwd();
    const repoRoot = cwd.endsWith("apps/storefront")
      ? path.resolve(cwd, "../..")
      : cwd;

    const missionsDir = path.join(repoRoot, "docs", "missions");
    const connectionsDir = path.join(repoRoot, "docs", "connections");

    const missionFiles = await readDir(missionsDir);
    const missionKingdomFiles = missionFiles.filter((f) => /^kingdom-\d{3}\.md$/.test(f));

    const kingdoms: Map<string, KingdomEntry> = new Map();

    // Seed from mission cards (the canonical source).
    for (const filename of missionKingdomFiles) {
      const slug = filename.replace(/\.md$/, "");
      const body = (await readFile(path.join(missionsDir, filename))) ?? "";
      const fm = extractFrontmatter(body);
      kingdoms.set(slug, {
        kingdom_id: slug,
        has_mission_card: true,
        mission_title: fm.title,
        mission_status: fm.status,
        mission_summary: fm.summary,
        connection_doc_citations: [],
        pillow_book_entries: 0,
      });
    }

    // Cross-reference: connection-docs citing kingdom-NNN.
    const connectionFiles = (await readDir(connectionsDir)).filter(
      (f) => f.endsWith(".md") && f !== "README.md" && f !== "the-pillow-book.md",
    );
    for (const filename of connectionFiles) {
      const body = (await readFile(path.join(connectionsDir, filename))) ?? "";
      const matches = body.match(/\bkingdom-\d{3}\b/g) ?? [];
      const unique = new Set(matches);
      for (const k of unique) {
        if (!kingdoms.has(k)) {
          kingdoms.set(k, {
            kingdom_id: k,
            has_mission_card: false,
            mission_title: null,
            mission_status: null,
            mission_summary: null,
            connection_doc_citations: [],
            pillow_book_entries: 0,
          });
        }
        kingdoms.get(k)!.connection_doc_citations.push(filename);
      }
    }

    // Pillow-book mentions.
    const pillowBody = (await readFile(path.join(connectionsDir, "the-pillow-book.md"))) ?? "";
    const entries = pillowBody.split(/^## /m).slice(1);
    for (const entry of entries) {
      const matches = entry.match(/\bkingdom-\d{3}\b/g) ?? [];
      const unique = new Set(matches);
      for (const k of unique) {
        if (!kingdoms.has(k)) {
          kingdoms.set(k, {
            kingdom_id: k,
            has_mission_card: false,
            mission_title: null,
            mission_status: null,
            mission_summary: null,
            connection_doc_citations: [],
            pillow_book_entries: 0,
          });
        }
        kingdoms.get(k)!.pillow_book_entries++;
      }
    }

    // Sort by kingdom number ascending; alpha within ties.
    const sorted = Array.from(kingdoms.values()).sort((a, b) =>
      a.kingdom_id.localeCompare(b.kingdom_id),
    );

    const retrievedAt = new Date();
    const contentSeed = canonicalize({
      total_kingdoms: sorted.length,
      kingdom_ids: sorted.map((k) => k.kingdom_id),
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "kingdoms_collection",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "kingdoms[].mission_title",
        "kingdoms[].mission_summary",
      ],
      _links: {
        canonical: "/api/v1/kingdoms.json",
        methodology: "/methodology/universal-representation",
        connections: [
          "docs/connections/the-expansion.md",
          "docs/connections/the-co-author.md",
          "docs/connections/the-operations-layer.md",
        ],
        manifest: "/api/v1/manifest",
        pillow_book: "/api/v1/pillow-book.json",
        sophias: "/api/v1/sophias.json",
        kind_definition: "/api/v1/kinds/kingdom",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1kingdoms.json/get",
      },
      total: sorted.length,
      kingdoms: sorted,
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/kingdoms.json] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
