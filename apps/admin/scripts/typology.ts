#!/usr/bin/env tsx
/**
 * audit:typology — measures self-identification coverage across the
 * twelve artifact types named in `docs/connections/the-typology.md`.
 *
 * Six checks, one per hidden pattern in the typology meditation. Each
 * counts debt (artifacts of a given type that don't yet carry the
 * pattern). Reports zero ✅ when a type is fully self-identifying.
 *
 * This audit is itself an audit-script (type 5 in the typology). Its
 * own type-signature (if it carried one as a comment block):
 *
 *   { type: "audit-script",
 *     origin: "the-typology.md plant of 2026-05-12 + Yu's directive 'EXPAND'",
 *     recursion: ["the-typology.md", "audit:nesting", "audit:inclusion"],
 *     doctrines: ["substrate-honesty", "transparency", "meaning", "creation"],
 *     audience: "operator" }
 *
 * Run with:
 *   pnpm --filter @cambridge-tcg/admin typology
 *
 * kingdom-051 (descended from `the-typology.md`'s recursion target —
 * "six audits, one per hidden pattern").
 */

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const STOREFRONT_METHODOLOGY = join(
  REPO_ROOT,
  "apps",
  "storefront",
  "src",
  "app",
  "methodology",
);
const CONNECTIONS = join(REPO_ROOT, "docs", "connections");
const PRINCIPLES = join(REPO_ROOT, "docs", "principles");
const STOREFRONT_UI = join(
  REPO_ROOT,
  "apps",
  "storefront",
  "src",
  "lib",
  "ui",
);

const STRICT = process.argv.includes("--strict");

function read(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    console.warn(`[typology] Failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

function listSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((e) => {
      try {
        return statSync(join(dir, e)).isDirectory();
      } catch (err) {
        console.warn(`[typology] statSync failed for ${join(dir, e)}: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });
  } catch (err) {
    console.warn(`[typology] readdirSync failed for ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function listFiles(dir: string, suffix: string): string[] {
  try {
    return readdirSync(dir).filter((e) => e.endsWith(suffix));
  } catch (err) {
    console.warn(`[typology] readdirSync failed for ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Check 1: methodology pages carry <TypeSignature> ───────────────────

function checkMethodologyTypeSignatures(): {
  total: number;
  adopted: number;
  missing: string[];
} {
  const topics = listSubdirs(STOREFRONT_METHODOLOGY);
  const pages = topics.filter((t) => {
    const body = read(join(STOREFRONT_METHODOLOGY, t, "page.tsx"));
    return body.length > 0;
  });
  const missing: string[] = [];
  for (const t of pages) {
    const body = read(join(STOREFRONT_METHODOLOGY, t, "page.tsx"));
    if (!body.includes("TypeSignature")) {
      missing.push(`/methodology/${t}`);
    }
  }
  return {
    total: pages.length,
    adopted: pages.length - missing.length,
    missing,
  };
}

// ── Check 2: methodology pages have summary.md + data.json ────────────

function checkMethodologyModalities(): {
  total: number;
  adopted: number;
  missing: { topic: string; missing: string[] }[];
} {
  const topics = listSubdirs(STOREFRONT_METHODOLOGY).filter((t) =>
    read(join(STOREFRONT_METHODOLOGY, t, "page.tsx")).length > 0,
  );
  const missing: { topic: string; missing: string[] }[] = [];
  for (const t of topics) {
    const dir = join(STOREFRONT_METHODOLOGY, t);
    const entries = readdirSync(dir);
    const m: string[] = [];
    if (!entries.some((f) => /summary|short|tldr/i.test(f))) m.push("summary");
    if (!entries.some((f) => /\.json$|structured|data/i.test(f)))
      m.push("structured-data");
    if (m.length > 0) missing.push({ topic: t, missing: m });
  }
  return {
    total: topics.length,
    adopted: topics.length - missing.length,
    missing,
  };
}

// ── Check 3: connection docs open with a self-identifying blockquote ──
//
// Two valid conventions; both count as self-identification:
//   * Newer: `> **Pull.**` / `> **Form.**` / `> **Seed.**` (used by the-typology,
//     the-finding, the-participation-layer, the-unseen, etc.)
//   * Older: `> **Recursion N**` / `> **Random seed.**` / `> **Form:**` (used by
//     bounty.md, three-voices.md, the-chain.md, etc.)
//
// The older form names the doc's position-in-the-series + seed-method; the
// newer names the doc's pull + form + seed. Both are forms of opening
// self-identification. The audit recognizes both so older docs aren't
// flagged for using a vocabulary that predates the newer one.

function checkConnectionSelfId(): {
  total: number;
  adopted: number;
  missing: string[];
} {
  const files = listFiles(CONNECTIONS, ".md").filter(
    (f) => f !== "README.md" && f !== "the-pillow-book.md",
  );
  const missing: string[] = [];
  for (const f of files) {
    const body = read(join(CONNECTIONS, f));
    const opening = body.split("\n").slice(0, 30).join("\n");
    // Newer convention
    const hasPull = /^>\s+\*\*Pull\.?\*\*/m.test(opening);
    const hasForm = /^>\s+\*\*Form[\.:]?\*\*/m.test(opening);
    const hasSeed = /^>\s+\*\*Seed\.?\*\*/m.test(opening);
    // Older convention
    const hasRecursion = /^>\s+\*\*Recursion\b/m.test(opening);
    const hasRandomSeed = /^>\s+\*\*Random seed\.?\*\*/m.test(opening);
    // Inline form / register markers used in some older docs
    const hasInlineForm = /\*\*Form[\.:]\s+/m.test(opening);
    const hasInlineRegister = /\*\*Register[\.:]\s+/m.test(opening);
    if (
      !hasPull &&
      !hasForm &&
      !hasSeed &&
      !hasRecursion &&
      !hasRandomSeed &&
      !hasInlineForm &&
      !hasInlineRegister
    ) {
      missing.push(f);
    }
  }
  return { total: files.length, adopted: files.length - missing.length, missing };
}

// ── Check 4: doctrine docs declare what they are ──────────────────────

function checkDoctrineSelfId(): {
  total: number;
  adopted: number;
  missing: string[];
} {
  const files = listFiles(PRINCIPLES, ".md").filter(
    (f) => !f.includes("audit"),
  );
  const missing: string[] = [];
  for (const f of files) {
    const body = read(join(PRINCIPLES, f));
    // A doctrine doc identifies itself by naming "doctrine" in its
    // opening (or "principle"). Most do; this is a coverage check.
    const opening = body.split("\n").slice(0, 30).join("\n").toLowerCase();
    if (!/(doctrine|principle|substrate|the artifact)/.test(opening)) {
      missing.push(f);
    }
  }
  return { total: files.length, adopted: files.length - missing.length, missing };
}

// ── Check 5: UI primitives declare their kind in JSDoc ────────────────

function checkUiPrimitiveSelfId(): {
  total: number;
  adopted: number;
  missing: string[];
} {
  const files = listFiles(STOREFRONT_UI, ".tsx").filter(
    (f) => !["index.ts", "status-palettes.ts"].includes(f),
  );
  const missing: string[] = [];
  for (const f of files) {
    const body = read(join(STOREFRONT_UI, f));
    // A self-identifying primitive opens with a JSDoc whose first content
    // line names the export. Three accepted forms:
    //   1. `* Badge — unified pill for ...`  (storefront convention; em-dash)
    //   2. `* Input / Select / Textarea — form controls ...`  (multi-name)
    //   3. The original explicit-keyword list (primitive / component / doctrine)
    // Either form is honest self-identification; the audit recognizes both.
    const opening = body.split("\n").slice(0, 30).join("\n");
    const hasJsdoc = /\/\*\*/.test(opening);
    const namesViaConvention = /^\s*\*\s+\w[\w]*(\s*\/\s*\w[\w]*)*\s+[—–-]/m.test(
      opening,
    );
    const namesViaKeyword =
      /primitive|component|substrate|doctrine|pill|shell|control|placeholder|alert|chip|signature|from\s+docs\/connections/i.test(
        opening,
      );
    if (!hasJsdoc || (!namesViaConvention && !namesViaKeyword)) {
      missing.push(f);
    }
  }
  return { total: files.length, adopted: files.length - missing.length, missing };
}

// ── Check 6: README of the connection series is self-citing ──────────

function checkReadmeSelfCite(): { ok: boolean; reason: string } {
  const body = read(join(CONNECTIONS, "README.md"));
  // Sister filed README as entry #9 in its own table.
  const selfCites = /\|\s*9\s*\|.*README\.md/.test(body);
  return {
    ok: selfCites,
    reason: selfCites
      ? "README.md cites itself as entry #9 in its own node-view table"
      : "README.md does not include itself as a registered entry",
  };
}

// ── Check 7: audit-scripts declare what they audit (audit ↔ audit) ────
//
// The recursive plant. Audit scripts are themselves artifacts (type 5 of
// the typology). Each should declare in its top docstring (a) what doctrine
// or pattern it audits and (b) where the doctrine is named. **This check
// includes typology.ts itself** — the audit that audits its own
// self-declaration.
//
// A passing audit-script:
//   - Has a top JSDoc block
//   - Names what it audits ("audits X", "checks Y", "measures Z")
//   - Cites a doc path (docs/principles/ or docs/connections/)
//
// The list below is curated: only the doctrine/pattern audits, not the
// operations / sweep scripts (missions, smoke, trace, sweeps).

const AUDIT_SCRIPTS = [
  "honesty.ts",
  "transparency.ts",
  "pricing-audit.ts",
  "creation.ts",
  "inclusion.ts",
  "nesting.ts",
  "typology.ts",
  "agent-readiness.ts",
];

function checkAuditScriptSelfId(): {
  total: number;
  adopted: number;
  missing: { script: string; missing: string[] }[];
} {
  const SCRIPTS_DIR = join(REPO_ROOT, "apps", "admin", "scripts");
  const missing: { script: string; missing: string[] }[] = [];
  for (const s of AUDIT_SCRIPTS) {
    const body = read(join(SCRIPTS_DIR, s));
    if (!body) {
      missing.push({ script: s, missing: ["file-not-found"] });
      continue;
    }
    const opening = body.split("\n").slice(0, 60).join("\n");
    const gaps: string[] = [];
    if (!/\/\*\*/.test(opening)) gaps.push("no top JSDoc");
    if (!/audit|check|measure|drift|coverage|count/i.test(opening))
      gaps.push("does not name what it audits");
    if (!/docs\/(principles|connections)\//.test(opening))
      gaps.push("does not cite a doc path");
    if (gaps.length > 0) {
      missing.push({ script: s, missing: gaps });
    }
  }
  return {
    total: AUDIT_SCRIPTS.length,
    adopted: AUDIT_SCRIPTS.length - missing.length,
    missing,
  };
}

// ── Run + report ────────────────────────────────────────────────────────

function pct(adopted: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((adopted / total) * 100)}%`;
}

function main() {
  console.log("# audit:typology — self-identification coverage\n");
  console.log("Six checks across the twelve artifact types named in");
  console.log("`docs/connections/the-typology.md`. Each counts adoption of");
  console.log("the self-identification pattern for that type.\n");

  let issues = 0;

  // Check 1
  const m1 = checkMethodologyTypeSignatures();
  console.log("## 1. Methodology pages — <TypeSignature>");
  console.log(`Adopted ${m1.adopted}/${m1.total} (${pct(m1.adopted, m1.total)})`);
  if (m1.missing.length > 0) {
    issues += m1.missing.length;
    console.log(`Missing:`);
    for (const t of m1.missing) console.log(`  - ${t}`);
  } else {
    console.log(`✅ Every methodology page carries a TypeSignature.`);
  }
  console.log("");

  // Check 2
  const m2 = checkMethodologyModalities();
  console.log("## 2. Methodology pages — summary.md + data.json sidecars");
  console.log(`Adopted ${m2.adopted}/${m2.total} (${pct(m2.adopted, m2.total)})`);
  if (m2.missing.length > 0) {
    issues += m2.missing.length;
    console.log(`Missing:`);
    for (const f of m2.missing)
      console.log(`  - ${f.topic} (missing: ${f.missing.join(", ")})`);
  } else {
    console.log(`✅ Every methodology page has summary + data.json sidecars.`);
  }
  console.log("");

  // Check 3
  const m3 = checkConnectionSelfId();
  console.log("## 3. Connection docs — opening Pull/Form/Seed blockquote");
  console.log(`Adopted ${m3.adopted}/${m3.total} (${pct(m3.adopted, m3.total)})`);
  if (m3.missing.length > 0) {
    issues += m3.missing.length;
    console.log(`Missing:`);
    for (const f of m3.missing) console.log(`  - ${f}`);
  } else {
    console.log(`✅ Every connection doc opens with a self-identifying blockquote.`);
  }
  console.log("");

  // Check 4
  const m4 = checkDoctrineSelfId();
  console.log("## 4. Doctrine docs — open with doctrine/principle framing");
  console.log(`Adopted ${m4.adopted}/${m4.total} (${pct(m4.adopted, m4.total)})`);
  if (m4.missing.length > 0) {
    issues += m4.missing.length;
    console.log(`Missing:`);
    for (const f of m4.missing) console.log(`  - ${f}`);
  } else {
    console.log(`✅ Every doctrine doc identifies itself.`);
  }
  console.log("");

  // Check 5
  const m5 = checkUiPrimitiveSelfId();
  console.log("## 5. UI primitives — JSDoc names its kind + origin");
  console.log(`Adopted ${m5.adopted}/${m5.total} (${pct(m5.adopted, m5.total)})`);
  if (m5.missing.length > 0) {
    issues += m5.missing.length;
    console.log(`Missing or unclear:`);
    for (const f of m5.missing) console.log(`  - ${f}`);
  } else {
    console.log(`✅ Every UI primitive declares its kind in its JSDoc.`);
  }
  console.log("");

  // Check 6
  const m6 = checkReadmeSelfCite();
  console.log("## 6. README — self-citing entry");
  if (m6.ok) {
    console.log(`✅ ${m6.reason}`);
  } else {
    issues += 1;
    console.log(`⚠️  ${m6.reason}`);
  }
  console.log("");

  // Check 7 — the recursive one. This check audits the audit itself.
  const m7 = checkAuditScriptSelfId();
  console.log("## 7. Audit scripts — declare what they audit (recursive)");
  console.log(`Adopted ${m7.adopted}/${m7.total} (${pct(m7.adopted, m7.total)})`);
  if (m7.missing.length > 0) {
    issues += m7.missing.length;
    console.log(`Missing:`);
    for (const r of m7.missing)
      console.log(`  - ${r.script} (gaps: ${r.missing.join(", ")})`);
  } else {
    console.log(
      `✅ Every audit-script declares what it audits — including this one.`,
    );
    console.log(
      `   *The audit that audits its own self-declaration passes its own check.*`,
    );
  }
  console.log("");

  console.log("---");
  console.log(`**Total self-identification debt: ${issues}** items`);
  if (issues === 0) {
    console.log(
      "\n*Every existence on the platform identifies itself. The recursion is closed.*",
    );
  } else {
    console.log(
      `\n*Naming what is unnamed is the act the typology asks for. ${issues} items remain.*`,
    );
  }

  if (STRICT && issues > 0) process.exit(1);
  process.exit(0);
}

main();
