#!/usr/bin/env node
// Migration runner for drizzle/*.sql files.
// Reads DATABASE_URL from environment (or --url argument), applies each .sql
// file in lexical order, and records applied filenames in schema_migrations.
//
// Usage:
//   DATABASE_URL="postgres://..." node scripts/migrate.mjs --ca-file /path/to/rds-ca.pem
//   node scripts/migrate.mjs --url "postgres://..." --ca-file /path/to/rds-ca.pem
//   DATABASE_URL="postgres://..." node scripts/migrate.mjs --no-ssl # loopback only
//   DATABASE_URL="postgres://..." node scripts/migrate.mjs --ca-file /path/to/rds-ca.pem --plan --expect-only 0117_privacy_defaults.sql

import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "..", "drizzle");

// ── args ─────────────────────────────────────────────────────────────────

const urlArgIdx = process.argv.indexOf("--url");
const argUrl = urlArgIdx >= 0 ? process.argv[urlArgIdx + 1] : null;
const rawUrl = argUrl || process.env.DATABASE_URL;
const planOnly = process.argv.includes("--plan");
const expectedIdx = process.argv.indexOf("--expect-only");
const expectedOnly = expectedIdx >= 0 ? process.argv[expectedIdx + 1] : null;
const caFileIdx = process.argv.indexOf("--ca-file");
const caFile = caFileIdx >= 0 ? process.argv[caFileIdx + 1] : process.env.PGSSLROOTCERT;
const noSsl = process.argv.includes("--no-ssl");

if (!rawUrl) {
  console.error("Missing DATABASE_URL (env or --url).");
  process.exit(1);
}

if (expectedIdx >= 0 && !expectedOnly) {
  console.error("--expect-only requires one migration filename.");
  process.exit(1);
}

if (caFileIdx >= 0 && !caFile) {
  console.error("--ca-file requires a PEM filename.");
  process.exit(1);
}

const connectionUrl = new URL(rawUrl);
const hostname = connectionUrl.hostname;
const loopback =
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
if (noSsl && !loopback) {
  console.error("--no-ssl is allowed only for a loopback database URL.");
  process.exit(1);
}
if (noSsl && caFile) {
  console.error("Choose either --ca-file/PGSSLROOTCERT or --no-ssl, not both.");
  process.exit(1);
}
if (!noSsl && !caFile) {
  console.error(
    "Verified TLS is required. Set --ca-file/PGSSLROOTCERT, or use --no-ssl for loopback only.",
  );
  process.exit(1);
}

let ssl = false;
if (caFile) {
  const ca = readFileSync(caFile, "utf8");
  if (!ca.includes("-----BEGIN CERTIFICATE-----")) {
    console.error(`CA file does not contain a PEM certificate: ${caFile}`);
    process.exit(1);
  }
  ssl = { ca, rejectUnauthorized: true };
}

// pg lets sslmode in the URL override the explicit verified TLS object.
connectionUrl.searchParams.delete("sslmode");
const cleanedUrl = connectionUrl.toString();

const pool = new pg.Pool({
  connectionString: cleanedUrl,
  ssl,
});

// ── runner ───────────────────────────────────────────────────────────────

async function main() {
  if (planOnly) {
    const table = await pool.query(
      "SELECT to_regclass('public.schema_migrations') AS name",
    );
    if (!table.rows[0]?.name) {
      throw new Error(
        "schema_migrations does not exist; --plan will not create it. Inspect the database before applying anything.",
      );
    }
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  const applied = new Set(
    (await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const pending = files.filter((file) => !applied.has(file));

  if (expectedOnly) {
    if (!files.includes(expectedOnly)) {
      throw new Error(`Expected migration is not present locally: ${expectedOnly}`);
    }
    if (pending.length !== 1 || pending[0] !== expectedOnly) {
      throw new Error(
        `Expected only ${expectedOnly} to be pending; found: ${pending.join(", ") || "none"}. No migration was applied.`,
      );
    }
  }

  if (planOnly) {
    console.log(pending.length > 0 ? pending.join("\n") : "No pending migrations.");
    await pool.end();
    return;
  }

  let ran = 0;
  for (const file of pending) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    process.stdout.write(`→ apply  ${file} ... `);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("OK");
      ran++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("FAILED");
      console.error(err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`\n${ran} migration(s) applied, ${applied.size + ran} total.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
