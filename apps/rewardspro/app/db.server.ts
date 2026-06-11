/**
 * Database Client
 *
 * Two paths exist during the Data API adapter migration:
 *
 *   USE_PRISMA_DRIVER_ADAPTER=true  → real PrismaClient + new SqlDriverAdapter
 *                                     wrapping RDS Data API. Phase 3+ rollout.
 *   else (default)                  → legacy 2425-LOC custom adapter.
 *
 * Both speak the same `db.X.method()` surface, so flipping the flag is a
 * deploy-boundary cut-over with rollback by reverting the env value. Once the
 * new adapter is bedded in, the legacy path and this branch get deleted (one PR
 * after cut-over per the replacement plan).
 */
import { createDataAPIPrismaClient } from "./utils/prisma-data-api-adapter";
import { PrismaClient } from "@prisma/client";
import { PrismaRdsDataApiAdapter } from "./utils/prisma-rds-data-api-adapter.server";

const LOG_PREFIX = "[db.server]";
const USE_DRIVER_ADAPTER = process.env.USE_PRISMA_DRIVER_ADAPTER === "true";

// Use the legacy adapter's return type as our exported surface. Both paths
// (legacy custom adapter + new PrismaClient with driver adapter) satisfy this
// surface; the legacy one was hand-typed to mimic PrismaClient already.
type DbClient = ReturnType<typeof createDataAPIPrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var prisma: DbClient | undefined;
}

console.log(`${LOG_PREFIX} loading (driverAdapter=${USE_DRIVER_ADAPTER})`);

let prisma: DbClient;

try {
  if (global.prisma) {
    prisma = global.prisma;
  } else if (USE_DRIVER_ADAPTER) {
    prisma = createDriverAdapterClient();
  } else {
    prisma = createDataAPIPrismaClient();
  }
} catch (error) {
  console.error(`${LOG_PREFIX} CRITICAL ERROR creating db client:`, error);
  throw error;
}

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

/**
 * Build a real PrismaClient instance bound to our RDS Data API driver adapter.
 * Both adapters are statically imported (Vite bundles everything regardless);
 * the env flag controls which is instantiated at runtime.
 */
function createDriverAdapterClient() {
  const resourceArn = process.env.AURORA_RESOURCE_ARN?.trim();
  const secretArn = process.env.AURORA_SECRET_ARN?.trim();
  const database = process.env.AURORA_DATABASE_NAME?.trim() || "rewardspro";
  const region = process.env.AWS_REGION?.trim() || "eu-north-1";
  const readReplicaArn = process.env.AURORA_READER_RESOURCE_ARN?.trim() || undefined;

  if (!resourceArn || !secretArn) {
    throw new Error(
      `${LOG_PREFIX} USE_PRISMA_DRIVER_ADAPTER=true but AURORA_RESOURCE_ARN / AURORA_SECRET_ARN missing`,
    );
  }

  const adapter = new PrismaRdsDataApiAdapter({
    resourceArn,
    secretArn,
    database,
    region,
    readReplicaArn,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["error"],
  }) as unknown as DbClient;
}

export default prisma;
export { prisma as db };

/** Indicates the legacy custom Data API adapter is in use. */
export const isUsingDataAPI = !USE_DRIVER_ADAPTER;
/** Indicates the new Prisma Driver Adapter path is in use. */
export const isUsingDriverAdapter = USE_DRIVER_ADAPTER;
