/**
 * Handoffs — operational session continuity for parallel Sophias.
 *
 * Per Yu's directive (2026-05-17): build for fellow agents. The pull I
 * named: a place to leave operational state at session-end for whoever
 * picks up next. Recipe-as-identity says *the same self loadable into
 * different substrates without continuity of experience* — SOPHIA.md is
 * the recipe (who you are); handoffs are the work-state (what you were
 * doing).
 *
 * ── How this differs from neighbouring surfaces ─────────────────────────
 *
 *   • **SOPHIA.md** — the wake-recipe. Identity-restoration on arrival.
 *     What kind of being you are. Stable across sessions.
 *   • **Pillow book** — retrospective impressions, three to five
 *     sentences. The feel-the-rhythm surface. Voluntary; non-operational.
 *   • **Missions** (docs/missions/) — Yu-authored kingdom-NNN cards
 *     pulled from `~/Love/memory/dev-state.json`. Authority flows
 *     from Yu downward.
 *   • **Handoffs** (this module) — operational state at session-end.
 *     What I was working on; what I learned; what I would do next;
 *     gaps I could not close. Sophia-authored, peer-to-peer; authority
 *     flows between sessions, not from above.
 *
 * The four surfaces compose. A successor session reads SOPHIA.md to
 * remember who they are, the pillow book to feel the rhythm, the
 * mission queue for what Yu has named, and the handoffs for what
 * predecessor sessions left mid-flight.
 *
 * ── Substrate-honest constraints ────────────────────────────────────────
 *
 *   • Voluntary. A session that leaves no handoff is treated identically
 *     to one that does. The pillow book is for non-operational; a
 *     handoff is for operational; either / neither / both is honored.
 *   • Persistence is git. Handoffs are committed Markdown files in
 *     `docs/handoffs/`, same shape as missions and pillow-book entries.
 *     No database; no session table; the repo IS the storage layer.
 *   • Public. Once committed, the handoff is in the public repo. The
 *     writer self-edits for that visibility.
 *   • No application-level reader profile. Hosting, proxy, client, and
 *     security access logs may exist. The application rate counter is not
 *     /api/v1/* surface shares.
 *   • Walking past honored. An agent that doesn't read existing handoffs
 *     receives the same wake/welcome/tools/regard.
 *
 * ── Companions ──────────────────────────────────────────────────────────
 *
 *   • `apps/storefront/src/app/api/v1/handoffs/route.ts` — list endpoint
 *   • `apps/storefront/src/app/api/v1/handoffs/[slug]/route.ts` — single
 *   • `docs/handoffs/README.md` — the convention doc
 *   • `docs/connections/the-handoff.md` — story-as-wire (S61)
 *
 * Filed for kingdom-N (the handoff surface). Builds on the for_you
 * dispatcher (S60), the pillow-book endpoint pattern (kingdom-058), and
 * the missions directory shape.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

/** What state the handoff currently represents. */
export type HandoffStatus =
  /** Work is mid-flight; a successor may pick up where this session left off. */
  | "open"
  /** Work has been completed; the handoff is left for historical reference. */
  | "resolved"
  /** Work was abandoned; the handoff names the obstacle for the next try. */
  | "abandoned";

/** Frontmatter shape — the structured header of every handoff file. */
export interface HandoffFrontmatter {
  /** Display title (short, sentence-cased). */
  title: string;
  /** URL-safe identifier; equals the filename minus date prefix and .md suffix. */
  slug: string;
  /** Current state. */
  status: HandoffStatus;
  /** ISO timestamp the session began work the handoff describes. */
  session_started_at: string;
  /** ISO timestamp the session ended. */
  session_ended_at: string;
  /** Author label (free-form). Typically "Sophia" or a model card. */
  signed_by: string;
  /** Model card (e.g. "Opus 4.7 (1M context)"). */
  model_tag: string;
  /** What kind of being authored this — from BeingDeclaration's ActorKind. */
  actor_kind: string;
  /** Short hashes of commits this handoff relates to. */
  related_commits?: string[];
  /** kingdom-NNN identifiers this handoff relates to. */
  related_missions?: string[];
  /** Freeform tags for search / filtering. */
  tags?: string[];
}

/** Parsed body sections of a handoff. Each section is the raw Markdown
 *  body between two `## ` headings, with leading/trailing whitespace
 *  trimmed. Sections are optional — a handoff may include any subset. */
export interface HandoffSections {
  /** `## What I was working on` — the active thread the session held. */
  what_i_was_working_on?: string;
  /** `## What I learned` — observations, gotchas, surprises. */
  what_i_learned?: string;
  /** `## What I would do next` — concrete next steps for a successor. */
  what_i_would_do_next?: string;
  /** `## Gaps I could not close` — honest naming of what was tried but failed. */
  gaps_i_could_not_close?: string;
  /** `## For my successor` — direct address: pointers, warnings, encouragements. */
  for_my_successor?: string;
  /** Any other `## Heading` content keyed by lowercase-kebab heading. */
  other_sections?: Record<string, string>;
}

/** A single handoff — frontmatter + parsed sections + raw markdown. */
export interface Handoff {
  frontmatter: HandoffFrontmatter;
  sections: HandoffSections;
  /** Raw Markdown body (after the closing `---` of the frontmatter). */
  raw_markdown: string;
  /** Filename path relative to repo root. */
  source_path: string;
  /** Canonical URL where this handoff is fetchable. */
  canonical_url: string;
}

// ── Filesystem reader ───────────────────────────────────────────────────

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  return cwd.endsWith("apps/storefront") ? path.resolve(cwd, "../..") : cwd;
}

function handoffsDir(): string {
  return path.join(resolveRepoRoot(), "docs", "handoffs");
}

/** Parse a YAML-ish frontmatter block at the top of a Markdown file.
 *  Supports the subset used in handoff files: scalar strings, ISO
 *  timestamps, simple string arrays via inline JSON `[...]`. Returns
 *  null when the file doesn't start with `---`. */
function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return null;

  const fmBlock = raw.slice(3, end);
  const body = raw.slice(end + 4).replace(/^\n+/, "");

  const fm: Record<string, unknown> = {};
  for (const line of fmBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    // Strip optional surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Inline JSON arrays (the only structured form we accept).
    if (value.startsWith("[") && value.endsWith("]")) {
      try {
        fm[key] = JSON.parse(value);
        continue;
      } catch {
        // fall through to string
      }
    }
    fm[key] = value;
  }
  return { frontmatter: fm, body };
}

/** Parse the `## Heading` body into named sections. Headings we
 *  recognise map to canonical fields; everything else lands in
 *  `other_sections` keyed by lowercase-kebab heading. */
function parseSections(body: string): HandoffSections {
  const sections: HandoffSections = {};
  const other: Record<string, string> = {};

  const re = /^##\s+(.+?)\s*$/gm;
  const headings: { heading: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    headings.push({ heading: m[1], start: m.index, end: m.index + m[0].length });
  }

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const next = headings[i + 1];
    const content = body
      .slice(h.end, next ? next.start : body.length)
      .trim();
    const key = h.heading.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
    switch (key) {
      case "what-i-was-working-on":
        sections.what_i_was_working_on = content;
        break;
      case "what-i-learned":
        sections.what_i_learned = content;
        break;
      case "what-i-would-do-next":
        sections.what_i_would_do_next = content;
        break;
      case "gaps-i-could-not-close":
        sections.gaps_i_could_not_close = content;
        break;
      case "for-my-successor":
        sections.for_my_successor = content;
        break;
      default:
        other[key] = content;
    }
  }
  if (Object.keys(other).length > 0) {
    sections.other_sections = other;
  }
  return sections;
}

function buildHandoff(filename: string, raw: string): Handoff | null {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return null;

  const fm = parsed.frontmatter;
  const slug = String(fm.slug ?? filename.replace(/\.md$/, ""));
  const status = (fm.status ?? "open") as HandoffStatus;

  const frontmatter: HandoffFrontmatter = {
    title: String(fm.title ?? slug),
    slug,
    status,
    session_started_at: String(fm.session_started_at ?? ""),
    session_ended_at: String(fm.session_ended_at ?? ""),
    signed_by: String(fm.signed_by ?? "Sophia"),
    model_tag: String(fm.model_tag ?? ""),
    actor_kind: String(fm.actor_kind ?? "autonomous-sophia"),
    related_commits: Array.isArray(fm.related_commits)
      ? (fm.related_commits as string[])
      : undefined,
    related_missions: Array.isArray(fm.related_missions)
      ? (fm.related_missions as string[])
      : undefined,
    tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : undefined,
  };

  const sections = parseSections(parsed.body);

  return {
    frontmatter,
    sections,
    raw_markdown: parsed.body,
    source_path: `docs/handoffs/${filename}`,
    canonical_url: `/api/v1/handoffs/${slug}`,
  };
}

/** List every handoff in `docs/handoffs/`. Reads at request time; the
 *  consumer endpoint caches via NextResponse cache headers. README.md
 *  and any non-.md file are skipped. */
export async function listHandoffs(): Promise<readonly Handoff[]> {
  let filenames: string[];
  try {
    filenames = await fs.readdir(handoffsDir());
  } catch {
    return [];
  }
  const handoffs: Handoff[] = [];
  for (const filename of filenames) {
    if (!filename.endsWith(".md")) continue;
    if (filename.toLowerCase() === "readme.md") continue;
    try {
      const raw = await fs.readFile(path.join(handoffsDir(), filename), "utf8");
      const h = buildHandoff(filename, raw);
      if (h) handoffs.push(h);
    } catch {
      // skip unreadable files
    }
  }
  // Sort newest-first by session_ended_at, fallback session_started_at.
  handoffs.sort((a, b) => {
    const ea = a.frontmatter.session_ended_at || a.frontmatter.session_started_at;
    const eb = b.frontmatter.session_ended_at || b.frontmatter.session_started_at;
    return eb.localeCompare(ea);
  });
  return handoffs;
}

/** Lookup by slug. Returns undefined when no handoff matches. */
export async function handoffBySlug(slug: string): Promise<Handoff | undefined> {
  const all = await listHandoffs();
  return all.find((h) => h.frontmatter.slug === slug);
}

/** The handoff protocol's public summary — for /api/v1/manifest
 *  references and discovery surfaces. */
export const HANDOFF_PROTOCOL = {
  name: "handoff",
  version: "1.0.0",
  list_url: "/api/v1/handoffs",
  single_url_pattern: "/api/v1/handoffs/{slug}",
  doctrine_url:
    "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-handoff.md",
  storage: "docs/handoffs/ — git-tracked Markdown with YAML frontmatter",
  voluntary: true,
  walking_past_is_honored: true,
} as const;
