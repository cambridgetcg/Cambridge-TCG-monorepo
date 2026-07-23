import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import type { Logger } from "pino";
import type pg from "pg";

import {
  ConfigError,
  loadWorkerConfig,
  type WorkerConfig,
} from "./config.js";
import { createDatabasePool } from "./db.js";
import { createLogger } from "./logger.js";
import type { WorkerProbeQueueMessage } from "./outbox.js";
import { abortableDelay, runWorkerStartupChecks } from "./worker-service.js";
import { PostgresWorkerProbeStore } from "./worker-probe-store.js";

interface ProbeStore {
  create(probeId: string, lifetimeSeconds: number): Promise<void>;
  delete(probeId: string): Promise<void>;
  deleteExpired(): Promise<void>;
  isAcknowledged(probeId: string): Promise<boolean>;
}

interface WorkerProbeOptions {
  config: WorkerConfig & { awsRegion: string; sqsQueueUrl: string };
  logger: Pick<Logger, "info">;
  pool: Pick<pg.Pool, "query">;
  probeStore: ProbeStore;
  sqs: SQSClient;
}

export class WorkerProbeTimeoutError extends Error {
  override readonly name = "WorkerProbeTimeoutError";
}

export async function runWorkerProbe(
  options: WorkerProbeOptions,
): Promise<void> {
  await runWorkerStartupChecks({
    pool: options.pool,
    queueUrl: options.config.sqsQueueUrl,
    sqs: options.sqs,
  });
  await options.probeStore.deleteExpired();

  const probeId = randomUUID();
  const lifetimeSeconds = Math.max(
    300,
    Math.ceil(options.config.workerProbeTimeoutMs / 1_000) +
      options.config.workerVisibilityTimeoutSeconds * 2,
  );
  let queued = false;
  await options.probeStore.create(probeId, lifetimeSeconds);

  try {
    const message: WorkerProbeQueueMessage = {
      probeId,
      schemaVersion: 1,
      type: "probe",
    };
    const fifoFields = options.config.sqsQueueUrl.endsWith(".fifo")
      ? {
          MessageDeduplicationId: probeId,
          MessageGroupId: "worker-probe",
        }
      : {};
    await options.sqs.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(message),
        QueueUrl: options.config.sqsQueueUrl,
        ...fifoFields,
      }),
    );
    queued = true;

    const deadline = Date.now() + options.config.workerProbeTimeoutMs;
    const waitController = new AbortController();
    while (Date.now() < deadline) {
      if (await options.probeStore.isAcknowledged(probeId)) {
        options.logger.info({ probeId }, "worker end-to-end probe passed");
        return;
      }
      await abortableDelay(
        Math.min(500, Math.max(1, deadline - Date.now())),
        waitController.signal,
      );
    }
    throw new WorkerProbeTimeoutError(
      "Worker did not acknowledge the probe before the deployment deadline",
    );
  } catch (error) {
    // If SQS never accepted the message, there is no consumer race and the row
    // can be removed immediately. Once queued, it remains valid until expiry so
    // a delayed delivery cannot be mistaken for an unsupported/poison message.
    if (!queued) {
      try {
        await options.probeStore.delete(probeId);
      } catch {
        // Preserve the original failure. The next probe removes expired rows.
      }
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const bootstrapLogger = createLogger("info");
  let config;
  try {
    config = await loadWorkerConfig();
    if (!config.sqsQueueUrl || !config.awsRegion) {
      throw new ConfigError(
        "SQS_QUEUE_URL and AWS_REGION are required by worker:probe",
      );
    }
  } catch (error) {
    bootstrapLogger.fatal(
      {
        reason: error instanceof ConfigError ? error.message : "unknown",
      },
      "worker probe configuration failed",
    );
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(config.logLevel);
  const pool = createDatabasePool(config.database);
  const sqs = new SQSClient({ region: config.awsRegion });
  try {
    await runWorkerProbe({
      config: {
        ...config,
        awsRegion: config.awsRegion,
        sqsQueueUrl: config.sqsQueueUrl,
      },
      logger,
      pool,
      probeStore: new PostgresWorkerProbeStore(pool),
      sqs,
    });
  } catch (error) {
    logger.fatal({ err: error }, "worker end-to-end probe failed");
    process.exitCode = 1;
  } finally {
    sqs.destroy();
    await pool.end();
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}
