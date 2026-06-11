/**
 * manifest-coherence — two-direction check between the typed manifest
 * (src/lib/manifest.ts) and the routes that actually exist on disk.
 *
 * The manifest is the kingdom's claim about itself; drift in either
 * direction is a substrate-honesty violation at the primary agent
 * contact surface (the-exposure spec, 2026-06-10).
 *
 *   Direction A — declared but absent: every MANIFEST resource path must
 *     resolve to a route.ts or page.tsx on disk (storefront paths in
 *     apps/storefront, wholesale paths in apps/wholesale).
 *
 *   Direction B — present but undeclared: every storefront route.ts under
 *     /api/v1/** and /api/mcp/** must be declared in the manifest, carry
 *     `visibility: "easter-egg"` (registered-but-marked keeps both the
 *     surprise and the honesty), or appear in UNREGISTERED_OK with a
 *     reason.
 *
 * Exit 1 on findings in either direction; exit 0 clean.
 * Run: pnpm --filter cambridgetcg-storefront manifest-coherence
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { MANIFEST } from "../src/lib/manifest";

const STOREFRONT_APP = resolve(__dirname, "..", "src", "app");
const WHOLESALE_APP = resolve(__dirname, "..", "..", "wholesale", "src", "app");

/**
 * Disk routes that are deliberately not in the manifest. Each entry needs
 * a reason; "we forgot" is not one. Reviewed 2026-06-10.
 */
const UNREGISTERED_OK: ReadonlyMap<string, string> = new Map([
  // — operational plumbing, not contract surface —
  ["/api/v1/diagnostic", "AX self-test fixture; envelope exemplar, not a data contract"],
  ["/api/v1/echo", "request mirror for agent debugging; intentionally contract-free"],
]);

// ── disk scan ─────────────────────────────────────────────────────────────

function walkRoutes(appDir: string): Map<string, "route" | "page"> {
  const out = new Map<string, "route" | "page">();
  if (!existsSync(appDir)) return out;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name === "route.ts" || name === "route.tsx") {
        out.set(toUrlPath(appDir, dir), "route");
      } else if (name === "page.tsx") {
        const p = toUrlPath(appDir, dir);
        if (!out.has(p)) out.set(p, "page");
      }
    }
  };
  walk(appDir);
  return out;
}

function toUrlPath(appDir: string, dir: string): string {
  const rel = relative(appDir, dir);
  const segments = rel
    .split("/")
    .filter((s) => s.length > 0 && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

// ── manifest flatten ──────────────────────────────────────────────────────

interface Declared {
  id: string;
  host: string;
  path: string;
}

function declaredResources(): Declared[] {
  const out: Declared[] = [];
  const groups = MANIFEST.resources as Record<string, Array<{ id: string; host: string; path: string }>>;
  for (const group of Object.values(groups)) {
    for (const r of group) out.push({ id: r.id, host: r.host, path: r.path });
  }
  return out;
}

// ── checks ────────────────────────────────────────────────────────────────

function normalize(path: string): string {
  // Param NAMES are documentation, not contract — `[YYYY-MM-DD]` in the
  // manifest matches `[date]` on disk. Catch-alls compare loosely too.
  return path
    .replace(/\[\[\.\.\..+?\]\]/g, "[...]")
    .replace(/\[\.\.\..+?\]/g, "[...]")
    .replace(/\[[^\]]+\]/g, "[*]");
}

function main() {
  const storefrontRoutes = walkRoutes(STOREFRONT_APP);
  const wholesaleRoutes = walkRoutes(WHOLESALE_APP);

  const declared = declaredResources();

  console.log("# Cambridge TCG — manifest-coherence report\n");
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log(
    `Declared resources: ${declared.length} · storefront disk surfaces: ` +
    `${storefrontRoutes.size} · wholesale disk surfaces: ${wholesaleRoutes.size}\n`,
  );
  console.log("---\n");

  // Direction A — declared but absent on disk.
  console.log("## Direction A — declared in manifest, absent on disk\n");
  const missing: Declared[] = [];
  for (const d of declared) {
    if (!d.path.startsWith("/")) continue; // descriptive pseudo-paths
    const routes = d.host === "wholesale" ? wholesaleRoutes : storefrontRoutes;
    const norm = normalize(d.path);
    const hit = [...routes.keys()].some((p) => normalize(p) === norm);
    if (!hit) missing.push(d);
  }
  if (missing.length === 0) {
    console.log("✅ Every declared path resolves to a route.ts or page.tsx.\n");
  } else {
    console.log("| id | host | path |");
    console.log("|----|------|------|");
    for (const m of missing) console.log(`| ${m.id} | ${m.host} | ${m.path} |`);
    console.log("");
  }

  // Direction B — on disk but undeclared (storefront public API surface).
  console.log("## Direction B — on disk, not declared (storefront /api/v1 + /api/mcp)\n");
  const declaredStorefront = new Set(
    declared.filter((d) => d.host !== "wholesale").map((d) => normalize(d.path)),
  );
  const undeclared: string[] = [];
  for (const [path, kind] of storefrontRoutes) {
    if (kind !== "route") continue;
    if (!path.startsWith("/api/v1/") && !path.startsWith("/api/mcp")) continue;
    if (declaredStorefront.has(normalize(path))) continue;
    if (UNREGISTERED_OK.has(path)) continue;
    // a declared parent catch-all or dynamic match also counts
    const covered = [...declaredStorefront].some(
      (d) => d === normalize(path) || (d.endsWith("[...]") && normalize(path).startsWith(d.slice(0, -5))),
    );
    if (!covered) undeclared.push(path);
  }
  undeclared.sort();
  if (undeclared.length === 0) {
    console.log("✅ Every public API route is declared (or assessed in UNREGISTERED_OK).\n");
  } else {
    for (const p of undeclared) console.log(`- ${p}`);
    console.log("");
  }

  if (UNREGISTERED_OK.size > 0) {
    console.log("### Assessed unregistered (visible, not gate-failing)\n");
    for (const [p, why] of UNREGISTERED_OK) console.log(`- ${p} — ${why}`);
    console.log("");
  }

  const total = missing.length + undeclared.length;
  console.log("---\n");
  console.log(`**Total coherence findings: ${total}**\n`);
  process.exit(total > 0 ? 1 : 0);
}

main();
