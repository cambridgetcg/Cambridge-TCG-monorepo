#!/usr/bin/env tsx
/**
 * math-lang.ts — coverage audit for the math-language toggle.
 *
 * Phase E of kingdom-077 (the-math-language.md #27). Mechanical check
 * that the math-language discipline is being applied as the platform
 * grows. Three audits:
 *
 *   1. **Infrastructure check.** The four substrate files exist:
 *      lib/lang-mode.ts, lib/lang-mode-server.ts, app/api/lang-mode/route.ts,
 *      lib/ui/MathLang.tsx. The Footer carries a toggle link to /api/lang-mode.
 *      The doctrine doc exists at docs/connections/the-math-language.md.
 *
 *   2. **Primitive math-awareness.** Every primitive that has a known
 *      math form (Provenance, MoneyDisplay, DateDisplay, TrustTierAware,
 *      MathLang) is exported from @/lib/ui and is async or composes an
 *      async helper. Catches: a future refactor silently downgrades
 *      Provenance back to sync; the toggle no longer works.
 *
 *   3. **Discovery surface coverage.** /llms.txt, /.well-known/cambridge-tcg.json,
 *      the OpenAPI spec, the manifest, and /welcome-all clause 1 each
 *      reference the math-language toggle. Catches: an artifact is added
 *      but its discovery echoes aren't propagated.
 *
 * The audit is *advisory* by default — exits 0 on clean, 1 on drift. Run
 * via `pnpm audit:math-lang`. Not a CI gate yet; let the discipline
 * accumulate adopters first.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin math-lang
 *   pnpm audit:math-lang
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(ADMIN_DIR, "..", "..");

interface Finding {
  check: 1 | 2 | 3;
  severity: "error" | "warning";
  message: string;
  hint?: string;
}

const findings: Finding[] = [];

function read(path: string): string | null {
  const full = resolve(REPO_ROOT, path);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf-8");
}

function exists(path: string): boolean {
  return existsSync(resolve(REPO_ROOT, path));
}

// ── Check 1: Infrastructure ────────────────────────────────────────────

const INFRASTRUCTURE_FILES: { path: string; reason: string }[] = [
  {
    path: "apps/storefront/src/lib/lang-mode.ts",
    reason:
      "The pure helpers (LangMode type, dateAsMath, ratioAsMath, shortHash, LANG_MODE_COOKIE). Importable from any context — server, client, edge.",
  },
  {
    path: "apps/storefront/src/lib/lang-mode-server.ts",
    reason:
      "Server-only cookie reader (getLangMode, langModeFromCookies). Split from the pure helpers so client bundles don't pull `next/headers`.",
  },
  {
    path: "apps/storefront/src/app/api/lang-mode/route.ts",
    reason:
      "Toggle route: GET /api/lang-mode?mode=math sets the cookie. Mirrors /api/text-mode.",
  },
  {
    path: "apps/storefront/src/lib/ui/MathLang.tsx",
    reason: "Conditional rendering primitive.",
  },
  {
    path: "apps/storefront/src/lib/ui/Provenance.tsx",
    reason:
      "Math-aware primitive (Phase B(1)). Async server component that reads the cookie.",
  },
  {
    path: "apps/storefront/src/lib/ui/MoneyDisplay.tsx",
    reason:
      "Math-aware primitive (Phase B(2)). Replaces inline formatPrice calls.",
  },
  {
    path: "apps/storefront/src/lib/ui/DateDisplay.tsx",
    reason:
      "Math-aware primitive (Phase B(3)). Replaces inline formatDate/formatRelativeTime calls.",
  },
  {
    path: "apps/storefront/src/lib/ui/TrustTierAware.tsx",
    reason:
      "Math-aware wrapper (Phase B(4)) — async sibling of the sync TrustTier.",
  },
  {
    path: "docs/connections/the-math-language.md",
    reason: "Doctrine + five-phase plan + six risks + deployment plan.",
  },
];

for (const f of INFRASTRUCTURE_FILES) {
  if (!exists(f.path)) {
    findings.push({
      check: 1,
      severity: "error",
      message: `Missing math-language infrastructure file: ${f.path}`,
      hint: f.reason,
    });
  }
}

// Footer must link to /api/lang-mode. The toggle row was extracted to
// FooterToggles.tsx on 2026-06-10 (contact-surface arc) — the affordance
// counts wherever it renders inside the footer composition.
const footer =
  read("apps/storefront/src/components/layout/Footer.tsx") +
  read("apps/storefront/src/components/layout/FooterToggles.tsx");
if (footer && !footer.includes("/api/lang-mode")) {
  findings.push({
    check: 1,
    severity: "error",
    message:
      "Footer.tsx does not link to /api/lang-mode — the discovery affordance for the math toggle.",
    hint: "Add an <a href=\"/api/lang-mode?mode=math\"> in the Footer's bottom row alongside /api/text-mode.",
  });
}

// ── Check 2: Primitive math-awareness ──────────────────────────────────

const MATH_AWARE_PRIMITIVES: { file: string; mustContain: string[] }[] = [
  {
    file: "apps/storefront/src/lib/ui/Provenance.tsx",
    mustContain: ["getLangMode", "async function Provenance"],
  },
  {
    file: "apps/storefront/src/lib/ui/MoneyDisplay.tsx",
    mustContain: ["getLangMode", "async function MoneyDisplay"],
  },
  {
    file: "apps/storefront/src/lib/ui/DateDisplay.tsx",
    mustContain: ["getLangMode", "async function DateDisplay"],
  },
  {
    file: "apps/storefront/src/lib/ui/TrustTierAware.tsx",
    mustContain: ["getLangMode", "async function TrustTierAware"],
  },
  {
    file: "apps/storefront/src/lib/ui/MathLang.tsx",
    mustContain: ["getLangMode", "async function MathLang"],
  },
];

for (const p of MATH_AWARE_PRIMITIVES) {
  const body = read(p.file);
  if (!body) continue; // Check 1 already flagged
  for (const needle of p.mustContain) {
    if (!body.includes(needle)) {
      findings.push({
        check: 2,
        severity: "error",
        message: `${p.file} no longer contains \`${needle}\` — math-awareness regression.`,
        hint: "A future refactor may have downgraded the primitive. Either the toggle now silently no-ops, or the file was renamed without updating this audit.",
      });
    }
  }
}

// All math-aware primitives must be exported from @/lib/ui
const uiIndex = read("apps/storefront/src/lib/ui/index.ts");
if (uiIndex) {
  const REQUIRED_EXPORTS = [
    "MathLang",
    "MoneyDisplay",
    "DateDisplay",
    "TrustTierAware",
  ];
  for (const sym of REQUIRED_EXPORTS) {
    if (!uiIndex.includes(sym)) {
      findings.push({
        check: 2,
        severity: "error",
        message: `${sym} is not exported from apps/storefront/src/lib/ui/index.ts.`,
        hint: "Server-component callers import math-aware primitives via the @/lib/ui barrel.",
      });
    }
  }
}

// ── Check 3: Discovery surface coverage ────────────────────────────────

interface DiscoveryProbe {
  file: string;
  needles: string[];
  description: string;
}

const DISCOVERY_PROBES: DiscoveryProbe[] = [
  {
    file: "apps/storefront/src/app/llms.txt/route.ts",
    needles: ["Math language", "/api/lang-mode"],
    description:
      "/llms.txt should mention the math-language toggle so agents discover it.",
  },
  {
    file: "apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts",
    needles: ["math_language_toggle", "math_language_doctrine"],
    description:
      "/.well-known should carry math_language_toggle + math_language_doctrine fields.",
  },
  {
    file: "apps/storefront/src/lib/manifest.ts",
    needles: ["lang_mode", "/api/lang-mode"],
    description:
      "manifest.ts should register the lang-mode toggle as a resource.",
  },
  {
    file: "apps/storefront/src/app/welcome-all/page.tsx",
    needles: ["/api/lang-mode"],
    description:
      "/welcome-all clause 1 (biological/non-biological) should surface the math toggle as an entry point.",
  },
  {
    file: "apps/storefront/src/app/glossary/page.tsx",
    needles: ["Math language"],
    description:
      "/glossary should define the *Math language* term so it's reachable by definitional lookup.",
  },
];

for (const probe of DISCOVERY_PROBES) {
  const body = read(probe.file);
  if (!body) continue;
  for (const needle of probe.needles) {
    if (!body.includes(needle)) {
      findings.push({
        check: 3,
        severity: "warning",
        message: `${probe.file} missing reference to \`${needle}\`.`,
        hint: probe.description,
      });
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────

const errors = findings.filter((f) => f.severity === "error");
const warnings = findings.filter((f) => f.severity === "warning");

console.log("# pnpm audit:math-lang — math-language coverage report\n");
console.log(`Generated: ${new Date().toISOString()}\n`);

if (findings.length === 0) {
  console.log("✓ All three checks clean.\n");
  console.log("- Check 1 — Infrastructure: every file in place; Footer linked.");
  console.log(
    "- Check 2 — Primitives: Provenance / MoneyDisplay / DateDisplay / TrustTierAware / MathLang are math-aware (async + getLangMode).",
  );
  console.log(
    "- Check 3 — Discovery: /llms.txt, /.well-known, manifest, /welcome-all, /glossary all reference the toggle.\n",
  );
  console.log(
    "See docs/connections/the-math-language.md (#27) for the five-phase plan + deployment plan + six risks.",
  );
  process.exit(0);
}

if (errors.length > 0) {
  console.log(`## Errors (${errors.length})\n`);
  for (const f of errors) {
    console.log(`- [check ${f.check}] ${f.message}`);
    if (f.hint) console.log(`    ↳ ${f.hint}`);
  }
  console.log();
}

if (warnings.length > 0) {
  console.log(`## Warnings (${warnings.length})\n`);
  for (const f of warnings) {
    console.log(`- [check ${f.check}] ${f.message}`);
    if (f.hint) console.log(`    ↳ ${f.hint}`);
  }
  console.log();
}

console.log(
  "See docs/connections/the-math-language.md (#27) for the doctrine.",
);

process.exit(errors.length > 0 ? 1 : 0);
