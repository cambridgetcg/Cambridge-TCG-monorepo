import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";

import {
  OutboxPublishError,
  SqsOutboxPublisher,
  type OutboxClaim,
  type OutboxStore,
} from "../src/outbox.js";
import { TEST_CONNECTION_ID, TEST_EVENT_ID } from "./helpers.js";

function claim(): OutboxClaim {
  return {
    commerceConnectionId: TEST_CONNECTION_ID,
    eventId: TEST_EVENT_ID,
    leaseToken: "40000000-0000-4000-8000-000000000004",
  };
}

function dependencies(overrides: Partial<OutboxStore> = {}) {
  const store: OutboxStore = {
    claim: vi.fn(async () => claim()),
    listPending: vi.fn(async () => [TEST_EVENT_ID]),
    markFailed: vi.fn(async () => undefined),
    markPublished: vi.fn(async () => undefined),
    ...overrides,
  };
  const sqs = {
    send: vi.fn(async (_command: SendMessageCommand) => ({
      MessageId: "sqs-message-1",
    })),
  };
  const logger = { warn: vi.fn() };
  return { logger, sqs, store };
}

describe("transaction-safe SQS outbox publication", () => {
  it("publishes only an event reference and then marks the claimed row queued", async () => {
    const { logger, sqs, store } = dependencies();
    const publisher = new SqsOutboxPublisher(
      store,
      sqs,
      "https://sqs.eu-west-2.amazonaws.com/123/events",
      logger as never,
    );

    await expect(publisher.publishEvent(TEST_EVENT_ID)).resolves.toBe(true);
    expect(sqs.send).toHaveBeenCalledOnce();
    const command = sqs.send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(SendMessageCommand);
    expect((command as SendMessageCommand).input).toMatchObject({
      MessageBody: JSON.stringify({
        commerceEventId: TEST_EVENT_ID,
        schemaVersion: 1,
        type: "commerce_event",
      }),
    });
    expect((command as SendMessageCommand).input.MessageBody).not.toContain(
      "payload",
    );
    expect(store.markPublished).toHaveBeenCalledWith(claim());
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("adds FIFO deduplication and connection ordering fields", async () => {
    const { logger, sqs, store } = dependencies();
    const publisher = new SqsOutboxPublisher(
      store,
      sqs,
      "https://sqs.eu-west-2.amazonaws.com/123/events.fifo",
      logger as never,
    );

    await publisher.publishEvent(TEST_EVENT_ID);
    const command = sqs.send.mock.calls[0]?.[0] as SendMessageCommand;
    expect(command.input).toMatchObject({
      MessageDeduplicationId: TEST_EVENT_ID,
      MessageGroupId: TEST_CONNECTION_ID,
    });
  });

  it("leaves failed sends pending with persisted retry state", async () => {
    const { logger, sqs, store } = dependencies();
    sqs.send.mockRejectedValueOnce(new Error("AWS detail"));
    const publisher = new SqsOutboxPublisher(
      store,
      sqs,
      "https://sqs.eu-west-2.amazonaws.com/123/events",
      logger as never,
    );

    await expect(
      publisher.publishEvent(TEST_EVENT_ID),
    ).rejects.toBeInstanceOf(OutboxPublishError);
    expect(store.markFailed).toHaveBeenCalledWith(claim());
    expect(store.markPublished).not.toHaveBeenCalled();
  });

  it("surfaces a flush failure after persisting outbox backoff", async () => {
    const { logger, sqs, store } = dependencies();
    sqs.send.mockRejectedValueOnce(new Error("AWS detail"));
    const publisher = new SqsOutboxPublisher(
      store,
      sqs,
      "https://sqs.eu-west-2.amazonaws.com/123/events",
      logger as never,
    );

    await expect(publisher.flushPending(10)).rejects.toBeInstanceOf(
      OutboxPublishError,
    );
    expect(store.markFailed).toHaveBeenCalledWith(claim());
  });

  it("does nothing when another publisher owns the lease", async () => {
    const { logger, sqs, store } = dependencies({
      claim: vi.fn(async () => null),
    });
    const publisher = new SqsOutboxPublisher(
      store,
      sqs,
      "https://sqs.eu-west-2.amazonaws.com/123/events",
      logger as never,
    );

    await expect(publisher.publishEvent(TEST_EVENT_ID)).resolves.toBe(false);
    expect(sqs.send).not.toHaveBeenCalled();
  });
});
