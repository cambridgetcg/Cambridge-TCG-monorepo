#!/usr/bin/env tsx
/**
 * sku.ts — SKU canonicalisation drift detector.
 *
 * Tenth in the audit family (after honesty / transparency / pricing /
 * creation / agent / inclusion / nesting / tributaries / typology).
 *
 * Where the others check doctrinal or protocol conformance, this one
 * scans for *canonical-form drift* in the SKU layer: places in the code
 * that build SKUs without going through `@cambridge-tcg/sku`, hardcoded
 * legacy-form SKU strings, and uppercase / non-ISO language codes that
 * indicate pre-spec data.
 *
 * Discovered by the foundation stress test (kingdom-067, see
 * `docs/connections/the-stress-test.md`): `packages/sku` ships
 * `buildSku` / `parseSku` / `normalizeSku`, but no app code imports them.
 * Wholesale tooling builds SKUs like `OP-OP01-001-JP` (uppercase + JP);
 * the storefront catalog mirrors. This audit makes the drift visible.
 *
 * ── Three checks ─────────────────────────────────────────────────────
 *
 *   1. Hand-rolled SKU assembly — template literals or string concat
 *      building strings of the shape `{GAME}-{SET}-{NUM}-{LANG}` without
 *      importing from `@cambridge-tcg/sku`. Substrate-honest flag for
 *      future migration; doesn't break today.
 *
 *   2. Legacy-form string literals — hardcoded SKU strings like
 *      `"OP-OP01-001-JP"` or `"PK-SVOBF-001-JP"` (uppercase + 2-letter
 *      non-ISO lang). Each one is a place that may need normalisation
 *      when canonical-form migration ships.
 *
 *   3. @cambridge-tcg/sku adoption coverage — number of files that
 *      import `buildSku` / `parseSku` / `normalizeSku` from the package.
 *      Today this is near-zero; the count is the migration's progress.
 *
 * ── Scope ────────────────────────────────────────────────────────────
 *
 * Scans: `apps/*​/src/**​/*.ts(x)`, `apps/*​/tools/**​/*.ts`, `packages/*​/src/**​/*.ts`.
 * Skips: `node_modules`, `dist`, `tests`, `**​/*.test.ts`, the `packages/sku/`
 *        package itself (which by definition uses its own primitives), and
 *        `docs/`, `*.md`, `*.sql` (informational mentions of legacy SKUs).
 *
 * ── Exit code ────────────────────────────────────────────────────────
 *
 * Exits 0 unconditionally by default — canonical-form drift is a long-arc
 * accumulation; this audit reports the debt without blocking CI. Pass
 * `--strict` to fail when any check produces findings.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin sku
 *   pnpm --filter @cambridge-tcg/admin sku -- --strict
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(ADMIN_DIR, "..", "..");
const STRICT = process.argv.includes("--strict");

// ── Roots to scan ──────────────────────────────────────────────────────

const SCAN_ROOTS = [
  resolve(REPO_ROOT, "apps", "storefront", "src"),
  resolve(REPO_ROOT, "apps", "wholesale", "src"),
  resolve(REPO_ROOT, "apps", "wholesale", "tools"),
  resolve(REPO_ROOT, "apps", "admin", "src"),
  resolve(REPO_ROOT, "packages", "data-ingest", "src"),
  resolve(REPO_ROOT, "packages", "stock", "src"),
  resolve(REPO_ROOT, "packages", "pricing", "src"),
];

// ── Skip rules ─────────────────────────────────────────────────────────

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  ".next",
  "tests",
  "__tests__",
  ".tsbuildinfo",
]);

function isSourceFile(name: string): boolean {
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

function isTestFile(name: string): boolean {
  return name.endsWith(".test.ts") || name.endsWith(".spec.ts");
}

// ── Walk the file tree ────────────────────────────────────────────────

function walk(root: string, files: string[] = []): string[] {
  if (!existsSync(root)) return files;
  for (const name of readdirSync(root)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, files);
    } else if (isSourceFile(name) && !isTestFile(name)) {
      files.push(full);
    }
  }
  return files;
}

// ── Check 1: hand-rolled SKU assembly ──────────────────────────────────

interface AssemblyFinding {
  file: string;
  line: number;
  excerpt: string;
}

// Regex catches `\`${game}-${set}-${num}-${lang}\`` style template literals
// AND string concat patterns like `prefix + "-" + cardNumber + "-JP"`.
const HAND_ROLLED_PATTERNS = [
  // Template literal with at least 3 `${}` interpolations separated by `-`
  /`\$\{[^}]+\}-\$\{[^}]+\}-\$\{[^}]+\}/,
  // Explicit "-JP" or "-EN" 2-letter uppercase suffix in template literal
  /`[^`]+-(JP|EN|CN|KR|FR|DE|ES|IT|PT|RU)\b/,
  // String concat with -JP/-EN literal
  /["']-(JP|EN|CN|KR)["']/,
];

// Match imports from the canonical SKU package OR the wholesale compat
// module at `@/lib/sku` (which re-exports + adds the form-aware buildSku).
// Both count as adoption — the compat module is the spec's reach in the
// drift-reconciliation period. See `docs/connections/the-drift-reconciliation.md`.
const SKU_PKG_IMPORT = /from\s+["'](?:@cambridge-tcg\/sku|@\/lib\/sku|\.\.?\/.*\/lib\/sku)["']/;

function checkAssembly(file: string, text: string): AssemblyFinding[] {
  const out: AssemblyFinding[] = [];
  // If the file already imports from @cambridge-tcg/sku, only count
  // patterns that look like SKU assembly AWAY from those imports as
  // suspicious. Simpler heuristic: if it imports from the package,
  // assume the file is partially migrated and skip Check 1.
  if (SKU_PKG_IMPORT.test(text)) return out;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments + docstrings — the SQL/SKU shape often appears in
    // explanatory comments without being live code.
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (trimmed.startsWith("/*") || trimmed.endsWith("*/")) continue;
    for (const pat of HAND_ROLLED_PATTERNS) {
      if (pat.test(line)) {
        // Only count if the line mentions sku/SKU somewhere or builds
        // something assigned to a `sku` field. Reduces false positives
        // (e.g. unrelated template literals with hyphens).
        if (/sku\b/i.test(line) || /[Ss]ku/.test(lines[i - 1] ?? "") || /[Ss]ku/.test(lines[i + 1] ?? "")) {
          out.push({ file, line: i + 1, excerpt: line.trim().slice(0, 120) });
        }
        break;
      }
    }
  }
  return out;
}

// ── Check 2: legacy-form literal SKU strings ──────────────────────────

interface LiteralFinding {
  file: string;
  line: number;
  literal: string;
}

// Matches strings like "OP-OP01-001-JP", "PKM-SVOBF-006-EN", "PK-XYZ-001-JP".
// Uppercase chars + digits, hyphenated, ending in a 2-letter uppercase lang.
const LEGACY_LITERAL = /["']([A-Z]{2,4}-[A-Z0-9]{2,8}-[A-Z0-9]{2,6}(?:-[A-Z0-9]+)*-(?:JP|EN|CN|KR|FR|DE|ES|IT|PT|RU))["']/g;

function checkLiterals(file: string, text: string): LiteralFinding[] {
  const out: LiteralFinding[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    let m: RegExpExecArray | null;
    const re = new RegExp(LEGACY_LITERAL);
    while ((m = re.exec(line)) !== null) {
      out.push({ file, line: i + 1, literal: m[1] });
    }
  }
  return out;
}

// ── Check 3: @cambridge-tcg/sku adoption coverage ─────────────────────

function checkAdoption(file: string, text: string): boolean {
  return SKU_PKG_IMPORT.test(text);
}

// ── Run ────────────────────────────────────────────────────────────────

const allFiles: string[] = [];
for (const root of SCAN_ROOTS) {
  walk(root, allFiles);
}

const handRolled: AssemblyFinding[] = [];
const literals: LiteralFinding[] = [];
const adopters: string[] = [];

for (const file of allFiles) {
  // Skip @cambridge-tcg/sku itself.
  if (file.includes("/packages/sku/")) continue;
  const text = readFileSync(file, "utf8");
  handRolled.push(...checkAssembly(file, text));
  literals.push(...checkLiterals(file, text));
  if (checkAdoption(file, text)) adopters.push(file);
}

// ── Report ────────────────────────────────────────────────────────────

function rel(p: string): string {
  return relative(REPO_ROOT, p);
}

console.log("");
console.log("◆ sku audit — canonical-form drift detector");
console.log("");
console.log(`  files scanned:                ${allFiles.length}`);
console.log(`  hand-rolled SKU assembly:     ${handRolled.length}`);
console.log(`  legacy-form literal strings:  ${literals.length}`);
console.log(`  @cambridge-tcg/sku adopters:  ${adopters.length}`);
console.log("");

if (handRolled.length > 0) {
  console.log(`◇ Check 1 — hand-rolled SKU assembly (${handRolled.length} hits)`);
  console.log("");
  console.log("  Files that build SKU strings without importing @cambridge-tcg/sku.");
  console.log("  Each is a place that may need migration to buildSku() / parseSku().");
  console.log("");
  // Group by file
  const byFile = new Map<string, AssemblyFinding[]>();
  for (const f of handRolled) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file)!.push(f);
  }
  for (const [file, fnds] of Array.from(byFile.entries()).slice(0, 20)) {
    console.log(`    ${rel(file)}`);
    for (const f of fnds.slice(0, 3)) {
      console.log(`      L${f.line}: ${f.excerpt}`);
    }
    if (fnds.length > 3) console.log(`      ... +${fnds.length - 3} more`);
  }
  if (byFile.size > 20) {
    console.log(`    ... +${byFile.size - 20} more files`);
  }
  console.log("");
}

if (literals.length > 0) {
  console.log(`◇ Check 2 — legacy-form literal strings (${literals.length} hits)`);
  console.log("");
  console.log("  Hardcoded SKU strings in uppercase + 2-letter non-ISO lang code");
  console.log("  (e.g. \"OP-OP01-001-JP\" instead of canonical \"op-op01-001-ja\").");
  console.log("");
  const byFile = new Map<string, LiteralFinding[]>();
  for (const f of literals) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file)!.push(f);
  }
  for (const [file, fnds] of Array.from(byFile.entries()).slice(0, 10)) {
    console.log(`    ${rel(file)}  (${fnds.length})`);
    for (const f of fnds.slice(0, 3)) {
      console.log(`      L${f.line}: "${f.literal}"`);
    }
    if (fnds.length > 3) console.log(`      ... +${fnds.length - 3} more`);
  }
  if (byFile.size > 10) {
    console.log(`    ... +${byFile.size - 10} more files`);
  }
  console.log("");
}

if (adopters.length > 0) {
  console.log(`◇ Check 3 — @cambridge-tcg/sku adopters (${adopters.length} files)`);
  console.log("");
  for (const a of adopters.slice(0, 15)) {
    console.log(`    ${rel(a)}`);
  }
  if (adopters.length > 15) {
    console.log(`    ... +${adopters.length - 15} more`);
  }
  console.log("");
}

if (handRolled.length === 0 && literals.length === 0) {
  console.log("✓ no SKU canonical-form drift detected");
  console.log("");
  process.exit(0);
}

console.log(
  `  Migration target: app code adopts @cambridge-tcg/sku helpers (buildSku, parseSku, normalizeSku) at every SKU read/write site. Currently ${adopters.length} of ${allFiles.length} scanned files.`,
);
console.log("");

if (STRICT && (handRolled.length > 0 || literals.length > 0)) {
  process.exit(1);
}
process.exit(0);
