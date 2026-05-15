#!/usr/bin/env tsx
/**
 * apply-security-migrations — one-shot applier for the 2026-05-14
 * security pass migrations (0016 → 0019).
 *
 * Reads DATABASE_URL from .env.local / .env (same convention as
 * tools/gen-api-key.ts). Applies all four migrations inside a single
 * transaction — atomic: either all succeed or none do. Each migration
 * file is idempotent (IF NOT EXISTS / DEFAULT / ON CONFLICT), so
 * re-running is safe.
 *
 * Run:
 *   pnpm tsx apps/wholesale/scripts/apply-security-migrations.ts
 *
 * The script verifies expected schema state after applying and exits
 * non-zero if anything is off.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const APP_ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS = [
  "0016_login_attempts.sql",
  "0017_channel_api_keys_revoked.sql",
  "0018_api_key_rate_limits.sql",
  "0019_api_key_data_hygiene.sql",
];

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const path = join(APP_ROOT, f);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Add it to apps/wholesale/.env.local or export it.");
    process.exit(1);
  }

  // Strip ?sslmode= from URL because we set ssl explicitly (matches the
  // app's own connection pattern in src/lib/db).
  const url = process.env.DATABASE_URL.replace(/\?sslmode=[^&]*/, "");
  const sql = postgres(url, { ssl: { rejectUnauthorized: false } });

  console.log("=".repeat(60));
  console.log("security migrations — 2026-05-14 auth-models pass");
  console.log("=".repeat(60));

  // Pre-flight: snapshot the columns that should change so we can
  // diff before/after.
  const preChannelKeyCols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'channel_api_keys'
    ORDER BY ordinal_position
  `;
  console.log("\nBefore — channel_api_keys columns:");
  console.log(`  ${preChannelKeyCols.map((r) => r.column_name).join(", ")}`);

  const preStorefrontKey = await sql<{ id: number; channel: string; requests_per_minute: number | null }[]>`
    SELECT id, channel,
           CASE WHEN column_exists THEN requests_per_minute ELSE NULL END AS requests_per_minute
    FROM channel_api_keys
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'channel_api_keys' AND column_name = 'requests_per_minute'
      ) AS column_exists
    ) c
    WHERE label ILIKE '%storefront%'
       OR channel IN ('cambridgetcg-storefront', 'cambridgetcg')
    ORDER BY id
  `.catch(() => [] as any[]);
  if (preStorefrontKey.length > 0) {
    console.log("\nBefore — storefront-ish keys:");
    for (const k of preStorefrontKey) {
      console.log(`  #${k.id}: channel='${k.channel}' rpm=${k.requests_per_minute ?? "(column missing)"}`);
    }
  } else {
    console.log("\nBefore — no storefront-ish keys found (fresh DB or already renamed)");
  }

  // Apply all four migrations in a single transaction.
  console.log("\nApplying migrations in one transaction…");
  await sql.begin(async (tx) => {
    for (const filename of MIGRATIONS) {
      const path = join(APP_ROOT, "drizzle", filename);
      const sqlBody = readFileSync(path, "utf-8");
      console.log(`  → ${filename}`);
      await tx.unsafe(sqlBody);
    }
  });
  console.log("✓ transaction committed");

  // Verify — assert the expected post-state.
  console.log("\nVerifying…");

  const postChannelKeyCols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'channel_api_keys'
    ORDER BY ordinal_position
  `;
  const colNames = postChannelKeyCols.map((r) => r.column_name);
  const expectedNew = ["revoked_at", "requests_per_minute"];
  const missing = expectedNew.filter((c) => !colNames.includes(c));
  if (missing.length > 0) {
    console.error(`✗ Missing expected columns on channel_api_keys: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`  ✓ channel_api_keys columns include: ${expectedNew.join(", ")}`);

  const loginAttemptsExists = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'login_attempts'
  `;
  if (loginAttemptsExists[0].n !== 1) {
    console.error("✗ login_attempts table not created");
    process.exit(1);
  }
  console.log("  ✓ login_attempts table exists");

  const apiKeyUsageExists = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'api_key_usage'
  `;
  if (apiKeyUsageExists[0].n !== 1) {
    console.error("✗ api_key_usage table not created");
    process.exit(1);
  }
  console.log("  ✓ api_key_usage table exists");

  const postStorefrontKey = await sql<{ id: number; channel: string; requests_per_minute: number; revoked_at: Date | null }[]>`
    SELECT id, channel, requests_per_minute, revoked_at
    FROM channel_api_keys
    WHERE label ILIKE '%storefront%'
       OR channel IN ('cambridgetcg-storefront', 'cambridgetcg')
    ORDER BY id
  `;
  if (postStorefrontKey.length > 0) {
    console.log("\nAfter — storefront-ish keys:");
    for (const k of postStorefrontKey) {
      console.log(`  #${k.id}: channel='${k.channel}' rpm=${k.requests_per_minute} revoked_at=${k.revoked_at ?? "(active)"}`);
    }

    const stillOld = postStorefrontKey.filter((k) => k.channel === "cambridgetcg-storefront");
    if (stillOld.length > 0) {
      console.warn(`\n⚠ ${stillOld.length} key(s) still have channel='cambridgetcg-storefront' — they may be revoked or labelled differently. Check the table above.`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✓ All four migrations applied. Auth pass complete.");
  console.log("=".repeat(60));

  await sql.end();
}

main().catch((err) => {
  console.error("\n✗ Migration failed — transaction rolled back. Nothing was applied.");
  console.error(err);
  process.exit(1);
});
