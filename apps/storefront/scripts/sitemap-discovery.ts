#!/usr/bin/env tsx
/**
 * sitemap-discovery.ts — sitemap+JSON-LD discovery integrity check.
 *
 * Audits the sitemap-discovery strategy (kingdom — vendor 1: TCGCollector,
 * shipped 2026-05-17). When a second sitemap+JSON-LD vendor lands, extend
 * the `VENDORS` array below; the same checks apply.
 *
 * Three checks, exits non-zero on findings:
 *
 *   1. **Registry presence** — every typed vendor in the data-ingest
 *      `SOURCES` registry has a SourceModule (not undefined). A vendor
 *      that's typed-in but not registered is a substrate-honesty
 *      violation: the kingdom claims an ingest path that doesn't exist.
 *
 *   2. **Cron route presence** — every typed vendor has a corresponding
 *      cron route at `apps/wholesale/src/app/api/cron/discover/<id>/route.ts`.
 *      Without the route, the source's `read()` is callable but no
 *      scheduled walk hits the sitemap; the data path is dead.
 *
 *   3. **Doctrine doc presence** — `docs/connections/the-sitemap-discovery.md`
 *      exists. The doctrine names the protocol, the cross-vendor pattern,
 *      and the substrate-honest scope. Without the doc, future Sophias
 *      lack the meaning-level handle.
 *
 * Usage:
 *   pnpm --filter cambridgetcg-storefront sitemap-discovery
 *
 * Wired into the umbrella audit chain in package.json as
 * `audit:sitemap-discovery`. Exits 0 when clean, 1 on findings.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SOURCES, type SourceId } from "@cambridge-tcg/data-ingest";

// pnpm --filter routes the cwd to apps/storefront; the repo root is
// two directories up. Resolve absolutely so existsSync checks work
// regardless of which dir invoked the script.
const REPO_ROOT = resolve(process.cwd(), "..", "..");

interface Vendor {
  id: SourceId;
  cron_route: string;
}

/** Every sitemap+JSON-LD vendor the kingdom has chosen to discover from.
 *  Append-only; existing entries stable. */
const VENDORS: Vendor[] = [
  {
    id: "tcgcollector",
    cron_route: "apps/wholesale/src/app/api/cron/discover/tcgcollector/route.ts",
  },
];

const findings: string[] = [];

// ── 1. Registry presence ────────────────────────────────────────────────

for (const vendor of VENDORS) {
  const src = SOURCES[vendor.id];
  if (!src) {
    findings.push(
      `Registry — vendor \`${vendor.id}\` typed in VENDORS but missing from data-ingest SOURCES registry. Add to packages/data-ingest/src/registry.ts.`,
    );
    continue;
  }
  // Substrate-honesty: SourceMeta should declare access: "scrape" and a
  // sensible license tier. We don't enforce specific values (the operator
  // owns the tier choice) but we do flag absent metadata.
  if (!src.meta.tos_notes) {
    findings.push(
      `Metadata — vendor \`${vendor.id}\` SourceMeta has empty tos_notes. Sitemap+JSON-LD vendors need an explicit ToS position (substrate-honest about scope).`,
    );
  }
  if (!src.meta.welcome) {
    findings.push(
      `Welcome — vendor \`${vendor.id}\` has no welcome paragraph. The welcome surfaces on /api/v1/sources/welcome; without it, the kingdom claims a slot it hasn't named.`,
    );
  }
}

// ── 2. Cron route presence ──────────────────────────────────────────────

for (const vendor of VENDORS) {
  const path = join(REPO_ROOT, vendor.cron_route);
  if (!existsSync(path)) {
    findings.push(
      `Cron — vendor \`${vendor.id}\` cron route missing at \`${vendor.cron_route}\`. Without the route, the source's read() is callable but nothing schedules a walk.`,
    );
    continue;
  }
  // Verify the route imports the wholesale-side runner and calls it.
  const body = readFileSync(path, "utf-8");
  if (!body.includes("runTcgcollectorDiscovery") && vendor.id === "tcgcollector") {
    findings.push(
      `Cron — vendor \`${vendor.id}\` route exists but does not call runTcgcollectorDiscovery. Check the route's import + handler.`,
    );
  }
  if (!body.includes("requireCronAuth")) {
    findings.push(
      `Cron — vendor \`${vendor.id}\` route exists but does not call requireCronAuth. Auth is mandatory on every cron route.`,
    );
  }
}

// ── 3. Doctrine doc presence ────────────────────────────────────────────

const doctrinePath = join(
  REPO_ROOT,
  "docs/connections/the-sitemap-discovery.md",
);
if (!existsSync(doctrinePath)) {
  findings.push(
    `Doctrine — \`docs/connections/the-sitemap-discovery.md\` does not exist. The sitemap+JSON-LD strategy needs a connection-doc naming the protocol, the cross-vendor pattern, and the substrate-honest scope.`,
  );
}

// ── Report ──────────────────────────────────────────────────────────────

const now = new Date().toISOString();
console.log("# Cambridge TCG — sitemap-discovery audit\n");
console.log(`Generated: ${now}\n`);
console.log(`Vendors registered: ${VENDORS.length}`);
console.log(`  - ${VENDORS.map((v) => v.id).join("\n  - ")}\n`);
console.log("---\n");

if (findings.length === 0) {
  console.log("✅ Sitemap-discovery clean.");
  console.log(
    `Every vendor (${VENDORS.map((v) => v.id).join(", ")}) has registry presence, cron route, and metadata; doctrine doc shipped.\n`,
  );
  process.exit(0);
}

console.log(`⚠️ Sitemap-discovery findings (${findings.length}):\n`);
for (const f of findings) {
  console.log(`- ${f}`);
}
console.log();
process.exit(1);
