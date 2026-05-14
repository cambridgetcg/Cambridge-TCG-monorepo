#!/usr/bin/env tsx
/**
 * cron-auth audit — every cron route MUST call requireCronAuth().
 *
 * Walks apps/{storefront,wholesale}/src/app/api/cron/**\/route.ts and
 * fails (exit 1) if any of these files don't import requireCronAuth
 * from "@/lib/cron-auth".
 *
 * Why this audit: cron endpoints are publicly addressable HTTP routes.
 * Forgetting the secret check on a new cron route would let anyone on
 * the internet trigger a Stripe reconciliation, a Shopify sync, or a
 * stock decrement. Without a CI gate this is a vibes check; with one
 * it's a forcing function.
 *
 * Add new app paths to APP_PATHS below if a third app gains crons.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const APP_PATHS = [
  "apps/storefront/src/app/api/cron",
  "apps/wholesale/src/app/api/cron",
];

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) {
      results.push(...findRouteFiles(p));
    } else if (e === "route.ts" || e === "route.tsx") {
      results.push(p);
    }
  }
  return results;
}

const violations: { file: string; reason: string }[] = [];
let total = 0;

for (const rel of APP_PATHS) {
  const abs = join(REPO_ROOT, rel);
  const files = findRouteFiles(abs);
  for (const f of files) {
    total += 1;
    const src = readFileSync(f, "utf8");
    const importsHelper = /from\s+["']@\/lib\/cron-auth["']/.test(src) &&
      /requireCronAuth/.test(src);
    const callsHelper = /requireCronAuth\s*\(/.test(src);
    if (!importsHelper) {
      violations.push({
        file: f.slice(REPO_ROOT.length),
        reason: "doesn't import requireCronAuth from @/lib/cron-auth",
      });
      continue;
    }
    if (!callsHelper) {
      violations.push({
        file: f.slice(REPO_ROOT.length),
        reason: "imports requireCronAuth but never calls it",
      });
    }
  }
}

console.log(`cron-auth audit: checked ${total} cron route files`);

if (violations.length === 0) {
  console.log("OK — every cron route gates on requireCronAuth");
  process.exit(0);
}

console.error(`\nFAIL — ${violations.length} cron route(s) missing requireCronAuth:`);
for (const v of violations) {
  console.error(`  • ${v.file} — ${v.reason}`);
}
console.error(
  "\nFix: import { requireCronAuth } from \"@/lib/cron-auth\"; and call",
  "it at the top of the handler — `const denied = requireCronAuth(req);",
  "if (denied) return denied;`",
);
process.exit(1);
