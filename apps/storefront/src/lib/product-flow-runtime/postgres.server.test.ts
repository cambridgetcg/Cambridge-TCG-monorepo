import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  applyEntitlementEventV1,
  ProductFlowRuntimeError,
} from "@cambridge-tcg/product-flow-runtime";
import { runProductFlowRuntimeStoreConformanceV1 } from "@cambridge-tcg/product-flow-runtime/testing";
import type {
  EntitlementEventV1,
  EntitlementSnapshotV1,
  ProductFlowOpaqueRef,
} from "@cambridge-tcg/product-flow";
import {
  PostgresProductFlowRuntimeStoreV1,
  type ProductFlowRuntimeQueryV1,
  type ProductFlowRuntimeTransactionRunnerV1,
} from "./postgres.server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ transaction: vi.fn() }));

function ref(label: string): ProductFlowOpaqueRef {
  return `pf_${label.padEnd(16, "x")}` as ProductFlowOpaqueRef;
}

function linkedEvent(): EntitlementEventV1 {
  return {
    schema: "cambridgetcg.product-entitlement-event/1",
    event_id: ref("event-linked"),
    environment: "test",
    type: "channel_linked",
    occurred_at: "2026-09-02T10:00:00.000Z",
    entitlement_ref: ref("entitlement"),
    subject_ref: ref("subject"),
    offer_id: "prism-signals",
    offer_version: 1,
    channel: "web",
  };
}

function paymentEvent(
  overrides: {
    event_id?: ProductFlowOpaqueRef;
    provider_event_ref?: ProductFlowOpaqueRef;
    occurred_at?: string;
    source?: "provider_webhook" | "provider_api";
  } = {},
): EntitlementEventV1 {
  const entitlementRef = ref("paid-entitlement");
  const subjectRef = ref("paid-subject");
  const priceRef = ref("paid-price");
  const paymentRef = ref("paid-payment");
  const activeUntil = "2026-10-02T10:00:00.000Z";
  return {
    schema: "cambridgetcg.product-entitlement-event/1",
    event_id: overrides.event_id ?? ref("paid-event"),
    environment: "test",
    type: "payment_confirmed",
    occurred_at: overrides.occurred_at ?? "2026-09-02T10:00:00.000Z",
    entitlement_ref: entitlementRef,
    subject_ref: subjectRef,
    offer_id: "prism-signals",
    offer_version: 1,
    channel: "web",
    rail: "stripe_web",
    price_ref: priceRef,
    active_until: activeUntil,
    evidence: {
      kind: "provider_confirmation",
      source: overrides.source ?? "provider_webhook",
      environment: "test",
      entitlement_ref: entitlementRef,
      subject_ref: subjectRef,
      offer_id: "prism-signals",
      offer_version: 1,
      channel: "web",
      rail: "stripe_web",
      price_ref: priceRef,
      provider_event_ref:
        overrides.provider_event_ref ?? ref("paid-provider"),
      payment_ref: paymentRef,
      confirmed_at: "2026-09-02T10:00:00.000Z",
      active_until: activeUntil,
    },
  };
}

interface FakeEventRow {
  environment: string;
  event_id: string;
  entitlement_ref: string;
  subject_ref: string;
  offer_id: string;
  offer_version: number;
  event_type: string;
  occurred_at: string;
  provider_event_ref: string | null;
  rail: string | null;
  payment_ref: string | null;
  event_payload: EntitlementEventV1;
}

class FakeCompatDatabase {
  readonly statements: string[] = [];
  readonly events: FakeEventRow[] = [];
  readonly snapshots = new Map<string, EntitlementSnapshotV1>();
  private tail: Promise<void> = Promise.resolve();

  readonly query: ProductFlowRuntimeQueryV1 = async (sql, params = []) => {
    this.statements.push(sql);
    if (sql.includes("pg_advisory_xact_lock")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO product_flow_entitlement_snapshots")) {
      const key = `${params[0]}:${params[1]}`;
      if (!this.snapshots.has(key)) {
        this.snapshots.set(
          key,
          JSON.parse(String(params[5])) as EntitlementSnapshotV1,
        );
      }
      return { rows: [], rowCount: 1 };
    }
    if (
      sql.includes("FROM product_flow_entitlement_snapshots") &&
      sql.includes("FOR UPDATE")
    ) {
      const snapshot = this.snapshots.get(`${params[0]}:${params[1]}`);
      return snapshot
        ? {
            rows: [
              {
                environment: snapshot.environment,
                entitlement_ref: snapshot.entitlement_ref,
                subject_ref: snapshot.subject_ref,
                offer_id: snapshot.offer_id,
                offer_version: snapshot.offer_version,
                last_event_id: snapshot.last_event_id,
                snapshot_payload: snapshot,
              },
            ],
            rowCount: 1,
          }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes("INSERT INTO product_flow_events")) {
      const environment = String(params[0]);
      const eventId = String(params[1]);
      const providerRef = params[8] === null ? null : String(params[8]);
      const rail = params[9] === null ? null : String(params[9]);
      const paymentRef = params[10] === null ? null : String(params[10]);
      const duplicate = this.events.some(
        (row) =>
          row.environment === environment &&
          (row.event_id === eventId ||
            (providerRef !== null && row.provider_event_ref === providerRef) ||
            (rail !== null &&
              row.rail === rail &&
              row.payment_ref === paymentRef)),
      );
      if (duplicate) return { rows: [], rowCount: 0 };
      this.events.push({
        environment,
        event_id: eventId,
        entitlement_ref: String(params[2]),
        subject_ref: String(params[3]),
        offer_id: String(params[4]),
        offer_version: Number(params[5]),
        event_type: String(params[6]),
        occurred_at: String(params[7]),
        provider_event_ref: providerRef,
        rail,
        payment_ref: paymentRef,
        event_payload: JSON.parse(String(params[11])) as EntitlementEventV1,
      });
      return { rows: [{ event_id: eventId }], rowCount: 1 };
    }
    if (sql.includes("FROM product_flow_events") && sql.includes("FOR SHARE")) {
      const environment = String(params[0]);
      const eventId = String(params[1]);
      const providerRef = params[2] === null ? null : String(params[2]);
      const rail = params[3] === null ? null : String(params[3]);
      const paymentRef = params[4] === null ? null : String(params[4]);
      const rows = this.events.filter(
        (row) =>
          row.environment === environment &&
          (row.event_id === eventId ||
            (providerRef !== null && row.provider_event_ref === providerRef) ||
            (rail !== null && row.rail === rail && row.payment_ref === paymentRef)),
      );
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("UPDATE product_flow_entitlement_snapshots")) {
      const snapshot = JSON.parse(String(params[3])) as EntitlementSnapshotV1;
      this.snapshots.set(`${params[0]}:${params[1]}`, snapshot);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected fake query: ${sql}`);
  };

  readonly transaction: ProductFlowRuntimeTransactionRunnerV1 = async (work) => {
    let release: (() => void) | undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = turn;
    await previous;

    const eventsBefore = [...this.events];
    const snapshotsBefore = new Map(this.snapshots);
    try {
      return await work(this.query);
    } catch (error) {
      this.events.splice(0, this.events.length, ...eventsBefore);
      this.snapshots.clear();
      for (const [key, snapshot] of snapshotsBefore) {
        this.snapshots.set(key, snapshot);
      }
      throw error;
    } finally {
      release?.();
    }
  };
}

describe("storefront product-flow Postgres adapter", () => {
  it("locks before event allocation, projects atomically, and resolves exact duplicates", async () => {
    const database = new FakeCompatDatabase();
    const store = new PostgresProductFlowRuntimeStoreV1(database.transaction);
    const event = linkedEvent();

    const applied = await applyEntitlementEventV1(store, event);
    expect(applied.disposition).toBe("applied");
    expect(applied.snapshot.processed_event_ids).toContain(event.event_id);
    const advisory = database.statements.findIndex((sql) =>
      sql.includes("pg_advisory_xact_lock"),
    );
    const eventInsert = database.statements.findIndex((sql) =>
      sql.includes("INSERT INTO product_flow_events"),
    );
    expect(advisory).toBeGreaterThanOrEqual(0);
    expect(advisory).toBeLessThan(eventInsert);

    const duplicate = await applyEntitlementEventV1(store, event);
    expect(duplicate).toMatchObject({
      disposition: "duplicate",
      matched_by: ["event_id"],
    });
    expect(database.events).toHaveLength(1);
  });

  it("refuses a transaction that does not complete the lock-event-projection order", async () => {
    const database = new FakeCompatDatabase();
    const store = new PostgresProductFlowRuntimeStoreV1(database.transaction);
    await expect(store.transaction(async () => "escaped"))
      .rejects.toBeInstanceOf(ProductFlowRuntimeError);
  });

  it("deduplicates one economic grant across distinct provider callback objects", async () => {
    const database = new FakeCompatDatabase();
    const store = new PostgresProductFlowRuntimeStoreV1(database.transaction);
    const original = paymentEvent();
    await applyEntitlementEventV1(store, original);

    const retry = paymentEvent({
      event_id: ref("paid-retry-event"),
      provider_event_ref: ref("paid-api-provider"),
      occurred_at: "2026-09-02T10:00:01.000Z",
      source: "provider_api",
    });
    const duplicate = await applyEntitlementEventV1(store, retry);
    expect(duplicate).toMatchObject({
      disposition: "duplicate",
      matched_by: ["grant_identity"],
      event: { event_id: original.event_id },
    });
    expect(database.events).toHaveLength(1);
    expect(
      database.statements.some((sql) =>
        sql.includes("AND rail = $4") && sql.includes("AND payment_ref = $5"),
      ),
    ).toBe(true);

    const exact = await applyEntitlementEventV1(store, original);
    expect(exact).toMatchObject({
      disposition: "duplicate",
      matched_by: ["event_id", "provider_event_ref", "grant_identity"],
      event: { event_id: original.event_id },
    });
  });

  it("passes the reusable runtime conformance suite through the SQL adapter", async () => {
    await runProductFlowRuntimeStoreConformanceV1(() => {
      const database = new FakeCompatDatabase();
      return new PostgresProductFlowRuntimeStoreV1(database.transaction);
    });
  });

  it("reuses the existing compat transaction and never constructs a second Pool", () => {
    const source = readFileSync(new URL("./postgres.server.ts", import.meta.url), "utf8");
    expect(source).toContain('transaction as storefrontTransaction } from "@/lib/db"');
    expect(source).not.toMatch(/new Pool|from ["']pg["']/);
    expect(source).toContain("provider_event_ref");
    expect(source).toContain("$store.product_flow_events");
  });
});
