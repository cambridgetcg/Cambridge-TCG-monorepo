import "server-only";
import { query as storefrontQuery, transaction as storefrontTransaction } from "@/lib/db";
import {
  PRISM_SIGNALS_ALL_OFFER_ID,
} from "@cambridge-tcg/prism-signals-core";
import {
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  parseEntitlementEventV1,
  parseEntitlementSnapshotV1,
  type EntitlementEventV1,
  type ProductFlowOpaqueRef,
} from "@cambridge-tcg/product-flow";
import { applyEntitlementEventV1 } from "@cambridge-tcg/product-flow-runtime";
import {
  PostgresProductFlowRuntimeStoreV1,
  type ProductFlowRuntimeQueryV1,
  type ProductFlowRuntimeTransactionRunnerV1,
} from "@/lib/product-flow-runtime";
import {
  PRISM_SIGNALS_BETA_CONSENT_VERSION,
  PRISM_SIGNALS_PRODUCT_ID,
} from "../beta-interest";
import {
  prismStripeSandboxPublicPosture,
  type PrismStripeSandboxConfigV1,
  type PrismStripeSandboxPublicPostureV1,
} from "./config.server";
import {
  derivePrismStripeOpaqueRef,
  derivePrismStripePriceRef,
  newPrismStripeOpaqueRef,
} from "./refs.server";

export const PRISM_STRIPE_CHECKOUT_METADATA_TYPE =
  "prism_signals_all_test_v1" as const;
export const PRISM_STRIPE_CHECKOUT_TTL_SECONDS = 3600 as const;

export type PrismStripeCheckoutAttemptStatusV1 =
  | "reserved"
  | "checkout_open"
  | "completed"
  | "expired"
  | "failed"
  | "superseded"
  | "requires_review";

export interface PrismStripeCheckoutMetadataV1 {
  readonly type: typeof PRISM_STRIPE_CHECKOUT_METADATA_TYPE;
  readonly attempt_ref: ProductFlowOpaqueRef;
}

export interface PrismStripeCheckoutParamsV1 {
  readonly mode: "subscription";
  readonly payment_method_types: ["card"];
  readonly client_reference_id: ProductFlowOpaqueRef;
  readonly line_items: [{ price: string; quantity: 1 }];
  readonly success_url: string;
  readonly cancel_url: string;
  readonly expires_at: number;
  readonly metadata: PrismStripeCheckoutMetadataV1;
  readonly subscription_data: Readonly<{
    metadata: PrismStripeCheckoutMetadataV1;
  }>;
  readonly customer?: string;
}

export interface PrismStripeCheckoutAttemptV1 {
  readonly environment: "test";
  readonly attemptRef: ProductFlowOpaqueRef;
  readonly subjectRef: ProductFlowOpaqueRef;
  readonly entitlementRef: ProductFlowOpaqueRef;
  readonly generation: number;
  readonly status: PrismStripeCheckoutAttemptStatusV1;
  readonly idempotencyKey: string;
  readonly checkoutStartedEvent: EntitlementEventV1;
  readonly checkoutParams: PrismStripeCheckoutParamsV1;
  readonly sessionId: string | null;
  readonly providerExpiresAt: string;
}

export type ReservePrismStripeCheckoutResultV1 = Readonly<{
  kind: "reserved" | "reused";
  attempt: PrismStripeCheckoutAttemptV1;
}>;

export type PrismStripeStoreErrorCodeV1 =
  | "not_eligible"
  | "already_active"
  | "checkout_conflict"
  | "not_found"
  | "binding_conflict"
  | "store_invariant"
  | "checkout_unavailable";

export class PrismStripeStoreError extends Error {
  readonly code: PrismStripeStoreErrorCodeV1;
  readonly status: 403 | 404 | 409 | 500 | 503;

  constructor(code: PrismStripeStoreErrorCodeV1, message: string) {
    super(message);
    this.name = "PrismStripeStoreError";
    this.code = code;
    this.status =
      code === "not_eligible"
        ? 403
        : code === "not_found"
          ? 404
          : code === "already_active" ||
              code === "checkout_conflict" ||
              code === "binding_conflict"
            ? 409
            : code === "checkout_unavailable"
              ? 503
              : 500;
  }
}

export interface PrismStripeStoreDependenciesV1 {
  readonly runTransaction?: ProductFlowRuntimeTransactionRunnerV1;
  readonly query?: ProductFlowRuntimeQueryV1;
  readonly newRef?: () => ProductFlowOpaqueRef;
}

interface SubjectRow {
  user_id: string;
  subject_ref: string;
  stripe_customer_id: string | null;
  beta_eligible: boolean;
}

interface OwnerRow {
  entitlement_ref: string;
  subject_ref: string;
  generation: number | string;
  snapshot_payload: unknown | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
}

interface AttemptRow {
  environment: string;
  attempt_ref: string;
  subject_ref: string;
  entitlement_ref: string;
  generation: number | string;
  status: PrismStripeCheckoutAttemptStatusV1;
  idempotency_key: string;
  checkout_started_event: unknown;
  checkout_params: unknown;
  stripe_session_id: string | null;
  provider_expires_at: Date | string;
}

function isoTimestamp(value: Date | string, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw new PrismStripeStoreError(
      "store_invariant",
      `PRISM Stripe storage returned an invalid ${field}.`,
    );
  }
  return date.toISOString();
}

function canonicalInputTimestamp(value: string, field: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== value) {
    throw new PrismStripeStoreError(
      "store_invariant",
      `${field} must be a canonical millisecond UTC timestamp.`,
    );
  }
  return value;
}

function positiveInteger(value: number | string, field: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new PrismStripeStoreError(
      "store_invariant",
      `PRISM Stripe storage returned an invalid ${field}.`,
    );
  }
  return result;
}

function exactHttpsOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PrismStripeStoreError(
      "checkout_unavailable",
      "PRISM Stripe Checkout requires an HTTPS origin.",
    );
  }
  if (parsed.protocol !== "https:" || parsed.origin !== value) {
    throw new PrismStripeStoreError(
      "checkout_unavailable",
      "PRISM Stripe Checkout requires one exact HTTPS origin.",
    );
  }
  return parsed.origin;
}

function exactObject(value: unknown): Record<string, unknown> {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      throw new PrismStripeStoreError(
        "store_invariant",
        "Stored PRISM Stripe JSON is invalid.",
      );
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new PrismStripeStoreError(
      "store_invariant",
      "Stored PRISM Stripe JSON has an invalid shape.",
    );
  }
  return candidate as Record<string, unknown>;
}

function parseCheckoutParams(value: unknown): PrismStripeCheckoutParamsV1 {
  const row = exactObject(value);
  const required = [
    "mode",
    "payment_method_types",
    "client_reference_id",
    "line_items",
    "success_url",
    "cancel_url",
    "expires_at",
    "metadata",
    "subscription_data",
  ];
  const keys = Object.keys(row).sort();
  const expected = [...required, ...(row.customer === undefined ? [] : ["customer"])].sort();
  const metadata = exactObject(row.metadata);
  const subscriptionData = exactObject(row.subscription_data);
  const subscriptionMetadata = exactObject(subscriptionData.metadata);
  const lineItems = row.line_items;
  const expectedMetadataKeys = ["attempt_ref", "type"];
  if (
    JSON.stringify(keys) !== JSON.stringify(expected) ||
    row.mode !== "subscription" ||
    !Array.isArray(row.payment_method_types) ||
    row.payment_method_types.length !== 1 ||
    row.payment_method_types[0] !== "card" ||
    typeof row.client_reference_id !== "string" ||
    typeof row.success_url !== "string" ||
    typeof row.cancel_url !== "string" ||
    !Number.isSafeInteger(row.expires_at) ||
    (row.customer !== undefined && typeof row.customer !== "string") ||
    !Array.isArray(lineItems) ||
    lineItems.length !== 1 ||
    Object.keys(subscriptionData).length !== 1 ||
    JSON.stringify(Object.keys(metadata).sort()) !== JSON.stringify(expectedMetadataKeys) ||
    JSON.stringify(Object.keys(subscriptionMetadata).sort()) !== JSON.stringify(expectedMetadataKeys) ||
    metadata.type !== PRISM_STRIPE_CHECKOUT_METADATA_TYPE ||
    subscriptionMetadata.type !== PRISM_STRIPE_CHECKOUT_METADATA_TYPE ||
    metadata.attempt_ref !== row.client_reference_id ||
    subscriptionMetadata.attempt_ref !== row.client_reference_id
  ) {
    throw new PrismStripeStoreError(
      "store_invariant",
      "Stored PRISM Stripe Checkout parameters drifted from their frozen shape.",
    );
  }
  const item = exactObject(lineItems[0]);
  if (
    JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(["price", "quantity"]) ||
    typeof item.price !== "string" ||
    item.quantity !== 1
  ) {
    throw new PrismStripeStoreError(
      "store_invariant",
      "Stored PRISM Stripe line item is invalid.",
    );
  }
  return freezeCheckoutParams(row as unknown as PrismStripeCheckoutParamsV1);
}

function freezeCheckoutParams(
  params: PrismStripeCheckoutParamsV1,
): PrismStripeCheckoutParamsV1 {
  Object.freeze(params.payment_method_types);
  Object.freeze(params.line_items[0]);
  Object.freeze(params.line_items);
  Object.freeze(params.metadata);
  Object.freeze(params.subscription_data.metadata);
  Object.freeze(params.subscription_data);
  return Object.freeze(params);
}

function attemptFromRow(row: AttemptRow): PrismStripeCheckoutAttemptV1 {
  if (row.environment !== "test") {
    throw new PrismStripeStoreError(
      "store_invariant",
      "PRISM Stripe storage returned a non-test attempt.",
    );
  }
  const checkoutStartedEvent = parseEntitlementEventV1(
    row.checkout_started_event,
  );
  const checkoutParams = parseCheckoutParams(row.checkout_params);
  if (
    checkoutStartedEvent.type !== "checkout_started" ||
    checkoutStartedEvent.event_id === row.attempt_ref ||
    checkoutStartedEvent.subject_ref !== row.subject_ref ||
    checkoutStartedEvent.entitlement_ref !== row.entitlement_ref ||
    checkoutParams.client_reference_id !== row.attempt_ref
  ) {
    throw new PrismStripeStoreError(
      "store_invariant",
      "PRISM Stripe attempt indexes do not match its frozen evidence.",
    );
  }
  return Object.freeze({
    environment: "test",
    attemptRef: row.attempt_ref as ProductFlowOpaqueRef,
    subjectRef: row.subject_ref as ProductFlowOpaqueRef,
    entitlementRef: row.entitlement_ref as ProductFlowOpaqueRef,
    generation: positiveInteger(row.generation, "entitlement generation"),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    checkoutStartedEvent,
    checkoutParams,
    sessionId: row.stripe_session_id,
    providerExpiresAt: isoTimestamp(
      row.provider_expires_at,
      "provider expiry",
    ),
  });
}

const ATTEMPT_COLUMNS = `
  environment, attempt_ref, subject_ref, entitlement_ref, generation, status,
  idempotency_key, checkout_started_event, checkout_params,
  stripe_session_id, provider_expires_at`;

function runtimeStoreForQuery(query: ProductFlowRuntimeQueryV1) {
  return new PostgresProductFlowRuntimeStoreV1(async (work) => work(query));
}

export async function withPrismStripeStorefrontTransactionV1<T>(
  work: (context: Readonly<{
    query: ProductFlowRuntimeQueryV1;
    runtimeStore: PostgresProductFlowRuntimeStoreV1;
  }>) => Promise<T>,
  runTransaction: ProductFlowRuntimeTransactionRunnerV1 = storefrontTransaction,
): Promise<T> {
  return runTransaction((query) =>
    work(Object.freeze({ query, runtimeStore: runtimeStoreForQuery(query) })),
  );
}

export async function reservePrismStripeCheckoutAttempt(
  input: Readonly<{
    userId: string;
    origin: string;
    occurredAt: string;
    config: PrismStripeSandboxConfigV1;
  }>,
  dependencies: PrismStripeStoreDependenciesV1 = {},
): Promise<ReservePrismStripeCheckoutResultV1> {
  if (
    !input.config.webhookProcessingEnabled ||
    !input.config.checkoutIntakeEnabled ||
    input.config.portalConfigurationId === null
  ) {
    throw new PrismStripeStoreError(
      "checkout_unavailable",
      "PRISM Stripe Checkout is paused or incomplete.",
    );
  }
  const origin = exactHttpsOrigin(input.origin);
  const occurredAt = canonicalInputTimestamp(input.occurredAt, "occurredAt");
  const occurredMs = Date.parse(occurredAt);
  const newRef = dependencies.newRef ?? newPrismStripeOpaqueRef;
  const expectedSubjectRef = derivePrismStripeOpaqueRef(
    input.config.referenceSecret,
    "auth_subject",
    input.userId,
  );
  const priceRef = derivePrismStripePriceRef(
    input.config.referenceSecret,
    input.config.priceId,
  );

  return withPrismStripeStorefrontTransactionV1(async ({ query, runtimeStore }) => {
    const accountResult = await query(
      `SELECT u.id AS user_id,
              a.subject_ref,
              a.stripe_customer_id,
              EXISTS (
                SELECT 1
                  FROM product_beta_interests b
                 WHERE b.user_id = u.id
                   AND b.product_id = $2
                   AND b.consent_version = $3
                   AND b.expires_at > $4::TIMESTAMPTZ
              ) AS beta_eligible
         FROM users u
         LEFT JOIN product_flow_account_subjects a
           ON a.environment = 'test'
          AND a.product_id = $2
          AND a.user_id = u.id
        WHERE u.id = $1
        FOR UPDATE OF u`,
      [
        input.userId,
        PRISM_SIGNALS_PRODUCT_ID,
        PRISM_SIGNALS_BETA_CONSENT_VERSION,
        occurredAt,
      ],
    );
    const initial = accountResult.rows[0] as SubjectRow | undefined;
    if (!initial?.beta_eligible) {
      throw new PrismStripeStoreError(
        "not_eligible",
        "An active PRISM beta request is required for sandbox Checkout.",
      );
    }

    await query(
      `INSERT INTO product_flow_account_subjects (
         environment, product_id, subject_ref, user_id
       ) VALUES ('test', $1, $2, $3)
       ON CONFLICT (environment, product_id, user_id) DO NOTHING`,
      [PRISM_SIGNALS_PRODUCT_ID, expectedSubjectRef, input.userId],
    );
    const subjectResult = await query(
      `SELECT user_id, subject_ref, stripe_customer_id, TRUE AS beta_eligible
         FROM product_flow_account_subjects
        WHERE environment = 'test' AND product_id = $1 AND user_id = $2
        FOR UPDATE`,
      [PRISM_SIGNALS_PRODUCT_ID, input.userId],
    );
    const subject = subjectResult.rows[0] as SubjectRow | undefined;
    if (
      !subject ||
      subject.user_id !== input.userId ||
      subject.subject_ref !== expectedSubjectRef
    ) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "The account-to-subject mapping does not match its deterministic reference.",
      );
    }

    const unreconciledHistory = await query(
      `SELECT sub.stripe_subscription_id
         FROM product_flow_stripe_subscriptions sub
         JOIN product_flow_entitlement_owners o
           ON o.environment = sub.environment
          AND o.entitlement_ref = sub.entitlement_ref
        WHERE sub.environment = 'test'
          AND o.product_id = $1
          AND o.subject_ref = $2
          AND o.lifecycle = 'terminal'
          AND sub.status NOT IN ('canceled', 'incomplete_expired')
        LIMIT 1
        FOR UPDATE OF sub, o`,
      [PRISM_SIGNALS_PRODUCT_ID, expectedSubjectRef],
    );
    if ((unreconciledHistory.rowCount ?? 0) > 0) {
      throw new PrismStripeStoreError(
        "checkout_conflict",
        "A terminal entitlement still has a non-terminal Stripe subscription and requires reconciliation.",
      );
    }

    const ownerResult = await query(
      `SELECT o.entitlement_ref, o.subject_ref, o.generation,
              s.snapshot_payload,
              sub.stripe_subscription_id,
              sub.status AS subscription_status
         FROM product_flow_entitlement_owners o
         LEFT JOIN product_flow_entitlement_snapshots s
           ON s.environment = o.environment
          AND s.entitlement_ref = o.entitlement_ref
         LEFT JOIN product_flow_stripe_subscriptions sub
           ON sub.environment = o.environment
          AND sub.entitlement_ref = o.entitlement_ref
        WHERE o.environment = 'test'
          AND o.product_id = $1
          AND o.subject_ref = $2
          AND o.lifecycle = 'current'
        FOR UPDATE OF o`,
      [PRISM_SIGNALS_PRODUCT_ID, expectedSubjectRef],
    );
    let owner = ownerResult.rows[0] as OwnerRow | undefined;
    let ownerSnapshot = owner?.snapshot_payload
      ? parseEntitlementSnapshotV1(owner.snapshot_payload)
      : null;
    if (ownerSnapshot) {
      const snapshot = ownerSnapshot;
      if (
        snapshot.status === "active" &&
        snapshot.active_until !== null &&
        Date.parse(snapshot.active_until) > occurredMs
      ) {
        throw new PrismStripeStoreError(
          "already_active",
          "This account already has current PRISM All access.",
        );
      }
    }
    const providerTerminal =
      owner?.subscription_status === "canceled" ||
      owner?.subscription_status === "incomplete_expired";
    const projectionTerminal = ownerSnapshot?.status === "ended";
    if (
      owner &&
      (providerTerminal || projectionTerminal) &&
      !(
        ownerSnapshot?.status === "active" &&
        ownerSnapshot.active_until !== null &&
        Date.parse(ownerSnapshot.active_until) > occurredMs
      ) &&
      (!owner.stripe_subscription_id || providerTerminal)
    ) {
      const terminalReason =
        ownerSnapshot?.reason === "refunded" ||
        ownerSnapshot?.reason === "revoked" ||
        ownerSnapshot?.reason === "subscription_ended"
          ? ownerSnapshot.reason
          : owner.subscription_status === "canceled"
            ? "subscription_ended"
            : "superseded_before_grant";
      await query(
        `UPDATE product_flow_stripe_checkout_attempts
            SET status = 'superseded', updated_at = $2::TIMESTAMPTZ
          WHERE environment = 'test' AND entitlement_ref = $1
            AND status IN ('reserved', 'checkout_open')`,
        [owner.entitlement_ref, occurredAt],
      );
      const terminalized = await query(
        `UPDATE product_flow_entitlement_owners
            SET lifecycle = 'terminal', terminal_reason = $2,
                terminal_at = $3::TIMESTAMPTZ,
                updated_at = $3::TIMESTAMPTZ
          WHERE environment = 'test' AND entitlement_ref = $1
            AND lifecycle = 'current'`,
        [owner.entitlement_ref, terminalReason, occurredAt],
      );
      if ((terminalized.rowCount ?? 0) !== 1) {
        throw new PrismStripeStoreError(
          "store_invariant",
          "PRISM Stripe could not close the terminal entitlement generation.",
        );
      }
      owner = undefined;
      ownerSnapshot = null;
    } else if (owner?.stripe_subscription_id) {
      throw new PrismStripeStoreError(
        "checkout_conflict",
        "This account has a non-terminal or ambiguous PRISM Stripe subscription.",
      );
    } else if (
      ownerSnapshot?.status === "active" &&
      ownerSnapshot.active_until !== null &&
      Date.parse(ownerSnapshot.active_until) <= occurredMs
    ) {
      throw new PrismStripeStoreError(
        "checkout_conflict",
        "Expired PRISM access requires subscription reconciliation before a new Checkout.",
      );
    }

    if (!owner) {
      const generationResult = await query(
        `SELECT COALESCE(MAX(generation), 0) + 1 AS generation
           FROM product_flow_entitlement_owners
          WHERE environment = 'test' AND product_id = $1 AND subject_ref = $2`,
        [PRISM_SIGNALS_PRODUCT_ID, expectedSubjectRef],
      );
      const generation = positiveInteger(
        (generationResult.rows[0] as { generation?: number | string } | undefined)
          ?.generation ?? 1,
        "next entitlement generation",
      );
      const entitlementRef = newRef();
      const inserted = await query(
        `INSERT INTO product_flow_entitlement_owners (
           environment, entitlement_ref, product_id, subject_ref,
           offer_id, offer_version, generation, lifecycle
         ) VALUES ('test', $1, $2, $3, $4, 1, $5, 'current')
         RETURNING entitlement_ref, subject_ref, generation,
                   NULL::JSONB AS snapshot_payload,
                   NULL::TEXT AS stripe_subscription_id,
                   NULL::TEXT AS subscription_status`,
        [
          entitlementRef,
          PRISM_SIGNALS_PRODUCT_ID,
          expectedSubjectRef,
          PRISM_SIGNALS_ALL_OFFER_ID,
          generation,
        ],
      );
      owner = inserted.rows[0] as OwnerRow | undefined;
      if (!owner) {
        throw new PrismStripeStoreError(
          "store_invariant",
          "PRISM Stripe storage did not return the new entitlement owner.",
        );
      }
    }

    const activeAttemptResult = await query(
      `SELECT ${ATTEMPT_COLUMNS}
         FROM product_flow_stripe_checkout_attempts
        WHERE environment = 'test'
          AND entitlement_ref = $1
          AND status IN ('reserved', 'checkout_open', 'requires_review')
        FOR UPDATE`,
      [owner.entitlement_ref],
    );
    const activeAttempt = activeAttemptResult.rows[0] as AttemptRow | undefined;
    if (activeAttempt) {
      if (activeAttempt.status === "requires_review") {
        throw new PrismStripeStoreError(
          "checkout_conflict",
          "The existing PRISM Checkout attempt requires review.",
        );
      }
      if (Date.parse(isoTimestamp(activeAttempt.provider_expires_at, "provider expiry")) > occurredMs) {
        return Object.freeze({
          kind: "reused" as const,
          attempt: attemptFromRow(activeAttempt),
        });
      }
      await query(
        `UPDATE product_flow_stripe_checkout_attempts
            SET status = 'expired', updated_at = $2::TIMESTAMPTZ
          WHERE environment = 'test' AND attempt_ref = $1
            AND status IN ('reserved', 'checkout_open')`,
        [activeAttempt.attempt_ref, occurredAt],
      );
    }

    const attemptRef = newRef();
    const eventId = newRef();
    const entitlementRef = owner.entitlement_ref as ProductFlowOpaqueRef;
    const subjectRef = owner.subject_ref as ProductFlowOpaqueRef;
    const generation = positiveInteger(owner.generation, "entitlement generation");
    const providerExpiresEpoch = Math.floor(occurredMs / 1000) + PRISM_STRIPE_CHECKOUT_TTL_SECONDS;
    const providerExpiresAt = new Date(providerExpiresEpoch * 1000).toISOString();
    const metadata: PrismStripeCheckoutMetadataV1 = Object.freeze({
      type: PRISM_STRIPE_CHECKOUT_METADATA_TYPE,
      attempt_ref: attemptRef,
    });
    const checkoutParams: PrismStripeCheckoutParamsV1 = freezeCheckoutParams({
      mode: "subscription",
      payment_method_types: ["card"] as ["card"],
      client_reference_id: attemptRef,
      line_items: Object.freeze([
        Object.freeze({ price: input.config.priceId, quantity: 1 as const }),
      ]) as unknown as PrismStripeCheckoutParamsV1["line_items"],
      success_url: `${origin}/prism-signals/checkout/return`,
      cancel_url: `${origin}/prism-signals/account`,
      expires_at: providerExpiresEpoch,
      metadata,
      subscription_data: Object.freeze({ metadata }),
      ...(subject.stripe_customer_id
        ? { customer: subject.stripe_customer_id }
        : {}),
    });
    const checkoutStartedEvent = parseEntitlementEventV1({
      schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
      event_id: eventId,
      environment: "test",
      type: "checkout_started",
      occurred_at: occurredAt,
      entitlement_ref: entitlementRef,
      subject_ref: subjectRef,
      offer_id: PRISM_SIGNALS_ALL_OFFER_ID,
      offer_version: 1,
      channel: "web",
      rail: "stripe_web",
      price_ref: priceRef,
    });
    const insertedAttempt = await query(
      `INSERT INTO product_flow_stripe_checkout_attempts (
         environment, attempt_ref, product_id, subject_ref, entitlement_ref,
         offer_id, offer_version, generation, price_ref, stripe_price_id,
         stripe_customer_id, status, idempotency_key, checkout_started_event,
         checkout_params, provider_expires_at, created_at, updated_at
       ) VALUES (
         'test', $1, $2, $3, $4, $5, 1, $6, $7, $8, $9, 'reserved',
         $10, $11::JSONB, $12::JSONB, $13::TIMESTAMPTZ,
         $14::TIMESTAMPTZ, $14::TIMESTAMPTZ
       ) RETURNING ${ATTEMPT_COLUMNS}`,
      [
        attemptRef,
        PRISM_SIGNALS_PRODUCT_ID,
        subjectRef,
        entitlementRef,
        PRISM_SIGNALS_ALL_OFFER_ID,
        generation,
        priceRef,
        input.config.priceId,
        subject.stripe_customer_id,
        `prism:test:${attemptRef}`,
        JSON.stringify(checkoutStartedEvent),
        JSON.stringify(checkoutParams),
        providerExpiresAt,
        occurredAt,
      ],
    );
    const insertedRow = insertedAttempt.rows[0] as AttemptRow | undefined;
    if (!insertedRow) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "PRISM Stripe storage did not return the reserved attempt.",
      );
    }
    await applyEntitlementEventV1(runtimeStore, checkoutStartedEvent);
    return Object.freeze({
      kind: "reserved" as const,
      attempt: attemptFromRow(insertedRow),
    });
  }, dependencies.runTransaction);
}

export async function attachPrismStripeCheckoutSession(
  input: Readonly<{
    config: PrismStripeSandboxConfigV1;
    attemptRef: ProductFlowOpaqueRef;
    sessionId: string;
    expiresAtEpochSeconds: number;
  }>,
  dependencies: PrismStripeStoreDependenciesV1 = {},
): Promise<PrismStripeCheckoutAttemptV1> {
  if (!/^cs_test_[A-Za-z0-9]{8,128}$/.test(input.sessionId)) {
    throw new PrismStripeStoreError(
      "binding_conflict",
      "Stripe returned a non-test or malformed Checkout Session id.",
    );
  }
  if (!Number.isSafeInteger(input.expiresAtEpochSeconds)) {
    throw new PrismStripeStoreError(
      "binding_conflict",
      "Stripe returned an invalid Checkout expiry.",
    );
  }
  return withPrismStripeStorefrontTransactionV1(async ({ query }) => {
    const selected = await query(
      `SELECT ${ATTEMPT_COLUMNS}
         FROM product_flow_stripe_checkout_attempts
        WHERE environment = $1 AND attempt_ref = $2
        FOR UPDATE`,
      [input.config.environment, input.attemptRef],
    );
    const row = selected.rows[0] as AttemptRow | undefined;
    if (!row) {
      throw new PrismStripeStoreError("not_found", "PRISM Checkout attempt was not found.");
    }
    const attempt = attemptFromRow(row);
    if (
      attempt.checkoutParams.expires_at !== input.expiresAtEpochSeconds ||
      (attempt.sessionId !== null && attempt.sessionId !== input.sessionId)
    ) {
      throw new PrismStripeStoreError(
        "binding_conflict",
        "Stripe Checkout Session does not match the frozen local attempt.",
      );
    }
    if (attempt.sessionId === input.sessionId && attempt.status === "checkout_open") {
      return attempt;
    }
    if (attempt.status !== "reserved") {
      throw new PrismStripeStoreError(
        "checkout_conflict",
        "PRISM Checkout attempt is no longer reservable.",
      );
    }
    const updated = await query(
      `UPDATE product_flow_stripe_checkout_attempts
          SET stripe_session_id = $3,
              status = 'checkout_open',
              updated_at = NOW()
        WHERE environment = $1 AND attempt_ref = $2 AND status = 'reserved'
        RETURNING ${ATTEMPT_COLUMNS}`,
      [input.config.environment, input.attemptRef, input.sessionId],
    );
    const updatedRow = updated.rows[0] as AttemptRow | undefined;
    if (!updatedRow) {
      throw new PrismStripeStoreError(
        "binding_conflict",
        "PRISM Checkout attempt lost its attachment race.",
      );
    }
    return attemptFromRow(updatedRow);
  }, dependencies.runTransaction);
}

export type PrismStripeSubscriptionStatusDtoV1 = Readonly<{
  schema: "cambridgetcg.prism-subscription-status/1";
  sandbox: true;
  plan: "free" | "all";
  access: Readonly<{
    allowed: boolean;
    reason: string;
    active_until: string | null;
  }>;
  subscription: null | Readonly<{
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  }>;
  checkout: Readonly<{ available: boolean; reason: string }>;
  portal: Readonly<{ available: boolean }>;
}>;

interface StatusRow {
  beta_eligible: boolean;
  stripe_customer_id: string | null;
  entitlement_ref: string | null;
  subject_ref: string | null;
  offer_id: string | null;
  offer_version: number | string | null;
  snapshot_payload: unknown | null;
  subscription_status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: Date | string | null;
}

export async function readPrismStripeOwnerStatus(
  input: Readonly<{
    userId: string;
    evaluatedAt: string;
    posture?: PrismStripeSandboxPublicPostureV1;
  }>,
  dependencies: PrismStripeStoreDependenciesV1 = {},
): Promise<PrismStripeSubscriptionStatusDtoV1> {
  const evaluatedAt = canonicalInputTimestamp(input.evaluatedAt, "evaluatedAt");
  const posture = input.posture ?? prismStripeSandboxPublicPosture();
  const query = dependencies.query ?? storefrontQuery;
  const result = await query(
    `SELECT EXISTS (
              SELECT 1 FROM product_beta_interests b
               WHERE b.user_id = u.id
                 AND b.product_id = $2
                 AND b.consent_version = $3
                 AND b.expires_at > $4::TIMESTAMPTZ
            ) AS beta_eligible,
            a.stripe_customer_id,
            owner.entitlement_ref,
            owner.subject_ref,
            owner.offer_id,
            owner.offer_version,
            snap.snapshot_payload,
            sub.status AS subscription_status,
            sub.cancel_at_period_end,
            sub.current_period_end
       FROM users u
       LEFT JOIN product_flow_account_subjects a
         ON a.environment = 'test' AND a.product_id = $2 AND a.user_id = u.id
       LEFT JOIN product_flow_entitlement_owners owner
         ON owner.environment = a.environment
        AND owner.product_id = a.product_id
        AND owner.subject_ref = a.subject_ref
        AND owner.lifecycle = 'current'
       LEFT JOIN product_flow_entitlement_snapshots snap
         ON snap.environment = owner.environment
        AND snap.entitlement_ref = owner.entitlement_ref
       LEFT JOIN product_flow_stripe_subscriptions sub
         ON sub.environment = owner.environment
        AND sub.entitlement_ref = owner.entitlement_ref
      WHERE u.id = $1`,
    [
      input.userId,
      PRISM_SIGNALS_PRODUCT_ID,
      PRISM_SIGNALS_BETA_CONSENT_VERSION,
      evaluatedAt,
    ],
  );
  const row = result.rows[0] as StatusRow | undefined;
  let allowed = false;
  let reason = "no_paid_entitlement";
  let activeUntil: string | null = null;
  if (row?.snapshot_payload) {
    const snapshot = parseEntitlementSnapshotV1(row.snapshot_payload);
    if (
      snapshot.environment !== "test" ||
      snapshot.entitlement_ref !== row.entitlement_ref ||
      snapshot.subject_ref !== row.subject_ref ||
      snapshot.offer_id !== PRISM_SIGNALS_ALL_OFFER_ID ||
      row.offer_id !== PRISM_SIGNALS_ALL_OFFER_ID ||
      snapshot.offer_version !== 1 ||
      Number(row.offer_version) !== 1
    ) {
      throw new PrismStripeStoreError(
        "store_invariant",
        "Stored PRISM owner and entitlement projection scopes do not match.",
      );
    }
    activeUntil = snapshot.active_until;
    allowed =
      snapshot.status === "active" &&
      activeUntil !== null &&
      Date.parse(activeUntil) > Date.parse(evaluatedAt);
    reason = allowed
      ? "active"
      : snapshot.status === "active"
        ? "expired"
        : snapshot.reason;
  }
  const isAll = row?.subscription_status != null || allowed;
  if (
    row?.subscription_status !== null &&
    row?.subscription_status !== undefined &&
    ![
      "incomplete",
      "incomplete_expired",
      "trialing",
      "active",
      "past_due",
      "canceled",
      "unpaid",
      "paused",
    ].includes(row.subscription_status)
  ) {
    throw new PrismStripeStoreError(
      "store_invariant",
      "Stored PRISM Stripe subscription status is invalid.",
    );
  }
  const checkoutReason = !row?.beta_eligible
    ? "not_eligible"
    : isAll && allowed
      ? "already_all"
      : isAll
        ? "existing_subscription"
        : posture.reason;
  return Object.freeze({
    schema: "cambridgetcg.prism-subscription-status/1" as const,
    sandbox: true as const,
    plan: isAll ? "all" as const : "free" as const,
    access: Object.freeze({ allowed, reason, active_until: activeUntil }),
    subscription: row?.subscription_status
      ? Object.freeze({
          status: row.subscription_status,
          cancel_at_period_end: row.cancel_at_period_end === true,
          current_period_end: row.current_period_end
            ? isoTimestamp(row.current_period_end, "current subscription period end")
            : null,
        })
      : null,
    checkout: Object.freeze({
      available:
        row?.beta_eligible === true &&
        !isAll &&
        posture.checkout_available,
      reason: checkoutReason,
    }),
    portal: Object.freeze({
      available:
        row?.stripe_customer_id != null && posture.portal_available,
    }),
  });
}

export async function findPrismStripePortalBinding(
  input: Readonly<{ userId: string; config: PrismStripeSandboxConfigV1 }>,
  dependencies: PrismStripeStoreDependenciesV1 = {},
): Promise<Readonly<{ customerId: string; portalConfigurationId: string }> | null> {
  if (input.config.portalConfigurationId === null) return null;
  const query = dependencies.query ?? storefrontQuery;
  const result = await query(
    `SELECT stripe_customer_id
       FROM product_flow_account_subjects
      WHERE environment = $1 AND product_id = $2 AND user_id = $3`,
    [input.config.environment, PRISM_SIGNALS_PRODUCT_ID, input.userId],
  );
  const customerId = (result.rows[0] as { stripe_customer_id?: unknown } | undefined)
    ?.stripe_customer_id;
  if (customerId == null) return null;
  if (typeof customerId !== "string" || !/^cus_[A-Za-z0-9]{8,64}$/.test(customerId)) {
    throw new PrismStripeStoreError(
      "store_invariant",
      "Stored PRISM Stripe Customer binding is invalid.",
    );
  }
  return Object.freeze({
    customerId,
    portalConfigurationId: input.config.portalConfigurationId,
  });
}
