import "server-only";
import { transaction as storefrontTransaction } from "@/lib/db";
import {
  createEmptyEntitlementSnapshotV1,
  parseEntitlementEventV1,
  parseEntitlementSnapshotV1,
  type EmptyEntitlementSnapshotInputV1,
  type EntitlementEventV1,
  type EntitlementSnapshotV1,
} from "@cambridge-tcg/product-flow";
import {
  getPaymentGrantIdentityV1,
  getProviderEventRefV1,
  ProductFlowRuntimeError,
  type ProductFlowRuntimeAppendResultV1,
  type ProductFlowRuntimeStoreV1,
  type ProductFlowRuntimeTransactionV1,
} from "@cambridge-tcg/product-flow-runtime";

export interface ProductFlowRuntimeQueryResultV1 {
  readonly rows: unknown[];
  readonly rowCount: number;
}

export type ProductFlowRuntimeQueryV1 = (
  sql: string,
  params?: unknown[],
) => Promise<ProductFlowRuntimeQueryResultV1>;

export interface ProductFlowRuntimeTransactionRunnerV1 {
  <T>(work: (query: ProductFlowRuntimeQueryV1) => Promise<T>): Promise<T>;
}

interface StoredEventRow {
  environment: string;
  event_id: string;
  entitlement_ref: string;
  subject_ref: string;
  offer_id: string;
  offer_version: number;
  event_type: string;
  occurred_at: Date | string;
  provider_event_ref: string | null;
  rail: string | null;
  payment_ref: string | null;
  event_payload: unknown;
}

interface StoredSnapshotRow {
  environment: string;
  entitlement_ref: string;
  subject_ref: string;
  offer_id: string;
  offer_version: number;
  last_event_id: string | null;
  snapshot_payload: unknown;
}

function storedTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sameScope(
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

function storedEvent(row: StoredEventRow): EntitlementEventV1 {
  const event = parseEntitlementEventV1(row.event_payload);
  const providerRef = getProviderEventRefV1(event);
  const grant = getPaymentGrantIdentityV1(event);
  if (
    row.environment !== event.environment ||
    row.event_id !== event.event_id ||
    row.entitlement_ref !== event.entitlement_ref ||
    row.subject_ref !== event.subject_ref ||
    row.offer_id !== event.offer_id ||
    row.offer_version !== event.offer_version ||
    row.event_type !== event.type ||
    storedTimestamp(row.occurred_at) !== event.occurred_at ||
    row.provider_event_ref !== providerRef ||
    row.rail !== (grant?.rail ?? null) ||
    row.payment_ref !== (grant?.payment_ref ?? null)
  ) {
    throw new ProductFlowRuntimeError(
      "store_invariant",
      "$store.product_flow_events",
      "Stored event indexes do not match the canonical event payload.",
    );
  }
  return event;
}

class PostgresProductFlowRuntimeTransactionV1
  implements ProductFlowRuntimeTransactionV1
{
  private stage: "start" | "locked" | "appended" | "persisted" = "start";
  private inserted = false;
  private lockedSeed: EmptyEntitlementSnapshotInputV1 | null = null;

  constructor(private readonly query: ProductFlowRuntimeQueryV1) {}

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

    // This transaction-scoped advisory lock comes before snapshot creation and
    // before event sequence allocation. It serializes concurrent callbacks for
    // the same environment/entitlement even when no snapshot row exists yet.
    await this.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`product-flow:${seed.environment}:${seed.entitlement_ref}`],
    );

    await this.query(
      `INSERT INTO product_flow_entitlement_snapshots (
         environment,
         entitlement_ref,
         subject_ref,
         offer_id,
         offer_version,
         last_event_id,
         applied_event_count,
         snapshot_payload,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, NULL, 0, $6::JSONB, NOW())
       ON CONFLICT (environment, entitlement_ref) DO NOTHING`,
      [
        seed.environment,
        seed.entitlement_ref,
        seed.subject_ref,
        seed.offer_id,
        seed.offer_version,
        JSON.stringify(empty),
      ],
    );

    const result = await this.query(
      `SELECT environment, entitlement_ref, subject_ref, offer_id,
              offer_version, last_event_id, snapshot_payload
         FROM product_flow_entitlement_snapshots
        WHERE environment = $1 AND entitlement_ref = $2
        FOR UPDATE`,
      [seed.environment, seed.entitlement_ref],
    );
    const row = result.rows[0] as StoredSnapshotRow | undefined;
    if (!row) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$store.product_flow_entitlement_snapshots",
        "The locked entitlement row was not returned.",
      );
    }
    const snapshot = parseEntitlementSnapshotV1(row.snapshot_payload);
    if (
      row.environment !== snapshot.environment ||
      row.entitlement_ref !== snapshot.entitlement_ref ||
      row.subject_ref !== snapshot.subject_ref ||
      row.offer_id !== snapshot.offer_id ||
      row.offer_version !== snapshot.offer_version ||
      row.last_event_id !== snapshot.last_event_id ||
      !sameScope(snapshot, seed)
    ) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$store.product_flow_entitlement_snapshots",
        "Stored entitlement indexes or scope do not match the canonical snapshot.",
      );
    }

    this.lockedSeed = seed;
    this.stage = "locked";
    return snapshot;
  }

  async appendUniqueEvent(
    eventValue: EntitlementEventV1,
  ): Promise<ProductFlowRuntimeAppendResultV1> {
    if (this.stage !== "locked" || this.lockedSeed === null) {
      throw new ProductFlowRuntimeError(
        "transaction_order",
        "$transaction.appendUniqueEvent",
        "The entitlement must be locked before its event is appended.",
      );
    }
    const event = parseEntitlementEventV1(eventValue);
    if (
      event.environment !== this.lockedSeed.environment ||
      event.entitlement_ref !== this.lockedSeed.entitlement_ref ||
      event.subject_ref !== this.lockedSeed.subject_ref ||
      event.offer_id !== this.lockedSeed.offer_id ||
      event.offer_version !== this.lockedSeed.offer_version
    ) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$transaction.appendUniqueEvent",
        "The appended event must match the locked entitlement scope.",
      );
    }

    const providerRef = getProviderEventRefV1(event);
    const grant = getPaymentGrantIdentityV1(event);
    const inserted = await this.query(
      `INSERT INTO product_flow_events (
         environment,
         event_id,
         entitlement_ref,
         subject_ref,
         offer_id,
         offer_version,
         event_type,
         occurred_at,
         provider_event_ref,
         rail,
         payment_ref,
         event_payload
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB
       )
       ON CONFLICT DO NOTHING
       RETURNING event_id`,
      [
        event.environment,
        event.event_id,
        event.entitlement_ref,
        event.subject_ref,
        event.offer_id,
        event.offer_version,
        event.type,
        event.occurred_at,
        providerRef,
        grant?.rail ?? null,
        grant?.payment_ref ?? null,
        JSON.stringify(event),
      ],
    );
    this.stage = "appended";
    if ((inserted.rowCount ?? 0) === 1) {
      this.inserted = true;
      return Object.freeze({ disposition: "appended" });
    }

    const duplicates = await this.query(
      `SELECT environment, event_id, entitlement_ref, subject_ref, offer_id,
              offer_version, event_type, occurred_at, provider_event_ref,
              rail, payment_ref, event_payload
         FROM product_flow_events
        WHERE environment = $1
          AND (
            event_id = $2
            OR ($3::TEXT IS NOT NULL AND provider_event_ref = $3)
            OR (
              $4::TEXT IS NOT NULL
              AND rail = $4
              AND payment_ref = $5
            )
          )
        FOR SHARE`,
      [
        event.environment,
        event.event_id,
        providerRef,
        grant?.rail ?? null,
        grant?.payment_ref ?? null,
      ],
    );
    const rows = duplicates.rows as StoredEventRow[];
    const byId = rows.find((row) => row.event_id === event.event_id);
    const byProvider =
      providerRef === null
        ? undefined
        : rows.find(
            (row) => row.provider_event_ref === providerRef,
          );
    const byGrant =
      grant === null
        ? undefined
        : rows.find(
            (row) =>
              row.rail === grant.rail &&
              row.payment_ref === grant.payment_ref,
          );
    const matchedRows = [byId, byProvider, byGrant].filter(
      (row): row is StoredEventRow => row !== undefined,
    );
    if (new Set(matchedRows.map((row) => row.event_id)).size > 1) {
      throw new ProductFlowRuntimeError(
        "event_conflict",
        "$event",
        "Event id, provider event reference, and payment grant identity collide with different stored events.",
      );
    }
    const row = byId ?? byProvider ?? byGrant;
    if (!row) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$store.product_flow_events",
        "A rejected unique insert did not resolve to its stored event.",
      );
    }
    return Object.freeze({
      disposition: "duplicate",
      matched_by: Object.freeze(
        [
          byId ? "event_id" : null,
          byProvider ? "provider_event_ref" : null,
          byGrant ? "grant_identity" : null,
        ].filter(
          (
            match,
          ): match is "event_id" | "provider_event_ref" | "grant_identity" =>
            match !== null,
        ),
      ),
      existing_event: storedEvent(row),
    });
  }

  async persistEntitlement(snapshotValue: EntitlementSnapshotV1): Promise<void> {
    if (
      this.stage !== "appended" ||
      !this.inserted ||
      this.lockedSeed === null
    ) {
      throw new ProductFlowRuntimeError(
        "transaction_order",
        "$transaction.persistEntitlement",
        "Only a newly appended event may persist its locked entitlement.",
      );
    }
    const snapshot = parseEntitlementSnapshotV1(snapshotValue);
    if (!sameScope(snapshot, this.lockedSeed)) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$transaction.persistEntitlement",
        "A transaction may persist only its locked entitlement scope.",
      );
    }

    const updated = await this.query(
      `UPDATE product_flow_entitlement_snapshots
          SET last_event_id = $3,
              applied_event_count = applied_event_count + 1,
              snapshot_payload = $4::JSONB,
              updated_at = NOW()
        WHERE environment = $1
          AND entitlement_ref = $2
          AND subject_ref = $5
          AND offer_id = $6
          AND offer_version = $7`,
      [
        snapshot.environment,
        snapshot.entitlement_ref,
        snapshot.last_event_id,
        JSON.stringify(snapshot),
        snapshot.subject_ref,
        snapshot.offer_id,
        snapshot.offer_version,
      ],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      throw new ProductFlowRuntimeError(
        "store_invariant",
        "$store.product_flow_entitlement_snapshots",
        "The locked entitlement could not be updated in its original scope.",
      );
    }
    this.stage = "persisted";
  }

  assertCommittable(): void {
    const expected = this.inserted ? "persisted" : "appended";
    if (this.stage !== expected) {
      throw new ProductFlowRuntimeError(
        "transaction_order",
        "$transaction",
        this.inserted
          ? "An appended event and reduced snapshot must commit together."
          : "A transaction must lock an entitlement and resolve one event before commit.",
      );
    }
  }
}

/**
 * Thin positional-SQL adapter for the product-flow runtime contract. By
 * default it reuses the storefront's one persistent postgres.js compatibility
 * transaction boundary; it never opens a second pool. It owns no environment
 * variable, provider credential, callback verification, or clock.
 */
export class PostgresProductFlowRuntimeStoreV1
  implements ProductFlowRuntimeStoreV1
{
  constructor(
    private readonly runTransaction: ProductFlowRuntimeTransactionRunnerV1 =
      storefrontTransaction,
  ) {}

  async transaction<T>(
    work: (transaction: ProductFlowRuntimeTransactionV1) => Promise<T>,
  ): Promise<T> {
    return this.runTransaction(async (query) => {
      const transaction = new PostgresProductFlowRuntimeTransactionV1(query);
      const result = await work(transaction);
      transaction.assertCommittable();
      return result;
    });
  }
}
