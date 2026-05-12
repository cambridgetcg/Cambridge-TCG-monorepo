#!/usr/bin/env tsx
/**
 * missions-done.ts — flip a mission card to `done`.
 *
 * Edits the frontmatter (status: done, completed_at: now) and prints a
 * suggested commit message + a hint to run `pnpm trace`. Doesn't
 * auto-commit.
 *
 * Usage:
 *   pnpm missions:done kingdom-NNN
 *   pnpm missions:done kingdom-NNN --keep-claim    # keep claimed_by/at for traceability
 *
 * Shaping follow-up of kingdom-050.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const MISSIONS_DIR = join(REPO_ROOT, "docs/missions");

interface Args {
  mission: string;
  keepClaim: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { mission: "", keepClaim: false };
  for (const a of args) {
    if (a.match(/^kingdom-\d+$/)) { out.mission = a; break; }
  }
  for (const a of args) {
    if (a === "--keep-claim") out.keepClaim = true;
    if (a === "--help" || a === "-h") {
      console.log("Usage: pnpm missions:done kingdom-NNN [--keep-claim]");
      process.exit(0);
    }
  }
  return out;
}

function setFrontmatterField(raw: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:\\s*.+$`, "m");
  if (raw.match(re)) return raw.replace(re, `${key}: ${value}`);
  return raw.replace(/^---\n/, `---\n${key}: ${value}\n`);
}

function frontmatterField(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

function main(): void {
  const args = parseArgs();
  if (!args.mission) {
    console.error("[missions:done] missing mission id");
    console.error("  Usage: pnpm missions:done kingdom-NNN");
    process.exit(2);
  }

  const path = join(MISSIONS_DIR, `${args.mission}.md`);
  if (!existsSync(path)) {
    console.error(`[missions:done] no mission card at docs/missions/${args.mission}.md`);
    process.exit(2);
  }

  const raw = readFileSync(path, "utf8");
  const currentStatus = frontmatterField(raw, "status") ?? "?";
  const now = new Date().toISOString();

  let next = raw;
  next = setFrontmatterField(next, "status", "done");
  next = setFrontmatterField(next, "completed_at", `"${now}"`);
  if (!args.keepClaim) {
    next = setFrontmatterField(next, "claimed_by", "~");
    next = setFrontmatterField(next, "claimed_at", "~");
  }

  writeFileSync(path, next);

  console.log(`✅ ${args.mission} → done`);
  console.log(`   Status: ${currentStatus} → done`);
  console.log(`   completed_at: ${now}`);
  if (!args.keepClaim) console.log("   claimed_by/at: cleared (use --keep-claim to preserve)");
  console.log("");
  console.log("Next steps:");
  console.log(`   1. \`pnpm verify\` — confirm the gate is green.`);
  console.log(`   2. \`pnpm state:snapshot\` — regenerate docs/state.md.`);
  console.log(`   3. \`pnpm trace --mission ${args.mission} --verb done --verify pass\` — emit pillow-book trace.`);
  console.log(`   4. Append the trace to docs/connections/the-pillow-book.md.`);
  console.log(`   5. Commit: \`docs(missions): kingdom-NNN → done\` with Co-Authored-By trailer.`);
  console.log("");
  console.log("Then reconcile to ~/Love/memory/dev-state.json (operator does this manually for now).");
}

main();
