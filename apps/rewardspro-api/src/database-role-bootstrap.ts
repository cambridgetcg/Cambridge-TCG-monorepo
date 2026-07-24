import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

import type pg from "pg";

import type { DatabaseConfig } from "./config.js";
import { checkDatabase, createDatabasePool } from "./db.js";
import type { MigrationFile } from "./migrations.js";

// Share the migration runner's lock so schema and privilege maintenance cannot
// overlap even when two independent release tasks are launched.
const ROLE_BOOTSTRAP_LOCK_ID = "827403190224";
const PASSWORD_PATTERN = /^[A-Za-z0-9_-]{64}$/;
const ADMIN_ROLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]{2,62}$/;

export interface RuntimeDatabaseEndpoint {
  database: string;
  host: string;
  port: number;
  sslRootCert?: string;
}

export interface RuntimeDatabaseRoles {
  api: string;
  worker: string;
}

export interface RuntimeSecretStore {
  readCurrent(secretArn: string): Promise<string | undefined>;
  writeCurrent(secretArn: string, secretValue: string): Promise<void>;
}

export interface DatabaseRoleBootstrapOptions {
  adminPool: Pick<pg.Pool, "connect">;
  adminUsername: string;
  apiSecretArn: string;
  endpoint: RuntimeDatabaseEndpoint;
  migrationPlan: readonly MigrationFile[];
  passwordFactory?: (role: keyof RuntimeDatabaseRoles) => string;
  requireTls: boolean;
  roles?: RuntimeDatabaseRoles;
  runtimePoolFactory?: RuntimePoolFactory;
  secretStore: RuntimeSecretStore;
  workerSecretArn: string;
}

export interface DatabaseRoleBootstrapResult {
  createdSecretVersions: Array<keyof RuntimeDatabaseRoles>;
  reusedSecretVersions: Array<keyof RuntimeDatabaseRoles>;
}

interface RuntimeCredential {
  password: string;
  role: keyof RuntimeDatabaseRoles;
  username: string;
}

interface RuntimePool {
  end(): Promise<void>;
  query: pg.Pool["query"];
}

type RuntimePoolFactory = (
  runtime: keyof RuntimeDatabaseRoles,
  config: DatabaseConfig,
) => RuntimePool;

interface AdminInspectionRow extends pg.QueryResultRow {
  administrator: string;
  database_name: string;
  read_only: boolean;
  server_version_num: number;
  tls: boolean;
}

interface LedgerRow extends pg.QueryResultRow {
  checksum_sha256: string;
  version: string;
}

interface UnexpectedMembershipRow extends pg.QueryResultRow {
  granted_role: string;
  runtime_role: string;
}

interface RuntimeDatabaseSecret {
  dbname: string;
  engine: "postgres";
  host: string;
  managedBy: "rewardspro-runtime-bootstrap";
  password: string;
  port: number;
  schemaVersion: 1;
  username: string;
}

const DEFAULT_ROLES: RuntimeDatabaseRoles = {
  api: "rewardspro_api",
  worker: "rewardspro_worker",
};

export async function bootstrapDatabaseRoles(
  options: DatabaseRoleBootstrapOptions,
): Promise<DatabaseRoleBootstrapResult> {
  const roles = options.roles ?? DEFAULT_ROLES;
  validateBootstrapInputs(options, roles);

  const admin = await options.adminPool.connect();
  try {
    await admin.query("SELECT pg_advisory_lock($1::bigint)", [
      ROLE_BOOTSTRAP_LOCK_ID,
    ]);
    await assertAdminTarget(admin, options);
    await assertMigrationLedger(admin, options.migrationPlan);
    await assertNoUnexpectedMemberships(admin, roles);

    // Secret inspection and generation intentionally happen inside the shared
    // PostgreSQL lock. Otherwise two tasks can both observe empty placeholders
    // and leave AWSCURRENT credentials disagreeing with the final role password.
    const passwordFactory =
      options.passwordFactory ?? (() => randomBytes(48).toString("base64url"));
    const secretInputs = await Promise.all([
      resolveCredential({
        endpoint: options.endpoint,
        passwordFactory,
        role: "api",
        secretArn: options.apiSecretArn,
        secretStore: options.secretStore,
        username: roles.api,
      }),
      resolveCredential({
        endpoint: options.endpoint,
        passwordFactory,
        role: "worker",
        secretArn: options.workerSecretArn,
        secretStore: options.secretStore,
        username: roles.worker,
      }),
    ]);
    const [apiInput, workerInput] = secretInputs;
    if (!apiInput || !workerInput) {
      throw new Error("Runtime database credential resolution was incomplete");
    }
    const existingRoles = await assertRoleSecretPairing(
      admin,
      roles,
      apiInput.existing,
      workerInput.existing,
    );

    if (
      apiInput.existing &&
      workerInput.existing &&
      existingRoles.has(roles.api) &&
      existingRoles.has(roles.worker)
    ) {
      try {
        await verifyRuntimeCredentials(
          options.endpoint,
          apiInput.credential,
          workerInput.credential,
          options.runtimePoolFactory ?? defaultRuntimePoolFactory,
        );
        return {
          createdSecretVersions: [],
          reusedSecretVersions: ["api", "worker"],
        };
      } catch {
        // A managed partial run or permission drift is converged below. Secret
        // values remain authoritative and are never rotated automatically.
      }
    }

    // Publish credentials before changing PostgreSQL. Services are held at zero
    // capacity and the deployment cannot activate on task failure. If the task
    // stops after this point, a retry reuses AWSCURRENT and converges the roles.
    const createdSecretVersions: Array<keyof RuntimeDatabaseRoles> = [];
    const reusedSecretVersions: Array<keyof RuntimeDatabaseRoles> = [];
    for (const input of secretInputs) {
      if (input.existing) {
        reusedSecretVersions.push(input.credential.role);
        continue;
      }
      await options.secretStore.writeCurrent(
        input.secretArn,
        serializeRuntimeDatabaseSecret(options.endpoint, input.credential),
      );
      createdSecretVersions.push(input.credential.role);
    }

    await admin.query("BEGIN");
    try {
      await applyRuntimeRoles(
        admin,
        options.endpoint.database,
        roles,
        apiInput.credential.password,
        workerInput.credential.password,
      );
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }

    await verifyRuntimeCredentials(
      options.endpoint,
      apiInput.credential,
      workerInput.credential,
      options.runtimePoolFactory ?? defaultRuntimePoolFactory,
    );

    return { createdSecretVersions, reusedSecretVersions };
  } finally {
    try {
      await admin.query("SELECT pg_advisory_unlock($1::bigint)", [
        ROLE_BOOTSTRAP_LOCK_ID,
      ]);
    } finally {
      admin.release();
    }
  }
}

export function parseRuntimeDatabaseSecret(
  rawSecret: string,
  endpoint: RuntimeDatabaseEndpoint,
  username: string,
): RuntimeDatabaseSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSecret) as unknown;
  } catch {
    throw new Error("Runtime database secret must be a JSON object");
  }
  if (!isRecord(parsed)) {
    throw new Error("Runtime database secret must be a JSON object");
  }

  const candidate = {
    dbname: parsed.dbname,
    engine: parsed.engine,
    host: parsed.host,
    managedBy: parsed.managedBy,
    password: parsed.password,
    port: parsed.port,
    schemaVersion: parsed.schemaVersion,
    username: parsed.username,
  };
  const expectedKeys = [
    "dbname",
    "engine",
    "host",
    "managedBy",
    "password",
    "port",
    "schemaVersion",
    "username",
  ];
  if (
    Object.keys(parsed).sort().join("\n") !== expectedKeys.join("\n") ||
    candidate.engine !== "postgres" ||
    candidate.host !== endpoint.host ||
    candidate.managedBy !== "rewardspro-runtime-bootstrap" ||
    candidate.port !== endpoint.port ||
    candidate.dbname !== endpoint.database ||
    candidate.schemaVersion !== 1 ||
    candidate.username !== username ||
    typeof candidate.password !== "string" ||
    !PASSWORD_PATTERN.test(candidate.password)
  ) {
    throw new Error(
      "Runtime database secret does not match the expected endpoint and role",
    );
  }

  return candidate as RuntimeDatabaseSecret;
}

export function postgresScramVerifier(
  password: string,
  salt: Buffer = randomBytes(16),
): string {
  if (!PASSWORD_PATTERN.test(password) || salt.length < 16) {
    throw new Error("Cannot create a PostgreSQL verifier from invalid input");
  }
  const iterations = 4096;
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest("base64");
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key")
    .digest("base64");
  return [
    `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}`,
    `${storedKey}:${serverKey}`,
  ].join("$");
}

function validateBootstrapInputs(
  options: DatabaseRoleBootstrapOptions,
  roles: RuntimeDatabaseRoles,
): void {
  if (
    !ADMIN_ROLE_NAME_PATTERN.test(options.adminUsername) ||
    !DATABASE_NAME_PATTERN.test(options.endpoint.database) ||
    !ROLE_NAME_PATTERN.test(roles.api) ||
    !ROLE_NAME_PATTERN.test(roles.worker)
  ) {
    throw new Error("Database bootstrap identifiers are invalid");
  }
  if (
    roles.api === roles.worker ||
    options.apiSecretArn === options.workerSecretArn
  ) {
    throw new Error("API and worker database identities must be distinct");
  }
  if (
    options.endpoint.host.trim() !== options.endpoint.host ||
    options.endpoint.host.length === 0 ||
    !Number.isInteger(options.endpoint.port) ||
    options.endpoint.port < 1 ||
    options.endpoint.port > 65_535
  ) {
    throw new Error("Database bootstrap endpoint is invalid");
  }
  if (options.requireTls && !options.endpoint.sslRootCert) {
    throw new Error(
      "Production database bootstrap requires a TLS root certificate",
    );
  }
  if (options.migrationPlan.length === 0) {
    throw new Error("Database bootstrap requires a non-empty migration plan");
  }
  const versions = new Set(
    options.migrationPlan.map((migration) => migration.version),
  );
  if (versions.size !== options.migrationPlan.length) {
    throw new Error(
      "Database bootstrap migration plan contains duplicate versions",
    );
  }
}

async function resolveCredential(options: {
  endpoint: RuntimeDatabaseEndpoint;
  passwordFactory: (role: keyof RuntimeDatabaseRoles) => string;
  role: keyof RuntimeDatabaseRoles;
  secretArn: string;
  secretStore: RuntimeSecretStore;
  username: string;
}): Promise<{
  credential: RuntimeCredential;
  existing: boolean;
  secretArn: string;
}> {
  const current = await options.secretStore.readCurrent(options.secretArn);
  const password =
    current === undefined
      ? options.passwordFactory(options.role)
      : parseRuntimeDatabaseSecret(current, options.endpoint, options.username)
          .password;
  if (!PASSWORD_PATTERN.test(password)) {
    throw new Error(
      "Runtime database passwords must be 64-character base64url values",
    );
  }
  return {
    credential: {
      password,
      role: options.role,
      username: options.username,
    },
    existing: current !== undefined,
    secretArn: options.secretArn,
  };
}

async function assertAdminTarget(
  client: Pick<pg.PoolClient, "query">,
  options: DatabaseRoleBootstrapOptions,
): Promise<void> {
  const result = await client.query<AdminInspectionRow>(
    `SELECT
       current_database() AS database_name,
       current_user AS administrator,
       current_setting('transaction_read_only') = 'on' AS read_only,
       current_setting('server_version_num')::integer AS server_version_num,
       COALESCE(
         (
           SELECT connection.ssl
           FROM pg_catalog.pg_stat_ssl connection
           WHERE connection.pid = pg_catalog.pg_backend_pid()
         ),
         false
       ) AS tls`,
  );
  const inspection = result.rows[0];
  if (
    !inspection ||
    inspection.database_name !== options.endpoint.database ||
    inspection.administrator !== options.adminUsername ||
    inspection.read_only ||
    inspection.server_version_num < 160_000 ||
    inspection.server_version_num >= 170_000 ||
    (options.requireTls && !inspection.tls)
  ) {
    throw new Error("Database role bootstrap target failed its safety checks");
  }
}

async function assertMigrationLedger(
  client: Pick<pg.PoolClient, "query">,
  migrationPlan: readonly MigrationFile[],
): Promise<void> {
  const result = await client.query<LedgerRow>(
    `SELECT version, btrim(checksum_sha256) AS checksum_sha256
     FROM public.rp_schema_migration
     ORDER BY version`,
  );
  const expected = new Map(
    migrationPlan.map((migration) => [migration.version, migration.checksum]),
  );
  if (result.rows.length !== expected.size) {
    throw new Error(
      "Database role bootstrap requires the exact migration ledger",
    );
  }
  for (const row of result.rows) {
    if (expected.get(row.version) !== row.checksum_sha256) {
      throw new Error(
        "Database role bootstrap requires the exact migration ledger",
      );
    }
  }
}

async function assertNoUnexpectedMemberships(
  client: Pick<pg.PoolClient, "query">,
  roles: RuntimeDatabaseRoles,
): Promise<void> {
  const result = await client.query<UnexpectedMembershipRow>(
    `SELECT
       member.rolname AS runtime_role,
       granted.rolname AS granted_role
     FROM pg_catalog.pg_auth_members membership
     JOIN pg_catalog.pg_roles member ON member.oid = membership.member
     JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
     WHERE member.rolname = ANY($1::text[])
       AND NOT (
         (member.rolname = $2 AND granted.rolname = 'yu_reader')
         OR (member.rolname = $3 AND granted.rolname = 'yu_writer')
       )`,
    [[roles.api, roles.worker], roles.api, roles.worker],
  );
  if (result.rows.length > 0) {
    throw new Error(
      "Runtime database role has an unexpected capability membership",
    );
  }
}

async function assertRoleSecretPairing(
  client: Pick<pg.PoolClient, "query">,
  roles: RuntimeDatabaseRoles,
  apiSecretExists: boolean,
  workerSecretExists: boolean,
): Promise<Set<string>> {
  const result = await client.query<{ rolname: string }>(
    `SELECT rolname
     FROM pg_catalog.pg_roles
     WHERE rolname = ANY($1::text[])`,
    [[roles.api, roles.worker]],
  );
  const existingRoles = new Set(result.rows.map((row) => row.rolname));
  if (
    (!apiSecretExists && existingRoles.has(roles.api)) ||
    (!workerSecretExists && existingRoles.has(roles.worker))
  ) {
    throw new Error(
      "Existing runtime database role has no managed credential secret",
    );
  }
  return existingRoles;
}

async function applyRuntimeRoles(
  client: Pick<pg.PoolClient, "query">,
  database: string,
  roles: RuntimeDatabaseRoles,
  apiPassword: string,
  workerPassword: string,
): Promise<void> {
  const api = quoteIdentifier(roles.api);
  const worker = quoteIdentifier(roles.worker);
  const databaseIdentifier = quoteIdentifier(database);
  const databaseLiteral = quoteLiteral(database);
  // PostgreSQL receives only salted SCRAM verifiers. Even if statement logging
  // is enabled later, the clear credentials never enter a SQL statement.
  const apiPasswordVerifier = quoteLiteral(postgresScramVerifier(apiPassword));
  const workerPasswordVerifier = quoteLiteral(
    postgresScramVerifier(workerPassword),
  );

  await client.query(`
    DO $role_bootstrap$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${quoteLiteral(roles.api)}
      ) THEN
        CREATE ROLE ${api};
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${quoteLiteral(roles.worker)}
      ) THEN
        CREATE ROLE ${worker};
      END IF;
    END
    $role_bootstrap$;

    ALTER ROLE ${api}
      WITH LOGIN INHERIT PASSWORD ${apiPasswordVerifier}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    ALTER ROLE ${worker}
      WITH LOGIN INHERIT PASSWORD ${workerPasswordVerifier}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

    ALTER ROLE ${api}
      IN DATABASE ${databaseIdentifier} SET search_path = pg_catalog;
    ALTER ROLE ${worker}
      IN DATABASE ${databaseIdentifier} SET search_path = pg_catalog;

    REVOKE CONNECT, TEMPORARY ON DATABASE ${databaseIdentifier}
      FROM PUBLIC;
    REVOKE ALL PRIVILEGES ON DATABASE ${databaseIdentifier}
      FROM ${api}, ${worker};
    GRANT CONNECT ON DATABASE ${databaseIdentifier}
      TO ${api}, ${worker};
    REVOKE ALL PRIVILEGES ON SCHEMA public, commerce, yu
      FROM PUBLIC;
    REVOKE ALL PRIVILEGES ON SCHEMA public, commerce, yu
      FROM ${api}, ${worker};
    GRANT USAGE ON SCHEMA public, commerce
      TO ${api}, ${worker};
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, commerce, yu
      FROM ${api}, ${worker};
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, commerce, yu
      FROM ${api}, ${worker};
    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public, commerce, yu
      FROM ${api}, ${worker};

    REVOKE yu_reader, yu_writer, yu_lexicographer FROM ${api}, ${worker};
    GRANT yu_reader TO ${api}
      WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
    GRANT yu_writer TO ${worker}
      WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;

    GRANT EXECUTE ON FUNCTION public.rp_ingest_shopify_event(
      uuid,
      text,
      text,
      text,
      text,
      jsonb,
      timestamptz,
      boolean
    ) TO ${api};

    GRANT SELECT ON TABLE public.rp_commerce_connection
      TO ${worker};
    GRANT SELECT ON TABLE commerce.events
      TO ${worker};
    GRANT SELECT, DELETE ON TABLE commerce.event_payloads
      TO ${worker};
    GRANT SELECT, UPDATE ON TABLE public.rp_commerce_event_state
      TO ${worker};
    GRANT SELECT, INSERT ON TABLE commerce.orders, commerce.line_items
      TO ${worker};
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rp_worker_probe
      TO ${worker};

    SELECT pg_catalog.set_config(
      'rewardspro.bootstrap.database',
      ${databaseLiteral},
      true
    );
  `);
}

async function verifyRuntimeCredentials(
  endpoint: RuntimeDatabaseEndpoint,
  api: RuntimeCredential,
  worker: RuntimeCredential,
  poolFactory: RuntimePoolFactory,
): Promise<void> {
  const apiPool = poolFactory("api", runtimeDatabaseConfig(endpoint, api));
  const workerPool = poolFactory(
    "worker",
    runtimeDatabaseConfig(endpoint, worker),
  );
  try {
    await checkDatabase(apiPool, "api");
    await checkDatabase(workerPool, "worker");
  } finally {
    await Promise.allSettled([apiPool.end(), workerPool.end()]);
  }
}

function runtimeDatabaseConfig(
  endpoint: RuntimeDatabaseEndpoint,
  credential: RuntimeCredential,
): DatabaseConfig {
  const url = new URL("postgresql://placeholder");
  url.hostname = endpoint.host;
  url.port = String(endpoint.port);
  url.username = credential.username;
  url.password = credential.password;
  url.pathname = `/${endpoint.database}`;
  if (endpoint.sslRootCert) {
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.set("sslrootcert", endpoint.sslRootCert);
  }
  return {
    connectTimeoutMs: 5_000,
    databaseUrl: url.toString(),
    poolMax: 2,
    queryTimeoutMs: 10_000,
    source: "secrets-manager",
  };
}

function defaultRuntimePoolFactory(
  _runtime: keyof RuntimeDatabaseRoles,
  config: DatabaseConfig,
): RuntimePool {
  return createDatabasePool(config);
}

function serializeRuntimeDatabaseSecret(
  endpoint: RuntimeDatabaseEndpoint,
  credential: RuntimeCredential,
): string {
  return JSON.stringify({
    dbname: endpoint.database,
    engine: "postgres",
    host: endpoint.host,
    managedBy: "rewardspro-runtime-bootstrap",
    password: credential.password,
    port: endpoint.port,
    schemaVersion: 1,
    username: credential.username,
  } satisfies RuntimeDatabaseSecret);
}

function quoteIdentifier(value: string): string {
  if (!DATABASE_NAME_PATTERN.test(value)) {
    throw new Error("Database bootstrap identifier is invalid");
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
