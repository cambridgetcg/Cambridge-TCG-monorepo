import { SQSClient } from "@aws-sdk/client-sqs";

import { ConfigError, loadWorkerConfig } from "./config.js";
import { createDatabasePool } from "./db.js";
import { createLogger } from "./logger.js";
import { createSqsOutboxPublisher } from "./outbox.js";
import {
  CommerceEventProcessor,
  PostgresProcessingStore,
} from "./processing.js";
import { installShutdownHandlers } from "./shutdown.js";
import {
  runDatabaseWorker,
  runSqsWorker,
  runWorkerStartupChecks,
} from "./worker-service.js";
import { PostgresWorkerProbeStore } from "./worker-probe-store.js";

async function main(): Promise<void> {
  const bootstrapLogger = createLogger("info");
  let config;
  try {
    config = await loadWorkerConfig();
  } catch (error) {
    bootstrapLogger.fatal(
      {
        reason: error instanceof ConfigError ? error.message : "unknown",
      },
      "worker configuration failed",
    );
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(config.logLevel);
  const pool = createDatabasePool(config.database);
  pool.on("error", (error) => {
    logger.error({ err: error }, "idle PostgreSQL client failed");
  });
  const processor = new CommerceEventProcessor(
    new PostgresProcessingStore(
      pool,
      config.workerVisibilityTimeoutSeconds,
    ),
  );
  const probeStore = new PostgresWorkerProbeStore(pool);
  const abortController = new AbortController();
  const sqs =
    config.sqsQueueUrl && config.awsRegion
      ? new SQSClient({ region: config.awsRegion })
      : undefined;

  try {
    await runWorkerStartupChecks({
      pool,
      ...(sqs && config.sqsQueueUrl
        ? { queueUrl: config.sqsQueueUrl, sqs }
        : {}),
    });
  } catch (error) {
    logger.fatal({ err: error }, "worker startup checks failed");
    sqs?.destroy();
    await pool.end();
    process.exitCode = 1;
    return;
  }

  let workerPromise: Promise<void>;
  if (config.sqsQueueUrl && sqs) {
    const outboxPublisher = createSqsOutboxPublisher(
      pool,
      sqs,
      config.sqsQueueUrl,
      logger,
    );
    workerPromise = runSqsWorker(
      {
        batchSize: config.workerBatchSize,
        logger,
        maxConsecutiveErrors: config.workerMaxConsecutiveErrors,
        outboxPublisher,
        pollMs: config.workerPollMs,
        processor,
        probeStore,
        queueUrl: config.sqsQueueUrl,
        sqs,
        visibilityTimeoutSeconds: config.workerVisibilityTimeoutSeconds,
      },
      abortController.signal,
    );
  } else {
    workerPromise = runDatabaseWorker(
      {
        batchSize: config.workerBatchSize,
        logger,
        maxConsecutiveErrors: config.workerMaxConsecutiveErrors,
        pollMs: config.workerPollMs,
        processor,
        visibilityTimeoutSeconds: config.workerVisibilityTimeoutSeconds,
      },
      abortController.signal,
    );
  }

  const removeShutdownHandlers = installShutdownHandlers({
    graceMs: config.shutdownGraceMs,
    logger,
    name: "rewardspro-worker",
    shutdown: async () => {
      abortController.abort();
      await workerPromise;
      sqs?.destroy();
      await pool.end();
    },
  });

  try {
    await workerPromise;
  } catch (error) {
    removeShutdownHandlers();
    logger.fatal({ err: error }, "worker stopped unexpectedly");
    abortController.abort();
    sqs?.destroy();
    await pool.end();
    process.exitCode = 1;
  }
}

void main();
