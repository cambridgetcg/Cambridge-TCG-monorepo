import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";

import type { ProcessByIdResult } from "../src/processing.js";
import { WorkerProbeNotDeliverableError } from "../src/worker-probe-store.js";
import {
  consumeSqsMessage,
  InvalidWorkerQueueMessageError,
  recoverStrandedEvents,
  RetryableCommerceEventDeliveryError,
  runDatabaseWorker,
  runSqsWorker,
  runWorkerStartupChecks,
  type SqsWorkerServiceOptions,
  WorkerLoopUnhealthyError,
} from "../src/worker-service.js";

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const PROBE_ID = "20000000-0000-4000-8000-000000000002";
type SendMock = ReturnType<
  typeof vi.fn<(command: unknown) => Promise<unknown>>
>;

function sqsOptions(
  result: ProcessByIdResult = "normalized",
  send: SendMock = vi.fn(async (_command: unknown) => ({})),
): SqsWorkerServiceOptions {
  return {
    batchSize: 10,
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    maxConsecutiveErrors: 3,
    outboxPublisher: {
      flushPending: vi.fn(async () => 0),
    },
    pollMs: 1,
    probeStore: {
      acknowledge: vi.fn(async () => undefined),
      assertDeliverable: vi.fn(async () => undefined),
    },
    processor: {
      processById: vi.fn(async () => result),
      processNextRecoverable: vi.fn(async () => "noop"),
    },
    queueUrl: "https://sqs.eu-west-2.amazonaws.com/123/events",
    sqs: { send } as unknown as SQSClient,
    visibilityTimeoutSeconds: 120,
  } as unknown as SqsWorkerServiceOptions;
}

function eventMessage() {
  return {
    Body: JSON.stringify({
      commerceEventId: EVENT_ID,
      schemaVersion: 1,
      type: "commerce_event",
    }),
    MessageId: "message-1",
    ReceiptHandle: "receipt-1",
  };
}

describe("SQS worker message acknowledgement", () => {
  it.each(["active_lease", "missing", "retryable"] as const)(
    "retains an event message while its DB state is %s",
    async (result) => {
      const send = vi.fn(async (_command: unknown) => ({}));
      const options = sqsOptions(result, send);

      await expect(
        consumeSqsMessage(options, eventMessage()),
      ).rejects.toBeInstanceOf(RetryableCommerceEventDeliveryError);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(["normalized", "ignored", "failed", "terminal"] as const)(
    "deletes an event message after the DB state is %s",
    async (result) => {
      const send = vi.fn(async (_command: unknown) => ({}));

      await consumeSqsMessage(sqsOptions(result, send), eventMessage());

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteMessageCommand);
    },
  );

  it.each([
    undefined,
    "not-json",
    JSON.stringify({ arbitrary: "scheduler payload" }),
    JSON.stringify({
      command: "not-supported",
      schemaVersion: 1,
      type: "command",
    }),
  ])("retains malformed or unsupported body %# for SQS redrive", async (Body) => {
    const send = vi.fn(async (_command: unknown) => ({}));

    await expect(
      consumeSqsMessage(sqsOptions("normalized", send), {
        Body,
        MessageId: "poison-message",
        ReceiptHandle: "receipt-poison",
      }),
    ).rejects.toBeInstanceOf(InvalidWorkerQueueMessageError);
    expect(send).not.toHaveBeenCalled();
  });

  it("retains a flush command when outbox publication fails", async () => {
    const send = vi.fn(async (_command: unknown) => ({}));
    const options = sqsOptions("normalized", send);
    options.outboxPublisher.flushPending = vi.fn(async () => {
      throw new Error("outbox publish unavailable");
    });

    await expect(
      consumeSqsMessage(options, {
        Body: JSON.stringify({
          command: "flush_outbox",
          schemaVersion: 1,
          type: "command",
        }),
        ReceiptHandle: "flush-receipt",
      }),
    ).rejects.toThrow("outbox publish unavailable");
    expect(send).not.toHaveBeenCalled();
  });

  it("acknowledges a probe in DB only after SQS deletion succeeds", async () => {
    const order: string[] = [];
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(DeleteMessageCommand);
      order.push("delete");
      return {};
    });
    const options = sqsOptions("normalized", send);
    options.probeStore.assertDeliverable = vi.fn(async () => {
      order.push("assert");
    });
    options.probeStore.acknowledge = vi.fn(async () => {
      order.push("acknowledge");
    });

    await consumeSqsMessage(options, {
      Body: JSON.stringify({
        probeId: PROBE_ID,
        schemaVersion: 1,
        type: "probe",
      }),
      MessageId: "probe-message",
      ReceiptHandle: "probe-receipt",
    });

    expect(order).toEqual(["assert", "delete", "acknowledge"]);
  });

  it("does not acknowledge a probe when SQS deletion fails", async () => {
    const options = sqsOptions(
      "normalized",
      vi.fn(async (_command: unknown) => {
        throw new Error("delete unavailable");
      }),
    );

    await expect(
      consumeSqsMessage(options, {
        Body: JSON.stringify({
          probeId: PROBE_ID,
          schemaVersion: 1,
          type: "probe",
        }),
        ReceiptHandle: "probe-receipt",
      }),
    ).rejects.toThrow("delete unavailable");
    expect(options.probeStore.acknowledge).not.toHaveBeenCalled();
  });

  it("safely deletes and idempotently acknowledges duplicate probe deliveries", async () => {
    const send = vi.fn(async (_command: unknown) => ({}));
    const options = sqsOptions("normalized", send);
    const duplicate = {
      Body: JSON.stringify({
        probeId: PROBE_ID,
        schemaVersion: 1,
        type: "probe",
      }),
      ReceiptHandle: "probe-receipt",
    };

    await consumeSqsMessage(options, duplicate);
    await consumeSqsMessage(options, {
      ...duplicate,
      ReceiptHandle: "probe-receipt-duplicate",
    });

    expect(options.probeStore.assertDeliverable).toHaveBeenCalledTimes(2);
    expect(options.probeStore.acknowledge).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("worker recovery and liveness", () => {
  it("drains recoverable events up to the batch limit", async () => {
    const processNextRecoverable = vi
      .fn()
      .mockResolvedValueOnce("normalized")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("noop");

    await expect(
      recoverStrandedEvents({ processNextRecoverable }, 10),
    ).resolves.toBe(2);
    expect(processNextRecoverable).toHaveBeenCalledTimes(3);
  });

  it("terminates after the configured number of consecutive DB loop errors", async () => {
    const processor = {
      processNext: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };

    await expect(
      runDatabaseWorker(
        {
          batchSize: 10,
          logger: {
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
          },
          maxConsecutiveErrors: 2,
          pollMs: 1,
          processor,
          visibilityTimeoutSeconds: 120,
        } as never,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      consecutiveErrors: 2,
      name: "WorkerLoopUnhealthyError",
    });
    expect(processor.processNext).toHaveBeenCalledTimes(2);
  });

  it("terminates after consecutive per-message infrastructure failures", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ReceiveMessageCommand) {
        return { Messages: [eventMessage()] };
      }
      if (command instanceof DeleteMessageCommand) {
        throw new Error("SQS delete unavailable");
      }
      return {};
    });
    const options = sqsOptions("normalized", send);
    options.maxConsecutiveErrors = 2;

    await expect(
      runSqsWorker(options, new AbortController().signal),
    ).rejects.toMatchObject({
      consecutiveErrors: 2,
      name: "WorkerLoopUnhealthyError",
    });
    expect(options.processor.processById).toHaveBeenCalledTimes(2);
  });

  it("does not let empty receives erase consecutive message failures", async () => {
    let receiveCount = 0;
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ReceiveMessageCommand) {
        receiveCount += 1;
        if (receiveCount === 1 || receiveCount === 3) {
          return { Messages: [eventMessage()] };
        }
        if (receiveCount === 2) {
          return { Messages: [] };
        }
        throw new Error("unexpected extra receive");
      }
      if (command instanceof DeleteMessageCommand) {
        throw new Error("SQS delete unavailable");
      }
      return {};
    });
    const options = sqsOptions("normalized", send);
    options.maxConsecutiveErrors = 2;

    let failure: unknown;
    try {
      await runSqsWorker(options, new AbortController().signal);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(WorkerLoopUnhealthyError);
    expect(failure).toMatchObject({
      cause: { message: "SQS delete unavailable" },
      consecutiveErrors: 2,
    });
    expect(receiveCount).toBe(3);
    expect(options.processor.processById).toHaveBeenCalledTimes(2);
  });

  it("treats an expired probe as poison for redrive, not worker failure", async () => {
    const abortController = new AbortController();
    let receiveCount = 0;
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ReceiveMessageCommand) {
        receiveCount += 1;
        if (receiveCount === 1) {
          return {
            Messages: [
              {
                Body: JSON.stringify({
                  probeId: PROBE_ID,
                  schemaVersion: 1,
                  type: "probe",
                }),
                MessageId: "expired-probe",
                ReceiptHandle: "expired-probe-receipt",
              },
            ],
          };
        }
        abortController.abort();
        return { Messages: [] };
      }
      return {};
    });
    const options = sqsOptions("normalized", send);
    options.maxConsecutiveErrors = 1;
    options.probeStore.assertDeliverable = vi.fn(async () => {
      throw new WorkerProbeNotDeliverableError("probe expired");
    });

    await expect(
      runSqsWorker(options, abortController.signal),
    ).resolves.toBeUndefined();
    expect(options.probeStore.acknowledge).not.toHaveBeenCalled();
    expect(receiveCount).toBe(2);
  });

  it("checks worker schema/privileges and SQS access before entering the loop", async () => {
    const query = vi.fn(async (_sql: unknown) => ({
      rows: [{ ready: true }],
    }));
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(GetQueueAttributesCommand);
      return { Attributes: { QueueArn: "arn:aws:sqs:eu-west-2:123:events" } };
    });

    await runWorkerStartupChecks({
      pool: { query } as never,
      queueUrl: "https://sqs.eu-west-2.amazonaws.com/123/events",
      sqs: { send } as unknown as SQSClient,
    });

    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toContain("has_table_privilege");
    expect(send).toHaveBeenCalledOnce();
  });

  it("fails startup for a connectable DB without runtime schema/grants", async () => {
    await expect(
      runWorkerStartupChecks({
        pool: {
          query: vi.fn(async () => ({ rows: [{ ready: false }] })),
        } as never,
      }),
    ).rejects.toThrow("missing required worker schema or privileges");
  });
});
