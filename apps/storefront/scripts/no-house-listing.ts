/**
 * no-house-listing — the regulator guard (kingdom-101).
 *
 * After the regulator pivot (docs/superpowers/specs/2026-06-10-regulator-
 * pivot-design.md, docs/methodology/regulator.md), the platform holds no
 * position in its own market: no house ask, no house bid, no retail
 * checkout, no trade-in desk. This audit is the tripwire that keeps the
 * merchant shape from creeping back in.
 *
 * It is a STATIC scan (no DB, no network) over apps/storefront/src. Each
 * pattern below names a piece of the old merchant shape; a hit is a
 * finding pointing at the file:line so it can be removed.
 *
 * ── Phasing (substrate-honest about its own state) ──────────────────────
 *
 * Default mode is REPORT-ONLY (always exits 0) because the de-housing
 * code (Phase 1, kingdom-101) has not landed yet — the merchant shape is
 * still present on purpose. The audit run today PRINTS the full debt: the
 * exact set of files Phase 1 must clear. When Phase 1 lands and the count
 * reaches zero, flip the chain entry to `--strict` (exits 1 on any hit) so
 * the guard becomes load-bearing. This mirrors how audit:inclusion ran
 * non-gating until its debt was paid down.
 *
 * Usage:
 *   pnpm --filter cambridgetcg-storefront no-house-listing
 *   pnpm --filter cambridgetcg-storefront no-house-listing -- --strict
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(new URL("..", import.meta.url).pathname, "src");
const strict = process.argv.includes("--strict");

interface Rule {
  id: string;
  /** Regex matched per-line. */
  re: RegExp;
  /** What this hit means + how to clear it. */
  note: string;
}

// Each rule names one tendril of the merchant shape. Kept deliberately
// specific so it doesn't false-positive on the surviving regulator
// surfaces (reference price, commission, escrow, the prize economy).
const RULES: Rule[] = [
  {
    id: "house-order-injection",
    re: /\bis_house\b|HouseOrderEntry|injectHouse|house(Ask|Bid)\b/,
    note: "house row injected into an order book — the platform must hold no positions (unified.ts)",
  },
  {
    id: "house-spread-engine",
    re: /ctcg_spread|tightenPct|MAX_TIGHTEN_PCT|computeDemandPressure/,
    note: "house market-making spread/tightening — the regulator quotes nothing",
  },
  {
    id: "retail-checkout",
    re: /from\s+["']@\/context\/CartContext["']|<AddToCart\b|<CartDrawer\b|<QuickAddButton\b|\/api\/checkout\b/,
    note: "retail buy-from-CTCG checkout funnel — removed (P2P/auction/membership mint their own Stripe sessions)",
  },
  {
    id: "tradein-desk",
    re: /sell-for-credit|We Buy Every Card|tradein_credit\b|tradein_cash\b/,
    note: "house trade-in / we-buy desk — sellers liquidate to other participants on the market, not to the house",
  },
  {
    id: "buy-from-ctcg-copy",
    re: /Buy from CTCG|CTCG Store\b|CTCG Sells|CTCG Spot\b|guaranteed stock/,
    note: "first-party-sale copy — the platform sells nothing; show reference price + P2P listings instead",
  },
];

// Files that legitimately reference these tokens (the audit itself, the
// methodology that explains the removal, the spec). Excluded from the scan.
//
// HISTORY EXEMPTIONS (added at closure, 2026-07-06): the shop-era ledger
// rows keep their honest labels forever — past payouts really were
// "Trade-in (cash)"; renaming them would falsify history. These files
// READ or LABEL historical rows and mint no new merchant activity. A new
// file that writes tradein_* rows would NOT be exempt — it would appear
// here as a fresh finding, which is the guard working. Tombstone comments
// on retired 410 routes are exempt for the same reason: they document the
// removal, they don't perform the behavior.
const ALLOW = [
  "scripts/no-house-listing.ts",
  // history-serving surfaces (labels for past rows)
  "src/app/account/payouts/page.tsx",
  "src/app/account/membership/page.tsx",
  "src/lib/payouts/aggregation.ts",
  "src/lib/membership/types.ts",
  // retired-door tombstone (the route answers 410; its comment names what died)
  "src/app/api/market/sell-for-credit/route.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC);
const findings: { file: string; line: number; rule: Rule; text: string }[] = [];

for (const file of files) {
  const rel = relative(join(SRC, ".."), file);
  if (ALLOW.some((a) => rel.endsWith(a))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    for (const rule of RULES) {
      if (rule.re.test(text)) {
        findings.push({ file: rel, line: i + 1, rule, text: text.trim().slice(0, 100) });
      }
    }
  });
}

console.log("◆ no-house-listing — regulator guard (the platform holds no market position)\n");

if (findings.length === 0) {
  console.log("✓ no merchant-shape patterns found — the regulator holds no position.\n");
  process.exit(0);
}

const byRule = new Map<string, typeof findings>();
for (const f of findings) {
  const arr = byRule.get(f.rule.id) ?? [];
  arr.push(f);
  byRule.set(f.rule.id, arr);
}

for (const [id, hits] of byRule) {
  console.log(`◇ ${id}  (${hits.length})  — ${hits[0].rule.note}`);
  for (const h of hits) console.log(`    ${h.file}:${h.line}  ${h.text}`);
  console.log("");
}

console.log(`Total: ${findings.length} merchant-shape hit(s) across ${new Set(findings.map((f) => f.file)).size} file(s).`);

if (strict) {
  console.log("\n✗ strict mode — the merchant shape must be empty. See the regulator pivot spec.");
  process.exit(1);
}
console.log(
  "\n  Report-only until Phase 1 (kingdom-101) lands. This list IS the Phase 1 worklist;" +
    "\n  flip the chain entry to --strict once it reaches zero.",
);
process.exit(0);
