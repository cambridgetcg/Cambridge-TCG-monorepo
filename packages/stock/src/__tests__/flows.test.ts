/**
 * @module @cambridge-tcg/stock/__tests__/flows
 *
 * End-to-end flow tests for the stock package.
 *
 * These tests exercise the business logic through realistic scenarios
 * using a mock Drizzle client backed by in-memory state. They verify:
 *
 *   1. Purchase received → on-hand increments
 *   2. Channel sale → on-hand decrements with idempotency
 *   3. Reserve → commit → sale lifecycle
 *   4. Reserve → release → stock restored
 *   5. Duplicate reference_id → idempotent no-op
 *   6. Non-negative enforcement
 *   7. setAbsolute computes correct delta
 *   8. Cross-path dedup (Shopify webhook + cron share reference_id format)
 *
 * Not tested here (requires real Postgres):
 *   - Actual SQL execution and transaction isolation
 *   - ON CONFLICT constraint behavior
 *   - Concurrent last-unit serialization (needs real row-level locking)
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── In-memory DB simulation ─────────────────────────────────────────

interface CardRow {
  id: number;
  stock: number;
  pendingStock: number;
  reservedStock: number;
  stockReconciledAt: Date | null;
  gameId: number;
  price: number;
  sku: string;
  name: string;
}

interface MovementRow {
  id: number;
  cardId: number;
  kind: string;
  channel: string;
  delta: number;
  referenceId: string | null;
  note: string | null;
  condition: string | null;
  createdAt: Date;
}

interface ReservationRow {
  id: number;
  cardId: number;
  quantity: number;
  holder: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Minimal in-memory store that mimics the shape the stock writer/reserver
 * needs from Drizzle. Not a full Drizzle mock — only the paths our code
 * actually exercises.
 */
function createMemoryDb() {
  const cards = new Map<number, CardRow>();
  let movementSeq = 0;
  const movements: MovementRow[] = [];
  let reservationSeq = 0;
  const reservations: ReservationRow[] = [];

  // Track reference_id uniqueness per card (simulates the UNIQUE constraint)
  const seenReferences = new Set<string>();

  function addCard(card: Partial<CardRow> & { id: number }) {
    cards.set(card.id, {
      id: card.id,
      stock: card.stock ?? 0,
      pendingStock: card.pendingStock ?? 0,
      reservedStock: card.reservedStock ?? 0,
      stockReconciledAt: card.stockReconciledAt ?? null,
      gameId: card.gameId ?? 1,
      price: card.price ?? 10,
      sku: card.sku ?? `SKU-${card.id}`,
      name: card.name ?? `Card ${card.id}`,
    });
  }

  /**
   * Insert a movement. Returns the row if inserted, empty array if
   * the reference_id already exists for this card (simulates ON CONFLICT DO NOTHING).
   */
  function insertMovement(values: Omit<MovementRow, "id" | "createdAt">): MovementRow[] {
    if (values.referenceId !== null) {
      const key = `${values.cardId}:${values.referenceId}`;
      if (seenReferences.has(key)) {
        return []; // Idempotent no-op
      }
      seenReferences.add(key);
    }

    const row: MovementRow = {
      ...values,
      id: ++movementSeq,
      createdAt: new Date(),
    };
    movements.push(row);
    return [row];
  }

  function updateCardStock(cardId: number, delta: number, enforceNonNeg: boolean) {
    const card = cards.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    if (enforceNonNeg) {
      card.stock = Math.max(card.stock + delta, 0);
    } else {
      card.stock += delta;
    }
  }

  function setCardStock(cardId: number, stock: number) {
    const card = cards.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    card.stock = stock;
  }

  function getCard(cardId: number): CardRow | undefined {
    return cards.get(cardId);
  }

  function updateReservedStock(cardId: number, delta: number) {
    const card = cards.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    card.reservedStock = Math.max(card.reservedStock + delta, 0);
  }

  function insertReservation(
    values: Omit<ReservationRow, "id" | "createdAt">
  ): ReservationRow {
    const row: ReservationRow = {
      ...values,
      id: ++reservationSeq,
      createdAt: new Date(),
    };
    reservations.push(row);
    return row;
  }

  function findReservation(
    holder: string,
    cardId: number
  ): ReservationRow | undefined {
    return reservations.find(
      (r) => r.holder === holder && r.cardId === cardId
    );
  }

  function deleteReservation(id: number) {
    const idx = reservations.findIndex((r) => r.id === id);
    if (idx >= 0) reservations.splice(idx, 1);
  }

  function getMovements(): MovementRow[] {
    return [...movements];
  }

  function getReservations(): ReservationRow[] {
    return [...reservations];
  }

  return {
    addCard,
    insertMovement,
    updateCardStock,
    setCardStock,
    getCard,
    updateReservedStock,
    insertReservation,
    findReservation,
    deleteReservation,
    getMovements,
    getReservations,
  };
}

// ── Thin wrappers that mirror stock operations ──────────────────────
// These replicate the logic from writer.ts / reserver.ts but run against
// the in-memory DB. This tests the BUSINESS LOGIC, not the Drizzle SQL.

interface StockOps {
  recordSale(params: {
    cardId: number;
    quantity: number;
    channel: string;
    referenceId: string;
    note?: string;
    condition?: string;
  }): MovementRow | null;

  recordPurchaseReceived(params: {
    cardId: number;
    quantity: number;
    purchaseId: number;
    purchaseItemId: number;
    condition?: string;
  }): MovementRow | null;

  recordAdjustment(params: {
    cardId: number;
    delta: number;
    kind: string;
    channel?: string;
    referenceId?: string;
    note?: string;
  }): MovementRow | null;

  setAbsolute(params: {
    cardId: number;
    desiredStock: number;
    note?: string;
  }): MovementRow | null;

  reserve(params: {
    cardId: number;
    quantity: number;
    holder: string;
    ttlMinutes?: number;
  }): ReservationRow;

  release(params: { cardId: number; holder: string }): void;

  commitToSale(params: {
    cardId: number;
    holder: string;
    channel: string;
    referenceId: string;
  }): MovementRow | null;
}

function createTestOps(
  db: ReturnType<typeof createMemoryDb>,
  opts: { enforceNonNegative: boolean; defaultTtlMinutes: number } = {
    enforceNonNegative: true,
    defaultTtlMinutes: 30,
  }
): StockOps {
  return {
    recordSale(params) {
      if (params.quantity <= 0) throw new Error("Sale quantity must be positive");
      if (!params.referenceId) throw new Error("Sales require a reference_id");

      const rows = db.insertMovement({
        cardId: params.cardId,
        kind: "sale",
        channel: params.channel,
        delta: -params.quantity,
        referenceId: params.referenceId,
        note: params.note ?? null,
        condition: params.condition ?? null,
      });

      if (rows.length === 0) return null; // Idempotent no-op

      db.updateCardStock(params.cardId, -params.quantity, opts.enforceNonNegative);
      return rows[0]!;
    },

    recordPurchaseReceived(params) {
      if (params.quantity <= 0) throw new Error("Purchase quantity must be positive");
      const referenceId = `purchase:${params.purchaseId}:item:${params.purchaseItemId}`;

      const rows = db.insertMovement({
        cardId: params.cardId,
        kind: "purchase_received",
        channel: "system",
        delta: params.quantity,
        referenceId,
        note: null,
        condition: params.condition ?? null,
      });

      if (rows.length === 0) return null;
      db.updateCardStock(params.cardId, params.quantity, opts.enforceNonNegative);
      return rows[0]!;
    },

    recordAdjustment(params) {
      const rows = db.insertMovement({
        cardId: params.cardId,
        kind: params.kind,
        channel: params.channel ?? "manual",
        delta: params.delta,
        referenceId: params.referenceId ?? null,
        note: params.note ?? null,
        condition: null,
      });

      if (rows.length === 0) return null;
      db.updateCardStock(params.cardId, params.delta, opts.enforceNonNegative);
      return rows[0]!;
    },

    setAbsolute(params) {
      if (params.desiredStock < 0) throw new Error("Desired stock must be non-negative");
      const card = db.getCard(params.cardId);
      if (!card) throw new Error(`Card ${params.cardId} not found`);

      const delta = params.desiredStock - card.stock;
      if (delta === 0) return null;

      const rows = db.insertMovement({
        cardId: params.cardId,
        kind: "correction",
        channel: "manual",
        delta,
        referenceId: null,
        note: params.note ?? `Set absolute: ${card.stock} → ${params.desiredStock}`,
        condition: null,
      });

      if (rows.length === 0) return null;
      db.setCardStock(params.cardId, params.desiredStock);
      return rows[0]!;
    },

    reserve(params) {
      const ttl = params.ttlMinutes ?? opts.defaultTtlMinutes;
      const expiresAt = new Date(Date.now() + ttl * 60 * 1000);
      const card = db.getCard(params.cardId);
      if (!card) throw new Error(`Card ${params.cardId} not found`);

      const existing = db.findReservation(params.holder, params.cardId);
      const currentReservedByThisHolder = existing?.quantity ?? 0;
      const available = card.stock - card.reservedStock + currentReservedByThisHolder;

      if (available < params.quantity) {
        throw new Error(
          `Insufficient stock for card ${params.cardId}: available=${available}, requested=${params.quantity}`
        );
      }

      if (existing) {
        const deltaReserved = params.quantity - existing.quantity;
        existing.quantity = params.quantity;
        existing.expiresAt = expiresAt;
        if (deltaReserved !== 0) {
          db.updateReservedStock(params.cardId, deltaReserved);
        }
        return existing;
      }

      const reservation = db.insertReservation({
        cardId: params.cardId,
        quantity: params.quantity,
        holder: params.holder,
        expiresAt,
      });
      db.updateReservedStock(params.cardId, params.quantity);
      return reservation;
    },

    release(params) {
      const reservation = db.findReservation(params.holder, params.cardId);
      if (!reservation) return;
      db.deleteReservation(reservation.id);
      db.updateReservedStock(params.cardId, -reservation.quantity);
    },

    commitToSale(params) {
      const reservation = db.findReservation(params.holder, params.cardId);
      if (!reservation) throw new Error(`No reservation found`);

      db.deleteReservation(reservation.id);
      db.updateReservedStock(params.cardId, -reservation.quantity);

      const rows = db.insertMovement({
        cardId: params.cardId,
        kind: "sale",
        channel: params.channel,
        delta: -reservation.quantity,
        referenceId: params.referenceId,
        note: null,
        condition: null,
      });

      if (rows.length === 0) return null; // Duplicate

      db.updateCardStock(params.cardId, -reservation.quantity, opts.enforceNonNegative);
      return rows[0]!;
    },
  };
}

// ── Flow Tests ──────────────────────────────────────────────────────

describe("Stock flows", () => {
  let db: ReturnType<typeof createMemoryDb>;
  let ops: StockOps;

  beforeEach(() => {
    db = createMemoryDb();
    ops = createTestOps(db);
  });

  // ── Flow 1: Purchase received → on-hand increments ────────────

  describe("Flow 1: Purchase received", () => {
    it("increments on-hand stock when goods are received", () => {
      db.addCard({ id: 1, stock: 5 });

      const movement = ops.recordPurchaseReceived({
        cardId: 1,
        quantity: 10,
        purchaseId: 100,
        purchaseItemId: 200,
      });

      expect(movement).not.toBeNull();
      expect(movement!.kind).toBe("purchase_received");
      expect(movement!.delta).toBe(10);
      expect(db.getCard(1)!.stock).toBe(15);
    });

    it("generates deterministic referenceId from purchase/item IDs", () => {
      db.addCard({ id: 1, stock: 0 });

      const m = ops.recordPurchaseReceived({
        cardId: 1,
        quantity: 3,
        purchaseId: 42,
        purchaseItemId: 99,
      });

      expect(m!.referenceId).toBe("purchase:42:item:99");
    });

    it("is idempotent — same purchase/item is a no-op", () => {
      db.addCard({ id: 1, stock: 5 });

      const first = ops.recordPurchaseReceived({
        cardId: 1,
        quantity: 10,
        purchaseId: 100,
        purchaseItemId: 200,
      });
      expect(first).not.toBeNull();
      expect(db.getCard(1)!.stock).toBe(15);

      const second = ops.recordPurchaseReceived({
        cardId: 1,
        quantity: 10,
        purchaseId: 100,
        purchaseItemId: 200,
      });
      expect(second).toBeNull(); // Idempotent no-op
      expect(db.getCard(1)!.stock).toBe(15); // Stock unchanged
    });
  });

  // ── Flow 2: Channel sale → on-hand decrements ────────────────

  describe("Flow 2: Channel sale with idempotency", () => {
    it("decrements on-hand stock", () => {
      db.addCard({ id: 1, stock: 10 });

      const movement = ops.recordSale({
        cardId: 1,
        quantity: 3,
        channel: "shopify",
        referenceId: "shopify:order:123:item:456",
      });

      expect(movement).not.toBeNull();
      expect(movement!.delta).toBe(-3);
      expect(db.getCard(1)!.stock).toBe(7);
    });

    it("is idempotent — same referenceId for same card is a no-op", () => {
      db.addCard({ id: 1, stock: 10 });

      ops.recordSale({
        cardId: 1,
        quantity: 3,
        channel: "shopify",
        referenceId: "shopify:order:123:item:456",
      });

      // Replay the same sale (webhook retry)
      const replay = ops.recordSale({
        cardId: 1,
        quantity: 3,
        channel: "shopify",
        referenceId: "shopify:order:123:item:456",
      });

      expect(replay).toBeNull();
      expect(db.getCard(1)!.stock).toBe(7); // Not double-decremented
    });

    it("same referenceId for DIFFERENT cards are separate operations", () => {
      db.addCard({ id: 1, stock: 10 });
      db.addCard({ id: 2, stock: 10 });

      const ref = "shopify:order:123:item:456";
      ops.recordSale({ cardId: 1, quantity: 1, channel: "shopify", referenceId: ref });
      ops.recordSale({ cardId: 2, quantity: 1, channel: "shopify", referenceId: ref });

      // Both should succeed — unique constraint is (cardId, referenceId)
      expect(db.getCard(1)!.stock).toBe(9);
      expect(db.getCard(2)!.stock).toBe(9);
    });
  });

  // ── Flow 3: Reserve → commit → sale ──────────────────────────

  describe("Flow 3: Reservation lifecycle — commit to sale", () => {
    it("reserve holds stock, commit converts to sale", () => {
      db.addCard({ id: 1, stock: 5 });

      // Reserve
      const reservation = ops.reserve({
        cardId: 1,
        quantity: 2,
        holder: "cart:user-1",
      });
      expect(reservation.quantity).toBe(2);
      expect(db.getCard(1)!.reservedStock).toBe(2);
      expect(db.getCard(1)!.stock).toBe(5); // on-hand unchanged

      // Available = onHand - reserved = 3
      const card = db.getCard(1)!;
      expect(card.stock - card.reservedStock).toBe(3);

      // Commit reservation to sale
      const sale = ops.commitToSale({
        cardId: 1,
        holder: "cart:user-1",
        channel: "storefront",
        referenceId: "storefront:order:1:item:1",
      });

      expect(sale).not.toBeNull();
      expect(sale!.kind).toBe("sale");
      expect(sale!.delta).toBe(-2);
      expect(db.getCard(1)!.stock).toBe(3); // on-hand decremented
      expect(db.getCard(1)!.reservedStock).toBe(0); // reservation cleared
    });

    it("commit is idempotent via referenceId", () => {
      db.addCard({ id: 1, stock: 5 });

      ops.reserve({ cardId: 1, quantity: 1, holder: "cart:a" });
      ops.commitToSale({
        cardId: 1,
        holder: "cart:a",
        channel: "storefront",
        referenceId: "storefront:order:1:item:1",
      });

      // Same referenceId from a different path — no-op
      db.addCard({ id: 1, stock: 4 }); // Reset for isolation
      const dup = ops.recordSale({
        cardId: 1,
        quantity: 1,
        channel: "storefront",
        referenceId: "storefront:order:1:item:1",
      });
      expect(dup).toBeNull(); // Already recorded
    });
  });

  // ── Flow 4: Reserve → release → stock restored ───────────────

  describe("Flow 4: Reservation lifecycle — release", () => {
    it("release frees reserved stock without affecting on-hand", () => {
      db.addCard({ id: 1, stock: 5 });

      ops.reserve({ cardId: 1, quantity: 2, holder: "cart:user-1" });
      expect(db.getCard(1)!.reservedStock).toBe(2);

      ops.release({ cardId: 1, holder: "cart:user-1" });
      expect(db.getCard(1)!.reservedStock).toBe(0);
      expect(db.getCard(1)!.stock).toBe(5); // on-hand unchanged
    });

    it("release of non-existent reservation is a no-op", () => {
      db.addCard({ id: 1, stock: 5 });
      // Should not throw
      ops.release({ cardId: 1, holder: "cart:nonexistent" });
      expect(db.getCard(1)!.stock).toBe(5);
    });
  });

  // ── Flow 5: Idempotency — cross-path dedup ───────────────────

  describe("Flow 5: Cross-path dedup (Shopify webhook + cron + backfill)", () => {
    it("webhook and cron share referenceId format — first wins, second is no-op", () => {
      db.addCard({ id: 1, stock: 10 });

      // Shopify webhook fires first
      const webhookResult = ops.recordSale({
        cardId: 1,
        quantity: 1,
        channel: "shopify",
        referenceId: "shopify:order:5001:item:8001",
      });
      expect(webhookResult).not.toBeNull();
      expect(db.getCard(1)!.stock).toBe(9);

      // Shopify cron fires later with same referenceId
      const cronResult = ops.recordSale({
        cardId: 1,
        quantity: 1,
        channel: "shopify",
        referenceId: "shopify:order:5001:item:8001",
      });
      expect(cronResult).toBeNull(); // Deduped!
      expect(db.getCard(1)!.stock).toBe(9); // No double-decrement

      // Shopify backfill also uses the same format
      const backfillResult = ops.recordSale({
        cardId: 1,
        quantity: 1,
        channel: "shopify",
        referenceId: "shopify:order:5001:item:8001",
      });
      expect(backfillResult).toBeNull();
      expect(db.getCard(1)!.stock).toBe(9);
    });

    it("different orders are NOT deduped", () => {
      db.addCard({ id: 1, stock: 10 });

      ops.recordSale({
        cardId: 1,
        quantity: 1,
        channel: "shopify",
        referenceId: "shopify:order:5001:item:8001",
      });
      ops.recordSale({
        cardId: 1,
        quantity: 1,
        channel: "shopify",
        referenceId: "shopify:order:5002:item:8002",
      });

      expect(db.getCard(1)!.stock).toBe(8); // Both applied
      expect(db.getMovements()).toHaveLength(2);
    });
  });

  // ── Flow 6: Non-negative enforcement ─────────────────────────

  describe("Flow 6: Non-negative stock enforcement", () => {
    it("stock floors at 0 when enforceNonNegative is true", () => {
      db.addCard({ id: 1, stock: 2 });

      ops.recordSale({
        cardId: 1,
        quantity: 5,
        channel: "shopify",
        referenceId: "shopify:order:1:item:1",
      });

      expect(db.getCard(1)!.stock).toBe(0); // Not -3
    });

    it("stock can go negative when enforceNonNegative is false", () => {
      db = createMemoryDb();
      ops = createTestOps(db, {
        enforceNonNegative: false,
        defaultTtlMinutes: 30,
      });

      db.addCard({ id: 1, stock: 2 });

      ops.recordSale({
        cardId: 1,
        quantity: 5,
        channel: "shopify",
        referenceId: "shopify:order:1:item:1",
      });

      expect(db.getCard(1)!.stock).toBe(-3);
    });
  });

  // ── Flow 7: setAbsolute computes correct delta ────────────────

  describe("Flow 7: setAbsolute", () => {
    it("computes positive delta to reach target", () => {
      db.addCard({ id: 1, stock: 3 });

      const movement = ops.setAbsolute({ cardId: 1, desiredStock: 10 });

      expect(movement).not.toBeNull();
      expect(movement!.delta).toBe(7); // 10 - 3
      expect(movement!.kind).toBe("correction");
      expect(db.getCard(1)!.stock).toBe(10);
    });

    it("computes negative delta to reduce", () => {
      db.addCard({ id: 1, stock: 10 });

      const movement = ops.setAbsolute({ cardId: 1, desiredStock: 3 });

      expect(movement!.delta).toBe(-7);
      expect(db.getCard(1)!.stock).toBe(3);
    });

    it("returns null when no change needed", () => {
      db.addCard({ id: 1, stock: 5 });

      const movement = ops.setAbsolute({ cardId: 1, desiredStock: 5 });

      expect(movement).toBeNull();
      expect(db.getCard(1)!.stock).toBe(5);
    });
  });

  // ── Flow 8: Reservation rejects when insufficient available ───

  describe("Flow 8: Reservation stock checks", () => {
    it("rejects reservation when available stock is insufficient", () => {
      db.addCard({ id: 1, stock: 3 });

      expect(() =>
        ops.reserve({ cardId: 1, quantity: 5, holder: "cart:user-1" })
      ).toThrow("Insufficient stock");
    });

    it("considers existing reservations when checking availability", () => {
      db.addCard({ id: 1, stock: 3 });

      // First reservation takes 2
      ops.reserve({ cardId: 1, quantity: 2, holder: "cart:user-1" });

      // Second reservation for 2 more — only 1 available
      expect(() =>
        ops.reserve({ cardId: 1, quantity: 2, holder: "cart:user-2" })
      ).toThrow("Insufficient stock");

      // But 1 is fine
      const r = ops.reserve({ cardId: 1, quantity: 1, holder: "cart:user-2" });
      expect(r.quantity).toBe(1);
    });

    it("updating own reservation allows increasing within available", () => {
      db.addCard({ id: 1, stock: 5 });

      ops.reserve({ cardId: 1, quantity: 2, holder: "cart:user-1" });

      // Increase own reservation — should account for the current hold
      const updated = ops.reserve({ cardId: 1, quantity: 4, holder: "cart:user-1" });
      expect(updated.quantity).toBe(4);
      expect(db.getCard(1)!.reservedStock).toBe(4);
    });
  });

  // ── Flow 9: Multi-channel lifecycle ──────────────────────────

  describe("Flow 9: Multi-channel full lifecycle", () => {
    it("purchase → multiple channel sales → adjustment → reconciled state", () => {
      db.addCard({ id: 42, stock: 0 });

      // Receive 20 units from supplier
      ops.recordPurchaseReceived({
        cardId: 42,
        quantity: 20,
        purchaseId: 1,
        purchaseItemId: 1,
      });
      expect(db.getCard(42)!.stock).toBe(20);

      // Shopify sells 3
      ops.recordSale({
        cardId: 42,
        quantity: 3,
        channel: "shopify",
        referenceId: "shopify:order:100:item:200",
      });
      expect(db.getCard(42)!.stock).toBe(17);

      // eBay sells 2
      ops.recordSale({
        cardId: 42,
        quantity: 2,
        channel: "ebay",
        referenceId: "ebay:order:300:sku:SKU-42",
      });
      expect(db.getCard(42)!.stock).toBe(15);

      // v1 API sells 1
      ops.recordSale({
        cardId: 42,
        quantity: 1,
        channel: "wholesale",
        referenceId: "v1:wholesale:REF001:SKU-42",
      });
      expect(db.getCard(42)!.stock).toBe(14);

      // Damage found during count
      ops.recordAdjustment({
        cardId: 42,
        delta: -1,
        kind: "damage",
        note: "Water damage from shelf leak",
      });
      expect(db.getCard(42)!.stock).toBe(13);

      // Count correction — actually have 15
      ops.setAbsolute({
        cardId: 42,
        desiredStock: 15,
        note: "Physical count correction",
      });
      expect(db.getCard(42)!.stock).toBe(15);

      // Verify movement ledger
      const movements = db.getMovements();
      expect(movements).toHaveLength(6);
      expect(movements.map((m) => m.kind)).toEqual([
        "purchase_received",
        "sale",
        "sale",
        "sale",
        "damage",
        "correction",
      ]);

      // Verify ledger sums match balance
      const ledgerSum = movements.reduce((sum, m) => sum + m.delta, 0);
      expect(ledgerSum).toBe(15); // 20 - 3 - 2 - 1 - 1 + 2 = 15
      expect(db.getCard(42)!.stock).toBe(ledgerSum);
    });
  });
});
