import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolConfig } from "pg";
import {
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  type EntitlementEventV1,
  type ProductFlowOpaqueRef,
} from "@cambridge-tcg/product-flow";
import {
  applyEntitlementEventV1,
  type ProductFlowRuntimeStoreV1,
} from "@cambridge-tcg/product-flow-runtime";
import { runProductFlowRuntimeStoreConformanceV1 } from "@cambridge-tcg/product-flow-runtime/testing";
import {
  PostgresProductFlowRuntimeStoreV1,
  type ProductFlowRuntimeQueryV1,
  type ProductFlowRuntimeTransactionRunnerV1,
} from "./postgres.server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  transaction: vi.fn(() => {
    throw new Error("Integration tests must inject their isolated pg transaction.");
  }),
}));

const TEST_DATABASE_URL = process.env.PRODUCT_FLOW_TEST_DATABASE_URL?.trim();
const MIGRATION_SQL = readFileSync(
  new URL("../../../drizzle/0135_product_flow_runtime.sql", import.meta.url),
  "utf8",
);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

interface SafeDatabaseTarget {
  readonly database: string;
  readonly pool_config: PoolConfig;
}

function safeDatabaseTarget(raw: string): SafeDatabaseTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PRODUCT_FLOW_TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("PRODUCT_FLOW_TEST_DATABASE_URL must use postgres or postgresql.");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error(
      "PRODUCT_FLOW_TEST_DATABASE_URL may not contain target-overriding query or fragment data.",
    );
  }

  const rawHostname = url.hostname.toLowerCase();
  const hostname = rawHostname === "[::1]" ? "::1" : rawHostname;
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      "PRODUCT_FLOW_TEST_DATABASE_URL must resolve explicitly to localhost, 127.0.0.1, or ::1.",
    );
  }

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("PRODUCT_FLOW_TEST_DATABASE_URL has an invalid database name.");
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]*_test$/.test(database) ||
    database.includes("/")
  ) {
    throw new Error(
      "PRODUCT_FLOW_TEST_DATABASE_URL database name must end with _test.",
    );
  }

  const port = url.port === "" ? 5432 : Number(url.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PRODUCT_FLOW_TEST_DATABASE_URL has an invalid port.");
  }

  return Object.freeze({
    database,
    pool_config: Object.freeze({
      host: hostname,
      port,
      database,
      ...(url.username
        ? { user: decodeURIComponent(url.username) }
        : {}),
      ...(url.password
        ? { password: decodeURIComponent(url.password) }
        : {}),
      ssl: false,
      max: 8,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
      application_name: "cambridgetcg-product-flow-integration",
    }),
  });
}

function guardedPool(
  raw: string,
  factory: (config: PoolConfig) => Pool = (config) => new Pool(config),
): { readonly target: SafeDatabaseTarget; readonly pool: Pool } {
  // Validation is deliberately complete before the Pool factory can run.
  const target = safeDatabaseTarget(raw);
  return Object.freeze({ target, pool: factory(target.pool_config) });
}

function quotedIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(identifier)) {
    throw new Error("Unsafe generated PostgreSQL identifier.");
  }
  return `"${identifier}"`;
}

function transactionRunner(
  pool: Pool,
  schemaSql: string,
  beforeWork?: (backendPid: number) => Promise<void>,
): ProductFlowRuntimeTransactionRunnerV1 {
  return async <T>(
    work: (query: ProductFlowRuntimeQueryV1) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO ${schemaSql}`);
      if (beforeWork) {
        const pid = await client.query<{ pid: number }>(
          "SELECT pg_backend_pid()::INTEGER AS pid",
        );
        await beforeWork(pid.rows[0]!.pid);
      }
      const query: ProductFlowRuntimeQueryV1 = async (sql, params = []) => {
        const result = await client.query(sql, params);
        return {
          rows: result.rows as unknown[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      };
      const result = await work(query);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the application/store failure that required the rollback.
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

function reference(label: string): ProductFlowOpaqueRef {
  return `pf_${label.padEnd(16, "x")}` as ProductFlowOpaqueRef;
}

function paymentConfirmation(options: {
  readonly event_id: ProductFlowOpaqueRef;
  readonly provider_event_ref: ProductFlowOpaqueRef;
  readonly payment_ref: ProductFlowOpaqueRef;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly occurred_at?: string;
}): EntitlementEventV1 {
  const occurredAt = options.occurred_at ?? "2026-09-02T10:00:00.000Z";
  const activeUntil = "2026-10-02T10:00:00.000Z";
  const priceRef = reference("integration-price");
  return {
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    event_id: options.event_id,
    environment: "test",
    type: "payment_confirmed",
    occurred_at: occurredAt,
    entitlement_ref: options.entitlement_ref,
    subject_ref: options.subject_ref,
    offer_id: "postgres-integration",
    offer_version: 1,
    channel: "web",
    rail: "stripe_web",
    price_ref: priceRef,
    active_until: activeUntil,
    evidence: {
      kind: "provider_confirmation",
      source: "provider_webhook",
      environment: "test",
      entitlement_ref: options.entitlement_ref,
      subject_ref: options.subject_ref,
      offer_id: "postgres-integration",
      offer_version: 1,
      channel: "web",
      rail: "stripe_web",
      price_ref: priceRef,
      provider_event_ref: options.provider_event_ref,
      payment_ref: options.payment_ref,
      confirmed_at: "2026-09-02T10:00:00.000Z",
      active_until: activeUntil,
    },
  };
}

function twoBackendGate(backendPids: number[]): (pid: number) => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  let reject!: (error: Error) => void;
  const bothArrived = new Promise<void>((resolve, rejectPromise) => {
    release = resolve;
    reject = rejectPromise;
  });
  const timeout = setTimeout(() => {
    reject(new Error("Timed out waiting for two concurrent PostgreSQL backends."));
  }, 10_000);

  return async (pid) => {
    backendPids.push(pid);
    arrived += 1;
    if (arrived === 2) {
      clearTimeout(timeout);
      release();
    }
    await bothArrived;
  };
}

describe("product-flow PostgreSQL integration safety gate", () => {
  it.each([
    "postgresql://db.example.test/cambridge_test",
    "postgresql://localhost.evil/cambridge_test",
    "postgresql://192.168.1.10/cambridge_test",
    "postgresql://localhost/cambridge",
    "postgresql://localhost/cambridge_test?host=db.example.test",
    "https://localhost/cambridge_test",
  ])("rejects unsafe target %s before constructing a Pool", (url) => {
    const factory = vi.fn((): Pool => {
      throw new Error("Pool factory must not run for an unsafe target.");
    });
    expect(() => guardedPool(url, factory)).toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it("admits an explicit local _test target before any connection", () => {
    const sentinel = {} as Pool;
    const factory = vi.fn(() => sentinel);
    const guarded = guardedPool(
      "postgresql://tester:secret@127.0.0.1:5433/cambridge_product_test",
      factory,
    );
    expect(guarded.pool).toBe(sentinel);
    expect(guarded.target.database).toBe("cambridge_product_test");
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "127.0.0.1",
        port: 5433,
        database: "cambridge_product_test",
        ssl: false,
      }),
    );
  });
});

const describeDatabase = TEST_DATABASE_URL ? describe.sequential : describe.skip;

describeDatabase("product-flow real PostgreSQL adapter", () => {
  let pool: Pool | null = null;
  let schemaName = "";
  let schemaSql = "";
  let runner: ProductFlowRuntimeTransactionRunnerV1;

  async function resetRuntimeTables(): Promise<void> {
    if (!pool) throw new Error("Integration Pool is not initialized.");
    await pool.query(
      `TRUNCATE TABLE
         ${schemaSql}.product_flow_events,
         ${schemaSql}.product_flow_entitlement_snapshots,
         ${schemaSql}.product_beta_interests
       RESTART IDENTITY`,
    );
  }

  async function rowCounts(): Promise<{
    readonly events: number;
    readonly snapshots: number;
  }> {
    if (!pool) throw new Error("Integration Pool is not initialized.");
    const result = await pool.query<{ events: number; snapshots: number }>(
      `SELECT
         (SELECT COUNT(*)::INTEGER FROM ${schemaSql}.product_flow_events) AS events,
         (SELECT COUNT(*)::INTEGER FROM ${schemaSql}.product_flow_entitlement_snapshots) AS snapshots`,
    );
    return result.rows[0]!;
  }

  beforeAll(async () => {
    const guarded = guardedPool(TEST_DATABASE_URL!);
    pool = guarded.pool;

    // Read-only server witness before the first schema mutation. An unsafe DNS
    // or connection-string interpretation cannot be rescued by the URL check.
    const witness = await pool.query<{
      database: string;
      address: string | null;
    }>(
      `SELECT current_database() AS database,
              inet_server_addr()::TEXT AS address`,
    );
    const actual = witness.rows[0];
    if (
      !actual ||
      actual.database !== guarded.target.database ||
      !actual.database.endsWith("_test") ||
      actual.address === null ||
      !new Set([
        "127.0.0.1",
        "127.0.0.1/32",
        "::1",
        "::1/128",
        "::ffff:127.0.0.1",
        "::ffff:127.0.0.1/128",
      ]).has(actual.address)
    ) {
      throw new Error(
        "Connected PostgreSQL server did not witness the guarded local _test target.",
      );
    }

    schemaName = `product_flow_it_${process.pid}_${randomUUID().replaceAll("-", "")}`;
    schemaSql = quotedIdentifier(schemaName);
    const setup = await pool.connect();
    try {
      await setup.query(`CREATE SCHEMA ${schemaSql}`);
      await setup.query(`SET search_path TO ${schemaSql}`);
      await setup.query("CREATE TABLE users (id UUID PRIMARY KEY)");
      // This is the exact checked-in migration, not a schema approximation.
      await setup.query(MIGRATION_SQL);
    } finally {
      setup.release();
    }
    runner = transactionRunner(pool, schemaSql);
  }, 30_000);

  afterAll(async () => {
    if (!pool) return;
    try {
      if (schemaSql !== "") {
        await pool.query(`DROP SCHEMA ${schemaSql} CASCADE`);
      }
    } finally {
      await pool.end();
      pool = null;
    }
  }, 30_000);

  it("passes the reusable runtime store conformance suite", async () => {
    await runProductFlowRuntimeStoreConformanceV1(async () => {
      await resetRuntimeTables();
      return new PostgresProductFlowRuntimeStoreV1(runner);
    });
  }, 60_000);

  it("forces two real backends to race and projects one event exactly once", async () => {
    if (!pool) throw new Error("Integration Pool is not initialized.");
    await resetRuntimeTables();
    const backendPids: number[] = [];
    const raceStore: ProductFlowRuntimeStoreV1 =
      new PostgresProductFlowRuntimeStoreV1(
        transactionRunner(pool, schemaSql, twoBackendGate(backendPids)),
      );
    const common = {
      provider_event_ref: reference("race-provider"),
      payment_ref: reference("race-payment"),
      entitlement_ref: reference("race-entitlement"),
      subject_ref: reference("race-subject"),
    } as const;
    const first = paymentConfirmation({
      ...common,
      event_id: reference("race-primary"),
    });
    const retry = paymentConfirmation({
      ...common,
      event_id: reference("race-retry"),
    });

    const results = await Promise.all([
      applyEntitlementEventV1(raceStore, first),
      applyEntitlementEventV1(raceStore, retry),
    ]);
    expect(new Set(backendPids).size).toBe(2);
    expect(results.map((result) => result.disposition).sort()).toEqual([
      "applied",
      "duplicate",
    ]);
    expect(await rowCounts()).toEqual({ events: 1, snapshots: 1 });
    const projection = await pool.query<{
      applied_event_count: number;
      processed_count: number;
    }>(
      `SELECT applied_event_count,
              JSONB_ARRAY_LENGTH(snapshot_payload->'processed_event_ids')::INTEGER AS processed_count
         FROM ${schemaSql}.product_flow_entitlement_snapshots`,
    );
    expect(projection.rows).toEqual([
      { applied_event_count: 1, processed_count: 1 },
    ]);
  }, 30_000);

  it("rolls back a cross-entitlement collision on one payment grant", async () => {
    await resetRuntimeTables();
    const store = new PostgresProductFlowRuntimeStoreV1(runner);
    const paymentRef = reference("collision-payment");
    await applyEntitlementEventV1(
      store,
      paymentConfirmation({
        event_id: reference("collision-event-a"),
        provider_event_ref: reference("collision-provider-a"),
        payment_ref: paymentRef,
        entitlement_ref: reference("collision-ent-a"),
        subject_ref: reference("collision-subject-a"),
      }),
    );
    expect(await rowCounts()).toEqual({ events: 1, snapshots: 1 });

    await expect(
      applyEntitlementEventV1(
        store,
        paymentConfirmation({
          event_id: reference("collision-event-b"),
          provider_event_ref: reference("collision-provider-b"),
          payment_ref: paymentRef,
          entitlement_ref: reference("collision-ent-b"),
          subject_ref: reference("collision-subject-b"),
          occurred_at: "2026-09-02T10:00:01.000Z",
        }),
      ),
    ).rejects.toMatchObject({ code: "event_conflict" });

    expect(await rowCounts()).toEqual({ events: 1, snapshots: 1 });
    if (!pool) throw new Error("Integration Pool is not initialized.");
    const foreignSnapshot = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::INTEGER AS count
         FROM ${schemaSql}.product_flow_entitlement_snapshots
        WHERE entitlement_ref = $1`,
      [reference("collision-ent-b")],
    );
    expect(foreignSnapshot.rows[0]?.count).toBe(0);
  }, 30_000);

  it("rejects event UPDATE and DELETE while preserving the appended row", async () => {
    if (!pool) throw new Error("Integration Pool is not initialized.");
    await resetRuntimeTables();
    const store = new PostgresProductFlowRuntimeStoreV1(runner);
    const event = paymentConfirmation({
      event_id: reference("append-only-event"),
      provider_event_ref: reference("append-only-provider"),
      payment_ref: reference("append-only-payment"),
      entitlement_ref: reference("append-only-ent"),
      subject_ref: reference("append-only-subject"),
    });
    await applyEntitlementEventV1(store, event);

    await expect(
      pool.query(
        `UPDATE ${schemaSql}.product_flow_events
            SET recorded_at = recorded_at
          WHERE environment = $1 AND event_id = $2`,
        [event.environment, event.event_id],
      ),
    ).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("product flow events are append-only"),
    });
    await expect(
      pool.query(
        `DELETE FROM ${schemaSql}.product_flow_events
          WHERE environment = $1 AND event_id = $2`,
        [event.environment, event.event_id],
      ),
    ).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("product flow events are append-only"),
    });

    expect(await rowCounts()).toEqual({ events: 1, snapshots: 1 });
  }, 30_000);
});
