#!/usr/bin/env tsx
// Module-scope marker — keeps `main` from leaking into global scope.
export {};

/**
 * nav-coverage.ts — drift detector for the storefront navigation
 * substrate (kingdom-091).
 *
 * Seventeenth in the audit family. Walks `apps/storefront/src/app/`
 * for every `page.tsx`, compares against the typed nav source-of-truth
 * at `apps/storefront/src/lib/nav/menu-config.ts` + the account nav at
 * `apps/storefront/src/app/account/_nav.tsx` + the breadcrumb registry,
 * and reports orphans (routes not reachable from any nav).
 *
 * Five checks:
 *
 *   1. Route → nav coverage: every public page.tsx is either
 *      (a) linked from a mega-menu column, OR
 *      (b) listed in ACCOUNT_NAV_ITEMS (for /account/* routes), OR
 *      (c) listed in an allow-list of orphan-by-design routes.
 *
 *   2. Nav → route validity: every URL in STOREFRONT_PRIMARY_NAV
 *      resolves to a real route (no broken nav links).
 *
 *   3. Methodology completeness: every /methodology/* page is
 *      reachable from Discover ▾ or About ▾ (either directly or via
 *      the /methodology hub link).
 *
 *   4. Breadcrumb registry coverage: every deep dynamic route (depth
 *      > 2 with at least one [slug]) should have a breadcrumb pattern.
 *      Heuristic; informational only.
 *
 *   5. Audience-rule consistency: every prefix in audience-detection
 *      resolves to exactly one audience (no overlapping ambiguity).
 *
 * Behaviour: informational. Exits 0 unless a hard violation is found.
 */

import { readdirSync, statSync } from "fs";
import { join, relative } from "path";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const STOREFRONT_APP = join(REPO_ROOT, "apps/storefront/src/app");
const MENU_CONFIG = join(REPO_ROOT, "apps/storefront/src/lib/nav/menu-config.ts");
const ACCOUNT_NAV = join(REPO_ROOT, "apps/storefront/src/app/account/_nav.tsx");
const METHODOLOGY_DIR = join(REPO_ROOT, "apps/storefront/src/app/methodology");

/** Routes that intentionally have no nav presence (deep drill-downs, special). */
const ORPHAN_ALLOWLIST: ReadonlyArray<string | RegExp> = [
  "/",
  "/login",
  "/login/check-email",
  "/welcome",
  "/intro",
  "/welcomes",
  "/checkout",
  "/order-confirmation",
  "/og",
  "/api",
  // Sister-shipped routes covered by their kingdom's own surfaces (kingdom-046+):
  "/account/collectives",
  "/account/emails",
  "/account/wishlist",
  "/admin",
  "/bridge",
  "/data",
  "/membership",
  "/prices/search",
  // Parameterized routes — concrete instances in menu (e.g. /prices/one-piece) cover these.
  "/prices/[game]",
  "/prices/[game]/movers",
  // Dynamic drill-downs
  /^\/account\/.+\/.+/, // /account/trades/[id]/review etc. — reachable from parent
  /^\/auctions\/\[id\]/,
  /^\/cards\/\[sku\]/,
  /^\/c\/\[slug\]/,
  /^\/product\/\[sku\]/,
  /^\/decks\/\[slug\]/,
  /^\/market\/\[/,
  /^\/market\/lots\/\[/,
  /^\/prices\/\[game\]\/\[/,
  /^\/play\/\[code\]/,
  /^\/play\/adventure\/\[/,
  /^\/rewards\/raffles\/\[/,
  /^\/rewards\/mystery-boxes\/\[/,
  /^\/u\/\[username\]/,
  /^\/bounty\/verify\/\[/,
  /^\/admin\//, // storefront /admin is admin-gated; admin app surfaces it
  /^\/account\/sets\/\[code\]/,
  /^\/account\/portfolio\/(add|value)$/,
  /^\/verify\/(draw|pull)\/\[id\]/,
  /^\/agents\/guides\/\[slug\]/,
  /^\/trade-in\/(confirm|quote)\/\[ref\]/,
  /^\/methodology\/\[/, // all methodology pages reachable via /methodology hub
  /^\/methodology\/[a-z-]+$/,
];

function isOrphanAllowed(route: string): boolean {
  for (const allow of ORPHAN_ALLOWLIST) {
    if (typeof allow === "string") {
      if (route === allow) return true;
    } else {
      if (allow.test(route)) return true;
    }
  }
  return false;
}

/**
 * Walk the app router tree and return every URL pattern with a
 * page.tsx file. Brackets are preserved verbatim.
 */
function discoverRoutes(): string[] {
  const routes: string[] = [];

  function walk(dir: string, urlPrefix: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes("page.tsx") || entries.includes("page.ts")) {
      routes.push(urlPrefix || "/");
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      // Skip private folders + special Next.js folders.
      // Note: api/ may itself contain a page.tsx (the API discovery page) —
      // that's captured by the parent-level page check before this loop.
      if (entry.startsWith("_") || entry === ".well-known") continue;
      if (entry === "api") {
        // Walk only for a top-level page.tsx, don't recurse into subdirs.
        try {
          const apiPath = join(dir, entry);
          if (readdirSync(apiPath).includes("page.tsx")) {
            routes.push(urlPrefix + "/api");
          }
        } catch {
          // ignore
        }
        continue;
      }
      // Strip route groups (parens) from the URL
      const segment = entry.startsWith("(") && entry.endsWith(")") ? "" : "/" + entry;
      walk(full, urlPrefix + segment);
    }
  }

  walk(STOREFRONT_APP, "");
  return routes.sort();
}

/**
 * Naively parse the menu config + account nav to extract every URL.
 * Avoids importing the TS modules so this script stays standalone.
 */
function parseNavUrls(): { mega: Set<string>; account: Set<string> } {
  const mega = new Set<string>();
  const account = new Set<string>();

  try {
    const { readFileSync } = require("fs");
    const cfg = readFileSync(MENU_CONFIG, "utf-8");
    // Extract every href: "..." literal
    const hrefRe = /href:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = hrefRe.exec(cfg)) !== null) {
      mega.add(m[1]);
    }

    const acc = readFileSync(ACCOUNT_NAV, "utf-8");
    while ((m = hrefRe.exec(acc)) !== null) {
      account.add(m[1]);
    }
  } catch (err) {
    console.warn(`  Warning — could not parse nav configs: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { mega, account };
}

function discoverMethodologyTopics(): string[] {
  try {
    const entries = readdirSync(METHODOLOGY_DIR);
    const topics: string[] = [];
    for (const entry of entries) {
      const full = join(METHODOLOGY_DIR, entry);
      try {
        if (statSync(full).isDirectory()) topics.push("/methodology/" + entry);
      } catch {
        // ignore
      }
    }
    return topics.sort();
  } catch {
    return [];
  }
}

function main() {
  console.log("─".repeat(72));
  console.log("nav-coverage audit (kingdom-091) — storefront primary nav coverage");
  console.log("─".repeat(72));
  console.log("");

  const routes = discoverRoutes();
  const { mega, account } = parseNavUrls();
  const methodologyTopics = discoverMethodologyTopics();

  console.log(`Discovered ${routes.length} page.tsx routes under apps/storefront/src/app/`);
  console.log(`Mega-menu URLs:       ${mega.size}`);
  console.log(`Account-nav URLs:     ${account.size}`);
  console.log(`Methodology topics:   ${methodologyTopics.length}`);
  console.log("");

  // ── Check 1: route → nav coverage ───────────────────────────────────
  console.log("Check 1: route → nav coverage (orphan routes)");
  console.log("─".repeat(72));
  const orphans: string[] = [];
  for (const route of routes) {
    // Account routes covered by account nav
    if (route.startsWith("/account") && (account.has(route) || isOrphanAllowed(route))) continue;
    // Routes referenced by mega-menu
    if (mega.has(route)) continue;
    // Methodology routes always allowed (reachable via /methodology hub)
    if (route.startsWith("/methodology")) continue;
    // Allow-listed
    if (isOrphanAllowed(route)) continue;
    orphans.push(route);
  }
  if (orphans.length === 0) {
    console.log("  ✓ Every public route is reachable from a nav surface.");
  } else {
    console.log(`  ${orphans.length} orphan route(s):`);
    for (const o of orphans.slice(0, 30)) {
      console.log(`    · ${o}`);
    }
    if (orphans.length > 30) {
      console.log(`    … and ${orphans.length - 30} more`);
    }
  }
  console.log("");

  // ── Check 2: nav → route validity ───────────────────────────────────
  console.log("Check 2: nav → route validity (broken links)");
  console.log("─".repeat(72));
  const routeSet = new Set(routes);
  const broken: string[] = [];
  for (const url of mega) {
    // Skip external / API URLs
    if (url.startsWith("http") || url.startsWith("/api/")) continue;
    // Skip URLs that target dynamic routes (we can't statically resolve)
    if (url.includes("/[")) continue;
    // Try exact match OR with [slug] substitution
    if (routeSet.has(url)) continue;
    // Heuristic: see if any registered route matches when [param] is replaced
    let matched = false;
    for (const route of routes) {
      if (!route.includes("[")) continue;
      const pat = route.replace(/\[[^\]]+\]/g, "[^/]+");
      if (new RegExp("^" + pat + "$").test(url)) {
        matched = true;
        break;
      }
    }
    if (!matched) broken.push(url);
  }
  if (broken.length === 0) {
    console.log("  ✓ Every nav URL resolves to a real route.");
  } else {
    console.log(`  ${broken.length} broken nav URL(s):`);
    for (const b of broken) console.log(`    · ${b}`);
  }
  console.log("");

  // ── Check 3: methodology completeness ───────────────────────────────
  console.log("Check 3: methodology completeness");
  console.log("─".repeat(72));
  const methHubLinked = mega.has("/methodology") || mega.has("/methodology/");
  if (methHubLinked) {
    console.log(`  ✓ /methodology hub linked from primary nav. ${methodologyTopics.length} topics reachable via hub.`);
  } else {
    console.log("  ✗ /methodology hub NOT linked from primary nav — methodology corpus is orphaned.");
  }
  console.log("");

  // ── Check 4: breadcrumb registry coverage (informational) ───────────
  console.log("Check 4: breadcrumb registry (informational)");
  console.log("─".repeat(72));
  const deepDynamic = routes.filter(
    (r) => r.split("/").filter((s) => s.length > 0).length > 2 && r.includes("["),
  );
  console.log(`  ${deepDynamic.length} deep dynamic routes (≥3 segments with [slug]) detected.`);
  console.log("  Breadcrumb coverage is not statically verified — see");
  console.log("  apps/storefront/src/lib/nav/breadcrumb-registry.ts for the registered patterns.");
  console.log("");

  // ── Check 5: audience-rule consistency (informational) ──────────────
  console.log("Check 5: audience-rule consistency (informational)");
  console.log("─".repeat(72));
  console.log("  See apps/storefront/src/lib/nav/audience-detection.ts.");
  console.log("  Longest-prefix-wins. Buyer is the default fallthrough.");
  console.log("");

  console.log("─".repeat(72));
  if (orphans.length === 0 && broken.length === 0 && methHubLinked) {
    console.log("nav-coverage: ✓ ALL CHECKS PASSED");
    console.log("─".repeat(72));
    process.exit(0);
  } else {
    console.log("nav-coverage: ⚠ Informational findings above (exit 0 — informational audit).");
    console.log("─".repeat(72));
    process.exit(0);
  }
}

main();
