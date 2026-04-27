import { describe, it, expect } from "vitest";
import { createStockService } from "../index";

describe("createStockService", () => {
  // We can't hit a real DB in these tests, but we can verify
  // the service factory produces the correct shape.

  const mockTables = {
    cardsTable: {},
    purchasesTable: {},
    purchaseItemsTable: {},
  };

  it("creates a service with all operation groups", () => {
    const service = createStockService(mockTables);

    expect(service.writer).toBeDefined();
    expect(service.reader).toBeDefined();
    expect(service.reserver).toBeDefined();
    expect(service.reconciler).toBeDefined();
    expect(service.events).toBeDefined();
  });

  it("writer has all expected methods", () => {
    const service = createStockService(mockTables);
    expect(typeof service.writer.recordSale).toBe("function");
    expect(typeof service.writer.recordPurchaseReceived).toBe("function");
    expect(typeof service.writer.recordFulfillment).toBe("function");
    expect(typeof service.writer.recordAdjustment).toBe("function");
    expect(typeof service.writer.setAbsolute).toBe("function");
  });

  it("reader has all expected methods", () => {
    const service = createStockService(mockTables);
    expect(typeof service.reader.getLevel).toBe("function");
    expect(typeof service.reader.getLevels).toBe("function");
    expect(typeof service.reader.getMovements).toBe("function");
    expect(typeof service.reader.computePending).toBe("function");
    expect(typeof service.reader.listReorderQueue).toBe("function");
    expect(typeof service.reader.listOutOfStock).toBe("function");
  });

  it("reserver has all expected methods", () => {
    const service = createStockService(mockTables);
    expect(typeof service.reserver.reserve).toBe("function");
    expect(typeof service.reserver.release).toBe("function");
    expect(typeof service.reserver.releaseExpired).toBe("function");
    expect(typeof service.reserver.commitToSale).toBe("function");
  });

  it("reconciler has all expected methods", () => {
    const service = createStockService(mockTables);
    expect(typeof service.reconciler.check).toBe("function");
    expect(typeof service.reconciler.fix).toBe("function");
    expect(typeof service.reconciler.syncPending).toBe("function");
  });

  it("events has all expected methods", () => {
    const service = createStockService(mockTables);
    expect(typeof service.events.onStockChanged).toBe("function");
    expect(typeof service.events.onLowStock).toBe("function");
    expect(typeof service.events.emitStockChanged).toBe("function");
    expect(typeof service.events.emitLowStock).toBe("function");
  });

  it("respects custom options", () => {
    // This just verifies it doesn't throw with custom options
    const service = createStockService(mockTables, {
      defaultReservationTtlMinutes: 60,
      enforceNonNegative: false,
    });
    expect(service).toBeDefined();
  });
});
