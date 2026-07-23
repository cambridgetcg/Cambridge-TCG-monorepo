import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type pg from "pg";

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9][a-z0-9_-]*\.sql$/;
const MIGRATION_LOCK_ID = "827403190224";
const APP_MIGRATION_NAMESPACE = "rewardspro";
const YUTABASE_MIGRATION_NAMESPACE = "yutabase@0.1.0-candidate.2";
const YUTABASE_MIGRATION_FILENAMES = [
  "0001_yu_core.sql",
  "0002_starter_lexicon.sql",
  "0004_candidate_hardening.sql",
] as const;

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS public.rp_schema_migration (
  version text PRIMARY KEY,
  checksum_sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

interface MigrationStateInspectionRow extends pg.QueryResultRow {
  app_objects_exist: boolean;
  ledger_exists: boolean;
  legacy_event_table_exists: boolean;
}

export interface MigrationFile {
  checksum: string;
  filename: string;
  sql: string;
  version: string;
}

export async function discoverMigrations(
  migrationsDirectory: string,
  namespace = APP_MIGRATION_NAMESPACE,
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

  return readMigrationFiles(
    migrationsDirectory,
    filenames,
    namespace,
  );
}

export async function discoverMigrationPlan(
  migrationsDirectory: string,
  yutabaseMigrationsDirectory = resolveYutabaseMigrationsDirectory(),
): Promise<MigrationFile[]> {
  const upstream = await readMigrationFiles(
    yutabaseMigrationsDirectory,
    [...YUTABASE_MIGRATION_FILENAMES],
    YUTABASE_MIGRATION_NAMESPACE,
  );
  const application = await discoverMigrations(
    migrationsDirectory,
    APP_MIGRATION_NAMESPACE,
  );
  return [...upstream, ...application];
}

export async function runMigrations(
  pool: Pick<pg.Pool, "connect">,
  migrationsDirectory: string,
  yutabaseMigrationsDirectory?: string,
): Promise<{ applied: string[]; existing: string[] }> {
  const migrations = await discoverMigrationPlan(
    migrationsDirectory,
    yutabaseMigrationsDirectory,
  );
  const client = await pool.connect();
  const applied: string[] = [];
  const existing: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);
    await assertMigrationBaseline(client);
    await client.query(BOOTSTRAP_SQL);

    for (const migration of migrations) {
      const result = await client.query<{ checksum_sha256: string }>(
        "SELECT checksum_sha256 FROM public.rp_schema_migration WHERE version = $1",
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
          `INSERT INTO public.rp_schema_migration (version, checksum_sha256)
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

async function assertMigrationBaseline(
  client: Pick<pg.PoolClient, "query">,
): Promise<void> {
  const inspection = await client.query<MigrationStateInspectionRow>(
    `SELECT
       to_regclass('public.rp_schema_migration') IS NOT NULL AS ledger_exists,
       to_regclass('public.rp_commerce_event') IS NOT NULL
         AS legacy_event_table_exists,
       (
         to_regclass('public.rp_workspace') IS NOT NULL
         OR to_regclass('public.rp_commerce_connection') IS NOT NULL
         OR to_regclass('public.rp_external_identity') IS NOT NULL
         OR to_regclass('public.rp_commerce_event_state') IS NOT NULL
         OR to_regclass('public.rp_worker_probe') IS NOT NULL
         OR to_regclass('commerce.events') IS NOT NULL
         OR to_regclass('commerce.event_payloads') IS NOT NULL
         OR to_regclass('commerce.orders') IS NOT NULL
         OR to_regclass('commerce.line_items') IS NOT NULL
       ) AS app_objects_exist`,
  );
  const state = inspection.rows[0];
  if (!state) {
    return;
  }

  if (state.legacy_event_table_exists) {
    throw new Error(
      "Legacy RewardsPro event table detected; refuse the rewritten baseline. Rebuild this fresh target or use additive forward migrations.",
    );
  }

  let appLedgerExists = false;
  if (state.ledger_exists) {
    const ledger = await client.query<{ version: string }>(
      "SELECT version FROM public.rp_schema_migration ORDER BY version",
    );
    const unsupported = ledger.rows
      .map((row) => row.version)
      .filter(
        (version) =>
          !version.startsWith(`${APP_MIGRATION_NAMESPACE}/`) &&
          !version.startsWith(`${YUTABASE_MIGRATION_NAMESPACE}/`),
      );
    if (unsupported.length > 0) {
      throw new Error(
        `Migration ledger contains unsupported pre-namespaced entries: ${unsupported.join(
          ", ",
        )}. Rebuild this fresh target or use additive forward migrations.`,
      );
    }
    appLedgerExists = ledger.rows.some((row) =>
      row.version.startsWith(`${APP_MIGRATION_NAMESPACE}/`),
    );
  }

  if (state.app_objects_exist !== appLedgerExists) {
    throw new Error(
      "RewardsPro schema and namespaced migration ledger disagree; refuse the rewritten baseline. Rebuild this fresh target or use additive forward migrations.",
    );
  }
}

function resolveYutabaseMigrationsDirectory(): string {
  const packageEntrypoint = import.meta.resolve("yutabase");
  return fileURLToPath(new URL("./sql/", packageEntrypoint));
}

async function readMigrationFiles(
  directory: string,
  filenames: string[],
  namespace: string,
): Promise<MigrationFile[]> {
  return Promise.all(
    filenames.map(async (filename) => {
      if (!MIGRATION_FILE_PATTERN.test(filename)) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }
      const sql = await readFile(path.join(directory, filename), "utf8");
      return {
        checksum: createHash("sha256").update(sql).digest("hex"),
        filename,
        sql,
        version: `${namespace}/${filename.slice(0, -4)}`,
      };
    }),
  );
}
