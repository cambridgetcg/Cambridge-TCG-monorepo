import { fileURLToPath } from "node:url";

import { ConfigError, loadDatabaseConfig } from "./config.js";
import { createDatabasePool } from "./db.js";
import { createLogger } from "./logger.js";
import { runMigrations } from "./migrations.js";

async function main(): Promise<void> {
  const logger = createLogger("info");
  let database;
  try {
    database = await loadDatabaseConfig();
  } catch (error) {
    logger.fatal(
      {
        reason: error instanceof ConfigError ? error.message : "unknown",
      },
      "migration configuration failed",
    );
    process.exitCode = 1;
    return;
  }

  const pool = createDatabasePool(database);
  const migrationsDirectory = fileURLToPath(
    new URL("../migrations", import.meta.url),
  );
  try {
    const result = await runMigrations(pool, migrationsDirectory);
    logger.info(
      {
        appliedCount: result.applied.length,
        existingCount: result.existing.length,
      },
      "database migrations complete",
    );
  } catch (error) {
    logger.fatal({ err: error }, "database migrations failed");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
