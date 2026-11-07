import "server-only";
import { query as storefrontQuery, transaction as storefrontTransaction } from "@/lib/db";
import type { DataApiPaidPlanId } from "./config.server";
import {
  DATA_API_ENDED_STATUSES,
  type DataApiEventReceipt, type DataApiSubscriptionSnapshot, type DataApiSubscriptionStatus,
} from "./events";

/**
 * 0142's billing tables: one test-mode Stripe customer per account,
 * subscriptions written only from verified events, and each event handled
 * once. Every write that answers one event runs in one transaction.
 */

export type DataApiBillingQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type DataApiBillingTransaction = <T>(work: (query: DataApiBillingQuery) => Promise<T>) => Promise<T>;
export interface DataApiBillingStoreDeps {
  readonly query?: DataApiBillingQuery;
  readonly runTransaction?: DataApiBillingTransaction;
}

/** 0142 is not applied where this runs: reported as such, never as an empty answer. */
export class DataApiBillingNotProvisionedError extends Error {
  readonly code = "billing_not_provisioned";
  constructor() {
    super("The data-API billing tables (migration 0142) are not provisioned.");
    this.name = "DataApiBillingNotProvisionedError";
  }
}

function undefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

async function provisioned<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (undefinedTable(error)) throw new DataApiBillingNotProvisionedError();
    throw error;
  }
}

const read = (deps: DataApiBillingStoreDeps): DataApiBillingQuery => deps.query ?? storefrontQuery;
const transaction = (deps: DataApiBillingStoreDeps): DataApiBillingTransaction => deps.runTransaction ?? storefrontTransaction;

/** The account's one test-mode Stripe customer, if it has one yet. */
export function findDataApiCustomer(userId: string, deps: DataApiBillingStoreDeps = {}): Promise<string | null> {
  return provisioned(async () => {
    const result = await read(deps)(
      `SELECT stripe_customer_id FROM data_api_customers WHERE user_id = $1 AND environment = 'test'`, [userId]);
    return (result.rows[0]?.stripe_customer_id as string | undefined) ?? null;
  });
}

/** Binds a newly created Stripe customer to the account, unless a concurrent
 * request bound one first; returns the customer the account now holds. */
export function bindDataApiCustomer(userId: string, customerId: string, deps: DataApiBillingStoreDeps = {}): Promise<string> {
  return provisioned(async () => {
    const query = read(deps);
    const inserted = await query(
      `INSERT INTO data_api_customers (user_id, stripe_customer_id, environment) VALUES ($1, $2, 'test')
       ON CONFLICT (user_id) DO NOTHING
       RETURNING stripe_customer_id`,
      [userId, customerId],
    );
    if (typeof inserted.rows[0]?.stripe_customer_id === "string") return inserted.rows[0].stripe_customer_id;
    // Lost a race: a separate statement, so its snapshot sees the winner's committed row.
    const bound = await findDataApiCustomer(userId, deps);
    if (bound === null) throw new Error("The data-API customer binding returned no row.");
    return bound;
  });
}

export interface DataApiSubscriptionSummary {
  readonly planId: DataApiPaidPlanId;
  readonly status: DataApiSubscriptionStatus;
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: string | null;
}

/** Subscriptions Stripe may still bill: a new checkout must not stack another on them. */
export function listOpenDataApiSubscriptions(userId: string, deps: DataApiBillingStoreDeps = {}): Promise<DataApiSubscriptionSummary[]> {
  return provisioned(async () => {
    const result = await read(deps)(
      `SELECT plan_id, status, cancel_at_period_end, current_period_end FROM data_api_subscriptions
        WHERE user_id = $1 AND environment = 'test' AND status <> ALL($2::text[])
        ORDER BY updated_at DESC, id`,
      [userId, [...DATA_API_ENDED_STATUSES]],
    );
    return result.rows.map(row => Object.freeze({
      planId: row.plan_id as DataApiPaidPlanId,
      status: row.status as DataApiSubscriptionStatus,
      cancelAtPeriodEnd: row.cancel_at_period_end === true,
      currentPeriodEnd: row.current_period_end === null ? null : new Date(row.current_period_end as string | Date).toISOString(),
    }));
  });
}

// An account's entitlement is read in one place, lib/data-api/entitlements.ts; billing only writes the rows it reads.

/** Duplicate deliveries need no fresh Stripe read; the transaction below stays authoritative. */
export function hasDataApiStripeEvent(eventId: string, deps: DataApiBillingStoreDeps = {}): Promise<boolean> {
  return provisioned(async () => {
    const result = await read(deps)(`SELECT 1 FROM data_api_stripe_events WHERE stripe_event_id = $1`, [eventId]);
    return result.rows.length > 0;
  });
}

export type DataApiEventDecision =
  | { readonly kind: "ignore"; readonly code: string }
  | { readonly kind: "sync"; readonly snapshot: DataApiSubscriptionSnapshot };

export type DataApiEventRecord =
  | { readonly disposition: "duplicate" }
  | { readonly disposition: "recorded"; readonly outcome: "applied" | "ignored"; readonly code: string };

/** The outcome code of a snapshot with no plan that moved an existing row, its plan kept. */
export const DATA_API_PLAN_KEPT_CODE = "status_synced_plan_kept";

/**
 * Handles one verified event exactly once, in one transaction: the event row,
 * and for a subscription snapshot the row it describes. The snapshot's
 * customer must be the account's own (data_api_customers), and a row never
 * moves back to an older event's state. A snapshot whose price no plan
 * answers (planId null: a price that has left the configuration, say) moves an
 * existing row's status, period end and cancel flag, keeping its plan_id. So
 * a renewal Stripe bills on a retired price keeps the row's paid period
 * current instead of letting it lapse to free, and a cancellation still
 * reaches it. It never creates a row and never changes plan_id, so no plan is
 * granted or raised from such a price: with no row to move, the event is
 * recorded as ignored under the snapshot's planUnresolved code.
 */
export function recordDataApiStripeEvent(
  receipt: DataApiEventReceipt,
  decision: DataApiEventDecision,
  deps: DataApiBillingStoreDeps = {},
): Promise<DataApiEventRecord> {
  return provisioned(() => transaction(deps)(async (query) => {
    const insertEvent = async (outcome: "applied" | "ignored", code: string) => {
      const inserted = await query(
        `INSERT INTO data_api_stripe_events (stripe_event_id, environment, event_type, livemode, provider_created_at, outcome, outcome_code)
         VALUES ($1, 'test', $2, false, $3, $4, $5)
         ON CONFLICT (stripe_event_id) DO NOTHING
         RETURNING stripe_event_id`,
        [receipt.eventId, receipt.eventType, receipt.providerCreatedAt, outcome, code],
      );
      return inserted.rows.length > 0;
    };
    const recorded = (outcome: "applied" | "ignored", code: string) => Object.freeze({ disposition: "recorded" as const, outcome, code });
    const duplicate = Object.freeze({ disposition: "duplicate" as const });

    if (decision.kind === "ignore") {
      return (await insertEvent("ignored", decision.code)) ? recorded("ignored", decision.code) : duplicate;
    }

    const snapshot = decision.snapshot;
    // FOR SHARE holds the customer row, so account erasure cannot remove it under this write.
    const owner = await query(
      `SELECT user_id::text AS user_id FROM data_api_customers
        WHERE stripe_customer_id = $1 AND environment = 'test' FOR SHARE`,
      [snapshot.customerId],
    );
    const ownerId = owner.rows[0]?.user_id;
    const unbound = ownerId === undefined ? "customer_not_bound" : ownerId !== snapshot.userId ? "owner_mismatch" : null;
    if (unbound) return (await insertEvent("ignored", unbound)) ? recorded("ignored", unbound) : duplicate;

    // The row exists and was left alone, or (with no plan) there is none to move: say why on the event, not "applied".
    const leftAlone = async (missingCode: string) => {
      const held = await query(
        `SELECT user_id::text AS user_id, stripe_customer_id FROM data_api_subscriptions WHERE stripe_subscription_id = $1`,
        [snapshot.subscriptionId],
      );
      const row = held.rows[0];
      const code = !row ? missingCode
        : row.user_id !== snapshot.userId || row.stripe_customer_id !== snapshot.customerId ? "owner_mismatch"
          : "older_than_recorded";
      await query(
        `UPDATE data_api_stripe_events SET outcome = 'ignored', outcome_code = $2 WHERE stripe_event_id = $1`,
        [receipt.eventId, code],
      );
      return recorded("ignored", code);
    };

    if (snapshot.planId === null) {
      const refusal = snapshot.planUnresolved ?? "subscription_price_unknown";
      if (!(await insertEvent("applied", DATA_API_PLAN_KEPT_CODE))) return duplicate;
      const moved = await query(
        `UPDATE data_api_subscriptions SET
           status = $2, current_period_end = $3, cancel_at_period_end = $4,
           last_stripe_event_id = $5, provider_updated_at = $6, updated_at = now()
         WHERE stripe_subscription_id = $1 AND provider_updated_at <= $6
           AND user_id = $7 AND stripe_customer_id = $8
         RETURNING id`,
        [snapshot.subscriptionId, snapshot.status, snapshot.currentPeriodEnd, snapshot.cancelAtPeriodEnd,
          receipt.eventId, receipt.providerCreatedAt, snapshot.userId, snapshot.customerId],
      );
      return moved.rows.length > 0 ? recorded("applied", DATA_API_PLAN_KEPT_CODE) : leftAlone(refusal);
    }

    if (!(await insertEvent("applied", "subscription_synced"))) return duplicate;
    const written = await query(
      `INSERT INTO data_api_subscriptions (environment, user_id, plan_id, status, stripe_customer_id, stripe_subscription_id,
         current_period_end, cancel_at_period_end, last_stripe_event_id, provider_updated_at)
       VALUES ('test', $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id, status = EXCLUDED.status,
         current_period_end = EXCLUDED.current_period_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         last_stripe_event_id = EXCLUDED.last_stripe_event_id, provider_updated_at = EXCLUDED.provider_updated_at,
         updated_at = now()
       WHERE data_api_subscriptions.provider_updated_at <= EXCLUDED.provider_updated_at
         AND data_api_subscriptions.user_id = EXCLUDED.user_id
         AND data_api_subscriptions.stripe_customer_id = EXCLUDED.stripe_customer_id
       RETURNING id`,
      [snapshot.userId, snapshot.planId, snapshot.status, snapshot.customerId, snapshot.subscriptionId,
        snapshot.currentPeriodEnd, snapshot.cancelAtPeriodEnd, receipt.eventId, receipt.providerCreatedAt],
    );
    return written.rows.length > 0 ? recorded("applied", "subscription_synced") : leftAlone("older_than_recorded");
  }));
}
