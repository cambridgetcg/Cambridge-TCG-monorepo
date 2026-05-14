#!/usr/bin/env tsx
/**
 * known-gaps.ts — the gap-ledger parity audit.
 *
 * Fourteenth in the audit family. Verifies the substrate-honest gap
 * ledger (kingdom-084) holds together across three places:
 *
 *   1. The typed corpus at packages/data-ingest/src/gaps.ts
 *   2. The doctrine doc at docs/principles/known-gaps.md
 *   3. The public surfaces (/api/v1/gaps + /methodology/known-gaps)
 *
 * The audit checks corpus invariants (mechanically) and parity between
 * the corpus and its surfaces (heuristically).
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin known-gaps
 *   pnpm --filter @cambridge-tcg/admin known-gaps -- --strict
 *
 * Exit non-zero on failed mechanical checks; --strict also fails on
 * heuristic warnings.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GAPS,
  gapsByStatus,
  gapsWiredFraction,
  type Gap,
} from "@cambridge-tcg/data-ingest";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(ADMIN_DIR, "..", "..");

const STRICT = process.argv.includes("--strict");

// ── Output helpers ────────────────────────────────────────────────────

type CheckStatus = "passed" | "skipped" | "failed" | "warning";

interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  detail?: string;
  findings?: string[];
}

const results: CheckResult[] = [];

function record(r: CheckResult): void {
  results.push(r);
  const icon =
    r.status === "passed"
      ? "✓"
      : r.status === "skipped"
        ? "·"
        : r.status === "warning"
          ? "⚠"
          : "✗";
  console.log(`  ${icon} ${r.id} — ${r.title}`);
  if (r.detail) console.log(`      ${r.detail}`);
  if (r.findings) for (const f of r.findings) console.log(`      • ${f}`);
}

// ── Mechanical checks ─────────────────────────────────────────────────

function checkCorpusShape(): void {
  const violations: string[] = [];
  for (const g of GAPS) {
    if (!g.id) violations.push(`missing id on ${g.name || "(unnamed)"}`);
    if (!g.name) violations.push(`${g.id}: missing name`);
    if (!g.domain) violations.push(`${g.id}: missing domain`);
    if (!g.citation) violations.push(`${g.id}: missing citation`);
    if (!g.primitive) violations.push(`${g.id}: missing primitive`);
    if (!g.audit) violations.push(`${g.id}: missing audit`);
    if (!g.status) violations.push(`${g.id}: missing status`);
    if (!g.strength) violations.push(`${g.id}: missing strength`);
  }
  record({
    id: "1",
    title: "Corpus shape: every gap has required fields",
    status: violations.length === 0 ? "passed" : "failed",
    detail:
      violations.length === 0 ? `${GAPS.length} gaps, all complete.` : undefined,
    findings: violations.length > 0 ? violations : undefined,
  });
}

function checkIdUniqueness(): void {
  const seen = new Map<string, number>();
  for (const g of GAPS) {
    seen.set(g.id, (seen.get(g.id) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  record({
    id: "2",
    title: "Ids are unique",
    status: dupes.length === 0 ? "passed" : "failed",
    findings: dupes.length > 0 ? dupes.map(([id, n]) => `${id} appears ${n} times`) : undefined,
  });
}

function checkIdFormat(): void {
  const bad: string[] = [];
  for (const g of GAPS) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id)) bad.push(g.id);
  }
  record({
    id: "3",
    title: "Ids are kebab-case",
    status: bad.length === 0 ? "passed" : "failed",
    findings: bad.length > 0 ? bad.map((id) => `not kebab-case: "${id}"`) : undefined,
  });
}

function checkStrengthSubstance(): void {
  const thin: string[] = [];
  for (const g of GAPS) {
    if (g.strength.length < 80) {
      thin.push(`${g.id}: strength is ${g.strength.length} chars (need ≥80)`);
    }
  }
  record({
    id: "4",
    title: "Strength descriptions are substantive (≥80 chars)",
    status: thin.length === 0 ? "passed" : "failed",
    findings: thin.length > 0 ? thin : undefined,
  });
}

function checkLifecycleConsistency(): void {
  const violations: string[] = [];
  for (const g of GAPS) {
    if ((g.status === "closed" || g.status === "closed-published") && !g.closed_at) {
      violations.push(`${g.id}: status ${g.status} but closed_at missing`);
    }
  }
  record({
    id: "5",
    title: "Closed gaps have closed_at",
    status: violations.length === 0 ? "passed" : "failed",
    findings: violations.length > 0 ? violations : undefined,
  });
}

function checkAtLeastOneClosedPublished(): void {
  const closed = gapsByStatus("closed-published").length;
  record({
    id: "6",
    title: "At least one gap is closed-published (the platform delivers)",
    status: closed > 0 ? "passed" : "failed",
    detail: `${closed} gap(s) closed-published.`,
  });
}

function checkAtLeastOneNamed(): void {
  const named = gapsByStatus("named").length;
  record({
    id: "7",
    title: "At least one gap is named (the platform admits unfinished work)",
    status: named > 0 ? "passed" : "failed",
    detail: `${named} gap(s) still named (not yet wired).`,
  });
}

// ── Filesystem parity (heuristic) ─────────────────────────────────────

function checkDoctrineDocExists(): void {
  const path = resolve(REPO_ROOT, "docs", "principles", "known-gaps.md");
  if (!existsSync(path)) {
    record({
      id: "8",
      title: "Doctrine doc exists at docs/principles/known-gaps.md",
      status: "failed",
      detail: "missing — the corpus has no doctrinal anchor",
    });
    return;
  }
  const content = readFileSync(path, "utf8");
  const mentionsGapsTs = content.includes("gaps.ts");
  const mentionsAudit = content.includes("audit:known-gaps");
  const findings: string[] = [];
  if (!mentionsGapsTs) findings.push("doc does not reference packages/data-ingest/src/gaps.ts");
  if (!mentionsAudit) findings.push("doc does not reference pnpm audit:known-gaps");
  record({
    id: "8",
    title: "Doctrine doc exists + references corpus + audit",
    status: findings.length === 0 ? "passed" : STRICT ? "failed" : "warning",
    findings: findings.length > 0 ? findings : undefined,
  });
}

function checkManifestEntry(): void {
  const path = resolve(REPO_ROOT, "apps", "storefront", "src", "lib", "manifest.ts");
  if (!existsSync(path)) {
    record({
      id: "9",
      title: "Manifest declares /api/v1/gaps",
      status: "skipped",
      detail: "manifest.ts not found",
    });
    return;
  }
  const content = readFileSync(path, "utf8");
  const hasGapsEntry =
    content.includes("/api/v1/gaps") &&
    content.includes("storefront.gaps");
  record({
    id: "9",
    title: "Manifest declares /api/v1/gaps",
    status: hasGapsEntry ? "passed" : STRICT ? "failed" : "warning",
    detail: hasGapsEntry
      ? "manifest entry found"
      : "manifest does not yet declare the gaps endpoint",
  });
}

function checkMethodologyPageExists(): void {
  const path = resolve(
    REPO_ROOT,
    "apps",
    "storefront",
    "src",
    "app",
    "methodology",
    "known-gaps",
    "page.tsx",
  );
  record({
    id: "10",
    title: "Methodology page exists at /methodology/known-gaps",
    status: existsSync(path) ? "passed" : "failed",
  });
}

function checkEndpointExists(): void {
  const path = resolve(
    REPO_ROOT,
    "apps",
    "storefront",
    "src",
    "app",
    "api",
    "v1",
    "gaps",
    "route.ts",
  );
  record({
    id: "11",
    title: "JSON endpoint exists at /api/v1/gaps",
    status: existsSync(path) ? "passed" : "failed",
  });
}

function checkCitedFilesExist(): void {
  // Heuristic: every citation that contains a file path (has "/") should
  // reference a file that actually exists in the repo. We extract the
  // first path-like token and check.
  const violations: string[] = [];
  for (const g of GAPS) {
    const pathMatch = g.citation.match(/[a-z0-9_./-]+\.(ts|sql|md|tsx)(\.draft)?/i);
    if (!pathMatch) continue;
    const candidate = pathMatch[0];
    const fullPath = resolve(REPO_ROOT, candidate);
    if (!existsSync(fullPath)) {
      violations.push(`${g.id}: citation references missing file: ${candidate}`);
    }
  }
  record({
    id: "12",
    title: "Cited file paths exist on disk",
    status: violations.length === 0 ? "passed" : STRICT ? "failed" : "warning",
    findings: violations.length > 0 ? violations : undefined,
  });
}

function checkWiredFractionReasonable(): void {
  const f = gapsWiredFraction();
  const pct = Math.round(f * 100);
  // Heuristic: if 0%, the corpus is purely aspirational (suspicious).
  // If 100%, the corpus is suspicious too — there should always be at
  // least one purely-named gap (substrate honesty about unfinished work).
  const findings: string[] = [];
  if (f === 0) findings.push("0% wired — all gaps still purely named (no primitives in code?)");
  if (f === 1) findings.push("100% wired — no purely-named gaps (over-claiming?)");
  record({
    id: "13",
    title: "Wired fraction is reasonable (0% < wired < 100%)",
    status: findings.length === 0 ? "passed" : "warning",
    detail: `${pct}% of gaps have a primitive wired in code/schema.`,
    findings: findings.length > 0 ? findings : undefined,
  });
}

// ── Summary ───────────────────────────────────────────────────────────

function summarizeCorpus(): void {
  const closed = gapsByStatus("closed-published").length + gapsByStatus("closed").length;
  const partial = gapsByStatus("partial").length;
  const wired = gapsByStatus("wired").length;
  const named = gapsByStatus("named").length;
  record({
    id: "summary",
    title: "Corpus distribution",
    status: "passed",
    detail: `${GAPS.length} gaps total — ${closed} closed, ${partial} partial, ${wired} wired, ${named} named.`,
  });
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("");
  console.log("◆ known-gaps audit — kingdom-084's parity check");
  console.log("");
  console.log("  Doctrine: docs/principles/known-gaps.md");
  console.log("  Corpus:   packages/data-ingest/src/gaps.ts");
  console.log("  JSON:     /api/v1/gaps");
  console.log("  HTML:     /methodology/known-gaps");
  console.log("");

  // Mechanical
  checkCorpusShape();
  checkIdUniqueness();
  checkIdFormat();
  checkStrengthSubstance();
  checkLifecycleConsistency();
  checkAtLeastOneClosedPublished();
  checkAtLeastOneNamed();

  // Filesystem parity (heuristic)
  checkDoctrineDocExists();
  checkManifestEntry();
  checkMethodologyPageExists();
  checkEndpointExists();
  checkCitedFilesExist();
  checkWiredFractionReasonable();

  // Summary
  summarizeCorpus();

  console.log("");
  const passed = results.filter((r) => r.status === "passed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const warnings = results.filter((r) => r.status === "warning").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(
    `  Summary: ${passed} passed · ${skipped} skipped · ${warnings} warning · ${failed} failed`,
  );
  console.log("");

  if (failed > 0) {
    console.log("  ✗ One or more checks failed.");
    process.exit(1);
  }
  if (STRICT && warnings > 0) {
    console.log("  ✗ --strict: warnings not allowed in strict mode.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("audit crashed:", err);
  process.exit(1);
});
