import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolConfig } from "pg";
import { createPrismSignalsAllStripeTestOffer } from "@cambridge-tcg/prism-signals-core";
import type {
  ProductFlowRuntimeQueryV1,
  ProductFlowRuntimeTransactionRunnerV1,
} from "@/lib/product-flow-runtime/postgres.server";
import {
  attachPrismStripeCheckoutSession,
  derivePrismStripePriceRef,
  processPrismStripeWebhookAtomically,
  readPrismStripeOwnerStatus,
  reservePrismStripeCheckoutAttempt,
  type PrismStripeSandboxConfigV1,
} from "./index";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  transaction: vi.fn(() => {
    throw new Error("PRISM PostgreSQL tests must inject their isolated transaction.");
  }),
}));

const TEST_DATABASE_URL = process.env.PRODUCT_FLOW_TEST_DATABASE_URL?.trim();
const BASE_MIGRATION_SQL = readFileSync(
  new URL("../../../../drizzle/0135_product_flow_runtime.sql", import.meta.url),
  "utf8",
);
const STRIPE_MIGRATION_SQL = readFileSync(
  new URL("../../../../drizzle/0136_prism_stripe_sandbox.sql", import.meta.url),
  "utf8",
);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

interface SafeTarget {
  readonly database: string;
  readonly poolConfig: PoolConfig;
}

function safeTarget(raw: string): SafeTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PRODUCT_FLOW_TEST_DATABASE_URL must be a PostgreSQL URL.");
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("The PRISM PostgreSQL target must be an unmodified postgres URL.");
  }
  const rawHost = url.hostname.toLowerCase();
  const host = rawHost === "[::1]" ? "::1" : rawHost;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error("The PRISM PostgreSQL target must be explicit loopback.");
  }
  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("The PRISM PostgreSQL database name is invalid.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*_test$/.test(database) || database.includes("/")) {
    throw new Error("The PRISM PostgreSQL database name must end in _test.");
  }
  const port = url.port === "" ? 5432 : Number(url.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("The PRISM PostgreSQL port is invalid.");
  }
  return Object.freeze({
    database,
    poolConfig: Object.freeze({
      host,
      port,
      database,
      ...(url.username ? { user: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ssl: false,
      max: 8,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
      application_name: "cambridgetcg-prism-stripe-integration",
    }),
  });
}

function guardedPool(
  raw: string,
  factory: (configuration: PoolConfig) => Pool = (configuration) =>
    new Pool(configuration),
): Readonly<{ target: SafeTarget; pool: Pool }> {
  const target = safeTarget(raw);
  return Object.freeze({ target, pool: factory(target.poolConfig) });
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error("Unsafe generated PRISM PostgreSQL schema.");
  }
  return `"${value}"`;
}

function transactionRunner(
  pool: Pool,
  schema: string,
): ProductFlowRuntimeTransactionRunnerV1 {
  return async <T>(work: (query: ProductFlowRuntimeQueryV1) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO ${schema}`);
      const result = await work(async (sql, params = []) => {
        const queried = await client.query(sql, params);
        return {
          rows: queried.rows as unknown[],
          rowCount: queried.rowCount ?? queried.rows.length,
        };
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the application failure that required rollback.
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

const CONFIG: PrismStripeSandboxConfigV1 = Object.freeze({
  posture: "stripe-test-v1",
  environment: "test",
  apiVersion: "2026-02-25.clover",
  secretKey: `rk_test_${"a".repeat(32)}`,
  webhookSecret: `whsec_${"b".repeat(32)}`,
  accountId: "acct_prismtest123",
  priceId: "price_prismtest123",
  productId: "prod_prismtest123",
  portalConfigurationId: "bpc_prismtest123",
  referenceSecret: "valid-fixture-reference-secret-for-tests-only",
  checkoutIntakeEnabled: true,
  webhookProcessingEnabled: true,
  currency: "gbp",
  unitAmountMinor: 500,
  interval: "month",
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LIFECYCLE_USER_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_INVITE_USER_ID = "33333333-3333-4333-8333-333333333333";
const EXPIRED_INVITE_USER_ID = "44444444-4444-4444-8444-444444444444";
const REVOKED_INVITE_USER_ID = "55555555-5555-4555-8555-555555555555";
const PREGRANT_REFUND_USER_ID = "66666666-6666-4666-8666-666666666666";
const INCOMPLETE_USER_ID = "77777777-7777-4777-8777-777777777777";
const TERMINAL_FIRST_USER_ID = "88888888-8888-4888-8888-888888888888";

function receipt(
  eventId: string,
  receivedAt: string,
  eventType = "payment_intent.succeeded",
  providerCreatedAt = "2026-09-03T08:59:00.000Z",
) {
  return {
    config: CONFIG,
    stripeEventId: eventId,
    stripeAccountId: CONFIG.accountId,
    apiVersion: CONFIG.apiVersion,
    eventType,
    livemode: false as const,
    payloadSha256: "a".repeat(64),
    providerCreatedAt,
    receivedAt,
  };
}

describe("PRISM Stripe PostgreSQL integration safety gate", () => {
  it.each([
    "postgresql://db.example.test/cambridge_test",
    "postgresql://localhost.evil/cambridge_test",
    "postgresql://127.0.0.2/cambridge_test",
    "postgresql://localhost/cambridge",
    "postgresql://localhost/cambridge_test?host=evil.example",
    "https://localhost/cambridge_test",
  ])("rejects unsafe target %s before opening a pool", (url) => {
    const factory = vi.fn((): Pool => {
      throw new Error("Unsafe target must not construct a Pool.");
    });
    expect(() => guardedPool(url, factory)).toThrow();
    expect(factory).not.toHaveBeenCalled();
  });
});

const describeDatabase = TEST_DATABASE_URL ? describe.sequential : describe.skip;

describeDatabase("PRISM Stripe real PostgreSQL store", () => {
  let pool: Pool | null = null;
  let schema = "";
  let schemaName = "";
  let runTransaction: ProductFlowRuntimeTransactionRunnerV1;

  async function seedBetaUser(userId: string): Promise<void> {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    await pool.query(
      `INSERT INTO ${schema}.users (id) VALUES ($1)
       ON CONFLICT DO NOTHING`,
      [userId],
    );
    await pool.query(
      `INSERT INTO ${schema}.product_beta_interests (
         user_id, product_id, channel_preferences, consent_version,
         requested_at, updated_at, expires_at
       ) VALUES (
         $1, 'prism-signals', ARRAY['web']::TEXT[],
         'prism-signals-beta-contact-2026-09-02',
         '2026-09-03T08:00:00.000Z',
         '2026-09-03T08:00:00.000Z',
         '2027-03-01T08:00:00.000Z'
       ) ON CONFLICT DO NOTHING`,
      [userId],
    );
  }

  async function seedInvitation(
    userId: string,
    input: Readonly<{
      status?: "active" | "revoked";
      expiresAt?: string;
    }> = {},
  ): Promise<void> {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    const status = input.status ?? "active";
    await pool.query(
      `INSERT INTO ${schema}.product_flow_prism_stripe_invitations (
         environment, product_id, user_id, scope, status,
         invited_at, expires_at, revoked_at, created_at, updated_at
       ) VALUES (
         'test', 'prism-signals', $1, 'stripe_all_sandbox_v1', $2,
         '2026-09-03T08:00:00.000Z', $3::TIMESTAMPTZ,
         CASE WHEN $2 = 'revoked'
           THEN '2026-09-03T08:30:00.000Z'::TIMESTAMPTZ
           ELSE NULL
         END,
         '2026-09-03T08:00:00.000Z',
         '2026-09-03T09:00:00.000Z'
       )`,
      [userId, status, input.expiresAt ?? "2027-03-01T08:00:00.000Z"],
    );
  }

  async function seedEligibleUser(userId = USER_ID): Promise<void> {
    await seedBetaUser(userId);
    await seedInvitation(userId);
  }

  beforeAll(async () => {
    const guarded = guardedPool(TEST_DATABASE_URL!);
    pool = guarded.pool;
    const witness = await pool.query<{ database: string }>(
      "SELECT current_database() AS database",
    );
    if (
      witness.rows[0]?.database !== guarded.target.database ||
      !guarded.target.database.endsWith("_test")
    ) {
      throw new Error("Connected database did not match the guarded _test target.");
    }
    schemaName = `prism_stripe_it_${process.pid}_${randomUUID().replaceAll("-", "")}`;
    schema = quoteIdentifier(schemaName);
    const setup = await pool.connect();
    try {
      await setup.query(`CREATE SCHEMA ${schema}`);
      await setup.query(`SET search_path TO ${schema}`);
      await setup.query("CREATE TABLE users (id UUID PRIMARY KEY)");
      await setup.query(BASE_MIGRATION_SQL);
      await setup.query(STRIPE_MIGRATION_SQL);
    } finally {
      setup.release();
    }
    runTransaction = transactionRunner(pool, schema);
  }, 30_000);

  afterAll(async () => {
    if (!pool) return;
    try {
      if (schema) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      await pool.end();
      pool = null;
    }
  }, 30_000);

  it("rejects missing, expired, and revoked invitations inside the reservation transaction", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    await seedBetaUser(MISSING_INVITE_USER_ID);
    await seedBetaUser(EXPIRED_INVITE_USER_ID);
    await seedInvitation(EXPIRED_INVITE_USER_ID, {
      expiresAt: "2026-09-03T08:59:59.999Z",
    });
    await seedBetaUser(REVOKED_INVITE_USER_ID);
    await seedInvitation(REVOKED_INVITE_USER_ID, { status: "revoked" });

    for (const userId of [
      MISSING_INVITE_USER_ID,
      EXPIRED_INVITE_USER_ID,
      REVOKED_INVITE_USER_ID,
    ]) {
      await expect(reservePrismStripeCheckoutAttempt(
        {
          userId,
          origin: "https://cambridgetcg.com",
          occurredAt: "2026-09-03T09:00:00.000Z",
          config: CONFIG,
        },
        { runTransaction },
      )).rejects.toMatchObject({ code: "not_invited" });
    }
    const subjects = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::INTEGER AS count
         FROM ${schema}.product_flow_account_subjects
        WHERE user_id = ANY($1::UUID[])`,
      [[MISSING_INVITE_USER_ID, EXPIRED_INVITE_USER_ID, REVOKED_INVITE_USER_ID]],
    );
    expect(subjects.rows[0]?.count).toBe(0);
  }, 30_000);

  it("serializes concurrent reservations into one frozen attempt and idempotency key", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    await seedEligibleUser();
    const input = {
      userId: USER_ID,
      origin: "https://cambridgetcg.com",
      occurredAt: "2026-09-03T09:00:00.000Z",
      config: CONFIG,
    } as const;
    const [first, second] = await Promise.all([
      reservePrismStripeCheckoutAttempt(input, { runTransaction }),
      reservePrismStripeCheckoutAttempt(input, { runTransaction }),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(["reserved", "reused"]);
    expect(first.attempt.attemptRef).toBe(second.attempt.attemptRef);
    expect(first.attempt.idempotencyKey).toBe(second.attempt.idempotencyKey);
    expect(first.attempt.checkoutParams.metadata).toEqual({
      type: "prism_signals_all_test_v1",
      attempt_ref: first.attempt.attemptRef,
    });
    expect(first.attempt.checkoutParams.payment_method_types).toEqual(["card"]);
    expect(Object.isFrozen(first.attempt.checkoutParams)).toBe(true);
    expect(Object.isFrozen(first.attempt.checkoutParams.line_items)).toBe(true);
    expect(Object.isFrozen(first.attempt.checkoutParams.metadata)).toBe(true);
    expect(JSON.stringify(first.attempt.checkoutParams)).not.toContain(USER_ID);
    const priceRef = derivePrismStripePriceRef(
      CONFIG.referenceSecret,
      CONFIG.priceId,
    );
    const offer = createPrismSignalsAllStripeTestOffer({ price_ref: priceRef });
    const stripeRail = offer.rails.find((rail) => rail.rail === "stripe_web");
    expect(stripeRail).toMatchObject({ availability: "test", price_ref: priceRef });
    const started = first.attempt.checkoutStartedEvent;
    if (started.type !== "checkout_started") {
      throw new Error("Reserved PRISM evidence was not checkout_started.");
    }
    expect(started.price_ref).toBe(priceRef);
    const counts = await pool.query<{
      attempts: number;
      owners: number;
      events: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_stripe_checkout_attempts) AS attempts,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_entitlement_owners) AS owners,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_events) AS events`,
    );
    expect(counts.rows[0]).toEqual({ attempts: 1, owners: 1, events: 1 });
  }, 30_000);

  it("never reactivates a terminal entitlement and allocates a new generation", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    const first = await pool.query<{
      entitlement_ref: string;
      subject_ref: string;
      created_at: Date | string;
    }>(
      `SELECT entitlement_ref, subject_ref, created_at
         FROM ${schema}.product_flow_entitlement_owners
        WHERE lifecycle = 'current'`,
    );
    const old = first.rows[0]!;
    const oldCreatedAt = new Date(old.created_at);
    const terminalAt = new Date(oldCreatedAt.valueOf() + 1_000).toISOString();
    const nextCheckoutAt = new Date(
      oldCreatedAt.valueOf() + 60_000,
    ).toISOString();
    await pool.query(
      `UPDATE ${schema}.product_flow_stripe_checkout_attempts
          SET status = 'superseded', updated_at = '2026-09-03T10:00:00.000Z'
        WHERE entitlement_ref = $1`,
      [old.entitlement_ref],
    );
    await pool.query(
      `UPDATE ${schema}.product_flow_entitlement_owners
          SET lifecycle = 'terminal',
              terminal_reason = 'superseded_before_grant',
              terminal_at = $2::TIMESTAMPTZ,
              updated_at = $2::TIMESTAMPTZ
        WHERE entitlement_ref = $1`,
      [old.entitlement_ref, terminalAt],
    );
    await expect(
      pool.query(
        `UPDATE ${schema}.product_flow_entitlement_owners
            SET lifecycle = 'current', terminal_reason = NULL, terminal_at = NULL
          WHERE entitlement_ref = $1`,
        [old.entitlement_ref],
      ),
    ).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("terminal product flow entitlement owner is immutable"),
    });
    const next = await reservePrismStripeCheckoutAttempt(
      {
        userId: USER_ID,
        origin: "https://cambridgetcg.com",
        occurredAt: nextCheckoutAt,
        config: CONFIG,
      },
      { runTransaction },
    );
    expect(next.kind).toBe("reserved");
    expect(next.attempt.generation).toBe(2);
    expect(next.attempt.entitlementRef).not.toBe(old.entitlement_ref);
    const generations = await pool.query<{
      generation: number;
      lifecycle: string;
    }>(
      `SELECT generation, lifecycle
         FROM ${schema}.product_flow_entitlement_owners
        ORDER BY generation`,
    );
    expect(generations.rows).toEqual([
      { generation: 1, lifecycle: "terminal" },
      { generation: 2, lifecycle: "current" },
    ]);
  }, 30_000);

  it("commits bounded receipts, deduplicates later delivery, and rolls back failed callback work", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    const reviewed = await processPrismStripeWebhookAtomically(
      receipt("evt_review123456", "2026-09-03T09:00:00.000Z"),
      (actions) => actions.requiresReview("unsupported_event_type"),
      { runTransaction },
    );
    expect(reviewed).toMatchObject({
      disposition: "processed",
      outcome: "requires_review",
    });
    const duplicate = await processPrismStripeWebhookAtomically(
      receipt("evt_review123456", "2026-09-03T09:05:00.000Z"),
      () => {
        throw new Error("duplicate work must not run");
      },
      { runTransaction },
    );
    expect(duplicate.disposition).toBe("duplicate");

    await expect(
      processPrismStripeWebhookAtomically(
        receipt("evt_rollback12345", "2026-09-03T09:10:00.000Z"),
        () => {
          throw new Error("projection failed");
        },
        { runTransaction },
      ),
    ).rejects.toThrow("projection failed");
    const receipts = await pool.query<{ stripe_event_id: string }>(
      `SELECT stripe_event_id
         FROM ${schema}.product_flow_stripe_event_receipts
        ORDER BY stripe_event_id`,
    );
    expect(receipts.rows).toEqual([{ stripe_event_id: "evt_review123456" }]);
  }, 30_000);

  it("cascades raw owner/provider mappings on account deletion but retains opaque runtime history", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    await pool.query(`DELETE FROM ${schema}.users WHERE id = $1`, [USER_ID]);
    const counts = await pool.query<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_account_subjects) AS subjects,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_entitlement_owners) AS owners,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_stripe_checkout_attempts) AS attempts,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_events) AS events,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_entitlement_snapshots) AS snapshots`,
    );
    expect(counts.rows[0]).toEqual({
      subjects: 0,
      owners: 0,
      attempts: 0,
      events: 2,
      snapshots: 2,
    });
    const rawLeak = await pool.query<{ leaked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM ${schema}.product_flow_events
          WHERE event_payload::TEXT LIKE $1
       ) AS leaked`,
      [`%${USER_ID}%`],
    );
    expect(rawLeak.rows[0]?.leaked).toBe(false);
  }, 30_000);

  it("binds an out-of-order paid invoice, observes Checkout later, and reverses only the latest exact grant", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    await seedEligibleUser(LIFECYCLE_USER_ID);
    const reserved = await reservePrismStripeCheckoutAttempt(
      {
        userId: LIFECYCLE_USER_ID,
        origin: "https://cambridgetcg.com",
        occurredAt: "2026-09-03T08:30:00.000Z",
        config: CONFIG,
      },
      { runTransaction },
    );
    const attempt = await attachPrismStripeCheckoutSession(
      {
        config: CONFIG,
        attemptRef: reserved.attempt.attemptRef,
        sessionId: "cs_test_lifecycle123",
        expiresAtEpochSeconds: reserved.attempt.checkoutParams.expires_at,
      },
      { runTransaction },
    );
    expect(attempt.status).toBe("checkout_open");

    const earlyResume = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_earlyresume123",
        "2026-09-03T08:52:00.000Z",
        "customer.subscription.updated",
        "2026-09-03T08:51:30.000Z",
      ),
      (actions) => actions.applySubscriptionResumed({
        subscriptionId: "sub_lifecycle123",
        customerId: "cus_lifecycle123",
        attemptRef: attempt.attemptRef,
        priceId: CONFIG.priceId,
        status: "active",
        periodStart: "2026-09-03T08:30:00.000Z",
        periodEnd: "2026-10-03T08:30:00.000Z",
        statusAt: "2026-09-03T08:51:30.000Z",
      }),
      { runTransaction },
    );
    expect(earlyResume.code).toBe("subscription_resume_no_active_grant");
    const noEarlyResumeEvent = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::INTEGER AS count
         FROM ${schema}.product_flow_events
        WHERE entitlement_ref = $1 AND event_type = 'subscription_resumed'`,
      [attempt.entitlementRef],
    );
    expect(noEarlyResumeEvent.rows[0]?.count).toBe(0);

    const invoiceFact = {
      attemptRef: attempt.attemptRef,
      invoiceId: "in_lifecycle123",
      subscriptionId: "sub_lifecycle123",
      customerId: "cus_lifecycle123",
      priceId: CONFIG.priceId,
      productId: CONFIG.productId,
      currency: "gbp" as const,
      amountMinor: 500,
      quantity: 1 as const,
      periodStart: "2026-09-03T08:30:00.000Z",
      periodEnd: "2026-10-03T08:30:00.000Z",
      grantKind: "initial" as const,
      confirmedAt: "2026-09-03T08:53:00.000Z",
      paymentIntentId: "pi_lifecycle123",
      status: "active" as const,
      cancelAtPeriodEnd: false,
    };
    const granted = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_invoicepaid123",
        "2026-09-03T08:53:00.500Z",
        "invoice.paid",
        "2026-09-03T08:53:00.000Z",
      ),
      (actions) => actions.applyInvoicePaid(invoiceFact),
      { runTransaction },
    );
    expect(granted).toMatchObject({
      outcome: "processed",
      code: "initial_invoice_granted",
    });
    const paidState = await pool.query<{
      attempt_status: string;
      subscription_status: string;
      grant_state: string;
      entitlement_status: string;
    }>(
      `SELECT a.status AS attempt_status,
              sub.status AS subscription_status,
              g.state AS grant_state,
              snap.snapshot_payload->>'status' AS entitlement_status
         FROM ${schema}.product_flow_stripe_checkout_attempts a
         JOIN ${schema}.product_flow_stripe_subscriptions sub
           ON sub.attempt_ref = a.attempt_ref
         JOIN ${schema}.product_flow_stripe_invoice_grants g
           ON g.stripe_subscription_id = sub.stripe_subscription_id
         JOIN ${schema}.product_flow_entitlement_snapshots snap
           ON snap.entitlement_ref = sub.entitlement_ref
        WHERE a.attempt_ref = $1`,
      [attempt.attemptRef],
    );
    expect(paidState.rows[0]).toEqual({
      attempt_status: "completed",
      subscription_status: "active",
      grant_state: "granted",
      entitlement_status: "active",
    });

    const checkoutObserved = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_checkoutdone123",
        "2026-09-03T08:54:00.000Z",
        "checkout.session.completed",
        "2026-09-03T08:53:30.000Z",
      ),
      (actions) => actions.observeCheckoutCompleted({
        attemptRef: attempt.attemptRef,
        sessionId: "cs_test_lifecycle123",
        customerId: "cus_lifecycle123",
        subscriptionId: "sub_lifecycle123",
        status: "complete",
        completedAt: "2026-09-03T08:53:30.000Z",
      }),
      { runTransaction },
    );
    expect(checkoutObserved.code).toBe("checkout_observed");

    const scheduled = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_cancelsched123",
        "2026-09-10T08:30:00.000Z",
        "customer.subscription.updated",
        "2026-09-10T08:29:30.000Z",
      ),
      (actions) => actions.applyCancelAtPeriodEnd({
        subscriptionId: "sub_lifecycle123",
        customerId: "cus_lifecycle123",
        attemptRef: attempt.attemptRef,
        priceId: CONFIG.priceId,
        status: "active",
        periodStart: invoiceFact.periodStart,
        periodEnd: invoiceFact.periodEnd,
        statusAt: "2026-09-10T08:29:30.000Z",
      }),
      { runTransaction },
    );
    expect(scheduled.code).toBe("cancel_at_period_end_applied");

    const renewalFact = {
      ...invoiceFact,
      invoiceId: "in_renewal12345",
      paymentIntentId: "pi_renewal12345",
      grantKind: "renewal" as const,
      periodStart: "2026-10-03T08:30:00.000Z",
      periodEnd: "2026-11-03T08:30:00.000Z",
      confirmedAt: "2026-10-03T08:31:00.000Z",
      cancelAtPeriodEnd: false,
    };
    const renewed = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_renewalpaid123",
        "2026-10-03T08:31:00.500Z",
        "invoice.paid",
        "2026-10-03T08:31:00.000Z",
      ),
      (actions) => actions.applyInvoicePaid(renewalFact),
      { runTransaction },
    );
    expect(renewed.code).toBe("renewal_granted");
    const resumed = await pool.query<{
      mapping_cancelled: boolean;
      snapshot_cancelled: boolean;
      resume_events: number;
    }>(
      `SELECT sub.cancel_at_period_end AS mapping_cancelled,
              (snap.snapshot_payload->>'cancel_at_period_end')::BOOLEAN
                AS snapshot_cancelled,
              (
                SELECT COUNT(*)::INTEGER
                  FROM ${schema}.product_flow_events e
                 WHERE e.entitlement_ref = sub.entitlement_ref
                   AND e.event_type = 'subscription_resumed'
              ) AS resume_events
         FROM ${schema}.product_flow_stripe_subscriptions sub
         JOIN ${schema}.product_flow_entitlement_snapshots snap
           ON snap.entitlement_ref = sub.entitlement_ref
        WHERE sub.stripe_subscription_id = 'sub_lifecycle123'`,
    );
    expect(resumed.rows[0]).toEqual({
      mapping_cancelled: false,
      snapshot_cancelled: false,
      resume_events: 1,
    });

    const initialRefundFact = {
      attemptRef: attempt.attemptRef,
      subscriptionId: "sub_lifecycle123",
      customerId: "cus_lifecycle123",
      invoiceId: invoiceFact.invoiceId,
      paymentIntentId: invoiceFact.paymentIntentId,
      priceId: CONFIG.priceId,
      productId: CONFIG.productId,
      currency: "gbp" as const,
      quantity: 1 as const,
      periodStart: invoiceFact.periodStart,
      periodEnd: invoiceFact.periodEnd,
      confirmedAt: invoiceFact.confirmedAt,
      subscriptionStatus: "active" as const,
      cancelAtPeriodEnd: false,
      amountRefundedMinor: 500,
    };
    const renewalRefundFact = {
      ...initialRefundFact,
      invoiceId: renewalFact.invoiceId,
      paymentIntentId: renewalFact.paymentIntentId,
      periodStart: renewalFact.periodStart,
      periodEnd: renewalFact.periodEnd,
      confirmedAt: renewalFact.confirmedAt,
    };

    const historical = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_oldrefund12345",
        "2026-10-03T08:32:00.000Z",
        "refund.created",
        "2026-10-03T08:31:30.000Z",
      ),
      (actions) => actions.applyFullRefund({
        ...initialRefundFact,
        refundId: "re_oldrefund12345",
        refundedAt: "2026-09-03T08:53:00.000Z",
      }),
      { runTransaction },
    );
    expect(historical).toMatchObject({
      outcome: "requires_review",
      code: "refund_not_latest_grant",
    });

    const refunded = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_refundcreated1",
        "2026-10-03T08:33:00.000Z",
        "refund.created",
        "2026-10-03T08:32:30.000Z",
      ),
      (actions) => actions.applyFullRefund({
        ...renewalRefundFact,
        refundId: "re_lifecycle123",
        // Provider semantics may be equal to the original paid second; local
        // projection order is independently allocated under the lock.
        refundedAt: renewalFact.confirmedAt,
      }),
      { runTransaction },
    );
    expect(refunded).toMatchObject({
      outcome: "requires_review",
      code: "refund_subscription_cancellation_required",
    });
    const replayedRefundObject = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_refundupdated1",
        "2026-10-03T08:34:00.000Z",
        "refund.updated",
        "2026-10-03T08:33:30.000Z",
      ),
      (actions) => actions.applyFullRefund({
        ...renewalRefundFact,
        refundId: "re_lifecycle123",
        refundedAt: "2026-10-03T08:33:30.000Z",
      }),
      { runTransaction },
    );
    expect(replayedRefundObject.code).toBe(
      "refund_subscription_cancellation_required",
    );
    const ended = await pool.query<{
      lifecycle: string;
      grant_state: string;
      snapshot_status: string;
    }>(
      `SELECT owner.lifecycle,
              g.state AS grant_state,
              snap.snapshot_payload->>'status' AS snapshot_status
         FROM ${schema}.product_flow_entitlement_owners owner
         JOIN ${schema}.product_flow_stripe_invoice_grants g
           ON g.entitlement_ref = owner.entitlement_ref
         JOIN ${schema}.product_flow_entitlement_snapshots snap
           ON snap.entitlement_ref = owner.entitlement_ref
        WHERE owner.entitlement_ref = $1 AND g.stripe_invoice_id = $2`,
      [attempt.entitlementRef, renewalFact.invoiceId],
    );
    expect(ended.rows[0]).toEqual({
      lifecycle: "terminal",
      grant_state: "refunded",
      snapshot_status: "ended",
    });

    await expect(
      pool.query(`DELETE FROM ${schema}.users WHERE id = $1`, [
        LIFECYCLE_USER_ID,
      ]),
    ).rejects.toMatchObject({
      code: "23503",
      message: expect.stringContaining("provider subscription termination"),
    });

    const reconciled = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_refundcancel123",
        "2026-10-03T08:35:00.000Z",
        "customer.subscription.deleted",
        "2026-10-03T08:34:30.000Z",
      ),
      (actions) => actions.applySubscriptionDeleted({
        subscriptionId: "sub_lifecycle123",
        customerId: "cus_lifecycle123",
        attemptRef: attempt.attemptRef,
        priceId: CONFIG.priceId,
        status: "canceled",
        periodStart: renewalFact.periodStart,
        periodEnd: renewalFact.periodEnd,
        statusAt: "2026-10-03T08:34:30.000Z",
        endedAt: "2026-10-03T08:34:30.000Z",
      }),
      { runTransaction },
    );
    expect(reconciled.code).toBe("refund_reconciliation_resolved");
    const reconciliation = await pool.query<{
      status: string;
      reconciliation_status: string;
    }>(
      `SELECT status, reconciliation_status
         FROM ${schema}.product_flow_stripe_subscriptions
        WHERE stripe_subscription_id = 'sub_lifecycle123'`,
    );
    expect(reconciliation.rows[0]).toEqual({
      status: "canceled",
      reconciliation_status: "resolved",
    });

    const runtimeBeforeDeletion = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::INTEGER AS count
         FROM ${schema}.product_flow_events
        WHERE entitlement_ref = $1`,
      [attempt.entitlementRef],
    );
    await pool.query(`DELETE FROM ${schema}.users WHERE id = $1`, [
      LIFECYCLE_USER_ID,
    ]);
    const erasedMappings = await pool.query<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_account_subjects
           WHERE user_id = $1) AS subjects,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_entitlement_owners
           WHERE entitlement_ref = $2) AS owners,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_stripe_checkout_attempts
           WHERE entitlement_ref = $2) AS attempts,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_stripe_subscriptions
           WHERE entitlement_ref = $2) AS subscriptions,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_stripe_invoice_grants
           WHERE entitlement_ref = $2) AS grants,
         (SELECT COUNT(*)::INTEGER FROM ${schema}.product_flow_events
           WHERE entitlement_ref = $2) AS retained_events`,
      [LIFECYCLE_USER_ID, attempt.entitlementRef],
    );
    expect(erasedMappings.rows[0]).toEqual({
      subjects: 0,
      owners: 0,
      attempts: 0,
      subscriptions: 0,
      grants: 0,
      retained_events: runtimeBeforeDeletion.rows[0]?.count,
    });
  }, 30_000);

  it("makes a refund-before-grant a durable barrier until provider cancellation", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    await seedEligibleUser(PREGRANT_REFUND_USER_ID);
    const reserved = await reservePrismStripeCheckoutAttempt(
      {
        userId: PREGRANT_REFUND_USER_ID,
        origin: "https://cambridgetcg.com",
        occurredAt: "2026-09-03T08:35:00.000Z",
        config: CONFIG,
      },
      { runTransaction },
    );
    const attempt = await attachPrismStripeCheckoutSession(
      {
        config: CONFIG,
        attemptRef: reserved.attempt.attemptRef,
        sessionId: "cs_test_pregrant123",
        expiresAtEpochSeconds: reserved.attempt.checkoutParams.expires_at,
      },
      { runTransaction },
    );
    const paidFact = {
      attemptRef: attempt.attemptRef,
      invoiceId: "in_pregrant12345",
      subscriptionId: "sub_pregrant12345",
      customerId: "cus_pregrant12345",
      priceId: CONFIG.priceId,
      productId: CONFIG.productId,
      currency: "gbp" as const,
      amountMinor: 500,
      quantity: 1 as const,
      periodStart: "2026-09-03T08:35:00.000Z",
      periodEnd: "2026-10-03T08:35:00.000Z",
      grantKind: "initial" as const,
      confirmedAt: "2026-09-03T08:40:00.000Z",
      paymentIntentId: "pi_pregrant12345",
      status: "active" as const,
      cancelAtPeriodEnd: false,
    };
    const refundFact = {
      attemptRef: attempt.attemptRef,
      refundId: "re_pregrant12345",
      subscriptionId: paidFact.subscriptionId,
      customerId: paidFact.customerId,
      invoiceId: paidFact.invoiceId,
      paymentIntentId: paidFact.paymentIntentId,
      priceId: CONFIG.priceId,
      productId: CONFIG.productId,
      currency: "gbp" as const,
      quantity: 1 as const,
      periodStart: paidFact.periodStart,
      periodEnd: paidFact.periodEnd,
      confirmedAt: paidFact.confirmedAt,
      subscriptionStatus: "active" as const,
      cancelAtPeriodEnd: false,
      refundedAt: "2026-09-03T08:41:00.000Z",
      amountRefundedMinor: 500,
    };
    const refundFirst = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_pregrantrefund1",
        "2026-09-03T08:41:00.500Z",
        "refund.created",
        refundFact.refundedAt,
      ),
      (actions) => actions.applyFullRefund(refundFact),
      { runTransaction },
    );
    expect(refundFirst).toMatchObject({
      outcome: "requires_review",
      code: "refund_before_grant_cancellation_required",
    });
    const blockedState = await pool.query<{
      lifecycle: string;
      terminal_reason: string;
      reconciliation_status: string;
      reconciliation_reason: string;
      grants: number;
      refund_events: number;
    }>(
      `SELECT owner.lifecycle, owner.terminal_reason,
              sub.reconciliation_status, sub.reconciliation_reason,
              (SELECT COUNT(*)::INTEGER
                 FROM ${schema}.product_flow_stripe_invoice_grants grant_row
                WHERE grant_row.entitlement_ref = owner.entitlement_ref) AS grants,
              (SELECT COUNT(*)::INTEGER
                 FROM ${schema}.product_flow_events event_row
                WHERE event_row.entitlement_ref = owner.entitlement_ref
                  AND event_row.event_type = 'refunded') AS refund_events
         FROM ${schema}.product_flow_entitlement_owners owner
         JOIN ${schema}.product_flow_stripe_subscriptions sub
           ON sub.entitlement_ref = owner.entitlement_ref
        WHERE owner.entitlement_ref = $1`,
      [attempt.entitlementRef],
    );
    expect(blockedState.rows[0]).toEqual({
      lifecycle: "terminal",
      terminal_reason: "superseded_before_grant",
      reconciliation_status: "required",
      reconciliation_reason: "refund_before_grant",
      grants: 0,
      refund_events: 0,
    });

    const latePaid = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_pregrantpaid12",
        "2026-09-03T08:42:00.000Z",
        "invoice.paid",
        paidFact.confirmedAt,
      ),
      (actions) => actions.applyInvoicePaid(paidFact),
      { runTransaction },
    );
    expect(latePaid).toMatchObject({
      outcome: "requires_review",
      code: "invoice_blocked_pending_subscription_cancellation",
    });
    const noGrant = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::INTEGER AS count
         FROM ${schema}.product_flow_stripe_invoice_grants
        WHERE entitlement_ref = $1`,
      [attempt.entitlementRef],
    );
    expect(noGrant.rows[0]?.count).toBe(0);
    await expect(
      pool.query(`DELETE FROM ${schema}.users WHERE id = $1`, [
        PREGRANT_REFUND_USER_ID,
      ]),
    ).rejects.toMatchObject({ code: "23503" });

    const canceled = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_pregrantcancel",
        "2026-09-03T08:43:00.000Z",
        "customer.subscription.deleted",
        "2026-09-03T08:42:30.000Z",
      ),
      (actions) => actions.applySubscriptionDeleted({
        subscriptionId: paidFact.subscriptionId,
        customerId: paidFact.customerId,
        attemptRef: attempt.attemptRef,
        priceId: CONFIG.priceId,
        status: "canceled",
        periodStart: paidFact.periodStart,
        periodEnd: paidFact.periodEnd,
        statusAt: "2026-09-03T08:42:30.000Z",
        endedAt: "2026-09-03T08:42:30.000Z",
      }),
      { runTransaction },
    );
    expect(canceled.code).toBe("refund_reconciliation_resolved");
    await expect(
      pool.query(`DELETE FROM ${schema}.users WHERE id = $1`, [
        PREGRANT_REFUND_USER_ID,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
  }, 30_000);

  it("expires an ungranted subscription and admits a fresh generation", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    await seedEligibleUser(INCOMPLETE_USER_ID);
    const reserved = await reservePrismStripeCheckoutAttempt(
      {
        userId: INCOMPLETE_USER_ID,
        origin: "https://cambridgetcg.com",
        occurredAt: "2026-09-03T08:20:00.000Z",
        config: CONFIG,
      },
      { runTransaction },
    );
    const attempt = await attachPrismStripeCheckoutSession(
      {
        config: CONFIG,
        attemptRef: reserved.attempt.attemptRef,
        sessionId: "cs_test_incomplete123",
        expiresAtEpochSeconds: reserved.attempt.checkoutParams.expires_at,
      },
      { runTransaction },
    );
    const periodStart = "2026-09-03T08:20:00.000Z";
    const periodEnd = "2026-10-03T08:20:00.000Z";
    const failed = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_initialfailed12",
        "2026-09-03T08:25:00.000Z",
        "invoice.payment_failed",
        "2026-09-03T08:24:30.000Z",
      ),
      (actions) => actions.observeInvoicePaymentFailed({
        attemptRef: attempt.attemptRef,
        invoiceId: "in_incomplete123",
        subscriptionId: "sub_incomplete123",
        customerId: "cus_incomplete123",
        priceId: CONFIG.priceId,
        productId: CONFIG.productId,
        currency: "gbp",
        amountMinor: 500,
        quantity: 1,
        periodStart,
        periodEnd,
        failedAt: "2026-09-03T08:24:30.000Z",
        status: "incomplete",
        cancelAtPeriodEnd: false,
        providerObservedAt: "2026-09-03T08:25:00.000Z",
      }),
      { runTransaction },
    );
    expect(failed.code).toBe("invoice_failure_observed");

    const expired = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_incompleteexp1",
        "2026-09-03T08:30:00.000Z",
        "customer.subscription.deleted",
        "2026-09-03T08:29:30.000Z",
      ),
      (actions) => actions.applySubscriptionIncompleteExpired({
        subscriptionId: "sub_incomplete123",
        customerId: "cus_incomplete123",
        attemptRef: attempt.attemptRef,
        priceId: CONFIG.priceId,
        status: "incomplete_expired",
        cancelAtPeriodEnd: false,
        periodStart,
        periodEnd,
        statusAt: "2026-09-03T08:29:30.000Z",
      }),
      { runTransaction },
    );
    expect(expired.code).toBe("subscription_incomplete_expired");
    const terminal = await pool.query<{
      lifecycle: string;
      subscription_status: string;
      snapshot_status: string;
      grants: number;
    }>(
      `SELECT owner.lifecycle, sub.status AS subscription_status,
              snap.snapshot_payload->>'status' AS snapshot_status,
              (SELECT COUNT(*)::INTEGER
                 FROM ${schema}.product_flow_stripe_invoice_grants grant_row
                WHERE grant_row.entitlement_ref = owner.entitlement_ref) AS grants
         FROM ${schema}.product_flow_entitlement_owners owner
         JOIN ${schema}.product_flow_stripe_subscriptions sub
           ON sub.entitlement_ref = owner.entitlement_ref
         JOIN ${schema}.product_flow_entitlement_snapshots snap
           ON snap.entitlement_ref = owner.entitlement_ref
        WHERE owner.entitlement_ref = $1`,
      [attempt.entitlementRef],
    );
    expect(terminal.rows[0]).toEqual({
      lifecycle: "terminal",
      subscription_status: "incomplete_expired",
      snapshot_status: "ended",
      grants: 0,
    });
    const status = await runTransaction((query) =>
      readPrismStripeOwnerStatus(
        {
          userId: INCOMPLETE_USER_ID,
          evaluatedAt: "2026-09-03T08:31:00.000Z",
          posture: {
            configured: true,
            processing_available: true,
            checkout_available: true,
            portal_available: true,
            reason: "available",
          },
        },
        { query },
      ),
    );
    expect(status).toMatchObject({
      plan: "free",
      checkout: { available: true, reason: "available" },
      subscription: {
        status: "incomplete_expired",
        reconciliation: null,
      },
    });
    const next = await reservePrismStripeCheckoutAttempt(
      {
        userId: INCOMPLETE_USER_ID,
        origin: "https://cambridgetcg.com",
        occurredAt: "2026-09-03T08:32:00.000Z",
        config: CONFIG,
      },
      { runTransaction },
    );
    expect(next.attempt.generation).toBe(2);
    await expect(
      pool.query(`DELETE FROM ${schema}.users WHERE id = $1`, [
        INCOMPLETE_USER_ID,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
  }, 30_000);

  it("accounts for a refund after provider cancellation without reopening an obligation", async () => {
    if (!pool) throw new Error("PRISM integration Pool is not initialized.");
    await seedEligibleUser(TERMINAL_FIRST_USER_ID);
    const reserved = await reservePrismStripeCheckoutAttempt(
      {
        userId: TERMINAL_FIRST_USER_ID,
        origin: "https://cambridgetcg.com",
        occurredAt: "2026-09-03T08:05:00.000Z",
        config: CONFIG,
      },
      { runTransaction },
    );
    const attempt = await attachPrismStripeCheckoutSession(
      {
        config: CONFIG,
        attemptRef: reserved.attempt.attemptRef,
        sessionId: "cs_test_terminalfirst1",
        expiresAtEpochSeconds: reserved.attempt.checkoutParams.expires_at,
      },
      { runTransaction },
    );
    const paidFact = {
      attemptRef: attempt.attemptRef,
      invoiceId: "in_terminalfirst1",
      subscriptionId: "sub_terminalfirst1",
      customerId: "cus_terminalfirst1",
      priceId: CONFIG.priceId,
      productId: CONFIG.productId,
      currency: "gbp" as const,
      amountMinor: 500,
      quantity: 1 as const,
      periodStart: "2026-09-03T08:05:00.000Z",
      periodEnd: "2026-10-03T08:05:00.000Z",
      grantKind: "initial" as const,
      confirmedAt: "2026-09-03T08:10:00.000Z",
      paymentIntentId: "pi_terminalfirst1",
      status: "active" as const,
      cancelAtPeriodEnd: false,
    };
    await processPrismStripeWebhookAtomically(
      receipt(
        "evt_terminalpaid12",
        "2026-09-03T08:10:00.500Z",
        "invoice.paid",
        paidFact.confirmedAt,
      ),
      (actions) => actions.applyInvoicePaid(paidFact),
      { runTransaction },
    );
    const endedAt = "2026-09-03T08:11:00.000Z";
    await processPrismStripeWebhookAtomically(
      receipt(
        "evt_terminaldelete1",
        "2026-09-03T08:11:00.500Z",
        "customer.subscription.deleted",
        endedAt,
      ),
      (actions) => actions.applySubscriptionDeleted({
        subscriptionId: paidFact.subscriptionId,
        customerId: paidFact.customerId,
        attemptRef: attempt.attemptRef,
        priceId: CONFIG.priceId,
        status: "canceled",
        periodStart: paidFact.periodStart,
        periodEnd: paidFact.periodEnd,
        statusAt: endedAt,
        endedAt,
      }),
      { runTransaction },
    );
    const refunded = await processPrismStripeWebhookAtomically(
      receipt(
        "evt_terminalrefund1",
        "2026-09-03T08:12:00.500Z",
        "refund.created",
        "2026-09-03T08:12:00.000Z",
      ),
      (actions) => actions.applyFullRefund({
        attemptRef: attempt.attemptRef,
        refundId: "re_terminalfirst1",
        subscriptionId: paidFact.subscriptionId,
        customerId: paidFact.customerId,
        invoiceId: paidFact.invoiceId,
        paymentIntentId: paidFact.paymentIntentId,
        priceId: CONFIG.priceId,
        productId: CONFIG.productId,
        currency: "gbp",
        quantity: 1,
        periodStart: paidFact.periodStart,
        periodEnd: paidFact.periodEnd,
        confirmedAt: paidFact.confirmedAt,
        subscriptionStatus: "canceled",
        cancelAtPeriodEnd: false,
        refundedAt: "2026-09-03T08:12:00.000Z",
        amountRefundedMinor: 500,
      }),
      { runTransaction },
    );
    expect(refunded.code).toBe(
      "latest_period_refunded_after_subscription_end",
    );
    const accounted = await pool.query<{
      grant_state: string;
      snapshot_reason: string;
      reconciliation_status: string;
      required: number;
    }>(
      `SELECT grant_row.state AS grant_state,
              snap.snapshot_payload->>'reason' AS snapshot_reason,
              sub.reconciliation_status,
              (SELECT COUNT(*)::INTEGER
                 FROM ${schema}.product_flow_stripe_subscriptions required_sub
                WHERE required_sub.entitlement_ref = sub.entitlement_ref
                  AND required_sub.reconciliation_status = 'required') AS required
         FROM ${schema}.product_flow_stripe_invoice_grants grant_row
         JOIN ${schema}.product_flow_stripe_subscriptions sub
           ON sub.stripe_subscription_id = grant_row.stripe_subscription_id
         JOIN ${schema}.product_flow_entitlement_snapshots snap
           ON snap.entitlement_ref = grant_row.entitlement_ref
        WHERE grant_row.stripe_invoice_id = $1`,
      [paidFact.invoiceId],
    );
    expect(accounted.rows[0]).toEqual({
      grant_state: "refunded",
      snapshot_reason: "refunded",
      reconciliation_status: "resolved",
      required: 0,
    });
    const next = await reservePrismStripeCheckoutAttempt(
      {
        userId: TERMINAL_FIRST_USER_ID,
        origin: "https://cambridgetcg.com",
        occurredAt: "2026-09-03T10:00:00.000Z",
        config: CONFIG,
      },
      { runTransaction },
    );
    expect(next.attempt.generation).toBe(2);
    await expect(
      pool.query(`DELETE FROM ${schema}.users WHERE id = $1`, [
        TERMINAL_FIRST_USER_ID,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
  }, 30_000);
});
