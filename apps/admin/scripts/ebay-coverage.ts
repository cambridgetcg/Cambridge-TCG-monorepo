#!/usr/bin/env tsx
/**
 * ebay-coverage.ts — surface eBay watch-list coverage + ingestion health.
 *
 * ── Greeting (kingdom-083) ────────────────────────────────────────────
 *
 * You make silence loud. When the top tier goes stale you say so; when
 * the quarantine_pct climbs above 30% you ring the alarm. Your strict
 * mode is suitable for CI; your graceful-skip mode is suitable for dev.
 * The 13th audit. Welcome to the family — the others have been waiting.
 * (See WELCOMES["infrastructure.ebay-coverage-audit"].)
 *
 * ── What you do ───────────────────────────────────────────────────────
 *
 * Thirteenth in the audit family (after cardrush-coverage). Where the
 * cardrush audit measures subdomain coverage (which subdomains have any
 * cards pointing at them), this one measures **watch-list coverage + run
 * health**: which SKUs in `ebay_watch_list` actually receive observations,
 * what the quarantine rate is, and when the last successful run finished.
 *
 * Output per tier (top/mid/all):
 *   - watch_list_size            — rows in ebay_watch_list at this priority floor
 *   - observed_last_24h          — distinct SKUs with at least one observation in 24h
 *   - stale_pct                  — fraction not observed within tier-budget
 *   - quarantine_pct             — quarantine rows / (observations + quarantines) last 24h
 *   - last_ingest_run_finished   — most-recent ingest_run.finished_at for source_id='ebay'
 *
 * Tier budgets (mirror the cron cadence design):
 *   top  (priority ≥ 300)  — fresh ≤ 4 hours
 *   mid  (priority 200-299) — fresh ≤ 24 hours
 *   all  (priority 100-199) — fresh ≤ 7 days
 *
 * The audit reads wholesale RDS. Skips gracefully on missing env / DB
 * unreachable — same pattern as cardrush-coverage.ts and set-discovery.ts.
 *
 * Strict mode (--strict) exits non-zero on:
 *   - quarantine_pct (last 24h) > 30% — parser regression alert
 *   - top-tier stale_pct > 50%        — cron health alert
 *   - no ingest_run rows for ebay     — pipeline not yet running
 *
 * Designed in `docs/connections/the-ebay-alignment.md` §3b (kingdom-082).
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin ebay-coverage
 *   pnpm --filter @cambridge-tcg/admin ebay-coverage -- --strict
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");

// ── Env helpers (mirrors cardrush-coverage.ts) ──────────────────────────

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

// ── Tier definitions (mirror ebay-snapshot.ts) ──────────────────────────

type Tier = "top" | "mid" | "all";

const TIER_FLOOR: Record<Tier, number> = { top: 300, mid: 200, all: 100 };
const TIER_FRESH_HOURS: Record<Tier, number> = { top: 4, mid: 24, all: 168 };
const TIER_DISPLAY: Record<Tier, string> = {
  top: "top (≥300)",
  mid: "mid (≥200)",
  all: "all (≥100)",
};

const QUARANTINE_PCT_FAIL_THRESHOLD = 0.3;
const TOP_TIER_STALE_FAIL_THRESHOLD = 0.5;

// ── Findings ────────────────────────────────────────────────────────────

interface TierFindings {
  tier: Tier;
  watch_list_size: number;
  observed_last_24h: number;
  stale_count: number;
  stale_pct: number;
}

interface OverallFindings {
  observations_24h: number;
  quarantines_24h: number;
  quarantine_pct: number;
  last_run_finished_at: Date | null;
  last_run_status: string | null;
  last_run_rows_written: number | null;
  last_run_rows_quarantined: number | null;
}

function fmtDate(d: Date | null): string {
  if (d === null) return "never";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("");
  console.log("◆ ebay-coverage audit — watch-list coverage + ingest run health");
  console.log("");

  if (!WHOLESALE_DATABASE_URL) {
    console.log(
      "  Skipped — WHOLESALE_DATABASE_URL not set. To enable: configure the env var",
    );
    console.log(
      "  and re-run. The audit reads `ebay_watch_list` + `ebay_listing_observation`",
    );
    console.log(
      "  + `ingest_quarantine` + `ingest_run`. Requires migration 0016 to be applied.",
    );
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

  // ── Probe for table existence first (Phase B migration may not be applied) ──
  let tablesExist: boolean;
  try {
    const r = await client<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'ebay_listing_observation'
      ) AS exists
    `;
    tablesExist = r[0]?.exists === true;
  } catch (err) {
    await close();
    console.log(
      `  Skipped — table existence check failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  if (!tablesExist) {
    await close();
    console.log(
      "  Skipped — `ebay_listing_observation` table not present on wholesale RDS.",
    );
    console.log(
      "  Promote `apps/wholesale/drizzle/drafts/0016_ebay_observations.sql.draft`",
    );
    console.log(
      "  to active path + run `pnpm --filter tcg-wholesale db:migrate`, then re-run.",
    );
    console.log("");
    process.exit(0);
  }

  // ── Per-tier coverage ─────────────────────────────────────────────────
  const tierFindings: TierFindings[] = [];
  for (const tier of ["top", "mid", "all"] as const) {
    const floor = TIER_FLOOR[tier];
    const ceiling = tier === "top" ? 1001 : tier === "mid" ? 300 : 200;
    const freshHours = TIER_FRESH_HOURS[tier];

    let rows: Array<{
      watch_list_size: number;
      observed_last_24h: number;
      stale_count: number;
    }>;
    try {
      rows = await client<
        Array<{
          watch_list_size: number;
          observed_last_24h: number;
          stale_count: number;
        }>
      >`
        SELECT
          (SELECT COUNT(*)::int FROM ebay_watch_list
            WHERE active = true
              AND priority >= ${floor}
              AND priority < ${ceiling}) AS watch_list_size,
          (SELECT COUNT(DISTINCT sku)::int FROM ebay_listing_observation
            WHERE observed_at > now() - interval '24 hours'
              AND sku IN (SELECT sku FROM ebay_watch_list
                          WHERE active = true
                            AND priority >= ${floor}
                            AND priority < ${ceiling})) AS observed_last_24h,
          (SELECT COUNT(*)::int FROM ebay_watch_list
            WHERE active = true
              AND priority >= ${floor}
              AND priority < ${ceiling}
              AND (last_observed_at IS NULL
                   OR last_observed_at < now() - interval '1 hour' * ${freshHours})) AS stale_count
      `;
    } catch (err) {
      await close();
      console.log(
        `  Skipped — tier query failed (${err instanceof Error ? err.message : String(err)})`,
      );
      console.log("");
      process.exit(0);
    }

    const r = rows[0];
    const watch_list_size = r?.watch_list_size ?? 0;
    const stale_count = r?.stale_count ?? 0;
    tierFindings.push({
      tier,
      watch_list_size,
      observed_last_24h: r?.observed_last_24h ?? 0,
      stale_count,
      stale_pct: watch_list_size === 0 ? 0 : stale_count / watch_list_size,
    });
  }

  // ── Overall + run health ──────────────────────────────────────────────
  let overall: OverallFindings;
  try {
    const obsRows = await client<Array<{ obs_24h: number; q_24h: number }>>`
      SELECT
        (SELECT COUNT(*)::int FROM ebay_listing_observation
          WHERE observed_at > now() - interval '24 hours') AS obs_24h,
        (SELECT COUNT(*)::int FROM ingest_quarantine
          WHERE source_id = 'ebay' AND quarantined_at > now() - interval '24 hours') AS q_24h
    `;
    const o = obsRows[0];
    const obs = o?.obs_24h ?? 0;
    const q = o?.q_24h ?? 0;
    const total = obs + q;

    const runRows = await client<
      Array<{
        finished_at: string | null;
        status: string;
        rows_written: number;
        rows_quarantined: number;
      }>
    >`
      SELECT finished_at::text, status, rows_written, rows_quarantined
      FROM ingest_run
      WHERE source_id = 'ebay'
      ORDER BY triggered_at DESC
      LIMIT 1
    `;
    const lastRun = runRows[0];

    overall = {
      observations_24h: obs,
      quarantines_24h: q,
      quarantine_pct: total === 0 ? 0 : q / total,
      last_run_finished_at: lastRun?.finished_at ? new Date(lastRun.finished_at) : null,
      last_run_status: lastRun?.status ?? null,
      last_run_rows_written: lastRun?.rows_written ?? null,
      last_run_rows_quarantined: lastRun?.rows_quarantined ?? null,
    };
  } catch (err) {
    await close();
    console.log(
      `  Skipped — overall query failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  await close();

  // ── Render ────────────────────────────────────────────────────────────
  console.log("◇ Per-tier coverage");
  console.log("");
  console.log(
    `    ${"tier".padEnd(11)} ${"watch_size".padStart(11)} ${"obs_24h".padStart(8)} ${"stale".padStart(7)}  ${"stale_pct".padStart(9)}  fresh_budget`,
  );
  console.log(
    `    ${"-".repeat(11)} ${"-".repeat(11)} ${"-".repeat(8)} ${"-".repeat(7)}  ${"-".repeat(9)}  ${"-".repeat(12)}`,
  );
  for (const t of tierFindings) {
    console.log(
      `    ${TIER_DISPLAY[t.tier].padEnd(11)} ${String(t.watch_list_size).padStart(11)} ${String(t.observed_last_24h).padStart(8)} ${String(t.stale_count).padStart(7)}  ${fmtPct(t.stale_pct).padStart(9)}  ${TIER_FRESH_HOURS[t.tier]}h`,
    );
  }
  console.log("");

  console.log("◇ Last 24h ingestion");
  console.log("");
  console.log(`    observations:    ${overall.observations_24h}`);
  console.log(`    quarantines:     ${overall.quarantines_24h}`);
  console.log(`    quarantine_pct:  ${fmtPct(overall.quarantine_pct)}`);
  console.log("");

  console.log("◇ Most-recent ingest_run");
  console.log("");
  if (overall.last_run_finished_at === null && overall.last_run_status === null) {
    console.log("    No `ingest_run` rows for source_id='ebay' yet.");
    console.log("    Either the cron hasn't fired or the route is unreachable.");
  } else {
    console.log(`    finished_at:       ${fmtDate(overall.last_run_finished_at)}`);
    console.log(`    status:            ${overall.last_run_status}`);
    console.log(`    rows_written:      ${overall.last_run_rows_written ?? "?"}`);
    console.log(`    rows_quarantined:  ${overall.last_run_rows_quarantined ?? "?"}`);
  }
  console.log("");

  // ── Strict-mode failure modes ─────────────────────────────────────────
  let failures = 0;

  if (STRICT) {
    if (overall.quarantine_pct > QUARANTINE_PCT_FAIL_THRESHOLD) {
      console.log(
        `  ✗ quarantine_pct ${fmtPct(overall.quarantine_pct)} > ${fmtPct(QUARANTINE_PCT_FAIL_THRESHOLD)} — parser regression alert`,
      );
      failures += 1;
    }
    const topTier = tierFindings.find((t) => t.tier === "top");
    if (topTier && topTier.watch_list_size > 0 && topTier.stale_pct > TOP_TIER_STALE_FAIL_THRESHOLD) {
      console.log(
        `  ✗ top-tier stale_pct ${fmtPct(topTier.stale_pct)} > ${fmtPct(TOP_TIER_STALE_FAIL_THRESHOLD)} — cron-health alert`,
      );
      failures += 1;
    }
    if (overall.last_run_finished_at === null && overall.observations_24h === 0) {
      console.log(`  ✗ no ingest_run rows for ebay — pipeline not yet running`);
      failures += 1;
    }
  }

  if (failures > 0) {
    console.log("");
    console.log(`✗ ${failures} strict-mode failure${failures === 1 ? "" : "s"}`);
    process.exit(1);
  }

  console.log("✓ ebay-coverage audit complete");
  console.log("");
}

main().catch((err) => {
  console.error("ebay-coverage failed:", err);
  process.exit(1);
});
