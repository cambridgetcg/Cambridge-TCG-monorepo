import {
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  type EntitlementEventV1,
  type ProductEnvironment,
  type ProductFlowOpaqueRef,
} from "@cambridge-tcg/product-flow";

import { ProductFlowRuntimeConformanceError } from "./error";
import { applyEntitlementEventV1 } from "./runtime";
import type { ProductFlowRuntimeStoreV1 } from "./types";

export type ProductFlowRuntimeStoreFactoryV1 = () =>
  | ProductFlowRuntimeStoreV1
  | Promise<ProductFlowRuntimeStoreV1>;

export interface ProductFlowRuntimeStoreConformanceCaseV1 {
  readonly name: string;
  readonly run: (factory: ProductFlowRuntimeStoreFactoryV1) => Promise<void>;
}

type ConfirmationEventV1 = Extract<
  EntitlementEventV1,
  { readonly type: "payment_confirmed" | "renewal_confirmed" }
>;

const reference = (label: string): ProductFlowOpaqueRef =>
  `pf_${label.padEnd(16, "x")}` as ProductFlowOpaqueRef;

function confirmation(
  options: {
    readonly event_id?: ProductFlowOpaqueRef;
    readonly provider_event_ref?: ProductFlowOpaqueRef;
    readonly payment_ref?: ProductFlowOpaqueRef;
    readonly occurred_at?: string;
    readonly confirmed_at?: string;
    readonly active_until?: string;
    readonly renewal?: boolean;
    readonly environment?: ProductEnvironment;
    readonly entitlement_ref?: ProductFlowOpaqueRef;
    readonly subject_ref?: ProductFlowOpaqueRef;
  } = {},
): ConfirmationEventV1 {
  const occurredAt = options.occurred_at ?? "2026-09-02T10:00:00.000Z";
  const activeUntil = options.active_until ?? "2026-10-02T10:00:00.000Z";
  const type = options.renewal ? "renewal_confirmed" : "payment_confirmed";
  const eventId = options.event_id ?? reference("confirm-event");
  const providerEventRef =
    options.provider_event_ref ?? reference("confirm-provider");
  const paymentRef = options.payment_ref ?? reference("confirm-payment");
  const environment = options.environment ?? "test";
  const entitlementRef = options.entitlement_ref ?? reference("entitlement");
  const subjectRef = options.subject_ref ?? reference("subject");
  return {
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    event_id: eventId,
    environment,
    type,
    occurred_at: occurredAt,
    entitlement_ref: entitlementRef,
    subject_ref: subjectRef,
    offer_id: "runtime-conformance",
    offer_version: 1,
    channel: "web",
    rail: "stripe_web",
    price_ref: reference("price"),
    active_until: activeUntil,
    evidence: {
      kind: "provider_confirmation",
      source: "provider_webhook",
      environment,
      entitlement_ref: entitlementRef,
      subject_ref: subjectRef,
      offer_id: "runtime-conformance",
      offer_version: 1,
      channel: "web",
      rail: "stripe_web",
      price_ref: reference("price"),
      provider_event_ref: providerEventRef,
      payment_ref: paymentRef,
      confirmed_at: options.confirmed_at ?? occurredAt,
      active_until: activeUntil,
    },
  };
}

function browserObservation(
  eventId: ProductFlowOpaqueRef,
  occurredAt: string,
): EntitlementEventV1 {
  return {
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    event_id: eventId,
    environment: "test",
    type: "browser_return",
    occurred_at: occurredAt,
    entitlement_ref: reference("entitlement"),
    subject_ref: reference("subject"),
    offer_id: "runtime-conformance",
    offer_version: 1,
    channel: "web",
    rail: "stripe_web",
    price_ref: reference("price"),
  };
}

function refund(
  paymentRef: ProductFlowOpaqueRef,
  eventId: ProductFlowOpaqueRef,
  providerEventRef: ProductFlowOpaqueRef,
  occurredAt: string,
): EntitlementEventV1 {
  return {
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    event_id: eventId,
    environment: "test",
    type: "refunded",
    occurred_at: occurredAt,
    entitlement_ref: reference("entitlement"),
    subject_ref: reference("subject"),
    offer_id: "runtime-conformance",
    offer_version: 1,
    channel: "web",
    rail: "stripe_web",
    price_ref: reference("price"),
    evidence: {
      kind: "provider_reversal",
      source: "provider_webhook",
      environment: "test",
      entitlement_ref: reference("entitlement"),
      subject_ref: reference("subject"),
      offer_id: "runtime-conformance",
      offer_version: 1,
      channel: "web",
      rail: "stripe_web",
      price_ref: reference("price"),
      provider_event_ref: providerEventRef,
      payment_ref: paymentRef,
      confirmed_at: occurredAt,
    },
  };
}

function assertCase(
  caseName: string,
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new ProductFlowRuntimeConformanceError(caseName, message);
  }
}

const CASES: readonly ProductFlowRuntimeStoreConformanceCaseV1[] = [
  {
    name: "atomic lock, append, reduce, and persist",
    async run(factory) {
      const store = await factory();
      const initial = await applyEntitlementEventV1(store, confirmation());
      assertCase(this.name, initial.disposition === "applied", "not applied");
      assertCase(
        this.name,
        initial.snapshot.status === "active",
        "confirmation did not activate",
      );

      const renewal = await applyEntitlementEventV1(
        store,
        confirmation({
          renewal: true,
          event_id: reference("renewal-event"),
          provider_event_ref: reference("renewal-provider"),
          payment_ref: reference("renewal-payment"),
          occurred_at: "2026-09-25T10:00:00.000Z",
          active_until: "2026-11-02T10:00:00.000Z",
        }),
      );
      assertCase(
        this.name,
        renewal.snapshot.reason === "renewal_confirmed" &&
          renewal.snapshot.active_until === "2026-11-02T10:00:00.000Z",
        "the next transaction did not load the persisted active snapshot",
      );
    },
  },
  {
    name: "duplicate provider reference is idempotent",
    async run(factory) {
      const store = await factory();
      const event = confirmation();
      await applyEntitlementEventV1(store, event);
      const duplicate = await applyEntitlementEventV1(store, {
        ...event,
        event_id: reference("retry-event"),
      });
      assertCase(
        this.name,
        duplicate.disposition === "duplicate" &&
          duplicate.matched_by.includes("provider_event_ref") &&
          duplicate.matched_by.includes("grant_identity"),
        "provider retry was not reported as an idempotent duplicate",
      );
      assertCase(
        this.name,
        duplicate.snapshot.processed_event_ids.length === 1,
        "provider retry changed the projection",
      );
    },
  },
  {
    name: "changed duplicate payload fails closed",
    async run(factory) {
      const store = await factory();
      const event = confirmation();
      await applyEntitlementEventV1(store, event);
      let rejected = false;
      try {
        await applyEntitlementEventV1(store, {
          ...event,
          event_id: reference("changed-event"),
          occurred_at: "2026-09-02T10:00:01.000Z",
        });
      } catch {
        rejected = true;
      }
      assertCase(this.name, rejected, "changed collision was accepted");
      const exact = await applyEntitlementEventV1(store, event);
      assertCase(
        this.name,
        exact.disposition === "duplicate" && exact.snapshot.status === "active",
        "conflicting transaction changed committed state",
      );
    },
  },
  {
    name: "transaction callback failure rolls back event append",
    async run(factory) {
      const store = await factory();
      const event = confirmation();
      let rejected = false;
      try {
        await store.transaction(async (transaction) => {
          await transaction.lockEntitlement({
            environment: event.environment,
            entitlement_ref: event.entitlement_ref,
            subject_ref: event.subject_ref,
            offer_id: event.offer_id,
            offer_version: event.offer_version,
          });
          await transaction.appendUniqueEvent(event);
          throw new Error("conformance rollback marker");
        });
      } catch {
        rejected = true;
      }
      assertCase(this.name, rejected, "transaction failure was swallowed");
      const applied = await applyEntitlementEventV1(store, event);
      assertCase(
        this.name,
        applied.disposition === "applied",
        "failed transaction left an event append behind",
      );
    },
  },
  {
    name: "low-level append cannot cross the locked entitlement scope",
    async run(factory) {
      const store = await factory();
      const event = confirmation();
      let appendRejected = false;
      try {
        await store.transaction(async (transaction) => {
          const locked = await transaction.lockEntitlement({
            environment: event.environment,
            entitlement_ref: event.entitlement_ref,
            subject_ref: event.subject_ref,
            offer_id: event.offer_id,
            offer_version: event.offer_version,
          });
          const foreignSubject = reference("foreign-subject");
          try {
            await transaction.appendUniqueEvent({
              ...event,
              subject_ref: foreignSubject,
              evidence: {
                ...event.evidence,
                subject_ref: foreignSubject,
              },
            });
          } catch (error) {
            appendRejected = true;
            throw error;
          }
          // A broken adapter that accepts the foreign event must be allowed to
          // finish its normal stage sequence; otherwise assertCommittable()
          // could make this conformance case pass for the wrong reason.
          await transaction.persistEntitlement(locked);
        });
      } catch {}
      assertCase(
        this.name,
        appendRejected,
        "appendUniqueEvent accepted an event outside the locked scope",
      );
      const applied = await applyEntitlementEventV1(store, event);
      assertCase(
        this.name,
        applied.disposition === "applied",
        "the rejected transaction left state behind",
      );
    },
  },
  {
    name: "concurrent provider retry projects exactly once",
    async run(factory) {
      const store = await factory();
      const event = confirmation();
      const retry = {
        ...event,
        event_id: reference("concurrent-retry"),
      };
      const results = await Promise.all([
        applyEntitlementEventV1(store, event),
        applyEntitlementEventV1(store, retry),
      ]);
      assertCase(
        this.name,
        results.filter((result) => result.disposition === "applied").length ===
          1 &&
          results.filter((result) => result.disposition === "duplicate")
            .length === 1,
        "concurrent retry was not exactly-once",
      );
      assertCase(
        this.name,
        results.every(
          (result) =>
            result.snapshot.status === "active" &&
            result.snapshot.processed_event_ids.length === 1,
        ),
        "concurrent retry changed the entitlement projection",
      );
    },
  },
  {
    name: "distinct provider events for one payment grant are idempotent",
    async run(factory) {
      const store = await factory();
      const event = confirmation();
      await applyEntitlementEventV1(store, event);
      const duplicate = await applyEntitlementEventV1(
        store,
        confirmation({
          event_id: reference("second-grant-event"),
          provider_event_ref: reference("second-provider-event"),
          payment_ref: event.evidence.payment_ref,
          occurred_at: "2026-09-02T10:00:01.000Z",
          confirmed_at: event.evidence.confirmed_at,
        }),
      );
      assertCase(
        this.name,
        duplicate.disposition === "duplicate" &&
          duplicate.matched_by.length === 1 &&
          duplicate.matched_by[0] === "grant_identity",
        "the underlying payment grant was projected more than once",
      );
      assertCase(
        this.name,
        duplicate.event.event_id === event.event_id &&
          duplicate.snapshot.processed_event_ids.length === 1,
        "duplicate result did not expose the stored projected event",
      );
    },
  },
  {
    name: "payment grant identity cannot cross entitlements",
    async run(factory) {
      const store = await factory();
      const event = confirmation();
      await applyEntitlementEventV1(store, event);
      let rejected = false;
      try {
        await applyEntitlementEventV1(
          store,
          confirmation({
            event_id: reference("cross-event"),
            provider_event_ref: reference("cross-provider"),
            payment_ref: event.evidence.payment_ref,
            entitlement_ref: reference("other-entitlement"),
            subject_ref: reference("other-subject"),
          }),
        );
      } catch {
        rejected = true;
      }
      assertCase(this.name, rejected, "cross-entitlement grant was accepted");
      const exact = await applyEntitlementEventV1(store, event);
      assertCase(
        this.name,
        exact.disposition === "duplicate" && exact.snapshot.status === "active",
        "cross-entitlement conflict changed committed access",
      );
    },
  },
  {
    name: "late observation rolls back without poisoning access",
    async run(factory) {
      const store = await factory();
      const event = confirmation();
      await applyEntitlementEventV1(store, event);
      let rejected = false;
      try {
        await applyEntitlementEventV1(
          store,
          browserObservation(
            reference("late-browser"),
            "2026-09-02T09:00:00.000Z",
          ),
        );
      } catch {
        rejected = true;
      }
      assertCase(this.name, rejected, "late observation was persisted");
      const exact = await applyEntitlementEventV1(store, event);
      assertCase(
        this.name,
        exact.disposition === "duplicate" && exact.snapshot.status === "active",
        "late observation poisoned valid access",
      );
    },
  },
  {
    name: "only latest payment refund can end renewed access",
    async run(factory) {
      const store = await factory();
      const paymentA = confirmation({ payment_ref: reference("payment-a") });
      await applyEntitlementEventV1(store, paymentA);
      const paymentB = confirmation({
        renewal: true,
        event_id: reference("payment-b-event"),
        provider_event_ref: reference("payment-b-provider"),
        payment_ref: reference("payment-b"),
        occurred_at: "2026-09-25T10:00:00.000Z",
        active_until: "2026-11-02T10:00:00.000Z",
      });
      await applyEntitlementEventV1(store, paymentB);

      let oldRefundRejected = false;
      try {
        await applyEntitlementEventV1(
          store,
          refund(
            paymentA.evidence.payment_ref,
            reference("refund-a-event"),
            reference("refund-a-provider"),
            "2026-10-01T10:00:00.000Z",
          ),
        );
      } catch {
        oldRefundRejected = true;
      }
      assertCase(
        this.name,
        oldRefundRejected,
        "an older-period refund ended renewed access",
      );
      const afterOldRefund = await applyEntitlementEventV1(store, paymentB);
      assertCase(
        this.name,
        afterOldRefund.disposition === "duplicate" &&
          afterOldRefund.snapshot.status === "active" &&
          afterOldRefund.snapshot.active_until === "2026-11-02T10:00:00.000Z",
        "rejected old-period refund changed the renewal",
      );

      const ended = await applyEntitlementEventV1(
        store,
        refund(
          paymentB.evidence.payment_ref,
          reference("refund-b-event"),
          reference("refund-b-provider"),
          "2026-10-01T10:00:01.000Z",
        ),
      );
      assertCase(
        this.name,
        ended.snapshot.status === "ended" &&
          ended.snapshot.reason === "refunded",
        "the latest-payment refund did not end access",
      );
    },
  },
  {
    name: "test and production uniqueness namespaces are distinct",
    async run(factory) {
      const store = await factory();
      const testResult = await applyEntitlementEventV1(
        store,
        confirmation({ environment: "test" }),
      );
      const productionResult = await applyEntitlementEventV1(
        store,
        confirmation({ environment: "production" }),
      );
      assertCase(
        this.name,
        testResult.disposition === "applied" &&
          productionResult.disposition === "applied",
        "an opaque reference collided across environments",
      );
      assertCase(
        this.name,
        testResult.snapshot.environment === "test" &&
          productionResult.snapshot.environment === "production",
        "cross-environment snapshots were conflated",
      );
    },
  },
];

export const PRODUCT_FLOW_RUNTIME_STORE_CONFORMANCE_CASES_V1 = Object.freeze(
  CASES.map((entry) => Object.freeze(entry)),
);

export async function runProductFlowRuntimeStoreConformanceV1(
  factory: ProductFlowRuntimeStoreFactoryV1,
): Promise<void> {
  for (const testCase of PRODUCT_FLOW_RUNTIME_STORE_CONFORMANCE_CASES_V1) {
    await testCase.run(factory);
  }
}
