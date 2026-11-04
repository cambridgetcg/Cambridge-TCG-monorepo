/**
 * Database client
 *
 * One typed PrismaClient on plain Postgres. Production is Supabase, reached
 * through the Supavisor transaction pooler (REWARDS_DATABASE_URL, port 6543);
 * migrations use the session-mode REWARDS_DIRECT_URL through
 * scripts/prisma-tls.ts. The tables live in schema `rewards` (`?schema=`).
 *
 * The connection goes through @prisma/adapter-pg so that TLS is configured
 * in code, verified against the bundled Supabase root CA
 * (db/database-connection.server.ts). The pool is handed to Vercel's
 * attachDatabasePool, which keeps a Fluid compute instance alive until its
 * idle connections have closed.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { attachDatabasePool } from "@vercel/functions";
import pg from "pg";
import { databaseConnectionConfig } from "./db/database-connection.server";

const LOG_PREFIX = "[db.server]";

export function createPrismaClient(url = process.env.REWARDS_DATABASE_URL): PrismaClient {
  if (!url) {
    throw new Error(`${LOG_PREFIX} REWARDS_DATABASE_URL is not set`);
  }
  const { pool: poolConfig, schema } = databaseConnectionConfig(url);
  const pool = new pg.Pool(poolConfig);
  attachDatabasePool(pool);
  const adapter = new PrismaPg(pool, {
    schema,
    onPoolError: (error) => {
      console.error(`${LOG_PREFIX} idle connection error:`, error.message);
    },
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["error"],
  });
}

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma: PrismaClient = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

/** Schema the app's tables live in (REWARDS_DATABASE_URL `?schema=`), for raw SQL. */
export const databaseSchema = databaseConnectionConfig(process.env.REWARDS_DATABASE_URL ?? "").schema;

export default prisma;
export { prisma as db };
