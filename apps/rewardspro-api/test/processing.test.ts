import { describe, expect, it, vi } from "vitest";

import {
  CommerceProjectionConflictError,
  CommerceEventProcessor,
  type ClaimedCommerceEvent,
  type ProcessingStore,
} from "../src/processing.js";
import { normalizableEvent } from "./helpers.js";

function claimed(
  overrides: Partial<ClaimedCommerceEvent> = {},
): ClaimedCommerceEvent {
  return {
    ...normalizableEvent(),
    leaseToken: "40000000-0000-4000-8000-000000000004",
    ...overrides,
  };
}

function store(event: ClaimedCommerceEvent | null): ProcessingStore {
  return {
    claimById: vi.fn(async () =>
      event
        ? { event, status: "claimed" as const }
        : { status: "terminal" as const },
    ),
    claimNext: vi.fn(async () => event),
    claimNextRecoverable: vi.fn(async () => event),
    completeFailed: vi.fn(async () => undefined),
    completeIgnored: vi.fn(async () => undefined),
    completeNormalized: vi.fn(async () => undefined),
    sweepExpiredPayloads: vi.fn(async () => ({
      deletedPayloads: 0,
      terminalizedEvents: 0,
    })),
  };
}

describe("commerce-event processor", () => {
  it("persists the normalized contract on the same inbox event", async () => {
    const event = claimed();
    const processingStore = store(event);
    const processor = new CommerceEventProcessor(processingStore);

    await expect(processor.processById(event.eventId)).resolves.toBe(
      "normalized",
    );
    expect(processingStore.completeNormalized).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ type: "order.paid" }),
    );
    expect(processingStore.completeFailed).not.toHaveBeenCalled();
  });

  it("marks unsupported provider topics ignored", async () => {
    const event = claimed({ externalEventType: "orders/cancelled" });
    const processingStore = store(event);
    const processor = new CommerceEventProcessor(processingStore);

    await expect(processor.processNext()).resolves.toBe("ignored");
    expect(processingStore.completeIgnored).toHaveBeenCalledWith(
      event,
      "unsupported_event_type",
    );
  });

  it("does not infer Shopify from a future provider's account string", async () => {
    const event = claimed({ provider: "future_connector" });
    const processingStore = store(event);
    const processor = new CommerceEventProcessor(processingStore);

    await expect(processor.processNext()).resolves.toBe("ignored");
    expect(processingStore.completeIgnored).toHaveBeenCalledWith(
      event,
      "unsupported_event_type",
    );
  });

  it("marks invalid reported payloads terminally failed", async () => {
    const event = claimed({ payload: { id: 42 } });
    const processingStore = store(event);
    const processor = new CommerceEventProcessor(processingStore);

    await expect(processor.processNext()).resolves.toBe("failed");
    expect(processingStore.completeFailed).toHaveBeenCalledWith(
      event,
      "invalid_provider_payload",
    );
  });

  it("terminalizes a valid event that conflicts with an existing projection", async () => {
    const event = claimed();
    const processingStore = store(event);
    processingStore.completeNormalized = vi.fn(async () => {
      throw new CommerceProjectionConflictError("projection conflict");
    });
    const processor = new CommerceEventProcessor(processingStore);

    await expect(processor.processNext()).resolves.toBe("failed");
    expect(processingStore.completeFailed).toHaveBeenCalledWith(
      event,
      "projection_conflict",
    );
  });

  it("reports duplicate queue delivery of a completed event as terminal", async () => {
    const processingStore = store(null);
    const processor = new CommerceEventProcessor(processingStore);

    await expect(processor.processById("event-id")).resolves.toBe("terminal");
    expect(processingStore.completeNormalized).not.toHaveBeenCalled();
  });

  it.each(["active_lease", "retryable"] as const)(
    "preserves the non-terminal %s claim state for queue retry",
    async (status) => {
      const processingStore = store(null);
      processingStore.claimById = vi.fn(async () => ({ status }));
      const processor = new CommerceEventProcessor(processingStore);

      await expect(processor.processById("event-id")).resolves.toBe(status);
      expect(processingStore.completeNormalized).not.toHaveBeenCalled();
    },
  );
});
