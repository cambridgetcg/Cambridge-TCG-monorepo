/**
 * Database connection settings, shared by the app's client (db.server.ts)
 * and the migration bridge (scripts/prisma-tls.ts). Pure: no client is
 * created here.
 *
 * TLS is set here, in code: every non-loopback host must present a
 * certificate that chains to the Supabase root CA bundled in
 * database-tls.server.ts, with hostname verification on. There is no switch
 * to turn verification off; only local loopback databases (dev, CI) connect
 * without TLS.
 */
import type { PoolConfig } from "pg";
import { SUPABASE_ROOT_CA_2021 } from "./database-tls.server";

const LOG_PREFIX = "[database]";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export interface DatabaseConnectionConfig {
  pool: PoolConfig;
  /** Postgres schema Prisma qualifies its queries with (`?schema=`). */
  schema: string;
}

/**
 * Translate a Prisma-style Postgres URL into pg pool options.
 *
 * The URL is parsed here rather than handed to pg as a connection string,
 * because pg lets URL parameters such as `sslmode` override an explicit `ssl`
 * object. Prisma-only parameters map as follows: `schema` selects the schema,
 * `connection_limit` caps the pool, `connect_timeout` (seconds) bounds
 * connection setup, and `pgbouncer` needs no handling (the adapter does not
 * use named prepared statements).
 */
export function databaseConnectionConfig(databaseUrl: string): DatabaseConnectionConfig {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(`${LOG_PREFIX} database URL is not a valid URL`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${LOG_PREFIX} database URL must be a postgresql:// URL`);
  }

  const params = url.searchParams;
  const host = url.hostname;
  const loopback = LOOPBACK_HOSTS.has(host);
  const sslmode = params.get("sslmode");

  if (!loopback && sslmode === "disable") {
    throw new Error(`${LOG_PREFIX} TLS is required for database host ${host}; remove sslmode=disable`);
  }

  const schema = params.get("schema") || "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`${LOG_PREFIX} database URL schema must be a plain identifier`);
  }

  const connectionLimit = Number(params.get("connection_limit"));
  const connectTimeoutSeconds = Number(params.get("connect_timeout"));

  return {
    schema,
    pool: {
      host,
      port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
      max: Number.isInteger(connectionLimit) && connectionLimit > 0 ? connectionLimit : 10,
      connectionTimeoutMillis:
        connectTimeoutSeconds > 0 ? connectTimeoutSeconds * 1000 : 10_000,
      idleTimeoutMillis: 10_000,
      ssl: loopback
        ? false
        : { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true, servername: host },
    },
  };
}
