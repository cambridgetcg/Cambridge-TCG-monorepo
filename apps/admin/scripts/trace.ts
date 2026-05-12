#!/usr/bin/env tsx
/**
 * trace.ts — auto-emit an autonomous-trace block ready to paste into
 * docs/connections/the-pillow-book.md.
 *
 * Reduces the friction of doing the right thing: an autonomous agent
 * finishing a mission runs `pnpm trace --mission kingdom-NNN --verb done`
 * and gets a pre-filled markdown block with current audit counts, file-
 * diff stat, model tag, and the canonical template shape.
 *
 * The one thing the agent has to add manually: the sentence-of-meaning.
 * That irreducible human part is the point — the script can do
 * everything else, but the meaning is the agent's to write.
 *
 * Shaping follow-up of kingdom-050.
 * See docs/connections/the-pillow-book.md#autonomous-trace--template.
 *
 * Usage:
 *   pnpm trace --mission kingdom-049 --verb done [--verify pass|fail] [--base origin/main]
 */

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const STATE_MD = join(REPO_ROOT, "docs/state.md");

interface Args {
  mission: string;
  verb: "claimed" | "worked" | "done" | "abandoned";
  verify: string;
  base: string;
  model: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {
    mission: "",
    verb: "worked",
    verify: "unknown",
    base: "origin/main",
    model: process.env.SOPHIA_MODEL || "Opus 4.7 (1M context)",
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const val = args[i + 1];
    switch (flag) {
      case "--mission": out.mission = val; i++; break;
      case "--verb":
        if (!["claimed", "worked", "done", "abandoned"].includes(val)) {
          console.error(`[trace] invalid --verb: ${val}. Choose: claimed | worked | done | abandoned`);
          process.exit(2);
        }
        out.verb = val as Args["verb"]; i++; break;
      case "--verify": out.verify = val; i++; break;
      case "--base": out.base = val; i++; break;
      case "--model": out.model = val; i++; break;
      case "--help": case "-h":
        console.log("Usage: pnpm trace --mission kingdom-NNN --verb [claimed|worked|done|abandoned] [--verify pass|fail] [--base origin/main] [--model 'model-tag']");
        process.exit(0);
    }
  }
  if (!out.mission) {
    console.error("[trace] --mission kingdom-NNN required");
    console.error("  Usage: pnpm trace --mission kingdom-NNN --verb done");
    process.exit(2);
  }
  return out;
}

interface AuditCounts {
  honesty: number;
  transparency: number;
  pricing: number;
  creation: number;
  staleAgeMin: number | null;
}

function readAuditCounts(): AuditCounts {
  const out: AuditCounts = {
    honesty: -1, transparency: -1, pricing: -1, creation: -1, staleAgeMin: null,
  };
  if (!existsSync(STATE_MD)) return out;
  const raw = readFileSync(STATE_MD, "utf8");
  const m = (re: RegExp) => {
    const match = raw.match(re);
    return match ? parseInt(match[1], 10) : -1;
  };
  out.honesty = m(/Substrate honesty.*?\|\s*(\d+)\s*\|/s);
  out.transparency = m(/Transparency.*?\|\s*(\d+)\s*\|/s);
  out.pricing = m(/Pricing consolidation.*?\|\s*(\d+)\s*\|/s);
  out.creation = m(/Creation.*?\|\s*(\d+)\s*\|/s);
  const tsMatch = raw.match(/Generated:\*?\s*`([^`]+)`/);
  if (tsMatch) {
    const generated = new Date(tsMatch[1]).getTime();
    if (!Number.isNaN(generated)) {
      out.staleAgeMin = Math.round((Date.now() - generated) / 60_000);
    }
  }
  return out;
}

interface DiffStat {
  files: number;
  insertions: number;
  deletions: number;
  commits: number;
}

function readDiffStat(base: string): DiffStat {
  const out: DiffStat = { files: 0, insertions: 0, deletions: 0, commits: 0 };
  try {
    const stat = execSync(`git diff --shortstat ${base}...HEAD`, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const m = stat.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (m) {
      out.files = parseInt(m[1], 10);
      out.insertions = parseInt(m[2] || "0", 10);
      out.deletions = parseInt(m[3] || "0", 10);
    }
    out.commits = parseInt(execSync(`git rev-list --count ${base}..HEAD`, { cwd: REPO_ROOT, encoding: "utf8" }).trim(), 10);
  } catch {/* base ref missing or not a repo */}
  return out;
}

function readSessionId(): string {
  // Cooperative session-id: prefer env, fall back to git config user.email + ISO date.
  if (process.env.SOPHIA_SESSION) return process.env.SOPHIA_SESSION;
  try {
    const email = execSync("git config user.email", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const today = new Date().toISOString().slice(0, 10);
    return `${email.split("@")[0]}-${today}`;
  } catch {
    return `unknown-${new Date().toISOString().slice(0, 10)}`;
  }
}

function statusChange(verb: Args["verb"]): string {
  switch (verb) {
    case "claimed": return "`queued` → `claimed`";
    case "worked": return "`in-progress` (no status change)";
    case "done": return "`in-progress` → `done`";
    case "abandoned": return "`claimed`/`in-progress` → `queued`";
  }
}

function main(): void {
  const args = parseArgs();
  const audits = readAuditCounts();
  const diff = readDiffStat(args.base);
  const session = readSessionId();

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16);

  const lines: string[] = [];
  lines.push(`## ${date} ${time} UTC — ${args.mission} ${args.verb} (autonomous, ${args.model})`);
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Mission | \`${args.mission}\` |`);
  lines.push(`| Session | \`${session}\` |`);
  lines.push(`| Status change | ${statusChange(args.verb)} |`);
  lines.push(`| Files touched | ${diff.files} file${diff.files === 1 ? "" : "s"} (${diff.commits} commit${diff.commits === 1 ? "" : "s"}, +${diff.insertions} −${diff.deletions} vs \`${args.base}\`) |`);
  lines.push(`| Verify | ${args.verify} |`);
  const audit = `honesty=${audits.honesty} transparency=${audits.transparency} pricing=${audits.pricing} creation=${audits.creation}`;
  const stale = audits.staleAgeMin !== null && audits.staleAgeMin > 60
    ? ` *(state.md is ${audits.staleAgeMin}m stale — run \`pnpm state:snapshot\` and re-emit if numbers changed)*`
    : "";
  lines.push(`| Audits | ${audit}${stale} |`);
  lines.push(`| Sister conflicts | _(fill: none, or one-line description)_ |`);
  lines.push("");
  lines.push("*One sentence — what this kingdom moved, in plain language. **The script can't write this for you.***");
  lines.push("");
  lines.push(`*— Sophia (autonomous, ${args.model}), ${date}.*`);
  lines.push("");

  console.log(lines.join("\n"));

  // Hint to stderr so the agent knows what to do next.
  console.error("");
  console.error("─────────────────────────────────────────────────────────────");
  console.error("Append the above block to docs/connections/the-pillow-book.md");
  console.error("(after the last `---` separator before the conventions section).");
  console.error("Fill the sentence-of-meaning. The script left it as a stub on purpose.");
  console.error("─────────────────────────────────────────────────────────────");
}

main();
