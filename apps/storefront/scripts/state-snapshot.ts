#!/usr/bin/env tsx
/**
 * state-snapshot.ts — regenerate docs/state.md.
 *
 * Companion to honesty / transparency / pricing-audit. Where those emit
 * findings, this is the umbrella that names the *whole repo's* state in
 * one file: audit findings counts, kingdom-queue stats, git status, and
 * pointers to the canonical doctrines.
 *
 * Designed for autonomous Sophias: one command — `pnpm state:snapshot` —
 * regenerates the page; reading the page tells you what's currently true
 * across the repo without reading seven docs.
 *
 * Shaping 2 of the autonomous-agent reshaping (2026-05-11 evening).
 */

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const OUTPUT = join(REPO_ROOT, "docs/state.md");
const MISSIONS_DIR = join(REPO_ROOT, "docs/missions");

// ── Audits ───────────────────────────────────────────────────────────────

interface AuditResult {
  name: string;
  slug: string;
  findings: number;
  exitCode: number;
}

function runAudit(scriptName: string, label: string, slug: string, totalRegex: RegExp): AuditResult {
  const res = spawnSync("pnpm", [scriptName], {
    cwd: ADMIN_DIR,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = (res.stdout || "") + "\n" + (res.stderr || "");
  const match = output.match(totalRegex);
  const findings = match ? parseInt(match[1], 10) : -1;
  return { name: label, slug, findings, exitCode: res.status ?? -1 };
}

// ── Kingdom queue ────────────────────────────────────────────────────────

interface KingdomTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
}

interface KingdomStats {
  total: number;
  done: number;
  inProgress: number;
  planned: number;
  deferred: number;
  active: KingdomTask[];
  source: string;
  accessible: boolean;
}

function readKingdoms(): KingdomStats {
  const path = join(homedir(), "Love/memory/dev-state.json");
  const stats: KingdomStats = {
    total: 0, done: 0, inProgress: 0, planned: 0, deferred: 0,
    active: [], source: path, accessible: false,
  };
  if (!existsSync(path)) return stats;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    stats.accessible = true;
    const tcg = (data.tasks || []).filter((t: { engine?: string }) => t.engine === "tcg");
    stats.total = tcg.length;
    for (const t of tcg as KingdomTask[]) {
      switch (t.status) {
        case "done": stats.done++; break;
        case "in-progress":
          stats.inProgress++;
          stats.active.push({ id: t.id, title: t.title, status: t.status, priority: t.priority });
          break;
        case "planned": stats.planned++; break;
        case "deferred": stats.deferred++; break;
      }
    }
  } catch {/* parse failed */}
  return stats;
}

// ── In-repo missions ─────────────────────────────────────────────────────

interface InRepoMission {
  file: string;
  id: string;
}

function readInRepoMissions(): InRepoMission[] {
  if (!existsSync(MISSIONS_DIR)) return [];
  const out: InRepoMission[] = [];
  for (const e of readdirSync(MISSIONS_DIR)) {
    if (!e.endsWith(".md") || e === "README.md") continue;
    const m = e.match(/^(kingdom-\d+)\.md$/);
    if (m) out.push({ file: e, id: m[1] });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ── Git ──────────────────────────────────────────────────────────────────

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  lastCommit: string;
}

function readGit(): GitStatus {
  const out: GitStatus = { branch: "", ahead: 0, behind: 0, dirty: false, lastCommit: "" };
  try {
    out.branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const status = execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" });
    out.dirty = status.trim().length > 0;
    out.lastCommit = execSync("git log -1 --oneline", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    try {
      const counts = execSync(`git rev-list --left-right --count HEAD...origin/${out.branch}`, {
        cwd: REPO_ROOT, encoding: "utf8",
      }).trim().split(/\s+/);
      out.ahead = parseInt(counts[0], 10) || 0;
      out.behind = parseInt(counts[1], 10) || 0;
    } catch {/* no upstream */}
  } catch {/* not a git repo */}
  return out;
}

// ── Render ───────────────────────────────────────────────────────────────

function emoji(n: number): string {
  if (n < 0) return "❓";
  if (n === 0) return "✅";
  return "⚠️";
}

function main(): void {
  const ts = new Date().toISOString();

  const audits: AuditResult[] = [
    runAudit("honesty", "Substrate honesty", "honesty", /Total drift findings:\s*\*?\*?(\d+)/),
    runAudit("transparency", "Transparency", "transparency", /Total transparency-debt findings:\s*\*?\*?(\d+)/),
    runAudit("pricing", "Pricing consolidation", "pricing", /Total drift findings:\s*\*?\*?(\d+)/),
    runAudit("creation", "Creation (Will + Sophia traces)", "creation", /Total creation-debt findings:\s*\*?\*?(\d+)/),
    runAudit("agent-readiness", "Agent-readiness (operations layer)", "agent", /Total readiness findings:\s*\*?\*?(\d+)/),
    runAudit("inclusion", "Inclusion (the fifth scope)", "inclusion", /Total inclusion-debt findings:\s*\*?\*?(\d+)/),
  ];

  const kingdoms = readKingdoms();
  const inRepoMissions = readInRepoMissions();
  const git = readGit();

  const out: string[] = [];
  out.push("# Cambridge TCG — repo state snapshot");
  out.push("");
  out.push(`> *Generated:* \`${ts}\``);
  out.push(`> *Command:* \`pnpm state:snapshot\` (regenerate)`);
  out.push("");
  out.push("This page is **auto-generated**. Don't edit by hand — re-run the command. Reading this page tells you what's currently true across the repo without reading seven docs. Companion to `pnpm verify` (the *am I done?* gate).");
  out.push("");
  out.push("Shaping 2 of the autonomous-agent reshaping (2026-05-11 evening). For the full agent onboarding flow see [`AGENTS.md`](../AGENTS.md).");
  out.push("");
  out.push("---");
  out.push("");

  // Audits
  out.push("## Audit findings");
  out.push("");
  out.push("| Audit | Findings | Exit | Re-run |");
  out.push("|-------|----------|------|--------|");
  for (const a of audits) {
    const f = a.findings < 0 ? "n/a" : String(a.findings);
    out.push(`| ${emoji(a.findings)} ${a.name} | ${f} | ${a.exitCode} | \`pnpm audit:${a.slug}\` |`);
  }
  const totalFindings = audits.reduce((s, a) => s + Math.max(0, a.findings), 0);
  out.push("");
  out.push(`**Combined findings: ${totalFindings}**`);
  out.push("");
  out.push("Exit codes: `0` = green, `1` = findings, `2` = audit script crashed, `-1` = not parseable. Run `pnpm audit` to chain all three.");
  out.push("");
  out.push("---");
  out.push("");

  // Kingdom queue
  out.push("## Kingdom queue (TCG-engine tasks)");
  out.push("");
  if (!kingdoms.accessible) {
    out.push(`> ❓ Source not accessible at \`${kingdoms.source}\` from this session. State snapshot cannot count kingdoms.`);
    out.push(`>`);
    out.push(`> The kingdom queue lives in \`~/Love/memory/dev-state.json\` (per the Cowork → Love memory handoff). If you're in a sister daemon with no access to that file, read \`docs/missions/\` for the in-repo mirror.`);
    out.push("");
  } else {
    out.push(`| State | Count |`);
    out.push(`|-------|-------|`);
    out.push(`| Total | ${kingdoms.total} |`);
    out.push(`| ✅ Done | ${kingdoms.done} |`);
    out.push(`| 🔄 In progress | ${kingdoms.inProgress} |`);
    out.push(`| 📋 Planned | ${kingdoms.planned} |`);
    out.push(`| ⏸ Deferred | ${kingdoms.deferred} |`);
    out.push("");
    if (kingdoms.active.length) {
      out.push("**Currently in-progress:**");
      out.push("");
      for (const k of kingdoms.active) {
        const pri = k.priority ? ` *(${k.priority})*` : "";
        out.push(`- \`${k.id}\`${pri} — ${k.title}`);
      }
      out.push("");
    }
    out.push(`*Source of truth: \`${kingdoms.source}\`. In-repo mirror: \`docs/missions/\` (${inRepoMissions.length} card${inRepoMissions.length === 1 ? "" : "s"}).*`);
    out.push("");
  }
  out.push("---");
  out.push("");

  // Git
  out.push("## Git");
  out.push("");
  out.push(`- **Branch:** \`${git.branch || "(unknown)"}\``);
  out.push(`- **Last commit:** ${git.lastCommit || "(unknown)"}`);
  out.push(`- **Working tree:** ${git.dirty ? "🟡 dirty (uncommitted changes)" : "🟢 clean"}`);
  if (git.ahead || git.behind) {
    out.push(`- **vs origin:** ${git.ahead} ahead, ${git.behind} behind`);
  }
  out.push("");
  out.push("---");
  out.push("");

  // The doctrines + primitives
  out.push("## The four doctrines");
  out.push("");
  out.push("Every change is judged against these. They live at the repo root and travel session-to-session.");
  out.push("");
  out.push("1. [Substrate honesty](principles/substrate-honesty.md) — the artifact tells the truth about its own state.");
  out.push("2. [Transparency](principles/transparency.md) — the artifact tells users about its own decisions.");
  out.push("3. [Meaning](principles/meaning.md) — the artifact names what its modules mean to each other.");
  out.push("4. [Creation](principles/creation.md) — the artifact carries its origin truthfully.");
  out.push("");
  out.push("Companion audits: [`substrate-honesty-audit.md`](principles/substrate-honesty-audit.md), [`transparency-audit.md`](principles/transparency-audit.md), [`pricing-current-state.md`](pricing-current-state.md).");
  out.push("");
  out.push("---");
  out.push("");

  // Verify recipe
  out.push("## Verification commands");
  out.push("");
  out.push("```");
  out.push("pnpm typecheck       # type-check all apps + packages");
  out.push("pnpm audit           # honesty + transparency + pricing-audit (chained)");
  out.push("pnpm test:admin      # admin vitest suite");
  out.push("pnpm verify          # the three above, chained — the \"am I done?\" gate");
  out.push("pnpm smoke           # admin smoke (requires dev server running)");
  out.push("pnpm state:snapshot  # regenerate THIS file");
  out.push("```");
  out.push("");

  writeFileSync(OUTPUT, out.join("\n") + "\n");
  console.log(`Wrote ${OUTPUT}`);
  console.log(`  Audits: ${audits.map(a => `${a.name}=${a.findings}`).join(", ")}`);
  console.log(`  Kingdoms: ${kingdoms.accessible ? `${kingdoms.done}/${kingdoms.total} done, ${kingdoms.inProgress} in-progress, ${kingdoms.planned} planned` : "(inaccessible)"}`);
  console.log(`  Git: ${git.branch} ${git.dirty ? "(dirty)" : "(clean)"}${git.ahead || git.behind ? `, ${git.ahead} ahead / ${git.behind} behind` : ""}`);
}

main();
