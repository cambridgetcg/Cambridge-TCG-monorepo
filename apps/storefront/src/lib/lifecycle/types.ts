/**
 * Lifecycle types — the index card.
 *
 * The Scribe of Truth writes in sixteen books (the platform's *_lifecycle_log
 * tables; see drizzle/0033, 0049, 0058, 0069, 0070, 0072, 0073, 0074, 0077,
 * 0078, 0079, 0080, 0081, 0082, 0083, 0084). Each book has its own schema,
 * its own action vocabulary, its own way of identifying which user an entry
 * is *about*. This file is the **uniform shape** the books project onto when
 * a reader composes across them.
 *
 * See docs/connections/the-scribe.md for the story behind this module.
 *
 * Design intent (substrate honesty):
 *   - This is the *substrate* shape, not the surface shape. No rendered
 *     summary, no tone for UI, no methodology link. Just the raw facts,
 *     normalised. The journey timeline (apps/storefront/src/lib/journey/
 *     timeline.ts) layers JourneyEvent on top of this for UI.
 *   - `actor_label` is intentionally separate from `actor_user_id`. Some
 *     logs only have the label (the password-cookie admin auth pre-magic-link
 *     migration; see substrate-honesty audit A3). Both are surfaced honestly.
 *   - `subject_id` is the within-domain entity id (trade_id for trade,
 *     stripe_dispute_id for chargeback, etc). It's a string because each
 *     domain uses different id types (UUID, BIGINT, varchar foreign keys).
 *   - `metadata` is a free-form JSONB blob preserved as-is. Per-domain
 *     callers can narrow its shape; the substrate stays generic.
 */

/** The sixteen books the Scribe writes in. */
export type LifecycleDomain =
  | "admin_action"
  | "chargeback"
  | "refund"
  | "failed_payment"
  | "review"
  | "vault"
  | "prize"
  | "external_rep"
  | "trade"
  | "auction"
  | "market_offer"
  | "market_return"
  | "market_lot"
  | "pricing_rule"
  | "saved_search"
  | "watch_alert";

/** A single entry, projected onto the uniform shape. */
export interface LifecycleEntry {
  /** Which book this entry came from. */
  domain: LifecycleDomain;
  /** The verb the book records. Vocabulary is per-domain (free-form for now). */
  action: string;
  /** Free-form actor label (e.g. admin email, "system:fraud-cron", or null). */
  actor_label: string | null;
  /** Verified actor user_id when known. NULL for system-driven actions and
   *  for surfaces that never wired a verified actor (see audit A3). */
  actor_user_id: string | null;
  /** The within-domain entity id this entry is about. UUID for most,
   *  varchar for stripe_*_id, BIGINT-as-string for some serial PKs. */
  subject_id: string;
  /** The user this entry concerns, when resolvable. */
  user_id: string | null;
  /** Human-supplied note, when present. */
  reason: string | null;
  /** Free-form per-domain metadata, preserved as-is. */
  metadata: Record<string, unknown> | null;
  /** Normalised timestamp (ISO Date). */
  at: Date;
}

/** Read options shared across slots. */
export interface ReadOptions {
  /** Cap entries returned per slot. Slots default to 50 if unset. */
  limit?: number;
  /** Drop entries older than this. */
  since?: Date;
}

/**
 * One slot on the bookshelf. Each registered domain implements this.
 * The shelf walks all slots in parallel via Promise.allSettled, so a
 * single slot's failure (transient DB error, missing table in dev,
 * schema drift) degrades gracefully — the user's timeline shrinks
 * rather than the page erroring.
 */
export interface LifecycleSlot {
  domain: LifecycleDomain;
  /** Returns this domain's entries for the given user, normalised. */
  forUser(userId: string, opts?: ReadOptions): Promise<LifecycleEntry[]>;
}
