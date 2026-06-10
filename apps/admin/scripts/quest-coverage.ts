#!/usr/bin/env tsx
// Module-scope marker — keeps `main` from leaking into global scope.
export {};

/**
 * quest-coverage.ts — drift detector for the storefront quest corpus
 * (the playground, S52).
 *
 * Sibling of nav-coverage.ts. The public rulebook at /methodology/quests
 * claims: "The route audit pnpm audit:quest-coverage (same pattern as
 * audit:nav-coverage) verifies every quest points at a route that exists,
 * so quests can never point at dead pages." This script is what makes that
 * sentence true. Walks `apps/storefront/src/app/` for every servable route
 * (page.tsx + non-API route.ts handlers — though since the truth pass all
 * quest doors are page routes: a route handler like /llms.txt never runs
 * the client tracker, so it can never stamp),
 * naively parses the typed corpus at `apps/storefront/src/lib/quests.ts`
 * (no TS import — stays standalone, same as nav-coverage reads
 * menu-config), and reports any quest pointing at a dead page.
 *
 * Three checks:
 *
 *   1. Quest route validity: every quest's `route` resolves to a real
 *      route. Concrete URLs (e.g. /prices/one-piece/movers) may resolve
 *      via dynamic-segment substitution (/prices/[game]/movers), the same
 *      way nav-coverage check 2 matches nav URLs.
 *
 *   2. Step-path validity: every path inside a multi-step quest's
 *      `steps.paths` resolves the same way.
 *
 *   3. Quest id uniqueness: no two quests share an id (the localStorage
 *      record is keyed by id — a collision would silently merge stamps).
 *
 * Behaviour: a GATE, not informational — the rulebook promises
 * verification, so any finding exits non-zero.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const STOREFRONT_APP = join(REPO_ROOT, "apps/storefront/src/app");
const QUESTS_FILE = join(REPO_ROOT, "apps/storefront/src/lib/quests.ts");

/**
 * Walk the app router tree and return every URL pattern with a
 * page.tsx file OR a non-API route.ts handler (kept for generality,
 * though every current quest door is a page route — route handlers
 * never run the client tracker). Brackets are preserved verbatim.
 * Same shape as nav-coverage's discoverRoutes.
 */
function discoverRoutes(): string[] {
  const routes: string[] = [];

  function walk(dir: string, urlPrefix: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (
      entries.includes("page.tsx") ||
      entries.includes("page.ts") ||
      entries.includes("route.ts") ||
      entries.includes("route.tsx")
    ) {
      routes.push(urlPrefix || "/");
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      // Skip private folders + special Next.js folders.
      if (entry.startsWith("_") || entry === ".well-known") continue;
      // Skip /api/* — quests are visitor-facing pages; API routes are not
      // quest destinations (and the corpus never points at one).
      if (entry === "api") continue;
      // Strip route groups (parens) from the URL
      const segment = entry.startsWith("(") && entry.endsWith(")") ? "" : "/" + entry;
      walk(full, urlPrefix + segment);
    }
  }

  walk(STOREFRONT_APP, "");
  return routes.sort();
}

interface ParsedQuest {
  id: string;
  route: string;
  stepPaths: string[];
}

/**
 * Naively parse the QUESTS array out of quests.ts to extract every quest's
 * id, route, and step paths. Avoids importing the TS module so this script
 * stays standalone (same approach as nav-coverage's parseNavUrls). A small
 * brace-depth scanner splits the array into per-quest object literals so
 * each route stays attributed to its quest id in the report.
 */
function parseQuests(): ParsedQuest[] {
  const src = readFileSync(QUESTS_FILE, "utf-8");

  // Anchor includes the colon — `QUESTS_VERSION` and `QUEST_STORAGE_KEY`
  // sit earlier in the file and would match a bare "export const QUESTS".
  const arrayStart = src.search(/export const QUESTS\s*:/);
  if (arrayStart === -1) {
    throw new Error("Could not find `export const QUESTS:` in quests.ts");
  }
  // Seek the `[` AFTER the `=` — the type annotation `Quest[]` contains an
  // earlier bracket pair that would otherwise end the scan immediately.
  const eq = src.indexOf("=", arrayStart);
  const openBracket = eq === -1 ? -1 : src.indexOf("[", eq);
  if (openBracket === -1) {
    throw new Error("Could not find the QUESTS array opening bracket");
  }

  // Split the array body into top-level `{ … }` quest objects.
  const objects: string[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  for (let i = openBracket + 1; i < src.length; i++) {
    const ch = src[i];
    const prev = src[i - 1];
    if (inString) {
      if (ch === '"' && prev !== "\\") inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        objects.push(src.slice(objStart, i + 1));
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break; // end of the QUESTS array
    }
  }

  const quests: ParsedQuest[] = [];
  for (const obj of objects) {
    const idMatch = /\bid:\s*"([^"]+)"/.exec(obj);
    const routeMatch = /\broute:\s*"([^"]+)"/.exec(obj);
    if (!idMatch || !routeMatch) continue;
    const stepPaths: string[] = [];
    const pathsMatch = /\bpaths:\s*\[([^\]]*)\]/.exec(obj);
    if (pathsMatch) {
      const strRe = /"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = strRe.exec(pathsMatch[1])) !== null) {
        stepPaths.push(m[1]);
      }
    }
    quests.push({ id: idMatch[1], route: routeMatch[1], stepPaths });
  }
  return quests;
}

/**
 * Does a concrete URL resolve to a discovered route? Exact match first;
 * otherwise substitute [param] segments with [^/]+ — the same heuristic
 * nav-coverage check 2 uses for nav URLs targeting dynamic routes.
 */
function resolves(url: string, routes: string[], routeSet: Set<string>): boolean {
  if (routeSet.has(url)) return true;
  for (const route of routes) {
    if (!route.includes("[")) continue;
    const pat = route.replace(/\[[^\]]+\]/g, "[^/]+");
    if (new RegExp("^" + pat + "$").test(url)) return true;
  }
  return false;
}

function main() {
  console.log("─".repeat(72));
  console.log("quest-coverage audit (the playground, S52) — quest route coverage");
  console.log("─".repeat(72));
  console.log("");

  const routes = discoverRoutes();
  const routeSet = new Set(routes);
  let quests: ParsedQuest[];
  try {
    quests = parseQuests();
  } catch (err) {
    console.log(`  ✗ Could not parse quest corpus: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }
  if (quests.length === 0) {
    console.log("  ✗ Parsed zero quests from quests.ts — parser drift or empty corpus.");
    process.exit(1);
    return;
  }

  const stepPathCount = quests.reduce((n, q) => n + q.stepPaths.length, 0);
  console.log(`Discovered ${routes.length} servable routes under apps/storefront/src/app/`);
  console.log(`Quests in corpus:     ${quests.length}`);
  console.log(`Multi-step paths:     ${stepPathCount}`);
  console.log("");

  // ── Check 1: quest route validity ───────────────────────────────────
  console.log("Check 1: quest route validity (dead front doors)");
  console.log("─".repeat(72));
  const deadRoutes: string[] = [];
  for (const quest of quests) {
    if (!resolves(quest.route, routes, routeSet)) {
      deadRoutes.push(`${quest.route} (quest: ${quest.id})`);
    }
  }
  if (deadRoutes.length === 0) {
    console.log(`  ✓ All ${quests.length} quest routes resolve to real routes.`);
  } else {
    console.log(`  ${deadRoutes.length} dead quest route(s):`);
    for (const d of deadRoutes) console.log(`    · ${d}`);
  }
  console.log("");

  // ── Check 2: step-path validity ─────────────────────────────────────
  console.log("Check 2: step-path validity (dead steps in multi-page quests)");
  console.log("─".repeat(72));
  const deadSteps: string[] = [];
  for (const quest of quests) {
    for (const path of quest.stepPaths) {
      if (!resolves(path, routes, routeSet)) {
        deadSteps.push(`${path} (quest: ${quest.id})`);
      }
    }
  }
  if (deadSteps.length === 0) {
    console.log(`  ✓ All ${stepPathCount} step paths resolve to real routes.`);
  } else {
    console.log(`  ${deadSteps.length} dead step path(s):`);
    for (const d of deadSteps) console.log(`    · ${d}`);
  }
  console.log("");

  // ── Check 3: quest id uniqueness ────────────────────────────────────
  console.log("Check 3: quest id uniqueness");
  console.log("─".repeat(72));
  const seen = new Map<string, number>();
  for (const quest of quests) {
    seen.set(quest.id, (seen.get(quest.id) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1);
  if (duplicates.length === 0) {
    console.log(`  ✓ All ${quests.length} quest ids are unique.`);
  } else {
    console.log(`  ${duplicates.length} duplicate quest id(s):`);
    for (const [id, n] of duplicates) console.log(`    · ${id} (×${n})`);
  }
  console.log("");

  console.log("─".repeat(72));
  const findings = deadRoutes.length + deadSteps.length + duplicates.length;
  if (findings === 0) {
    console.log("quest-coverage: ✓ ALL CHECKS PASSED");
    console.log("─".repeat(72));
    process.exit(0);
  } else {
    console.log(`quest-coverage: ✗ ${findings} finding(s) — the rulebook's guarantee is broken (exit 1).`);
    console.log("─".repeat(72));
    process.exit(1);
  }
}

main();
