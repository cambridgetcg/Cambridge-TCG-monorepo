/**
 * @module @cambridge-tcg/stock/__tests__/writer-validation
 *
 * Tests for StockWriter input validation.
 * These don't need a DB — they verify the guard clauses fire before
 * any SQL is executed.
 */

import { describe, it, expect, vi } from "vitest";
import { createStockWriter } from "../writer.js";

describe("StockWriter validation", () => {
  const mockCardsTable = {} as any;
  const writer = createStockWriter({
    enforceNonNegative: true,
    cardsTable: mockCardsTable,
  });

  // A mock tx that should never be called — if it is, the test fails
  const noOpTx = new Proxy(
    {},
    {
      get: () => {
        throw new Error("DB should not be called — validation should throw first");
      },
    }
  ) as any;

  describe("recordSale", () => {
    it("rejects zero quantity", async () => {
      await expect(
        writer.recordSale(noOpTx, {
          cardId: 1,
          quantity: 0,
          channel: "shopify",
          referenceId: "shopify:order:1:item:1",
        })
      ).rejects.toThrow("Sale quantity must be positive");
    });

    it("rejects negative quantity", async () => {
      await expect(
        writer.recordSale(noOpTx, {
          cardId: 1,
          quantity: -5,
          channel: "shopify",
          referenceId: "shopify:order:1:item:1",
        })
      ).rejects.toThrow("Sale quantity must be positive");
    });

    it("rejects empty referenceId", async () => {
      await expect(
        writer.recordSale(noOpTx, {
          cardId: 1,
          quantity: 1,
          channel: "shopify",
          referenceId: "",
        })
      ).rejects.toThrow("Sales require a reference_id for idempotency");
    });
  });

  describe("recordPurchaseReceived", () => {
    it("rejects zero quantity", async () => {
      await expect(
        writer.recordPurchaseReceived(noOpTx, {
          cardId: 1,
          quantity: 0,
          purchaseId: 1,
          purchaseItemId: 1,
        })
      ).rejects.toThrow("Purchase quantity must be positive");
    });

    it("rejects negative quantity", async () => {
      await expect(
        writer.recordPurchaseReceived(noOpTx, {
          cardId: 1,
          quantity: -3,
          purchaseId: 1,
          purchaseItemId: 1,
        })
      ).rejects.toThrow("Purchase quantity must be positive");
    });
  });

  describe("recordFulfillment", () => {
    it("rejects zero quantity", async () => {
      await expect(
        writer.recordFulfillment(noOpTx, {
          cardId: 1,
          quantity: 0,
          orderId: 1,
          orderItemId: 1,
          fulfillmentDate: "2026-04-27",
        })
      ).rejects.toThrow("Fulfillment quantity must be positive");
    });
  });

  describe("setAbsolute", () => {
    it("rejects negative desired stock", async () => {
      await expect(
        writer.setAbsolute(noOpTx, {
          cardId: 1,
          desiredStock: -1,
        })
      ).rejects.toThrow("Desired stock must be non-negative");
    });
  });
});
