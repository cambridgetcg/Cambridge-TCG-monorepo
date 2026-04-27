import { describe, it, expect } from "vitest";
import { MOVEMENT_KINDS } from "../types.js";
import type { MovementKind, Channel, StockLevel, StockMovement } from "../types.js";

describe("types", () => {
  it("MOVEMENT_KINDS contains all expected kinds", () => {
    expect(MOVEMENT_KINDS).toContain("purchase_received");
    expect(MOVEMENT_KINDS).toContain("found");
    expect(MOVEMENT_KINDS).toContain("return");
    expect(MOVEMENT_KINDS).toContain("sale");
    expect(MOVEMENT_KINDS).toContain("fulfillment");
    expect(MOVEMENT_KINDS).toContain("damage");
    expect(MOVEMENT_KINDS).toContain("loss");
    expect(MOVEMENT_KINDS).toContain("correction");
    expect(MOVEMENT_KINDS).toContain("reconciliation");
    expect(MOVEMENT_KINDS).toHaveLength(9);
  });

  it("StockLevel.available is onHand - reserved", () => {
    // Type-level test: ensure the shape compiles
    const level: StockLevel = {
      cardId: 1,
      onHand: 10,
      reserved: 3,
      available: 7,
      pending: 2,
      lastReconciledAt: null,
    };
    expect(level.available).toBe(level.onHand - level.reserved);
  });

  it("StockMovement has all required fields", () => {
    const movement: StockMovement = {
      id: 1,
      cardId: 42,
      kind: "sale",
      channel: "shopify",
      delta: -1,
      referenceId: "shopify:order:123:item:456",
      note: null,
      condition: null,
      createdAt: new Date(),
    };
    expect(movement.delta).toBe(-1);
    expect(movement.kind).toBe("sale");
  });

  it("Channel accepts custom strings", () => {
    const channel: Channel = "tcgplayer";
    expect(channel).toBe("tcgplayer");
  });
});
