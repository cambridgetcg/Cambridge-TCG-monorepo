#!/usr/bin/env node
// Migration runner for the wholesale app's drizzle/*.sql files.
// Mirrors apps/storefront/scripts/migrate.mjs: applies each .sql file in
// lexical order inside its own transaction and records applied filenames
// in schema_migrations (the same ledger apply-security-migrations.ts and
// the 2026-05-12 baseline application wrote to).
//
// Usage:
//   node scripts/migrate.mjs                  # DATABASE_URL from env / .env.local
//   node scripts/migrate.mjs --dry-run        # list pending, apply nothing
//   node scripts/migrate.mjs --url "postgres://..."
//
// Run with: node --env-file=.env.local scripts/migrate.mjs

import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "..", "drizzle");

const urlArgIdx = process.argv.indexOf("--url");
const argUrl = urlArgIdx >= 0 ? process.argv[urlArgIdx + 1] : null;
const rawUrl = argUrl || process.env.DATABASE_URL;
const dryRun = process.argv.includes("--dry-run");

if (!rawUrl) {
  console.error("Missing DATABASE_URL (env or --url).");
  process.exit(1);
}

const sql = postgres(rawUrl, { max: 1, idle_timeout: 10 });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const applied = new Set(
    (await sql`SELECT name FROM schema_migrations`).map((r) => r.name),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· skip   ${file}`);
      continue;
    }
    if (dryRun) {
      console.log(`→ would apply  ${file}`);
      ran++;
      continue;
    }
    const body = readFileSync(join(migrationsDir, file), "utf8");
    process.stdout.write(`→ apply  ${file} ... `);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
      console.log("OK");
      ran++;
    } catch (err) {
      console.log("FAILED (rolled back)");
      console.error(err);
      process.exit(1);
    }
  }

  console.log(
    dryRun
      ? `\n${ran} migration(s) pending.`
      : `\n${ran} migration(s) applied, ${applied.size + ran} total.`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
