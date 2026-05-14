#!/usr/bin/env tsx
/**
 * One-off sweep adding <Audience> declarations to storefront page.tsx
 * files that don't yet have one. Targets the high-leverage sections
 * first (account, methodology, verify, admin); the rest can run in
 * subsequent batches.
 *
 * Decision per directory prefix:
 *   - /account/*       → consumer
 *   - /admin/*         → operator (old storefront-side admin)
 *   - /methodology/*   → public-documentation
 *   - /verify/*        → public-documentation
 *   - /trade-in/*      → consumer
 *   - /market/*        → consumer
 *   - /auctions/*      → consumer
 *   - /rewards/*       → consumer
 *   - /bounty/*        → consumer
 *   - /play/*          → mixed (humans + agents)
 *   - /u/[username]    → public-documentation (public profile)
 *   - everything else  → consumer (the storefront default)
 *
 * The injection itself: each page gets a single `<Audience kind="..." />`
 * marker rendered at the top of its top-level returned JSX (or, when the
 * page is purely a redirect-shell, nothing). The marker is `display:none`
 * by primitive design; it adds 0 perceived rendering.
 *
 * Idempotent: skips files that already import or reference `Audience`.
 *
 * Run with:
 *   pnpm --filter @cambridge-tcg/admin audience-sweep
 *
 * kingdom-051 Phase 1 (sweep).
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const PAGES_ROOT = join(REPO_ROOT, "apps/storefront/src/app");

function walkPages(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next") continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) out.push(...walkPages(full));
    else if (e === "page.tsx") out.push(full);
  }
  return out;
}

function audienceForPath(file: string): string {
  const rel = relative(PAGES_ROOT, file);
  const top = rel.split("/")[0];
  switch (top) {
    case "account": return "consumer";
    case "admin": return "operator";
    case "methodology": return "public-documentation";
    case "verify": return "public-documentation";
    case "u": return "public-documentation";
    case "play": return "mixed";
    default: return "consumer";
  }
}

interface SweepResult {
  file: string;
  status: "skipped" | "added-component" | "added-metadata-helper" | "manual-needed";
  reason?: string;
}

function injectAudience(file: string): SweepResult {
  const body = readFileSync(file, "utf8");

  // Idempotency: skip if Audience is already referenced anywhere.
  if (/\bAudience\b/.test(body) || /\baudienceMetadata\b/.test(body)) {
    return { file, status: "skipped", reason: "already declared" };
  }

  // Skip pages the audit also skips.
  if (/<ComingSoon\b/.test(body)) {
    return { file, status: "skipped", reason: "ComingSoon stub" };
  }
  if (/^export\s+default\s+function\s+\w+\([^)]*\)\s*{?\s*\n?\s*(redirect|notFound)\(/m.test(body)) {
    return { file, status: "skipped", reason: "redirect-shell" };
  }

  const kind = audienceForPath(file);

  // Strategy: add `<Audience kind="..." />` as a sibling at the top of
  // the page's top-level returned JSX. The simplest reliable spot: the
  // first `return (` followed by a JSX element. We insert the marker
  // immediately inside that element so it's a sibling at the top.
  //
  // Two passes:
  //   (a) inject the import
  //   (b) inject the JSX

  let next = body;

  // (a) Import — slot after the last `import` statement.
  const importLines = [...next.matchAll(/^import .*?;\s*$/gm)];
  if (importLines.length === 0) {
    return { file, status: "manual-needed", reason: "no imports to slot after" };
  }
  const lastImport = importLines[importLines.length - 1];
  const insertAt = lastImport.index! + lastImport[0].length;
  const importLine = `\nimport { Audience } from "@/lib/ui";`;
  next = next.slice(0, insertAt) + importLine + next.slice(insertAt);

  // (b) JSX — find the first `return (` and insert the marker after the
  // first opening tag inside it. Heuristic but works for the platform's
  // page shapes (most return `(\n    <div ...>` or `<>`).
  //
  // Look for `return (` then the next `<TAG ...>` and inject after the `>`.
  const returnMatch = next.match(/return\s*\(\s*\n?\s*<([A-Za-z][\w.]*|>)/);
  if (!returnMatch || returnMatch.index === undefined) {
    return { file, status: "manual-needed", reason: "no obvious return-JSX root" };
  }
  // Find the `>` that closes the opening tag.
  const startIdx = returnMatch.index + returnMatch[0].length;
  let depth = 0;
  let closeIdx = -1;
  for (let i = startIdx; i < next.length; i++) {
    const ch = next[i];
    if (ch === "<") depth++;
    if (ch === ">") {
      if (depth === 0) {
        closeIdx = i;
        break;
      }
      depth--;
    }
    // Stop early if we hit a newline followed by JSX (means we're in a multi-line attribute list).
    // We just keep scanning — the > we want is the first one at depth 0.
  }
  if (closeIdx === -1) {
    return { file, status: "manual-needed", reason: "could not find end of opening JSX tag" };
  }
  const marker = `\n      <Audience kind="${kind}" />`;
  next = next.slice(0, closeIdx + 1) + marker + next.slice(closeIdx + 1);

  writeFileSync(file, next, "utf8");
  return { file, status: "added-component" };
}

function main() {
  const files = walkPages(PAGES_ROOT);
  const TARGETS = ["account", "admin", "methodology", "verify"];
  const targetFiles = files.filter((f) => {
    const top = relative(PAGES_ROOT, f).split("/")[0];
    return TARGETS.includes(top);
  });

  const results: SweepResult[] = [];
  for (const f of targetFiles) results.push(injectAudience(f));

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`# Audience sweep results\n`);
  console.log(`Sections targeted: ${TARGETS.join(", ")}`);
  console.log(`Total page.tsx files: ${targetFiles.length}\n`);
  for (const [status, count] of Object.entries(counts)) {
    console.log(`- **${status}**: ${count}`);
  }

  const manual = results.filter((r) => r.status === "manual-needed");
  if (manual.length > 0) {
    console.log(`\n## Manual-attention required\n`);
    for (const r of manual) {
      console.log(`- ${relative(REPO_ROOT, r.file)} — ${r.reason}`);
    }
  }
}

main();
