#!/usr/bin/env tsx
/**
 * play-resources.ts — drift detector for the play-module resource catalog.
 *
 * Eleventh in the audit family (after sku / tributaries / nesting / etc.).
 *
 * Walks the filesystem under `apps/storefront/src/app/play/`,
 * `apps/storefront/src/app/api/v1/play/`, and `apps/storefront/src/lib/play/`
 * and verifies every shipped surface appears in the central catalog at
 * `apps/storefront/src/lib/play/resources.ts`. Drift detection:
 *
 *   1. Filesystem entries with no PLAY_RESOURCES row → unlisted_surface
 *   2. PLAY_RESOURCES rows whose path_or_file doesn't exist on disk → stale_entry
 *      (skipped for non-filesystem entries like methodology pages and design docs)
 *   3. composes_with references to non-existent resource ids → broken_reference
 *
 * The catalog is the single source of truth for /play/spec and
 * /api/v1/play/index.json. The audit catches new surfaces shipped without
 * registry update.
 *
 * Exit code: 0 when clean, 1 on drift. The play module's interconnect is
 * a small enough surface that drift is always actionable; not advisory.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin play-resources
 *   pnpm audit:play-resources
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(ADMIN_DIR, "..", "..");
const RESOURCES_FILE = resolve(
  REPO_ROOT,
  "apps",
  "storefront",
  "src",
  "lib",
  "play",
  "resources.ts",
);

// ── Walk filesystem for play surfaces ─────────────────────────────────

interface FsSurface {
  /** Repo-relative path. */
  path: string;
  /** Best-guess URL the surface serves (or null for library files). */
  url: string | null;
  /** What kind of surface this is. */
  kind: "html_page" | "json_endpoint" | "library_file";
}

function walk(dir: string, found: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, found);
    } else if (
      (entry === "page.tsx" || entry === "route.ts") &&
      stat.isFile()
    ) {
      found.push(full);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && stat.isFile()) {
      found.push(full);
    }
  }
}

function classify(absPath: string): FsSurface | null {
  const rel = relative(REPO_ROOT, absPath);

  if (rel.startsWith("apps/storefront/src/app/play/")) {
    if (!rel.endsWith("/page.tsx") && !rel.endsWith("/layout.tsx")) return null;
    // Skip layouts; they're internal scaffolding, not user surfaces.
    if (rel.endsWith("/layout.tsx")) return null;
    // Compute the route from the file path:
    // apps/storefront/src/app/play/welcome/page.tsx → /play/welcome
    const route = rel
      .replace(/^apps\/storefront\/src\/app/, "")
      .replace(/\/page\.tsx$/, "")
      .replace(/\[([^\]]+)\]/g, "[$1]"); // preserve brackets
    return { path: rel, url: route || "/", kind: "html_page" };
  }

  if (rel.startsWith("apps/storefront/src/app/api/v1/play/")) {
    if (!rel.endsWith("/route.ts")) return null;
    const route = rel
      .replace(/^apps\/storefront\/src\/app/, "")
      .replace(/\/route\.ts$/, "");
    return { path: rel, url: route, kind: "json_endpoint" };
  }

  if (rel.startsWith("apps/storefront/src/lib/play/")) {
    if (!rel.endsWith(".ts")) return null;
    return { path: rel, url: null, kind: "library_file" };
  }

  return null;
}

const allFiles: string[] = [];
walk(resolve(REPO_ROOT, "apps", "storefront", "src", "app", "play"), allFiles);
walk(
  resolve(REPO_ROOT, "apps", "storefront", "src", "app", "api", "v1", "play"),
  allFiles,
);
walk(resolve(REPO_ROOT, "apps", "storefront", "src", "lib", "play"), allFiles);

const surfaces: FsSurface[] = allFiles
  .map(classify)
  .filter((s): s is FsSurface => s !== null);

// ── Read PLAY_RESOURCES catalog ───────────────────────────────────────

if (!existsSync(RESOURCES_FILE)) {
  console.error(`✗ catalog file missing: ${relative(REPO_ROOT, RESOURCES_FILE)}`);
  process.exit(1);
}

const catalogText = readFileSync(RESOURCES_FILE, "utf8");

// Extract { id, path_or_file, composes_with } from PLAY_RESOURCES via regex.
// Robust enough for the audit's purposes; the lib file is hand-maintained.

interface CatalogEntry {
  id: string;
  path_or_file: string;
  composes_with: string[];
}

const catalog: CatalogEntry[] = [];
{
  // Each entry block opens with `id: "..."` and closes with `},`.
  const entryRe =
    /id:\s*"([^"]+)"[\s\S]*?path_or_file:\s*"([^"]+)"[\s\S]*?composes_with:\s*\[([^\]]*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(catalogText)) !== null) {
    const id = match[1];
    const pathOrFile = match[2];
    const composesRaw = match[3];
    const composes = composesRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/^"|"$/g, ""));
    catalog.push({ id, path_or_file: pathOrFile, composes_with: composes });
  }
}

const catalogIds = new Set(catalog.map((c) => c.id));
const catalogPathsOrFiles = new Set(catalog.map((c) => c.path_or_file));

// ── Check 1 — unlisted_surface ────────────────────────────────────────

interface UnlistedFinding {
  surface: FsSurface;
  expected_path_in_catalog: string;
}

const unlisted: UnlistedFinding[] = [];
for (const s of surfaces) {
  // The catalog's path_or_file is the URL for endpoints/pages, the
  // repo-relative path for library files.
  const expected =
    s.kind === "library_file"
      ? s.path
      : s.url ?? s.path;
  // The /api/v1/play/index.json/route.ts surface registers as
  // path_or_file=/api/v1/play/index.json — strip the .json/route.ts split.
  // Same for index.json directory pattern. Try canonical matches.
  const candidates = new Set<string>([expected]);
  if (s.url) candidates.add(s.url);
  // Library file: also try the canonical relative path.
  if (s.kind === "library_file") {
    candidates.add(s.path);
  }
  const matched = Array.from(candidates).some((c) =>
    catalogPathsOrFiles.has(c),
  );
  if (!matched) {
    unlisted.push({ surface: s, expected_path_in_catalog: expected });
  }
}

// ── Check 2 — stale_entry (catalog row → missing filesystem) ──────────

interface StaleFinding {
  catalog_entry: CatalogEntry;
}

const stale: StaleFinding[] = [];
for (const entry of catalog) {
  // Skip non-filesystem rows: design docs, methodology pages, future runtime,
  // future engine levels, policy rows, etc. We detect these heuristically:
  //   - Starts with `/` and the route exists in filesystem → check
  //   - Starts with `apps/` → check filesystem
  //   - Anything else (e.g., "Fun-first boundary", "L4: cost-enforced engine",
  //     "match_events table + matches table") → skip
  const p = entry.path_or_file;
  if (
    !p.startsWith("/") &&
    !p.startsWith("apps/") &&
    !p.startsWith("docs/")
  ) {
    continue;
  }
  // Design docs in docs/ — check existence; skip otherwise from this audit
  // because docs/ entries are out of scope (different audit).
  if (p.startsWith("docs/")) {
    const abs = resolve(REPO_ROOT, p);
    if (!existsSync(abs)) {
      stale.push({ catalog_entry: entry });
    }
    continue;
  }
  // Skip route patterns with bracketed params (e.g., /play/[code]) —
  // existence is via a dynamic segment; assume present.
  if (p.includes("[")) continue;
  // Skip the future-runtime row with " + websocket" suffix.
  if (p.includes(" + ")) continue;
  // URL → filesystem mapping
  if (p.startsWith("/api/v1/play/")) {
    const abs = resolve(
      REPO_ROOT,
      "apps/storefront/src/app",
      p.replace(/^\//, ""),
      "route.ts",
    );
    if (!existsSync(abs)) {
      stale.push({ catalog_entry: entry });
    }
  } else if (p.startsWith("/play")) {
    const abs = resolve(
      REPO_ROOT,
      "apps/storefront/src/app",
      p.replace(/^\//, ""),
      "page.tsx",
    );
    if (!existsSync(abs)) {
      stale.push({ catalog_entry: entry });
    }
  } else if (p.startsWith("apps/")) {
    const abs = resolve(REPO_ROOT, p);
    if (!existsSync(abs)) {
      stale.push({ catalog_entry: entry });
    }
  }
  // Other URLs (e.g., /methodology/play-module, /guides/how-to-play): skip,
  // they may or may not be filesystem-resolvable depending on the framework.
}

// ── Check 3 — broken_reference (composes_with → unknown id) ───────────

interface BrokenRefFinding {
  source_id: string;
  unknown_target: string;
}

const brokenRefs: BrokenRefFinding[] = [];
for (const entry of catalog) {
  for (const target of entry.composes_with) {
    if (!catalogIds.has(target)) {
      brokenRefs.push({ source_id: entry.id, unknown_target: target });
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────

console.log("");
console.log("◆ play-resources audit — catalog drift detector");
console.log("");
console.log(`  catalog entries:              ${catalog.length}`);
console.log(`  filesystem surfaces found:    ${surfaces.length}`);
console.log(`    html_page:                  ${surfaces.filter((s) => s.kind === "html_page").length}`);
console.log(`    json_endpoint:              ${surfaces.filter((s) => s.kind === "json_endpoint").length}`);
console.log(`    library_file:               ${surfaces.filter((s) => s.kind === "library_file").length}`);
console.log(`  unlisted surfaces:            ${unlisted.length}`);
console.log(`  stale catalog entries:        ${stale.length}`);
console.log(`  broken composes_with refs:    ${brokenRefs.length}`);
console.log("");

if (unlisted.length > 0) {
  console.log(`◇ Check 1 — unlisted surfaces (${unlisted.length} hits)`);
  console.log("");
  console.log("  Filesystem entries with no PLAY_RESOURCES row. Each is a play");
  console.log("  surface that ships without appearing in /play/spec or");
  console.log("  /api/v1/play/index.json.");
  console.log("");
  for (const u of unlisted.slice(0, 30)) {
    console.log(`    ${u.surface.path}`);
    console.log(`      expected catalog path_or_file: ${u.expected_path_in_catalog}`);
  }
  if (unlisted.length > 30) {
    console.log(`    ... +${unlisted.length - 30} more`);
  }
  console.log("");
}

if (stale.length > 0) {
  console.log(`◇ Check 2 — stale catalog entries (${stale.length} hits)`);
  console.log("");
  console.log("  Catalog rows whose path_or_file doesn't exist on disk. Each is");
  console.log("  a resource the catalog still claims; the audit has not found it.");
  console.log("");
  for (const s of stale.slice(0, 20)) {
    console.log(`    [${s.catalog_entry.id}] ${s.catalog_entry.path_or_file}`);
  }
  if (stale.length > 20) {
    console.log(`    ... +${stale.length - 20} more`);
  }
  console.log("");
}

if (brokenRefs.length > 0) {
  console.log(`◇ Check 3 — broken composes_with references (${brokenRefs.length} hits)`);
  console.log("");
  console.log("  Catalog rows that name a composes_with target id that doesn't");
  console.log("  exist as a catalog entry. The graph between resources is broken.");
  console.log("");
  for (const r of brokenRefs.slice(0, 20)) {
    console.log(`    [${r.source_id}] → composes_with: "${r.unknown_target}" (unknown)`);
  }
  if (brokenRefs.length > 20) {
    console.log(`    ... +${brokenRefs.length - 20} more`);
  }
  console.log("");
}

const total = unlisted.length + stale.length + brokenRefs.length;
if (total === 0) {
  console.log("✓ play module's resource catalog is in sync with the filesystem");
  console.log("");
  process.exit(0);
}

console.log(
  `  When adding a play surface: append a PLAY_RESOURCES entry in apps/storefront/src/lib/play/resources.ts. /play/spec and /api/v1/play/index.json both render from there. The audit catches drift.`,
);
console.log("");
process.exit(1);
