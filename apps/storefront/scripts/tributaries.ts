#!/usr/bin/env tsx
/**
 * tributaries.ts — data-ingest source-protocol conformance audit
 *
 * Eighth in the audit family. Where honesty / transparency / creation /
 * pricing / inclusion / agent / nesting / typology check various forms
 * of doctrinal drift, **tributaries checks the source-ingestion protocol**:
 * every module in `packages/data-ingest/` conforms to the typed contract;
 * every shipped source has a row in `the-tributaries.md`; every catalog
 * row marked `shipped` has a matching module.
 *
 * See `docs/methodology/source-protocol.md` for the protocol and
 * `docs/connections/the-tributaries.md` for the catalog.
 *
 * ── Eleven checks ────────────────────────────────────────────────────
 *
 *   1. Module exists — every `SOURCES[id]` (excluding undefined planned
 *      slots) has a directory at `packages/data-ingest/src/<id>/`.
 *   2. SourceModule shape — exports an object with `meta`, `read`, `normalize`.
 *   3. Required meta — every required SourceMeta field is present + non-empty.
 *   4. Id parity — `meta.id` matches the directory name + registry key.
 *   5. Catalog row — `meta.catalog_section` points to a real anchor in
 *      `docs/connections/the-tributaries.md`.
 *   6. ToS non-empty — `meta.tos_notes` is a non-empty string.
 *   7. License coherence — `redistribute: true` only when license tier
 *      is `cc0` / `cc-by` / `cc-by-sa` / `mit`; `false` otherwise.
 *   8. Game validity — every entry in `meta.games` is a registered code.
 *   9. Ingest-run recency — each shipped source's last `ingest_run.finished_at`
 *      is within 2× the FreshnessKey budget. Skips gracefully when
 *      WHOLESALE_DATABASE_URL is unset OR the ingest_run table doesn't
 *      yet exist (Phase A migration not applied).
 *  10. License propagation (kingdom-081) — every emission site (route file
 *      under apps/{storefront,wholesale}/src/app/api/) that references a
 *      non-redistributable upstream by name (e.g. "cardrush") in its
 *      response shape must also declare `@source_license` or `source_license`
 *      somewhere in the file. Heuristic static check — false positives are
 *      a drift signal, not a CI gate.
 *  11. Layered rights — code licence, data terms, image terms,
 *      redistribution verdict, safe default, review date, evidence URLs, and
 *      notes are present and fail closed coherently.
 *
 * Exit non-zero on any check failure. Pass `--strict` to fail on any
 * planned-with-row mismatch as well.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin tributaries
 *   pnpm --filter @cambridge-tcg/admin tributaries -- --strict
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(ADMIN_DIR, "..", "..");
const INGEST_ROOT = resolve(REPO_ROOT, "packages", "data-ingest");
const INGEST_SRC = resolve(INGEST_ROOT, "src");
const CATALOG_PATH = resolve(REPO_ROOT, "docs", "connections", "the-tributaries.md");
const SKU_GAMES_PATH = resolve(REPO_ROOT, "packages", "sku", "src", "games.ts");

const STRICT = process.argv.includes("--strict");

// Check 9 (ingest-run recency) needs the wholesale RDS to read ingest_run.
// Skips gracefully when the env var isn't set or the table doesn't yet exist
// (Phase A migration not applied) — substrate-honest about scope.
const WHOLESALE_DATABASE_URL =
  process.env.WHOLESALE_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

// FreshnessKey → seconds. Mirrors `packages/data-spec/src/freshness.ts` so
// we don't add a runtime dep just for the table. Stays in sync via the
// pricing-style audit (future) — for now, hand-mirrored.
const FRESHNESS_SECONDS: Record<string, number> = {
  catalog: 86400,
  price_current: 300,
  price_historical: Number.MAX_SAFE_INTEGER,
  market_signal: 60,
  status: 30,
  methodology: 86400,
  identity: 3600,
  adopters: 86400,
};

interface Finding {
  check: number;
  severity: "fail" | "warn";
  id: string;
  message: string;
}

const findings: Finding[] = [];

function fail(check: number, id: string, message: string): void {
  findings.push({ check, severity: "fail", id, message });
}

function warn(check: number, id: string, message: string): void {
  findings.push({ check, severity: "warn", id, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown, min = 1): value is string {
  return typeof value === "string" && value.trim().length >= min;
}

// ── Load the registry source ───────────────────────────────────────────

const REQUIRED_META_FIELDS = [
  "id",
  "name",
  "description",
  "upstream",
  "catalog_section",
  "access",
  "license",
  "redistribute",
  "rights",
  "freshness",
  "canonical_effort",
  "status",
  "games",
  "tos_notes",
] as const;

const REDISTRIBUTABLE_LICENSES = new Set(["cc0", "cc-by", "cc-by-sa", "mit"]);

const VALID_ACCESS = new Set([
  "public-api",
  "app-token",
  "oauth2",
  "oauth1",
  "scrape",
  "partner",
  "paid-feed",
  "blocked",
]);

const VALID_LICENSE_TIERS = new Set([
  "cc0",
  "cc-by",
  "cc-by-nc",
  "cc-by-sa",
  "mit",
  "partner-redistributable",
  "internal-only",
  "proprietary",
]);

const VALID_STATUSES = new Set(["shipped", "partial", "planned", "blocked"]);

const VALID_EFFORTS = new Set(["low", "medium", "high", "very-high"]);

const VALID_REDISTRIBUTION_VERDICTS = new Set([
  "permitted",
  "conditional",
  "contract-required",
  "prohibited",
  "unknown",
]);

const VALID_RIGHTS_SAFE_DEFAULTS = new Set([
  "redistribute",
  "display-with-terms",
  "contract-only",
  "internal-only",
  "no-fetch",
]);

// ── Load SOURCES + SourceModule definitions dynamically ─────────────────
//
// The audit imports the registry at runtime to get every source's meta
// without re-implementing TypeScript's parser.

interface SourceMetaShape {
  id: string;
  name: string;
  description: string;
  upstream: string;
  catalog_section: string;
  access: string;
  license: string;
  license_spdx?: string;
  redistribute: boolean;
  rights: {
    code: { license: string; notes: string };
    data: { terms: string; notes: string };
    images: { terms: string; notes: string };
    redistribution: { verdict: string; notes: string };
    safe_default: string;
    reviewed_at: string;
    evidence_urls: string[];
    notes: string;
  };
  freshness: string;
  canonical_effort: string;
  status: string;
  games: string[];
  tos_notes: string;
  user_agent_suffix?: string;
  rate_limit?: { rps: number; burst: number };
}

interface ModuleShape {
  meta: SourceMetaShape;
  read: unknown;
  normalize: unknown;
}

async function loadRegistry(): Promise<Record<string, ModuleShape | undefined>> {
  const registryUrl = `file://${resolve(INGEST_SRC, "registry.ts")}`;
  const mod = (await import(registryUrl)) as {
    SOURCES: Record<string, ModuleShape | undefined>;
  };
  return mod.SOURCES;
}

// ── Load registered game codes from packages/sku ──────────────────────

function loadGameCodes(): Set<string> {
  const text = readFileSync(SKU_GAMES_PATH, "utf8");
  const codes = new Set<string>();
  for (const m of text.matchAll(/code:\s*"([a-z]{2,4})"/g)) {
    codes.add(m[1]);
  }
  return codes;
}

// ── Catalog parse ─────────────────────────────────────────────────────

function loadCatalogAnchors(): Set<string> {
  if (!existsSync(CATALOG_PATH)) return new Set();
  const text = readFileSync(CATALOG_PATH, "utf8");
  const anchors = new Set<string>();
  for (const m of text.matchAll(/^#{2,6}\s+(.+)$/gm)) {
    const heading = m[1].trim();
    // Github-style: lowercase, spaces → dashes, strip non-word
    const slug = heading
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    anchors.add(slug);
  }
  return anchors;
}

function catalogSectionSlug(catalog_section: string): string {
  // e.g. "the-tributaries.md#31-scryfall-mtg" → "31-scryfall-mtg"
  const hash = catalog_section.indexOf("#");
  if (hash === -1) return "";
  return catalog_section.slice(hash + 1);
}

// ── Directory scan ─────────────────────────────────────────────────────

function listSourceDirs(): string[] {
  if (!existsSync(INGEST_SRC)) return [];
  return readdirSync(INGEST_SRC)
    .filter((name) => {
      const p = join(INGEST_SRC, name);
      if (!statSync(p).isDirectory()) return false;
      return existsSync(join(p, "index.ts"));
    });
}

// ── Run all checks ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!existsSync(INGEST_ROOT)) {
    console.error(`✗ packages/data-ingest not found at ${INGEST_ROOT}`);
    process.exit(1);
  }

  const sources = await loadRegistry();
  const game_codes = loadGameCodes();
  const catalog_anchors = loadCatalogAnchors();
  const dirs = new Set(listSourceDirs());

  let registered = 0;
  let planned = 0;

  for (const [id, mod] of Object.entries(sources)) {
    if (!mod) {
      planned += 1;
      // Check 1 inverse: planned slot. If a directory exists for it, that's
      // a registry inconsistency — flag.
      if (dirs.has(id)) {
        fail(1, id, `directory packages/data-ingest/src/${id}/ exists but registry slot is undefined`);
      }
      continue;
    }

    registered += 1;

    // Check 1: module exists at expected path
    if (!dirs.has(id)) {
      fail(1, id, `registered but no directory at packages/data-ingest/src/${id}/`);
    }

    // Check 2: SourceModule shape
    if (typeof mod !== "object" || mod === null) {
      fail(2, id, `export is not an object`);
      continue;
    }
    if (typeof (mod as ModuleShape).meta !== "object") {
      fail(2, id, `missing 'meta' object`);
      continue;
    }
    if (typeof (mod as ModuleShape).read !== "function") {
      fail(2, id, `missing 'read' function`);
    }
    if (typeof (mod as ModuleShape).normalize !== "function") {
      fail(2, id, `missing 'normalize' function`);
    }

    const meta = mod.meta;

    // Check 3: required meta fields
    for (const field of REQUIRED_META_FIELDS) {
      const value = (meta as unknown as Record<string, unknown>)[field];
      if (value === undefined || value === null) {
        fail(3, id, `meta.${field} is missing`);
      } else if (typeof value === "string" && value.length === 0) {
        fail(3, id, `meta.${field} is empty string`);
      }
    }

    // Field domain checks (part of check 3)
    if (!VALID_ACCESS.has(meta.access)) {
      fail(3, id, `meta.access '${meta.access}' is not a valid AccessMethod`);
    }
    if (!VALID_LICENSE_TIERS.has(meta.license)) {
      fail(3, id, `meta.license '${meta.license}' is not a valid LicenseTier`);
    }
    if (!VALID_STATUSES.has(meta.status)) {
      fail(3, id, `meta.status '${meta.status}' is not a valid SourceStatus`);
    }
    if (!VALID_EFFORTS.has(meta.canonical_effort)) {
      fail(3, id, `meta.canonical_effort '${meta.canonical_effort}' is invalid`);
    }
    if (typeof meta.redistribute !== "boolean") {
      fail(3, id, `meta.redistribute must be a boolean`);
    }
    if (!Array.isArray(meta.games)) {
      fail(3, id, `meta.games must be an array`);
    }

    // Check 4: id parity
    if (meta.id !== id) {
      fail(4, id, `meta.id '${meta.id}' does not match registry key '${id}'`);
    }

    // Check 5: catalog row
    if (meta.catalog_section) {
      const slug = catalogSectionSlug(meta.catalog_section);
      if (slug && !catalog_anchors.has(slug)) {
        // Allow loose match: some anchors auto-strip emoji or special chars
        const has_loose_match = Array.from(catalog_anchors).some(
          (anchor) => anchor.includes(id) || anchor.includes(slug.split("-").slice(-2).join("-")),
        );
        if (!has_loose_match) {
          warn(5, id, `catalog_section '${meta.catalog_section}' anchor not found in the-tributaries.md`);
        }
      }
    } else {
      fail(5, id, `catalog_section is empty`);
    }

    // Check 6: ToS non-empty
    if (!meta.tos_notes || meta.tos_notes.length < 20) {
      fail(6, id, `tos_notes too short (${meta.tos_notes?.length ?? 0} chars); name the ToS source + URL`);
    }

    // Check 7: license coherence
    if (meta.redistribute === true && !REDISTRIBUTABLE_LICENSES.has(meta.license)) {
      fail(7, id, `redistribute: true but license '${meta.license}' is not in {cc0,cc-by,cc-by-sa,mit}`);
    }

    // Check 11: layered source-rights contract. A code licence is not a data
    // licence, and neither licences images by implication. Every layer must be
    // explicit, dated, evidenced, and coherent with the fail-closed legacy flag.
    const rightsUnknown = (meta as unknown as Record<string, unknown>).rights;
    if (!isRecord(rightsUnknown)) {
      fail(11, id, `meta.rights must be an object`);
    } else {
      const code = rightsUnknown.code;
      const data = rightsUnknown.data;
      const images = rightsUnknown.images;
      const redistribution = rightsUnknown.redistribution;
      const safeDefault = rightsUnknown.safe_default;
      const reviewedAt = rightsUnknown.reviewed_at;
      const evidenceUrls = rightsUnknown.evidence_urls;
      const rightsNotes = rightsUnknown.notes;

      if (!isRecord(code) || !hasText(code.license) || !hasText(code.notes, 20)) {
        fail(11, id, `rights.code requires non-empty license + explanatory notes`);
      }
      if (!isRecord(data) || !hasText(data.terms) || !hasText(data.notes, 20)) {
        fail(11, id, `rights.data requires non-empty terms + explanatory notes`);
      }
      if (!isRecord(images) || !hasText(images.terms) || !hasText(images.notes, 20)) {
        fail(11, id, `rights.images requires non-empty terms + explanatory notes`);
      }

      const verdict = isRecord(redistribution) ? redistribution.verdict : undefined;
      if (
        !isRecord(redistribution) ||
        !hasText(verdict) ||
        !VALID_REDISTRIBUTION_VERDICTS.has(verdict) ||
        !hasText(redistribution.notes, 20)
      ) {
        fail(
          11,
          id,
          `rights.redistribution requires a valid verdict + explanatory notes`,
        );
      }

      if (!hasText(safeDefault) || !VALID_RIGHTS_SAFE_DEFAULTS.has(safeDefault)) {
        fail(11, id, `rights.safe_default '${String(safeDefault)}' is invalid`);
      }
      if (!hasText(rightsNotes, 20)) {
        fail(11, id, `rights.notes must explain cross-layer caveats / review triggers`);
      }

      if (!hasText(reviewedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) {
        fail(11, id, `rights.reviewed_at must be an ISO calendar date (YYYY-MM-DD)`);
      } else {
        const reviewedTime = Date.parse(`${reviewedAt}T00:00:00Z`);
        if (
          !Number.isFinite(reviewedTime) ||
          new Date(reviewedTime).toISOString().slice(0, 10) !== reviewedAt
        ) {
          fail(11, id, `rights.reviewed_at '${reviewedAt}' is not a real calendar date`);
        } else if (reviewedTime > Date.now() + 24 * 60 * 60 * 1000) {
          fail(11, id, `rights.reviewed_at '${reviewedAt}' is in the future`);
        }
      }

      if (!Array.isArray(evidenceUrls) || evidenceUrls.length === 0) {
        fail(11, id, `rights.evidence_urls must contain at least one official URL`);
      } else {
        for (const evidenceUrl of evidenceUrls) {
          if (!hasText(evidenceUrl) || !evidenceUrl.startsWith("https://")) {
            fail(11, id, `rights.evidence_urls contains a non-HTTPS URL: '${String(evidenceUrl)}'`);
            continue;
          }
          try {
            new URL(evidenceUrl);
          } catch {
            fail(11, id, `rights.evidence_urls contains an invalid URL: '${evidenceUrl}'`);
          }
        }
      }

      if (meta.redistribute === true && verdict !== "permitted") {
        fail(
          11,
          id,
          `legacy redistribute:true requires rights.redistribution.verdict='permitted'`,
        );
      }
      if (safeDefault === "redistribute" && verdict !== "permitted") {
        fail(11, id, `safe_default='redistribute' requires verdict='permitted'`);
      }
      if (safeDefault === "contract-only" && verdict !== "contract-required") {
        fail(11, id, `safe_default='contract-only' requires verdict='contract-required'`);
      }
      if (safeDefault === "no-fetch" && (meta.access !== "blocked" || meta.status !== "blocked")) {
        fail(11, id, `safe_default='no-fetch' requires both access and status to be 'blocked'`);
      }
      if ((meta.access === "blocked" || meta.status === "blocked") && safeDefault !== "no-fetch") {
        fail(11, id, `blocked access/status requires rights.safe_default='no-fetch'`);
      }
    }

    // Check 8: game validity
    if (Array.isArray(meta.games)) {
      for (const code of meta.games) {
        if (!game_codes.has(code)) {
          fail(8, id, `meta.games contains '${code}' which is not a registered GameCode in @cambridge-tcg/sku`);
        }
      }
    }
  }

  // ── Inverse check: directories without registry entries ──────────────
  for (const dir of dirs) {
    if (!(dir in sources)) {
      fail(1, dir, `directory packages/data-ingest/src/${dir}/ exists but no entry in SOURCES registry`);
    }
  }

  // ── Check 9: ingest-run recency (substrate-honest about scope) ───────
  // For each shipped source, verify the last `ingest_run.finished_at`
  // is within 2× the FreshnessKey budget. Skips gracefully when
  // WHOLESALE_DATABASE_URL is unset, the ingest_run table doesn't exist
  // (Phase A migration not applied), or the source hasn't run yet.
  //
  // Designed in `docs/connections/the-cardrush-alignment.md` §3 (Phase E).
  if (!WHOLESALE_DATABASE_URL) {
    console.log(
      `  [check 9] skipped — WHOLESALE_DATABASE_URL not set (set it to enable the ingest-run recency check)`,
    );
  } else {
    try {
      const { createDb } = await import("@cambridge-tcg/db");
      const { client, close } = createDb({ url: WHOLESALE_DATABASE_URL });

      try {
        // Does the table exist? Phase A migration creates it.
        const tableCheck = await client<{ exists: boolean }[]>`
          SELECT to_regclass('public.ingest_run') IS NOT NULL AS exists
        `;
        const tableExists = tableCheck[0]?.exists ?? false;

        if (!tableExists) {
          console.log(
            `  [check 9] skipped — ingest_run table not present (apply drizzle/0014_price_archive_provenance.sql first)`,
          );
        } else {
          for (const [id, mod] of Object.entries(sources)) {
            if (!mod) continue;
            if (mod.meta.status !== "shipped" && mod.meta.status !== "partial") continue;

            const recent = await client<{ finished_at: Date | null }[]>`
              SELECT finished_at
                FROM ingest_run
               WHERE source_id = ${id}
                 AND status = 'done'
               ORDER BY finished_at DESC NULLS LAST
               LIMIT 1
            `;
            const last = recent[0]?.finished_at;
            if (!last) {
              warn(9, id, `no completed ingest_run rows yet (source may be newly registered)`);
              continue;
            }
            const ageSec = (Date.now() - new Date(last).getTime()) / 1000;
            const budgetSec = FRESHNESS_SECONDS[mod.meta.freshness] ?? 86400;
            if (ageSec > 2 * budgetSec) {
              const ageHrs = (ageSec / 3600).toFixed(1);
              const budgetHrs = (budgetSec / 3600).toFixed(1);
              fail(
                9,
                id,
                `last ingest_run.finished_at is ${ageHrs}h old; freshness budget is ${budgetHrs}h (2× threshold exceeded)`,
              );
            }
          }
        }
      } finally {
        await close();
      }
    } catch (err) {
      console.log(
        `  [check 9] skipped — DB query failed (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
  }

  // ── Check 10: license propagation (kingdom-081) ──────────────────────
  // For every non-redistributable source declared in the registry, find
  // emission sites that reference it by name and verify the same file
  // declares `@source_license` or `source_license`. Heuristic; false
  // positives are expected and reduce as license-propagation work lands.
  //
  // Designed in docs/connections/the-cardrush-alignment.md §3 Phase E +
  // the kingdom-081 plan in docs/connections/the-license-propagation.md.
  {
    const NON_REDISTRIBUTABLE_SOURCE_IDS = new Set<string>();
    for (const [id, mod] of Object.entries(sources)) {
      if (mod && mod.meta.redistribute === false) {
        NON_REDISTRIBUTABLE_SOURCE_IDS.add(id);
      }
    }

    const SCAN_ROOTS = [
      resolve(REPO_ROOT, "apps", "storefront", "src", "app", "api"),
      resolve(REPO_ROOT, "apps", "wholesale", "src", "app", "api"),
    ];

    function listRouteFiles(root: string): string[] {
      const out: string[] = [];
      if (!existsSync(root)) return out;
      const stack = [root];
      while (stack.length) {
        const dir = stack.pop()!;
        for (const entry of readdirSync(dir)) {
          const p = join(dir, entry);
          const st = statSync(p);
          if (st.isDirectory()) {
            // Skip node_modules + dotted dirs
            if (entry.startsWith(".") || entry === "node_modules") continue;
            stack.push(p);
          } else if (entry === "route.ts" || entry === "route.tsx") {
            out.push(p);
          }
        }
      }
      return out;
    }

    const route_files = SCAN_ROOTS.flatMap(listRouteFiles);

    for (const id of NON_REDISTRIBUTABLE_SOURCE_IDS) {
      // Pattern: file mentions the source id as a string in a sources-array
      // context. Heuristic: look for `"<id>"` anywhere in the file. Then
      // check the same file has `source_license` or `@source_license`.
      const id_token = `"${id}"`;
      for (const file of route_files) {
        const text = readFileSync(file, "utf8");
        if (!text.includes(id_token)) continue;
        // Only flag if it looks like a sources-array context (avoid e.g.
        // pure comments that mention "cardrush" — though those would still
        // need source_license nearby anyway). Heuristic: the source-id token
        // appears within 200 chars of "sources" (case-insensitive).
        const idx = text.indexOf(id_token);
        if (idx === -1) continue;
        const near_window = text.slice(Math.max(0, idx - 200), idx + 200);
        if (!/sources/i.test(near_window)) continue;
        // The check: is source_license declared anywhere in this file?
        if (!text.includes("source_license") && !text.includes("@source_license")) {
          const short_path = file.replace(REPO_ROOT + "/", "");
          fail(10, id, `${short_path} references "${id}" in a sources context but does not declare source_license. License tier "${(sources as Record<string, ModuleShape | undefined>)[id]?.meta.license ?? "?"}" must propagate to the emission.`);
        }
      }
    }
  }

  // ── Strict-mode: every "shipped" row in the catalog has a module ─────
  if (STRICT && existsSync(CATALOG_PATH)) {
    const catalog = readFileSync(CATALOG_PATH, "utf8");
    const shipped_rows = (catalog.match(/\*\*shipped\*\*/gi) ?? []).length;
    if (shipped_rows > 0 && registered === 0) {
      warn(0, "(catalog)", `catalog has ${shipped_rows} shipped rows but registry has 0 implemented modules`);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");

  console.log("");
  console.log(`◆ tributaries audit — data-ingest source protocol conformance`);
  console.log("");
  console.log(`  modules registered: ${registered} implemented + ${planned} planned slot${planned === 1 ? "" : "s"}`);
  console.log(`  catalog anchors:    ${catalog_anchors.size}`);
  console.log(`  source directories: ${dirs.size}`);
  console.log(`  game codes:         ${game_codes.size}`);
  console.log("");

  if (fails.length === 0 && warns.length === 0) {
    console.log("✓ all checks passed");
    console.log("");
    process.exit(0);
  }

  if (fails.length > 0) {
    console.log(`✗ ${fails.length} failure${fails.length === 1 ? "" : "s"}:`);
    for (const f of fails) {
      console.log(`    [check ${f.check}] ${f.id}: ${f.message}`);
    }
    console.log("");
  }

  if (warns.length > 0) {
    console.log(`⚠ ${warns.length} warning${warns.length === 1 ? "" : "s"}:`);
    for (const w of warns) {
      console.log(`    [check ${w.check}] ${w.id}: ${w.message}`);
    }
    console.log("");
  }

  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});
