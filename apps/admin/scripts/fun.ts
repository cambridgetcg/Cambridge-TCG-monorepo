#!/usr/bin/env tsx
/**
 * fun.ts — fun-doctrine drift detector.
 *
 * Audits the doctrine declared in `docs/principles/fun.md` (the artifact
 * plays fair): every reward marks a real deed, every reward says why and
 * how on the surface, absence is never punished, urgency is never
 * manufactured. The Adventure Board catalog
 * (`apps/storefront/src/lib/fun/quests.ts`) is the audited surface.
 *
 * Four checks, exits non-zero on findings:
 *
 *   1. catalog-honesty — every quest entry carries a non-empty `why`,
 *      `how`, `icon`, and `href` (doctrine rule 2: a reward that cannot
 *      say why it exists does not ship).
 *   2. route-coverage — every quest `href` resolves to a real page in
 *      `apps/storefront/src/app/` (a quest pointing nowhere is a broken
 *      promise).
 *   3. deed-grounding — every deed's `achievement_code` exists in the
 *      achievement seeds (`drizzle/0020_social.sql`), so the board never
 *      claims a badge the ledger cannot award (doctrine rule 1).
 *   4. urgency-scan — manufactured-urgency vocabulary ("only N left",
 *      "hurry", "don't miss", "last chance", "selling fast", "ends in")
 *      must not appear in storefront page/component source (doctrine
 *      rule 4). True, provenance-labeled scarcity may be allowlisted in
 *      URGENCY_ALLOWLIST below — with a reason, never silently.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin fun
 *   pnpm audit:fun
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ── Path setup ──────────────────────────────────────────────────────────

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(ADMIN_DIR, "..", "..");
const STOREFRONT = join(REPO_ROOT, "apps", "storefront");
const CATALOG = join(STOREFRONT, "src", "lib", "fun", "quests.ts");
const APP_DIR = join(STOREFRONT, "src", "app");
const SEEDS = join(STOREFRONT, "drizzle", "0020_social.sql");

/** True scarcity that has earned a provenance label may be allowlisted
 *  here — path substring → reason. Keep it short; stay suspicious. */
const URGENCY_ALLOWLIST: Record<string, string> = {
  "src/app/methodology/fun/page.tsx":
    "quotes the banned vocabulary in order to explain the ban — mention, not use",
};

// ── Check 1 + 3 inputs: parse the catalog ───────────────────────────────

interface QuestRow {
  id: string;
  kind: string;
  why: string;
  how: string;
  icon: string;
  href: string;
  achievement_code: string | null;
}

function parseCatalog(): QuestRow[] {
  if (!existsSync(CATALOG)) return [];
  const src = readFileSync(CATALOG, "utf8");
  const rows: QuestRow[] = [];
  // Entries are object literals beginning with `id: "..."` — split on those.
  const chunks = src.split(/\n\s*\{\s*\n\s*id:\s*"/).slice(1);
  for (const chunk of chunks) {
    const grab = (key: string): string => {
      const m = chunk.match(new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return m ? m[1] : "";
    };
    rows.push({
      id: chunk.slice(0, chunk.indexOf('"')),
      kind: grab("kind"),
      why: grab("why"),
      how: grab("how"),
      icon: grab("icon"),
      href: grab("href"),
      achievement_code: grab("achievement_code") || null,
    });
  }
  return rows;
}

// ── Check 2: route coverage ─────────────────────────────────────────────

function routeExists(href: string): boolean {
  const path = href.split("?")[0].split("#")[0];
  if (path.startsWith("/api/")) {
    return existsSync(join(APP_DIR, ...path.slice(1).split("/"), "route.ts"));
  }
  const segments = path === "/" ? [] : path.slice(1).split("/");
  // Walk the app tree allowing dynamic segments and route groups.
  let dirs = [APP_DIR];
  for (const seg of segments) {
    const next: string[] = [];
    for (const dir of dirs) {
      let entries: string[] = [];
      try {
        entries = readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e === seg || (e.startsWith("[") && e.endsWith("]"))) next.push(join(dir, e));
        if (e.startsWith("(") && e.endsWith(")")) {
          // Route group — descend transparently.
          try {
            for (const inner of readdirSync(join(dir, e))) {
              if (inner === seg || (inner.startsWith("[") && inner.endsWith("]"))) {
                next.push(join(dir, e, inner));
              }
            }
          } catch {
            /* unreadable group — skip */
          }
        }
      }
    }
    dirs = next;
    if (!dirs.length) return false;
  }
  return dirs.some((d) => existsSync(join(d, "page.tsx")) || existsSync(join(d, "page.ts")));
}

// ── Check 3: seeded achievement codes ───────────────────────────────────

function seededCodes(): Set<string> {
  const codes = new Set<string>();
  if (!existsSync(SEEDS)) return codes;
  const sql = readFileSync(SEEDS, "utf8");
  for (const m of sql.matchAll(/\(\s*'([a-z0-9_]+)'\s*,/g)) codes.add(m[1]);
  return codes;
}

// ── Check 4: urgency vocabulary ─────────────────────────────────────────

const URGENCY = /only \d+ left|hurry|don'?t miss|last chance|selling fast|ends (in|soon|tonight)|almost gone|while (stocks|supplies) last/i;

interface UrgencyHit {
  file: string;
  line: number;
  text: string;
}

function scanUrgency(): UrgencyHit[] {
  const hits: UrgencyHit[] = [];
  const roots = [join(STOREFRONT, "src", "app"), join(STOREFRONT, "src", "components")];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(e) || e.endsWith(".test.ts")) continue;
      const rel = relative(REPO_ROOT, p);
      const allowKey = Object.keys(URGENCY_ALLOWLIST).find((k) => rel.includes(k));
      if (allowKey) continue;
      const lines = readFileSync(p, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (URGENCY.test(line)) hits.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120) });
      });
    }
  };
  for (const r of roots) walk(r);
  return hits;
}

// ── Report ───────────────────────────────────────────────────────────────

const quests = parseCatalog();
const codes = seededCodes();

const dishonest = quests.filter((q) => !q.why || !q.how || !q.icon || !q.href);
const deadRoutes = quests.filter((q) => q.href && !routeExists(q.href));
const ungrounded = quests.filter(
  (q) => q.kind === "deed" && (!q.achievement_code || !codes.has(q.achievement_code))
);
const urgency = scanUrgency();

console.log("");
console.log("◆ audit:fun — the artifact plays fair (docs/principles/fun.md)");
console.log("");
console.log(`  catalog entries: ${quests.length} (${quests.filter((q) => q.kind === "deed").length} deeds, ${quests.filter((q) => q.kind === "waymark").length} waymarks)`);
console.log(`  seeded achievement codes: ${codes.size}`);
console.log(`  urgency allowlist entries: ${Object.keys(URGENCY_ALLOWLIST).length}`);
console.log("");

if (!quests.length) {
  console.log("◇ catalog missing or unparseable");
  console.log("");
  console.log(`  Expected the Adventure Board catalog at ${relative(REPO_ROOT, CATALOG)}.`);
  console.log("  A board with no catalog cannot keep its doctrine.");
  console.log("");
  process.exit(1);
}

if (dishonest.length) {
  console.log(`◇ catalog-honesty (${dishonest.length} hits)`);
  console.log("");
  console.log("  A reward that cannot say why it exists does not ship (rule 2).");
  console.log("");
  for (const q of dishonest.slice(0, 30)) {
    const missing = ["why", "how", "icon", "href"].filter((k) => !(q as unknown as Record<string, string>)[k]);
    console.log(`    ${q.id} — missing: ${missing.join(", ")}`);
  }
  console.log("");
}

if (deadRoutes.length) {
  console.log(`◇ route-coverage (${deadRoutes.length} hits)`);
  console.log("");
  console.log("  A quest pointing nowhere is a broken promise.");
  console.log("");
  for (const q of deadRoutes.slice(0, 20)) console.log(`    ${q.id} → ${q.href} (no page found)`);
  console.log("");
}

if (ungrounded.length) {
  console.log(`◇ deed-grounding (${ungrounded.length} hits)`);
  console.log("");
  console.log("  A deed must reference a seeded achievement code the ledger can");
  console.log("  actually award (rule 1). Seed it in drizzle before claiming it.");
  console.log("");
  for (const q of ungrounded.slice(0, 20)) console.log(`    ${q.id} → ${q.achievement_code ?? "(none)"}`);
  console.log("");
}

if (urgency.length) {
  console.log(`◇ urgency-scan (${urgency.length} hits)`);
  console.log("");
  console.log("  Manufactured urgency is the shield's taxonomy pointed at our own");
  console.log("  visitors (rule 4). If it is provably true and provenance-labeled,");
  console.log("  allowlist it WITH a reason; otherwise remove it.");
  console.log("");
  for (const h of urgency.slice(0, 20)) console.log(`    ${h.file}:${h.line} — ${h.text}`);
  if (urgency.length > 20) console.log(`    ... +${urgency.length - 20} more`);
  console.log("");
}

const total = dishonest.length + deadRoutes.length + ungrounded.length + urgency.length;

if (total === 0) {
  console.log("✓ the board plays fair — every reward says why, every route stands,");
  console.log("  every deed is grounded, and nobody is being hurried.");
  console.log("");
  process.exit(0);
}

console.log(`  ${total} finding(s). When adding a quest: give it a why you would say`);
console.log("  to the player's face, a how that tells the truth about tracking, a");
console.log("  route that exists, and (for deeds) a seeded achievement code.");
console.log("  Doctrine: docs/principles/fun.md · Board: /quests");
console.log("");
process.exit(1);
