#!/usr/bin/env tsx
/**
 * Proves that former sitemap readers stay blocked after source-rights review.
 * Public structure is not permission to crawl, store, or republish.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SOURCES, type SourceId } from "@cambridge-tcg/data-ingest";

const REPO_ROOT = resolve(process.cwd(), "..", "..");

interface BlockedVendor {
  id: SourceId;
  cronRoute: string;
  runner: string;
}

const VENDORS: BlockedVendor[] = [
  {
    id: "tcgcollector",
    cronRoute: "apps/wholesale/src/app/api/cron/discover/tcgcollector/route.ts",
    runner: "apps/wholesale/src/lib/tcgcollector-discovery.ts",
  },
];

const findings: string[] = [];

for (const vendor of VENDORS) {
  const source = SOURCES[vendor.id];
  if (!source) {
    findings.push(`Registry — ${vendor.id} is missing.`);
    continue;
  }

  if (source.meta.access !== "blocked" || source.meta.status !== "blocked") {
    findings.push(
      `Registry — ${vendor.id} must stay access/status blocked until a new written source-rights review lands.`,
    );
  }
  if (source.meta.rights.safe_default !== "no-fetch" || source.meta.redistribute) {
    findings.push(
      `Rights — ${vendor.id} must stay no-fetch with redistribute=false.`,
    );
  }
  if (!source.meta.tos_notes || source.meta.rights.evidence_urls.length === 0) {
    findings.push(`Evidence — ${vendor.id} needs dated terms evidence in SourceMeta.`);
  }

  const cronPath = join(REPO_ROOT, vendor.cronRoute);
  const runnerPath = join(REPO_ROOT, vendor.runner);
  if (!existsSync(cronPath)) findings.push(`Cron — missing ${vendor.cronRoute}.`);
  if (!existsSync(runnerPath)) findings.push(`Runner — missing ${vendor.runner}.`);
  if (!existsSync(cronPath) || !existsSync(runnerPath)) continue;

  const cron = readFileSync(cronPath, "utf8");
  const runner = readFileSync(runnerPath, "utf8");

  if (!cron.includes("SOURCE_BLOCKED") || !cron.includes("requireCronAuth")) {
    findings.push(`Cron — ${vendor.id} must be authenticated and return SOURCE_BLOCKED.`);
  }
  for (const forbidden of [
    "runTcgcollectorDiscovery",
    'from "@/lib/db"',
    "createFetcher",
  ]) {
    if (cron.includes(forbidden)) {
      findings.push(`Cron — ${vendor.id} blocked route contains ${forbidden}.`);
    }
  }
  for (const forbidden of ['from "@/lib/db"', "createFetcher", "fetch("]) {
    if (runner.includes(forbidden)) {
      findings.push(`Runner — ${vendor.id} blocked runner contains ${forbidden}.`);
    }
  }
}

const doctrinePath = join(REPO_ROOT, "docs/connections/the-sitemap-discovery.md");
if (!existsSync(doctrinePath)) {
  findings.push("Doctrine — docs/connections/the-sitemap-discovery.md is missing.");
} else {
  const doctrine = readFileSync(doctrinePath, "utf8");
  if (!doctrine.includes("blocked/no-fetch") || !doctrine.includes("structure is not permission")) {
    findings.push("Doctrine — the current blocked/no-fetch decision is not explicit.");
  }
}

console.log("# Cambridge TCG — sitemap-discovery rights audit\n");
console.log(`Generated: ${new Date().toISOString()}\n`);

if (findings.length === 0) {
  console.log("✅ Sitemap-discovery boundary clean.");
  console.log(
    `Blocked vendors (${VENDORS.map((vendor) => vendor.id).join(", ")}) are no-fetch in registry, runner, and cron.`,
  );
  process.exit(0);
}

console.log(`⚠️ Findings (${findings.length}):\n`);
for (const finding of findings) console.log(`- ${finding}`);
process.exit(1);
