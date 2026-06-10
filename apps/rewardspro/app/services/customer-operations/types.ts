/**
 * Customer Operations — types for the merchant-facing customer journey.
 *
 * The point of this module: when a customer emails support saying "I
 * didn't get my points for order #1234," the merchant's CS agent can
 * pull a single chronological timeline of EVERY loyalty event for
 * that customer (points, store credit, tier changes, raffles, mystery
 * boxes, challenges, gift cards) and answer in seconds rather than
 * navigating eight admin screens.
 *
 * Designed as a read-only aggregation. Never mutates state.
 */

/** Types of events that can appear in a customer's loyalty timeline. */
export type TimelineEventType =
  | "points-earned"
  | "points-spent"
  | "points-adjusted"
  | "store-credit-credited"
  | "store-credit-debited"
  | "tier-changed"
  | "raffle-entered"
  | "raffle-won"
  | "mystery-box-opened"
  | "mystery-box-won"
  | "challenge-claimed"
  | "gift-card-issued";

export interface TimelineEvent {
  /** Stable id for the event (typically the underlying ledger row id). */
  id: string;
  /** When this happened (ISO timestamp from the source row). */
  timestamp: Date;
  /** Discriminator for downstream UIs / filters. */
  type: TimelineEventType;
  /** One-line, human-readable summary suitable for support display. */
  description: string;
  /**
   * Numeric impact, when applicable (signed: positive = credit to
   * customer, negative = debit). For non-balance events (raffle entry,
   * tier change), undefined.
   */
  amount?: number;
  /**
   * The balance this event committed to, when the source row records
   * it (PointsLedger.balance / StoreCreditLedger.balance). For events
   * without a balance column, undefined.
   */
  balanceAfter?: number;
  /** Source-table row data the support agent might want to see. */
  context?: Record<string, unknown>;
}

export interface CurrentState {
  pointsBalance: number;
  lifetimePoints: number;
  storeCredit: number;
  currentTierId: string | null;
  currentTierName: string | null;
}

export interface CustomerJourneyReport {
  /** Customer identification. */
  customer: {
    id: string;
    shop: string;
    email: string | null;
    shopifyCustomerId: string | null;
    createdAt: Date;
  };
  /** What the customer's loyalty state looks like RIGHT NOW. */
  currentState: CurrentState;
  /** Chronologically ordered events (oldest first). */
  timeline: TimelineEvent[];
  /** Number of events returned (after any filtering / limits). */
  totalEvents: number;
  /**
   * Earliest event in the report. For an empty timeline, this equals
   * the customer's createdAt.
   */
  rangeFrom: Date;
  /** Latest event in the report (or `Date.now()` for empty timelines). */
  rangeTo: Date;
}

export interface JourneyOptions {
  /** Inclusive lower bound on event timestamps. Default: customer.createdAt. */
  since?: Date;
  /** Inclusive upper bound. Default: now. */
  until?: Date;
  /** Maximum events to return (after sorting). Default: 200. */
  limit?: number;
  /** Filter to only specific event types. Default: all. */
  types?: TimelineEventType[];
}
