/**
 * Database Client
 *
 * One typed PrismaClient on plain Postgres. Production is Supabase, reached
 * through the Supavisor transaction pooler (DATABASE_URL, port 6543);
 * migrations use the session-mode DIRECT_URL (see docs/DATABASE.md).
 *
 * The connection goes through @prisma/adapter-pg so that TLS is configured
 * in code, verified against the bundled Supabase root CA
 * (utils/database-connection.server.ts).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConnectionConfig } from "./utils/database-connection.server";

const LOG_PREFIX = "[db.server]";

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) {
    throw new Error(`${LOG_PREFIX} DATABASE_URL is not set`);
  }
  const { pool, schema } = databaseConnectionConfig(databaseUrl);
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

/** Schema the app's tables live in (DATABASE_URL `?schema=`), for raw SQL. */
export const databaseSchema = databaseConnectionConfig(process.env.DATABASE_URL ?? "").schema;

export default prisma;
export { prisma as db };
