import { fileURLToPath } from "node:url";

import { z } from "zod";

import { AwsRuntimeSecretStore } from "./aws-runtime-secret-store.js";
import { loadDatabaseConfig } from "./config.js";
import {
  bootstrapDatabaseRoles,
  type RuntimeDatabaseEndpoint,
} from "./database-role-bootstrap.js";
import { createDatabasePool } from "./db.js";
import { createLogger } from "./logger.js";
import { discoverMigrationPlan } from "./migrations.js";

const BootstrapEnvironmentSchema = z.object({
  API_DATABASE_SECRET_ARN: z.string().trim().min(1),
  AWS_REGION: z.string().trim().min(1),
  DATABASE_URL: z.undefined().optional(),
  DB_SECRET_ARN: z.string().trim().min(1),
  DB_SSL_ROOT_CERT: z.string().trim().min(1),
  NODE_ENV: z.literal("production"),
  REWARDSPRO_DATABASE_ROLE_BOOTSTRAP: z.literal("initial-zero-capacity"),
  WORKER_DATABASE_SECRET_ARN: z.string().trim().min(1),
});

interface ParsedSecretArn {
  accountId: string;
  partition: string;
  region: string;
  resource: string;
}

async function main(): Promise<void> {
  const parsed = BootstrapEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Production database bootstrap configuration is invalid");
  }
  const environment = parsed.data;
  const adminArn = parseSecretArn(environment.DB_SECRET_ARN);
  const apiArn = parseSecretArn(environment.API_DATABASE_SECRET_ARN);
  const workerArn = parseSecretArn(environment.WORKER_DATABASE_SECRET_ARN);
  for (const arn of [adminArn, apiArn, workerArn]) {
    if (
      arn.region !== environment.AWS_REGION ||
      arn.accountId !== adminArn.accountId ||
      arn.partition !== adminArn.partition
    ) {
      throw new Error(
        "Database bootstrap secrets must share one account, partition, and region",
      );
    }
  }
  if (
    !apiArn.resource.includes("/database/api-") ||
    !workerArn.resource.includes("/database/worker-")
  ) {
    throw new Error("Runtime database secret names do not match their roles");
  }

  const database = await loadDatabaseConfig(process.env);
  if (database.source !== "secrets-manager") {
    throw new Error(
      "Production database bootstrap requires the RDS admin secret",
    );
  }
  const databaseUrl = new URL(database.databaseUrl);
  const endpoint = databaseEndpoint(databaseUrl, environment);
  if (
    !endpoint.host
      .toLowerCase()
      .endsWith(`.${environment.AWS_REGION}.rds.amazonaws.com`)
  ) {
    throw new Error("Production database bootstrap requires an RDS endpoint");
  }

  const migrationsDirectory = fileURLToPath(
    new URL("../migrations", import.meta.url),
  );
  const migrationPlan = await discoverMigrationPlan(migrationsDirectory);
  const pool = createDatabasePool(database);
  const logger = createLogger(process.env.LOG_LEVEL ?? "info");
  try {
    const bootstrapResult = await bootstrapDatabaseRoles({
      adminPool: pool,
      adminUsername: decodeURIComponent(databaseUrl.username),
      apiSecretArn: environment.API_DATABASE_SECRET_ARN,
      endpoint,
      migrationPlan,
      requireTls: true,
      secretStore: new AwsRuntimeSecretStore(environment.AWS_REGION),
      workerSecretArn: environment.WORKER_DATABASE_SECRET_ARN,
    });
    logger.info(
      {
        createdSecretVersions: bootstrapResult.createdSecretVersions,
        reusedSecretVersions: bootstrapResult.reusedSecretVersions,
      },
      "least-privilege runtime database roles are ready",
    );
  } finally {
    await pool.end();
  }
}

function databaseEndpoint(
  databaseUrl: URL,
  environment: z.infer<typeof BootstrapEnvironmentSchema>,
): RuntimeDatabaseEndpoint {
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  const port = Number(databaseUrl.port || "5432");
  if (
    database.length === 0 ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    databaseUrl.searchParams.get("sslmode") !== "verify-full"
  ) {
    throw new Error("Production database bootstrap URL is invalid");
  }
  return {
    database,
    host: databaseUrl.hostname,
    port,
    sslRootCert: environment.DB_SSL_ROOT_CERT,
  };
}

function parseSecretArn(value: string): ParsedSecretArn {
  const [arn, partition, service, region, accountId, ...resourceParts] =
    value.split(":");
  const resource = resourceParts.join(":");
  if (
    arn !== "arn" ||
    !partition ||
    service !== "secretsmanager" ||
    !region ||
    !/^\d{12}$/.test(accountId ?? "") ||
    !resource.startsWith("secret:")
  ) {
    throw new Error("Database bootstrap secret ARN is invalid");
  }
  return {
    accountId: accountId ?? "",
    partition,
    region,
    resource,
  };
}

main().catch((error: unknown) => {
  const bootstrapLogger = createLogger("info");
  bootstrapLogger.fatal(
    { err: error },
    "production database role bootstrap failed",
  );
  process.exitCode = 1;
});
