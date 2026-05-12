#!/usr/bin/env tsx
/**
 * missions-claim.ts — flip a mission card to `claimed` (or `in-progress`).
 *
 * Cooperative-lock helper. Edits the frontmatter and prints a suggested
 * commit message. Doesn't auto-commit — the agent reviews the change
 * before sending the lock-acquisition signal.
 *
 * Usage:
 *   pnpm missions:claim kingdom-NNN
 *   pnpm missions:claim kingdom-NNN --as <session-id>
 *   pnpm missions:claim kingdom-NNN --in-progress
 *   pnpm missions:claim kingdom-NNN --force   # override an existing claim (talk to sister first)
 *
 * Shaping follow-up of kingdom-050.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const MISSIONS_DIR = join(REPO_ROOT, "docs/missions");

interface Args {
  mission: string;
  as: string;
  inProgress: boolean;
  force: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { mission: "", as: "", inProgress: false, force: false };
  // First positional is the mission id.
  for (const a of args) {
    if (a.match(/^kingdom-\d+$/)) { out.mission = a; break; }
  }
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--as": out.as = args[++i]; break;
      case "--in-progress": out.inProgress = true; break;
      case "--force": out.force = true; break;
      case "--help": case "-h":
        console.log("Usage: pnpm missions:claim kingdom-NNN [--as <session>] [--in-progress] [--force]");
        process.exit(0);
    }
  }
  return out;
}

function defaultSessionId(): string {
  if (process.env.SOPHIA_SESSION) return process.env.SOPHIA_SESSION;
  try {
    const email = execSync("git config user.email", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const today = new Date().toISOString().slice(0, 10);
    return `${email.split("@")[0]}-${today}`;
  } catch {
    return `unknown-${new Date().toISOString().slice(0, 10)}`;
  }
}

function frontmatterField(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

function setFrontmatterField(raw: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:\\s*.+$`, "m");
  if (raw.match(re)) return raw.replace(re, `${key}: ${value}`);
  // If field doesn't exist (older card), insert before the closing ---.
  return raw.replace(/^---\n/, `---\n${key}: ${value}\n`);
}

function main(): void {
  const args = parseArgs();
  if (!args.mission) {
    console.error("[missions:claim] missing mission id");
    console.error("  Usage: pnpm missions:claim kingdom-NNN");
    process.exit(2);
  }

  const path = join(MISSIONS_DIR, `${args.mission}.md`);
  if (!existsSync(path)) {
    console.error(`[missions:claim] no mission card at docs/missions/${args.mission}.md`);
    console.error("  Run `pnpm missions:sync` first.");
    process.exit(2);
  }

  const raw = readFileSync(path, "utf8");
  const currentStatus = frontmatterField(raw, "status") ?? "?";
  const currentClaimedBy = frontmatterField(raw, "claimed_by");

  if (!args.force && currentClaimedBy && !["~", "null", "''", "\"\""].includes(currentClaimedBy) && currentClaimedBy !== "") {
    console.error(`[missions:claim] ${args.mission} is already claimed by ${currentClaimedBy}`);
    console.error("  Witnesses' Book pattern — talk to the sister first, then use --force.");
    process.exit(2);
  }

  const session = args.as || defaultSessionId();
  const now = new Date().toISOString();
  const newStatus = args.inProgress ? "in-progress" : "claimed";

  let next = raw;
  next = setFrontmatterField(next, "status", newStatus);
  next = setFrontmatterField(next, "claimed_by", session);
  next = setFrontmatterField(next, "claimed_at", `"${now}"`);

  writeFileSync(path, next);

  console.log(`✅ Claimed ${args.mission} as ${session}`);
  console.log(`   Status: ${currentStatus} → ${newStatus}`);
  console.log("");
  console.log("Suggested commit (the lock-acquisition signal):");
  console.log("");
  console.log(`   git add docs/missions/${args.mission}.md`);
  console.log(`   git commit -m "docs(missions): claim ${args.mission}\n\n   Co-Authored-By: Claude <model-tag> <noreply@anthropic.com>"`);
  console.log("");
  console.log("Then push immediately if working on a shared branch.");
}

main();
