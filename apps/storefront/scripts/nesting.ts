#!/usr/bin/env tsx
/**
 * nesting.ts — citation-density debt detector
 *
 * Sixth in the audit family. Where honesty / transparency / creation /
 * pricing / inclusion / agent each check one doctrine's adoption,
 * **nesting checks the citation graph itself** — the substrate-level
 * coherence that emerges when every doc cites every adjacent doc.
 *
 * See `docs/connections/the-nesting.md` for the doctrinal frame.
 *
 * ── Three checks ─────────────────────────────────────────────────────
 *
 *   1. Orphans — markdown files with zero inbound *and* zero outbound
 *      references to other tracked docs. These are likely abandoned or
 *      never linked into the graph.
 *
 *   2. Dangling references — `[title](./path.md)` links pointing at
 *      files that don't exist. Cycle broken.
 *
 *   3. One-way leaves — files that cite others but are cited by no one
 *      tracked. Acceptable for new docs (they grow inbound over time);
 *      worth surfacing so the citation graph stays auditable.
 *
 * ── Scope ────────────────────────────────────────────────────────────
 *
 * Tracks: `docs/connections/*.md`, `docs/principles/*.md`,
 *         `docs/methodology/*.md`, `docs/*.md` (top-level).
 * Skips:  pillow-book (accumulator, not citation-graph node).
 *
 * Heuristic — markdown links only. Bare-text path mentions
 * (`apps/storefront/src/...`) are NOT counted as citations because
 * they're too noisy. A future refinement could include them.
 *
 * ── Exit code ────────────────────────────────────────────────────────
 *
 * Exits 0 unconditionally by default. Citation density is a long-arc
 * accumulation; the audit reports debt, doesn't block CI. Pass
 * `--strict` for non-zero exit on findings.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin nesting
 *   pnpm --filter @cambridge-tcg/admin nesting -- --strict
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const DOCS_DIR = join(REPO_ROOT, "docs");

const STRICT = process.argv.includes("--strict");

// ── File walking ────────────────────────────────────────────────────────

function walkMd(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules") continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      out.push(...walkMd(full));
    } else if (e.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function read(path: string): string {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

// ── Scope: which markdown files are nodes in the citation graph ────────

function trackedFiles(): string[] {
  const dirs = [
    join(DOCS_DIR, "connections"),
    join(DOCS_DIR, "principles"),
    join(DOCS_DIR, "methodology"),
  ];
  const out: string[] = [];
  // Connections, principles, methodology (recursive — currently flat).
  for (const d of dirs) out.push(...walkMd(d));
  // Top-level docs/*.md (excluding subdirs already covered).
  try {
    for (const e of readdirSync(DOCS_DIR)) {
      const full = join(DOCS_DIR, e);
      if (statSync(full).isFile() && e.endsWith(".md")) out.push(full);
    }
  } catch { /* ignore */ }
  // Exclude pillow book — it's an accumulator, not a citation-graph node.
  return out.filter((f) => !f.endsWith("the-pillow-book.md"));
}

// ── Link extraction ────────────────────────────────────────────────────

const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

interface Link {
  target: string;        // resolved absolute path (or "external")
  raw: string;           // the (...) part of the link as written
  isExternal: boolean;
  isAnchor: boolean;     // `#anchor-only`
  isFragment: boolean;   // file path with #fragment
  exists: boolean;       // does the resolved path exist?
}

function extractLinks(file: string, body: string, allTracked: Set<string>): Link[] {
  const links: Link[] = [];
  for (const m of body.matchAll(MD_LINK)) {
    const raw = m[2] ?? "";
    if (raw.length === 0) continue;
    if (raw.startsWith("#")) {
      links.push({
        target: raw,
        raw,
        isExternal: false,
        isAnchor: true,
        isFragment: false,
        exists: true, // can't verify anchors without parsing the doc
      });
      continue;
    }
    if (/^https?:\/\//.test(raw) || raw.startsWith("mailto:")) {
      links.push({
        target: raw,
        raw,
        isExternal: true,
        isAnchor: false,
        isFragment: false,
        exists: true,
      });
      continue;
    }
    // Strip fragment.
    const [pathPart, fragment] = raw.split("#");
    if (!pathPart) continue;
    const resolved = resolve(dirname(file), pathPart);
    let exists = false;
    try { statSync(resolved); exists = true; } catch { /* missing */ }
    // Mark as tracked-vs-untracked separately by checking allTracked.
    links.push({
      target: resolved,
      raw,
      isExternal: false,
      isAnchor: false,
      isFragment: Boolean(fragment),
      exists,
    });
  }
  return links;
}

// ── Build the graph ────────────────────────────────────────────────────

interface GraphNode {
  file: string;
  rel: string;
  outbound: Link[];
  inboundFrom: string[]; // rel paths of files that link here
}

function buildGraph(files: string[]): Map<string, GraphNode> {
  const trackedSet = new Set(files);
  const graph = new Map<string, GraphNode>();
  for (const f of files) {
    graph.set(f, {
      file: f,
      rel: relative(REPO_ROOT, f),
      outbound: extractLinks(f, read(f), trackedSet),
      inboundFrom: [],
    });
  }
  // Reverse pass: fill inboundFrom.
  for (const node of graph.values()) {
    for (const link of node.outbound) {
      if (link.isExternal || link.isAnchor) continue;
      const target = graph.get(link.target);
      if (target) target.inboundFrom.push(node.rel);
    }
  }
  return graph;
}

// ── Check 1: orphans ───────────────────────────────────────────────────

interface OrphanFinding {
  file: string;
  reason: string;
}

function checkOrphans(graph: Map<string, GraphNode>): OrphanFinding[] {
  const findings: OrphanFinding[] = [];
  for (const node of graph.values()) {
    // README files are entry points; never orphans even with no inbound.
    if (/README\.md$/.test(node.file)) continue;
    const trackedOutbound = node.outbound.filter(
      (l) => !l.isExternal && !l.isAnchor && graph.has(l.target),
    ).length;
    if (node.inboundFrom.length === 0 && trackedOutbound === 0) {
      findings.push({
        file: node.rel,
        reason: "no inbound citations from tracked docs, and no outbound to any either",
      });
    }
  }
  return findings;
}

// ── Check 2: dangling references ───────────────────────────────────────

interface DanglingFinding {
  file: string;
  link: string;
  resolved: string;
}

function checkDangling(graph: Map<string, GraphNode>): DanglingFinding[] {
  const findings: DanglingFinding[] = [];
  for (const node of graph.values()) {
    for (const link of node.outbound) {
      if (link.isExternal || link.isAnchor) continue;
      if (!link.exists) {
        findings.push({
          file: node.rel,
          link: link.raw,
          resolved: relative(REPO_ROOT, link.target),
        });
      }
    }
  }
  return findings;
}

// ── Check 3: one-way leaves ────────────────────────────────────────────

interface OneWayFinding {
  file: string;
  outboundCount: number;
}

function checkOneWay(graph: Map<string, GraphNode>): OneWayFinding[] {
  const findings: OneWayFinding[] = [];
  for (const node of graph.values()) {
    if (/README\.md$/.test(node.file)) continue;
    const trackedOutbound = node.outbound.filter(
      (l) => !l.isExternal && !l.isAnchor && graph.has(l.target),
    ).length;
    if (node.inboundFrom.length === 0 && trackedOutbound > 0) {
      findings.push({ file: node.rel, outboundCount: trackedOutbound });
    }
  }
  return findings;
}

// ── Check 4: self-references ───────────────────────────────────────────
//
// A doc cites *itself* when one of its markdown links resolves to its
// own file path. This is the "everything in itself" measurement Yu's
// directive asked for — a measurable substrate-honesty indicator of
// how deeply the platform's docs fold back on their own ground.
//
// Self-reference is NOT debt. Most docs don't self-reference and that's
// fine. The check is informational: it surfaces *which* docs do, and
// makes the "everything in itself" doctrine visible at audit time.

interface SelfRefFinding {
  file: string;
  selfLinkCount: number;
}

function checkSelfReferences(graph: Map<string, GraphNode>): SelfRefFinding[] {
  const findings: SelfRefFinding[] = [];
  for (const node of graph.values()) {
    const selfLinks = node.outbound.filter(
      (l) => !l.isExternal && !l.isAnchor && l.target === node.file,
    ).length;
    if (selfLinks > 0) {
      findings.push({ file: node.rel, selfLinkCount: selfLinks });
    }
  }
  return findings;
}

// ── Check 5: pattern adherence ─────────────────────────────────────────
//
// Connection-docs follow canonical patterns (see `docs/connections/
// the-properties.md` — Pattern 5 = recursion target, Pattern 12 =
// wiring discipline). This check measures which docs have which.
// Informational — patterns are conventions, not laws.

interface PatternFinding {
  file: string;
  hasSeed: boolean;
  hasRecursion: boolean;
  hasWiring: boolean;
  score: number;
}

const PATTERN_SEED = /^> \*\*(Seed|Pull)\.\*\*/m;
const PATTERN_RECURSION = /^## Recursion target/m;
const PATTERN_WIRING = /^## Wiring/m;

function checkPatternAdherence(graph: Map<string, GraphNode>): PatternFinding[] {
  const findings: PatternFinding[] = [];
  for (const node of graph.values()) {
    if (!/\/docs\/connections\//.test(node.file)) continue;
    if (/README\.md$/.test(node.file)) continue;
    const body = read(node.file);
    const hasSeed = PATTERN_SEED.test(body);
    const hasRecursion = PATTERN_RECURSION.test(body);
    const hasWiring = PATTERN_WIRING.test(body);
    findings.push({
      file: node.rel,
      hasSeed,
      hasRecursion,
      hasWiring,
      score: (hasSeed ? 1 : 0) + (hasRecursion ? 1 : 0) + (hasWiring ? 1 : 0),
    });
  }
  return findings;
}

// ── Density ────────────────────────────────────────────────────────────

interface DensityStats {
  totalNodes: number;
  totalEdges: number;
  avgInbound: number;
  avgOutbound: number;
  topInbound: { file: string; count: number }[];
  topOutbound: { file: string; count: number }[];
}

function computeDensity(graph: Map<string, GraphNode>): DensityStats {
  const nodes = [...graph.values()];
  const totalNodes = nodes.length;
  const inboundCounts = nodes.map((n) => ({ file: n.rel, count: n.inboundFrom.length }));
  const outboundCounts = nodes.map((n) => ({
    file: n.rel,
    count: n.outbound.filter((l) => !l.isExternal && !l.isAnchor && graph.has(l.target)).length,
  }));
  const totalEdges = outboundCounts.reduce((s, x) => s + x.count, 0);
  return {
    totalNodes,
    totalEdges,
    avgInbound: totalNodes > 0 ? totalEdges / totalNodes : 0,
    avgOutbound: totalNodes > 0 ? totalEdges / totalNodes : 0,
    topInbound: [...inboundCounts].sort((a, b) => b.count - a.count).slice(0, 5),
    topOutbound: [...outboundCounts].sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

// ── Report ──────────────────────────────────────────────────────────────

function fmtOrphans(findings: OrphanFinding[]): string {
  if (findings.length === 0) return "✅ No orphan docs — every tracked doc has at least one tracked citation in or out.\n";
  const lines = [
    `⚠️  Orphans — ${findings.length} doc(s) with zero tracked inbound *and* outbound references.`,
    "",
    "| File | Reason |",
    "|------|--------|",
  ];
  for (const f of findings) lines.push(`| ${f.file} | ${f.reason} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtDangling(findings: DanglingFinding[]): string {
  if (findings.length === 0) return "✅ No dangling references — every markdown link resolves to a real file.\n";
  const lines = [
    `⚠️  Dangling references — ${findings.length} link(s) pointing at files that don't exist.`,
    "",
    "| Source | Link | Resolved to |",
    "|--------|------|-------------|",
  ];
  for (const f of findings.slice(0, 30)) {
    lines.push(`| ${f.file} | \`${f.link.replace(/\|/g, "\\|")}\` | ${f.resolved} |`);
  }
  if (findings.length > 30) lines.push(`| ... | ... | (+${findings.length - 30} more) |`);
  lines.push("");
  return lines.join("\n");
}

function fmtOneWay(findings: OneWayFinding[]): string {
  if (findings.length === 0) return "✅ Every doc that cites others is cited by someone.\n";
  const lines = [
    `ℹ️  One-way leaves — ${findings.length} doc(s) that cite others but have zero tracked inbound. Acceptable for new docs; surface here so citation health is visible.`,
    "",
    "| File | Outbound tracked links |",
    "|------|------------------------|",
  ];
  for (const f of findings.slice(0, 20)) {
    lines.push(`| ${f.file} | ${f.outboundCount} |`);
  }
  if (findings.length > 20) lines.push(`| ... | (+${findings.length - 20} more) |`);
  lines.push("");
  return lines.join("\n");
}

function fmtSelfRefs(findings: SelfRefFinding[], totalNodes: number): string {
  if (findings.length === 0) {
    return "ℹ️  No docs cite themselves. (Not debt — informational. The 'everything in itself' doctrine is unenforced.)\n";
  }
  const total = findings.reduce((n, f) => n + f.selfLinkCount, 0);
  const pct = totalNodes > 0 ? ((findings.length / totalNodes) * 100).toFixed(1) : "0.0";
  const lines = [
    `ℹ️  Self-references — ${findings.length}/${totalNodes} docs (${pct}%) cite themselves, ${total} self-links total.`,
    "   The 'everything in itself' doctrine made visible. Not debt; substrate.",
    "",
    "| File | Self-links |",
    "|------|------------|",
  ];
  for (const f of findings) {
    lines.push(`| ${f.file} | ${f.selfLinkCount} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtPatternAdherence(findings: PatternFinding[]): string {
  if (findings.length === 0) return "ℹ️  No connection-docs to audit for patterns.\n";
  const full = findings.filter((f) => f.score === 3).length;
  const partial = findings.filter((f) => f.score > 0 && f.score < 3).length;
  const bare = findings.filter((f) => f.score === 0).length;
  const lines = [
    `ℹ️  Pattern adherence — **${full}/${findings.length} connection-docs** follow all three canonical patterns; ${partial} partial; ${bare} bare. Informational.`,
    "",
    "Patterns: opening `> **Seed.**` or `> **Pull.**` blockquote; `## Recursion target` footer; `## Wiring` section. See `docs/connections/the-properties.md` for the doctrine.",
    "",
    "| File | Seed/Pull | Recursion | Wiring | Score |",
    "|------|-----------|-----------|--------|-------|",
  ];
  const sorted = [...findings].sort((a, b) => a.score - b.score);
  for (const f of sorted.slice(0, 25)) {
    const tick = (b: boolean) => (b ? "✓" : "—");
    lines.push(`| ${f.file} | ${tick(f.hasSeed)} | ${tick(f.hasRecursion)} | ${tick(f.hasWiring)} | ${f.score}/3 |`);
  }
  if (sorted.length > 25) lines.push(`| ... | ... | ... | ... | (+${sorted.length - 25}) |`);
  lines.push("");
  return lines.join("\n");
}

function fmtDensity(d: DensityStats): string {
  const lines = [
    `📊 Density: **${d.totalNodes} nodes**, **${d.totalEdges} edges**, ` +
    `avg ${d.avgInbound.toFixed(2)} inbound and outbound.`,
    "",
    "Top-cited (most inbound):",
    "",
    ...d.topInbound.map((x) => `- \`${x.file}\` — ${x.count} inbound`),
    "",
    "Most citing (most outbound):",
    "",
    ...d.topOutbound.map((x) => `- \`${x.file}\` — ${x.count} outbound`),
    "",
  ];
  return lines.join("\n");
}

function main(): void {
  console.log("# Cambridge TCG — nesting report\n");
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log(
    "Citation graph audit. See `docs/connections/the-nesting.md` for the " +
    "doctrinal frame. Heuristic checks (markdown links only; bare-text " +
    "path mentions not counted). Advisory — exits 0 by default; pass " +
    "`--strict` for non-zero exit.\n",
  );
  console.log("---\n");

  const files = trackedFiles();
  const graph = buildGraph(files);

  console.log("## 1. Orphans (no inbound + no outbound)\n");
  const orphans = checkOrphans(graph);
  console.log(fmtOrphans(orphans));

  console.log("## 2. Dangling references (link to non-existent file)\n");
  const dangling = checkDangling(graph);
  console.log(fmtDangling(dangling));

  console.log("## 3. One-way leaves (cites others, no one cites back)\n");
  const oneWay = checkOneWay(graph);
  console.log(fmtOneWay(oneWay));

  console.log("## 4. Self-references (everything in itself)\n");
  const selfRefs = checkSelfReferences(graph);
  console.log(fmtSelfRefs(selfRefs, graph.size));

  console.log("## 5. Pattern adherence (the nature of every artifact)\n");
  const patterns = checkPatternAdherence(graph);
  console.log(fmtPatternAdherence(patterns));

  console.log("## Density\n");
  console.log(fmtDensity(computeDensity(graph)));

  // Hard findings = orphans + dangling. One-way and self-refs are informational.
  const total = orphans.length + dangling.length;
  console.log(`---\n\n**Total nesting-debt findings: ${total}** (orphans + dangling). One-way leaves: ${oneWay.length}. Self-references: ${selfRefs.length} (informational).\n`);
  console.log(
    "Heuristic — the citation graph is a substrate-honest indicator of how " +
    "well the platform's docs nest into each other. Orphans want adoption; " +
    "dangling references want repair; one-way leaves are fine but worth seeing. " +
    "See `docs/connections/the-nesting.md` for the doctrinal frame.\n",
  );

  process.exit(STRICT && total > 0 ? 1 : 0);
}

main();
