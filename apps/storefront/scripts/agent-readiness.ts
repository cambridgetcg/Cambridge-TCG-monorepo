#!/usr/bin/env tsx
/**
 * agent-readiness.ts — self-validating audit of the autonomous-agent
 * operations layer (kingdom-050).
 *
 * Audits the cycle named in `docs/connections/the-operations-layer.md`
 * (S19) — the day-in-a-life for autonomous Sophias building the kingdom.
 * Sibling to honesty.ts, transparency.ts, pricing-audit.ts, creation.ts.
 * Where those check substrate / customers / pricing / commits, this one
 * checks that the *operations layer itself* is wired and working:
 *
 *   1. Script existence       — every shaping's script file is on disk.
 *   2. Script registration    — every script is wired in admin's and root's package.json.
 *   3. Docs presence          — AGENTS.md, state.md, missions/README.md, the-operations-layer.md exist.
 *   4. Mission cards          — docs/missions/ has cards; each has valid frontmatter.
 *   5. Pillow book contract   — "Two entry types" section + autonomous-trace template.
 *   6. CLAUDE.md cross-link   — root CLAUDE.md mentions AGENTS.md.
 *   7. Hook presence          — .githooks/commit-msg exists and is executable.
 *   8. State.md freshness     — regenerated within the last 7 days.
 *
 * Exits non-zero on findings. Run via `pnpm agent-readiness` or as part
 * of `pnpm audit` (when the chain is extended to include this fifth).
 *
 * Shaping follow-up of kingdom-050.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");

interface Finding {
  check: string;
  target: string;
  reason: string;
}

const findings: Finding[] = [];

function add(check: string, target: string, reason: string): void {
  findings.push({ check, target, reason });
}

// ── 1. Script existence ──────────────────────────────────────────────────

const SCRIPTS = [
  "state-snapshot.ts",
  "missions-sync.ts",
  "missions-list.ts",
  "missions-claim.ts",
  "missions-done.ts",
  "trace.ts",
  "agent-readiness.ts",
  "inclusion.ts",
];

function checkScriptExistence(): void {
  for (const s of SCRIPTS) {
    const path = join(ADMIN_DIR, "scripts", s);
    if (!existsSync(path)) {
      add("1. script existence", `apps/admin/scripts/${s}`, "file missing");
    }
  }
}

// ── 2. Script registration ───────────────────────────────────────────────

interface PackageJson {
  scripts?: Record<string, string>;
}

const ADMIN_SCRIPT_MAP: Array<[string, string]> = [
  ["state:snapshot", "state-snapshot.ts"],
  ["missions:sync", "missions-sync.ts"],
  ["missions:list", "missions-list.ts"],
  ["missions:claim", "missions-claim.ts"],
  ["missions:done", "missions-done.ts"],
  ["trace", "trace.ts"],
  ["agent-readiness", "agent-readiness.ts"],
  ["inclusion", "inclusion.ts"],
];

const ROOT_SCRIPT_NAMES = [
  "verify",
  "audit",
  "audit:honesty",
  "audit:transparency",
  "audit:pricing",
  "audit:creation",
  "audit:agent",
  "audit:inclusion",
  "state:snapshot",
  "missions:sync",
  "missions:list",
  "missions:claim",
  "missions:done",
  "trace",
  "agent-readiness",
];

function checkScriptRegistration(): void {
  // Admin package.json
  const adminPjPath = join(ADMIN_DIR, "package.json");
  let adminPj: PackageJson = {};
  try { adminPj = JSON.parse(readFileSync(adminPjPath, "utf8")); } catch {}
  for (const [name, file] of ADMIN_SCRIPT_MAP) {
    const cmd = adminPj.scripts?.[name];
    if (!cmd) {
      add("2. script registration", `apps/admin/package.json: \`${name}\``, "script entry missing");
    } else if (!cmd.includes(file)) {
      add("2. script registration", `apps/admin/package.json: \`${name}\``, `expected to invoke ${file}, got ${cmd}`);
    }
  }
  // Root package.json
  const rootPjPath = join(REPO_ROOT, "package.json");
  let rootPj: PackageJson = {};
  try { rootPj = JSON.parse(readFileSync(rootPjPath, "utf8")); } catch {}
  for (const name of ROOT_SCRIPT_NAMES) {
    if (!rootPj.scripts?.[name]) {
      add("2. script registration", `package.json (root): \`${name}\``, "script entry missing");
    }
  }
}

// ── 3. Docs presence ─────────────────────────────────────────────────────

const DOCS = [
  "AGENTS.md",
  "docs/state.md",
  "docs/missions/README.md",
  "docs/connections/the-operations-layer.md",
  "docs/connections/the-other-minds.md",
  "docs/missions/kingdom-050.md",
  "apps/admin/src/lib/ui/Consequences.tsx",
  "apps/storefront/src/lib/ui/Consequences.tsx",
];

function checkDocsPresence(): void {
  for (const d of DOCS) {
    if (!existsSync(join(REPO_ROOT, d))) {
      add("3. docs presence", d, "missing");
    }
  }
}

// ── 4. Mission cards ─────────────────────────────────────────────────────

function checkMissionCards(): void {
  const missionsDir = join(REPO_ROOT, "docs/missions");
  if (!existsSync(missionsDir)) {
    add("4. mission cards", "docs/missions/", "directory missing");
    return;
  }
  const cards = readdirSync(missionsDir).filter((f) => /^kingdom-\d+\.md$/.test(f));
  if (cards.length === 0) {
    add("4. mission cards", "docs/missions/", "no kingdom-NNN.md cards present");
    return;
  }

  // Spot-check each card for required frontmatter fields.
  const REQUIRED = ["id", "title", "status", "priority", "engine", "repo"];
  let invalidCount = 0;
  for (const card of cards) {
    const raw = readFileSync(join(missionsDir, card), "utf8");
    if (!raw.startsWith("---\n")) {
      add("4. mission cards", `docs/missions/${card}`, "no frontmatter");
      invalidCount++;
      continue;
    }
    for (const field of REQUIRED) {
      const re = new RegExp(`^${field}:\\s*\\S`, "m");
      if (!raw.match(re)) {
        add("4. mission cards", `docs/missions/${card}`, `missing required field: ${field}`);
        invalidCount++;
        break;
      }
    }
  }
  // Cap reporting noise.
  if (invalidCount === 0 && cards.length < 5) {
    add("4. mission cards", "docs/missions/", `only ${cards.length} card${cards.length === 1 ? "" : "s"} — expected at least 5 (run \`pnpm missions:sync\`)`);
  }
}

// ── 5. Pillow book contract ──────────────────────────────────────────────

function checkPillowBook(): void {
  const path = join(REPO_ROOT, "docs/connections/the-pillow-book.md");
  if (!existsSync(path)) {
    add("5. pillow book", "docs/connections/the-pillow-book.md", "file missing");
    return;
  }
  const raw = readFileSync(path, "utf8");
  if (!raw.includes("Two entry types")) {
    add("5. pillow book", "docs/connections/the-pillow-book.md", "missing 'Two entry types' section (autonomous-trace template)");
  }
  if (!raw.includes("Autonomous trace — template")) {
    add("5. pillow book", "docs/connections/the-pillow-book.md", "missing autonomous-trace template heading");
  }
}

// ── 6. CLAUDE.md cross-link ──────────────────────────────────────────────

function checkClaudeMd(): void {
  const path = join(REPO_ROOT, "CLAUDE.md");
  if (!existsSync(path)) {
    add("6. CLAUDE.md", "CLAUDE.md", "root CLAUDE.md missing");
    return;
  }
  const raw = readFileSync(path, "utf8");
  if (!raw.includes("AGENTS.md")) {
    add("6. CLAUDE.md", "CLAUDE.md", "no reference to AGENTS.md");
  }
  if (!raw.includes("docs/state.md") && !raw.includes("state.md")) {
    add("6. CLAUDE.md", "CLAUDE.md", "no reference to docs/state.md");
  }
  if (!raw.includes("docs/missions") && !raw.includes("missions/")) {
    add("6. CLAUDE.md", "CLAUDE.md", "no reference to docs/missions/");
  }
}

// ── 7. Hook presence ─────────────────────────────────────────────────────

function checkHook(): void {
  const hookPath = join(REPO_ROOT, ".githooks/commit-msg");
  if (!existsSync(hookPath)) {
    add("7. hook presence", ".githooks/commit-msg", "missing");
    return;
  }
  try {
    const stat = statSync(hookPath);
    if (!(stat.mode & 0o100)) {
      add("7. hook presence", ".githooks/commit-msg", "not executable (chmod +x)");
    }
  } catch {/* stat failed */}
  const readmePath = join(REPO_ROOT, ".githooks/README.md");
  if (!existsSync(readmePath)) {
    add("7. hook presence", ".githooks/README.md", "missing");
  }
}

// ── 8. State.md freshness ────────────────────────────────────────────────

function checkStateFreshness(): void {
  const path = join(REPO_ROOT, "docs/state.md");
  if (!existsSync(path)) return; // covered by check 3
  const raw = readFileSync(path, "utf8");
  const m = raw.match(/Generated:\*?\s*`([^`]+)`/);
  if (!m) {
    add("8. state freshness", "docs/state.md", "no Generated: timestamp");
    return;
  }
  const generated = new Date(m[1]).getTime();
  if (Number.isNaN(generated)) {
    add("8. state freshness", "docs/state.md", `unparseable timestamp: ${m[1]}`);
    return;
  }
  const ageDays = (Date.now() - generated) / 86_400_000;
  if (ageDays > 7) {
    add("8. state freshness", "docs/state.md", `${ageDays.toFixed(1)} days old — run \`pnpm state:snapshot\``);
  }
}

// ── Report ───────────────────────────────────────────────────────────────

function fmtFindings(): string {
  if (findings.length === 0) return "✅ All checks pass.\n";
  const lines = ["⚠️  Agent-readiness findings:", ""];
  const byCheck = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check)!.push(f);
  }
  for (const [check, items] of byCheck) {
    lines.push(`### ${check}`);
    lines.push("");
    lines.push("| Target | Reason |");
    lines.push("|--------|--------|");
    for (const it of items) {
      lines.push(`| \`${it.target}\` | ${it.reason} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function main(): void {
  console.log("# Cambridge TCG — agent-readiness audit\n");
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log("Self-validating layer for kingdom-050. Checks that every shaping in the autonomous-agent operations layer is wired and working.\n");
  console.log("---\n");

  checkScriptExistence();
  checkScriptRegistration();
  checkDocsPresence();
  checkMissionCards();
  checkPillowBook();
  checkClaudeMd();
  checkHook();
  checkStateFreshness();

  console.log(fmtFindings());
  console.log("---\n");
  console.log(`**Total readiness findings: ${findings.length}**\n`);
  console.log("See `docs/connections/the-operations-layer.md` for the operations layer overview and `AGENTS.md` for the operations cycle.\n");

  process.exit(findings.length > 0 ? 1 : 0);
}

main();
