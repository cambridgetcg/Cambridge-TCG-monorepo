import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type pg from "pg";

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9][a-z0-9_-]*\.sql$/;
const MIGRATION_LOCK_ID = "827403190224";

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS rp_schema_migration (
  version text PRIMARY KEY,
  checksum_sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

export interface MigrationFile {
  checksum: string;
  filename: string;
  sql: string;
  version: string;
}

export async function discoverMigrations(
  migrationsDirectory: string,
): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  for (const filename of filenames) {
    if (!MIGRATION_FILE_PATTERN.test(filename)) {
      throw new Error(`Invalid migration filename: ${filename}`);
    }
  }

  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      return {
        checksum: createHash("sha256").update(sql).digest("hex"),
        filename,
        sql,
        version: filename.slice(0, -4),
      };
    }),
  );
}

export async function runMigrations(
  pool: Pick<pg.Pool, "connect">,
  migrationsDirectory: string,
): Promise<{ applied: string[]; existing: string[] }> {
  const migrations = await discoverMigrations(migrationsDirectory);
  const client = await pool.connect();
  const applied: string[] = [];
  const existing: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);
    await client.query(BOOTSTRAP_SQL);

    for (const migration of migrations) {
      const result = await client.query<{ checksum_sha256: string }>(
        "SELECT checksum_sha256 FROM rp_schema_migration WHERE version = $1",
        [migration.version],
      );
      const recorded = result.rows[0];
      if (recorded) {
        if (recorded.checksum_sha256.trim() !== migration.checksum) {
          throw new Error(`Migration checksum mismatch: ${migration.filename}`);
        }
        existing.push(migration.version);
        continue;
      }

      await client.query("BEGIN");
      try {
        // PostgreSQL receives the complete migration file in one query. Deliberately
        // do not split on semicolons: functions and procedural blocks may contain them.
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO rp_schema_migration (version, checksum_sha256)
           VALUES ($1, $2)`,
          [migration.version, migration.checksum],
        );
        await client.query("COMMIT");
        applied.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [
        MIGRATION_LOCK_ID,
      ]);
    } finally {
      client.release();
    }
  }

  return { applied, existing };
}
