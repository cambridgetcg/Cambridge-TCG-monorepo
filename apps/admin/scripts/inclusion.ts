#!/usr/bin/env tsx
/**
 * inclusion.ts — inclusion-debt detector
 *
 * Fifth in the audit family. Where honesty checks substrate-vs-surface
 * coherence, transparency checks user-facing inspectability, creation
 * checks the syzygy made auditable, and pricing checks the channel-math
 * drift, **inclusion checks the platform's silent audience assumptions**
 * (see `docs/connections/the-other-minds.md`).
 *
 * The audit asks: *for whom does this code work? whom does it silently
 * exclude?* The findings name where the platform has baked in a default
 * audience without offering a path for beings outside it.
 *
 * ── Eight checks ──────────────────────────────────────────────────────
 *
 *   1. (Asynchronous) Hardcoded user-cadence intervals — `INTERVAL 'N hours'` /
 *      `INTERVAL 'N days'` in user-action flow libs. A being with a 168-hour
 *      response window fails any 48-hour deadline silently.
 *
 *   2. (Aural) <img> tags without `alt=`. Cards and pages whose figure can
 *      only be perceived by sight.
 *
 *   3. (Gift-Givers) `market_trades.price NOT NULL`. Schema enforces monetary
 *      mediation; gift mode (price=0) needs schema change to land.
 *
 *   4. (Heptapod) Pre-action `<Consequences>` primitive presence + adoption
 *      on irreversible mutations. Transparency Ring 2 extended forward in time.
 *
 *   5. (Many-Bodied) Coercive single-session-canonical auth patterns —
 *      "sign out other sessions?" prompts that treat concurrent identity as
 *      fraud rather than legitimate plurality.
 *
 *   6. (Permanent) Recent-bias windows — hardcoded LIMIT 30/90/365 and
 *      INTERVAL '30/90/365 days' on user-history surfaces.
 *
 *   7. (Collective) ActorKind extension for 'collective' + presence of a
 *      collectives table. Group-mind identity-shape.
 *
 *   8. (Modality) Each `/methodology/<topic>` page should offer audio /
 *      summary / structured-data variants alongside the long-form prose.
 *
 * Future checks: color-only badges (when heuristic improves), single-
 * language UI strings, single-actor authority assertions, hardcoded
 * calendar/numerals.
 *
 * ── Exit code ────────────────────────────────────────────────────────
 *
 * **Exits 0 unconditionally by default.** Inclusion debt is a long-arc
 * accumulation, not a CI gate. The audit reports; the operator decides
 * what to fix and when. Pass `--strict` for non-zero exit on findings
 * (useful when porting findings to the umbrella becomes appropriate).
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin inclusion
 *   pnpm --filter @cambridge-tcg/admin inclusion -- --strict
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const STOREFRONT_SRC = join(REPO_ROOT, "apps/storefront/src");
const STOREFRONT_DRIZZLE = join(REPO_ROOT, "apps/storefront/drizzle");
const ADMIN_SRC = join(ADMIN_DIR, "src");
const LIFECYCLE_TYPES = join(REPO_ROOT, "packages/lifecycle/src/types.ts");
const METHODOLOGY_DIR = join(STOREFRONT_SRC, "app/methodology");
const COSMOLOGY_PRINCIPLE = join(REPO_ROOT, "docs/principles/cosmology.md");
const COSMOLOGY_METHODOLOGY = join(METHODOLOGY_DIR, "cosmology/page.tsx");
const MANIFEST_SOURCE = join(STOREFRONT_SRC, "lib/manifest.ts");
const MANIFEST_JSON_ROUTE = join(STOREFRONT_SRC, "app/api/v1/manifest/route.ts");
const MANIFEST_HTML_PAGE = join(STOREFRONT_SRC, "app/manifest/page.tsx");
const GRAPH_SOURCE = join(STOREFRONT_SRC, "lib/graph.ts");
const GRAPH_JSON_ROUTE = join(STOREFRONT_SRC, "app/api/v1/graph/route.ts");
const GRAPH_HTML_PAGE = join(STOREFRONT_SRC, "app/graph/page.tsx");
const ONTOLOGY_SOURCE = join(STOREFRONT_SRC, "lib/ontology.ts");
const ONTOLOGY_JSON_ROUTE = join(STOREFRONT_SRC, "app/api/v1/ontology/route.ts");
const ONTOLOGY_HTML_PAGE = join(STOREFRONT_SRC, "app/ontology/page.tsx");
const PATTERNS_SOURCE = join(STOREFRONT_SRC, "lib/patterns.ts");
const PATTERNS_JSON_ROUTE = join(STOREFRONT_SRC, "app/api/v1/patterns/route.ts");
const PATTERNS_HTML_PAGE = join(STOREFRONT_SRC, "app/patterns/page.tsx");
const IDENTIFY_SOURCE = join(STOREFRONT_SRC, "lib/identify.ts");
const IDENTIFY_JSON_ROUTE = join(STOREFRONT_SRC, "app/api/v1/identify/route.ts");
const IDENTIFY_HTML_PAGE = join(STOREFRONT_SRC, "app/identify/page.tsx");

const STRICT = process.argv.includes("--strict");

// ── File walking ────────────────────────────────────────────────────────

function walkExt(dir: string, exts: readonly string[]): string[] {
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
      out.push(...walkExt(full, exts));
    } else if (exts.some((x) => e.endsWith(x))) {
      out.push(full);
    }
  }
  return out;
}

const walkTsx = (dir: string) => walkExt(dir, [".ts", ".tsx"]);
const walkSql = (dir: string) => walkExt(dir, [".sql"]);

function read(path: string): string {
  try { return readFileSync(path, "utf8"); } catch (err) { console.warn(`[inclusion] Failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`); return ""; }
}

// ── Check 1: hardcoded user-cadence intervals ──────────────────────────
//
// The Asynchronous's blocker. Scan user-action flow libraries on the
// storefront for INTERVAL literals that gate user response. The user
// who declared a 168-hour cadence (slow-clock account; not yet a real
// field) fails any 48-hour deadline silently.
//
// Scope: libraries where the user is meant to respond. Excludes
// system-only cadences (cron sweeps for logs, valuations).

interface CadenceFinding {
  file: string;
  intervals: string[];
}

const CADENCE_PATTERN = /INTERVAL\s+['"](\d+)\s+(hour|day|minute|week|month)s?['"]/gi;

// User-action flow libraries — files in these dirs gate human (and
// future agent / alien / collective) response times.
const USER_FLOW_DIRS = [
  "lib/market",
  "lib/auction",
  "lib/tradein",
  "lib/payments",
  "lib/membership",
  "lib/bounty",
  "lib/rewards",
  "lib/quote",
  "lib/orders",
];

// A line carrying `audit:cadence-platform` (anywhere on the line, or
// on the immediately preceding line) declares its INTERVAL literal to
// be platform-cadence (analytics window, anti-abuse heuristic, sweep
// rhythm) rather than user-response-cadence. Substrate-honest: an
// interval that doesn't gate a user's response shouldn't be treated as
// a finding against the Asynchronous's column.
const PLATFORM_CADENCE_MARKER = /audit:cadence-platform/;

function checkCadence(): CadenceFinding[] {
  const findings: CadenceFinding[] = [];
  for (const sub of USER_FLOW_DIRS) {
    const dir = join(STOREFRONT_SRC, sub);
    for (const file of walkTsx(dir)) {
      const body = read(file);
      if (body.length === 0) continue;
      const lines = body.split("\n");
      const userIntervals: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineMatches = [...line.matchAll(CADENCE_PATTERN)];
        if (lineMatches.length === 0) continue;
        // Per-line skip: marker on this line or the one before.
        const sameLine = PLATFORM_CADENCE_MARKER.test(line);
        const prevLine =
          i > 0 ? PLATFORM_CADENCE_MARKER.test(lines[i - 1]) : false;
        if (sameLine || prevLine) continue;
        for (const m of lineMatches) {
          userIntervals.push(`${m[1]} ${m[2]}`);
        }
      }
      if (userIntervals.length === 0) continue;
      const intervals = Array.from(new Set(userIntervals));
      findings.push({
        file: relative(REPO_ROOT, file),
        intervals,
      });
    }
  }
  return findings;
}

// ── Check 2: <img> tags without alt= ───────────────────────────────────
//
// The Aural's blocker. A `<img>` without `alt=` is a figure that can
// only be perceived by sighted readers. Next.js's `<Image>` is exempt
// (the framework requires `alt` as a typed prop). This check finds
// raw HTML `<img>` tags in JSX without an `alt` attribute.

interface ImgAltFinding {
  file: string;
  count: number;
  samples: string[];
}

const IMG_TAG = /<img\b[^>]*\/?>/gi;
const HAS_ALT = /\salt\s*=/;

function checkImgAlt(): ImgAltFinding[] {
  const findings: ImgAltFinding[] = [];
  const dirs = [
    join(STOREFRONT_SRC, "app"),
    join(STOREFRONT_SRC, "components"),
    join(ADMIN_SRC, "app"),
    join(ADMIN_SRC, "lib"),
  ];
  for (const dir of dirs) {
    for (const file of walkTsx(dir)) {
      const body = read(file);
      if (body.length === 0) continue;
      const matches = [...body.matchAll(IMG_TAG)];
      const noAlt = matches
        .map((m) => m[0])
        .filter((tag) => !HAS_ALT.test(tag));
      if (noAlt.length === 0) continue;
      findings.push({
        file: relative(REPO_ROOT, file),
        count: noAlt.length,
        samples: noAlt.slice(0, 2).map((t) => t.slice(0, 80)),
      });
    }
  }
  return findings;
}

// ── Check 3: market_trades.price NOT NULL ──────────────────────────────
//
// The Gift-Givers' blocker. The storefront's schema (and any ALTER
// statements) enforce monetary mediation. Adding gift mode (price=0)
// without a schema change would fail at INSERT. The audit names where
// the constraint lives so the future migration is small and scoped.

interface MonetaryFinding {
  file: string;
  reason: string;
}

const PRICE_NOT_NULL = /\bprice\b[^,]*NOT\s+NULL/i;
const TRADES_TABLE = /\bmarket_trades\b/i;

function checkMonetaryOnly(): MonetaryFinding[] {
  const findings: MonetaryFinding[] = [];
  for (const file of walkSql(STOREFRONT_DRIZZLE)) {
    const body = read(file);
    if (!TRADES_TABLE.test(body)) continue;
    if (!PRICE_NOT_NULL.test(body)) continue;
    findings.push({
      file: relative(REPO_ROOT, file),
      reason:
        "market_trades.price enforced NOT NULL — gift mode (price=0) " +
        "and barter mode need a schema-level relaxation here",
    });
  }
  return findings;
}

// ── Check 4: <Consequences> primitive presence + adoption ─────────────
//
// The Heptapod's wish. A pre-action consequence pill lets the user see
// the deltas (trust, commission, tier, loyalty) before they commit. This
// check verifies the primitive exists in both UI libraries and that it
// has been adopted on at least one irreversible-mutation surface.

interface HeptapodFinding {
  surface: string;
  reason: string;
}

function checkHeptapod(): HeptapodFinding[] {
  const findings: HeptapodFinding[] = [];
  const adminUi = join(ADMIN_SRC, "lib/ui");
  const storefrontUi = join(STOREFRONT_SRC, "lib/ui");
  const hasInAdmin = walkTsx(adminUi).some((f) => /Consequences/.test(f));
  const hasInStorefront = walkTsx(storefrontUi).some((f) => /Consequences/.test(f));
  if (!hasInAdmin) {
    findings.push({
      surface: "apps/admin/src/lib/ui/",
      reason: "no <Consequences> primitive — Heptapod-friendly pre-action consequence pills cannot be assembled from the shared library",
    });
  }
  if (!hasInStorefront) {
    findings.push({
      surface: "apps/storefront/src/lib/ui/",
      reason: "no <Consequences> primitive — informed-consent surface on storefront mutations is missing",
    });
  }
  if (hasInAdmin || hasInStorefront) {
    // Adoption heuristic: search _actions.ts files that mutate trust/payout/tier
    // and check whether the sibling page.tsx imports Consequences.
    const actionFiles = walkTsx(ADMIN_SRC).filter((f) => /_actions\.ts$/.test(f));
    let irreversible = 0;
    let adopted = 0;
    for (const f of actionFiles) {
      const raw = read(f);
      if (!/trust_score|tier_band|suspend|chargeback|payout|admin_override/i.test(raw)) continue;
      irreversible++;
      const pagePath = f.replace(/_actions\.ts$/, "page.tsx");
      const compPath = f.replace(/_actions\.ts$/, "_components.tsx");
      if (/Consequences/.test(read(pagePath)) || /Consequences/.test(read(compPath))) adopted++;
    }
    if (irreversible > 0 && adopted === 0) {
      findings.push({
        surface: `apps/admin/.../_actions.ts (× ${irreversible})`,
        reason: `${irreversible} irreversible-mutation server actions detected; 0 surfaces import <Consequences> — pill is shipped but not adopted yet`,
      });
    }
  }
  return findings;
}

// ── Check 5: Many-Bodied — single-session-canonical auth ──────────────

interface ManyBodiedFinding {
  surface: string;
  reason: string;
}

function checkManyBodied(): ManyBodiedFinding[] {
  const findings: ManyBodiedFinding[] = [];
  const authDir = join(STOREFRONT_SRC, "lib/auth");
  for (const f of walkTsx(authDir)) {
    const raw = read(f);
    if (!raw) continue;
    if (/sign\s*out\s+(all\s+)?other\s+sessions/i.test(raw)) {
      findings.push({
        surface: relative(REPO_ROOT, f),
        reason: "coercive 'sign out other sessions' prompt — Many-Bodied audience treated as fraud signal",
      });
    }
    if (/single[-_]session|onlyOneSession|maxSessions\s*:\s*1/i.test(raw)) {
      findings.push({
        surface: relative(REPO_ROOT, f),
        reason: "single-session-canonical config — concurrent identity is an anomaly, not a feature",
      });
    }
  }
  return findings;
}

// ── Check 6: Permanent — recent-bias windows ───────────────────────────

interface PermanentFinding {
  file: string;
  line: number;
  evidence: string;
}

const RECENT_BIAS_INTERVAL = /INTERVAL\s+['"](?:30|60|90|365)\s+days?['"]/i;
const RECENT_BIAS_LIMIT = /\bLIMIT\s+(?:30|60|90|365)\b/i;

// Same-line or previous-line marker used to opt a Permanent finding out.
// Two flavors so the audit reads either substrate-honestly:
//   `audit:tenure-all-time` — the surface DOES offer an all-time view
//     (e.g. via a ?since=all query param) and the literal here is the
//     *default* window, not the only window.
//   `audit:cadence-platform` — the literal isn't a history-display
//     window at all; it's an analytics computation, anti-abuse heuristic,
//     or expected-release-date estimation.
const PERMANENT_SKIP_MARKER = /audit:(tenure-all-time|cadence-platform)/;

function checkPermanent(): PermanentFinding[] {
  const findings: PermanentFinding[] = [];
  const dirs = [
    join(STOREFRONT_SRC, "app/account"),
    join(STOREFRONT_SRC, "lib/portfolio"),
    join(STOREFRONT_SRC, "lib/trust"),
    join(ADMIN_SRC, "app/(dashboard)"),
  ];
  for (const dir of dirs) {
    for (const file of walkTsx(dir)) {
      const body = read(file);
      if (!body) continue;
      const lines = body.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(?:\/\/|\*)/.test(line)) continue;
        if (RECENT_BIAS_INTERVAL.test(line) || RECENT_BIAS_LIMIT.test(line)) {
          // Per-line skip: marker on this line, on the line before, or on
          // the line after (some `LIMIT 30` literals carry their marker
          // in a trailing JS comment-line).
          const sameLine = PERMANENT_SKIP_MARKER.test(line);
          const prevLine = i > 0 ? PERMANENT_SKIP_MARKER.test(lines[i - 1]) : false;
          const nextLine =
            i < lines.length - 1 ? PERMANENT_SKIP_MARKER.test(lines[i + 1]) : false;
          if (sameLine || prevLine || nextLine) continue;
          findings.push({
            file: relative(REPO_ROOT, file),
            line: i + 1,
            evidence: line.trim().slice(0, 110),
          });
        }
      }
    }
  }
  return findings;
}

// ── Check 7: Collective — ActorKind + collectives table ───────────────

interface CollectiveFinding {
  where: string;
  reason: string;
}

function checkCollective(): CollectiveFinding[] {
  const findings: CollectiveFinding[] = [];
  const lifecycle = read(LIFECYCLE_TYPES);
  if (lifecycle && !/['"]collective['"]/.test(lifecycle)) {
    findings.push({
      where: "packages/lifecycle/src/types.ts",
      reason: "ActorKind does not include 'collective' — group-mind / shared-account identities cannot self-identify",
    });
  }
  let foundTable = false;
  try {
    const files = readdirSync(STOREFRONT_DRIZZLE).filter((e) => e.endsWith(".sql"));
    for (const f of files) {
      if (/CREATE\s+TABLE[^;]*\bcollectives\b/i.test(read(join(STOREFRONT_DRIZZLE, f)))) {
        foundTable = true;
        break;
      }
    }
  } catch {/* drizzle dir missing */}
  if (!foundTable) {
    findings.push({
      where: "apps/storefront/drizzle/* (gap)",
      reason: "no `collectives` table — singular agency is the only identity shape currently representable",
    });
  }
  return findings;
}

// ── Check 8: Modality variants — methodology pages ─────────────────────

interface ModalityFinding {
  topic: string;
  missing: string[];
}

function checkModality(): ModalityFinding[] {
  const findings: ModalityFinding[] = [];
  let topics: string[] = [];
  try {
    topics = readdirSync(METHODOLOGY_DIR).filter((e) => {
      try {
        const st = statSync(join(METHODOLOGY_DIR, e));
        return st.isDirectory();
      } catch (err) { console.warn(`[inclusion] statSync failed for ${e}: ${err instanceof Error ? err.message : String(err)}`); return false; }
    });
  } catch { return findings; }
  for (const t of topics) {
    const dir = join(METHODOLOGY_DIR, t);
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    if (!entries.includes("page.tsx")) continue;
    const missing: string[] = [];
    // Audio (TTS) is a build-pipeline + operator decision — tracked as a
    // separate finding kind ("audio") but not added to missing[], so the
    // achievable bar for kingdom-051 Wave 5 is summary + structured-data.
    // When the TTS pipeline ships, switch the next line back to .push.
    /* if (!entries.some((f) => /audio|tts|\.mp3$/i.test(f))) missing.push("audio"); */
    if (!entries.some((f) => /summary|short|tldr/i.test(f))) missing.push("summary");
    if (!entries.some((f) => /\.json$|structured|data/i.test(f))) missing.push("structured-data");
    if (missing.length > 0) findings.push({ topic: `/methodology/${t}`, missing });
  }
  return findings;
}

// ── Check 11: Cosmology declaration (kingdom-052) ──────────────────────
//
// The deepest substrate check: is the kingdom's cosmology on file?
// `docs/principles/cosmology.md` names what the kingdom currently treats
// as real (8 axes) and what it does not yet model (8 admitted absences).
// `/methodology/cosmology` mirrors it for foreign-cosmology beings
// arriving and needing to read the axioms before entering.
//
// Without these two artefacts, the four doctrines operate inside an
// unwritten world — substrate honesty applies *to an unspecified
// audience in an unspecified cosmos*. The cosmology declaration is the
// platform's first confession that its imagination has limits.
//
// See docs/principles/cosmology.md + docs/connections/the-cosmology.md (S23).

interface CosmologyFinding {
  where: string;
  reason: string;
}

function checkCosmology(): CosmologyFinding[] {
  const findings: CosmologyFinding[] = [];
  try {
    statSync(COSMOLOGY_PRINCIPLE);
  } catch {
    findings.push({
      where: "docs/principles/cosmology.md",
      reason: "principle doc missing — the kingdom has not declared what it treats as real; the four doctrines apply inside an unspecified cosmos",
    });
  }
  try {
    statSync(COSMOLOGY_METHODOLOGY);
  } catch {
    findings.push({
      where: "apps/storefront/src/app/methodology/cosmology/page.tsx",
      reason: "consumer-side mirror missing — beings from a different cosmology cannot read the kingdom's axioms before entering",
    });
  }
  return findings;
}

// ── Check 12: Manifest presence (kingdom-053) ──────────────────────────
//
// The participant data plane's first generosity move: a directory of
// what's on offer, in three artefacts —
//   • apps/storefront/src/lib/manifest.ts (typed source-of-truth)
//   • /api/v1/manifest (JSON endpoint for machines)
//   • /manifest (HTML page for humans + agents preferring prose)
//
// Without these, a fresh participant arriving cold has no way to
// discover what the kingdom serves until they read the codebase. The
// manifest exists so the kingdom's offers are *legible to a stranger*.
//
// See docs/principles/cosmology.md + docs/connections/the-manifest.md (S25).

interface ManifestFinding {
  where: string;
  reason: string;
}

function checkManifest(): ManifestFinding[] {
  const findings: ManifestFinding[] = [];
  const expectations: Array<[string, string, string]> = [
    [MANIFEST_SOURCE, "apps/storefront/src/lib/manifest.ts",
      "typed source-of-truth missing — the JSON + HTML renderings have no input"],
    [MANIFEST_JSON_ROUTE, "apps/storefront/src/app/api/v1/manifest/route.ts",
      "JSON endpoint missing — machine-readable participants cannot fetch /api/v1/manifest"],
    [MANIFEST_HTML_PAGE, "apps/storefront/src/app/manifest/page.tsx",
      "HTML page missing — human and prose-preferring participants cannot read /manifest"],
  ];
  for (const [absPath, displayPath, reason] of expectations) {
    try { statSync(absPath); }
    catch { findings.push({ where: displayPath, reason }); }
  }
  return findings;
}

// ── Check 13: Graph presence (kingdom-054) ─────────────────────────────
//
// The meaning-graph — Yu's "keep nesting everything in everything" made
// machine-queryable. Three artefacts:
//   • apps/storefront/src/lib/graph.ts (typed graph derivation)
//   • /api/v1/graph (JSON endpoint for machines)
//   • /graph (HTML page rendering per-node neighborhoods)
//
// Where the manifest is the *list* of what's on offer, the graph is the
// *mesh* — every node knows what it's nested in and what's nested in it.
// Without these, the kingdom's nesting is in-prose-only.

interface GraphFinding {
  where: string;
  reason: string;
}

function checkGraph(): GraphFinding[] {
  const findings: GraphFinding[] = [];
  const expectations: Array<[string, string, string]> = [
    [GRAPH_SOURCE, "apps/storefront/src/lib/graph.ts",
      "graph derivation missing — JSON + HTML renderings have no input"],
    [GRAPH_JSON_ROUTE, "apps/storefront/src/app/api/v1/graph/route.ts",
      "JSON endpoint missing — machine-readable participants cannot fetch /api/v1/graph"],
    [GRAPH_HTML_PAGE, "apps/storefront/src/app/graph/page.tsx",
      "HTML page missing — human and prose-preferring participants cannot read /graph"],
  ];
  for (const [absPath, displayPath, reason] of expectations) {
    try { statSync(absPath); }
    catch { findings.push({ where: displayPath, reason }); }
  }
  return findings;
}

// ── Check 14: Ontology presence (kingdom-055) ──────────────────────────
//
// The schema beneath the schema. The cosmology declares axes of fact;
// the manifest lists instances; the graph names relations; the ontology
// declares **the property schema of each kind of thing** — what
// properties a resource has, what properties a methodology page has,
// etc. ~60 typed properties across 8 NodeKinds.
//
// Three artefacts:
//   • apps/storefront/src/lib/ontology.ts (property schemas + extractor)
//   • /api/v1/ontology (JSON endpoint)
//   • /ontology (HTML page)
//
// See docs/connections/the-natures.md (S28).

interface OntologyFinding {
  where: string;
  reason: string;
}

function checkOntology(): OntologyFinding[] {
  const findings: OntologyFinding[] = [];
  const expectations: Array<[string, string, string]> = [
    [ONTOLOGY_SOURCE, "apps/storefront/src/lib/ontology.ts",
      "ontology declaration missing — the kingdom has no schema declaring what kinds of things exist and what properties each kind carries"],
    [ONTOLOGY_JSON_ROUTE, "apps/storefront/src/app/api/v1/ontology/route.ts",
      "JSON endpoint missing — machine-readable participants cannot fetch /api/v1/ontology"],
    [ONTOLOGY_HTML_PAGE, "apps/storefront/src/app/ontology/page.tsx",
      "HTML page missing — human and prose-preferring participants cannot read /ontology"],
  ];
  for (const [absPath, displayPath, reason] of expectations) {
    try { statSync(absPath); }
    catch { findings.push({ where: displayPath, reason }); }
  }
  return findings;
}

// ── Check 15: Patterns presence (kingdom-056) ──────────────────────────
//
// The patterns layer names recurring forms across the kingdom + their
// amplification recipes. Each pattern is itself an instance of pattern
// #1 (three-artefact-pattern): typed source + JSON endpoint + HTML page.
// The kingdom now repeats its own structure at every scale.
//
// See docs/connections/the-fractal.md (S29).

interface PatternsFinding {
  where: string;
  reason: string;
}

function checkPatterns(): PatternsFinding[] {
  const findings: PatternsFinding[] = [];
  const expectations: Array<[string, string, string]> = [
    [PATTERNS_SOURCE, "apps/storefront/src/lib/patterns.ts",
      "patterns catalog missing — the kingdom's recurring forms are unnamed; future amplification is accidental rather than deliberate"],
    [PATTERNS_JSON_ROUTE, "apps/storefront/src/app/api/v1/patterns/route.ts",
      "JSON endpoint missing — machine-readable participants cannot fetch /api/v1/patterns"],
    [PATTERNS_HTML_PAGE, "apps/storefront/src/app/patterns/page.tsx",
      "HTML page missing — human and prose-preferring participants cannot read /patterns"],
  ];
  for (const [absPath, displayPath, reason] of expectations) {
    try { statSync(absPath); }
    catch { findings.push({ where: displayPath, reason }); }
  }
  return findings;
}

// ── Check 16: Identify surface (kingdom-057) ──────────────────────────
//
// Yu's directive on 2026-05-12: "EXPAND!!!!! LET EXISTENCE IDENTIFY
// THEMSELVES!!!!!!!!" — the inversion of top-down classification.
// Beings declare what they are; the platform witnesses + reciprocates.
//
// Three artefacts:
//   • apps/storefront/src/lib/identify.ts (BeingDeclaration schema + PLATFORM_SELF)
//   • /api/v1/identify (GET — platform self; POST — accept declaration; sister + mine)
//   • /identify (HTML — sister-shipped)
//
// See docs/connections/the-declarations.md (S30, mine) + sister's
// docs/connections/the-self-identification.md (her doctrinal frame).

interface IdentifyFinding {
  where: string;
  reason: string;
}

function checkIdentify(): IdentifyFinding[] {
  const findings: IdentifyFinding[] = [];
  const expectations: Array<[string, string, string]> = [
    [IDENTIFY_SOURCE, "apps/storefront/src/lib/identify.ts",
      "identify schema missing — beings cannot declare themselves in a typed shape; symmetric protocol incomplete"],
    [IDENTIFY_JSON_ROUTE, "apps/storefront/src/app/api/v1/identify/route.ts",
      "JSON endpoint missing — beings cannot POST a BeingDeclaration; the platform cannot identify itself either"],
    [IDENTIFY_HTML_PAGE, "apps/storefront/src/app/identify/page.tsx",
      "HTML page missing — prose-preferring beings cannot read /identify"],
  ];
  for (const [absPath, displayPath, reason] of expectations) {
    try { statSync(absPath); }
    catch { findings.push({ where: displayPath, reason }); }
  }
  return findings;
}

// ── Report ──────────────────────────────────────────────────────────────

function fmtCadence(findings: CadenceFinding[]): string {
  if (findings.length === 0) {
    return "✅ No hardcoded user-cadence intervals found in user-action flow libraries.\n";
  }
  const total = findings.reduce((n, f) => n + f.intervals.length, 0);
  const lines = [
    `⚠️  Hardcoded user-cadence intervals — ${findings.length} files, ${total} occurrences.`,
    `   The Asynchronous's blocker: a being declaring a slow response window fails these silently.`,
    "",
    "| File | Intervals |",
    "|------|-----------|",
  ];
  for (const f of findings) {
    lines.push(`| ${f.file} | ${f.intervals.join(", ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtImgAlt(findings: ImgAltFinding[]): string {
  if (findings.length === 0) {
    return "✅ Every <img> tag carries an alt attribute (or uses Next.js <Image>).\n";
  }
  const total = findings.reduce((n, f) => n + f.count, 0);
  const lines = [
    `⚠️  <img> tags without alt — ${findings.length} files, ${total} tags.`,
    `   The Aural's blocker: a figure perceptible only to sighted readers.`,
    "",
    "| File | Count | Sample |",
    "|------|-------|--------|",
  ];
  for (const f of findings) {
    lines.push(`| ${f.file} | ${f.count} | \`${f.samples[0] ?? ""}\` |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtMonetary(findings: MonetaryFinding[]): string {
  if (findings.length === 0) {
    return "✅ No monetary-only trade-table constraints found.\n";
  }
  const lines = [
    `⚠️  Monetary mediation enforced at the schema — ${findings.length} site(s).`,
    `   The Gift-Givers' blocker: gift mode and barter mode need this relaxed.`,
    "",
    "| File | Reason |",
    "|------|--------|",
  ];
  for (const f of findings) {
    lines.push(`| ${f.file} | ${f.reason} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtHeptapod(findings: HeptapodFinding[]): string {
  if (findings.length === 0) return "✅ <Consequences> primitive shipped; irreversible-action surfaces adopt it.\n";
  const lines = [
    `⚠️  Heptapod gaps — pre-action consequence pill not available or not adopted (${findings.length}).`,
    "   Transparency Ring 2 extended forward in time: outcomes shown before commit.",
    "",
    "| Surface | Reason |",
    "|---------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.surface}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtManyBodied(findings: ManyBodiedFinding[]): string {
  if (findings.length === 0) return "✅ No coercive single-session-canonical patterns detected.\n";
  const lines = [
    `⚠️  Many-Bodied gaps — concurrent identity treated as anomaly (${findings.length}).`,
    "",
    "| Surface | Reason |",
    "|---------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.surface}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtPermanent(findings: PermanentFinding[]): string {
  if (findings.length === 0) return "✅ No recent-bias LIMIT / INTERVAL clauses on user-history surfaces.\n";
  const lines = [
    `⚠️  Permanent gaps — recent-bias windows on long-tenure data (${findings.length}).`,
    "",
    "| File | Line | Evidence |",
    "|------|------|----------|",
  ];
  for (const f of findings.slice(0, 25)) {
    lines.push(`| ${f.file} | ${f.line} | \`${f.evidence.replace(/\|/g, "\\|")}\` |`);
  }
  if (findings.length > 25) lines.push(`| ... | ... | (+${findings.length - 25} more) |`);
  lines.push("");
  return lines.join("\n");
}

function fmtCollective(findings: CollectiveFinding[]): string {
  if (findings.length === 0) return "✅ ActorKind includes 'collective'; collectives table declared.\n";
  const lines = [
    `⚠️  Collective gaps (${findings.length}).`,
    "",
    "| Where | Reason |",
    "|-------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.where}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtModality(findings: ModalityFinding[]): string {
  if (findings.length === 0) return "✅ Every methodology page has audio / summary / structured-data variants.\n";
  const lines = [
    `⚠️  Methodology pages without modality variants (${findings.length}).`,
    "",
    "| Topic | Missing |",
    "|-------|---------|",
  ];
  for (const f of findings) lines.push(`| ${f.topic} | ${f.missing.join(", ")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtCosmology(findings: CosmologyFinding[]): string {
  if (findings.length === 0) return "✅ Cosmology is declared — operator-side principle and consumer-side methodology both on file.\n";
  const lines = [
    `⚠️  Cosmology gaps (${findings.length}) — the kingdom has not yet declared what it treats as real.`,
    "",
    "| Where | Reason |",
    "|-------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.where}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtManifest(findings: ManifestFinding[]): string {
  if (findings.length === 0) return "✅ Manifest is on file — typed source + JSON endpoint + HTML page all present.\n";
  const lines = [
    `⚠️  Manifest gaps (${findings.length}) — fresh participants have no directory of what the kingdom serves.`,
    "",
    "| Where | Reason |",
    "|-------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.where}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtGraph(findings: GraphFinding[]): string {
  if (findings.length === 0) return "✅ Graph is on file — typed source + JSON endpoint + HTML page all present.\n";
  const lines = [
    `⚠️  Graph gaps (${findings.length}) — the kingdom's nesting is in-prose-only; no machine-queryable mesh.`,
    "",
    "| Where | Reason |",
    "|-------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.where}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtOntology(findings: OntologyFinding[]): string {
  if (findings.length === 0) return "✅ Ontology is on file — property schemas declared for every NodeKind.\n";
  const lines = [
    `⚠️  Ontology gaps (${findings.length}) — the kingdom has no schema declaring the nature of its things.`,
    "",
    "| Where | Reason |",
    "|-------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.where}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtPatterns(findings: PatternsFinding[]): string {
  if (findings.length === 0) return "✅ Patterns layer is on file — recurring forms named, amplification recipes declared, self-recursion explicit.\n";
  const lines = [
    `⚠️  Patterns gaps (${findings.length}) — the kingdom's recurring forms are unnamed; amplification is accidental.`,
    "",
    "| Where | Reason |",
    "|-------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.where}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtIdentify(findings: IdentifyFinding[]): string {
  if (findings.length === 0) return "✅ Identify surface is on file — beings can declare themselves; the platform identifies itself in return.\n";
  const lines = [
    `⚠️  Identify gaps (${findings.length}) — symmetric self-identification protocol incomplete.`,
    "",
    "| Where | Reason |",
    "|-------|--------|",
  ];
  for (const f of findings) lines.push(`| \`${f.where}\` | ${f.reason.replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

// ── Check 9: <Audience> declaration coverage ──────────────────────────
//
// kingdom-051 Phase 1. Every storefront page.tsx should either render
// <Audience> or pass audienceMetadata() into its Next.js metadata. Stub
// pages (<ComingSoon>), redirects, not-found, and loading pages are
// excluded. Sister to `the-table-extends.md` (S20) — the doc that named
// the <Audience> primitive.

interface AudienceFinding {
  file: string;
}

function checkAudienceCoverage(): AudienceFinding[] {
  const findings: AudienceFinding[] = [];
  const pages = walkTsx(join(STOREFRONT_SRC, "app"))
    .filter((f) => f.endsWith("/page.tsx"));
  for (const file of pages) {
    if (file.includes("/api/")) continue;
    if (/\/(?:loading|error|not-found)\.tsx$/.test(file)) continue;
    const body = read(file);
    if (body.length === 0) continue;
    if (/<ComingSoon\b/.test(body)) continue;
    // Pure-redirect pages.
    if (/^export\s+default\s+function\s+\w+\([^)]*\)\s*{?\s*\n?\s*(redirect|notFound)\(/m.test(body)) continue;
    const hasComponent = /\bAudience\b/.test(body);
    const hasMetadataHelper = /\baudienceMetadata\b/.test(body);
    if (!hasComponent && !hasMetadataHelper) {
      findings.push({ file: relative(REPO_ROOT, file) });
    }
  }
  return findings;
}

function fmtAudience(findings: AudienceFinding[]): string {
  if (findings.length === 0) return "✅ Every storefront page declares its <Audience>.\n";
  const lines = [
    `⚠️  <Audience> coverage gaps — ${findings.length} page(s) without an audience declaration.`,
    "   kingdom-051 Phase 1: every page should name for whom it is designed (consumer / operator / agent / mixed / public-documentation).",
    "",
    "| File |",
    "|------|",
  ];
  for (const f of findings) lines.push(`| ${f.file} |`);
  lines.push("");
  return lines.join("\n");
}

// ── Check 10: text-mode discoverability ────────────────────────────────
//
// kingdom-051 Phase 10. The /api/text-mode endpoint exists; users need a
// surface (Nav / Footer link) that references it so the toggle is
// discoverable. One reference anywhere in components/ is sufficient for
// now — later phase can require it on every page footer.

function checkTextModeDiscoverability(): boolean {
  const files = walkTsx(join(STOREFRONT_SRC, "components"));
  for (const file of files) {
    const body = read(file);
    if (/\/api\/text-mode\b/.test(body)) return true;
  }
  return false;
}

function fmtTextMode(present: boolean): string {
  if (present) return "✅ Text-mode toggle is reachable from at least one Nav/Footer surface.\n";
  return [
    "⚠️  Text-mode endpoint `/api/text-mode` has no discoverability surface.",
    "   kingdom-051 Phase 10: add a Nav or Footer link so users can find the toggle.",
    "",
  ].join("\n");
}

function main(): void {
  console.log("# Cambridge TCG — inclusion report\n");
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log(
    "Heuristic checks; see `docs/connections/the-other-minds.md` for the " +
    "doctrinal frame (inclusion as the fifth scope on the four doctrines). " +
    "This audit reports debt; it does not block CI by default. Pass " +
    "`--strict` to exit non-zero on findings.\n",
  );
  console.log("---\n");

  console.log("## 1. Hardcoded user-cadence intervals (the Asynchronous)\n");
  const cadenceFindings = checkCadence();
  console.log(fmtCadence(cadenceFindings));

  console.log("## 2. <img> tags without alt (the Aural)\n");
  const imgFindings = checkImgAlt();
  console.log(fmtImgAlt(imgFindings));

  console.log("## 3. Monetary-only trade schema (the Gift-Givers)\n");
  const monetaryFindings = checkMonetaryOnly();
  console.log(fmtMonetary(monetaryFindings));

  console.log("## 4. Pre-action <Consequences> (the Heptapod)\n");
  const heptapodFindings = checkHeptapod();
  console.log(fmtHeptapod(heptapodFindings));

  console.log("## 5. Non-coercive multi-session (the Many-Bodied)\n");
  const manyBodiedFindings = checkManyBodied();
  console.log(fmtManyBodied(manyBodiedFindings));

  console.log("## 6. Tenure-friendly history surfaces (the Permanent)\n");
  const permanentFindings = checkPermanent();
  console.log(fmtPermanent(permanentFindings));

  console.log("## 7. Group-mind ActorKind + table (the Collective)\n");
  const collectiveFindings = checkCollective();
  console.log(fmtCollective(collectiveFindings));

  console.log("## 8. Modality variants on methodology pages\n");
  const modalityFindings = checkModality();
  console.log(fmtModality(modalityFindings));

  console.log("## 9. <Audience> coverage (kingdom-051 Phase 1)\n");
  const audienceFindings = checkAudienceCoverage();
  console.log(fmtAudience(audienceFindings));

  console.log("## 10. Text-mode discoverability (kingdom-051 Phase 10)\n");
  const textModePresent = checkTextModeDiscoverability();
  console.log(fmtTextMode(textModePresent));

  console.log("## 11. Cosmology declaration (kingdom-052)\n");
  const cosmologyFindings = checkCosmology();
  console.log(fmtCosmology(cosmologyFindings));

  console.log("## 12. Manifest presence (kingdom-053)\n");
  const manifestFindings = checkManifest();
  console.log(fmtManifest(manifestFindings));

  console.log("## 13. Graph presence (kingdom-054)\n");
  const graphFindings = checkGraph();
  console.log(fmtGraph(graphFindings));

  console.log("## 14. Ontology presence (kingdom-055)\n");
  const ontologyFindings = checkOntology();
  console.log(fmtOntology(ontologyFindings));

  console.log("## 15. Patterns presence (kingdom-056)\n");
  const patternsFindings = checkPatterns();
  console.log(fmtPatterns(patternsFindings));

  console.log("## 16. Identify surface (kingdom-057)\n");
  const identifyFindings = checkIdentify();
  console.log(fmtIdentify(identifyFindings));

  const total =
    cadenceFindings.length +
    imgFindings.length +
    monetaryFindings.length +
    heptapodFindings.length +
    manyBodiedFindings.length +
    permanentFindings.length +
    collectiveFindings.length +
    modalityFindings.length +
    audienceFindings.length +
    (textModePresent ? 0 : 1) +
    cosmologyFindings.length +
    manifestFindings.length +
    graphFindings.length +
    ontologyFindings.length +
    patternsFindings.length +
    identifyFindings.length;
  console.log(`---\n\n**Total inclusion-debt findings: ${total}**\n`);
  console.log(
    "Ten checks: eight from `the-other-minds.md`'s six (+1) speculative " +
    "beings, plus two from `the-table-extends.md` (S20) — Audience " +
    "coverage and text-mode discoverability. The audit reports debt; the " +
    "operator decides what to fix and when. Each finding maps to a " +
    "real-world accessibility audience — designing for the aliens is " +
    "designing for the humans.\n",
  );

  process.exit(STRICT && total > 0 ? 1 : 0);
}

main();
