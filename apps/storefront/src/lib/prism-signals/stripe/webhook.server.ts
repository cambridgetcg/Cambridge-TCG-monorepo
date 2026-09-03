import "server-only";
import {
  STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
  STRIPE_SUBSCRIPTION_MAPPING_SCHEMA,
  applyEntitlementEventV1,
  normalizeStripeSubscriptionCallbackV1,
} from "@cambridge-tcg/product-flow-runtime";
import {
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  parseEntitlementEventV1,
  parseEntitlementSnapshotV1,
  type ProductFlowOpaqueRef,
} from "@cambridge-tcg/product-flow";
import {
  PostgresProductFlowRuntimeStoreV1,
  type ProductFlowRuntimeQueryV1,
} from "@/lib/product-flow-runtime/postgres.server";
import { query as storefrontQuery } from "@/lib/db";
import { PRISM_SIGNALS_PRODUCT_ID } from "../beta-interest";
import type { PrismStripeSandboxConfigV1 } from "./config.server";
import {
  PrismStripeStoreError,
  type PrismStripeStoreDependenciesV1,
  withPrismStripeStorefrontTransactionV1,
} from "./store.server";
import { derivePrismStripeOpaqueRef } from "./refs.server";

export interface PrismStripeWebhookReceiptInputV1 {
  readonly config: PrismStripeSandboxConfigV1;
  readonly stripeEventId: string;
  readonly stripeAccountId: string;
  readonly apiVersion: string;
  readonly eventType: string;
  readonly livemode: false;
  readonly payloadSha256: string;
  readonly providerCreatedAt: string;
  readonly receivedAt: string;
}

export type PrismStripeWebhookOutcomeV1 =
  | "processed"
  | "ignored"
  | "requires_review";

export interface PrismStripeWebhookDecisionV1 {
  readonly outcome: PrismStripeWebhookOutcomeV1;
  readonly code: string;
}

export type PrismStripeWebhookProcessResultV1 = Readonly<{
  disposition: "processed" | "duplicate";
  outcome: PrismStripeWebhookOutcomeV1;
  code: string;
}>;

export interface CheckoutCompletedFactV1 {
  readonly attemptRef: string;
  readonly sessionId: string;
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly status: "complete";
  readonly completedAt: string;
}

export interface InvoiceBaseFactV1 {
  readonly attemptRef: string;
  readonly invoiceId: string;
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly priceId: string;
  readonly productId: string;
  readonly currency: "gbp";
  readonly amountMinor: number;
  readonly quantity: 1;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface InvoicePaidFactV1 extends InvoiceBaseFactV1 {
  readonly grantKind: "initial" | "renewal";
  readonly confirmedAt: string;
  readonly paymentIntentId: string;
  readonly status: StripeSubscriptionStatusV1;
  readonly cancelAtPeriodEnd: boolean;
}

export interface InvoiceFailedFactV1 extends InvoiceBaseFactV1 {
  readonly failedAt: string;
}

export interface CancelAtPeriodEndFactV1 {
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly attemptRef: string;
  readonly priceId: string;
  readonly status: StripeSubscriptionStatusV1;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly statusAt: string;
}

export interface SubscriptionDeletedFactV1 extends CancelAtPeriodEndFactV1 {
  readonly status: "canceled";
  readonly endedAt: string;
}

export interface FullRefundFactV1 {
  readonly refundId: string;
  readonly subscriptionId: string;
  readonly invoiceId: string;
  readonly paymentIntentId: string;
  readonly priceId: string;
  readonly refundedAt: string;
  readonly amountRefundedMinor: number;
}

export type StripeSubscriptionStatusV1 =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface PrismStripeWebhookActionsV1 {
  observeCheckoutCompleted(
    fact: CheckoutCompletedFactV1,
  ): Promise<PrismStripeWebhookDecisionV1>;
  applyInvoicePaid(
    fact: InvoicePaidFactV1,
  ): Promise<PrismStripeWebhookDecisionV1>;
  observeInvoicePaymentFailed(
    fact: InvoiceFailedFactV1,
  ): Promise<PrismStripeWebhookDecisionV1>;
  applyCancelAtPeriodEnd(
    fact: CancelAtPeriodEndFactV1,
  ): Promise<PrismStripeWebhookDecisionV1>;
  applySubscriptionResumed(
    fact: CancelAtPeriodEndFactV1,
  ): Promise<PrismStripeWebhookDecisionV1>;
  applySubscriptionDeleted(
    fact: SubscriptionDeletedFactV1,
  ): Promise<PrismStripeWebhookDecisionV1>;
  applyFullRefund(
    fact: FullRefundFactV1,
  ): Promise<PrismStripeWebhookDecisionV1>;
  requiresReview(code: string): PrismStripeWebhookDecisionV1;
  ignore(code: string): PrismStripeWebhookDecisionV1;
}

interface ReceiptRow {
  stripe_account_id: string;
  api_version: string;
  event_type: string;
  livemode: boolean;
  payload_sha256: string;
  provider_created_at: Date | string;
  received_at: Date | string;
  outcome: string;
  outcome_code: string | null;
}

interface BindingRow {
  attempt_ref: string;
  subject_ref: string;
  entitlement_ref: string;
  offer_id: string;
  offer_version: number | string;
  price_ref: string;
  stripe_price_id: string;
  stripe_session_id: string | null;
  stripe_customer_id: string | null;
  attempt_status: string;
  owner_lifecycle: string;
  stripe_subscription_id: string | null;
  subscription_customer_id: string | null;
  subscription_status: string | null;
  provider_updated_at: Date | string | null;
}

function canonicalTimestamp(value: string, field: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new PrismStripeStoreError(
      "binding_conflict",
      `${field} must be a canonical millisecond UTC timestamp.`,
    );
  }
  return value;
}

function storedIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function validCode(code: string): boolean {
  return /^[a-z][a-z0-9_]{0,95}$/.test(code);
}

function decision(
  outcome: PrismStripeWebhookOutcomeV1,
  code: string,
): PrismStripeWebhookDecisionV1 {
  if (!validCode(code)) {
    throw new PrismStripeStoreError(
      "store_invariant",
      "PRISM Stripe outcome code is invalid.",
    );
  }
  return Object.freeze({ outcome, code });
}

async function allocateProjectionTime(
  query: ProductFlowRuntimeQueryV1,
  environment: "test",
  entitlementRef: string,
  receivedAt: string,
): Promise<string> {
  await query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`product-flow:${environment}:${entitlementRef}`],
  );
  const result = await query(
    `SELECT GREATEST(
              $3::TIMESTAMPTZ,
              COALESCE(MAX(occurred_at) + INTERVAL '1 millisecond', $3::TIMESTAMPTZ)
            ) AS projection_at
       FROM product_flow_events
      WHERE environment = $1 AND entitlement_ref = $2`,
    [environment, entitlementRef, receivedAt],
  );
  const value = (result.rows[0] as { projection_at?: Date | string } | undefined)
    ?.projection_at;
  if (!value) {
    throw new PrismStripeStoreError(
      "store_invariant",
      "PRISM Stripe could not allocate a projection timestamp.",
    );
  }
  return storedIso(value);
}

function providerRef(
  config: PrismStripeSandboxConfigV1,
  namespace: string,
  raw: string,
): ProductFlowOpaqueRef {
  return derivePrismStripeOpaqueRef(config.referenceSecret, namespace, raw);
}

async function bindingByAttempt(
  query: ProductFlowRuntimeQueryV1,
  attemptRef: string,
  lock = true,
): Promise<BindingRow | null> {
  const result = await query(
    `SELECT a.attempt_ref, a.subject_ref, a.entitlement_ref, a.offer_id,
            a.offer_version, a.price_ref, a.stripe_price_id,
            a.stripe_session_id, a.stripe_customer_id,
            a.status AS attempt_status, o.lifecycle AS owner_lifecycle,
            sub.stripe_subscription_id,
            sub.stripe_customer_id AS subscription_customer_id,
            sub.status AS subscription_status,
            sub.provider_updated_at
       FROM product_flow_stripe_checkout_attempts a
       JOIN product_flow_entitlement_owners o
         ON o.environment = a.environment
        AND o.entitlement_ref = a.entitlement_ref
       LEFT JOIN product_flow_stripe_subscriptions sub
         ON sub.environment = a.environment
        AND sub.attempt_ref = a.attempt_ref
      WHERE a.environment = 'test' AND a.attempt_ref = $1
      ${lock ? "FOR UPDATE OF a, o" : ""}`,
    [attemptRef],
  );
  return (result.rows[0] as BindingRow | undefined) ?? null;
}

async function bindingBySubscription(
  query: ProductFlowRuntimeQueryV1,
  subscriptionId: string,
  lock = true,
): Promise<BindingRow | null> {
  const result = await query(
    `SELECT a.attempt_ref, a.subject_ref, a.entitlement_ref, a.offer_id,
            a.offer_version, a.price_ref, a.stripe_price_id,
            a.stripe_session_id, a.stripe_customer_id,
            a.status AS attempt_status, o.lifecycle AS owner_lifecycle,
            sub.stripe_subscription_id,
            sub.stripe_customer_id AS subscription_customer_id,
            sub.status AS subscription_status,
            sub.provider_updated_at
       FROM product_flow_stripe_subscriptions sub
       JOIN product_flow_stripe_checkout_attempts a
         ON a.environment = sub.environment
        AND a.attempt_ref = sub.attempt_ref
       JOIN product_flow_entitlement_owners o
         ON o.environment = sub.environment
        AND o.entitlement_ref = sub.entitlement_ref
      WHERE sub.environment = 'test' AND sub.stripe_subscription_id = $1
      ${lock ? "FOR UPDATE OF sub, a, o" : ""}`,
    [subscriptionId],
  );
  return (result.rows[0] as BindingRow | undefined) ?? null;
}

function bindingMatches(
  binding: BindingRow,
  fact: {
    readonly attemptRef?: string;
    readonly customerId?: string;
    readonly priceId: string;
    readonly subscriptionId: string;
  },
): boolean {
  return (
    binding.owner_lifecycle === "current" &&
    binding.stripe_price_id === fact.priceId &&
    binding.stripe_subscription_id === fact.subscriptionId &&
    (fact.attemptRef === undefined || binding.attempt_ref === fact.attemptRef) &&
    (fact.customerId === undefined ||
      binding.subscription_customer_id === fact.customerId)
  );
}

function runtimeMapping(binding: BindingRow) {
  return Object.freeze({
    schema: STRIPE_SUBSCRIPTION_MAPPING_SCHEMA,
    provider: "stripe_subscriptions" as const,
    environment: "test" as const,
    entitlement_ref: binding.entitlement_ref as ProductFlowOpaqueRef,
    subject_ref: binding.subject_ref as ProductFlowOpaqueRef,
    offer_id: binding.offer_id,
    offer_version: Number(binding.offer_version),
    price_ref: binding.price_ref as ProductFlowOpaqueRef,
  });
}

class WebhookActions implements PrismStripeWebhookActionsV1 {
  constructor(
    private readonly query: ProductFlowRuntimeQueryV1,
    private readonly runtimeStore: PostgresProductFlowRuntimeStoreV1,
    private readonly receipt: PrismStripeWebhookReceiptInputV1,
  ) {}

  requiresReview(code: string): PrismStripeWebhookDecisionV1 {
    return decision("requires_review", code);
  }

  ignore(code: string): PrismStripeWebhookDecisionV1 {
    return decision("ignored", code);
  }

  private eventRef(namespace: string): ProductFlowOpaqueRef {
    return providerRef(
      this.receipt.config,
      namespace,
      this.receipt.stripeEventId,
    );
  }

  private async lockedAttempt(
    attemptRef: string,
  ): Promise<Readonly<{ binding: BindingRow; occurredAt: string }> | null> {
    const discovered = await bindingByAttempt(this.query, attemptRef, false);
    if (discovered === null) return null;
    const occurredAt = await allocateProjectionTime(
      this.query,
      "test",
      discovered.entitlement_ref,
      this.receipt.receivedAt,
    );
    const binding = await bindingByAttempt(this.query, attemptRef, true);
    if (
      binding === null ||
      binding.entitlement_ref !== discovered.entitlement_ref ||
      binding.subject_ref !== discovered.subject_ref
    ) {
      return null;
    }
    return Object.freeze({ binding, occurredAt });
  }

  private async lockedSubscription(
    subscriptionId: string,
  ): Promise<Readonly<{ binding: BindingRow; occurredAt: string }> | null> {
    const discovered = await bindingBySubscription(
      this.query,
      subscriptionId,
      false,
    );
    if (discovered === null) return null;
    const occurredAt = await allocateProjectionTime(
      this.query,
      "test",
      discovered.entitlement_ref,
      this.receipt.receivedAt,
    );
    const binding = await bindingBySubscription(
      this.query,
      subscriptionId,
      true,
    );
    if (
      binding === null ||
      binding.entitlement_ref !== discovered.entitlement_ref ||
      binding.subject_ref !== discovered.subject_ref
    ) {
      return null;
    }
    return Object.freeze({ binding, occurredAt });
  }

  private async currentCancelPosture(binding: BindingRow): Promise<boolean> {
    const result = await this.query(
      `SELECT snapshot_payload
         FROM product_flow_entitlement_snapshots
        WHERE environment = 'test' AND entitlement_ref = $1`,
      [binding.entitlement_ref],
    );
    const payload = (
      result.rows[0] as { snapshot_payload?: unknown } | undefined
    )?.snapshot_payload;
    return payload ? parseEntitlementSnapshotV1(payload).cancel_at_period_end : false;
  }

  private async mirrorRetrievedCancelPosture(
    binding: BindingRow,
    previous: boolean,
    current: boolean,
  ): Promise<void> {
    if (previous === current) return;
    const occurredAt = await allocateProjectionTime(
      this.query,
      "test",
      binding.entitlement_ref,
      this.receipt.receivedAt,
    );
    const event = parseEntitlementEventV1({
      schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
      event_id: this.eventRef("stripe_api_status_event"),
      environment: "test",
      type: current ? "cancel_at_period_end" : "subscription_resumed",
      occurred_at: occurredAt,
      entitlement_ref: binding.entitlement_ref,
      subject_ref: binding.subject_ref,
      offer_id: binding.offer_id,
      offer_version: Number(binding.offer_version),
      channel: "web",
      rail: "stripe_web",
      price_ref: binding.price_ref,
      evidence: {
        kind: "provider_status",
        source: "provider_api",
        environment: "test",
        entitlement_ref: binding.entitlement_ref,
        subject_ref: binding.subject_ref,
        offer_id: binding.offer_id,
        offer_version: Number(binding.offer_version),
        channel: "web",
        rail: "stripe_web",
        price_ref: binding.price_ref,
        provider_event_ref: this.eventRef("stripe_api_status_evidence"),
        payment_or_subscription_ref: providerRef(
          this.receipt.config,
          "stripe_subscription",
          binding.stripe_subscription_id!,
        ),
        status_at: this.receipt.receivedAt,
      },
    });
    await applyEntitlementEventV1(this.runtimeStore, event);
  }

  private async ensureSubscriptionBinding(fact: {
    readonly attemptRef: string;
    readonly customerId: string;
    readonly subscriptionId: string;
    readonly priceId: string;
    readonly sourceAt: string;
    readonly sessionId?: string;
  }): Promise<Readonly<{ binding: BindingRow; occurredAt: string }> | null> {
    const locked = await this.lockedAttempt(fact.attemptRef);
    const attempt = locked?.binding ?? null;
    if (
      attempt === null ||
      attempt.owner_lifecycle !== "current" ||
      attempt.stripe_price_id !== fact.priceId ||
      (fact.sessionId !== undefined &&
        attempt.stripe_session_id !== fact.sessionId) ||
      (attempt.attempt_status !== "checkout_open" &&
        attempt.attempt_status !== "completed")
    ) {
      return null;
    }
    const customerOwner = await this.query(
      `SELECT subject_ref
         FROM product_flow_account_subjects
        WHERE environment = 'test' AND stripe_customer_id = $1
        FOR UPDATE`,
      [fact.customerId],
    );
    const claimedSubject = (
      customerOwner.rows[0] as { subject_ref?: string } | undefined
    )?.subject_ref;
    if (claimedSubject && claimedSubject !== attempt.subject_ref) return null;
    const customerUpdated = await this.query(
      `UPDATE product_flow_account_subjects
          SET stripe_customer_id = $3,
              updated_at = GREATEST(updated_at, $4::TIMESTAMPTZ)
        WHERE environment = 'test'
          AND product_id = $1
          AND subject_ref = $2
          AND (stripe_customer_id IS NULL OR stripe_customer_id = $3)
        RETURNING subject_ref`,
      [
        PRISM_SIGNALS_PRODUCT_ID,
        attempt.subject_ref,
        fact.customerId,
        locked!.occurredAt,
      ],
    );
    if ((customerUpdated.rowCount ?? 0) !== 1) return null;
    await this.query(
      `INSERT INTO product_flow_stripe_subscriptions (
         environment, stripe_subscription_id, stripe_customer_id,
         product_id, subject_ref, entitlement_ref, attempt_ref,
         stripe_price_id, status, cancel_at_period_end,
         source_stripe_event_id, provider_updated_at, created_at, updated_at
       ) VALUES (
         'test', $1, $2, $3, $4, $5, $6, $7,
         'incomplete', FALSE, $8, $9::TIMESTAMPTZ,
         $10::TIMESTAMPTZ, $10::TIMESTAMPTZ
       ) ON CONFLICT DO NOTHING`,
      [
        fact.subscriptionId,
        fact.customerId,
        PRISM_SIGNALS_PRODUCT_ID,
        attempt.subject_ref,
        attempt.entitlement_ref,
        fact.attemptRef,
        attempt.stripe_price_id,
        this.receipt.stripeEventId,
        fact.sourceAt,
        locked!.occurredAt,
      ],
    );
    const rebound = await bindingBySubscription(this.query, fact.subscriptionId);
    if (
      rebound === null ||
      !bindingMatches(rebound, {
        attemptRef: fact.attemptRef,
        customerId: fact.customerId,
        priceId: fact.priceId,
        subscriptionId: fact.subscriptionId,
      })
    ) {
      return null;
    }
    const completed = await this.query(
      `UPDATE product_flow_stripe_checkout_attempts
          SET status = 'completed',
              updated_at = GREATEST(updated_at, $2::TIMESTAMPTZ)
        WHERE environment = 'test' AND attempt_ref = $1
          AND status IN ('checkout_open', 'completed')`,
      [fact.attemptRef, locked!.occurredAt],
    );
    return (completed.rowCount ?? 0) === 1 && locked
      ? Object.freeze({ binding: rebound, occurredAt: locked.occurredAt })
      : null;
  }

  async observeCheckoutCompleted(
    fact: CheckoutCompletedFactV1,
  ): Promise<PrismStripeWebhookDecisionV1> {
    const locked = await this.ensureSubscriptionBinding({
      ...fact,
      priceId: this.receipt.config.priceId,
      sourceAt: fact.completedAt,
    });
    if (locked === null) return this.requiresReview("checkout_binding_mismatch");
    const { binding: rebound, occurredAt } = locked;
    const event = normalizeStripeSubscriptionCallbackV1(
      runtimeMapping(rebound),
      {
        schema: STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
        kind: "checkout_session_completed",
        event_id: this.eventRef("stripe_event"),
        occurred_at: occurredAt,
      },
    );
    await applyEntitlementEventV1(this.runtimeStore, event);
    return decision("processed", "checkout_observed");
  }

  async applyInvoicePaid(
    fact: InvoicePaidFactV1,
  ): Promise<PrismStripeWebhookDecisionV1> {
    let locked = await this.lockedSubscription(fact.subscriptionId);
    if (locked === null) {
      locked = await this.ensureSubscriptionBinding({
        attemptRef: fact.attemptRef,
        customerId: fact.customerId,
        subscriptionId: fact.subscriptionId,
        priceId: fact.priceId,
        sourceAt: fact.confirmedAt,
      });
    }
    const binding = locked?.binding ?? null;
    if (
      binding === null ||
      !bindingMatches(binding, fact) ||
      fact.productId !== this.receipt.config.productId ||
      fact.priceId !== this.receipt.config.priceId ||
      fact.currency !== this.receipt.config.currency ||
      fact.amountMinor !== this.receipt.config.unitAmountMinor ||
      fact.quantity !== 1 ||
      fact.status !== "active" ||
      typeof fact.cancelAtPeriodEnd !== "boolean" ||
      !/^pi_[A-Za-z0-9]{8,128}$/.test(fact.paymentIntentId)
    ) {
      return this.requiresReview("paid_invoice_binding_mismatch");
    }
    const previousCancelAtPeriodEnd = await this.currentCancelPosture(binding);
    const existingResult = await this.query(
      `SELECT stripe_subscription_id, stripe_price_id,
              stripe_payment_intent_id, grant_kind, currency,
              amount_paid_minor, quantity, period_start, period_end,
              payment_ref, state
         FROM product_flow_stripe_invoice_grants
        WHERE environment = 'test' AND stripe_invoice_id = $1
        FOR UPDATE`,
      [fact.invoiceId],
    );
    const existing = existingResult.rows[0] as Record<string, unknown> | undefined;
    if (existing) {
      const exact =
        existing.stripe_subscription_id === fact.subscriptionId &&
        existing.stripe_price_id === fact.priceId &&
        existing.stripe_payment_intent_id === fact.paymentIntentId &&
        existing.grant_kind === fact.grantKind &&
        existing.currency === fact.currency &&
        Number(existing.amount_paid_minor) === fact.amountMinor &&
        Number(existing.quantity) === 1 &&
        storedIso(existing.period_start as Date | string) === fact.periodStart &&
        storedIso(existing.period_end as Date | string) === fact.periodEnd;
      return exact
        ? decision("processed", "invoice_already_granted")
        : this.requiresReview("invoice_grant_conflict");
    }
    const previousResult = await this.query(
      `SELECT stripe_invoice_id, period_end
         FROM product_flow_stripe_invoice_grants
        WHERE environment = 'test' AND entitlement_ref = $1
        ORDER BY period_end DESC, stripe_invoice_id DESC
        LIMIT 1
        FOR UPDATE`,
      [binding.entitlement_ref],
    );
    const previous = previousResult.rows[0] as
      | { stripe_invoice_id: string; period_end: Date | string }
      | undefined;
    if (
      (previous === undefined) !== (fact.grantKind === "initial") ||
      (previous && Date.parse(fact.periodStart) < Date.parse(storedIso(previous.period_end)))
    ) {
      return this.requiresReview("invoice_generation_mismatch");
    }
    const occurredAt = locked!.occurredAt;
    if (Date.parse(occurredAt) >= Date.parse(fact.periodEnd)) {
      return this.requiresReview("invoice_period_already_elapsed");
    }
    const paymentRef = providerRef(
      this.receipt.config,
      "stripe_invoice_payment",
      fact.invoiceId,
    );
    const event = normalizeStripeSubscriptionCallbackV1(runtimeMapping(binding), {
      schema: STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
      kind:
        fact.grantKind === "initial"
          ? "invoice_paid_initial"
          : "invoice_paid_renewal",
      event_id: this.eventRef("stripe_event"),
      occurred_at: occurredAt,
      provider_event_ref: this.eventRef("stripe_provider_event"),
      payment_ref: paymentRef,
      confirmed_at: fact.confirmedAt,
      active_until: fact.periodEnd,
    });
    const subscriptionUpdated = await this.query(
      `UPDATE product_flow_stripe_subscriptions
          SET status = $6,
              cancel_at_period_end = $7,
              current_period_start = $2::TIMESTAMPTZ,
              current_period_end = $3::TIMESTAMPTZ,
              provider_updated_at = GREATEST(
                provider_updated_at,
                $4::TIMESTAMPTZ
              ),
              updated_at = $5::TIMESTAMPTZ
        WHERE environment = 'test' AND stripe_subscription_id = $1`,
      [
        fact.subscriptionId,
        fact.periodStart,
        fact.periodEnd,
        fact.confirmedAt,
        occurredAt,
        fact.status,
        fact.cancelAtPeriodEnd,
      ],
    );
    if ((subscriptionUpdated.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The paid PRISM subscription mapping was not updated.",
      );
    }
    const applied = await applyEntitlementEventV1(this.runtimeStore, event);
    await this.mirrorRetrievedCancelPosture(
      binding,
      previousCancelAtPeriodEnd,
      fact.cancelAtPeriodEnd,
    );
    const grantInserted = await this.query(
      `INSERT INTO product_flow_stripe_invoice_grants (
         environment, stripe_invoice_id, stripe_subscription_id,
         entitlement_ref, stripe_price_id, stripe_payment_intent_id,
         grant_kind, currency, amount_paid_minor, quantity,
         period_start, period_end, payment_ref, grant_event_id,
         source_stripe_event_id, state, granted_at
       ) VALUES (
         'test', $1, $2, $3, $4, $5, $6, $7, $8, 1,
         $9::TIMESTAMPTZ, $10::TIMESTAMPTZ, $11, $12, $13,
         'granted', $14::TIMESTAMPTZ
       )`,
      [
        fact.invoiceId,
        fact.subscriptionId,
        binding.entitlement_ref,
        fact.priceId,
        fact.paymentIntentId,
        fact.grantKind,
        fact.currency,
        fact.amountMinor,
        fact.periodStart,
        fact.periodEnd,
        paymentRef,
        applied.event.event_id,
        this.receipt.stripeEventId,
        fact.confirmedAt,
      ],
    );
    if ((grantInserted.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The PRISM invoice grant was not inserted with its projection.",
      );
    }
    return decision(
      "processed",
      fact.grantKind === "initial" ? "initial_invoice_granted" : "renewal_granted",
    );
  }

  async observeInvoicePaymentFailed(
    fact: InvoiceFailedFactV1,
  ): Promise<PrismStripeWebhookDecisionV1> {
    let locked = await this.lockedSubscription(fact.subscriptionId);
    if (locked === null) {
      locked = await this.ensureSubscriptionBinding({
        attemptRef: fact.attemptRef,
        customerId: fact.customerId,
        subscriptionId: fact.subscriptionId,
        priceId: fact.priceId,
        sourceAt: fact.failedAt,
      });
    }
    const binding = locked?.binding ?? null;
    if (
      binding === null ||
      !bindingMatches(binding, fact) ||
      fact.productId !== this.receipt.config.productId ||
      fact.priceId !== this.receipt.config.priceId ||
      fact.currency !== this.receipt.config.currency ||
      fact.amountMinor !== this.receipt.config.unitAmountMinor ||
      fact.quantity !== 1
    ) {
      return this.requiresReview("failed_invoice_binding_mismatch");
    }
    const occurredAt = locked!.occurredAt;
    const event = normalizeStripeSubscriptionCallbackV1(runtimeMapping(binding), {
      schema: STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
      kind: "invoice_payment_failed",
      event_id: this.eventRef("stripe_event"),
      occurred_at: occurredAt,
      provider_event_ref: this.eventRef("stripe_provider_event"),
      payment_ref: providerRef(
        this.receipt.config,
        "stripe_invoice_payment",
        fact.invoiceId,
      ),
      failed_at: fact.failedAt,
    });
    await applyEntitlementEventV1(this.runtimeStore, event);
    return decision("processed", "invoice_failure_observed");
  }

  async applyCancelAtPeriodEnd(
    fact: CancelAtPeriodEndFactV1,
  ): Promise<PrismStripeWebhookDecisionV1> {
    let locked = await this.lockedSubscription(fact.subscriptionId);
    if (locked === null) {
      locked = await this.ensureSubscriptionBinding({
        attemptRef: fact.attemptRef,
        customerId: fact.customerId,
        subscriptionId: fact.subscriptionId,
        priceId: fact.priceId,
        sourceAt: fact.statusAt,
      });
    }
    const binding = locked?.binding ?? null;
    if (binding === null || !bindingMatches(binding, fact)) {
      return this.requiresReview("cancel_binding_mismatch");
    }
    if (
      binding.provider_updated_at &&
      Date.parse(storedIso(binding.provider_updated_at)) > Date.parse(fact.statusAt)
    ) {
      return this.requiresReview("stale_subscription_update");
    }
    const occurredAt = locked!.occurredAt;
    const event = normalizeStripeSubscriptionCallbackV1(runtimeMapping(binding), {
      schema: STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
      kind: "subscription_cancel_at_period_end",
      event_id: this.eventRef("stripe_event"),
      occurred_at: occurredAt,
      provider_event_ref: this.eventRef("stripe_provider_event"),
      subscription_ref: providerRef(
        this.receipt.config,
        "stripe_subscription",
        fact.subscriptionId,
      ),
      status_at: fact.statusAt,
    });
    const subscriptionUpdated = await this.query(
      `UPDATE product_flow_stripe_subscriptions
          SET status = $2,
              cancel_at_period_end = TRUE,
              current_period_start = $3::TIMESTAMPTZ,
              current_period_end = $4::TIMESTAMPTZ,
              provider_updated_at = $5::TIMESTAMPTZ,
              updated_at = $6::TIMESTAMPTZ
        WHERE environment = 'test' AND stripe_subscription_id = $1`,
      [
        fact.subscriptionId,
        fact.status,
        fact.periodStart,
        fact.periodEnd,
        fact.statusAt,
        occurredAt,
      ],
    );
    if ((subscriptionUpdated.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The scheduled-cancel PRISM subscription mapping was not updated.",
      );
    }
    await applyEntitlementEventV1(this.runtimeStore, event);
    return decision("processed", "cancel_at_period_end_applied");
  }

  async applySubscriptionResumed(
    fact: CancelAtPeriodEndFactV1,
  ): Promise<PrismStripeWebhookDecisionV1> {
    let locked = await this.lockedSubscription(fact.subscriptionId);
    if (locked === null) {
      locked = await this.ensureSubscriptionBinding({
        attemptRef: fact.attemptRef,
        customerId: fact.customerId,
        subscriptionId: fact.subscriptionId,
        priceId: fact.priceId,
        sourceAt: fact.statusAt,
      });
    }
    const binding = locked?.binding ?? null;
    if (binding === null || !bindingMatches(binding, fact)) {
      return this.requiresReview("resume_binding_mismatch");
    }
    if (
      binding.provider_updated_at &&
      Date.parse(storedIso(binding.provider_updated_at)) > Date.parse(fact.statusAt)
    ) {
      return this.requiresReview("stale_subscription_resume");
    }
    const occurredAt = locked!.occurredAt;
    const event = normalizeStripeSubscriptionCallbackV1(runtimeMapping(binding), {
      schema: STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
      kind: "subscription_resumed",
      event_id: this.eventRef("stripe_event"),
      occurred_at: occurredAt,
      provider_event_ref: this.eventRef("stripe_provider_event"),
      subscription_ref: providerRef(
        this.receipt.config,
        "stripe_subscription",
        fact.subscriptionId,
      ),
      status_at: fact.statusAt,
    });
    const updated = await this.query(
      `UPDATE product_flow_stripe_subscriptions
          SET status = $2,
              cancel_at_period_end = FALSE,
              current_period_start = $3::TIMESTAMPTZ,
              current_period_end = $4::TIMESTAMPTZ,
              provider_updated_at = $5::TIMESTAMPTZ,
              updated_at = $6::TIMESTAMPTZ
        WHERE environment = 'test' AND stripe_subscription_id = $1`,
      [
        fact.subscriptionId,
        fact.status,
        fact.periodStart,
        fact.periodEnd,
        fact.statusAt,
        occurredAt,
      ],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The resumed PRISM subscription mapping was not updated.",
      );
    }
    await applyEntitlementEventV1(this.runtimeStore, event);
    return decision("processed", "subscription_resumed");
  }

  async applySubscriptionDeleted(
    fact: SubscriptionDeletedFactV1,
  ): Promise<PrismStripeWebhookDecisionV1> {
    let locked = await this.lockedSubscription(fact.subscriptionId);
    if (locked === null) {
      locked = await this.ensureSubscriptionBinding({
        attemptRef: fact.attemptRef,
        customerId: fact.customerId,
        subscriptionId: fact.subscriptionId,
        priceId: fact.priceId,
        sourceAt: fact.statusAt,
      });
    }
    const binding = locked?.binding ?? null;
    if (binding === null || !bindingMatches(binding, fact)) {
      return this.requiresReview("deleted_subscription_binding_mismatch");
    }
    if (
      binding.provider_updated_at &&
      Date.parse(storedIso(binding.provider_updated_at)) > Date.parse(fact.statusAt)
    ) {
      return this.requiresReview("stale_subscription_delete");
    }
    const occurredAt = locked!.occurredAt;
    const event = normalizeStripeSubscriptionCallbackV1(runtimeMapping(binding), {
      schema: STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
      kind: "subscription_ended",
      event_id: this.eventRef("stripe_event"),
      occurred_at: occurredAt,
      provider_event_ref: this.eventRef("stripe_provider_event"),
      subscription_ref: providerRef(
        this.receipt.config,
        "stripe_subscription",
        fact.subscriptionId,
      ),
      status_at: fact.endedAt,
    });
    const subscriptionUpdated = await this.query(
      `UPDATE product_flow_stripe_subscriptions
          SET status = 'canceled', cancel_at_period_end = FALSE,
              current_period_start = $2::TIMESTAMPTZ,
              current_period_end = $3::TIMESTAMPTZ,
              ended_at = $4::TIMESTAMPTZ,
              provider_updated_at = $5::TIMESTAMPTZ,
              updated_at = $6::TIMESTAMPTZ
        WHERE environment = 'test' AND stripe_subscription_id = $1`,
      [
        fact.subscriptionId,
        fact.periodStart,
        fact.periodEnd,
        fact.endedAt,
        fact.statusAt,
        occurredAt,
      ],
    );
    if ((subscriptionUpdated.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The ended PRISM subscription mapping was not updated.",
      );
    }
    await applyEntitlementEventV1(this.runtimeStore, event);
    const terminalized = await this.query(
      `UPDATE product_flow_entitlement_owners
          SET lifecycle = 'terminal', terminal_reason = 'subscription_ended',
              terminal_at = $3::TIMESTAMPTZ, updated_at = $3::TIMESTAMPTZ
        WHERE environment = 'test' AND entitlement_ref = $1
          AND lifecycle = 'current' AND subject_ref = $2`,
      [binding.entitlement_ref, binding.subject_ref, occurredAt],
    );
    if ((terminalized.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The ended PRISM entitlement generation was not closed.",
      );
    }
    return decision("processed", "subscription_ended");
  }

  async applyFullRefund(
    fact: FullRefundFactV1,
  ): Promise<PrismStripeWebhookDecisionV1> {
    if (
      fact.amountRefundedMinor !== this.receipt.config.unitAmountMinor ||
      fact.priceId !== this.receipt.config.priceId ||
      !/^re_[A-Za-z0-9]{8,128}$/.test(fact.refundId)
    ) {
      return this.requiresReview("refund_not_full_or_exact");
    }
    const locked = await this.lockedSubscription(fact.subscriptionId);
    const binding = locked?.binding ?? null;
    if (
      binding === null ||
      binding.stripe_price_id !== fact.priceId
    ) {
      return this.requiresReview("refund_subscription_mismatch");
    }
    const grantResult = await this.query(
      `SELECT g.stripe_invoice_id, g.stripe_subscription_id,
              g.stripe_payment_intent_id, g.stripe_price_id,
              g.payment_ref, g.state, g.period_end, g.stripe_refund_id
         FROM product_flow_stripe_invoice_grants g
        WHERE g.environment = 'test'
          AND g.stripe_invoice_id = $1
          AND g.stripe_subscription_id = $2
          AND g.entitlement_ref = $3
          AND NOT EXISTS (
            SELECT 1
              FROM product_flow_stripe_invoice_grants newer
             WHERE newer.environment = g.environment
               AND newer.entitlement_ref = g.entitlement_ref
               AND (
                 newer.period_end > g.period_end
                 OR (
                   newer.period_end = g.period_end
                   AND newer.stripe_invoice_id > g.stripe_invoice_id
                 )
               )
          )
        FOR UPDATE OF g`,
      [fact.invoiceId, fact.subscriptionId, binding.entitlement_ref],
    );
    const row = grantResult.rows[0] as {
      stripe_invoice_id: string;
      stripe_subscription_id: string;
      stripe_payment_intent_id: string;
      stripe_price_id: string;
      payment_ref: string;
      state: string;
      stripe_refund_id: string | null;
    } | undefined;
    if (
      row?.state === "refunded" &&
      row.stripe_refund_id === fact.refundId &&
      row.stripe_invoice_id === fact.invoiceId &&
      row.stripe_subscription_id === fact.subscriptionId &&
      row.stripe_payment_intent_id === fact.paymentIntentId &&
      row.stripe_price_id === fact.priceId
    ) {
      return decision("processed", "refund_already_applied");
    }
    if (
      !row ||
      binding.owner_lifecycle !== "current" ||
      row.stripe_invoice_id !== fact.invoiceId ||
      row.stripe_subscription_id !== fact.subscriptionId ||
      row.stripe_payment_intent_id !== fact.paymentIntentId ||
      row.stripe_price_id !== fact.priceId ||
      row.state !== "granted"
    ) {
      return this.requiresReview("refund_not_latest_grant");
    }
    const occurredAt = locked!.occurredAt;
    const event = normalizeStripeSubscriptionCallbackV1(runtimeMapping(binding), {
      schema: STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
      kind: "refund_created",
      event_id: this.eventRef("stripe_event"),
      occurred_at: occurredAt,
      provider_event_ref: this.eventRef("stripe_provider_event"),
      refund_extent: "full",
      payment_ref: row.payment_ref,
      refunded_at: fact.refundedAt,
    });
    const applied = await applyEntitlementEventV1(this.runtimeStore, event);
    const reversed = await this.query(
      `UPDATE product_flow_stripe_invoice_grants
          SET state = 'refunded', refund_event_id = $3,
              refund_stripe_event_id = $4, stripe_refund_id = $5,
              refunded_at = $6::TIMESTAMPTZ, updated_at = $2::TIMESTAMPTZ
        WHERE environment = 'test' AND stripe_invoice_id = $1
          AND state = 'granted'`,
      [
        fact.invoiceId,
        occurredAt,
        applied.event.event_id,
        this.receipt.stripeEventId,
        fact.refundId,
        fact.refundedAt,
      ],
    );
    if ((reversed.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The latest PRISM invoice grant lost its refund race.",
      );
    }
    const terminalized = await this.query(
      `UPDATE product_flow_entitlement_owners
          SET lifecycle = 'terminal', terminal_reason = 'refunded',
              terminal_at = $3::TIMESTAMPTZ, updated_at = $3::TIMESTAMPTZ
        WHERE environment = 'test' AND entitlement_ref = $1
          AND lifecycle = 'current' AND subject_ref = $2`,
      [binding.entitlement_ref, binding.subject_ref, occurredAt],
    );
    if ((terminalized.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The refunded PRISM entitlement could not be closed.",
      );
    }
    return decision("processed", "latest_period_refunded");
  }
}

function assertReceiptInput(input: PrismStripeWebhookReceiptInputV1): void {
  canonicalTimestamp(input.providerCreatedAt, "providerCreatedAt");
  canonicalTimestamp(input.receivedAt, "receivedAt");
  if (
    !input.config.webhookProcessingEnabled ||
    input.stripeAccountId !== input.config.accountId ||
    input.apiVersion !== input.config.apiVersion ||
    input.livemode !== false ||
    !/^evt_[A-Za-z0-9]{8,128}$/.test(input.stripeEventId) ||
    !/^[a-z][a-z0-9_.]{0,127}$/.test(input.eventType) ||
    !/^[0-9a-f]{64}$/.test(input.payloadSha256) ||
    Date.parse(input.providerCreatedAt) > Date.parse(input.receivedAt) + 5 * 60_000
  ) {
    throw new PrismStripeStoreError(
      "checkout_unavailable",
      "PRISM Stripe webhook processing is paused or its envelope is invalid.",
    );
  }
}

function sameReceiptSemantics(
  existing: ReceiptRow,
  input: PrismStripeWebhookReceiptInputV1,
): boolean {
  return (
    existing.stripe_account_id === input.stripeAccountId &&
    existing.api_version === input.apiVersion &&
    existing.event_type === input.eventType &&
    existing.livemode === false &&
    existing.payload_sha256 === input.payloadSha256 &&
    storedIso(existing.provider_created_at) === input.providerCreatedAt
  );
}

/**
 * Optional fast path after signature verification and before provider API
 * retrieval. The enclosing transaction remains the final race authority.
 */
export async function preflightPrismStripeWebhookReceipt(
  input: PrismStripeWebhookReceiptInputV1,
  dependencies: PrismStripeStoreDependenciesV1 = {},
): Promise<PrismStripeWebhookProcessResultV1 | null> {
  assertReceiptInput(input);
  const query = dependencies.query ?? storefrontQuery;
  const result = await query(
    `SELECT stripe_account_id, api_version, event_type, livemode,
            payload_sha256, provider_created_at, received_at,
            outcome, outcome_code
       FROM product_flow_stripe_event_receipts
      WHERE environment = 'test' AND stripe_event_id = $1`,
    [input.stripeEventId],
  );
  const existing = result.rows[0] as ReceiptRow | undefined;
  if (!existing) return null;
  if (
    !sameReceiptSemantics(existing, input) ||
    existing.outcome === "processing" ||
    existing.outcome_code === null ||
    !["processed", "ignored", "requires_review"].includes(existing.outcome)
  ) {
    throw new PrismStripeStoreError(
      "binding_conflict",
      "Stripe event id collides with different stored receipt semantics.",
    );
  }
  return Object.freeze({
    disposition: "duplicate" as const,
    outcome: existing.outcome as PrismStripeWebhookOutcomeV1,
    code: existing.outcome_code,
  });
}

export async function processPrismStripeWebhookAtomically(
  input: PrismStripeWebhookReceiptInputV1,
  work: (
    actions: PrismStripeWebhookActionsV1,
  ) => Promise<PrismStripeWebhookDecisionV1> | PrismStripeWebhookDecisionV1,
  dependencies: PrismStripeStoreDependenciesV1 = {},
): Promise<PrismStripeWebhookProcessResultV1> {
  assertReceiptInput(input);
  return withPrismStripeStorefrontTransactionV1(async ({ query, runtimeStore }) => {
    const inserted = await query(
      `INSERT INTO product_flow_stripe_event_receipts (
         environment, stripe_event_id, stripe_account_id, api_version,
         event_type, livemode, payload_sha256, provider_created_at,
         received_at, outcome
       ) VALUES (
         'test', $1, $2, $3, $4, FALSE, $5,
         $6::TIMESTAMPTZ, $7::TIMESTAMPTZ, 'processing'
       ) ON CONFLICT DO NOTHING
       RETURNING stripe_event_id`,
      [
        input.stripeEventId,
        input.stripeAccountId,
        input.apiVersion,
        input.eventType,
        input.payloadSha256,
        input.providerCreatedAt,
        input.receivedAt,
      ],
    );
    if ((inserted.rowCount ?? 0) === 0) {
      const existingResult = await query(
        `SELECT stripe_account_id, api_version, event_type, livemode,
                payload_sha256, provider_created_at, received_at,
                outcome, outcome_code
           FROM product_flow_stripe_event_receipts
          WHERE environment = 'test' AND stripe_event_id = $1
          FOR UPDATE`,
        [input.stripeEventId],
      );
      const existing = existingResult.rows[0] as ReceiptRow | undefined;
      if (
        !existing ||
        !sameReceiptSemantics(existing, input) ||
        existing.outcome === "processing" ||
        existing.outcome_code === null
      ) {
        throw new PrismStripeStoreError(
          "binding_conflict",
          "Stripe event id collides with different stored receipt semantics.",
        );
      }
      return Object.freeze({
        disposition: "duplicate" as const,
        outcome: existing.outcome as PrismStripeWebhookOutcomeV1,
        code: existing.outcome_code,
      });
    }

    const actions = new WebhookActions(query, runtimeStore, input);
    const outcome = await work(actions);
    if (
      !["processed", "ignored", "requires_review"].includes(outcome.outcome) ||
      !validCode(outcome.code)
    ) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "Webhook callback returned an invalid bounded outcome.",
      );
    }
    const completed = await query(
      `UPDATE product_flow_stripe_event_receipts
          SET outcome = $2, outcome_code = $3,
              outcome_payload = '{}'::JSONB,
              completed_at = $4::TIMESTAMPTZ
        WHERE environment = 'test' AND stripe_event_id = $1
          AND outcome = 'processing'`,
      [input.stripeEventId, outcome.outcome, outcome.code, input.receivedAt],
    );
    if ((completed.rowCount ?? 0) !== 1) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "PRISM Stripe receipt did not complete atomically.",
      );
    }
    return Object.freeze({
      disposition: "processed" as const,
      outcome: outcome.outcome,
      code: outcome.code,
    });
  }, dependencies.runTransaction);
}
