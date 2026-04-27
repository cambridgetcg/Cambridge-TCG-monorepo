/**
 * @module @cambridge-tcg/stock/types
 *
 * Domain types for the stock package. These are the public API types —
 * callers import these, not the Drizzle row types.
 */

// ─── Identifiers ───

/** Card ID from the cards table. Stock doesn't own cards — it references them. */
export type CardId = number;

/** Opaque movement ID. */
export type MovementId = number;

/** Opaque reservation ID. */
export type ReservationId = number;

// ─── Enums ───

/**
 * What happened to inventory.
 *
 * INBOUND: goods entering the warehouse
 *   - purchase_received: supplier order received
 *   - found: physical count found more than expected
 *   - return: customer returned goods
 *
 * OUTBOUND: goods leaving the warehouse
 *   - sale: sold through any channel
 *   - fulfillment: shipped to customer
 *   - damage: item damaged, removed from sellable stock
 *   - loss: item lost (shrinkage)
 *
 * NEUTRAL: corrections
 *   - correction: manual count correction (delta can be +/-)
 *   - reconciliation: system-generated correction from reconcile()
 */
export type MovementKind =
  | "purchase_received"
  | "found"
  | "return"
  | "sale"
  | "fulfillment"
  | "damage"
  | "loss"
  | "correction"
  | "reconciliation";

/** All valid movement kinds, for runtime validation. */
export const MOVEMENT_KINDS: readonly MovementKind[] = [
  "purchase_received",
  "found",
  "return",
  "sale",
  "fulfillment",
  "damage",
  "loss",
  "correction",
  "reconciliation",
] as const;

/**
 * Source channel. Extensible — new channels are added here.
 */
export type Channel =
  | "wholesale"
  | "shopify"
  | "ebay"
  | "manual"
  | "system"
  | (string & {}); // Allow arbitrary strings while keeping autocomplete

// ─── Domain Objects ───

/**
 * A single stock movement. The atomic unit of the ledger.
 * Append-only — once written, never modified.
 */
export interface StockMovement {
  id: MovementId;
  cardId: CardId;
  kind: MovementKind;
  channel: string;
  delta: number;
  referenceId: string | null;
  note: string | null;
  condition: string | null;
  createdAt: Date;
}

/**
 * The cached stock level for a card.
 */
export interface StockLevel {
  cardId: CardId;
  /** On-hand sellable quantity. Always ≥ 0. */
  onHand: number;
  /** Reserved by active carts/pending orders. Always ≥ 0. */
  reserved: number;
  /** Available = onHand - reserved. Can be 0 but not negative. */
  available: number;
  /** Ordered/shipped from suppliers, not yet received. */
  pending: number;
  /** When the balance was last reconciled against the ledger. */
  lastReconciledAt: Date | null;
}

/**
 * A time-limited hold on stock for a cart or pending order.
 */
export interface StockReservation {
  id: ReservationId;
  cardId: CardId;
  quantity: number;
  holder: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Reorder policy: for cards in this price band, keep this many in stock.
 */
export interface StockTarget {
  id: number;
  priceMin: number;
  priceMax: number;
  targetQty: number;
}

/**
 * Output of the reorder computation.
 */
export interface ReorderItem {
  cardId: CardId;
  sku: string;
  name: string;
  currentStock: number;
  pendingStock: number;
  targetQty: number;
  /** target - current - pending, floored at 0 */
  toOrder: number;
}

// ─── Events ───

/**
 * Emitted after any successful stock mutation.
 */
export interface StockChangedEvent {
  cardId: CardId;
  movementId: MovementId;
  kind: MovementKind;
  channel: string;
  delta: number;
  newOnHand: number;
  newAvailable: number;
  newPending: number;
  timestamp: Date;
}

/**
 * Emitted when available stock drops to zero or below target.
 */
export interface LowStockEvent {
  cardId: CardId;
  onHand: number;
  target: number | null;
  pending: number;
  timestamp: Date;
}

// ─── Reconciliation ───

export interface ReconciliationResult {
  cardId: CardId;
  storedBalance: number;
  derivedBalance: number;
  discrepancy: number;
}

// ─── Operation Parameter Types ───

export interface RecordSaleParams {
  cardId: CardId;
  quantity: number;
  channel: Channel;
  referenceId: string;
  note?: string;
  condition?: string;
}

export interface RecordPurchaseReceivedParams {
  cardId: CardId;
  quantity: number;
  purchaseId: number;
  purchaseItemId: number;
  condition?: string;
}

export interface RecordFulfillmentParams {
  cardId: CardId;
  quantity: number;
  orderId: number;
  orderItemId: number;
  fulfillmentDate: string;
}

export interface RecordAdjustmentParams {
  cardId: CardId;
  delta: number;
  kind: "correction" | "damage" | "loss" | "found" | "return";
  channel?: Channel;
  note?: string;
  referenceId?: string;
}

export interface SetAbsoluteParams {
  cardId: CardId;
  desiredStock: number;
  note?: string;
}

export interface ReserveParams {
  cardId: CardId;
  quantity: number;
  holder: string;
  ttlMinutes?: number;
}

export interface GetMovementsOptions {
  limit?: number;
  offset?: number;
  kind?: MovementKind;
  channel?: string;
  since?: Date;
}

export interface ListReorderQueueOptions {
  gameId?: number;
  minShortfall?: number;
}

export interface ListOutOfStockOptions {
  gameId?: number;
  includePending?: boolean;
}

// ─── Service Configuration ───

export interface StockServiceOptions {
  /** Default reservation TTL in minutes. Default: 30. */
  defaultReservationTtlMinutes?: number;
  /** Whether to enforce non-negative stock. Default: true. */
  enforceNonNegative?: boolean;
}
