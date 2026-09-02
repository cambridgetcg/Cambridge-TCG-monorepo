import {
  createEmptyEntitlementSnapshotV1,
  evaluateAccessV1,
  parseEntitlementEventV1,
  parseEntitlementSnapshotV1,
  reduceEntitlementEventV1,
  type EmptyEntitlementSnapshotInputV1,
  type EntitlementEventV1,
  type ProductFlowOpaqueRef,
} from "@cambridge-tcg/product-flow";

import {
  PRODUCT_FLOW_RUNTIME_DUPLICATE_MATCHES,
  PRODUCT_FLOW_RUNTIME_OBSERVATION_EVENT_TYPES,
} from "./constants";
import {
  ProductFlowRuntimeError,
  type ProductFlowRuntimeErrorCode,
} from "./error";
import type {
  ProductFlowRuntimeApplyResultV1,
  ProductFlowRuntimeDeliveryDecisionsV1,
  ProductFlowRuntimeDuplicateMatchV1,
  ProductFlowRuntimeEvaluationInputV1,
  ProductFlowRuntimeEventEffectV1,
  ProductFlowRuntimeGrantIdentityV1,
  ProductFlowRuntimeStoreV1,
} from "./types";

export function getProviderEventRefV1(
  eventValue: unknown,
): ProductFlowOpaqueRef | null {
  const event = parseEntitlementEventV1(eventValue);
  return "evidence" in event ? event.evidence.provider_event_ref : null;
}

/** Unique positive-grant identity; failures and reversals are not grants. */
export function getPaymentGrantIdentityV1(
  eventValue: unknown,
): ProductFlowRuntimeGrantIdentityV1 | null {
  const event = parseEntitlementEventV1(eventValue);
  if (
    event.type !== "payment_confirmed" &&
    event.type !== "renewal_confirmed"
  ) {
    return null;
  }
  return Object.freeze({
    environment: event.environment,
    rail: event.rail,
    payment_ref: event.evidence.payment_ref,
  });
}

/**
 * Observation-only means the event can never grant, extend, or end access.
 * It may advance audit histories when in order; a delayed observation is
 * rejected transactionally instead of poisoning a valid entitlement.
 */
export function getEntitlementEventEffectV1(
  eventValue: unknown,
): ProductFlowRuntimeEventEffectV1 {
  const event = parseEntitlementEventV1(eventValue);
  return (
    PRODUCT_FLOW_RUNTIME_OBSERVATION_EVENT_TYPES as readonly string[]
  ).includes(event.type)
    ? "observation_only"
    : "entitlement_transition";
}

function seedFromEvent(
  event: EntitlementEventV1,
): EmptyEntitlementSnapshotInputV1 {
  return Object.freeze({
    environment: event.environment,
    entitlement_ref: event.entitlement_ref,
    subject_ref: event.subject_ref,
    offer_id: event.offer_id,
    offer_version: event.offer_version,
  });
}

function withoutLocalEventId(event: EntitlementEventV1): string {
  const { event_id: _eventId, ...semanticEvent } = event;
  return JSON.stringify(semanticEvent);
}

function grantSemantics(event: EntitlementEventV1): string {
  if (
    event.type !== "payment_confirmed" &&
    event.type !== "renewal_confirmed"
  ) {
    throw new ProductFlowRuntimeError(
      "store_invariant",
      "$event",
      "A grant-identity duplicate must resolve to a positive grant event.",
    );
  }
  return JSON.stringify({
    type: event.type,
    environment: event.environment,
    entitlement_ref: event.entitlement_ref,
    subject_ref: event.subject_ref,
    offer_id: event.offer_id,
    offer_version: event.offer_version,
    channel: event.channel,
    rail: event.rail,
    price_ref: event.price_ref,
    active_until: event.active_until,
    evidence: {
      kind: event.evidence.kind,
      environment: event.evidence.environment,
      entitlement_ref: event.evidence.entitlement_ref,
      subject_ref: event.evidence.subject_ref,
      offer_id: event.evidence.offer_id,
      offer_version: event.evidence.offer_version,
      channel: event.evidence.channel,
      rail: event.evidence.rail,
      price_ref: event.evidence.price_ref,
      payment_ref: event.evidence.payment_ref,
      confirmed_at: event.evidence.confirmed_at,
      active_until: event.evidence.active_until,
    },
  });
}

function sameGrantIdentity(
  left: ProductFlowRuntimeGrantIdentityV1 | null,
  right: ProductFlowRuntimeGrantIdentityV1 | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.environment === right.environment &&
    left.rail === right.rail &&
    left.payment_ref === right.payment_ref
  );
}

function actualDuplicateMatches(
  incoming: EntitlementEventV1,
  existing: EntitlementEventV1,
): readonly ProductFlowRuntimeDuplicateMatchV1[] {
  const matches: ProductFlowRuntimeDuplicateMatchV1[] = [];
  if (incoming.event_id === existing.event_id) matches.push("event_id");
  const incomingProviderRef = getProviderEventRefV1(incoming);
  const existingProviderRef = getProviderEventRefV1(existing);
  if (
    incomingProviderRef !== null &&
    incomingProviderRef === existingProviderRef
  ) {
    matches.push("provider_event_ref");
  }
  if (
    sameGrantIdentity(
      getPaymentGrantIdentityV1(incoming),
      getPaymentGrantIdentityV1(existing),
    )
  ) {
    matches.push("grant_identity");
  }
  return Object.freeze(matches);
}

function failDuplicate(
  code: ProductFlowRuntimeErrorCode,
  message: string,
): never {
  throw new ProductFlowRuntimeError(code, "$event", message);
}

function assertDuplicateIsSameEvent(
  incoming: EntitlementEventV1,
  existingValue: unknown,
  reportedMatches: readonly ProductFlowRuntimeDuplicateMatchV1[],
): EntitlementEventV1 {
  const existing = parseEntitlementEventV1(existingValue);
  const actualMatches = actualDuplicateMatches(incoming, existing);
  const canonicalReported = PRODUCT_FLOW_RUNTIME_DUPLICATE_MATCHES.filter(
    (match) => reportedMatches.includes(match),
  );
  if (
    reportedMatches.length === 0 ||
    new Set(reportedMatches).size !== reportedMatches.length ||
    canonicalReported.length !== reportedMatches.length ||
    canonicalReported.length !== actualMatches.length ||
    canonicalReported.some((match, index) => match !== actualMatches[index])
  ) {
    return failDuplicate(
      "store_invariant",
      "The store reported duplicate keys that do not match the stored canonical event.",
    );
  }

  const same = actualMatches.includes("event_id")
    ? JSON.stringify(existing) === JSON.stringify(incoming)
    : actualMatches.includes("provider_event_ref")
      ? withoutLocalEventId(existing) === withoutLocalEventId(incoming)
      : actualMatches.includes("grant_identity")
        ? grantSemantics(existing) === grantSemantics(incoming)
        : false;
  if (!same) {
    return failDuplicate(
      "event_conflict",
      "A unique event, provider reference, or payment grant already belongs to different canonical semantics.",
    );
  }
  return existing;
}

/**
 * Atomically locks/loads an entitlement, appends one canonical event,
 * preflights its projection, and persists only a non-blocked snapshot. Locking
 * first serializes concurrent callbacks. A rejected reducer transition throws
 * inside the transaction, rolling back the event append and preserving the
 * last valid entitlement for explicit reconciliation.
 */
export async function applyEntitlementEventV1(
  store: ProductFlowRuntimeStoreV1,
  eventValue: unknown,
): Promise<ProductFlowRuntimeApplyResultV1> {
  const incomingEvent = parseEntitlementEventV1(eventValue);
  const seed = seedFromEvent(incomingEvent);

  return store.transaction(async (transaction) => {
    const snapshot = parseEntitlementSnapshotV1(
      await transaction.lockEntitlement(seed),
    );
    const append = await transaction.appendUniqueEvent(incomingEvent);

    if (append.disposition === "duplicate") {
      const storedEvent = assertDuplicateIsSameEvent(
        incomingEvent,
        append.existing_event,
        append.matched_by,
      );
      const existingProviderRef = getProviderEventRefV1(storedEvent);
      const existingGrant = getPaymentGrantIdentityV1(storedEvent);
      if (!snapshot.processed_event_ids.includes(storedEvent.event_id)) {
        throw new ProductFlowRuntimeError(
          "store_invariant",
          "$snapshot.processed_event_ids",
          "A duplicate stored event has no corresponding entitlement projection.",
        );
      }
      if (
        existingProviderRef !== null &&
        !snapshot.processed_provider_event_refs.includes(existingProviderRef)
      ) {
        throw new ProductFlowRuntimeError(
          "store_invariant",
          "$snapshot.processed_provider_event_refs",
          "A duplicate provider event has no corresponding entitlement projection.",
        );
      }
      if (
        existingGrant !== null &&
        !snapshot.confirmed_payment_refs.includes(existingGrant.payment_ref)
      ) {
        throw new ProductFlowRuntimeError(
          "store_invariant",
          "$snapshot.confirmed_payment_refs",
          "A duplicate payment grant has no corresponding entitlement projection.",
        );
      }
      return Object.freeze({
        disposition: "duplicate",
        effect: getEntitlementEventEffectV1(storedEvent),
        matched_by: Object.freeze([...append.matched_by]),
        event: storedEvent,
        snapshot,
      });
    }

    const next = reduceEntitlementEventV1(snapshot, incomingEvent);
    if (next.status === "blocked") {
      throw new ProductFlowRuntimeError(
        "transition_rejected",
        "$event",
        `Reducer rejected the event with ${next.reason}; the transaction must roll back for reconciliation.`,
      );
    }
    await transaction.persistEntitlement(next);
    return Object.freeze({
      disposition: "applied",
      effect: getEntitlementEventEffectV1(incomingEvent),
      event: incomingEvent,
      snapshot: next,
    });
  });
}

/** Evaluate the same offer/snapshot at one injected time for both channels. */
export function evaluateDeliveryAccessV1(
  offerValue: unknown,
  snapshotValue: unknown,
  input: ProductFlowRuntimeEvaluationInputV1,
): ProductFlowRuntimeDeliveryDecisionsV1 {
  const snapshot = parseEntitlementSnapshotV1(snapshotValue);
  return Object.freeze({
    web: evaluateAccessV1(offerValue, snapshot, {
      environment: input.environment,
      channel: "web",
      evaluated_at: input.evaluated_at,
    }),
    telegram: evaluateAccessV1(offerValue, snapshot, {
      environment: input.environment,
      channel: "telegram",
      evaluated_at: input.evaluated_at,
    }),
  });
}

export { createEmptyEntitlementSnapshotV1 };
