import {
  createEmptyEntitlementSnapshotV1,
  parseEntitlementEventV1,
  parseEntitlementSnapshotV1,
  type EmptyEntitlementSnapshotInputV1,
  type EntitlementEventV1,
  type EntitlementSnapshotV1,
  type ProductFlowOpaqueRef,
} from "@cambridge-tcg/product-flow";

import { ProductFlowRuntimeError } from "./error";
import { getPaymentGrantIdentityV1, getProviderEventRefV1 } from "./runtime";
import type {
  ProductFlowRuntimeAppendResultV1,
  ProductFlowRuntimeMemoryStateV1,
  ProductFlowRuntimeStoreV1,
  ProductFlowRuntimeTransactionV1,
} from "./types";

interface MemoryState {
  readonly events_by_id: Map<string, EntitlementEventV1>;
  readonly event_id_by_provider_ref: Map<string, string>;
  readonly event_id_by_grant_identity: Map<string, string>;
  readonly snapshots_by_entitlement: Map<string, EntitlementSnapshotV1>;
}

function grantKey(
  identity: NonNullable<ReturnType<typeof getPaymentGrantIdentityV1>>,
): string {
  return `${identity.environment}:${identity.rail}:${identity.payment_ref}`;
}

function scopedKey(
  environment: string,
  reference: ProductFlowOpaqueRef,
): string {
  return `${environment}:${reference}`;
}

function emptyState(): MemoryState {
  return {
    events_by_id: new Map(),
    event_id_by_provider_ref: new Map(),
    event_id_by_grant_identity: new Map(),
    snapshots_by_entitlement: new Map(),
  };
}

function cloneState(state: MemoryState): MemoryState {
  return {
    events_by_id: new Map(state.events_by_id),
    event_id_by_provider_ref: new Map(state.event_id_by_provider_ref),
    event_id_by_grant_identity: new Map(state.event_id_by_grant_identity),
    snapshots_by_entitlement: new Map(state.snapshots_by_entitlement),
  };
}

function sameSeed(
  snapshot: EntitlementSnapshotV1,
  seed: EmptyEntitlementSnapshotInputV1,
): boolean {
  return (
    snapshot.environment === seed.environment &&
    snapshot.entitlement_ref === seed.entitlement_ref &&
    snapshot.subject_ref === seed.subject_ref &&
    snapshot.offer_id === seed.offer_id &&
    snapshot.offer_version === seed.offer_version
  );
}

class MemoryTransaction implements ProductFlowRuntimeTransactionV1 {
  private stage: "start" | "locked" | "appended" | "persisted" = "start";
  private inserted = false;
  private locked_seed: EmptyEntitlementSnapshotInputV1 | null = null;

  constructor(private readonly state: MemoryState) {}

  async lockEntitlement(
    seedValue: EmptyEntitlementSnapshotInputV1,
  ): Promise<EntitlementSnapshotV1> {
    if (this.stage !== "start") {
      throw new ProductFlowRuntimeError(
        "transaction_order",
        "$transaction.lockEntitlement",
        "Exactly one entitlement must be locked before appending its event.",
      );
    }
    const empty = createEmptyEntitlementSnapshotV1(seedValue);
    const seed: EmptyEntitlementSnapshotInputV1 = Object.freeze({
      environment: empty.environment,
      entitlement_ref: empty.entitlement_ref,
      subject_ref: empty.subject_ref,
      offer_id: empty.offer_id,
      offer_version: empty.offer_version,
    });
    const key = scopedKey(seed.environment, seed.entitlement_ref);
    const existing = this.state.snapshots_by_entitlement.get(key);
    if (existing !== undefined && !sameSeed(existing, seed)) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$transaction.lockEntitlement",
        "Stored entitlement scope does not match its key and requested seed.",
      );
    }
    const snapshot = existing ?? empty;
    if (existing === undefined) {
      this.state.snapshots_by_entitlement.set(key, empty);
    }
    this.locked_seed = seed;
    this.stage = "locked";
    return snapshot;
  }

  async appendUniqueEvent(
    eventValue: EntitlementEventV1,
  ): Promise<ProductFlowRuntimeAppendResultV1> {
    if (this.stage !== "locked" || this.locked_seed === null) {
      throw new ProductFlowRuntimeError(
        "transaction_order",
        "$transaction.appendUniqueEvent",
        "The entitlement must be locked before its event is appended.",
      );
    }
    const event = parseEntitlementEventV1(eventValue);
    if (
      event.environment !== this.locked_seed.environment ||
      event.entitlement_ref !== this.locked_seed.entitlement_ref ||
      event.subject_ref !== this.locked_seed.subject_ref ||
      event.offer_id !== this.locked_seed.offer_id ||
      event.offer_version !== this.locked_seed.offer_version
    ) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$transaction.appendUniqueEvent",
        "The appended event must match the complete locked entitlement scope.",
      );
    }
    const providerRef = getProviderEventRefV1(event);
    const grantIdentity = getPaymentGrantIdentityV1(event);
    const eventKey = scopedKey(event.environment, event.event_id);
    const providerKey =
      providerRef === null ? null : scopedKey(event.environment, providerRef);
    const providerEventKey =
      providerKey === null
        ? undefined
        : this.state.event_id_by_provider_ref.get(providerKey);
    const storedGrantKey =
      grantIdentity === null ? null : grantKey(grantIdentity);
    const grantEventKey =
      storedGrantKey === null
        ? undefined
        : this.state.event_id_by_grant_identity.get(storedGrantKey);
    const matched = [
      this.state.events_by_id.has(eventKey)
        ? (["event_id", eventKey] as const)
        : null,
      providerEventKey === undefined
        ? null
        : (["provider_event_ref", providerEventKey] as const),
      grantEventKey === undefined
        ? null
        : (["grant_identity", grantEventKey] as const),
    ].filter((entry) => entry !== null);
    const matchedEventKeys = new Set(matched.map((entry) => entry[1]));

    if (matchedEventKeys.size > 1) {
      throw new ProductFlowRuntimeError(
        "event_conflict",
        "$event",
        "Unique event, provider, and grant keys collide with different stored events.",
      );
    }

    this.stage = "appended";
    if (matched.length > 0) {
      const existingKey = matched[0]?.[1];
      const existing =
        existingKey === undefined
          ? undefined
          : this.state.events_by_id.get(existingKey);
      if (existing === undefined) {
        throw new ProductFlowRuntimeError(
          "store_invariant",
          "$event",
          "A duplicate index did not resolve to a stored event.",
        );
      }
      return Object.freeze({
        disposition: "duplicate",
        matched_by: Object.freeze(matched.map((entry) => entry[0])),
        existing_event: existing,
      });
    }

    this.inserted = true;
    this.state.events_by_id.set(eventKey, event);
    if (providerKey !== null) {
      this.state.event_id_by_provider_ref.set(providerKey, eventKey);
    }
    if (storedGrantKey !== null) {
      this.state.event_id_by_grant_identity.set(storedGrantKey, eventKey);
    }
    return Object.freeze({ disposition: "appended" });
  }

  async persistEntitlement(
    snapshotValue: EntitlementSnapshotV1,
  ): Promise<void> {
    if (this.stage !== "appended" || this.locked_seed === null) {
      throw new ProductFlowRuntimeError(
        "transaction_order",
        "$transaction.persistEntitlement",
        "An entitlement must be locked before its snapshot is persisted.",
      );
    }
    const snapshot = parseEntitlementSnapshotV1(snapshotValue);
    if (!sameSeed(snapshot, this.locked_seed)) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$transaction.persistEntitlement",
        "A transaction may persist only its locked entitlement scope.",
      );
    }
    this.state.snapshots_by_entitlement.set(
      scopedKey(snapshot.environment, snapshot.entitlement_ref),
      snapshot,
    );
    this.stage = "persisted";
  }

  assertCommittable(): void {
    const expected = this.inserted ? "persisted" : "appended";
    if (this.stage !== expected) {
      throw new ProductFlowRuntimeError(
        "transaction_order",
        "$transaction",
        this.inserted
          ? "An appended event and its reduced snapshot must commit together."
          : "A duplicate event must follow a locked entitlement before commit.",
      );
    }
  }
}

/**
 * Deterministic test/reference adapter. Transactions are serialized, operate
 * on copy-on-write Maps, and publish state only after a successful callback.
 */
export class InMemoryProductFlowRuntimeStoreV1 implements ProductFlowRuntimeStoreV1 {
  private state: MemoryState = emptyState();
  private tail: Promise<void> = Promise.resolve();

  async transaction<T>(
    work: (transaction: ProductFlowRuntimeTransactionV1) => Promise<T>,
  ): Promise<T> {
    let release: (() => void) | undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = turn;
    await previous;

    const candidate = cloneState(this.state);
    const transaction = new MemoryTransaction(candidate);
    try {
      const result = await work(transaction);
      transaction.assertCommittable();
      this.state = candidate;
      return result;
    } finally {
      release?.();
    }
  }

  /** Read-only deterministic inspection for tests; not a production read API. */
  inspectStateV1(): ProductFlowRuntimeMemoryStateV1 {
    const events = [...this.state.events_by_id.values()].sort((left, right) =>
      `${left.environment}:${left.event_id}`.localeCompare(
        `${right.environment}:${right.event_id}`,
      ),
    );
    const snapshots = [...this.state.snapshots_by_entitlement.values()].sort(
      (left, right) =>
        `${left.environment}:${left.entitlement_ref}`.localeCompare(
          `${right.environment}:${right.entitlement_ref}`,
        ),
    );
    return Object.freeze({
      events: Object.freeze(events),
      snapshots: Object.freeze(snapshots),
    });
  }
}
