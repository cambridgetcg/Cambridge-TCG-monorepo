import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ pool: null as unknown as import("pg").Pool }));
// The adapter's deleteUser and the store's defaults reach this isolated schema, never DATABASE_URL.
vi.mock("@/lib/db", () => ({
  query: (sql: string, params?: unknown[]) => state.pool.query(sql, params),
  transaction: async <T>(work: (query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>) => Promise<T>) => {
    const client = await state.pool.connect();
    try { await client.query("BEGIN"); const result = await work((sql, params) => client.query(sql, params)); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
}));

import { PgAdapter } from "@/lib/auth/adapter";
import { AccountErasureHeldError } from "@/lib/auth/erasure";
import { readAccountEntitlement } from "../entitlements";
import type { DataApiEventReceipt, DataApiSubscriptionSnapshot } from "./events";
import {
  DataApiBillingNotProvisionedError, bindDataApiCustomer, findDataApiCustomer, hasDataApiStripeEvent,
  listOpenDataApiSubscriptions, recordDataApiStripeEvent, type DataApiBillingStoreDeps,
} from "./store.server";

// Same explicit opt-in as schema.integration.test.ts: one disposable loopback
// *_test database, an isolated schema per run, 0138 and 0142 exactly as checked in.
const target = process.env.DATA_API_TEST_DATABASE_URL;
const schema = `data_api_billing_test_${randomUUID().replaceAll("-", "")}`;
const bare = `${schema}_bare`;
const MIGRATIONS = ["0138_member_data_keys.sql", "0142_data_api_plans.sql"];
const users = { owner: randomUUID(), other: randomUUID(), leaving: randomUUID(), racer: randomUUID(), retired: randomUUID() };
let admin: Pool;
let barePool: Pool;

const t0 = Date.parse("2026-10-28T06:00:00Z");
const at = (seconds: number) => new Date(t0 + seconds * 1000).toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
// The one entitlement rule (lib/data-api/entitlements.ts) also needs the paid period unended by the database's clock.
const periodAhead = new Date(Date.now() + 30 * 86_400_000).toISOString();
const periodPast = new Date(Date.now() - 60_000).toISOString();
const receipt = (eventType: string, seconds: number, eventId = id("evt")): DataApiEventReceipt => ({ eventId, eventType, providerCreatedAt: at(seconds) });
const snapshot = (fields: Partial<DataApiSubscriptionSnapshot>): DataApiSubscriptionSnapshot => ({
  subscriptionId: "sub_unset", customerId: "cus_unset", userId: users.owner, planId: "pro", planUnresolved: null, status: "active",
  currentPeriodEnd: periodAhead, cancelAtPeriodEnd: false, ...fields,
});
const sync = (fields: Partial<DataApiSubscriptionSnapshot>) => ({ kind: "sync" as const, snapshot: snapshot(fields) });
const eventRow = async (eventId: string) =>
  (await state.pool.query("SELECT outcome, outcome_code FROM data_api_stripe_events WHERE stripe_event_id = $1", [eventId])).rows[0];
// What the data-API reader serves the account, through the same rule bearer keys use.
const entitled = async (userId: string) => {
  const read = await readAccountEntitlement(userId);
  return { status: read.status, planId: read.entitlement.planId };
};
const subscriptionRow = async (subscriptionId: string) =>
  (await state.pool.query(`SELECT user_id, plan_id, status, cancel_at_period_end, last_stripe_event_id, provider_updated_at
     FROM data_api_subscriptions WHERE stripe_subscription_id = $1`, [subscriptionId])).rows[0];

describe.skipIf(!target)("data-API billing store PostgreSQL integration (explicit loopback *_test database only)", () => {
  beforeAll(async () => {
    const url = new URL(target!);
    if (!["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) || !/^\/[A-Za-z0-9_]+_test$/.test(url.pathname) || url.search || url.hash) {
      throw new Error("DATA_API_TEST_DATABASE_URL must name a disposable loopback *_test database.");
    }
    admin = new Pool({ connectionString: target });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE SCHEMA ${bare}`);
    state.pool = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 8 });
    barePool = new Pool({ connectionString: target, options: `-c search_path=${bare}`, max: 2 });
    // 0138 and 0142 need only the users table they reference.
    await state.pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    await state.pool.query("INSERT INTO users (id) VALUES ($1), ($2), ($3), ($4), ($5)", Object.values(users));
    for (const file of MIGRATIONS) {
      const sql = await readFile(new URL(`../../../../drizzle/${file}`, import.meta.url), "utf8");
      const client = await state.pool.connect();
      try { await client.query("BEGIN"); await client.query(sql); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
    // A database where 0142 was never applied.
    await barePool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
  });
  afterAll(async () => {
    await state.pool?.end();
    await barePool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.query(`DROP SCHEMA IF EXISTS ${bare} CASCADE`);
      await admin.end();
    }
  });

  it("keeps one Stripe customer per account, the first binding winning a race", async () => {
    expect(await findDataApiCustomer(users.owner)).toBeNull();
    const first = id("cus");
    expect(await bindDataApiCustomer(users.owner, first)).toBe(first);
    expect(await bindDataApiCustomer(users.owner, id("cus"))).toBe(first);
    expect(await findDataApiCustomer(users.owner)).toBe(first);
    const raced = await Promise.all(Array.from({ length: 6 }, () => bindDataApiCustomer(users.racer, id("cus"))));
    expect(new Set(raced).size).toBe(1);
    expect((await state.pool.query("SELECT count(*)::int AS n FROM data_api_customers WHERE user_id = $1", [users.racer])).rows[0].n).toBe(1);
  });

  it("turns a subscription's lifecycle into entitlement-ready rows, whatever order Stripe delivers in", async () => {
    const customerId = (await findDataApiCustomer(users.owner))!;
    const sub = id("sub");
    const at0 = { subscriptionId: sub, customerId };
    expect(await entitled(users.owner)).toEqual({ status: "ok", planId: "free" });

    const completed = receipt("checkout.session.completed", 0);
    expect(await recordDataApiStripeEvent(completed, sync(at0))).toEqual({ disposition: "recorded", outcome: "applied", code: "subscription_synced" });
    expect(await entitled(users.owner)).toEqual({ status: "ok", planId: "pro" });
    // Each event is handled once, however often Stripe delivers it.
    expect(await hasDataApiStripeEvent(completed.eventId)).toBe(true);
    expect(await recordDataApiStripeEvent(completed, sync({ ...at0, status: "canceled" }))).toEqual({ disposition: "duplicate" });
    expect(await subscriptionRow(sub)).toMatchObject({ status: "active", last_stripe_event_id: completed.eventId });

    // A plan change in the portal moves the price.
    const upgraded = receipt("customer.subscription.updated", 60);
    await recordDataApiStripeEvent(upgraded, sync({ ...at0, planId: "business" }));
    expect(await entitled(users.owner)).toEqual({ status: "ok", planId: "business" });

    // subscription.created, sent before the update but delivered after it, changes nothing.
    const late = receipt("customer.subscription.created", -30);
    expect(await recordDataApiStripeEvent(late, sync({ ...at0, status: "incomplete" }))).toEqual({ disposition: "recorded", outcome: "ignored", code: "older_than_recorded" });
    expect(await eventRow(late.eventId)).toEqual({ outcome: "ignored", outcome_code: "older_than_recorded" });
    expect(await subscriptionRow(sub)).toMatchObject({ plan_id: "business", status: "active", last_stripe_event_id: upgraded.eventId, provider_updated_at: new Date(at(60)) });

    // A failed renewal: free until Stripe reports the subscription in good standing again,
    // but it is still open, so no second checkout can stack on it.
    await recordDataApiStripeEvent(receipt("invoice.payment_failed", 120), sync({ ...at0, planId: "business", status: "past_due" }));
    expect(await entitled(users.owner)).toEqual({ status: "ok", planId: "free" });
    expect(await listOpenDataApiSubscriptions(users.owner)).toMatchObject([{ planId: "business", status: "past_due" }]);

    await recordDataApiStripeEvent(receipt("customer.subscription.updated", 180), sync({ ...at0, planId: "business", cancelAtPeriodEnd: true }));
    expect(await entitled(users.owner)).toEqual({ status: "ok", planId: "business" });
    expect(await listOpenDataApiSubscriptions(users.owner)).toMatchObject([{ planId: "business", status: "active", cancelAtPeriodEnd: true }]);

    // Its paid period runs out before Stripe reports it deleted: still active, still open, but no longer entitling.
    await recordDataApiStripeEvent(receipt("customer.subscription.updated", 210), sync({ ...at0, planId: "business", cancelAtPeriodEnd: true, currentPeriodEnd: periodPast }));
    expect(await subscriptionRow(sub)).toMatchObject({ status: "active" });
    expect(await entitled(users.owner)).toEqual({ status: "ok", planId: "free" });
    expect(await listOpenDataApiSubscriptions(users.owner)).toHaveLength(1);

    const ended = receipt("customer.subscription.deleted", 240);
    await recordDataApiStripeEvent(ended, sync({ ...at0, planId: "business", status: "canceled", cancelAtPeriodEnd: true }));
    expect(await entitled(users.owner)).toEqual({ status: "ok", planId: "free" });
    expect(await listOpenDataApiSubscriptions(users.owner)).toEqual([]);
    expect(await subscriptionRow(sub)).toMatchObject({ status: "canceled", last_stripe_event_id: ended.eventId });

    // A later subscription reuses the account's one customer.
    await recordDataApiStripeEvent(receipt("checkout.session.completed", 600), sync({ subscriptionId: id("sub"), customerId }));
    expect(await entitled(users.owner)).toEqual({ status: "ok", planId: "pro" });
  });

  it("applies one event once when Stripe delivers it twice at the same moment", async () => {
    const customerId = await bindDataApiCustomer(users.other, id("cus"));
    const event = receipt("customer.subscription.created", 0);
    const results = await Promise.all([1, 2].map(() => recordDataApiStripeEvent(event, sync({ subscriptionId: id("sub"), customerId, userId: users.other }))));
    expect(results.map(r => r.disposition).sort()).toEqual(["duplicate", "recorded"]);
    expect((await state.pool.query("SELECT count(*)::int AS n FROM data_api_subscriptions WHERE user_id = $1", [users.other])).rows[0].n).toBe(1);
  });

  it("keeps a row on a retired price current while Stripe bills it, keeping its plan, and opens nothing from that price", async () => {
    const customerId = await bindDataApiCustomer(users.retired, id("cus"));
    const retired = { planId: null, planUnresolved: "subscription_price_unknown" as const };
    const periodEnd = async (subscriptionId: string) =>
      (await state.pool.query("SELECT current_period_end FROM data_api_subscriptions WHERE stripe_subscription_id = $1", [subscriptionId])).rows[0]?.current_period_end?.toISOString();

    // Order one: the row exists, its paid period has run out by the database's clock, then Stripe
    // renews it on a price that has left the configuration.
    const sub = id("sub");
    const mine = { subscriptionId: sub, customerId, userId: users.retired };
    const completed = receipt("checkout.session.completed", 0);
    await recordDataApiStripeEvent(completed, sync({ ...mine, currentPeriodEnd: periodPast }));
    expect(await entitled(users.retired)).toEqual({ status: "ok", planId: "free" });
    const renewed = receipt("customer.subscription.updated", 60);
    expect(await recordDataApiStripeEvent(renewed, sync({ ...mine, ...retired, currentPeriodEnd: periodAhead })))
      .toEqual({ disposition: "recorded", outcome: "applied", code: "status_synced_plan_kept" });
    // The renewal moves the paid period on: the row keeps its plan and does not lapse to free while Stripe bills.
    expect(await subscriptionRow(sub)).toMatchObject({ plan_id: "pro", status: "active", last_stripe_event_id: renewed.eventId });
    expect(await periodEnd(sub)).toBe(periodAhead);
    expect(await entitled(users.retired)).toEqual({ status: "ok", planId: "pro" });

    // A failed renewal suspends it, a paid one restores it, each keeping the plan it held.
    const failed = receipt("invoice.payment_failed", 120);
    expect(await recordDataApiStripeEvent(failed, sync({ ...mine, ...retired, status: "past_due" }))).toEqual({ disposition: "recorded", outcome: "applied", code: "status_synced_plan_kept" });
    expect(await entitled(users.retired)).toEqual({ status: "ok", planId: "free" });
    const recovered = receipt("customer.subscription.updated", 180);
    expect(await recordDataApiStripeEvent(recovered, sync({ ...mine, ...retired, status: "active" }))).toEqual({ disposition: "recorded", outcome: "applied", code: "status_synced_plan_kept" });
    expect(await entitled(users.retired)).toEqual({ status: "ok", planId: "pro" });

    // Stripe's cancellation still reaches the row, which keeps its plan.
    const ended = receipt("customer.subscription.deleted", 240);
    expect(await recordDataApiStripeEvent(ended, sync({ ...mine, ...retired, status: "canceled", cancelAtPeriodEnd: true, currentPeriodEnd: at(240) })))
      .toEqual({ disposition: "recorded", outcome: "applied", code: "status_synced_plan_kept" });
    expect(await eventRow(ended.eventId)).toEqual({ outcome: "applied", outcome_code: "status_synced_plan_kept" });
    expect(await subscriptionRow(sub)).toMatchObject({ plan_id: "pro", status: "canceled", cancel_at_period_end: true, last_stripe_event_id: ended.eventId });
    expect(await listOpenDataApiSubscriptions(users.retired)).toEqual([]);
    // An older event arriving late, renewal or not, does not reopen it.
    const late = receipt("customer.subscription.updated", 200);
    expect(await recordDataApiStripeEvent(late, sync({ ...mine, ...retired, status: "active" }))).toEqual({ disposition: "recorded", outcome: "ignored", code: "older_than_recorded" });
    expect(await subscriptionRow(sub)).toMatchObject({ status: "canceled", last_stripe_event_id: ended.eventId });

    // Order two: the retired-price renewal arrives before any row. It creates none and grants nothing...
    const early = id("sub");
    const theirs = { subscriptionId: early, customerId, userId: users.retired };
    const first = receipt("customer.subscription.updated", 660);
    expect(await recordDataApiStripeEvent(first, sync({ ...theirs, ...retired })))
      .toEqual({ disposition: "recorded", outcome: "ignored", code: "subscription_price_unknown" });
    expect(await eventRow(first.eventId)).toEqual({ outcome: "ignored", outcome_code: "subscription_price_unknown" });
    expect(await subscriptionRow(early)).toBeUndefined();
    expect(await entitled(users.retired)).toEqual({ status: "ok", planId: "free" });
    // ...the Checkout, sent before it but delivered after, opens the row on its configured price...
    const lateCheckout = receipt("checkout.session.completed", 600);
    expect(await recordDataApiStripeEvent(lateCheckout, sync({ ...theirs, currentPeriodEnd: periodPast })))
      .toEqual({ disposition: "recorded", outcome: "applied", code: "subscription_synced" });
    expect(await subscriptionRow(early)).toMatchObject({ plan_id: "pro", status: "active" });
    // ...and the next retired-price renewal keeps it current, on the plan it was opened with.
    const next = receipt("customer.subscription.updated", 720);
    expect(await recordDataApiStripeEvent(next, sync({ ...theirs, ...retired, currentPeriodEnd: periodAhead })))
      .toEqual({ disposition: "recorded", outcome: "applied", code: "status_synced_plan_kept" });
    expect(await subscriptionRow(early)).toMatchObject({ plan_id: "pro", status: "active", last_stripe_event_id: next.eventId });
    expect(await periodEnd(early)).toBe(periodAhead);
    expect(await entitled(users.retired)).toEqual({ status: "ok", planId: "pro" });

    // A cancellation of a subscription no row holds is recorded, and creates nothing.
    const stray = id("sub");
    const strayEnded = receipt("customer.subscription.deleted", 780);
    expect(await recordDataApiStripeEvent(strayEnded, sync({ subscriptionId: stray, customerId, userId: users.retired, ...retired, status: "canceled" })))
      .toEqual({ disposition: "recorded", outcome: "ignored", code: "subscription_price_unknown" });
    expect(await subscriptionRow(stray)).toBeUndefined();
  });

  it("records, and does not apply, what no account holds or what the webhook ignored", async () => {
    const strayCustomer = receipt("customer.subscription.updated", 0);
    const sub = id("sub");
    expect(await recordDataApiStripeEvent(strayCustomer, sync({ subscriptionId: sub, customerId: id("cus") })))
      .toEqual({ disposition: "recorded", outcome: "ignored", code: "customer_not_bound" });
    // The customer is the owner's; the Checkout claimed another account.
    const borrowed = receipt("customer.subscription.updated", 0);
    expect(await recordDataApiStripeEvent(borrowed, sync({ subscriptionId: sub, customerId: (await findDataApiCustomer(users.owner))!, userId: users.other })))
      .toEqual({ disposition: "recorded", outcome: "ignored", code: "owner_mismatch" });
    const foreign = receipt("checkout.session.completed", 0);
    expect(await recordDataApiStripeEvent(foreign, { kind: "ignore", code: "not_data_api_object" }))
      .toEqual({ disposition: "recorded", outcome: "ignored", code: "not_data_api_object" });
    expect(await subscriptionRow(sub)).toBeUndefined();
    for (const [event, code] of [[strayCustomer, "customer_not_bound"], [borrowed, "owner_mismatch"], [foreign, "not_data_api_object"]] as const) {
      expect(await eventRow(event.eventId)).toEqual({ outcome: "ignored", outcome_code: code });
    }
  });

  it("holds account deletion, with an answer a person can act on, until Stripe reports the subscription ended", async () => {
    const customerId = await bindDataApiCustomer(users.leaving, id("cus"));
    const sub = id("sub");
    await recordDataApiStripeEvent(receipt("checkout.session.completed", 0), sync({ subscriptionId: sub, customerId, userId: users.leaving }));
    const deleteUser = PgAdapter().deleteUser!;
    const held = await Promise.resolve(deleteUser(users.leaving)).then(() => null, (error: unknown) => error);
    expect(held).toBeInstanceOf(AccountErasureHeldError);
    expect(held).toMatchObject({ code: "ACCOUNT_ERASURE_HELD", status: 409, hold: "data-api-subscription" });
    expect((held as Error).message).toMatch(/has not reported ended/);
    expect((await state.pool.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [users.leaving])).rows[0].n).toBe(1);

    const ended = receipt("customer.subscription.deleted", 60);
    await recordDataApiStripeEvent(ended, sync({ subscriptionId: sub, customerId, userId: users.leaving, status: "canceled" }));
    await deleteUser(users.leaving);
    for (const table of ["users", "data_api_customers", "data_api_subscriptions"]) {
      const column = table === "users" ? "id" : "user_id";
      expect((await state.pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [users.leaving])).rows[0].n).toBe(0);
    }
    // The event ledger keeps ids and outcomes only, and outlives the account.
    expect(await eventRow(ended.eventId)).toEqual({ outcome: "applied", outcome_code: "subscription_synced" });
  });

  it("reports a database without 0142 as not provisioned, never as an empty answer", async () => {
    const bareQuery = (sql: string, params?: unknown[]) => barePool.query(sql, params);
    const deps: DataApiBillingStoreDeps = {
      query: bareQuery,
      runTransaction: async (work) => {
        const client = await barePool.connect();
        try { await client.query("BEGIN"); const result = await work((sql, params) => client.query(sql, params)); await client.query("COMMIT"); return result; }
        catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
      },
    };
    expect(await readAccountEntitlement(users.owner, bareQuery)).toMatchObject({ status: "not-provisioned", entitlement: { planId: "free" } });
    await expect(findDataApiCustomer(users.owner, deps)).rejects.toBeInstanceOf(DataApiBillingNotProvisionedError);
    await expect(listOpenDataApiSubscriptions(users.owner, deps)).rejects.toBeInstanceOf(DataApiBillingNotProvisionedError);
    await expect(hasDataApiStripeEvent(id("evt"), deps)).rejects.toBeInstanceOf(DataApiBillingNotProvisionedError);
    await expect(recordDataApiStripeEvent(receipt("customer.subscription.updated", 0), { kind: "ignore", code: "not_data_api_object" }, deps))
      .rejects.toBeInstanceOf(DataApiBillingNotProvisionedError);
  });
});
