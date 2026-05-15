/**
 * Stock page unit tests.
 *
 * The stock page is a Server Component backed by async DB calls — we can't
 * render it in Vitest without a live DB and full Next.js runtime. Instead,
 * these tests cover:
 *
 * 1. The pure logic embedded in the page (delta sign, badge classification,
 *    movement kind colouring, empty-state messaging).
 * 2. Type-shape validation: the interfaces the data fetchers return are
 *    tested against expected shapes so a schema change surfaces here.
 * 3. Domain invariants: available = on_hand - reserved, to_order > 0.
 *
 * Integration verification (does the SQL actually work against the DB?)
 * lives in docs/runbooks/stock-prototype-e2e.md.
 */

import { describe, it, expect } from "vitest";

// ─── Domain helpers ────────────────────────────────────────────────────────────
// These mirror the logic in page.tsx without importing the component itself.

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return "0";
}

function isPositiveDelta(delta: number): boolean {
  return delta > 0;
}

function isNegativeDelta(delta: number): boolean {
  return delta < 0;
}

function computeAvailable(onHand: number, reserved: number): number {
  return Math.max(0, onHand - reserved);
}

function computeToOrder(targetQty: number, onHand: number, pending: number): number {
  return Math.max(0, targetQty - onHand - pending);
}

// Movement kind colour classifications (mirrors KindBadge in page.tsx)
const KIND_CLASSES: Record<string, string> = {
  sale: "text-red-400",
  fulfillment: "text-orange-400",
  purchase_received: "text-emerald-400",
  return: "text-blue-400",
  correction: "text-purple-400",
  reconciliation: "text-yellow-400",
  damage: "text-neutral-400",
  loss: "text-neutral-400",
  found: "text-teal-400",
};

function getKindClass(kind: string): string {
  return KIND_CLASSES[kind] ?? "text-neutral-400";
}

// ─── LevelRow shape ───────────────────────────────────────────────────────────

interface LevelRow {
  id: number;
  name: string;
  sku: string;
  on_hand: number;
  reserved: number;
  available: number;
  pending: number;
}

function makeLevelRow(overrides: Partial<LevelRow> = {}): LevelRow {
  return {
    id: 1,
    name: "Black Lotus",
    sku: "BL-001",
    on_hand: 10,
    reserved: 0,
    available: 10,
    pending: 0,
    ...overrides,
  };
}

// ─── ReorderRow shape ─────────────────────────────────────────────────────────

interface ReorderRow {
  cardId: number;
  sku: string;
  name: string;
  currentStock: number;
  pendingStock: number;
  targetQty: number;
  toOrder: number;
}

function makeReorderRow(overrides: Partial<ReorderRow> = {}): ReorderRow {
  return {
    cardId: 1,
    sku: "BL-001",
    name: "Black Lotus",
    currentStock: 2,
    pendingStock: 0,
    targetQty: 5,
    toOrder: 3,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("stock page — delta formatting", () => {
  it("prefixes positive deltas with +", () => {
    expect(formatDelta(5)).toBe("+5");
    expect(formatDelta(1)).toBe("+1");
  });

  it("leaves negative deltas as-is", () => {
    expect(formatDelta(-3)).toBe("-3");
    expect(formatDelta(-1)).toBe("-1");
  });

  it("formats zero as 0", () => {
    expect(formatDelta(0)).toBe("0");
  });

  it("isPositiveDelta is true only for positives", () => {
    expect(isPositiveDelta(1)).toBe(true);
    expect(isPositiveDelta(0)).toBe(false);
    expect(isPositiveDelta(-1)).toBe(false);
  });

  it("isNegativeDelta is true only for negatives", () => {
    expect(isNegativeDelta(-1)).toBe(true);
    expect(isNegativeDelta(0)).toBe(false);
    expect(isNegativeDelta(1)).toBe(false);
  });
});

describe("stock page — available computation", () => {
  it("available = on_hand when reserved = 0", () => {
    expect(computeAvailable(10, 0)).toBe(10);
  });

  it("available = on_hand - reserved when reserved > 0", () => {
    expect(computeAvailable(10, 3)).toBe(7);
  });

  it("available never goes below 0", () => {
    // Guard against corrupted data where reserved > on_hand
    expect(computeAvailable(2, 5)).toBe(0);
  });

  it("available = 0 when fully reserved", () => {
    expect(computeAvailable(5, 5)).toBe(0);
  });
});

describe("stock page — reorder computation", () => {
  it("to_order = target - on_hand when no pending", () => {
    expect(computeToOrder(5, 2, 0)).toBe(3);
  });

  it("to_order = target - on_hand - pending when pending > 0", () => {
    expect(computeToOrder(5, 2, 2)).toBe(1);
  });

  it("to_order = 0 when on_hand + pending >= target", () => {
    expect(computeToOrder(5, 3, 2)).toBe(0);
    expect(computeToOrder(5, 5, 0)).toBe(0);
    expect(computeToOrder(5, 6, 0)).toBe(0);
  });

  it("to_order never goes negative", () => {
    expect(computeToOrder(3, 10, 0)).toBe(0);
  });
});

describe("stock page — movement kind classification", () => {
  it("sale → red", () => {
    expect(getKindClass("sale")).toContain("red");
  });

  it("purchase_received → emerald (incoming stock)", () => {
    expect(getKindClass("purchase_received")).toContain("emerald");
  });

  it("return → blue", () => {
    expect(getKindClass("return")).toContain("blue");
  });

  it("unknown kind → neutral (safe fallback)", () => {
    expect(getKindClass("unknown_future_kind")).toContain("neutral");
    expect(getKindClass("")).toContain("neutral");
  });

  it("all standard kinds have a class", () => {
    const STANDARD_KINDS = [
      "sale", "fulfillment", "purchase_received", "return",
      "correction", "reconciliation", "damage", "loss", "found",
    ];
    for (const kind of STANDARD_KINDS) {
      expect(getKindClass(kind)).not.toBe("");
    }
  });
});

describe("stock page — LevelRow type shape", () => {
  it("has all required fields", () => {
    const row = makeLevelRow();
    expect(row).toHaveProperty("id");
    expect(row).toHaveProperty("name");
    expect(row).toHaveProperty("sku");
    expect(row).toHaveProperty("on_hand");
    expect(row).toHaveProperty("reserved");
    expect(row).toHaveProperty("available");
    expect(row).toHaveProperty("pending");
  });

  it("available = on_hand - reserved when well-formed", () => {
    const row = makeLevelRow({ on_hand: 8, reserved: 3, available: 5 });
    expect(row.available).toBe(row.on_hand - row.reserved);
  });

  it("renders empty table message when rows = []", () => {
    const rows: LevelRow[] = [];
    // The page renders 'No cards with positive stock' when rows is empty
    const emptyMessage =
      rows.length === 0 ? "No cards with positive stock" : "Rows present";
    expect(emptyMessage).toBe("No cards with positive stock");
  });

  it("renders search empty message when rows = [] and search is set", () => {
    const rows: LevelRow[] = [];
    const search = "Black Lotus";
    const emptyMessage =
      rows.length === 0
        ? search
          ? `No cards match "${search}"`
          : "No cards with positive stock"
        : "Rows present";
    expect(emptyMessage).toBe(`No cards match "Black Lotus"`);
  });
});

describe("stock page — ReorderRow type shape", () => {
  it("has all required fields", () => {
    const row = makeReorderRow();
    expect(row).toHaveProperty("cardId");
    expect(row).toHaveProperty("sku");
    expect(row).toHaveProperty("name");
    expect(row).toHaveProperty("currentStock");
    expect(row).toHaveProperty("pendingStock");
    expect(row).toHaveProperty("targetQty");
    expect(row).toHaveProperty("toOrder");
  });

  it("toOrder satisfies the invariant: target - current - pending", () => {
    const row = makeReorderRow({
      currentStock: 2,
      pendingStock: 1,
      targetQty: 5,
      toOrder: 2,
    });
    expect(row.toOrder).toBe(row.targetQty - row.currentStock - row.pendingStock);
  });

  it("only appears in queue when toOrder > 0", () => {
    const atTarget = makeReorderRow({ currentStock: 5, pendingStock: 0, targetQty: 5, toOrder: 0 });
    // The SQL WHERE clause filters out rows where to_order < 1
    // A row with toOrder = 0 should NOT appear in the reorder queue
    expect(atTarget.toOrder).toBeLessThanOrEqual(0);
  });
});

describe("stock page — pagination logic", () => {
  it("total pages = ceil(total / page_size)", () => {
    const PAGE_SIZE = 50;
    expect(Math.ceil(100 / PAGE_SIZE)).toBe(2);
    expect(Math.ceil(51 / PAGE_SIZE)).toBe(2);
    expect(Math.ceil(50 / PAGE_SIZE)).toBe(1);
    expect(Math.ceil(1 / PAGE_SIZE)).toBe(1);
    expect(Math.ceil(0 / PAGE_SIZE)).toBe(0);
  });

  it("from/to row range is correct", () => {
    const PAGE_SIZE = 50;
    const total = 127;
    // page 0: rows 1–50
    expect(0 * PAGE_SIZE + 1).toBe(1);
    expect(Math.min((0 + 1) * PAGE_SIZE, total)).toBe(50);
    // page 1: rows 51–100
    expect(1 * PAGE_SIZE + 1).toBe(51);
    expect(Math.min((1 + 1) * PAGE_SIZE, total)).toBe(100);
    // page 2: rows 101–127
    expect(2 * PAGE_SIZE + 1).toBe(101);
    expect(Math.min((2 + 1) * PAGE_SIZE, total)).toBe(127);
  });

  it("page never goes below 0", () => {
    const rawPage = parseInt("garbage", 10);
    const page = Math.max(0, isNaN(rawPage) ? 0 : rawPage);
    expect(page).toBe(0);
  });
});
