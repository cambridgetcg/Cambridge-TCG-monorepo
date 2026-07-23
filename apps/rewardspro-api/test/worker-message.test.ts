import { describe, expect, it } from "vitest";

import { WorkerQueueMessageSchema } from "../src/outbox.js";

describe("worker queue envelope", () => {
  it("accepts only strict, versioned event, command, or probe messages", () => {
    expect(
      WorkerQueueMessageSchema.parse({
        commerceEventId: "10000000-0000-4000-8000-000000000001",
        schemaVersion: 1,
        type: "commerce_event",
      }),
    ).toBeTruthy();
    expect(
      WorkerQueueMessageSchema.parse({
        command: "flush_outbox",
        schemaVersion: 1,
        type: "command",
      }),
    ).toBeTruthy();
    expect(
      WorkerQueueMessageSchema.parse({
        probeId: "20000000-0000-4000-8000-000000000002",
        schemaVersion: 1,
        type: "probe",
      }),
    ).toBeTruthy();
    expect(
      WorkerQueueMessageSchema.safeParse({ arbitrary: "scheduler payload" })
        .success,
    ).toBe(false);
    expect(
      WorkerQueueMessageSchema.safeParse({
        command: "process_everything",
        schemaVersion: 1,
        type: "command",
      }).success,
    ).toBe(false);
    expect(
      WorkerQueueMessageSchema.safeParse({
        probeId: "20000000-0000-4000-8000-000000000002",
        schemaVersion: 1,
        type: "probe",
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
