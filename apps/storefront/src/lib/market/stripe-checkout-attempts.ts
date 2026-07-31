import "server-only";

import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { query, transaction } from "@/lib/db";

export const STRIPE_CHECKOUT_RAIL = "stripe_checkout" as const;
export const STRIPE_CHECKOUT_SNAPSHOT_VERSION = "stripe_checkout/v2" as const;

const MIN_CHECKOUT_START_MINUTES = 31;
const MAX_CHECKOUT_LIFETIME_HOURS = 23;

export type StripeCheckoutAttemptStatus =
  | "reserved"
  | "checkout_open"
  | "processing"
  | "settled"
  | "expired"
  | "failed"
  | "requires_review";

export interface StripeCheckoutRequestSnapshot {
  version: typeof STRIPE_CHECKOUT_SNAPSHOT_VERSION;
  client_reference_id: string;
  product_name: string;
  product_description: string;
  image_url: string | null;
  customer_email: string | null;
  shipping_allowed_countries: string[];
  adaptive_pricing_enabled: false;
  success_url: string;
  cancel_url: string;
}

export interface StripeCheckoutAttempt {
  id: string;
  tradeId: string;
  generation: number;
  status: StripeCheckoutAttemptStatus;
  idempotencyKey: string;
  request: StripeCheckoutRequestSnapshot;
  expectedAmountPence: number;
  expectedCurrency: "gbp";
  stripeSessionId: string | null;
  stripePaymentIntent: string | null;
  providerExpiresAt: string;
  reviewReason: string | null;
}

interface AttemptRow {
  id: string;
  trade_id: string;
  generation: number | string;
  status: StripeCheckoutAttemptStatus;
  idempotency_key: string;
  request_snapshot: unknown;
  expected_amount_pence: number | string;
  expected_currency: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  provider_expires_at: string | Date;
  review_reason: string | null;
}

interface TradeReservationRow {
  id: string;
  buyer_id: string;
  escrow_status: string;
  sku: string;
  card_name: string;
  image_url: string | null;
  buyer_email: string | null;
  stripe_session_id: string | null;
  expected_amount_pence: string;
  payment_window_open: boolean;
  checkout_start_allowed: boolean;
  next_attempt_expires_at: string | Date;
}

export type ReserveStripeCheckoutFailure = {
  ok: false;
  reason:
    | "not_found"
    | "forbidden"
    | "trade_not_awaiting_payment"
    | "payment_window_expired"
    | "payment_window_too_short"
    | "rail_conflict";
  reservedRail?: string;
};

export type ReserveStripeCheckoutResult =
  | {
      ok: true;
      kind: "attempt";
      attempt: StripeCheckoutAttempt;
      reused: boolean;
    }
  | {
      ok: true;
      kind: "legacy_session";
      stripeSessionId: string;
      reused: true;
    }
  | ReserveStripeCheckoutFailure;

export type StripeMarketSettlementResult =
  | { ok: true; applied: boolean; trade: Record<string, unknown> | null }
  | { ok: false; reason: string; reviewRecorded: boolean };

function isoTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Database returned an invalid timestamp.");
  return date.toISOString();
}

function positiveSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Database returned an invalid ${field}.`);
  }
  return parsed;
}

function parseSnapshot(value: unknown): StripeCheckoutRequestSnapshot {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      throw new Error("Stored Stripe Checkout request snapshot is not valid JSON.");
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Stored Stripe Checkout request snapshot is invalid.");
  }
  const row = candidate as Record<string, unknown>;
  const required = [
    "client_reference_id",
    "product_name",
    "product_description",
    "success_url",
    "cancel_url",
  ] as const;
  if (
    row.version !== STRIPE_CHECKOUT_SNAPSHOT_VERSION
    || required.some((key) => typeof row[key] !== "string" || row[key].length === 0)
    || (row.image_url !== null && typeof row.image_url !== "string")
    || (row.customer_email !== null && typeof row.customer_email !== "string")
    || !Array.isArray(row.shipping_allowed_countries)
    || row.shipping_allowed_countries.length === 0
    || row.shipping_allowed_countries.some((country) =>
      typeof country !== "string" || !/^[A-Z]{2}$/.test(country)
    )
    || row.adaptive_pricing_enabled !== false
  ) {
    throw new Error("Stored Stripe Checkout request snapshot has an unknown shape.");
  }
  return row as unknown as StripeCheckoutRequestSnapshot;
}

function attemptFromRow(row: AttemptRow): StripeCheckoutAttempt {
  if (row.expected_currency !== "gbp") {
    throw new Error("Stored Stripe Checkout attempt has an unsupported currency.");
  }
  return {
    id: row.id,
    tradeId: row.trade_id,
    generation: positiveSafeInteger(row.generation, "attempt generation"),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    request: parseSnapshot(row.request_snapshot),
    expectedAmountPence: positiveSafeInteger(row.expected_amount_pence, "attempt amount"),
    expectedCurrency: "gbp",
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntent: row.stripe_payment_intent,
    providerExpiresAt: isoTimestamp(row.provider_expires_at),
    reviewReason: row.review_reason,
  };
}

export function normalizeCheckoutSiteUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Checkout site URL must use HTTP or HTTPS.");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

const ATTEMPT_COLUMNS = `
  id, trade_id, generation, status, idempotency_key, request_snapshot,
  expected_amount_pence, expected_currency, stripe_session_id,
  stripe_payment_intent, provider_expires_at, review_reason`;

export async function reserveStripeCheckoutAttempt(input: {
  tradeId: string;
  buyerId: string;
  siteUrl: string;
  shippingAllowedCountries: string[];
}): Promise<ReserveStripeCheckoutResult> {
  const siteUrl = normalizeCheckoutSiteUrl(input.siteUrl);
  if (
    input.shippingAllowedCountries.length === 0
    || input.shippingAllowedCountries.some((country) => !/^[A-Z]{2}$/.test(country))
  ) {
    throw new Error("Stripe Checkout shipping countries are invalid.");
  }
  return transaction(async (tx) => {
    const tradeResult = await tx(
      `SELECT t.id, t.buyer_id, t.escrow_status::text, t.sku,
              COALESCE(o.card_name, t.sku) AS card_name, o.image_url,
              u.email AS buyer_email, t.stripe_session_id,
              (t.price * t.quantity * 100)::bigint::text AS expected_amount_pence,
              (t.payment_expires_at IS NULL OR t.payment_expires_at > NOW())
                AS payment_window_open,
              (t.payment_expires_at IS NULL OR
                t.payment_expires_at >= NOW() + INTERVAL '${MIN_CHECKOUT_START_MINUTES} minutes')
                AS checkout_start_allowed,
              LEAST(
                COALESCE(t.payment_expires_at, NOW() + INTERVAL '${MAX_CHECKOUT_LIFETIME_HOURS} hours'),
                NOW() + INTERVAL '${MAX_CHECKOUT_LIFETIME_HOURS} hours'
              ) AS next_attempt_expires_at
         FROM market_trades t
         JOIN users u ON u.id = t.buyer_id
         LEFT JOIN market_orders o ON o.id = t.bid_order_id
        WHERE t.id = $1
        FOR UPDATE OF t`,
      [input.tradeId],
    );
    if (!tradeResult.rows[0]) return { ok: false, reason: "not_found" } as const;
    const trade = tradeResult.rows[0] as TradeReservationRow;
    if (trade.buyer_id !== input.buyerId) return { ok: false, reason: "forbidden" } as const;
    if (trade.escrow_status !== "awaiting_payment") {
      return { ok: false, reason: "trade_not_awaiting_payment" } as const;
    }
    if (!trade.payment_window_open) {
      return { ok: false, reason: "payment_window_expired" } as const;
    }

    // PostgreSQL canonicalizes UUID input. Provider-facing identifiers must
    // use that canonical value: uppercase/braced UUID spellings are equal in
    // Postgres but different strings to Stripe's idempotency and metadata.
    const tradeId = trade.id;

    const reservation = await tx(
      `SELECT rail
         FROM market_trade_settlement_reservations
        WHERE trade_id = $1
        FOR UPDATE`,
      [tradeId],
    );
    const reservedRail = reservation.rows[0]?.rail as string | undefined;
    if (reservedRail && reservedRail !== STRIPE_CHECKOUT_RAIL) {
      return { ok: false, reason: "rail_conflict", reservedRail } as const;
    }

    const active = await tx(
      `SELECT ${ATTEMPT_COLUMNS}
         FROM market_trade_stripe_checkout_attempts
        WHERE trade_id = $1
          AND status IN ('reserved', 'checkout_open', 'processing', 'requires_review')
        ORDER BY generation DESC
        LIMIT 1
        FOR UPDATE`,
      [tradeId],
    );
    if (active.rows[0]) {
      return {
        ok: true,
        kind: "attempt",
        attempt: attemptFromRow(active.rows[0] as AttemptRow),
        reused: true,
      } as const;
    }

    // A session created before the v2 ledger shipped remains authoritative.
    // The route retrieves it and may only retire it after Stripe explicitly
    // reports `expired`; ambiguous lookup failures never mint a replacement.
    if (trade.stripe_session_id) {
      const historical = await tx(
        `SELECT status
           FROM market_trade_stripe_checkout_attempts
          WHERE trade_id = $1 AND stripe_session_id = $2
          LIMIT 1`,
        [tradeId, trade.stripe_session_id],
      );
      // No ledger row means this session predates v2 and must be reconciled
      // by exact provider id. A v2 expired/failed row is already authoritative
      // terminal evidence, so its legacy compatibility column must not block
      // the next generation.
      if (!historical.rows[0]) {
        return {
          ok: true,
          kind: "legacy_session",
          stripeSessionId: trade.stripe_session_id,
          reused: true,
        } as const;
      }
    }
    if (!trade.checkout_start_allowed) {
      return { ok: false, reason: "payment_window_too_short" } as const;
    }
    if (!reservedRail) {
      await tx(
        `INSERT INTO market_trade_settlement_reservations
           (trade_id, rail, reserved_by)
         VALUES ($1, $2, $3)`,
        [tradeId, STRIPE_CHECKOUT_RAIL, input.buyerId],
      );
    }

    const generationResult = await tx(
      `SELECT COALESCE(MAX(generation), 0)::int + 1 AS generation
         FROM market_trade_stripe_checkout_attempts
        WHERE trade_id = $1`,
      [tradeId],
    );
    const generation = positiveSafeInteger(
      generationResult.rows[0]?.generation ?? 1,
      "next attempt generation",
    );
    const attemptId = randomUUID();
    const idempotencyKey = `ctcg:market-trade:${tradeId}:stripe:${attemptId}`;
    const snapshot: StripeCheckoutRequestSnapshot = {
      version: STRIPE_CHECKOUT_SNAPSHOT_VERSION,
      client_reference_id: `ctcg-market-trade:${tradeId}:${attemptId}`,
      product_name: trade.card_name,
      product_description: `P2P trade — ${trade.sku}`,
      image_url: trade.image_url || null,
      customer_email: trade.buyer_email || null,
      shipping_allowed_countries: [...input.shippingAllowedCountries],
      adaptive_pricing_enabled: false,
      success_url: `${siteUrl}/account/trades?paid=${tradeId}`,
      cancel_url: `${siteUrl}/account/trades`,
    };
    const inserted = await tx(
      `INSERT INTO market_trade_stripe_checkout_attempts
         (id, trade_id, generation, status, idempotency_key,
          request_snapshot, expected_amount_pence, expected_currency,
          provider_expires_at)
       VALUES ($1, $2, $3, 'reserved', $4, $5::jsonb, $6, 'gbp', $7)
       RETURNING ${ATTEMPT_COLUMNS}`,
      [
        attemptId,
        tradeId,
        generation,
        idempotencyKey,
        JSON.stringify(snapshot),
        trade.expected_amount_pence,
        isoTimestamp(trade.next_attempt_expires_at),
      ],
    );
    return {
      ok: true,
      kind: "attempt",
      attempt: attemptFromRow(inserted.rows[0] as AttemptRow),
      reused: false,
    } as const;
  });
}

export async function getStripeCheckoutAttempt(attemptId: string): Promise<StripeCheckoutAttempt | null> {
  const result = await query(
    `SELECT ${ATTEMPT_COLUMNS}
       FROM market_trade_stripe_checkout_attempts
      WHERE id = $1`,
    [attemptId],
  );
  return result.rows[0] ? attemptFromRow(result.rows[0] as AttemptRow) : null;
}

export type StripeMarketCheckoutBinding =
  | { kind: "v2"; tradeId: string; attemptId: string }
  | { kind: "legacy" | "legacy_terminal"; tradeId: string; attemptId: null };

/**
 * Resolve local market ownership before mutable Stripe metadata is allowed to
 * select a fulfilment branch. Session id wins; the frozen client reference is
 * the pre-attach race fallback; legacy compatibility/evidence comes last.
 */
export async function findStripeMarketCheckoutBinding(
  session: Stripe.Checkout.Session,
): Promise<StripeMarketCheckoutBinding | null> {
  const result = await query(
    `SELECT kind, trade_id, attempt_id
       FROM (
         SELECT 'v2'::text AS kind, trade_id, id AS attempt_id, 1 AS priority
           FROM market_trade_stripe_checkout_attempts
          WHERE stripe_session_id = $1
         UNION ALL
         SELECT 'v2'::text, trade_id, id, 2
           FROM market_trade_stripe_checkout_attempts
          WHERE stripe_session_id IS NULL
            AND request_snapshot->>'client_reference_id' = $2
         UNION ALL
         SELECT 'legacy'::text, id, NULL::uuid, 3
           FROM market_trades
          WHERE stripe_session_id = $1
         UNION ALL
         SELECT 'legacy_terminal'::text, trade_id, NULL::uuid, 4
           FROM market_trade_legacy_stripe_terminal_events
          WHERE stripe_session_id = $1
       ) binding
      ORDER BY priority
      LIMIT 1`,
    [session.id, session.client_reference_id],
  );
  const row = result.rows[0] as {
    kind: "v2" | "legacy" | "legacy_terminal";
    trade_id: string;
    attempt_id: string | null;
  } | undefined;
  if (!row) return null;
  return row.kind === "v2"
    ? { kind: "v2", tradeId: row.trade_id, attemptId: row.attempt_id! }
    : { kind: row.kind, tradeId: row.trade_id, attemptId: null };
}

export async function attachStripeCheckoutSession(input: {
  attemptId: string;
  stripeSessionId: string;
}): Promise<boolean> {
  return transaction(async (tx) => {
    const tradeLock = await tx(
      `SELECT t.id
         FROM market_trades t
         JOIN market_trade_stripe_checkout_attempts a ON a.trade_id = t.id
        WHERE a.id = $1
        FOR UPDATE OF t`,
      [input.attemptId],
    );
    if (!tradeLock.rows[0]) return false;
    const reservation = await tx(
      `SELECT rail FROM market_trade_settlement_reservations
        WHERE trade_id = $1 FOR UPDATE`,
      [tradeLock.rows[0].id],
    );
    if (reservation.rows[0]?.rail !== STRIPE_CHECKOUT_RAIL) return false;
    const bound = await tx(
      `UPDATE market_trade_stripe_checkout_attempts
          SET status = 'checkout_open',
              stripe_session_id = COALESCE(stripe_session_id, $2),
              updated_at = NOW()
        WHERE id = $1
          AND status IN ('reserved', 'checkout_open')
          AND (stripe_session_id IS NULL OR stripe_session_id = $2)
        RETURNING trade_id`,
      [input.attemptId, input.stripeSessionId],
    );
    if (!bound.rows[0]) return false;
    const trade = await tx(
      `UPDATE market_trades t
          SET stripe_session_id = $2, updated_at = NOW()
        WHERE t.id = $1
          AND t.escrow_status = 'awaiting_payment'
          AND EXISTS (
            SELECT 1 FROM market_trade_settlement_reservations r
             WHERE r.trade_id = t.id AND r.rail = 'stripe_checkout'
          )
        RETURNING t.id`,
      [tradeLock.rows[0].id, input.stripeSessionId],
    );
    if (!trade.rows[0]) throw new Error("Trade moved before its Stripe session could be bound.");
    return true;
  });
}

export async function retireLegacyStripeSession(input: {
  tradeId: string;
  stripeSessionId: string;
  status: "expired" | "failed";
}): Promise<StripeMarketSettlementResult> {
  return transaction(async (tx) => {
    const alreadyRecorded = await tx(
      `SELECT terminal_status
         FROM market_trade_legacy_stripe_terminal_events
        WHERE trade_id = $1 AND stripe_session_id = $2`,
      [input.tradeId, input.stripeSessionId],
    );
    if (alreadyRecorded.rows[0]) {
      return { ok: true, applied: false, trade: null } as const;
    }
    const trade = await tx(
      `SELECT id, buyer_id
         FROM market_trades
        WHERE id = $1
          AND escrow_status = 'awaiting_payment'
          AND stripe_session_id = $2
        FOR UPDATE`,
      [input.tradeId, input.stripeSessionId],
    );
    if (!trade.rows[0]) {
      // A concurrent identical delivery may have waited on the trade lock
      // and observed it only after the winner cleared the compatibility id.
      const racedObservation = await tx(
        `SELECT terminal_status
           FROM market_trade_legacy_stripe_terminal_events
          WHERE trade_id = $1 AND stripe_session_id = $2`,
        [input.tradeId, input.stripeSessionId],
      );
      if (racedObservation.rows[0]) {
        return { ok: true, applied: false, trade: null } as const;
      }
      return { ok: false, reason: "legacy Stripe session is not the stored session", reviewRecorded: false } as const;
    }
    await tx(
      `INSERT INTO market_trade_settlement_reservations (trade_id, rail, reserved_by)
       VALUES ($1, 'stripe_checkout', $2)
       ON CONFLICT (trade_id) DO NOTHING`,
      [trade.rows[0].id, trade.rows[0].buyer_id],
    );
    const reservation = await tx(
      `SELECT rail FROM market_trade_settlement_reservations
        WHERE trade_id = $1 FOR UPDATE`,
      [trade.rows[0].id],
    );
    if (reservation.rows[0]?.rail !== STRIPE_CHECKOUT_RAIL) {
      return { ok: false, reason: "legacy Checkout conflicts with reserved rail", reviewRecorded: false } as const;
    }
    const ledgerAttempt = await tx(
      `SELECT id
         FROM market_trade_stripe_checkout_attempts
        WHERE trade_id = $1 AND stripe_session_id = $2
        FOR UPDATE`,
      [trade.rows[0].id, input.stripeSessionId],
    );
    if (ledgerAttempt.rows[0]) {
      const problem = "v2 Checkout arrived without its immutable payment_attempt_id metadata";
      await markReview(tx, ledgerAttempt.rows[0].id as string, [problem]);
      return { ok: false, reason: problem, reviewRecorded: true } as const;
    }
    const observation = await tx(
      `INSERT INTO market_trade_legacy_stripe_terminal_events
         (stripe_session_id, trade_id, terminal_status)
       VALUES ($1, $2, $3)
       ON CONFLICT (stripe_session_id) DO NOTHING
       RETURNING stripe_session_id`,
      [input.stripeSessionId, trade.rows[0].id, input.status],
    );
    if (!observation.rows[0]) {
      const winner = await tx(
        `SELECT trade_id
           FROM market_trade_legacy_stripe_terminal_events
          WHERE stripe_session_id = $1`,
        [input.stripeSessionId],
      );
      if (winner.rows[0]?.trade_id !== trade.rows[0].id) {
        throw new Error("Legacy Stripe terminal Session is already bound to another trade.");
      }
    }
    const result = await tx(
      `UPDATE market_trades
          SET stripe_session_id = NULL, updated_at = NOW()
        WHERE id = $1
          AND escrow_status = 'awaiting_payment'
          AND stripe_session_id = $2
        RETURNING id`,
      [trade.rows[0].id, input.stripeSessionId],
    );
    if (!result.rows[0]) {
      throw new Error("Legacy Stripe terminal evidence lost its trade state guard.");
    }
    return { ok: true, applied: true, trade: null } as const;
  });
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
}

export function stripeCheckoutAttemptBindingProblems(
  attempt: StripeCheckoutAttempt,
  session: Stripe.Checkout.Session,
): string[] {
  const problems: string[] = [];
  if (session.metadata?.type !== "market_trade_payment") problems.push("wrong metadata type");
  if (session.metadata?.trade_id !== attempt.tradeId) problems.push("wrong trade id");
  if (session.metadata?.payment_attempt_id !== attempt.id) problems.push("wrong attempt id");
  if (session.metadata?.settlement_rail !== STRIPE_CHECKOUT_RAIL) problems.push("wrong rail");
  if (session.client_reference_id !== attempt.request.client_reference_id) {
    problems.push("wrong client reference");
  }
  if (attempt.stripeSessionId && attempt.stripeSessionId !== session.id) {
    problems.push("wrong Stripe session");
  }
  if (
    attempt.stripePaymentIntent
    && attempt.stripePaymentIntent !== paymentIntentId(session)
  ) {
    problems.push("wrong PaymentIntent");
  }
  if (session.amount_total !== attempt.expectedAmountPence) problems.push("wrong amount");
  if (session.currency?.toLowerCase() !== attempt.expectedCurrency) problems.push("wrong currency");
  if (session.mode !== "payment") problems.push("wrong Checkout mode");
  if (
    session.expires_at
    !== Math.floor(new Date(attempt.providerExpiresAt).getTime() / 1000)
  ) {
    problems.push("wrong provider expiry");
  }
  if (session.adaptive_pricing?.enabled !== false) {
    problems.push("adaptive pricing is not disabled");
  }
  return problems;
}

function attemptRowBindingProblems(row: AttemptRow, session: Stripe.Checkout.Session): string[] {
  return stripeCheckoutAttemptBindingProblems(attemptFromRow(row), session);
}

export async function markStripeCheckoutAttemptForReview(
  attemptId: string,
  reason: string,
): Promise<void> {
  await query(
    `UPDATE market_trade_stripe_checkout_attempts
        SET status = CASE
              WHEN status = 'settled' THEN status
              ELSE 'requires_review'
            END,
            review_reason = LEFT($2, 2000), updated_at = NOW()
      WHERE id = $1`,
    [attemptId, reason],
  );
}

async function markReview(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  attemptId: string,
  problems: string[],
): Promise<void> {
  const reason = problems.join("; ");
  await tx(
    `WITH frozen_siblings AS (
       UPDATE market_trade_stripe_checkout_attempts AS current
          SET status = 'requires_review',
              review_reason = LEFT($3, 2000),
              updated_at = NOW()
        WHERE current.trade_id = (
                SELECT target.trade_id
                  FROM market_trade_stripe_checkout_attempts target
                 WHERE target.id = $1
              )
          AND current.id <> $1
          AND current.status IN ('reserved', 'checkout_open', 'processing', 'requires_review')
        RETURNING current.id
     )
     UPDATE market_trade_stripe_checkout_attempts AS target
        SET status = CASE
              WHEN target.status = 'settled' THEN target.status
              WHEN target.status IN ('expired', 'failed')
                AND EXISTS (SELECT 1 FROM frozen_siblings) THEN target.status
              ELSE 'requires_review'
            END,
            review_reason = LEFT($2, 2000),
            updated_at = NOW()
      WHERE target.id = $1`,
    [
      attemptId,
      reason,
      `Another generation produced contradictory evidence: ${reason}`,
    ],
  );
}

type AttemptContext = AttemptRow & {
  rail: string;
  trade_escrow_status: string;
};

async function lockAttemptContext(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  attemptId: string,
): Promise<AttemptContext | null> {
  // Every multi-row payment mutation uses one lock order. The first query
  // reads the attempt only to resolve its parent but locks the trade alone;
  // reservation and attempt are locked by subsequent fresh statements.
  const trade = await tx(
    `SELECT t.id AS trade_id, t.escrow_status::text AS trade_escrow_status
       FROM market_trades t
       JOIN market_trade_stripe_checkout_attempts a ON a.trade_id = t.id
      WHERE a.id = $1
      FOR UPDATE OF t`,
    [attemptId],
  );
  if (!trade.rows[0]) return null;
  const reservation = await tx(
    `SELECT rail FROM market_trade_settlement_reservations
      WHERE trade_id = $1 FOR UPDATE`,
    [trade.rows[0].trade_id],
  );
  const attempt = await tx(
    `SELECT ${ATTEMPT_COLUMNS}
       FROM market_trade_stripe_checkout_attempts
      WHERE id = $1
      FOR UPDATE`,
    [attemptId],
  );
  if (!attempt.rows[0] || !reservation.rows[0]) return null;
  return {
    ...(attempt.rows[0] as AttemptRow),
    rail: reservation.rows[0].rail as string,
    trade_escrow_status: trade.rows[0].trade_escrow_status as string,
  };
}

async function lockDeclaredOrBoundAttemptContext(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  declaredAttemptId: string | null | undefined,
  session: Stripe.Checkout.Session,
): Promise<{ attemptId: string; row: AttemptContext } | null> {
  // Once attached, our write-once Session id is the local authority for which
  // attempt to lock. Before attach, the frozen client reference resolves the
  // create/webhook race. Mutable metadata is only an assertion checked after
  // the lock; it is never allowed to select an unrelated local attempt.
  const resolved = await tx(
    `SELECT id
       FROM (
         SELECT id, 1 AS priority
           FROM market_trade_stripe_checkout_attempts
          WHERE stripe_session_id = $1
         UNION ALL
         SELECT id, 2
           FROM market_trade_stripe_checkout_attempts
          WHERE stripe_session_id IS NULL
            AND request_snapshot->>'client_reference_id' = $2
       ) candidate
      ORDER BY priority
      LIMIT 1`,
    [session.id, session.client_reference_id],
  );
  const resolvedAttemptId = resolved.rows[0]?.id as string | undefined;
  if (!resolvedAttemptId) return null;
  const row = await lockAttemptContext(tx, resolvedAttemptId);
  if (!row) return null;

  // Keep the declaration in the signature to make the trust boundary
  // explicit. Its equality is validated by attemptRowBindingProblems; using
  // it for lookup would let edited Stripe metadata hold an unrelated trade.
  void declaredAttemptId;
  return { attemptId: resolvedAttemptId, row };
}

/**
 * Record signed provider evidence that a v2 Checkout can no longer settle.
 * The metadata UUID alone is never authority: terminal events receive the
 * same immutable trade/amount/currency/session/request checks as paid ones.
 */
export async function markStripeCheckoutAttemptTerminal(
  session: Stripe.Checkout.Session,
  status: "expired" | "failed",
  reason: string,
): Promise<StripeMarketSettlementResult> {
  const attemptId = session.metadata?.payment_attempt_id;
  return transaction(async (tx) => {
    const context = await lockDeclaredOrBoundAttemptContext(tx, attemptId, session);
    if (!context) {
      return { ok: false, reason: "unknown Stripe Checkout attempt", reviewRecorded: false } as const;
    }
    const { row } = context;
    const lockedAttemptId = context.attemptId;

    const problems = attemptRowBindingProblems(row, session);
    if (row.rail !== STRIPE_CHECKOUT_RAIL) problems.push("reservation rail mismatch");
    if (status === "expired" && session.status !== "expired") {
      problems.push(`Checkout is ${session.status ?? "statusless"}, not expired`);
    }
    if (session.payment_status === "paid") {
      problems.push("terminal Checkout reports paid");
    }

    // A signed redelivery remains idempotent even if a later sweep has
    // cancelled the now-terminal trade. Exact provider binding is still
    // checked above before acknowledging it.
    if (row.status === status && problems.length === 0) {
      return { ok: true, applied: false, trade: null } as const;
    }
    if (!["reserved", "checkout_open", "processing"].includes(row.status)) {
      problems.push(`attempt is ${row.status}`);
    }
    if (row.trade_escrow_status !== "awaiting_payment") {
      problems.push(`trade is ${row.trade_escrow_status}`);
    }
    if (problems.length > 0) {
      await markReview(tx, lockedAttemptId, problems);
      return { ok: false, reason: problems.join("; "), reviewRecorded: true } as const;
    }

    const updated = await tx(
      `UPDATE market_trade_stripe_checkout_attempts
          SET status = $2,
              stripe_session_id = COALESCE(stripe_session_id, $3),
              stripe_payment_intent = COALESCE(stripe_payment_intent, $4),
              review_reason = LEFT($5, 2000),
              updated_at = NOW()
        WHERE id = $1
          AND status IN ('reserved', 'checkout_open', 'processing')
        RETURNING id`,
      [lockedAttemptId, status, session.id, paymentIntentId(session), reason],
    );
    if (!updated.rows[0]) {
      throw new Error("Stripe terminal evidence lost its attempt state guard.");
    }
    return { ok: true, applied: true, trade: null } as const;
  });
}

export async function recordStripeMarketCheckoutProcessing(
  session: Stripe.Checkout.Session,
): Promise<StripeMarketSettlementResult> {
  const attemptId = session.metadata?.payment_attempt_id;
  return transaction(async (tx) => {
    const context = await lockDeclaredOrBoundAttemptContext(tx, attemptId, session);
    if (!context) {
      return { ok: false, reason: "unknown Stripe Checkout attempt", reviewRecorded: false } as const;
    }
    const { row } = context;
    const lockedAttemptId = context.attemptId;
    const problems = attemptRowBindingProblems(row, session);
    if (row.rail !== STRIPE_CHECKOUT_RAIL) problems.push("reservation rail mismatch");
    if (problems.length > 0) {
      await markReview(tx, lockedAttemptId, problems);
      return { ok: false, reason: problems.join("; "), reviewRecorded: true } as const;
    }
    // Stripe does not guarantee webhook ordering. Exact older "processing"
    // evidence arriving after an exact terminal/success event must never
    // move the state backwards or turn a completed generation into review.
    if (["settled", "expired", "failed"].includes(row.status)) {
      return { ok: true, applied: false, trade: null } as const;
    }
    if (row.status === "requires_review") {
      return {
        ok: false,
        reason: row.review_reason || "attempt is already held for review",
        reviewRecorded: true,
      } as const;
    }
    if (row.trade_escrow_status !== "awaiting_payment") {
      const stateProblem = `trade is ${row.trade_escrow_status}`;
      await markReview(tx, lockedAttemptId, [stateProblem]);
      return { ok: false, reason: stateProblem, reviewRecorded: true } as const;
    }
    if (row.status === "processing") {
      return { ok: true, applied: false, trade: null } as const;
    }
    await tx(
      `UPDATE market_trade_stripe_checkout_attempts
          SET status = 'processing',
              stripe_session_id = COALESCE(stripe_session_id, $2),
              stripe_payment_intent = COALESCE(stripe_payment_intent, $3),
              updated_at = NOW()
        WHERE id = $1`,
      [lockedAttemptId, session.id, paymentIntentId(session)],
    );
    await tx(
      `UPDATE market_trades SET stripe_session_id = $2, updated_at = NOW()
        WHERE id = $1 AND escrow_status = 'awaiting_payment'`,
      [row.trade_id, session.id],
    );
    return { ok: true, applied: true, trade: null } as const;
  });
}

async function settleLegacyStripeMarketCheckout(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  session: Stripe.Checkout.Session,
  tradeId: string,
  shippingAddress: Record<string, unknown> | null,
): Promise<StripeMarketSettlementResult> {
  const result = await tx(
    `SELECT t.*, (t.price * t.quantity * 100)::bigint::text AS expected_amount_pence
       FROM market_trades t
      WHERE t.id = $1
      FOR UPDATE OF t`,
    [tradeId],
  );
  if (!result.rows[0]) {
    return { ok: false, reason: "legacy Checkout references an unknown trade", reviewRecorded: false } as const;
  }
  const trade = result.rows[0] as Record<string, unknown> & {
    buyer_id: string;
    escrow_status: string;
    stripe_session_id: string | null;
    expected_amount_pence: string;
  };
  const reservation = await tx(
    `SELECT rail FROM market_trade_settlement_reservations
      WHERE trade_id = $1 FOR UPDATE`,
    [tradeId],
  );
  const reservedRail = (reservation.rows[0]?.rail as string | undefined) ?? null;
  const ledgerAttempt = await tx(
    `SELECT ${ATTEMPT_COLUMNS}
       FROM market_trade_stripe_checkout_attempts
      WHERE trade_id = $1 AND stripe_session_id = $2
      FOR UPDATE`,
    [tradeId, session.id],
  );
  if (ledgerAttempt.rows[0]) {
    const row = ledgerAttempt.rows[0] as AttemptRow;
    const problems = attemptRowBindingProblems(row, session);
    if (!problems.includes("wrong attempt id")) {
      problems.push("v2 Checkout is missing its payment attempt id");
    }
    if (reservedRail !== STRIPE_CHECKOUT_RAIL) problems.push("reservation rail mismatch");
    await markReview(tx, row.id, problems);
    return { ok: false, reason: problems.join("; "), reviewRecorded: true } as const;
  }
  const problems: string[] = [];
  if (reservedRail && reservedRail !== STRIPE_CHECKOUT_RAIL) {
    problems.push("legacy Checkout conflicts with reserved rail");
  }
  if (trade.stripe_session_id !== session.id) problems.push("legacy Stripe session is not the stored session");
  if (session.amount_total !== positiveSafeInteger(trade.expected_amount_pence, "legacy trade amount")) {
    problems.push("legacy Checkout amount mismatch");
  }
  if (session.currency?.toLowerCase() !== "gbp") problems.push("legacy Checkout currency mismatch");
  if (session.mode !== "payment") problems.push("legacy Checkout mode mismatch");
  if (session.payment_status !== "paid") problems.push("legacy Checkout is not paid");
  if (problems.length > 0) {
    return { ok: false, reason: problems.join("; "), reviewRecorded: false } as const;
  }
  if (trade.escrow_status !== "awaiting_payment") {
    if (
      trade.stripe_session_id === session.id
      && ["paid", "awaiting_shipment", "shipped_to_ctcg", "received_by_ctcg", "verified", "shipped_to_buyer", "completed"].includes(trade.escrow_status)
    ) {
      return { ok: true, applied: false, trade: null } as const;
    }
    return { ok: false, reason: `legacy trade is ${trade.escrow_status}`, reviewRecorded: false } as const;
  }
  if (!reservedRail) {
    await tx(
      `INSERT INTO market_trade_settlement_reservations (trade_id, rail, reserved_by)
       VALUES ($1, 'stripe_checkout', $2)
       ON CONFLICT (trade_id) DO NOTHING`,
      [tradeId, trade.buyer_id],
    );
  }
  const updated = await tx(
    `UPDATE market_trades
        SET escrow_status = 'awaiting_shipment',
            buyer_paid_at = NOW(),
            stripe_session_id = $2,
            stripe_payment_intent = $3,
            shipping_address = COALESCE($4::jsonb, shipping_address),
            updated_at = NOW()
      WHERE id = $1 AND escrow_status = 'awaiting_payment'
        AND stripe_session_id = $2
      RETURNING *`,
    [
      tradeId,
      session.id,
      paymentIntentId(session),
      shippingAddress ? JSON.stringify(shippingAddress) : null,
    ],
  );
  if (!updated.rows[0]) throw new Error("Legacy Stripe settlement lost its state guard.");
  return { ok: true, applied: true, trade: updated.rows[0] as Record<string, unknown> } as const;
}

export async function settleStripeMarketCheckout(
  session: Stripe.Checkout.Session,
  shippingAddress: Record<string, unknown> | null,
): Promise<StripeMarketSettlementResult> {
  const attemptId = session.metadata?.payment_attempt_id;
  return transaction(async (tx) => {
    const context = await lockDeclaredOrBoundAttemptContext(tx, attemptId, session);
    if (!context) {
      // Legacy compatibility still resolves by our write-once Session id
      // before considering metadata. The exact stored-session check in the
      // helper prevents an edited trade_id from selecting another trade.
      const localLegacy = await tx(
        `SELECT trade_id
           FROM (
             SELECT id AS trade_id, 1 AS priority
               FROM market_trades
              WHERE stripe_session_id = $1
             UNION ALL
             SELECT trade_id, 2
               FROM market_trade_legacy_stripe_terminal_events
              WHERE stripe_session_id = $1
           ) candidate
          ORDER BY priority
          LIMIT 1`,
        [session.id],
      );
      const tradeId = (localLegacy.rows[0]?.trade_id as string | undefined)
        ?? session.metadata?.trade_id;
      if (!tradeId) {
        return { ok: false, reason: "unknown Stripe Checkout attempt or legacy trade", reviewRecorded: false } as const;
      }
      return settleLegacyStripeMarketCheckout(tx, session, tradeId, shippingAddress);
    }
    const { row } = context;
    const lockedAttemptId = context.attemptId;
    const problems = attemptRowBindingProblems(row, session);
    if (row.rail !== STRIPE_CHECKOUT_RAIL) problems.push("reservation rail mismatch");
    if (session.payment_status !== "paid") problems.push("Checkout is not paid");
    if (!paymentIntentId(session)) problems.push("paid Checkout has no PaymentIntent");

    if (row.status === "settled" && problems.length === 0) {
      return { ok: true, applied: false, trade: null } as const;
    }
    if (!["reserved", "checkout_open", "processing"].includes(row.status)) {
      problems.push(`attempt is ${row.status}`);
    }
    if (row.trade_escrow_status !== "awaiting_payment") {
      problems.push(`trade is ${row.trade_escrow_status}`);
    }
    if (problems.length > 0) {
      await markReview(tx, lockedAttemptId, problems);
      return { ok: false, reason: problems.join("; "), reviewRecorded: true } as const;
    }

    await tx(
      `UPDATE market_trade_stripe_checkout_attempts
          SET status = 'settled',
              stripe_session_id = COALESCE(stripe_session_id, $2),
              stripe_payment_intent = COALESCE(stripe_payment_intent, $3),
              settled_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [lockedAttemptId, session.id, paymentIntentId(session)],
    );
    const updated = await tx(
      `UPDATE market_trades
          SET escrow_status = 'awaiting_shipment',
              buyer_paid_at = NOW(),
              stripe_session_id = $2,
              stripe_payment_intent = $3,
              shipping_address = COALESCE($4::jsonb, shipping_address),
              updated_at = NOW()
        WHERE id = $1 AND escrow_status = 'awaiting_payment'
        RETURNING *`,
      [
        row.trade_id,
        session.id,
        paymentIntentId(session),
        shippingAddress ? JSON.stringify(shippingAddress) : null,
      ],
    );
    if (!updated.rows[0]) throw new Error("Stripe settlement lost its trade state guard.");
    return { ok: true, applied: true, trade: updated.rows[0] as Record<string, unknown> } as const;
  });
}

export function isMarketPaymentAttemptMigrationMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "42P01" || code === "42703";
}
