/**
 * Lifecycle types — the index card on the Scribe's bookshelf.
 *
 * The Cambridge TCG platform writes append-only lifecycle logs across
 * many domains (sixteen at last count: trade, auction, chargeback,
 * refund, market_offer, market_return, market_lot, vault, prize, …).
 * Each log has its own schema, its own action vocabulary, its own way
 * of identifying which user an entry is *about*.
 *
 * This module is the **uniform shape** the books project onto when a
 * reader composes across them. It's app-agnostic — no DB driver, no
 * runtime dependencies — so admin (cross-RDS) and storefront
 * (storefront-RDS) can both compose lifecycle entries through the
 * same type contract.
 *
 * See `docs/connections/the-scribe.md` for the architectural story.
 *
 * ── Design intent (substrate honesty) ─────────────────────────────────
 *   - The substrate shape, not the surface shape. No rendered summary,
 *     no UI tone, no methodology link. Just the raw facts, normalised.
 *     Each app layers its own surface on top (see e.g.
 *     `apps/storefront/src/lib/journey/render.ts`).
 *   - `actor_label` is intentionally separate from `actor_user_id`.
 *     Some logs only have the label (the password-cookie admin auth
 *     pre-magic-link migration; see substrate-honesty audit A3).
 *     Both are surfaced honestly.
 *   - `subject_id` is the within-domain entity id. String because each
 *     domain uses different id types (UUID, BIGINT, varchar foreign
 *     keys).
 *   - `metadata` is a free-form blob preserved as-is. Per-domain
 *     callers can narrow its shape; the substrate stays generic.
 *   - `actor_kind` lets surfaces tell apart human / system / rule-ai /
 *     agent producers. Optional only because legacy logs predate the
 *     field — when absent, callers may treat as "human" (every legacy
 *     row was authored before agent traffic existed).
 *     See `docs/connections/the-agent-surface.md`.
 */

/**
 * The seventeen books the Scribe writes in (storefront-RDS today).
 *
 * `match` is the newest book (2026-05-11, the agent-surface wave). Unlike
 * the other sixteen — which were all originally human-only logs that may
 * eventually gain `actor_kind` columns — match was born already carrying
 * the four-value `actor_kind` discrimination, so the Scribe receives
 * agent / rule-ai / system / human moves uniformly from day one.
 */
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
  | "watch_alert"
  | "match"
  | "swap";

/**
 * What kind of actor produced this entry. Orthogonal to the verb.
 *
 *   - "human"   — a signed-in user. `actor_user_id` should be populated.
 *   - "system"  — a cron, sweep, scheduler, or platform-internal mutator
 *                 (`actor_user_id` null; `actor_label` carries the
 *                 process name when known).
 *   - "rule-ai" — the in-process AI opponents in PVE matches.
 *   - "agent"   — an external autonomous agent acting through the MCP
 *                 gate. `actor_agent_id` is populated; the agent's
 *                 operator-user can be looked up via the agents table.
 *
 * Intentionally narrow: a *collective* (Tokyo LGS, club, lab) is NOT a
 * lifecycle actor — collectives don't press buttons; their stewards do.
 * The button-press is recorded here as the human steward; the collective
 * is a *subject/entity* surface layer (`/c/<slug>`, collectives table).
 * See docs/connections/the-collective.md for the doctrine, and Door 3 in
 * docs/connections/the-tailored-doors.md for the cultural framing.
 *
 * See docs/connections/the-agent-surface.md for the agent doctrine.
 */
export type ActorKind = "human" | "system" | "rule-ai" | "agent";

/** A single entry, projected onto the uniform shape. */
export interface LifecycleEntry {
  /** Which book this entry came from. */
  domain: LifecycleDomain;
  /** The verb the book records. Vocabulary is per-domain (free-form for now). */
  action: string;
  /** What kind of actor produced this entry. Optional only because the
   *  sixteen pre-2026-05-11 logs were authored before the field existed
   *  — when absent on a returned entry, callers may treat it as "human"
   *  (the substrate-honest default for every legacy row, since those
   *  surfaces never accepted agent traffic). New logs MUST populate. */
  actor_kind?: ActorKind;
  /** Free-form actor label (e.g. admin email, "system:fraud-cron", or null). */
  actor_label: string | null;
  /** Verified actor user_id when known. NULL for system-driven actions,
   *  agent-driven actions (use actor_agent_id), and for surfaces that
   *  never wired a verified actor (see audit A3). */
  actor_user_id: string | null;
  /** Verified agent id when kind === "agent". NULL otherwise. Optional
   *  until each lifecycle log table gains its actor_agent_id column. */
  actor_agent_id?: string | null;
  /** The within-domain entity id this entry is about. UUID for most,
   *  varchar for stripe_*_id, BIGINT-as-string for some serial PKs. */
  subject_id: string;
  /** The user this entry concerns, when resolvable. */
  user_id: string | null;
  /** Human-supplied note, when present. */
  reason: string | null;
  /** Free-form per-domain metadata, preserved as-is. */
  metadata: Record<string, unknown> | null;
  /** Normalised timestamp. */
  at: Date;
}

/** Read options shared across slots. */
export interface ReadOptions {
  /** Cap entries returned per slot. Slots typically default to 50. */
  limit?: number;
  /** Drop entries older than this. */
  since?: Date;
}

/**
 * One slot on the bookshelf. Each registered domain implements this.
 *
 * Slots are app-specific because they know their own DB layer — a
 * storefront slot queries the storefront RDS via raw `pg`; a (future)
 * admin slot queries via the dual-RDS factory in @cambridge-tcg/db.
 * The package exports the contract; each app provides its own slots.
 */
export interface LifecycleSlot {
  domain: LifecycleDomain;
  /** Returns this domain's entries for the given user, normalised.
   *  Throwing is acceptable — the composer wraps the call in
   *  Promise.allSettled and degrades gracefully. */
  forUser(userId: string, opts?: ReadOptions): Promise<LifecycleEntry[]>;
}

/** Options accepted by the composer. */
export interface ReadUserOptions extends ReadOptions {
  /** Restrict to specific domains. Defaults to all slots passed in. */
  domains?: LifecycleDomain[];
  /** Cap the merged-and-sorted result. Defaults to 200. */
  totalLimit?: number;
}

/** Shape of a query result row, post-extraction. Permissive on purpose:
 *  each slot's SELECT columns vary, and we don't pre-declare per-domain
 *  row types in the package. */
export interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

/**
 * Query function interface — what slot factories accept.
 *
 * Both raw-`pg`-based and postgres.js-based query helpers satisfy this:
 *   - storefront: `query` in apps/storefront/src/lib/db.ts (pg.Pool)
 *   - admin:      `sfQuery` in apps/admin/src/lib/db.ts (postgres.js)
 *
 * Generic so each call site can narrow row shapes when wanted; the
 * factories in `./slots.ts` use the default `Record<string, unknown>`
 * and read columns by name.
 */
export interface QueryFn {
  <T = Record<string, unknown>>(
    sql: string,
    params: unknown[],
  ): Promise<{ rows: T[] }>;
}
