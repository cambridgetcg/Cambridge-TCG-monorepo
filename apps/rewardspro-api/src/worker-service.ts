import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import type { Logger } from "pino";
import type pg from "pg";

import { checkDatabase } from "./db.js";
import {
  type SqsOutboxPublisher,
  type WorkerQueueMessage,
  WorkerQueueMessageSchema,
} from "./outbox.js";
import {
  type CommerceEventProcessor,
  type ProcessByIdResult,
} from "./processing.js";
import {
  WorkerProbeNotDeliverableError,
  type WorkerProbeStore,
} from "./worker-probe-store.js";

export interface WorkerServiceOptions {
  batchSize: number;
  logger: Pick<Logger, "info" | "warn" | "error">;
  maxConsecutiveErrors: number;
  pollMs: number;
  processor: CommerceEventProcessor;
  visibilityTimeoutSeconds: number;
}

export interface SqsWorkerServiceOptions extends WorkerServiceOptions {
  outboxPublisher: SqsOutboxPublisher;
  probeStore: WorkerProbeStore;
  queueUrl: string;
  sqs: SQSClient;
}

export class InvalidWorkerQueueMessageError extends Error {
  override readonly name = "InvalidWorkerQueueMessageError";
}

export class RetryableCommerceEventDeliveryError extends Error {
  override readonly name = "RetryableCommerceEventDeliveryError";
}

export class WorkerLoopUnhealthyError extends Error {
  override readonly name = "WorkerLoopUnhealthyError";

  constructor(
    readonly consecutiveErrors: number,
    options?: ErrorOptions,
  ) {
    super(
      `Worker reached ${consecutiveErrors} consecutive loop errors`,
      options,
    );
  }
}

export async function runWorkerStartupChecks(options: {
  pool: Pick<pg.Pool, "query">;
  queueUrl?: string;
  sqs?: SQSClient;
}): Promise<void> {
  await checkDatabase(options.pool, "worker");
  if (options.sqs === undefined && options.queueUrl === undefined) {
    return;
  }
  if (options.sqs === undefined || options.queueUrl === undefined) {
    throw new Error("SQS client and queue URL must be checked together");
  }

  const result = await options.sqs.send(
    new GetQueueAttributesCommand({
      AttributeNames: ["QueueArn"],
      QueueUrl: options.queueUrl,
    }),
  );
  if (!result.Attributes?.QueueArn) {
    throw new Error("SQS queue attributes did not include QueueArn");
  }
}

export async function runDatabaseWorker(
  options: WorkerServiceOptions,
  signal: AbortSignal,
): Promise<void> {
  options.logger.info({ delivery: "postgres" }, "commerce worker started");
  let consecutiveErrors = 0;
  while (!signal.aborted) {
    try {
      await sweepExpiredPayloads(options);
      const result = await options.processor.processNext();
      consecutiveErrors = 0;
      if (result === "noop") {
        await abortableDelay(options.pollMs, signal);
      }
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      consecutiveErrors += 1;
      options.logger.error(
        { consecutiveErrors, err: error },
        "database worker iteration failed",
      );
      if (consecutiveErrors >= options.maxConsecutiveErrors) {
        throw new WorkerLoopUnhealthyError(consecutiveErrors, {
          cause: error,
        });
      }
      await abortableDelay(options.pollMs, signal);
    }
  }
}

export async function runSqsWorker(
  options: SqsWorkerServiceOptions,
  signal: AbortSignal,
): Promise<void> {
  options.logger.info({ delivery: "sqs" }, "commerce worker started");
  let consecutiveLoopErrors = 0;
  let consecutiveMessageErrors = 0;
  while (!signal.aborted) {
    let messages: Message[];
    try {
      await sweepExpiredPayloads(options);
      await recoverStrandedEvents(options.processor, options.batchSize);
      await options.outboxPublisher.flushPending(options.batchSize);
      const response = await options.sqs.send(
        new ReceiveMessageCommand({
          MaxNumberOfMessages: options.batchSize,
          QueueUrl: options.queueUrl,
          VisibilityTimeout: options.visibilityTimeoutSeconds,
          WaitTimeSeconds: 20,
        }),
        { abortSignal: signal },
      );
      messages = response.Messages ?? [];
      consecutiveLoopErrors = 0;
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      consecutiveLoopErrors += 1;
      options.logger.error(
        { consecutiveErrors: consecutiveLoopErrors, err: error },
        "SQS worker iteration failed",
      );
      if (consecutiveLoopErrors >= options.maxConsecutiveErrors) {
        throw new WorkerLoopUnhealthyError(consecutiveLoopErrors, {
          cause: error,
        });
      }
      await abortableDelay(options.pollMs, signal);
      continue;
    }

    for (const message of messages) {
      if (signal.aborted) {
        return;
      }
      try {
        await consumeSqsMessage(options, message);
        consecutiveMessageErrors = 0;
      } catch (error) {
        if (
          error instanceof InvalidWorkerQueueMessageError ||
          error instanceof RetryableCommerceEventDeliveryError ||
          error instanceof WorkerProbeNotDeliverableError
        ) {
          // Expected poison/envelope and lease-contention failures retain the
          // message for visibility retry and the queue's redrive/DLQ policy.
          options.logger.warn(
            { err: error, messageId: message.MessageId },
            "worker queue message was retained for retry",
          );
          continue;
        }

        consecutiveMessageErrors += 1;
        options.logger.error(
          {
            consecutiveErrors: consecutiveMessageErrors,
            err: error,
            messageId: message.MessageId,
          },
          "worker queue message infrastructure operation failed",
        );
        if (consecutiveMessageErrors >= options.maxConsecutiveErrors) {
          throw new WorkerLoopUnhealthyError(consecutiveMessageErrors, {
            cause: error,
          });
        }
      }
    }
  }
}

export async function recoverStrandedEvents(
  processor: Pick<CommerceEventProcessor, "processNextRecoverable">,
  limit: number,
): Promise<number> {
  let recovered = 0;
  while (recovered < limit) {
    const result = await processor.processNextRecoverable();
    if (result === "noop") {
      break;
    }
    recovered += 1;
  }
  return recovered;
}

async function sweepExpiredPayloads(
  options: Pick<WorkerServiceOptions, "batchSize" | "logger" | "processor">,
): Promise<void> {
  const result = await options.processor.sweepExpiredPayloads(
    options.batchSize,
  );
  if (result.deletedPayloads > 0) {
    options.logger.info(
      {
        deletedPayloads: result.deletedPayloads,
        terminalizedEvents: result.terminalizedEvents,
      },
      "expired commerce payloads deleted",
    );
  }
}

export async function consumeSqsMessage(
  options: SqsWorkerServiceOptions,
  message: Message,
): Promise<void> {
  const parsed = parseQueueMessage(message.Body);
  if (!parsed || !message.ReceiptHandle) {
    throw new InvalidWorkerQueueMessageError(
      "Queue message has no valid, supported envelope or receipt handle",
    );
  }

  switch (parsed.type) {
    case "command":
      await options.outboxPublisher.flushPending(options.batchSize);
      await deleteMessage(options, message.ReceiptHandle);
      return;
    case "probe":
      await options.probeStore.assertDeliverable(parsed.probeId);
      await deleteMessage(options, message.ReceiptHandle);
      await options.probeStore.acknowledge(parsed.probeId);
      return;
    case "commerce_event": {
      const result = await options.processor.processById(
        parsed.commerceEventId,
      );
      if (shouldRetainCommerceEvent(result)) {
        throw new RetryableCommerceEventDeliveryError(
          `Commerce event delivery is not terminal: ${result}`,
        );
      }
      await deleteMessage(options, message.ReceiptHandle);
    }
  }
}

function shouldRetainCommerceEvent(result: ProcessByIdResult): boolean {
  return (
    result === "active_lease" ||
    result === "missing" ||
    result === "retryable"
  );
}

function parseQueueMessage(
  body: string | undefined,
): WorkerQueueMessage | null {
  if (!body) {
    return null;
  }
  try {
    const result = WorkerQueueMessageSchema.safeParse(
      JSON.parse(body) as unknown,
    );
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function deleteMessage(
  options: SqsWorkerServiceOptions,
  receiptHandle: string,
): Promise<void> {
  await options.sqs.send(
    new DeleteMessageCommand({
      QueueUrl: options.queueUrl,
      ReceiptHandle: receiptHandle,
    }),
  );
}

export async function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    const onAbort = (): void => finish();

    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
