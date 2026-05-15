#!/usr/bin/env tsx
/**
 * migrate-clients-to-storefront — Phase 3 of the wholesale consolidation.
 *
 * Reads wholesale.clients from the wholesale RDS and upserts each into
 * storefront.users with role='wholesale'. Idempotent on email — a
 * re-run picks up only new clients.
 *
 * What it does:
 *   1. SELECT id, name, email, company, created_at FROM wholesale.clients
 *   2. For each: INSERT INTO storefront.users (email, role, name, ...)
 *      ON CONFLICT (email) DO NOTHING — except if the existing user has
 *      role='user' we UPGRADE it to role='wholesale' (the client is the
 *      authoritative B2B record).
 *   3. Log every action (created / upgraded / already-wholesale / skipped).
 *   4. Print a summary at the end.
 *
 * What it does NOT do:
 *   - Send welcome emails. Use scripts/send-wholesale-welcome.ts for that
 *     after this migration completes successfully (operator-driven, so
 *     the welcome email isn't accidentally sent twice on a re-run).
 *   - Port bcrypt passwords. Storefront auth is magic-link; passwords
 *     are by design left behind. Migrated buyers re-onboard.
 *   - Touch the wholesale.clients table. The legacy table stays alive
 *     until Phase 4 retires the wholesale browser surfaces.
 *
 * Run:
 *   WHOLESALE_DATABASE_URL='postgres://...' \
 *   STOREFRONT_DATABASE_URL='postgres://...' \
 *     pnpm tsx apps/wholesale/scripts/migrate-clients-to-storefront.ts
 *
 *   --dry-run  : read + report, don't write
 *   --limit=N  : cap rows processed (for staged runs)
 *
 * Safety:
 *   - All writes are within a single transaction PER USER (not one big
 *     transaction over thousands of rows; if the script dies halfway,
 *     completed clients stay migrated; the next run picks up the rest).
 *   - Idempotent: re-running is safe.
 *   - Read-only on the wholesale side. The wholesale.clients table is
 *     never modified — the legacy path stays usable during transition.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const APP_ROOT = new URL("..", import.meta.url).pathname;

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

interface WholesaleClient {
  id: number;
  email: string;
  name: string;
  company: string | null;
  role: "admin" | "client";
  created_at: string | null;
}

interface StorefrontUser {
  id: string;
  email: string;
  role: string;
}

interface MigrationStats {
  read: number;
  created: number;
  upgraded: number;
  alreadyWholesale: number;
  skippedAdmin: number;
  errors: { email: string; reason: string }[];
}

async function main() {
  loadEnv();

  const wholesaleUrl = process.env.WHOLESALE_DATABASE_URL ?? process.env.DATABASE_URL;
  const storefrontUrl = process.env.STOREFRONT_DATABASE_URL;

  if (!wholesaleUrl) {
    console.error("WHOLESALE_DATABASE_URL (or DATABASE_URL) not set.");
    process.exit(1);
  }
  if (!storefrontUrl) {
    console.error("STOREFRONT_DATABASE_URL not set. This script needs cross-DB access.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  const wholesaleSql = postgres(wholesaleUrl.replace(/\?sslmode=[^&]*/, ""), {
    ssl: { rejectUnauthorized: false },
  });
  const storefrontSql = postgres(storefrontUrl.replace(/\?sslmode=[^&]*/, ""), {
    ssl: { rejectUnauthorized: false },
  });

  console.log("=".repeat(70));
  console.log(`Phase 3 — wholesale.clients → storefront.users migration`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  if (limit) console.log(`Limit: ${limit}`);
  console.log("=".repeat(70));

  // Read all clients (excluding the synthetic ones the platform creates
  // for Shopify integration etc. — we filter by email convention).
  const clients = await wholesaleSql<WholesaleClient[]>`
    SELECT id, email, name, company, role,
           created_at::text AS created_at
      FROM clients
     WHERE email NOT LIKE 'shopify@%'
       AND email NOT LIKE '%@cambridgetcg.com'
     ORDER BY created_at ASC
     ${limit ? wholesaleSql`LIMIT ${limit}` : wholesaleSql``}
  `;

  console.log(`\nRead ${clients.length} client rows from wholesale RDS.\n`);

  const stats: MigrationStats = {
    read: clients.length,
    created: 0,
    upgraded: 0,
    alreadyWholesale: 0,
    skippedAdmin: 0,
    errors: [],
  };

  for (const client of clients) {
    const email = client.email.toLowerCase().trim();
    if (!email) {
      stats.errors.push({ email: client.email, reason: "empty email" });
      continue;
    }

    // Look up by email in storefront RDS.
    const existing = await storefrontSql<StorefrontUser[]>`
      SELECT id, email, role FROM users WHERE email = ${email} LIMIT 1
    `;

    if (existing.length > 0) {
      const u = existing[0];
      if (u.role === "admin") {
        // Don't downgrade admins. They already have a higher role.
        stats.skippedAdmin += 1;
        console.log(`  [skip] ${email} — already admin (id ${u.id})`);
        continue;
      }
      if (u.role === "wholesale") {
        stats.alreadyWholesale += 1;
        console.log(`  [ok]   ${email} — already wholesale`);
        continue;
      }
      // role='user' (or anything else lower) → upgrade to wholesale.
      if (!dryRun) {
        await storefrontSql`
          UPDATE users
             SET role = 'wholesale',
                 name = COALESCE(NULLIF(name, ''), ${client.name})
           WHERE id = ${u.id}
        `;
      }
      stats.upgraded += 1;
      console.log(`  [up]   ${email} — '${u.role}' → 'wholesale'`);
      continue;
    }

    // No existing user — create one.
    if (!dryRun) {
      await storefrontSql`
        INSERT INTO users (email, name, role, email_verified)
        VALUES (${email}, ${client.name || null}, 'wholesale', NULL)
      `;
    }
    stats.created += 1;
    console.log(`  [new]  ${email} — created with role='wholesale'`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));
  console.log(`  Read:               ${stats.read}`);
  console.log(`  Created (new):      ${stats.created}`);
  console.log(`  Upgraded (→whol):   ${stats.upgraded}`);
  console.log(`  Already wholesale:  ${stats.alreadyWholesale}`);
  console.log(`  Skipped admin:      ${stats.skippedAdmin}`);
  console.log(`  Errors:             ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    console.log("\n  Error details:");
    for (const e of stats.errors) {
      console.log(`    - ${e.email}: ${e.reason}`);
    }
  }
  if (dryRun) {
    console.log("\n[DRY RUN] No writes were made. Remove --dry-run to apply.");
  } else {
    console.log("\nNext step: send welcome emails to newly-migrated buyers with:");
    console.log("  pnpm tsx apps/wholesale/scripts/send-wholesale-welcome.ts --since=<iso-date>");
  }

  await wholesaleSql.end();
  await storefrontSql.end();
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
