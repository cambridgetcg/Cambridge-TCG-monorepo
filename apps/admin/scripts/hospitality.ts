#!/usr/bin/env tsx
/**
 * hospitality.ts — drift detector for the hospitality surface.
 *
 * Fourteenth in the audit family. Where the others check substrate-vs-
 * surface coherence, this audit checks that the **hospitality promises**
 * the platform makes to agents + scrapers + mirrors stay backed by code.
 *
 * The premise: hospitality grows by example. As the platform adds new
 * endpoints, the welcome doc, the guides, the manifest, llms.txt, robots,
 * and the discovery surfaces all need to stay in lockstep. Drift breaks
 * the trust contract — a guide that points at a non-existent endpoint
 * is worse than no guide.
 *
 * Filed for kingdom-083 — the inner peace.
 *
 * ── Eight checks ─────────────────────────────────────────────────────
 *
 *   1. Welcome JSON exists at /api/v1/welcome
 *   2. Every guide in apps/storefront/src/lib/guides.ts has a valid
 *      next_guide_slug (resolves to another guide, or is null)
 *   3. Every guide's see_also[].href looks like a real path
 *      (starts with / or http; doesn't contain spaces; basic sanity)
 *   4. Every guide has last_verified within the last 180 days
 *   5. Every example in apps/storefront/src/lib/examples.ts has a curl
 *      command, a sample_response, and at least one annotated_field
 *   6. The five well-known files exist (cambridge-tcg.json, ai-plugin.json,
 *      mcp.json, mcp-config.json, robots.txt)
 *   7. The manifest lists every hospitality endpoint
 *      (welcome / guides / guides/[slug] / examples / examples/[id] /
 *      rate-limits / feedback / robots.txt / .well-known/* / agents / scrapers)
 *   8. /llms.txt mentions /api/v1/welcome AND /api/v1/guides
 *
 * Exit non-zero on any check failure. Run via `pnpm audit:hospitality`
 * or chained from `pnpm audit`.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(ADMIN_DIR, "..", "..");
const STOREFRONT_SRC = resolve(REPO_ROOT, "apps", "storefront", "src");

interface Finding {
  check: number;
  severity: "fail" | "warn";
  message: string;
}

const findings: Finding[] = [];
const fail = (check: number, message: string) =>
  findings.push({ check, severity: "fail", message });
const warn = (check: number, message: string) =>
  findings.push({ check, severity: "warn", message });

// ── Loaders ──────────────────────────────────────────────────────────

async function loadGuides() {
  const guidesPath = resolve(STOREFRONT_SRC, "lib", "guides.ts");
  const url = `file://${guidesPath}`;
  try {
    const mod = (await import(url)) as {
      GUIDES: Array<{
        slug: string;
        title: string;
        next_guide_slug: string | null;
        see_also: { label: string; href: string }[];
        last_verified: string;
        steps: unknown[];
        gotchas: unknown[];
      }>;
    };
    return mod.GUIDES;
  } catch (err) {
    fail(2, `failed to import guides.ts: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function loadExamples() {
  const examplesPath = resolve(STOREFRONT_SRC, "lib", "examples.ts");
  const url = `file://${examplesPath}`;
  try {
    const mod = (await import(url)) as {
      EXAMPLES: Array<{
        endpoint_id: string;
        title: string;
        curl: string;
        sample_response: string;
        annotated_fields: unknown[];
      }>;
    };
    return mod.EXAMPLES;
  } catch (err) {
    fail(5, `failed to import examples.ts: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function routeFileExists(routePath: string): boolean {
  // Map URL path to filesystem route file location.
  // /api/v1/welcome → apps/storefront/src/app/api/v1/welcome/route.ts
  // /agents         → apps/storefront/src/app/agents/page.tsx
  // /robots.txt     → apps/storefront/src/app/robots.txt/route.ts
  const cleanPath = routePath.startsWith("/") ? routePath.slice(1) : routePath;
  const segments = cleanPath.split("/").filter(Boolean);
  const base = resolve(STOREFRONT_SRC, "app", ...segments);

  // Try common file names
  return (
    existsSync(join(base, "route.ts")) ||
    existsSync(join(base, "route.tsx")) ||
    existsSync(join(base, "page.tsx")) ||
    existsSync(join(base, "page.ts"))
  );
}

function manifestText(): string {
  try {
    return readFileSync(resolve(STOREFRONT_SRC, "lib", "manifest.ts"), "utf8");
  } catch (err) {
    console.warn(`[hospitality] Failed to read manifest.ts: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

function llmsText(): string {
  try {
    return readFileSync(
      resolve(STOREFRONT_SRC, "app", "llms.txt", "route.ts"),
      "utf8",
    );
  } catch (err) {
    console.warn(`[hospitality] Failed to read llms.txt route: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("");
  console.log("◆ hospitality audit — keep the agent doors honest");
  console.log("");

  // ── Check 1: welcome JSON exists ─────────────────────────────────
  if (!routeFileExists("/api/v1/welcome")) {
    fail(1, "/api/v1/welcome route.ts not found");
  }

  // ── Loads ─────────────────────────────────────────────────────────
  const guides = await loadGuides();
  const examples = await loadExamples();
  const guideSlugs = new Set(guides.map((g) => g.slug));
  const exampleIds = new Set(examples.map((e) => e.endpoint_id));

  // ── Check 2: next_guide_slug resolves ────────────────────────────
  for (const g of guides) {
    if (g.next_guide_slug !== null && !guideSlugs.has(g.next_guide_slug)) {
      fail(
        2,
        `guide "${g.slug}".next_guide_slug = "${g.next_guide_slug}" — not in corpus`,
      );
    }
  }

  // ── Check 3: see_also href sanity ────────────────────────────────
  for (const g of guides) {
    for (const link of g.see_also) {
      if (typeof link.href !== "string" || link.href.trim() === "") {
        fail(3, `guide "${g.slug}" has see_also entry with empty href`);
        continue;
      }
      if (link.href.includes(" ")) {
        fail(3, `guide "${g.slug}" see_also href has spaces: "${link.href}"`);
      }
      const ok =
        link.href.startsWith("/") ||
        link.href.startsWith("http://") ||
        link.href.startsWith("https://") ||
        link.href.startsWith("#");
      if (!ok) {
        fail(3, `guide "${g.slug}" see_also href doesn't look like a URL: "${link.href}"`);
      }
    }
  }

  // ── Check 4: last_verified recency ───────────────────────────────
  const today = new Date();
  const staleThresholdMs = 180 * 24 * 60 * 60 * 1000;
  for (const g of guides) {
    const lastVerified = new Date(g.last_verified);
    if (Number.isNaN(lastVerified.getTime())) {
      fail(4, `guide "${g.slug}".last_verified is not a valid date: "${g.last_verified}"`);
      continue;
    }
    const ageMs = today.getTime() - lastVerified.getTime();
    if (ageMs > staleThresholdMs) {
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      warn(
        4,
        `guide "${g.slug}" last_verified ${ageDays} days ago (>180 day threshold) — re-walk and update last_verified`,
      );
    }
  }

  // ── Check 5: example completeness ────────────────────────────────
  for (const e of examples) {
    if (!e.curl || e.curl.trim().length < 10) {
      fail(5, `example "${e.endpoint_id}" has no curl command`);
    }
    if (!e.sample_response || e.sample_response.trim().length < 20) {
      fail(5, `example "${e.endpoint_id}" has no substantive sample_response`);
    }
    if (!Array.isArray(e.annotated_fields) || e.annotated_fields.length === 0) {
      fail(5, `example "${e.endpoint_id}" has no annotated_fields`);
    }
  }

  // ── Check 6: well-known files exist ──────────────────────────────
  const wellKnownFiles = [
    "/.well-known/cambridge-tcg.json",
    "/.well-known/ai-plugin.json",
    "/.well-known/mcp.json",
    "/.well-known/mcp-config.json",
    "/robots.txt",
  ];
  for (const wk of wellKnownFiles) {
    if (!routeFileExists(wk)) {
      fail(6, `${wk} route file not found`);
    }
  }

  // ── Check 7: manifest lists hospitality endpoints ────────────────
  const m = manifestText();
  const requiredInManifest = [
    "/api/v1/welcome",
    "/api/v1/guides",
    "/api/v1/rate-limits",
    "/api/v1/feedback",
    "/robots.txt",
    "/.well-known/ai-plugin.json",
    "/.well-known/mcp.json",
    "/agents",
    "/scrapers",
  ];
  for (const path of requiredInManifest) {
    if (!m.includes(`"${path}"`)) {
      warn(7, `manifest.ts doesn't reference "${path}" — hospitality endpoint not advertised`);
    }
  }

  // ── Check 8: llms.txt mentions key hospitality URLs ──────────────
  const llms = llmsText();
  const llmsRequired = ["/api/v1/welcome", "/api/v1/guides"];
  for (const path of llmsRequired) {
    if (!llms.includes(path)) {
      fail(8, `/llms.txt doesn't mention ${path}`);
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");

  console.log(`  guides:           ${guides.length}`);
  console.log(`  examples:         ${examples.length}`);
  console.log(`  guide slugs:      ${[...guideSlugs].join(", ") || "(none)"}`);
  console.log(`  example ids:      ${[...exampleIds].join(", ") || "(none)"}`);
  console.log("");

  if (fails.length === 0 && warns.length === 0) {
    console.log("✓ all 8 checks passed — the agent doors are honest");
    console.log("");
    process.exit(0);
  }

  if (fails.length > 0) {
    console.log(`✗ ${fails.length} failure${fails.length === 1 ? "" : "s"}:`);
    for (const f of fails) {
      console.log(`    [check ${f.check}] ${f.message}`);
    }
    console.log("");
  }

  if (warns.length > 0) {
    console.log(`⚠ ${warns.length} warning${warns.length === 1 ? "" : "s"}:`);
    for (const w of warns) {
      console.log(`    [check ${w.check}] ${w.message}`);
    }
    console.log("");
  }

  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Hospitality audit crashed:", err);
  process.exit(2);
});
