import {
  GetQueueAttributesCommand,
  SendMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";

import type { WorkerConfig } from "../src/config.js";
import {
  runWorkerProbe,
  WorkerProbeTimeoutError,
} from "../src/worker-probe.js";
import { PostgresWorkerProbeStore } from "../src/worker-probe-store.js";

function config(
  overrides: Partial<WorkerConfig> = {},
): WorkerConfig & { awsRegion: string; sqsQueueUrl: string } {
  return {
    awsRegion: "eu-west-2",
    database: {
      connectTimeoutMs: 5_000,
      databaseUrl: "postgresql://app@database.internal/rewardspro",
      poolMax: 10,
      queryTimeoutMs: 10_000,
      source: "environment",
    },
    logLevel: "silent",
    nodeEnv: "test",
    shutdownGraceMs: 15_000,
    sqsQueueUrl: "https://sqs.eu-west-2.amazonaws.com/123/events",
    workerBatchSize: 10,
    workerMaxConsecutiveErrors: 5,
    workerPollMs: 1_000,
    workerProbeTimeoutMs: 60_000,
    workerVisibilityTimeoutSeconds: 120,
    ...overrides,
  } as WorkerConfig & { awsRegion: string; sqsQueueUrl: string };
}

describe("worker deployment probe", () => {
  it("leaves an acknowledged row until expiry for delayed duplicates", async () => {
    const probeStore = {
      create: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      deleteExpired: vi.fn(async () => undefined),
      isAcknowledged: vi.fn(async () => true),
    };
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetQueueAttributesCommand) {
        return { Attributes: { QueueArn: "arn:aws:sqs:eu-west-2:123:events" } };
      }
      expect(command).toBeInstanceOf(SendMessageCommand);
      return { MessageId: "probe-message" };
    });

    await runWorkerProbe({
      config: config(),
      logger: { info: vi.fn() },
      pool: {
        query: vi.fn(async () => ({ rows: [{ ready: true }] })),
      } as never,
      probeStore,
      sqs: { send } as unknown as SQSClient,
    });

    expect(probeStore.create).toHaveBeenCalledWith(expect.any(String), 300);
    expect(probeStore.isAcknowledged).toHaveBeenCalledOnce();
    expect(probeStore.delete).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps validation and acknowledgement idempotent for duplicates", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rowCount: 1,
      rows: [{ "?column?": 1 }],
    }));
    const store = new PostgresWorkerProbeStore({ query } as never);

    await store.assertDeliverable(
      "20000000-0000-4000-8000-000000000002",
    );
    await store.acknowledge("20000000-0000-4000-8000-000000000002");
    await store.acknowledge("20000000-0000-4000-8000-000000000002");

    expect(String(query.mock.calls[0]?.[0])).not.toContain(
      "acknowledged_at IS NULL",
    );
    expect(String(query.mock.calls[1]?.[0])).toContain(
      "COALESCE(acknowledged_at, now())",
    );
  });

  it("leaves a queued probe row to expire after timeout", async () => {
    const probeStore = {
      create: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      deleteExpired: vi.fn(async () => undefined),
      isAcknowledged: vi.fn(async () => false),
    };
    const send = vi.fn(async (command: unknown) =>
      command instanceof GetQueueAttributesCommand
        ? { Attributes: { QueueArn: "arn:aws:sqs:eu-west-2:123:events" } }
        : { MessageId: "probe-message" },
    );

    await expect(
      runWorkerProbe({
        config: config({ workerProbeTimeoutMs: 1 }),
        logger: { info: vi.fn() },
        pool: {
          query: vi.fn(async () => ({ rows: [{ ready: true }] })),
        } as never,
        probeStore,
        sqs: { send } as unknown as SQSClient,
      }),
    ).rejects.toBeInstanceOf(WorkerProbeTimeoutError);
    expect(probeStore.delete).not.toHaveBeenCalled();
  });
});
