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
  schema: string;
  table: string;
}

const TABLE_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
] as const;

const PROTECTED_RELATIONS = [
  ["public", "rp_schema_migration"],
  ["public", "rp_workspace"],
  ["public", "rp_commerce_connection"],
  ["public", "rp_external_identity"],
  ["public", "rp_commerce_event_state"],
  ["public", "rp_worker_probe"],
  ["commerce", "events"],
  ["commerce", "event_payloads"],
  ["commerce", "orders"],
  ["commerce", "line_items"],
  ["yu", "standard_meta"],
  ["yu", "registry"],
  ["yu", "lexicon"],
  ["yu", "threads"],
] as const;

const YUTABASE_RELATION_REQUIREMENTS: readonly RelationRequirement[] = [
  {
    columns: [
      "singleton",
      "standard",
      "profile",
      "version",
      "revision",
      "capabilities",
    ],
    privileges: ["SELECT"],
    schema: "yu",
    table: "standard_meta",
  },
  {
    columns: [
      "book",
      "deck",
      "id_col",
      "at_col",
      "by_col",
      "how_col",
      "src_col",
      "native",
      "physical_schema",
      "physical_table",
    ],
    privileges: ["SELECT"],
    schema: "yu",
    table: "registry",
  },
  {
    columns: ["word", "from_deck", "to_deck", "to_one", "status", "how"],
    privileges: ["SELECT"],
    schema: "yu",
    table: "lexicon",
  },
  {
    columns: [
      "id",
      "word",
      "from_book",
      "from_deck",
      "from_id",
      "to_book",
      "to_deck",
      "to_id",
      "at",
      "by",
      "how",
      "src",
    ],
    privileges: ["SELECT"],
    schema: "yu",
    table: "threads",
  },
];

const API_RELATION_REQUIREMENTS: readonly RelationRequirement[] = [
  {
    columns: [
      "id",
      "workspace_id",
      "provider",
      "external_account_id",
      "status",
    ],
    privileges: [],
    schema: "public",
    table: "rp_commerce_connection",
  },
  {
    columns: [
      "id",
      "workspace_id",
      "commerce_connection_id",
      "external_event_id",
      "external_event_type",
      "payload_sha256",
      "occurred_at",
      "received_at",
      "at",
      "by",
      "how",
      "src",
    ],
    privileges: [],
    schema: "commerce",
    table: "events",
  },
  {
    columns: ["event_id", "payload", "stored_at", "retention_until"],
    privileges: [],
    schema: "commerce",
    table: "event_payloads",
  },
  {
    columns: [
      "event_id",
      "processing_state",
      "dispatch_state",
      "next_dispatch_at",
    ],
    privileges: [],
    schema: "public",
    table: "rp_commerce_event_state",
  },
];

const WORKER_RELATION_REQUIREMENTS: readonly RelationRequirement[] = [
  {
    columns: ["id", "external_account_id", "provider"],
    privileges: ["SELECT"],
    schema: "public",
    table: "rp_commerce_connection",
  },
  {
    columns: [
      "id",
      "workspace_id",
      "commerce_connection_id",
      "external_event_id",
      "external_event_type",
      "payload_sha256",
      "occurred_at",
      "received_at",
      "at",
      "by",
      "how",
      "src",
    ],
    privileges: ["SELECT"],
    schema: "commerce",
    table: "events",
  },
  {
    columns: ["event_id", "payload", "retention_until"],
    privileges: ["SELECT", "DELETE"],
    schema: "commerce",
    table: "event_payloads",
  },
  {
    columns: [
      "event_id",
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
    schema: "public",
    table: "rp_commerce_event_state",
  },
  {
    columns: [
      "id",
      "workspace_id",
      "commerce_connection_id",
      "source_event_id",
      "external_order_id",
      "mapping",
      "at",
      "by",
      "how",
      "src",
    ],
    privileges: ["SELECT", "INSERT"],
    schema: "commerce",
    table: "orders",
  },
  {
    columns: [
      "id",
      "workspace_id",
      "commerce_connection_id",
      "order_id",
      "external_line_item_id",
      "mapping",
      "at",
      "by",
      "how",
      "src",
    ],
    privileges: ["SELECT", "INSERT"],
    schema: "commerce",
    table: "line_items",
  },
  {
    columns: [
      "id",
      "word",
      "from_book",
      "from_deck",
      "from_id",
      "to_book",
      "to_deck",
      "to_id",
      "at",
      "by",
      "how",
      "src",
    ],
    privileges: ["SELECT", "INSERT"],
    schema: "yu",
    table: "threads",
  },
  {
    columns: ["id", "expires_at", "acknowledged_at"],
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    schema: "public",
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
      ? [...YUTABASE_RELATION_REQUIREMENTS, ...API_RELATION_REQUIREMENTS]
      : [...YUTABASE_RELATION_REQUIREMENTS, ...WORKER_RELATION_REQUIREMENTS];
  const relationValues = requirements
    .map(
      (requirement) =>
        `(${sqlLiteral(requirement.schema)}, ${sqlLiteral(
          requirement.table,
        )}, ARRAY[${requirement.privileges.map(sqlLiteral).join(", ")}]::text[])`,
    )
    .join(",\n");
  const columnValues = requirements
    .flatMap((requirement) =>
      requirement.columns.map(
        (column) =>
          `(${sqlLiteral(requirement.schema)}, ${sqlLiteral(
            requirement.table,
          )}, ${sqlLiteral(column)})`,
      ),
    )
    .join(",\n");
  const forbiddenPrivilegeValues = PROTECTED_RELATIONS.flatMap(
    ([schema, table]) => {
      const allowed = new Set<string>(
        requirements
          .filter(
            (requirement) =>
              requirement.schema === schema && requirement.table === table,
          )
          .flatMap((requirement) => requirement.privileges),
      );
      return TABLE_PRIVILEGES.filter(
        (privilege) => !allowed.has(privilege),
      ).map(
        (privilege) =>
          `(${sqlLiteral(schema)}, ${sqlLiteral(table)}, ${sqlLiteral(
            privilege,
          )})`,
      );
    },
  ).join(",\n");
  const protectedRelationValues = PROTECTED_RELATIONS.map(
    ([schema, table]) => `(${sqlLiteral(schema)}, ${sqlLiteral(table)})`,
  ).join(",\n");

  // Catalog and privilege inspection is deliberately read-only. It catches a
  // reachable but unmigrated database and an application role that can connect
  // yet cannot perform the API/worker's real DML.
  const result = await pool.query<DatabaseReadinessRow>(
    `WITH required_relation(schema_name, table_name, privileges) AS (
       VALUES ${relationValues}
     ),
     required_column(schema_name, table_name, column_name) AS (
       VALUES ${columnValues}
     )
     SELECT
       COALESCE(
         has_schema_privilege(current_user, to_regnamespace('public'), 'USAGE'),
         false
       )
       AND COALESCE(
         has_schema_privilege(current_user, to_regnamespace('commerce'), 'USAGE'),
         false
       )
       AND COALESCE(
         has_schema_privilege(current_user, to_regnamespace('yu'), 'USAGE'),
         false
       )
       AND NOT EXISTS (
         SELECT 1
           FROM required_relation relation
          WHERE to_regclass(
                  quote_ident(relation.schema_name)
                  || '.'
                  || quote_ident(relation.table_name)
                ) IS NULL
             OR EXISTS (
               SELECT 1
                 FROM unnest(relation.privileges) AS privilege(name)
                WHERE NOT COALESCE(
                  has_table_privilege(
                    current_user,
                    to_regclass(
                      quote_ident(relation.schema_name)
                      || '.'
                      || quote_ident(relation.table_name)
                    ),
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
             WHERE namespace.nspname = required.schema_name
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

  const runtimeCapabilityBoundary =
    runtime === "api"
      ? `COALESCE(
           pg_catalog.pg_has_role(current_user, reader_oid, 'MEMBER'),
           false
         )
         AND EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members membership
           WHERE membership.member = runtime_oid
             AND membership.roleid = reader_oid
             AND NOT membership.admin_option
             AND membership.inherit_option
             AND NOT membership.set_option
         )
         AND NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members membership
           WHERE membership.member = runtime_oid
             AND membership.roleid <> reader_oid
         )
         AND NOT COALESCE(
           pg_catalog.pg_has_role(current_user, writer_oid, 'MEMBER'),
           false
         )
         AND NOT COALESCE(
           pg_catalog.pg_has_role(current_user, lexicographer_oid, 'MEMBER'),
           false
         )`
      : `COALESCE(
           pg_catalog.pg_has_role(current_user, writer_oid, 'MEMBER'),
           false
         )
         AND EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members membership
           WHERE membership.member = runtime_oid
             AND membership.roleid = writer_oid
             AND NOT membership.admin_option
             AND membership.inherit_option
             AND NOT membership.set_option
         )
         AND NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members membership
           WHERE membership.member = runtime_oid
             AND membership.roleid <> writer_oid
         )
         AND NOT COALESCE(
           pg_catalog.pg_has_role(current_user, lexicographer_oid, 'MEMBER'),
           false
         )`;
  const runtimeIngestFunctionBoundary =
    runtime === "api"
      ? `COALESCE(
           has_function_privilege(
             current_user,
             to_regprocedure(
               'public.rp_ingest_shopify_event(uuid,text,text,text,text,jsonb,timestamptz,boolean)'
             ),
             'EXECUTE'
           ),
           false
         )`
      : `NOT COALESCE(
           has_function_privilege(
             current_user,
             to_regprocedure(
               'public.rp_ingest_shopify_event(uuid,text,text,text,text,jsonb,timestamptz,boolean)'
             ),
             'EXECUTE'
           ),
           false
         )`;

  // The first query proves these relations are present and selectable before
  // this exact-profile query names them. The candidate stamp is written only
  // after upstream hardening completes; the remaining checks catch a stale,
  // remapped, disabled, or under-granted projection surface.
  const yutabase = await pool.query<DatabaseReadinessRow>(
    `WITH capability_roles AS (
       SELECT
         (
           max(oid::bigint) FILTER (WHERE rolname = 'yu_reader')
         )::oid AS reader_oid,
         (
           max(oid::bigint) FILTER (WHERE rolname = 'yu_writer')
         )::oid AS writer_oid,
         (
           max(oid::bigint) FILTER (WHERE rolname = 'yu_lexicographer')
         )::oid AS lexicographer_oid,
         (
           max(oid::bigint) FILTER (WHERE rolname = current_user)
         )::oid AS runtime_oid,
         count(*) FILTER (
           WHERE rolname IN ('yu_reader', 'yu_writer', 'yu_lexicographer')
             AND NOT rolcanlogin
             AND NOT rolsuper
             AND NOT rolcreatedb
             AND NOT rolcreaterole
             AND NOT rolreplication
             AND NOT rolbypassrls
         ) AS safe_role_count
       FROM pg_catalog.pg_roles
     ),
     required_trigger(schema_name, table_name, trigger_name) AS (
       VALUES
         ('yu', 'registry', 'registry_validate_physical_mapping'),
         ('yu', 'threads', 'threads_reserve_id'),
         ('yu', 'threads', 'threads_validate'),
         ('yu', 'threads', 'threads_immutable'),
         ('yu', 'threads', 'rewardspro_projection_thread_scope'),
         ('commerce', 'events', 'commerce_events_immutable'),
         ('commerce', 'events', 'commerce_events_yu_delete_guard'),
         ('commerce', 'orders', 'commerce_orders_yu_delete_guard'),
         ('commerce', 'line_items', 'commerce_line_items_yu_delete_guard')
     ),
     protected_relation(schema_name, table_name) AS (
       VALUES ${protectedRelationValues}
     ),
     forbidden_privilege(schema_name, table_name, privilege) AS (
       VALUES ${forbiddenPrivilegeValues}
     )
     SELECT
       EXISTS (
         SELECT 1
         FROM yu.standard_meta
         WHERE singleton
           AND standard = 'YUTABASE'
           AND profile = 'postgres'
           AND version = '0.1.0-candidate.1'
           AND revision = 4
           AND capabilities = ARRAY[
             'row-claims',
             'logical-physical-registry',
             'word-version-pinning',
             'global-thread-id-ledger',
             'endpoint-existence-on-insert',
             'concurrency-safe-to-one',
             'role-scoped-functions'
           ]::text[]
       )
       AND (
         SELECT
           safe_role_count = 3
           AND writer_oid IS NOT NULL
           AND reader_oid IS NOT NULL
           AND lexicographer_oid IS NOT NULL
           AND runtime_oid IS NOT NULL
           AND COALESCE(
             pg_catalog.pg_has_role(writer_oid, reader_oid, 'MEMBER'),
             false
           )
           AND EXISTS (
             SELECT 1
             FROM pg_catalog.pg_auth_members membership
             WHERE membership.member = writer_oid
               AND membership.roleid = reader_oid
               AND NOT membership.admin_option
               AND membership.inherit_option
               AND membership.set_option
           )
           AND EXISTS (
             SELECT 1
             FROM pg_catalog.pg_auth_members membership
             WHERE membership.member = lexicographer_oid
               AND membership.roleid = reader_oid
               AND NOT membership.admin_option
               AND membership.inherit_option
               AND membership.set_option
           )
           AND ${runtimeCapabilityBoundary}
         FROM capability_roles
       )
       AND NOT EXISTS (
         SELECT 1
         FROM capability_roles roles
         JOIN pg_catalog.pg_auth_members membership
           ON membership.member IN (
             roles.reader_oid,
             roles.writer_oid,
             roles.lexicographer_oid
           )
         WHERE NOT (
           membership.roleid = roles.reader_oid
           AND membership.member IN (
             roles.writer_oid,
             roles.lexicographer_oid
           )
           AND NOT membership.admin_option
           AND membership.inherit_option
           AND membership.set_option
         )
       )
       AND EXISTS (
         SELECT 1
         FROM pg_catalog.pg_roles
         WHERE rolname = current_user
           AND rolcanlogin
           AND NOT rolsuper
           AND NOT rolcreatedb
           AND NOT rolcreaterole
           AND NOT rolreplication
           AND NOT rolbypassrls
       )
       AND NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_roles elevated
         WHERE (
           elevated.rolsuper
           OR elevated.rolcreatedb
           OR elevated.rolcreaterole
           OR elevated.rolreplication
           OR elevated.rolbypassrls
         )
         AND pg_catalog.pg_has_role(current_user, elevated.oid, 'MEMBER')
       )
       AND NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_database database
         WHERE database.datname = current_database()
           AND pg_catalog.pg_has_role(
             current_user,
             database.datdba,
             'MEMBER'
           )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_namespace namespace
         WHERE namespace.nspname IN ('public', 'commerce', 'yu', 'via')
           AND pg_catalog.pg_has_role(
             current_user,
             namespace.nspowner,
             'MEMBER'
           )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM protected_relation protected
         JOIN pg_catalog.pg_namespace namespace
           ON namespace.nspname = protected.schema_name
         JOIN pg_catalog.pg_class relation
           ON relation.relnamespace = namespace.oid
          AND relation.relname = protected.table_name
         WHERE pg_catalog.pg_has_role(
           current_user,
           relation.relowner,
           'MEMBER'
         )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM forbidden_privilege forbidden
         WHERE COALESCE(
           has_table_privilege(
             current_user,
             to_regclass(
               quote_ident(forbidden.schema_name)
               || '.'
               || quote_ident(forbidden.table_name)
             ),
             forbidden.privilege
           ),
           false
         )
       )
       AND EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc routine
         JOIN pg_catalog.pg_namespace namespace
           ON namespace.oid = routine.pronamespace
         WHERE routine.oid = to_regprocedure(
           'public.rp_ingest_shopify_event(uuid,text,text,text,text,jsonb,timestamptz,boolean)'
         )
           AND namespace.nspname = 'public'
           AND routine.prosecdef
           AND routine.proconfig @> ARRAY[
             'search_path=pg_catalog',
             'row_security=off'
           ]::text[]
           AND NOT pg_catalog.pg_has_role(
             current_user,
             routine.proowner,
             'MEMBER'
           )
       )
       AND ${runtimeIngestFunctionBoundary}
       AND NOT COALESCE(
         has_database_privilege(current_user, current_database(), 'CREATE'),
         false
       )
       AND NOT COALESCE(
         has_schema_privilege(
           current_user,
           to_regnamespace('public'),
           'CREATE'
         ),
         false
       )
       AND NOT COALESCE(
         has_schema_privilege(
           current_user,
           to_regnamespace('commerce'),
           'CREATE'
         ),
         false
       )
       AND NOT COALESCE(
         has_schema_privilege(current_user, to_regnamespace('yu'), 'CREATE'),
         false
       )
       AND EXISTS (
         SELECT 1
         FROM yu.registry
         WHERE book = 'commerce'
           AND deck = 'events'
           AND id_col = 'id'
           AND at_col = 'at'
           AND by_col = 'by'
           AND how_col = 'how'
           AND src_col = 'src'
           AND native
           AND physical_schema = 'commerce'
           AND physical_table = 'events'
       )
       AND EXISTS (
         SELECT 1
         FROM yu.registry
         WHERE book = 'commerce'
           AND deck = 'orders'
           AND id_col = 'id'
           AND at_col = 'at'
           AND by_col = 'by'
           AND how_col = 'how'
           AND src_col = 'src'
           AND native
           AND physical_schema = 'commerce'
           AND physical_table = 'orders'
       )
       AND EXISTS (
         SELECT 1
         FROM yu.registry
         WHERE book = 'commerce'
           AND deck = 'line_items'
           AND id_col = 'id'
           AND at_col = 'at'
           AND by_col = 'by'
           AND how_col = 'how'
           AND src_col = 'src'
           AND native
           AND physical_schema = 'commerce'
           AND physical_table = 'line_items'
       )
       AND EXISTS (
         SELECT 1
         FROM yu.lexicon
         WHERE word = 'derived_from'
           AND from_deck = 'commerce/orders'
           AND to_deck = 'commerce/events'
           AND to_one
           AND status = 'live'
           AND how = 'declared'
       )
       AND EXISTS (
         SELECT 1
         FROM yu.lexicon
         WHERE word = 'contains'
           AND from_deck = 'commerce/orders'
           AND to_deck = 'commerce/line_items'
           AND NOT to_one
           AND status = 'live'
           AND how = 'declared'
       )
       AND (
         SELECT array_agg(word ORDER BY word)
         FROM yu.lexicon
         WHERE status = 'live'
       ) = ARRAY['contains', 'derived_from']::text[]
       AND NOT EXISTS (
         SELECT 1
         FROM required_trigger required
         WHERE NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_trigger trigger
           JOIN pg_catalog.pg_class relation
             ON relation.oid = trigger.tgrelid
           JOIN pg_catalog.pg_namespace namespace
             ON namespace.oid = relation.relnamespace
           WHERE namespace.nspname = required.schema_name
             AND relation.relname = required.table_name
             AND trigger.tgname = required.trigger_name
             AND NOT trigger.tgisinternal
             AND trigger.tgenabled = 'O'
         )
       ) AS ready`,
  );

  if (yutabase.rows[0]?.ready !== true) {
    throw new DatabaseReadinessError(
      "PostgreSQL is missing the exact hardened YUTABASE projection binding",
    );
  }
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
