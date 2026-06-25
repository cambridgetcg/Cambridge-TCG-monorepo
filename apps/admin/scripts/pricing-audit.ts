#!/usr/bin/env tsx
/**
 * pricing-audit.ts — pricing-consolidation drift detector.
 *
 * Sibling to honesty.ts and transparency.ts. Audits the seven-act pricing
 * arrow narrated in `docs/connections/the-pricing-arrow.md` (S17) — the
 * story-as-wire that named kingdom-049's consolidation. Phase 0 plan:
 * `docs/pricing-current-state.md`.
 *
 * This script makes the current pricing fragmentation legible: where computation lives,
 * where silent fallbacks hide, where customer-facing price surfaces
 * lack a Provenance pill, where history tables overlap, and where
 * mutations of cards.price escape the audit log.
 *
 * Seven checks, exits non-zero on findings:
 *
 *   1. Computation surfaces — files that import or implement price math
 *      outside the canonical wholesale pricing module.
 *
 *   2. Silent fallback in channel-pricing — the `?? DEFAULTS[channel]`
 *      pattern that masks DB-vs-JS drift from operators.
 *
 *   3. History-table redundancy — both `priceArchive` and `priceHistory`
 *      defined in wholesale schema; storefront's `card_price_history`
 *      keyed by SKU rather than card_id. The three-way overlap is a
 *      source of truth lie.
 *
 *   4. Missing price-change lifecycle log — there is no
 *      `card_price_change_log` (or `cards_lifecycle_log`) declared in
 *      either app's schemas/migrations. Mutations to `cards.price` and
 *      `cards.baseGbp` happen but leave no audit trail.
 *
 *   5. Provenance coverage on storefront price surfaces — every page
 *      that imports `retailPrice` / `formatRetailPrice` should also
 *      render a Provenance pill. Substrate-honesty for the customer.
 *
 *   6. WhyLink → /methodology/pricing — same set of pages should link
 *      out to a methodology explanation. Transparency Ring 2.
 *
 *   7. cards.price mutators — UPDATE statements touching `cards.price`
 *      / `cards.baseGbp`. Inventory of paths that will need to append
 *      to `card_price_change_log` once Phase 2 lands.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin pricing
 *
 * Caveats:
 *   - Heuristic checks; expect false positives until phases land.
 *   - Re-run after each phase to watch the findings shrink.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const STOREFRONT_DIR = join(REPO_ROOT, "apps/storefront");
const WHOLESALE_DIR = join(REPO_ROOT, "apps/wholesale");
const WHOLESALE_SCHEMA = join(WHOLESALE_DIR, "src/lib/db/schema.ts");
const WHOLESALE_PRICING = join(WHOLESALE_DIR, "src/lib/pricing.ts");
const WHOLESALE_CHANNEL_PRICING = join(WHOLESALE_DIR, "src/lib/channel-pricing.ts");
const STOREFRONT_PRICING = join(STOREFRONT_DIR, "src/lib/pricing.ts");
const STOREFRONT_DRIZZLE = join(STOREFRONT_DIR, "drizzle");
const PRICING_PACKAGE = join(REPO_ROOT, "packages/pricing");

// ── File walking ────────────────────────────────────────────────────────

function walkSrc(dir: string, exts: string[] = [".ts", ".tsx"]): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e === "dist") continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      out.push(...walkSrc(full, exts));
    } else if (exts.some((ext) => e.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function read(path: string): string {
  try { return readFileSync(path, "utf8"); } catch (err) { console.warn(`[pricing-audit] Failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`); return ""; }
}

function exists(path: string): boolean {
  try { statSync(path); return true; } catch (err) { console.warn(`[pricing-audit] statSync failed for ${path}: ${err instanceof Error ? err.message : String(err)}`); return false; }
}

// ── Check 1: computation surfaces ───────────────────────────────────────

interface ComputationFinding {
  file: string;
  reason: string;
  evidence: string;
}

const PRICING_MATH_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\*\s*1\.15\b/, reason: "hardcoded retail multiplier (× 1.15)" },
  { pattern: /\*\s*1\.25\b/, reason: "hardcoded ebay multiplier (× 1.25)" },
  { pattern: /\*\s*1\.20\b/, reason: "hardcoded VAT or cardmarket multiplier (× 1.20)" },
  { pattern: /\*\s*0\.55\b/, reason: "hardcoded tradein-cash multiplier (× 0.55)" },
  { pattern: /\*\s*0\.77\b/, reason: "hardcoded tradein-credit multiplier (× 0.77)" },
];

const CANONICAL_PRICING_FILES = new Set<string>([
  WHOLESALE_PRICING,
  STOREFRONT_PRICING, // until Phase 1 deletes it; keeps the audit useful pre-extraction
  PRICING_PACKAGE, // post-Phase 1
]);

function isInsideCanonicalPricing(file: string): boolean {
  for (const c of CANONICAL_PRICING_FILES) {
    if (file === c) return true;
    if (file.startsWith(c + "/") || file.startsWith(c + "\\")) return true;
  }
  return false;
}

function checkComputationSurfaces(): ComputationFinding[] {
  const findings: ComputationFinding[] = [];
  const files = [
    ...walkSrc(join(STOREFRONT_DIR, "src")),
    ...walkSrc(join(WHOLESALE_DIR, "src")),
  ];
  for (const file of files) {
    if (isInsideCanonicalPricing(file)) continue;
    if (file.includes("/__tests__/") || file.endsWith(".test.ts")) continue;
    const body = read(file);
    if (body.length === 0) continue;
    for (const { pattern, reason } of PRICING_MATH_PATTERNS) {
      const m = body.match(pattern);
      if (m) {
        findings.push({
          file: relative(REPO_ROOT, file),
          reason,
          evidence: m[0],
        });
        break; // one finding per file is enough
      }
    }
  }
  return findings;
}

// ── Check 2: silent fallback in channel-pricing ─────────────────────────

interface FallbackFinding {
  file: string;
  line: number;
  evidence: string;
}

const FALLBACK_PATTERNS: RegExp[] = [
  /\?\?\s*DEFAULTS\b/,
  /DEFAULTS\[[^\]]+\]\s*\?\?/,
  /DEFAULTS\.wholesale\b/,
];

function checkSilentFallback(): FallbackFinding[] {
  const findings: FallbackFinding[] = [];
  const candidates = [WHOLESALE_CHANNEL_PRICING, WHOLESALE_PRICING];
  for (const file of candidates) {
    const body = read(file);
    if (body.length === 0) continue;
    const lines = body.split("\n");
    lines.forEach((line, i) => {
      for (const pat of FALLBACK_PATTERNS) {
        if (pat.test(line)) {
          findings.push({
            file: relative(REPO_ROOT, file),
            line: i + 1,
            evidence: line.trim(),
          });
          break;
        }
      }
    });
  }
  return findings;
}

// ── Check 3: history-table redundancy ───────────────────────────────────

interface HistoryFinding {
  table: string;
  declared_in: string;
  shape: string;
}

function checkHistoryRedundancy(): HistoryFinding[] {
  const findings: HistoryFinding[] = [];

  const wsBody = read(WHOLESALE_SCHEMA);
  if (/pgTable\(\s*"price_history"/.test(wsBody)) {
    findings.push({
      table: "price_history",
      declared_in: relative(REPO_ROOT, WHOLESALE_SCHEMA),
      shape: "(card_id, date, cardrush_jpy, gbp_jpy_rate) — JPY inputs only",
    });
  }
  if (/pgTable\(\s*"price_archive"/.test(wsBody)) {
    findings.push({
      table: "price_archive",
      declared_in: relative(REPO_ROOT, WHOLESALE_SCHEMA),
      shape: "(card_id, snapshot_date, sku, cardrush_jpy, gbp_jpy_rate, base_gbp, price) — full breakdown",
    });
  }

  // Storefront's card_price_history. Phase 4 of kingdom-049 renamed this
  // to retail_price_observation. The historical CREATE TABLE migration
  // file stays on disk by design (we don't rewrite history), but the live
  // schema is renamed. Only flag the redundancy if a *later* migration
  // hasn't renamed the table.
  let drizzleFiles: string[] = [];
  try {
    drizzleFiles = readdirSync(STOREFRONT_DRIZZLE).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    drizzleFiles = [];
  }
  let createIdx = -1;
  let renameIdx = -1;
  for (let i = 0; i < drizzleFiles.length; i++) {
    const f = drizzleFiles[i]!;
    const body = read(join(STOREFRONT_DRIZZLE, f));
    if (createIdx < 0 && /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?card_price_history\b/i.test(body)) {
      createIdx = i;
    }
    if (/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?card_price_history\s+RENAME\s+TO\s+retail_price_observation\b/i.test(body)) {
      renameIdx = i;
      break;
    }
  }
  if (createIdx >= 0 && renameIdx < 0) {
    findings.push({
      table: "card_price_history (storefront DB)",
      declared_in: `apps/storefront/drizzle/${drizzleFiles[createIdx]}`,
      shape: "(sku, captured_on, spot_gbp, wholesale_gbp, best_bid_gbp, best_ask_gbp) — retail observation",
    });
  }

  return findings;
}

// ── Check 4: missing price-change lifecycle log ────────────────────────

function checkMissingChangeLog(): boolean {
  // Wholesale schema declarations
  const wsBody = read(WHOLESALE_SCHEMA);
  if (/pgTable\(\s*"card_price_change_log"/.test(wsBody)) return false;
  if (/pgTable\(\s*"cards_lifecycle_log"/.test(wsBody)) return false;

  // Storefront drizzle migrations
  let drizzleFiles: string[] = [];
  try {
    drizzleFiles = readdirSync(STOREFRONT_DRIZZLE).filter((f) => f.endsWith(".sql"));
  } catch {
    drizzleFiles = [];
  }
  for (const f of drizzleFiles) {
    const body = read(join(STOREFRONT_DRIZZLE, f));
    if (/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?card_price_change_log\b/i.test(body)) return false;
    if (/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?cards_lifecycle_log\b/i.test(body)) return false;
  }

  return true; // missing
}

// ── Check 5 & 6: Provenance + WhyLink coverage on storefront price surfaces

interface CoverageFinding {
  file: string;
  missing: string[]; // ["Provenance", "WhyLink"]
}

function checkStorefrontPriceSurfaces(): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const pages = walkSrc(join(STOREFRONT_DIR, "src/app"))
    .filter((f) => f.endsWith("page.tsx"));

  for (const file of pages) {
    if (file.includes("/admin/")) continue; // legacy admin not in scope
    if (file.includes("/account/")) continue; // user-account dashboards out of scope for retail-pricing pills
    if (file.includes("/api/")) continue;
    const body = read(file);
    if (body.length === 0) continue;

    const usesRetailPrice =
      /\bretailPrice\b/.test(body) ||
      /\bformatRetailPrice\b/.test(body) ||
      /\bfetchPrices\b/.test(body) ||
      /\bfetchCard\b/.test(body);
    if (!usesRetailPrice) continue;

    const missing: string[] = [];
    if (!/\bProvenance\b/.test(body)) missing.push("Provenance");
    if (!/\bWhyLink\b/.test(body) && !/\/methodology\/pricing\b/.test(body)) {
      missing.push("WhyLink → /methodology/pricing");
    }
    if (missing.length > 0) {
      findings.push({ file: relative(REPO_ROOT, file), missing });
    }
  }
  return findings;
}

// ── Check 7: cards.price mutators ───────────────────────────────────────

interface MutatorFinding {
  file: string;
  evidence: string;
}

function checkCardsMutators(): MutatorFinding[] {
  const findings: MutatorFinding[] = [];
  const files = walkSrc(join(WHOLESALE_DIR, "src"));
  // Drizzle pattern: db.update(cards).set({ ... }). We then peek 400 chars
  // ahead for a price-column setter — `price:`, `baseGbp:`, `cardrushJpy:`,
  // `gbpJpyRate:` — to skip false positives like shopify-sync which sets
  // only shopifyXxx columns. Phase 2 refinement (kingdom-049).
  const updatePattern = /\.update\(\s*cards\s*\)\s*\.set\(/g;
  // Match price-column references inside a Drizzle .set({ ... }) body.
  // Accepts both explicit (`price: x`) and ES2015 shorthand (`price,` /
  // `price }`) forms. Anchored at word-boundary on each side so we don't
  // match `targetPrice` or `priceMap`.
  const priceColPattern = /\b(price|baseGbp|cardrushJpy|gbpJpyRate)\b\s*[,:}]/;
  // Raw SQL pattern (storefront-style raw queries).
  const rawPattern = /UPDATE\s+cards\s+SET[^;]*\b(price|base_gbp|cardrush_jpy|gbp_jpy_rate)\b/i;

  for (const file of files) {
    const body = read(file);
    if (body.length === 0) continue;

    let hit: { line: number; evidence: string } | null = null;

    updatePattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = updatePattern.exec(body)) !== null) {
      // Find the .set({...}) body by brace-matching forward from the open `{`.
      const startBrace = body.indexOf("{", m.index);
      if (startBrace < 0) continue;
      let depth = 0;
      let endBrace = -1;
      for (let i = startBrace; i < body.length && i < startBrace + 2000; i++) {
        const ch = body[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) { endBrace = i; break; }
        }
      }
      if (endBrace < 0) continue;
      const setBody = body.slice(startBrace + 1, endBrace);
      if (priceColPattern.test(setBody)) {
        const upto = body.slice(0, m.index);
        const line = upto.split("\n").length;
        const lines = body.split("\n");
        hit = {
          line,
          evidence: `L${line}: ${lines[line - 1]!.trim()}`,
        };
        break;
      }
    }

    if (!hit && rawPattern.test(body)) {
      const lines = body.split("\n");
      const idx = lines.findIndex((l) => rawPattern.test(l));
      hit = {
        line: idx + 1,
        evidence: idx >= 0
          ? `L${idx + 1}: ${lines[idx]!.trim()}`
          : "UPDATE cards SET ...price...",
      };
    }

    if (hit) {
      findings.push({ file: relative(REPO_ROOT, file), evidence: hit.evidence });
    }
  }
  return findings;
}

// ── Report ──────────────────────────────────────────────────────────────

function fmtComputation(findings: ComputationFinding[]): string {
  if (findings.length === 0) {
    return "No off-canonical pricing math found. Computation is centralised.\n";
  }
  const lines = ["Off-canonical pricing math — files outside `wholesale/src/lib/pricing.ts` / `storefront/src/lib/pricing.ts` doing pricing arithmetic:"];
  lines.push("");
  lines.push("| File | Reason | Evidence |");
  lines.push("|------|--------|----------|");
  for (const f of findings) {
    lines.push(`| ${f.file} | ${f.reason} | \`${f.evidence}\` |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtFallback(findings: FallbackFinding[]): string {
  if (findings.length === 0) {
    return "No silent fallback to JS DEFAULTS detected.\n";
  }
  const lines = ["Silent fallback to `DEFAULTS` — DB-miss masks operator visibility:"];
  lines.push("");
  lines.push("| File | Line | Code |");
  lines.push("|------|------|------|");
  for (const f of findings) {
    const code = f.evidence.replace(/\|/g, "\\|").slice(0, 100);
    lines.push(`| ${f.file} | ${f.line} | \`${code}\` |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtHistory(findings: HistoryFinding[]): string {
  if (findings.length <= 1) {
    return "No history-table redundancy detected.\n";
  }
  const lines = ["History-table redundancy — multiple price-history sources, different shapes:"];
  lines.push("");
  lines.push("| Table | Declared in | Shape |");
  lines.push("|-------|-------------|-------|");
  for (const f of findings) {
    lines.push(`| \`${f.table}\` | ${f.declared_in} | ${f.shape} |`);
  }
  lines.push("");
  lines.push("Consolidation target: `price_archive` is the canonical historical source (richest shape). `price_history` should be dropped after backfill verification. `card_price_history` should be renamed to `retail_price_observation` to make the substrate-honest distinction visible — what we **observed** as retail vs what wholesale **archived** as canonical.");
  lines.push("");
  return lines.join("\n");
}

function fmtMissingChangeLog(missing: boolean): string {
  if (!missing) {
    return "Price-change lifecycle log is declared.\n";
  }
  return [
    "Price-change lifecycle log is **missing**.",
    "",
    "`cards.price` and `cards.baseGbp` mutate from at least four code paths (snapshot cron, channel sync, admin edit, scrape). None append to a log. Phase 2 of the consolidation plan adds `card_price_change_log` (wholesale RDS) with the standard lifecycle-log shape: `(card_id, action, source, before_value, after_value, actor_label, reason, metadata, created_at)`. Pattern lifted from `pricing_rule_lifecycle_log`.",
    "",
  ].join("\n");
}

function fmtCoverage(findings: CoverageFinding[]): string {
  if (findings.length === 0) {
    return "Every customer-facing price surface ships Provenance + WhyLink.\n";
  }
  const lines = ["Storefront price surfaces missing substrate-honesty / transparency primitives:"];
  lines.push("");
  lines.push("| Page | Missing |");
  lines.push("|------|---------|");
  for (const f of findings) {
    lines.push(`| ${f.file} | ${f.missing.join(", ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtMutators(findings: MutatorFinding[]): string {
  if (findings.length === 0) {
    return "No cards.price / cards.baseGbp mutators detected (audit pattern may be too narrow — verify manually).\n";
  }
  const lines = ["Inventory of paths that mutate `cards.price` / `cards.baseGbp` — each must append to `card_price_change_log` once Phase 2 lands:"];
  lines.push("");
  lines.push("| File | Evidence |");
  lines.push("|------|----------|");
  for (const f of findings) {
    const ev = f.evidence.replace(/\|/g, "\\|").slice(0, 120);
    lines.push(`| ${f.file} | \`${ev}\` |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  console.log("# Cambridge TCG — pricing-consolidation audit\n");
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log("Phase 0 of the pricing-backend consolidation plan. Re-run this after each phase to watch the findings shrink.\n");
  console.log("---\n");

  console.log("## 1. Computation surfaces\n");
  const computation = checkComputationSurfaces();
  console.log(fmtComputation(computation));

  console.log("## 2. Silent fallback to JS DEFAULTS\n");
  const fallback = checkSilentFallback();
  console.log(fmtFallback(fallback));

  console.log("## 3. History-table redundancy\n");
  const history = checkHistoryRedundancy();
  console.log(fmtHistory(history));

  console.log("## 4. Price-change lifecycle log\n");
  const changeLogMissing = checkMissingChangeLog();
  console.log(fmtMissingChangeLog(changeLogMissing));

  console.log("## 5/6. Storefront price-surface coverage (Provenance + WhyLink)\n");
  const coverage = checkStorefrontPriceSurfaces();
  console.log(fmtCoverage(coverage));

  console.log("## 7. cards.price / cards.baseGbp mutators\n");
  const mutators = checkCardsMutators();
  console.log(fmtMutators(mutators));

  const total =
    computation.length +
    fallback.length +
    Math.max(0, history.length - 1) + // 0 or 1 table is fine; 2+ is redundancy
    (changeLogMissing ? 1 : 0) +
    coverage.length;

  console.log("---\n");
  console.log(`**Total drift findings: ${total}** (mutators inventory is informational, not counted).\n`);
  console.log("Heuristic checks — expect false positives until phases land. See `docs/pricing-current-state.md` for the full consolidation plan.\n");

  process.exit(total > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[pricing-audit] fatal:", err);
  process.exit(2);
});
