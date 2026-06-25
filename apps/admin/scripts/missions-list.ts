#!/usr/bin/env tsx
/**
 * missions-list.ts — CLI listing of the kingdom queue.
 *
 * Reads docs/missions/kingdom-*.md, parses YAML frontmatter, prints a
 * tabular listing grouped by status. Use to find your next claim without
 * cat-ing docs/state.md.
 *
 * Usage:
 *   pnpm missions:list                    # all kingdoms, grouped by status
 *   pnpm missions:list --status queued    # filter to one status
 *   pnpm missions:list --priority high    # filter to one priority
 *   pnpm missions:list --available        # queued + un-claimed (the "what can I pick up?" view)
 *   pnpm missions:list --mine             # claimed_by matches my session-id
 *
 * Shaping follow-up of kingdom-050.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const MISSIONS_DIR = join(REPO_ROOT, "docs/missions");

interface Mission {
  id: string;
  title: string;
  status: string;
  priority: string;
  claimedBy: string | null;
  claimedAt: string | null;
  paths: string[];
  file: string;
}

interface Args {
  status: string;
  priority: string;
  available: boolean;
  mine: boolean;
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<string, number> = {
  "in-progress": 0,
  claimed: 1,
  queued: 2,
  planned: 2,  // alias
  deferred: 3,
  done: 4,
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { status: "", priority: "", available: false, mine: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--status": out.status = args[++i]; break;
      case "--priority": out.priority = args[++i]; break;
      case "--available": out.available = true; break;
      case "--mine": out.mine = true; break;
      case "--help": case "-h":
        console.log("Usage: pnpm missions:list [--status <s>] [--priority <p>] [--available] [--mine]");
        process.exit(0);
    }
  }
  return out;
}

function field(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^["'](.+)["']$/, "$1");
}

function listField(raw: string, key: string): string[] {
  const m = raw.match(new RegExp(`^${key}:\\s*(\\[\\]|\\n)`, "m"));
  if (!m) return [];
  if (m[1] === "[]") return [];
  // Multi-line list — collect indented entries until next non-indented key.
  const startIdx = raw.indexOf(m[0]) + m[0].length;
  const rest = raw.slice(startIdx).split("\n");
  const items: string[] = [];
  for (const line of rest) {
    if (line.startsWith("  - ")) items.push(line.slice(4).trim());
    else if (line.match(/^[a-z_]+:/)) break;
  }
  return items;
}

function readMission(file: string): Mission | null {
  const path = join(MISSIONS_DIR, file);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const fmEnd = raw.indexOf("\n---\n", 4);
  if (fmEnd < 0) return null;
  const fm = raw.slice(0, fmEnd);
  const id = field(fm, "id") ?? file.replace(/\.md$/, "");
  return {
    id,
    title: field(fm, "title") ?? "(no title)",
    status: field(fm, "status") ?? "?",
    priority: field(fm, "priority") ?? "medium",
    claimedBy: ((v) => v && !["~", "null", ""].includes(v) ? v : null)(field(fm, "claimed_by")),
    claimedAt: ((v) => v && !["~", "null", ""].includes(v) ? v : null)(field(fm, "claimed_at")),
    paths: listField(fm, "paths"),
    file,
  };
}

function defaultSessionId(): string {
  if (process.env.SOPHIA_SESSION) return process.env.SOPHIA_SESSION;
  try {
    const email = execSync("git config user.email", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const today = new Date().toISOString().slice(0, 10);
    return `${email.split("@")[0]}-${today}`;
  } catch (err) {
    console.warn(`[missions-list] Failed to get git user email: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

function statusEmoji(s: string): string {
  switch (s) {
    case "done": return "✅";
    case "in-progress": return "🔄";
    case "claimed": return "🔒";
    case "queued": case "planned": return "📋";
    case "deferred": return "⏸ ";
    default: return "❓";
  }
}

function priorityEmoji(p: string): string {
  switch (p) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "medium": return "🟡";
    case "low": return "⚪";
    default: return "  ";
  }
}

function main(): void {
  const args = parseArgs();
  if (!existsSync(MISSIONS_DIR)) {
    console.error(`[missions:list] no mission directory at ${MISSIONS_DIR}`);
    console.error("  Run `pnpm missions:sync` first.");
    process.exit(2);
  }
  const files = readdirSync(MISSIONS_DIR).filter((f) => /^kingdom-\d+\.md$/.test(f));
  let missions = files.map(readMission).filter((m): m is Mission => m !== null);

  // Filters
  if (args.status) missions = missions.filter((m) => m.status === args.status);
  if (args.priority) missions = missions.filter((m) => m.priority === args.priority);
  if (args.available) missions = missions.filter((m) => (m.status === "queued" || m.status === "planned") && !m.claimedBy);
  if (args.mine) {
    const me = defaultSessionId();
    missions = missions.filter((m) => m.claimedBy && (m.claimedBy === me || m.claimedBy.startsWith(me.split("-")[0])));
  }

  // Sort: status, then priority, then id
  missions.sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  if (missions.length === 0) {
    console.log("No missions matching filter.");
    return;
  }

  // Group by status for printing
  const byStatus: Record<string, Mission[]> = {};
  for (const m of missions) {
    if (!byStatus[m.status]) byStatus[m.status] = [];
    byStatus[m.status].push(m);
  }

  for (const status of Object.keys(byStatus).sort((a, b) => (STATUS_ORDER[a] ?? 99) - (STATUS_ORDER[b] ?? 99))) {
    console.log("");
    console.log(`${statusEmoji(status)} ${status.toUpperCase()} (${byStatus[status].length})`);
    console.log("─".repeat(80));
    for (const m of byStatus[status]) {
      const claim = m.claimedBy ? `  🔒 ${m.claimedBy}` : "";
      const title = m.title.length > 60 ? m.title.slice(0, 57) + "..." : m.title;
      console.log(`  ${priorityEmoji(m.priority)} ${m.id.padEnd(13)} ${title}${claim}`);
    }
  }
  console.log("");
  console.log(`Total: ${missions.length} mission${missions.length === 1 ? "" : "s"}`);
}

main();
