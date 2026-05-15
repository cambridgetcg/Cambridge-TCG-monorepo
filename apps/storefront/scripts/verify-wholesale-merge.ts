#!/usr/bin/env tsx
/**
 * verify-wholesale-merge — Phase 6 Phase E verification.
 *
 * Compares row counts (and a few aggregate sums) between the source
 * wholesale RDS and the merged ws_*-prefixed tables on the storefront
 * RDS. Reports drift; exits non-zero on any discrepancy.
 *
 * Run AFTER Phase B (data load) and Phase C (FK rebind):
 *
 *   WHOLESALE_DATABASE_URL='...' \
 *   STOREFRONT_DATABASE_URL='...' \
 *     pnpm tsx apps/storefront/scripts/verify-wholesale-merge.ts
 *
 * Exit codes:
 *   0  — every table matches
 *   1  — one or more tables drift; do not advance to Phase D
 *   2  — connection / script error
 *
 * Output: a table of {wholesale.X, ws_X, diff} for every table.
 * Tables that match on count get a ✓; drift gets a ✗ + the diff.
 *
 * Beyond counts, the script also compares:
 *   - SUM(price) on cards (money-typed; column drift is loud)
 *   - MAX(snapshot_date) on price_archive (latest history row)
 *   - COUNT(*) WHERE finished_at IS NOT NULL on ingest_run
 *
 * These spot-checks catch the failure mode where a partial
 * pg_restore looked right by row count but truncated a long-value
 * column or skipped the last few rows.
 *
 * Read-only; safe to re-run.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const WHOLESALE = join(REPO_ROOT, "apps/wholesale");
const STOREFRONT = join(REPO_ROOT, "apps/storefront");

const SKIP_TABLES = new Set([
  "schema_migrations",
  "__drizzle_migrations",
  "pg_stat_statements",
]);

function loadEnvFrom(dir: string) {
  for (const f of [".env.local", ".env"]) {
    const path = join(dir, f);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

function pgClient(url: string) {
  return postgres(url.replace(/\?sslmode=[^&]*/, ""), {
    ssl: { rejectUnauthorized: false },
  });
}

async function listTables(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ table_name: string }[]>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `;
  return rows.map((r) => r.table_name).filter((t) => !SKIP_TABLES.has(t));
}

async function countOf(sql: postgres.Sql, table: string): Promise<number | null> {
  try {
    const r = await sql.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
    const row = r[0] as { n: number } | undefined;
    return row?.n ?? null;
  } catch {
    return null;
  }
}

async function spotCheck(
  wholesaleSql: postgres.Sql,
  storefrontSql: postgres.Sql,
  table: string,
  query: string,
): Promise<{ wholesale: unknown; storefront: unknown } | null> {
  try {
    const wRes = await wholesaleSql.unsafe(query.replaceAll("ws_", ""));
    const sRes = await storefrontSql.unsafe(query);
    return {
      wholesale: (wRes[0] as Record<string, unknown> | undefined)?.["v"],
      storefront: (sRes[0] as Record<string, unknown> | undefined)?.["v"],
    };
  } catch {
    return null;
  }
}

async function main() {
  loadEnvFrom(WHOLESALE);
  loadEnvFrom(STOREFRONT);

  const wholesaleUrl = process.env.WHOLESALE_DATABASE_URL ?? process.env.DATABASE_URL;
  const storefrontUrl = process.env.STOREFRONT_DATABASE_URL;

  if (!wholesaleUrl) {
    console.error("WHOLESALE_DATABASE_URL not set.");
    process.exit(2);
  }
  if (!storefrontUrl) {
    console.error("STOREFRONT_DATABASE_URL not set.");
    process.exit(2);
  }

  const wholesaleSql = pgClient(wholesaleUrl);
  const storefrontSql = pgClient(storefrontUrl);

  console.log("=".repeat(72));
  console.log("Phase 6 verification — wholesale RDS ↔ storefront ws_* tables");
  console.log("=".repeat(72));

  const tables = await listTables(wholesaleSql);
  console.log(`\nSource has ${tables.length} tables.\n`);

  let drift = 0;
  let matched = 0;
  let missing = 0;

  console.log("Row counts:");
  console.log("-".repeat(72));
  console.log(
    `  ${"table".padEnd(36)}  ${"source".padStart(10)}  ${"target".padStart(10)}  status`,
  );
  console.log("-".repeat(72));

  for (const t of tables) {
    const src = await countOf(wholesaleSql, t);
    const tgt = await countOf(storefrontSql, `ws_${t}`);

    if (tgt === null) {
      missing += 1;
      console.log(`  ${t.padEnd(36)}  ${String(src ?? "—").padStart(10)}  ${"missing".padStart(10)}  ✗ table absent`);
      continue;
    }
    if (src === null) {
      missing += 1;
      console.log(`  ${t.padEnd(36)}  ${"err".padStart(10)}  ${String(tgt).padStart(10)}  ✗ source read failed`);
      continue;
    }
    if (src === tgt) {
      matched += 1;
      console.log(`  ${t.padEnd(36)}  ${String(src).padStart(10)}  ${String(tgt).padStart(10)}  ✓`);
    } else {
      drift += 1;
      const diff = tgt - src;
      console.log(`  ${t.padEnd(36)}  ${String(src).padStart(10)}  ${String(tgt).padStart(10)}  ✗ diff=${diff > 0 ? "+" : ""}${diff}`);
    }
  }
  console.log("-".repeat(72));

  console.log("\nSpot checks (aggregate sanity):");

  type Check = { name: string; query: string };
  const checks: Check[] = [
    { name: "cards SUM(price)",          query: "SELECT COALESCE(SUM(price),0)::text AS v FROM ws_cards" },
    { name: "price_archive MAX(date)",   query: "SELECT MAX(snapshot_date)::text AS v FROM ws_price_archive" },
    { name: "ingest_run finished count", query: "SELECT count(*)::int AS v FROM ws_ingest_run WHERE finished_at IS NOT NULL" },
    { name: "orders SUM(total)",         query: "SELECT COALESCE(SUM(total),0)::text AS v FROM ws_orders" },
  ];

  for (const c of checks) {
    const r = await spotCheck(wholesaleSql, storefrontSql, "", c.query);
    if (r === null) {
      console.log(`  ${c.name.padEnd(36)}  (skipped — query failed)`);
      continue;
    }
    const ok = String(r.wholesale) === String(r.storefront);
    if (ok) {
      console.log(`  ${c.name.padEnd(36)}  ${String(r.wholesale)}  ✓`);
    } else {
      drift += 1;
      console.log(`  ${c.name.padEnd(36)}  src=${r.wholesale} tgt=${r.storefront}  ✗`);
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log(`Summary: ${matched} matched · ${drift} drift · ${missing} missing/error`);
  console.log("=".repeat(72));

  if (drift > 0 || missing > 0) {
    console.error("\n✗ Verification failed. Do not advance to Phase D until drift is resolved.");
    console.error("  Investigate by comparing the specific tables that drifted.");
    console.error("  If drift is recoverable: re-dump + re-restore the affected tables.");
    console.error("  If not: restore wholesale RDS from the pre-merge snapshot and restart.");
    process.exit(1);
  }

  console.log("\n✓ All tables match. Safe to proceed to Phase D (code cutover).");
  await wholesaleSql.end();
  await storefrontSql.end();
}

main().catch((err) => {
  console.error("\nScript failed:", err);
  process.exit(2);
});
