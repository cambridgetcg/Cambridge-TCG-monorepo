import { buildApp } from "./app.js";
import { ConfigError, loadApiConfig } from "./config.js";
import { createDatabasePool } from "./db.js";
import { createLogger } from "./logger.js";
import { CommerceEventInbox } from "./repositories/commerce-event-inbox.js";
import { installShutdownHandlers } from "./shutdown.js";

async function main(): Promise<void> {
  const bootstrapLogger = createLogger("info");
  let config;
  try {
    config = await loadApiConfig();
  } catch (error) {
    bootstrapLogger.fatal(
      {
        reason: error instanceof ConfigError ? error.message : "unknown",
      },
      "API configuration failed",
    );
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(config.logLevel);
  const pool = createDatabasePool(config.database);
  pool.on("error", (error) => {
    logger.error({ err: error }, "idle PostgreSQL client failed");
  });
  const inbox = new CommerceEventInbox(pool);
  const app = buildApp({
    config,
    inbox,
    logger,
    pool,
  });

  const removeShutdownHandlers = installShutdownHandlers({
    graceMs: config.shutdownGraceMs,
    logger,
    name: "rewardspro-api",
    shutdown: async () => {
      await app.close();
      await pool.end();
    },
  });

  try {
    await app.listen({ host: "0.0.0.0", port: config.port });
    logger.info(
      {
        databaseSource: config.database.source,
        port: config.port,
        sqsEnabled: config.sqsQueueUrl !== undefined,
      },
      "RewardsPro API listening",
    );
  } catch (error) {
    removeShutdownHandlers();
    logger.fatal({ err: error }, "API failed to start");
    await app.close();
    await pool.end();
    process.exitCode = 1;
  }
}

void main();
