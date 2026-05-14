#!/usr/bin/env tsx
/**
 * missions-sync.ts — regenerate docs/missions/kingdom-NNN.md from dev-state.json.
 *
 * Mirror of the TCG-engine kingdom queue. Source of truth is
 * `~/Love/memory/dev-state.json` (the Cowork → Love handoff); this script
 * writes one file per kingdom into `docs/missions/`.
 *
 * Preservation policy (for future runs):
 *   - YAML frontmatter `paths`, `do_not_touch`, `claimed_by`, `claimed_at`
 *     are kept from the existing in-repo file if present.
 *   - `title`, `status`, `priority`, `repo`, `completed_at` come from
 *     dev-state.json (canonical).
 *   - Body text after a `## In-repo addendum` marker is preserved.
 *   - Body text before that marker is overwritten with dev-state's `notes`.
 *
 * Shaping 3 of the autonomous-agent reshaping (2026-05-11 evening).
 * See docs/missions/README.md for the schema and protocol.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const MISSIONS_DIR = join(REPO_ROOT, "docs/missions");
const DEV_STATE = join(homedir(), "Love/memory/dev-state.json");

const ADDENDUM_MARKER = "## In-repo addendum";

interface Kingdom {
  id: string;
  title: string;
  status: string;
  priority?: string;
  engine?: string;
  repo?: string;
  notes?: string;
  completed_at?: string;
  claimed_by?: string;
  claimed_at?: string;
}

interface ExistingFrontmatter {
  paths?: string[];
  do_not_touch?: string[];
  claimed_by?: string | null;
  claimed_at?: string | null;
  related?: string[];
}

interface ParsedExisting {
  frontmatter: ExistingFrontmatter;
  addendum: string;
}

function parseExisting(path: string): ParsedExisting {
  const fm: ExistingFrontmatter = {};
  let addendum = "";
  if (!existsSync(path)) return { frontmatter: fm, addendum };
  const raw = readFileSync(path, "utf8");

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    const body = raw.slice(fmMatch[0].length);
    const idx = body.indexOf(ADDENDUM_MARKER);
    if (idx >= 0) addendum = body.slice(idx);

    const lines = fmMatch[1].split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const single = line.match(/^([a-z_]+):\s*(.*)$/);
      if (single) {
        const key = single[1];
        const value = single[2];
        if (key === "paths" || key === "do_not_touch" || key === "related") {
          if (value === "[]" || value === "") {
            (fm as Record<string, unknown>)[key] = [];
            i++;
            continue;
          }
          const list: string[] = [];
          let j = i + 1;
          while (j < lines.length && lines[j].startsWith("  - ")) {
            list.push(lines[j].slice(4).trim());
            j++;
          }
          (fm as Record<string, unknown>)[key] = list;
          i = j;
          continue;
        }
        if (key === "claimed_by" || key === "claimed_at") {
          const v = value.trim();
          (fm as Record<string, unknown>)[key] = (v === "~" || v === "null" || v === "") ? null : v;
        }
      }
      i++;
    }
  }

  return { frontmatter: fm, addendum };
}

function yamlList(key: string, list?: string[] | null): string {
  if (!list || list.length === 0) return `${key}: []`;
  const lines = [`${key}:`];
  for (const item of list) lines.push(`  - ${item}`);
  return lines.join("\n");
}

function yamlScalar(key: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return `${key}: ~`;
  if (/[:#&*!|>%@`{}[\],]/.test(value)) {
    return `${key}: ${JSON.stringify(value)}`;
  }
  return `${key}: ${value}`;
}

function render(k: Kingdom, existing: ParsedExisting, syncedAt: string): string {
  const fm = existing.frontmatter;

  // status mapping: dev-state uses "in-progress", "done", "planned", "deferred";
  // mission cards add "queued" (alias for "planned") and "claimed" (intermediate).
  // We preserve dev-state's verb but emit the canonical mission-card vocabulary.
  let status = k.status;
  if (status === "planned") status = "queued";

  const lines: string[] = [];
  lines.push("---");
  lines.push(yamlScalar("id", k.id));
  lines.push(yamlScalar("title", k.title));
  lines.push(yamlScalar("status", status));
  lines.push(yamlScalar("priority", k.priority ?? "medium"));
  lines.push(yamlScalar("engine", k.engine ?? "tcg"));
  lines.push(yamlScalar("repo", k.repo ?? "/Users/you/Desktop/Cambridge-TCG"));
  lines.push(yamlScalar("claimed_by", fm.claimed_by ?? null));
  lines.push(yamlScalar("claimed_at", fm.claimed_at ?? null));
  lines.push(yamlScalar("completed_at", k.completed_at ?? null));
  lines.push(yamlList("paths", fm.paths));
  lines.push(yamlList("do_not_touch", fm.do_not_touch));
  lines.push(yamlList("related", fm.related));
  lines.push(yamlScalar("synced_from", "~/Love/memory/dev-state.json"));
  lines.push(yamlScalar("synced_at", syncedAt));
  lines.push("---");
  lines.push("");
  lines.push(`# ${k.id} — ${k.title}`);
  lines.push("");
  if (k.notes) {
    lines.push("## From dev-state.json");
    lines.push("");
    // Word-wrap notes naturally — they're freeform prose.
    lines.push(k.notes);
    lines.push("");
  }
  if (existing.addendum) {
    lines.push(existing.addendum.trim());
    lines.push("");
  } else {
    lines.push(ADDENDUM_MARKER);
    lines.push("");
    lines.push("*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*");
    lines.push("");
  }
  return lines.join("\n");
}

function main(): void {
  if (!existsSync(DEV_STATE)) {
    console.error(`[missions-sync] dev-state not accessible at ${DEV_STATE}`);
    console.error("  (Are you running from a sister daemon without ~/Love access?)");
    console.error("  Sync skipped; existing mission cards are unchanged.");
    process.exit(2);
  }

  mkdirSync(MISSIONS_DIR, { recursive: true });
  const data = JSON.parse(readFileSync(DEV_STATE, "utf8"));
  const tcg: Kingdom[] = (data.tasks || []).filter((t: { engine?: string }) => t.engine === "tcg");

  const syncedAt = new Date().toISOString();
  let wrote = 0;
  let skipped = 0;
  const seenIds = new Set<string>();

  for (const k of tcg) {
    seenIds.add(k.id);
    const path = join(MISSIONS_DIR, `${k.id}.md`);
    const existing = parseExisting(path);

    // Don't overwrite a claimed mission if dev-state hasn't caught up.
    // (Cooperative — operator reconciles by running this after updating dev-state.)
    if (existing.frontmatter.claimed_by && k.status === "planned") {
      console.log(`  ⏸  ${k.id}: skipped (claimed in repo, still planned in dev-state)`);
      skipped++;
      continue;
    }

    const next = render(k, existing, syncedAt);
    writeFileSync(path, next);
    wrote++;
  }

  // Report orphan files (mission cards with no dev-state row).
  const orphans: string[] = [];
  if (existsSync(MISSIONS_DIR)) {
    for (const e of readdirSync(MISSIONS_DIR)) {
      const m = e.match(/^(kingdom-\d+)\.md$/);
      if (m && !seenIds.has(m[1])) orphans.push(m[1]);
    }
  }

  console.log(`Wrote ${wrote} mission cards to ${MISSIONS_DIR} (skipped ${skipped})`);
  if (orphans.length) {
    console.log(`Orphan cards (no dev-state row): ${orphans.join(", ")}`);
    console.log("  These were not regenerated. Delete manually if intentionally retired.");
  }
}

main();
