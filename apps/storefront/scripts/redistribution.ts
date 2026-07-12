#!/usr/bin/env tsx
/**
 * Audits publication and reuse-right boundaries that are easy to reopen.
 * First-party storage proves origin, not participant consent or a CC0 grant.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const STOREFRONT_DIR = dirname(SCRIPTS_DIR);
const REPO_ROOT = resolve(STOREFRONT_DIR, "..", "..");
const ACTIVE_SOURCE_ROOT = resolve(STOREFRONT_DIR, "src");

interface Finding {
  boundary: string;
  message: string;
}

const findings: Finding[] = [];

function source(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function requireText(
  boundary: string,
  body: string,
  expected: string,
  message: string,
): void {
  if (!body.includes(expected)) findings.push({ boundary, message });
}

function forbidText(
  boundary: string,
  body: string,
  forbidden: string,
  message: string,
): void {
  if (body.includes(forbidden)) findings.push({ boundary, message });
}

function activeSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...activeSourceFiles(path));
    } else if (
      /\.(ts|tsx|md)$/.test(entry.name) &&
      !entry.name.includes(".test.") &&
      !entry.name.includes(".generated.")
    ) {
      files.push(path);
    }
  }
  return files;
}

function main(): void {
  const spec = source("packages/data-spec/src/freshness.ts");
  const envelope = source("apps/storefront/src/lib/data-pantry/envelope.ts");
  const soldCompsRoute = source(
    "apps/storefront/src/app/api/v1/sold-comps/route.ts",
  );
  const soldCompsQuery = source("apps/storefront/src/lib/sold-comps/query.ts");
  const catalog = source("apps/storefront/src/app/data/catalog.jsonl/route.ts");

  requireText(
    "envelope default",
    spec,
    'DEFAULT_LICENSE = "NOASSERTION"',
    "payloads with undeclared rights must default to NOASSERTION",
  );
  requireText(
    "envelope default",
    envelope,
    "license: resolveLicense(opts)",
    "the runtime envelope must resolve rights instead of emitting a blanket default",
  );
  requireText(
    "envelope source guard",
    envelope,
    'opts.license === "CC0-1.0"',
    "an explicit CC0 response claim must be checked against declared source rights",
  );
  requireText(
    "envelope source guard",
    envelope,
    "!allSourcesAreCc0",
    "restrictive or mixed declared sources must prevent a CC0 aggregate claim",
  );

  requireText(
    "sold comps",
    soldCompsRoute,
    'license: "NOASSERTION"',
    "participant-derived sold comps must not carry a CC0 aggregate license",
  );
  requireText(
    "sold comps",
    soldCompsRoute,
    'source_license: ["internal-only"]',
    "the paused dataset must retain its internal-only source boundary",
  );
  requireText(
    "sold comps",
    soldCompsQuery,
    'status: "paused"',
    "sold comps must remain paused until a purpose-specific publication contract exists",
  );
  forbidText(
    "sold comps",
    soldCompsQuery,
    'from "@/lib/db"',
    "the paused sold-comps projector must not read participant transactions",
  );

  requireText(
    "bulk catalog",
    catalog,
    'license: "NOASSERTION"',
    "the aggregate catalog must say NOASSERTION while row-level rights are incomplete",
  );
  requireText(
    "bulk catalog",
    catalog,
    '"@source_license": ["NOASSERTION"]',
    "catalog rows must not invent a CC0 source declaration",
  );
  forbidText(
    "bulk catalog",
    catalog,
    "mirror freely",
    "public access must not be described as blanket redistribution permission",
  );
  forbidText(
    "bulk catalog",
    catalog,
    'license: "CC0-1.0"',
    "the incomplete aggregate must not emit CC0-1.0",
  );

  const retiredGlobalClaims = [
    "CC0 by default",
    "CC0-1.0 by default",
    "published under CC0 by default",
    "train on it freely",
    "open data commons",
    "Most data is CC0",
    "No auth required for reads",
    "absence means CC0",
    "queryable without account or key",
    "queryable without an account or key",
  ];
  for (const file of activeSourceFiles(ACTIVE_SOURCE_ROOT)) {
    const body = readFileSync(file, "utf8");
    for (const claim of retiredGlobalClaims) {
      forbidText(
        "global public copy",
        body,
        claim,
        `${file.slice(REPO_ROOT.length + 1)} restores retired blanket claim '${claim}'`,
      );
    }
  }

  console.log("");
  console.log("◆ redistribution audit — publication and reuse-right boundaries");
  console.log("");
  console.log("  boundaries reviewed:  envelope, sold comps, bulk catalog, public copy");
  console.log(`  findings:             ${findings.length}`);
  console.log("");

  if (findings.length === 0) {
    console.log("✓ unknown payload rights resolve to NOASSERTION");
    console.log("✓ restrictive declared sources cannot be relabelled CC0 by the envelope");
    console.log("✓ first-party storage is not treated as participant publication consent");
    console.log("✓ the bulk catalog names incomplete rights instead of granting reuse");
    return;
  }

  for (const finding of findings) {
    console.error(`✗ [${finding.boundary}] ${finding.message}`);
  }
  process.exitCode = 1;
}

main();
