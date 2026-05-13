#!/usr/bin/env tsx
/**
 * cross-source-divergence audit — surfaces SKUs where multiple sources
 * disagree dramatically on the same card/date after FX normalization.
 *
 * 14th in the audit family. Companion to kingdom-080's TCGplayer integration
 * and kingdom-081's license-propagation work. The platform's price_archive
 * now holds rows from CardRush (JPY) + TCGplayer (USD) + (future) Cardmarket
 * (EUR). All are normalized to GBP at write time via fx_rate_to_gbp. When
 * the GBP-normalized values from different sources for the same (card,
 * snapshot_date) differ by more than the configurable threshold, this audit
 * flags it.
 *
 * Two interpretations of divergence:
 *
 *   - GENUINE — different regional markets see the same card differently
 *     (a JP-exclusive printing scarce on TCGplayer commands a premium on
 *      CardRush; a Disney Lorcana set on TCGplayer dwarfs Cardmarket's EU
 *      coverage). Substrate-honest about regional asymmetry.
 *
 *   - ANOMALY — one source has stale or broken data (CardRush page hasn't
 *     refreshed in weeks; TCGplayer market_price is null; an FX rate was
 *     applied wrong). Substrate-honest about upstream gaps.
 *
 * The audit's job is to surface; the operator decides which kind it is.
 *
 * ── Findings classification ────────────────────────────────────────
 *
 *   - 'tight'      max/min ratio ≤ 1.2  (within 20%; healthy cross-source agreement)
 *   - 'normal'     1.2 < ratio ≤ 1.5    (typical regional/condition variance)
 *   - 'wide'       1.5 < ratio ≤ 3.0    (worth a glance)
 *   - 'divergent'  3.0 < ratio ≤ 5.0    (something interesting)
 *   - 'outlier'    ratio > 5.0          (likely upstream issue or genuine scarcity asymmetry)
 *
 * STRICT mode (--strict): exits 1 on any 'outlier' finding.
 *
 * Skips gracefully on missing env / invalid URL / DB unreachable — same
 * pattern as cardrush-coverage.ts.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-080
 * follow-up).
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin cross-source-divergence
 *   pnpm --filter @cambridge-tcg/admin cross-source-divergence -- --strict
 *   pnpm --filter @cambridge-tcg/admin cross-source-divergence -- --top 50
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");
const TOP = (() => {
  const idx = process.argv.indexOf("--top");
  if (idx === -1) return 30;
  const v = parseInt(process.argv[idx + 1] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : 30;
})();

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const envFile = loadEnvFile(join(ADMIN_DIR, ".env.local"));
const WHOLESALE_DATABASE_URL =
  process.env.WHOLESALE_DATABASE_URL ?? envFile.WHOLESALE_DATABASE_URL ?? "";

interface DivergenceRow {
  sku: string;
  card_id: number;
  snapshot_date: string;
  source_count: number;
  sources: string[];
  min_gbp: number;
  max_gbp: number;
  ratio: number;
  classification: "tight" | "normal" | "wide" | "divergent" | "outlier";
}

function classify(ratio: number): DivergenceRow["classification"] {
  if (ratio <= 1.2) return "tight";
  if (ratio <= 1.5) return "normal";
  if (ratio <= 3.0) return "wide";
  if (ratio <= 5.0) return "divergent";
  return "outlier";
}

async function main(): Promise<void> {
  console.log("");
  console.log("◆ cross-source-divergence audit — disagreement across sources on same (card, date)");
  console.log("");

  if (!WHOLESALE_DATABASE_URL) {
    console.log(
      "  Skipped — WHOLESALE_DATABASE_URL not set. The audit reads price_archive",
    );
    console.log("  cross-source ratios on the latest snapshot date. No writes.");
    console.log("");
    process.exit(0);
  }

  let client: Awaited<ReturnType<typeof import("@cambridge-tcg/db").createDb>>["client"];
  let close: Awaited<ReturnType<typeof import("@cambridge-tcg/db").createDb>>["close"];
  try {
    const { createDb } = await import("@cambridge-tcg/db");
    ({ client, close } = createDb({ url: WHOLESALE_DATABASE_URL }));
  } catch (err) {
    console.log(
      `  Skipped — DB connection setup failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  // We want the most-recent snapshot per (card, source) and compute the
  // cross-source ratio. The simplest approach: select all rows from the
  // last 7 days, then aggregate in JS.
  //
  // Why 7d and not "latest only": sources have different cadences (cardrush
  // daily 02:00, tcgplayer 5min during US trading). A "latest only" view
  // would miss rows in the brief window between one source's update and
  // another's. 7d captures the most recent of each.
  let rows: Array<{
    sku: string;
    card_id: number;
    source: string;
    snapshot_date: string;
    price_gbp: number;
    condition: string;
  }>;
  try {
    rows = await client<
      Array<{
        sku: string;
        card_id: number;
        source: string;
        snapshot_date: string;
        price_gbp: number;
        condition: string;
      }>
    >`
      SELECT
        sku,
        card_id,
        source,
        snapshot_date::text AS snapshot_date,
        price::numeric    AS price_gbp,
        condition
      FROM price_archive
      WHERE snapshot_date > CURRENT_DATE - INTERVAL '7 days'
        AND price > 0
      ORDER BY card_id, condition, source, snapshot_date DESC
    `;
  } catch (err) {
    await close();
    console.log(
      `  Skipped — DB query failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  await close();

  if (rows.length === 0) {
    console.log("  No rows in price_archive within the last 7 days. Audit done — nothing to compare.");
    console.log("");
    process.exit(0);
  }

  // Group by (card_id, condition); keep the most-recent row per source.
  // Then compute the ratio.
  type SkuKey = string;
  const latestBySkuCondSource = new Map<
    SkuKey, // `${card_id}::${condition}`
    Map<string, { sku: string; price_gbp: number; snapshot_date: string }>
  >();
  for (const row of rows) {
    const key = `${row.card_id}::${row.condition}`;
    let bucket = latestBySkuCondSource.get(key);
    if (!bucket) {
      bucket = new Map();
      latestBySkuCondSource.set(key, bucket);
    }
    // Only keep the first row per source (we ordered DESC, so first is latest)
    if (!bucket.has(row.source)) {
      bucket.set(row.source, {
        sku: row.sku,
        price_gbp: Number(row.price_gbp),
        snapshot_date: row.snapshot_date,
      });
    }
  }

  const findings: DivergenceRow[] = [];
  for (const [key, bucket] of latestBySkuCondSource) {
    if (bucket.size < 2) continue; // need >= 2 sources to diverge
    const [cardIdStr] = key.split("::");
    const cardId = parseInt(cardIdStr!, 10);
    const sourceList = Array.from(bucket.keys()).sort();
    const prices = Array.from(bucket.values()).map((v) => v.price_gbp);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const ratio = min > 0 ? max / min : Number.POSITIVE_INFINITY;
    const sku = bucket.values().next().value!.sku;
    const date = bucket.values().next().value!.snapshot_date;
    findings.push({
      sku,
      card_id: cardId,
      snapshot_date: date,
      source_count: bucket.size,
      sources: sourceList,
      min_gbp: Number(min.toFixed(2)),
      max_gbp: Number(max.toFixed(2)),
      ratio: Number(ratio.toFixed(2)),
      classification: classify(ratio),
    });
  }

  // Sort by ratio descending — biggest divergences first
  findings.sort((a, b) => b.ratio - a.ratio);

  const counts = {
    tight: findings.filter((f) => f.classification === "tight").length,
    normal: findings.filter((f) => f.classification === "normal").length,
    wide: findings.filter((f) => f.classification === "wide").length,
    divergent: findings.filter((f) => f.classification === "divergent").length,
    outlier: findings.filter((f) => f.classification === "outlier").length,
  };

  console.log(`  Cross-source comparisons (last 7d): ${findings.length}`);
  console.log(`    tight     (≤1.2×):  ${counts.tight}`);
  console.log(`    normal    (≤1.5×):  ${counts.normal}`);
  console.log(`    wide      (≤3.0×):  ${counts.wide}`);
  console.log(`    divergent (≤5.0×):  ${counts.divergent}`);
  console.log(`    outlier   (>5.0×):  ${counts.outlier}`);
  console.log("");

  const showing = findings.slice(0, TOP);
  if (showing.length > 0) {
    console.log(`◇ Top ${showing.length} divergences (ratio desc)`);
    console.log("");
    console.log(
      `    ${"sku".padEnd(28)} ${"date".padEnd(11)} ${"min£".padStart(8)} ${"max£".padStart(8)} ${"ratio".padStart(7)}  ${"sources".padEnd(30)} class`,
    );
    console.log(
      `    ${"-".repeat(28)} ${"-".repeat(11)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(7)}  ${"-".repeat(30)} ${"-".repeat(10)}`,
    );
    for (const f of showing) {
      console.log(
        `    ${f.sku.padEnd(28)} ${f.snapshot_date.padEnd(11)} ${f.min_gbp.toFixed(2).padStart(8)} ${f.max_gbp.toFixed(2).padStart(8)} ${f.ratio.toFixed(2).padStart(6)}x  ${f.sources.join("/").padEnd(30)} ${f.classification}`,
      );
    }
    console.log("");
  }

  if (counts.outlier === 0 && counts.divergent === 0) {
    if (findings.length === 0) {
      console.log("✓ No multi-source comparisons available yet (only one source per card/date).");
    } else {
      console.log("✓ all cross-source comparisons within healthy range");
    }
    console.log("");
    process.exit(0);
  }

  console.log("◇ Interpretation");
  console.log("");
  console.log("  Divergence is data, not failure. A 5× ratio between");
  console.log("  CardRush (JP) and TCGplayer (US) may be a regional-scarcity");
  console.log("  signal (genuine market asymmetry). Or it may be an upstream");
  console.log("  staleness signal (one source hasn't refreshed). Investigate");
  console.log("  outliers via:");
  console.log("    SELECT source, snapshot_date, price, fx_rate_source, error_reason");
  console.log("      FROM price_archive WHERE sku = '<sku>'");
  console.log("      ORDER BY source, snapshot_date DESC LIMIT 20;");
  console.log("");

  if (STRICT && counts.outlier > 0) {
    console.log(`STRICT mode: ${counts.outlier} outlier(s) detected; exiting 1.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});
