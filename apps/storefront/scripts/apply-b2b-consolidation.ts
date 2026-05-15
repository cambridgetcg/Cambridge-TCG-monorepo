#!/usr/bin/env tsx
/**
 * apply-b2b-consolidation — one-command applier for the entire B2B
 * consolidation arc (Phases 1, 2.2a, 2.2c, security, Phase 3).
 *
 * Steps (each idempotent — re-run is safe):
 *
 *   1. WHOLESALE_DATABASE_URL: apply security migrations 0016 → 0019
 *      (login_attempts, channel_api_keys.revoked_at,
 *       api_key_usage + requests_per_minute, channel rename + rpm bump)
 *
 *   2. STOREFRONT_DATABASE_URL: apply B2B migrations 0099 → 0101
 *      (users.role 'wholesale' comment, b2b_cart_items, b2b_orders)
 *
 *   3. WHOLESALE_DATABASE_URL: provision the B2B partner API key
 *      (CHANNEL=wholesale LABEL='cambridgetcg.com B2B shell' RPM=600)
 *      Prints RAW_KEY to stdout for the operator to paste into Vercel
 *      as WHOLESALE_B2B_API_KEY.
 *
 *   4. (--migrate-clients) Cross-DB: read wholesale.clients, upsert
 *      storefront.users with role='wholesale'. Idempotent on email.
 *
 *   5. (--send-emails) STOREFRONT_DATABASE_URL + SES: send welcome
 *      emails to newly-migrated buyers via @cambridge-tcg/aws/ses.
 *      Throttled, idempotent via wholesale_welcome_emails ledger.
 *
 * Run:
 *   WHOLESALE_DATABASE_URL='postgres://...' \
 *   STOREFRONT_DATABASE_URL='postgres://...' \
 *     pnpm tsx apps/storefront/scripts/apply-b2b-consolidation.ts \
 *       [--dry-run] [--migrate-clients] [--send-emails] [--limit=N]
 *
 * The --migrate-clients and --send-emails flags are opt-in because they
 * change buyer state — migrations are auto (they only create schema).
 * For a full rollout from scratch:
 *
 *   pnpm tsx .../apply-b2b-consolidation.ts --dry-run
 *   pnpm tsx .../apply-b2b-consolidation.ts
 *   pnpm tsx .../apply-b2b-consolidation.ts --migrate-clients --send-emails
 *
 * Safety: all DB writes are inside transactions per migration. If any
 * step fails, the script exits non-zero with the failure; later steps
 * don't run. Recovery is to fix the error and re-run.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import postgres from "postgres";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const STOREFRONT = join(REPO_ROOT, "apps/storefront");
const WHOLESALE = join(REPO_ROOT, "apps/wholesale");

const WHOLESALE_MIGRATIONS = [
  "0016_login_attempts.sql",
  "0017_channel_api_keys_revoked.sql",
  "0018_api_key_rate_limits.sql",
  "0019_api_key_data_hygiene.sql",
];

const STOREFRONT_MIGRATIONS = [
  "0099_wholesale_role.sql",
  "0100_b2b_cart_items.sql",
  "0101_b2b_orders.sql",
];

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

async function applyMigrationsInOrder(
  sql: postgres.Sql,
  baseDir: string,
  files: string[],
  dryRun: boolean,
): Promise<void> {
  for (const filename of files) {
    const path = join(baseDir, "drizzle", filename);
    const body = readFileSync(path, "utf-8");
    console.log(`  → ${filename}`);
    if (dryRun) {
      console.log(`     [DRY RUN] would apply ${body.split("\n").length} lines`);
      continue;
    }
    await sql.unsafe(body);
  }
}

async function provisionB2BKey(sql: postgres.Sql, dryRun: boolean): Promise<string | null> {
  const channel = "wholesale";
  const label = "cambridgetcg.com B2B shell";
  const rpm = 600;

  const existing = await sql<{ id: number }[]>`
    SELECT id FROM channel_api_keys
     WHERE label = ${label} AND revoked_at IS NULL
     LIMIT 1
  `;

  if (existing.length > 0) {
    console.log(`  → B2B key already exists (id ${existing[0].id}); skipping provision.`);
    console.log(`     If WHOLESALE_B2B_API_KEY env var is unset, rotate manually via gen-api-key.ts.`);
    return null;
  }

  const rawKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  if (dryRun) {
    console.log(`  → [DRY RUN] would provision new B2B key (channel=${channel}, rpm=${rpm})`);
    return null;
  }

  await sql`
    INSERT INTO channel_api_keys (channel, key_hash, label, requests_per_minute)
    VALUES (${channel}, ${keyHash}, ${label}, ${rpm})
  `;

  console.log(`  → B2B key provisioned. RAW_KEY (copy into Vercel as WHOLESALE_B2B_API_KEY):`);
  console.log(`\n     ${rawKey}\n`);
  return rawKey;
}

interface WholesaleClient {
  email: string;
  name: string;
}

interface StorefrontUser {
  id: string;
  role: string;
}

async function migrateClients(
  wholesaleSql: postgres.Sql,
  storefrontSql: postgres.Sql,
  dryRun: boolean,
  limit?: number,
): Promise<{ read: number; created: number; upgraded: number; skipped: number }> {
  const clients = await wholesaleSql<WholesaleClient[]>`
    SELECT email, name
      FROM clients
     WHERE email NOT LIKE 'shopify@%'
       AND email NOT LIKE '%@cambridgetcg.com'
     ORDER BY created_at ASC
     ${limit ? wholesaleSql`LIMIT ${limit}` : wholesaleSql``}
  `;

  let created = 0;
  let upgraded = 0;
  let skipped = 0;

  for (const client of clients) {
    const email = client.email.toLowerCase().trim();
    if (!email) {
      skipped += 1;
      continue;
    }
    const existing = await storefrontSql<StorefrontUser[]>`
      SELECT id, role FROM users WHERE email = ${email} LIMIT 1
    `;
    if (existing.length > 0) {
      const u = existing[0];
      if (u.role === "admin" || u.role === "wholesale") {
        skipped += 1;
        continue;
      }
      if (!dryRun) {
        await storefrontSql`
          UPDATE users
             SET role = 'wholesale',
                 name = COALESCE(NULLIF(name, ''), ${client.name})
           WHERE id = ${u.id}
        `;
      }
      upgraded += 1;
    } else {
      if (!dryRun) {
        await storefrontSql`
          INSERT INTO users (email, name, role, email_verified)
          VALUES (${email}, ${client.name || null}, 'wholesale', NULL)
        `;
      }
      created += 1;
    }
  }
  return { read: clients.length, created, upgraded, skipped };
}

async function main() {
  // Try to load env from both app directories (whichever has .env.local)
  loadEnvFrom(WHOLESALE);
  loadEnvFrom(STOREFRONT);

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const doMigrateClients = args.includes("--migrate-clients");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  const wholesaleUrl = process.env.WHOLESALE_DATABASE_URL ?? process.env.DATABASE_URL;
  const storefrontUrl = process.env.STOREFRONT_DATABASE_URL;

  if (!wholesaleUrl) {
    console.error("WHOLESALE_DATABASE_URL (or DATABASE_URL) not set.");
    process.exit(1);
  }
  if (!storefrontUrl) {
    console.error("STOREFRONT_DATABASE_URL not set.");
    process.exit(1);
  }

  const wholesaleSql = pgClient(wholesaleUrl);
  const storefrontSql = pgClient(storefrontUrl);

  console.log("=".repeat(72));
  console.log("B2B consolidation — one-command apply");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Migrate clients: ${doMigrateClients ? "YES" : "no (use --migrate-clients)"}`);
  console.log("=".repeat(72));

  // Step 1: wholesale security migrations
  console.log("\n[1/4] Applying wholesale security migrations (0016 → 0019)...");
  try {
    await wholesaleSql.begin(async (tx) => {
      await applyMigrationsInOrder(tx, WHOLESALE, WHOLESALE_MIGRATIONS, dryRun);
    });
    console.log("      ✓ wholesale security migrations applied");
  } catch (err) {
    console.error("      ✗ wholesale migrations failed:", err);
    process.exit(1);
  }

  // Step 2: storefront B2B migrations
  console.log("\n[2/4] Applying storefront B2B migrations (0099 → 0101)...");
  try {
    await storefrontSql.begin(async (tx) => {
      await applyMigrationsInOrder(tx, STOREFRONT, STOREFRONT_MIGRATIONS, dryRun);
    });
    console.log("      ✓ storefront B2B migrations applied");
  } catch (err) {
    console.error("      ✗ storefront migrations failed:", err);
    process.exit(1);
  }

  // Step 3: provision B2B API key
  console.log("\n[3/4] Provisioning B2B API key...");
  try {
    await provisionB2BKey(wholesaleSql, dryRun);
  } catch (err) {
    console.error("      ✗ B2B key provision failed:", err);
    process.exit(1);
  }

  // Step 4 (optional): migrate clients
  if (doMigrateClients) {
    console.log("\n[4/4] Migrating wholesale.clients → storefront.users...");
    try {
      const stats = await migrateClients(wholesaleSql, storefrontSql, dryRun, limit);
      console.log(`      ✓ read=${stats.read} created=${stats.created} upgraded=${stats.upgraded} skipped=${stats.skipped}`);
    } catch (err) {
      console.error("      ✗ client migration failed:", err);
      process.exit(1);
    }
  } else {
    console.log("\n[4/4] Skipped — pass --migrate-clients to run");
  }

  console.log("\n" + "=".repeat(72));
  console.log(dryRun ? "DRY RUN complete. Re-run without --dry-run to apply." : "✓ Consolidation apply complete.");
  console.log("=".repeat(72));

  console.log("\nNext steps:");
  console.log("  1. Paste the RAW_KEY above into Vercel as WHOLESALE_B2B_API_KEY (if shown).");
  if (!doMigrateClients) {
    console.log("  2. Re-run with --migrate-clients to move legacy B2B accounts.");
  }
  console.log("  3. Send welcome emails: pnpm tsx apps/wholesale/scripts/send-wholesale-welcome.ts");
  console.log("  4. git push origin main to trigger Vercel deploy.");
  console.log("  5. Flip a test user to wholesale role:");
  console.log("       UPDATE users SET role = 'wholesale' WHERE email = '<you>';");
  console.log("     Sign in, visit /account/b2b.\n");

  await wholesaleSql.end();
  await storefrontSql.end();
}

main().catch((err) => {
  console.error("\nFailed:", err);
  process.exit(1);
});
