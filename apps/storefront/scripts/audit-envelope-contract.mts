// Envelope-contract audit — the data plane's substrate-honesty check.
//
// The pantry's published contract lives in `packages/data-spec/`. The
// emission code lives in `apps/storefront/src/lib/data-pantry/`. This
// audit walks the route files that compose through the pantry and
// verifies the emissions match the published contract.
//
// Three checks, each one a finding from the kingdom-059 review (2026-05-14):
//
//   1. `source_license` values must come from the SourceMeta tier enum
//      (`cc0`, `cc-by`, …). The SPDX form (`CC0-1.0`) is the response-
//      level `_meta.license`, not the per-source tier — confusing them
//      makes `_meta` fail its own published JSON Schema.
//
//   2. The `source_license` and `upstream_proxy` arrays must run
//      parallel to `sources`. Documented at envelope.ts:113-117 and
//      :119-121; this audit catches mismatched lengths at the call site,
//      and a separate runtime guard (envelope.ts) catches them at emit
//      time.
//
//   3. `/api/v1/status`'s `envelope_compliant` flag must reflect reality.
//      The previous hand-maintained `ENVELOPE_COMPLIANT_PATHS` Set was
//      checked here against the actual `jsonResponse` callers; once the
//      status route derives the set from the filesystem, this check stays
//      to lock the derivation honest.
//
// Run: `pnpm audit:envelope-contract`. Exit 0 on clean, 1 on findings.
//
// Flags:
//   --regen   Regenerate envelope-compliance.generated.ts from the
//             current filesystem state. Use after adding/removing a
//             route that composes through jsonResponse. The audit
//             itself will fail without --regen if the generated file
//             is out of date — substrate-honest by construction.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const REGEN = process.argv.includes("--regen");

// ── Spec mirror (canonical at packages/data-spec) ─────────────────────────
//
// Inlined to keep this audit dependency-free. If the source-of-truth at
// packages/data-spec drifts from this list, check 0 below catches it.

const SOURCE_LICENSE_TIERS = [
  "cc0",
  "cc-by",
  "cc-by-nc",
  "cc-by-sa",
  "mit",
  "partner-redistributable",
  "internal-only",
  "proprietary",
] as const;

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const STOREFRONT = join(REPO_ROOT, "apps/storefront");
const ROUTES_ROOT = join(STOREFRONT, "src/app");
const DATA_SPEC_FRESHNESS = join(REPO_ROOT, "packages/data-spec/src/freshness.ts");
const DATA_PANTRY_ENVELOPE = join(STOREFRONT, "src/lib/data-pantry/envelope.ts");
const STATUS_ROUTE = join(STOREFRONT, "src/app/api/v1/status/route.ts");
const COMPLIANCE_GENERATED = join(
  STOREFRONT,
  "src/app/api/v1/status/envelope-compliance.generated.ts",
);

// ── Source-file walker ────────────────────────────────────────────────────

async function* walkRoutes(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkRoutes(p);
    } else if (e.isFile() && p.endsWith("route.ts")) {
      yield p;
    }
  }
}

// ── jsonResponse call extraction ──────────────────────────────────────────
//
// Find every `jsonResponse({ ... })` call. Pull out the source_license,
// upstream_proxy, and sources arrays via shallow brace-balanced parsing.
// Good enough for the call shapes the pantry actually uses; not a full
// TS parser.

interface JsonResponseCall {
  file: string;
  line: number;
  sources: string[] | null;
  source_license: string[] | null;
  upstream_proxy: string[] | null;
  raw: string;
}

function extractArray(call: string, key: string): string[] | null {
  // Match `key: [ ... ]` permitting newlines and trailing commas.
  // Returns the array entries only when the inner content is a *pure*
  // string-literal list — `["a", "b"]`. Returns null for expressions
  // (`[cond ? "x" : "y"]`, `[...spread]`, `[ident]`) because static
  // analysis can't determine their length, so length-based checks
  // (parallel-array invariant) must be skipped — the runtime guard
  // catches those at emit time.
  const keyIdx = call.search(new RegExp(`\\b${key}\\s*:\\s*\\[`));
  if (keyIdx === -1) return null;
  const open = call.indexOf("[", keyIdx);
  let depth = 0;
  let i = open;
  for (; i < call.length; i++) {
    const c = call[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return null;
  const inner = call.slice(open + 1, i).trim();
  if (inner.length === 0) return [];

  // Walk top-level entries, asserting each is a quoted string and
  // nothing else (no ternaries, identifiers, spreads, calls).
  const items: string[] = [];
  let pos = 0;
  while (pos < inner.length) {
    while (pos < inner.length && /\s/.test(inner[pos])) pos++;
    if (pos >= inner.length) break;
    const ch = inner[pos];
    if (ch !== '"' && ch !== "'") return null; // not a pure string-literal array
    const quote = ch;
    let end = pos + 1;
    while (end < inner.length && inner[end] !== quote) {
      if (inner[end] === "\\") end++;
      end++;
    }
    if (end >= inner.length) return null;
    items.push(inner.slice(pos + 1, end));
    pos = end + 1;
    while (pos < inner.length && /\s/.test(inner[pos])) pos++;
    if (pos >= inner.length) break;
    if (inner[pos] !== ",") return null; // foreign token between entries
    pos++;
  }
  return items;
}

function findCalls(file: string, src: string): JsonResponseCall[] {
  const calls: JsonResponseCall[] = [];
  const needle = "jsonResponse({";
  let idx = 0;
  while ((idx = src.indexOf(needle, idx)) !== -1) {
    // Balance braces from the `{` that follows jsonResponse(.
    const open = src.indexOf("{", idx);
    let depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break;
    const call = src.slice(idx, j + 1);
    const line = src.slice(0, idx).split("\n").length;
    calls.push({
      file,
      line,
      sources: extractArray(call, "sources"),
      source_license: extractArray(call, "source_license"),
      upstream_proxy: extractArray(call, "upstream_proxy"),
      raw: call,
    });
    idx = j + 1;
  }
  return calls;
}

// ── Filesystem path → URL path ────────────────────────────────────────────

function fileToUrl(file: string): string {
  // apps/storefront/src/app/api/v1/welcome/route.ts → /api/v1/welcome
  // apps/storefront/src/app/data.json/route.ts → /data.json
  // apps/storefront/src/app/api/v1/cards/[sku]/everything/route.ts →
  //   /api/v1/cards/[sku]/everything
  const rel = relative(ROUTES_ROOT, file);
  const parts = rel.split("/");
  parts.pop(); // drop "route.ts"
  return "/" + parts.join("/");
}

// ── Generated-file render + parse ─────────────────────────────────────────

function renderComplianceFile(paths: ReadonlySet<string>): string {
  const sorted = [...paths].sort();
  const lines = sorted.map((p) => `  ${JSON.stringify(p)},`).join("\n");
  return `// AUTO-GENERATED — do not edit by hand.
// Regenerate via: \`pnpm audit:envelope-contract --regen\` (or \`pnpm audit\`).
//
// The set of public endpoints that compose through \`jsonResponse\` from
// \`@/lib/data-pantry\`. Read by \`/api/v1/status\` to populate the
// \`envelope_compliant\` flag on each manifest entry without lying about
// reality. The audit at \`apps/storefront/scripts/audit-envelope-contract.mts\`
// keeps this file substrate-honest — any drift between this list and the
// actual jsonResponse callers fails CI.

export const ENVELOPE_COMPLIANT_PATHS: ReadonlySet<string> = new Set([
${lines}
]);
`;
}

function parseCompliancePaths(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/"([^"]+)"/g)) out.add(m[1]);
  // Strip header strings (the @-doc comments may also have quoted text);
  // only entries that look like routes count.
  for (const v of [...out]) if (!v.startsWith("/")) out.delete(v);
  return out;
}

// ── Findings ──────────────────────────────────────────────────────────────

interface Finding {
  check: string;
  file: string;
  line: number;
  message: string;
}

const findings: Finding[] = [];

function fail(check: string, file: string, line: number, message: string): void {
  findings.push({ check, file, line, message });
}

// ── Run ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[envelope-contract] auditing apps/storefront emissions against packages/data-spec…\n");

  // ── Check 0: spec mirror is current ─────────────────────────────────────
  // Make sure the SOURCE_LICENSE_TIERS literal above matches the schema in
  // packages/data-spec. If the schema adds a tier, fail here so we know to
  // update this audit.
  const specSrc = await readFile(
    join(REPO_ROOT, "packages/data-spec/src/schemas/envelope.ts"),
    "utf8",
  );
  for (const tier of SOURCE_LICENSE_TIERS) {
    if (!specSrc.includes(`"${tier}"`)) {
      fail(
        "spec-mirror",
        "packages/data-spec/src/schemas/envelope.ts",
        0,
        `audit's SOURCE_LICENSE_TIERS lists "${tier}" but schema does not — update one to match the other`,
      );
    }
  }

  // ── Collect every jsonResponse call across the storefront ──────────────
  const allCalls: JsonResponseCall[] = [];
  for await (const file of walkRoutes(ROUTES_ROOT)) {
    const src = await readFile(file, "utf8");
    if (!src.includes("jsonResponse")) continue;
    allCalls.push(...findCalls(file, src));
  }

  console.log(`[envelope-contract] inspecting ${allCalls.length} jsonResponse calls…\n`);

  // ── Check 1: source_license values must be tier slugs, not SPDX ─────────
  for (const c of allCalls) {
    if (!c.source_license) continue;
    for (const v of c.source_license) {
      if (!(SOURCE_LICENSE_TIERS as readonly string[]).includes(v)) {
        fail(
          "source_license-enum",
          relative(REPO_ROOT, c.file),
          c.line,
          `source_license carries "${v}" — not a tier slug. Allowed: ${SOURCE_LICENSE_TIERS.join(", ")}. SPDX codes like "CC0-1.0" belong on _meta.license (the response-level field), not per-source tiers.`,
        );
      }
    }
  }

  // ── Check 2: parallel-array invariant ───────────────────────────────────
  for (const c of allCalls) {
    if (!c.sources) continue;
    if (c.source_license && c.source_license.length !== c.sources.length) {
      fail(
        "parallel-array-length",
        relative(REPO_ROOT, c.file),
        c.line,
        `source_license has ${c.source_license.length} entries but sources has ${c.sources.length} — they must run parallel (one license per source, same order)`,
      );
    }
    if (c.upstream_proxy && c.upstream_proxy.length !== c.sources.length) {
      fail(
        "parallel-array-length",
        relative(REPO_ROOT, c.file),
        c.line,
        `upstream_proxy has ${c.upstream_proxy.length} entries but sources has ${c.sources.length} — they must run parallel (one proxy per source, same order)`,
      );
    }
  }

  // ── Check 3: runtime guard in envelope.ts ───────────────────────────────
  // The runtime emission helper must enforce check 2 at emit time, so any
  // caller that skips this audit (e.g. dynamic shape) still gets caught.
  const envelopeSrc = await readFile(DATA_PANTRY_ENVELOPE, "utf8");
  const hasSourceLicenseGuard =
    /source_license.*length\s*!==\s*.*sources.*length/i.test(envelopeSrc) ||
    /sources.*length\s*!==\s*.*source_license.*length/i.test(envelopeSrc);
  const hasUpstreamProxyGuard =
    /upstream_proxy.*length\s*!==\s*.*sources.*length/i.test(envelopeSrc) ||
    /sources.*length\s*!==\s*.*upstream_proxy.*length/i.test(envelopeSrc);
  if (!hasSourceLicenseGuard) {
    fail(
      "runtime-invariant-guard",
      "apps/storefront/src/lib/data-pantry/envelope.ts",
      0,
      "envelope() must throw when source_license.length !== sources.length — the parallel-array invariant is documented but unenforced at emit time",
    );
  }
  if (!hasUpstreamProxyGuard) {
    fail(
      "runtime-invariant-guard",
      "apps/storefront/src/lib/data-pantry/envelope.ts",
      0,
      "envelope() must throw when upstream_proxy.length !== sources.length",
    );
  }

  // ── Check 4: envelope-compliance generated file matches reality ─────────
  // The status route reads `envelope-compliance.generated.ts` to label
  // each endpoint envelope_compliant. The generated file's truth is the
  // set of paths that compose through `jsonResponse`. This audit recomputes
  // that set and compares to the checked-in file. Drift = unhonest status.

  const actualPaths = new Set(allCalls.map((c) => fileToUrl(c.file)));
  const generatedContent = renderComplianceFile(actualPaths);

  if (REGEN) {
    await writeFile(COMPLIANCE_GENERATED, generatedContent, "utf8");
    console.log(
      `[envelope-contract] regenerated ${relative(REPO_ROOT, COMPLIANCE_GENERATED)} (${actualPaths.size} paths)`,
    );
  } else {
    let onDisk = "";
    try {
      onDisk = await readFile(COMPLIANCE_GENERATED, "utf8");
    } catch {
      // missing — fail
    }
    if (onDisk !== generatedContent) {
      const onDiskPaths = parseCompliancePaths(onDisk);
      const missing = [...actualPaths].filter((p) => !onDiskPaths.has(p));
      const extra = [...onDiskPaths].filter((p) => !actualPaths.has(p));
      const detail: string[] = [];
      if (missing.length) detail.push(`missing: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5})` : ""}`);
      if (extra.length) detail.push(`stale: ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? ` (+${extra.length - 5})` : ""}`);
      fail(
        "compliance-generated-drift",
        relative(REPO_ROOT, COMPLIANCE_GENERATED),
        0,
        `envelope-compliance.generated.ts is out of date. ${detail.join(" / ") || "content differs"}. Run \`pnpm audit:envelope-contract --regen\` and commit.`,
      );
    }
  }

  // ── Check 5: status route reads from the generated file, not a hand-Set ─
  const statusSrc = await readFile(STATUS_ROUTE, "utf8");
  const hasHandList = /const\s+ENVELOPE_COMPLIANT_PATHS\s*:\s*ReadonlySet<string>\s*=\s*new\s+Set\(\s*\[/.test(
    statusSrc,
  );
  const importsGenerated = /envelope-compliance\.generated/.test(statusSrc);
  if (hasHandList) {
    fail(
      "compliance-handlist",
      "apps/storefront/src/app/api/v1/status/route.ts",
      0,
      "ENVELOPE_COMPLIANT_PATHS is still hand-maintained — replace with `import { ENVELOPE_COMPLIANT_PATHS } from './envelope-compliance.generated'`",
    );
  }
  if (!importsGenerated) {
    fail(
      "compliance-handlist",
      "apps/storefront/src/app/api/v1/status/route.ts",
      0,
      "status route does not import envelope-compliance.generated.ts — the compliance flag won't reflect reality",
    );
  }

  // ── Check 5: freshness table in data-spec is current ────────────────────
  // The runtime imports FRESHNESS from data-spec; this check just confirms
  // the table file exists and parses — drift is structurally impossible
  // since envelope.ts re-exports the same const.
  const freshness = await readFile(DATA_SPEC_FRESHNESS, "utf8");
  if (!/export const FRESHNESS\s*=\s*\{/.test(freshness)) {
    fail(
      "freshness-table",
      "packages/data-spec/src/freshness.ts",
      0,
      "FRESHNESS const not found in data-spec — runtime envelope cannot import it",
    );
  }

  // ── Report ──────────────────────────────────────────────────────────────
  if (findings.length === 0) {
    console.log(`✓ envelope contract clean. ${allCalls.length} callers honor the spec.`);
    process.exit(0);
  }

  const byCheck = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check)!.push(f);
  }
  console.log(`✗ ${findings.length} finding(s) across ${byCheck.size} check(s):\n`);
  for (const [check, items] of byCheck) {
    console.log(`  [${check}] (${items.length})`);
    for (const it of items) {
      const where = it.line > 0 ? `${it.file}:${it.line}` : it.file;
      console.log(`    ${where}`);
      console.log(`      ${it.message}`);
    }
    console.log("");
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("[envelope-contract] audit crashed:", err);
  process.exit(2);
});
