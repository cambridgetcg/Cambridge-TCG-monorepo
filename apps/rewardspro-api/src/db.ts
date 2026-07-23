import pg from "pg";

import type { DatabaseConfig } from "./config.js";

const { Pool } = pg;

export type DatabasePool = pg.Pool;

export type DatabaseRuntime = "api" | "worker";

interface DatabaseReadinessRow extends pg.QueryResultRow {
  ready: boolean;
}

interface RelationRequirement {
  columns: readonly string[];
  privileges: readonly ("DELETE" | "INSERT" | "SELECT" | "UPDATE")[];
  table: string;
}

const API_RELATION_REQUIREMENTS: readonly RelationRequirement[] = [
  {
    columns: [
      "id",
      "workspace_id",
      "provider",
      "external_account_id",
      "status",
    ],
    privileges: ["SELECT"],
    table: "rp_commerce_connection",
  },
  {
    columns: [
      "id",
      "workspace_id",
      "commerce_connection_id",
      "external_event_id",
      "external_event_type",
      "payload",
      "payload_sha256",
      "occurred_at",
      "processing_state",
      "dispatch_state",
      "next_dispatch_at",
    ],
    privileges: ["SELECT", "INSERT", "UPDATE"],
    table: "rp_commerce_event",
  },
];

const WORKER_RELATION_REQUIREMENTS: readonly RelationRequirement[] = [
  {
    columns: ["id", "external_account_id", "provider"],
    privileges: ["SELECT"],
    table: "rp_commerce_connection",
  },
  {
    columns: [
      "id",
      "workspace_id",
      "commerce_connection_id",
      "external_event_id",
      "external_event_type",
      "payload",
      "payload_sha256",
      "occurred_at",
      "received_at",
      "processing_state",
      "processing_attempt_count",
      "processing_lease_token",
      "processing_lease_until",
      "normalized_event_type",
      "normalized_payload",
      "normalized_at",
      "last_processing_error_code",
      "dispatch_state",
      "dispatch_attempt_count",
      "dispatch_lease_token",
      "dispatch_lease_until",
      "next_dispatch_at",
      "dispatched_at",
      "last_dispatch_error_code",
    ],
    privileges: ["SELECT", "UPDATE"],
    table: "rp_commerce_event",
  },
  {
    columns: ["id", "expires_at", "acknowledged_at"],
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    table: "rp_worker_probe",
  },
];

export class DatabaseReadinessError extends Error {
  override readonly name = "DatabaseReadinessError";
}

export function createDatabasePool(config: DatabaseConfig): DatabasePool {
  return new Pool({
    allowExitOnIdle: false,
    application_name: "rewardspro-api-v2",
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: config.connectTimeoutMs,
    idleTimeoutMillis: 30_000,
    max: config.poolMax,
    query_timeout: config.queryTimeoutMs,
  });
}

export async function checkDatabase(
  pool: Pick<pg.Pool, "query">,
  runtime: DatabaseRuntime,
): Promise<void> {
  const requirements =
    runtime === "api"
      ? API_RELATION_REQUIREMENTS
      : WORKER_RELATION_REQUIREMENTS;
  const relationValues = requirements
    .map(
      (requirement) =>
        `(${sqlLiteral(requirement.table)}, ARRAY[${requirement.privileges
          .map(sqlLiteral)
          .join(", ")}]::text[])`,
    )
    .join(",\n");
  const columnValues = requirements
    .flatMap((requirement) =>
      requirement.columns.map(
        (column) =>
          `(${sqlLiteral(requirement.table)}, ${sqlLiteral(column)})`,
      ),
    )
    .join(",\n");

  // Catalog and privilege inspection is deliberately read-only. It catches a
  // reachable but unmigrated database and an application role that can connect
  // yet cannot perform the API/worker's real DML.
  const result = await pool.query<DatabaseReadinessRow>(
    `WITH required_relation(table_name, privileges) AS (
       VALUES ${relationValues}
     ),
     required_column(table_name, column_name) AS (
       VALUES ${columnValues}
     )
     SELECT
       has_schema_privilege(current_user, 'public', 'USAGE')
       AND NOT EXISTS (
         SELECT 1
           FROM required_relation relation
          WHERE to_regclass('public.' || relation.table_name) IS NULL
             OR EXISTS (
               SELECT 1
                 FROM unnest(relation.privileges) AS privilege(name)
                WHERE NOT COALESCE(
                  has_table_privilege(
                    current_user,
                    to_regclass('public.' || relation.table_name),
                    privilege.name
                  ),
                  false
                )
             )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM required_column required
          WHERE NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_attribute attribute
              JOIN pg_catalog.pg_class relation
                ON relation.oid = attribute.attrelid
              JOIN pg_catalog.pg_namespace namespace
                ON namespace.oid = relation.relnamespace
             WHERE namespace.nspname = 'public'
               AND relation.relname = required.table_name
               AND attribute.attname = required.column_name
               AND attribute.attnum > 0
               AND NOT attribute.attisdropped
          )
       ) AS ready`,
  );

  if (result.rows[0]?.ready !== true) {
    throw new DatabaseReadinessError(
      `PostgreSQL is missing required ${runtime} schema or privileges`,
    );
  }
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
