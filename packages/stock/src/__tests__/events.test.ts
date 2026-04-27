import { describe, it, expect, vi } from "vitest";
import { createEventEmitter } from "../events.js";
import type { StockChangedEvent, LowStockEvent } from "../types.js";

describe("createEventEmitter", () => {
  const sampleStockChanged: StockChangedEvent = {
    cardId: 1,
    movementId: 100,
    kind: "sale",
    channel: "shopify",
    delta: -1,
    newOnHand: 4,
    newAvailable: 3,
    newPending: 0,
    timestamp: new Date(),
  };

  const sampleLowStock: LowStockEvent = {
    cardId: 1,
    onHand: 0,
    target: 5,
    pending: 0,
    timestamp: new Date(),
  };

  it("calls registered StockChanged handlers", async () => {
    const emitter = createEventEmitter();
    const handler = vi.fn().mockResolvedValue(undefined);

    emitter.onStockChanged(handler);
    await emitter.emitStockChanged(sampleStockChanged);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(sampleStockChanged);
  });

  it("calls multiple handlers in order", async () => {
    const emitter = createEventEmitter();
    const order: number[] = [];
    emitter.onStockChanged(async () => {
      order.push(1);
    });
    emitter.onStockChanged(async () => {
      order.push(2);
    });

    await emitter.emitStockChanged(sampleStockChanged);
    expect(order).toEqual([1, 2]);
  });

  it("does not throw if a handler throws (fire-and-forget)", async () => {
    const emitter = createEventEmitter();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    emitter.onStockChanged(async () => {
      throw new Error("handler failed");
    });

    // Should not throw
    await emitter.emitStockChanged(sampleStockChanged);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("calls LowStock handlers", async () => {
    const emitter = createEventEmitter();
    const handler = vi.fn().mockResolvedValue(undefined);

    emitter.onLowStock(handler);
    await emitter.emitLowStock(sampleLowStock);

    expect(handler).toHaveBeenCalledWith(sampleLowStock);
  });

  it("does nothing with no handlers", async () => {
    const emitter = createEventEmitter();
    // Should not throw
    await emitter.emitStockChanged(sampleStockChanged);
    await emitter.emitLowStock(sampleLowStock);
  });
});
