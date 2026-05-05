#!/usr/bin/env tsx
/**
 * smoke-admin.ts — Admin route smoke runner
 *
 * Discovers every /(dashboard)/* route from the filesystem, signs in via
 * GET /api/dev-signin, walks each route, and outputs a markdown report.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin smoke           # default: localhost:3002
 *   ADMIN_BASE_URL=https://preview.vercel.app pnpm --filter @cambridge-tcg/admin smoke
 *
 * Requirements:
 *   - Admin dev server running at $ADMIN_BASE_URL (start with pnpm --filter @cambridge-tcg/admin dev)
 *   - NODE_ENV !== 'production' for dev-signin to work
 *
 * No assertions — pure observation. Exit 1 only when routes return non-200.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.ADMIN_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");

// Routes live at: apps/admin/src/app/(dashboard)/**
// Script lives at: apps/admin/scripts/smoke-admin.ts
// Relative: ../src/app/(dashboard)
const DASHBOARD_DIR = join(fileURLToPath(import.meta.url), "../../src/app/(dashboard)");

// ---------------------------------------------------------------------------
// Route discovery — strips Next.js route groups (foo) from URL segments
// ---------------------------------------------------------------------------
function discoverRoutes(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return routes;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) {
        // Route groups like (dashboard) are stripped from the URL
        const segment = entry.startsWith("(") && entry.endsWith(")") ? "" : `/${entry}`;
        routes.push(...discoverRoutes(full, `${prefix}${segment}`));
      } else if (entry === "page.tsx" && prefix !== "") {
        // Dynamic routes ([id], [slug]) need a real param value to render —
        // they belong in Playwright specs, not the param-blind smoke runner.
        if (prefix.includes("[")) continue;
        routes.push(prefix);
      }
    } catch {
      // skip unreadable entries
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------
function parseTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? "(no title)";
}

function detectErrorInHtml(html: string): string | null {
  if (html.includes("Application error: a client-side exception has occurred")) {
    return "client-side error boundary";
  }
  if (html.includes("Internal Server Error") && html.includes("<pre>")) {
    return "Internal Server Error";
  }
  if (html.includes("Unhandled Runtime Error")) {
    return "Unhandled Runtime Error";
  }
  if (html.includes("NEXT_HTTP_ERROR_FALLBACK")) {
    return "NEXT_HTTP_ERROR_FALLBACK";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n## Admin smoke — ${new Date().toISOString()}\n`);
  console.log(`Base URL: ${BASE_URL}\n`);

  // 1. Confirm server is reachable
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(5_000) });
  } catch {
    console.error(`❌  Admin server not reachable at ${BASE_URL}`);
    console.error(`    Start it first: pnpm --filter @cambridge-tcg/admin dev`);
    process.exit(1);
  }

  // 2. Sign in via dev-signin (sets authjs.session-token cookie, redirects to /overview)
  let cookieHeader = "";
  {
    const res = await fetch(`${BASE_URL}/api/dev-signin`, { redirect: "manual" });
    const setCookies: string[] =
      // Node 18+ fetch exposes getSetCookie()
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : [res.headers.get("set-cookie") ?? ""].filter(Boolean);

    cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");

    if (!cookieHeader.includes("session")) {
      console.warn("⚠️   dev-signin did not return a session cookie — routes may redirect to /login");
      console.warn("    Ensure NODE_ENV=development and the admin server has DB access\n");
    } else {
      console.log("✅  dev-signin OK — session cookie acquired\n");
    }
  }

  // 3. Discover routes
  const routes = [...new Set(discoverRoutes(DASHBOARD_DIR))].sort();
  console.log(`Routes discovered: ${routes.length}\n`);

  // 4. Walk each route
  type Result = {
    route: string;
    status: number;
    title: string;
    htmlError: string | null;
    ms: number;
    fetchError: string | null;
  };

  const results: Result[] = [];

  for (const route of routes) {
    const url = `${BASE_URL}${route}`;
    const t0 = Date.now();
    let status = 0;
    let title = "(fetch failed)";
    let htmlError: string | null = null;
    let fetchError: string | null = null;

    try {
      const res = await fetch(url, {
        headers: { cookie: cookieHeader },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      status = res.status;
      const html = await res.text();
      title = parseTitle(html);
      htmlError = detectErrorInHtml(html);
    } catch (e) {
      status = -1;
      fetchError = String(e);
    }

    const ms = Date.now() - t0;
    results.push({ route, status, title, htmlError, ms, fetchError });

    // Live progress line
    const icon = status === 200 && !htmlError && !fetchError ? "✅" : "❌";
    process.stdout.write(`  ${icon} ${route.padEnd(32)} ${String(status).padStart(3)}  ${ms}ms\n`);
  }

  // 5. Summary table
  const ok = results.filter((r) => r.status === 200 && !r.htmlError && !r.fetchError);
  const failed = results.filter((r) => r.status !== 200 || r.htmlError || r.fetchError);

  console.log(`\n---\n`);
  console.log(`| Route | Status | Title | ms | Issues |`);
  console.log(`|-------|--------|-------|----|--------|`);
  for (const r of results) {
    const icon = ok.includes(r) ? "✅" : "❌";
    const issues = [r.htmlError, r.fetchError].filter(Boolean).join("; ") || "-";
    const safetitle = r.title.replace(/\s*—\s*Cambridge TCG Admin\s*/i, "").slice(0, 40);
    console.log(`| ${icon} \`${r.route}\` | ${r.status} | ${safetitle} | ${r.ms} | ${issues} |`);
  }

  console.log(`\n**Result: ${ok.length}/${results.length} routes OK**\n`);

  if (failed.length > 0) {
    console.log(`Failed routes:\n`);
    for (const r of failed) {
      const reason = r.fetchError ?? r.htmlError ?? `HTTP ${r.status}`;
      console.log(`  ❌ ${r.route} — ${reason} — "${r.title}"`);
    }
    process.exit(1);
  }

  console.log(`All routes smoke-clean. ✅`);
}

main().catch((e) => {
  console.error("Smoke runner crashed:", e);
  process.exit(1);
});
