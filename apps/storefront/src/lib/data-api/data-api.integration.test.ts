import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { DERIVED_MARKET_METHOD_VERSION as METHOD } from "@cambridge-tcg/data-spec";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ pool: null as unknown as import("pg").Pool }));
vi.mock("@/lib/db", () => ({
  query: (sql: string, params?: unknown[]) => state.pool.query(sql, params),
  transaction: async <T>(fn: (query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>) => Promise<T>) => {
    const client = await state.pool.connect();
    try { await client.query("BEGIN"); const result = await fn((sql, params) => client.query(sql, params)); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
}));
import { createMemberKey, resolveMemberBearer } from "../datafeed/member-keys";
import { resolveDataApiBearer } from "./bearer";
import { entitlementFor } from "./plans";
import {
  parseExportQuery, parseIndexQuery, parsePremiumQuery, parseReferenceHistoryQuery, parseReferenceQuery,
  readDerivedExport, readMarketIndices, readMarketPremiums, readReferenceHistory, readReferencePrices, type DerivedPage,
} from "./reads";
import * as referenceRoute from "@/app/api/v1/market/reference/route";
import * as indicesRoute from "@/app/api/v1/market/indices/route";
import * as exportRoute from "@/app/api/v1/market/export/route";
import * as usageRoute from "@/app/api/v1/account/usage/route";

// Migrations 0137, 0138, 0139, 0141 and 0142 exactly as checked in, in one
// throwaway schema with a stub users table (as the other data-API and member
// price integration tests do). Explicit loopback *_test database only.
const target = process.env.DATA_API_TEST_DATABASE_URL;
const id = randomUUID().replaceAll("-", "");
const schemas = { full: `data_api_reads_test_${id}`, bare: `data_api_bare_test_${id}`, no0139: `data_api_no0139_test_${id}` };
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), "utf8");
let admin: Pool;
const pools: Pool[] = [];

const NOW = new Date("2026-10-28T12:00:00.000Z");
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const EVIDENCE = { cardmarket: "cardmarket-derivation/2026-10-28.1", cardrush: "cardrush/2026-10-28.1", tcgplayer: "tcgplayer/2026-10-28.1" };
const free = entitlementFor(null);
const pro = entitlementFor("pro");
const users = { free: randomUUID(), pro: randomUUID(), trial: randomUUID(), lapsed: randomUUID(), both: randomUUID(), capped: randomUUID(), keysPro: randomUUID(), keysRace: randomUUID() };
const actor = { userId: users.free };

async function schemaPool(schema: string, files: string[]): Promise<Pool> {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 12 });
  pools.push(pool);
  await pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
  await pool.query(`INSERT INTO users (id) SELECT unnest($1::uuid[])`, [Object.values(users)]);
  for (const file of files) {
    const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query(await migration(file)); await client.query("COMMIT"); }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  return pool;
}
async function tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await state.pool.connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const insert = (client: PoolClient, table: string, row: Record<string, unknown>) => {
  const columns = Object.keys(row);
  return client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id::text`, Object.values(row));
};
interface Seed { references?: Record<string, unknown>[]; indices?: Record<string, unknown>[]; premiums?: Record<string, unknown>[]; evidence?: Record<string, string> }
/** One run and its rows commit together, as 0141 requires. */
async function seedRun(asOf: string, seed: Seed): Promise<string> {
  return tx(async client => {
    const quote = (rate: string) => ({ rate, source: "ecb.europa.eu", as_of: asOf });
    const run = await insert(client, "market_derivation_runs", {
      method_version: METHOD, as_of: asOf, input_batch_ceiling: 0, input_evidence: seed.evidence ?? EVIDENCE,
      fx: { EUR: quote("1.1534"), JPY: quote("196.12"), USD: quote("1.3001") },
    });
    const runId = run.rows[0].id as string;
    const derived = { run_id: runId, method_version: METHOD, as_of: asOf };
    for (const row of seed.references ?? []) await insert(client, "market_reference_prices", {
      ...derived, game: "one-piece", set_code: "op01", currency: "GBP", confidence: "medium", sources: ["cardrush", "tcgplayer"], source_count: 2, ...row,
    });
    for (const row of seed.indices ?? []) await insert(client, "market_indices", {
      ...derived, game: "one-piece", set_code: "op01", market: "cardmarket", constituents: 10, previous_as_of: null, sources: [row.market ?? "cardmarket"], ...row,
    });
    for (const row of seed.premiums ?? []) await insert(client, "market_premiums", {
      ...derived, game: "one-piece", set_code: "op01", market: "cardrush", base_market: "cardmarket",
      ratio_p25: "1.1", ratio_median: "1.25", ratio_p75: "1.4", sku_count: 10, sources: ["cardmarket", "cardrush"],
      market_languages: ["ja"], base_languages: ["*"], ...row,
    });
    return runId;
  });
}
async function subscribe(userId: string, planId: "pro" | "business", fields: Record<string, string> = {}) {
  const customer = `cus_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const event = `evt_${randomUUID().replaceAll("-", "")}`;
  await state.pool.query("INSERT INTO data_api_customers (user_id, stripe_customer_id, environment) VALUES ($1, $2, 'test') ON CONFLICT (user_id) DO NOTHING", [userId, customer]);
  await state.pool.query(`INSERT INTO data_api_stripe_events (stripe_event_id, environment, event_type, livemode, provider_created_at, outcome, outcome_code)
    VALUES ($1, 'test', 'customer.subscription.updated', false, NOW(), 'applied', 'subscription_synced')`, [event]);
  await state.pool.query(`INSERT INTO data_api_subscriptions (environment, user_id, plan_id, status, stripe_customer_id, stripe_subscription_id,
      current_period_end, last_stripe_event_id, provider_updated_at)
    SELECT 'test', $1, $2, $3, c.stripe_customer_id, $4, NOW() + ($5::text)::interval, $6, NOW() FROM data_api_customers c WHERE c.user_id = $1`,
  [userId, planId, fields.status ?? "active", `sub_${randomUUID().replaceAll("-", "")}`, fields.period ?? "30 days", event]);
}
const header = (token: string) => `Bearer ${token}`;
/** Concurrency checks must not straddle a wall-clock minute. */
async function freshMinute() {
  const { rows } = await state.pool.query("SELECT EXTRACT(EPOCH FROM date_trunc('minute', NOW()) + interval '1 minute' - NOW())::float AS seconds");
  if (rows[0].seconds < 6) await new Promise(resolve => setTimeout(resolve, rows[0].seconds * 1000 + 200));
}
async function allPages<T>(read: (cursor?: string) => Promise<DerivedPage<T>>): Promise<DerivedPage<T>[]> {
  const pages = [await read()];
  while (pages.at(-1)!.nextCursor) pages.push(await read(pages.at(-1)!.nextCursor!));
  return pages;
}
const q = (params: Record<string, string>) => new URLSearchParams(params);

describe.skipIf(!target)("data API PostgreSQL integration (explicit loopback *_test database only)", () => {
  let full: Pool, bare: Pool, no0139: Pool;
  beforeAll(async () => {
    const url = new URL(target!);
    if (!["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) || !/^\/[A-Za-z0-9_]+_test$/.test(url.pathname) || url.search || url.hash) {
      throw new Error("DATA_API_TEST_DATABASE_URL must name a disposable loopback *_test database.");
    }
    process.env.AUTH_SECRET = "fixture-only-cursor-secret-not-a-production-key";
    // The routes serve only while published; one test turns it off.
    process.env.DATA_API_READS = "on";
    admin = new Pool({ connectionString: target });
    full = await schemaPool(schemas.full, ["0137_member_price_observations.sql", "0138_member_data_keys.sql", "0139_widen_price_sources.sql", "0141_market_derived.sql", "0142_data_api_plans.sql"]);
    bare = await schemaPool(schemas.bare, ["0137_member_price_observations.sql", "0138_member_data_keys.sql"]);
    no0139 = await schemaPool(schemas.no0139, ["0137_member_price_observations.sql", "0138_member_data_keys.sql", "0141_market_derived.sql", "0142_data_api_plans.sql"]);
    state.pool = full;

    // One run per day, oldest first (an index step chains to an earlier row).
    // SKU 001's references span the free plan's 365-day window; the
    // op01 × cardmarket index starts outside it and chains inside it.
    const index = (level: string, previous: number | null) => ({ level, previous_as_of: previous === null ? null : day(previous) });
    await seedRun(day(-400), { references: [{ sku: "op-op01-001-en", amount: "9.5" }], indices: [index("100", null)] });
    await seedRun(day(-100), { references: [{ sku: "op-op01-001-en", amount: "11" }] });
    await seedRun(day(-90), { indices: [index("110", -400)] });
    await seedRun(day(-30), { indices: [index("121", -90)] });
    await seedRun(day(-7), { indices: [index("100", -30)] });
    await seedRun(day(-1), { references: [{ sku: "op-op01-001-en", amount: "12.3" }] });
    await seedRun(day(0), {
      indices: [index("110", -7)],
      references: [
        { sku: "op-op01-001-en", amount: "12.4" },
        ...["002", "003", "004", "005"].map(n => ({ sku: `op-op01-${n}-en`, amount: "3.1" })),
        { sku: "op-op01-006-en", amount: "4.2", sources: ["cardmarket", "cardrush", "tcgplayer"], source_count: 3, confidence: "high" },
      ],
      premiums: [
        { market: "cardrush", base_market: "cardmarket" },
        { market: "tcgplayer", base_market: "cardmarket", sources: ["cardmarket", "tcgplayer"], ratio_median: "1.3", market_languages: ["en", "ja"] },
      ],
    });
    // Two series for the trend bases alone. op05: a 90-day base just before
    // the free plan's window (and inside the 7-day grace) of a point inside
    // it. op06: a 7-day base whose run recorded Cardmarket under other
    // evidence, so the base itself is not servable.
    await seedRun(day(-392), { indices: [{ set_code: "op05", level: "100", previous_as_of: null }] });
    await seedRun(day(-300), { indices: [{ set_code: "op05", level: "120", previous_as_of: day(-392) }] });
    await seedRun(day(-200), { evidence: { ...EVIDENCE, cardmarket: "cardmarket-derivation/2026-01-01.0" }, indices: [{ set_code: "op06", level: "100", previous_as_of: null }] });
    await seedRun(day(-193), { indices: [{ set_code: "op06", level: "150", previous_as_of: day(-200) }] });
  });
  afterAll(async () => {
    for (const pool of pools) await pool.end();
    if (admin) {
      for (const schema of Object.values(schemas)) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  describe("bearer, entitlement and metering", () => {
    it("meters a free key at 30 a minute in data_api_rate_buckets and never in the free route's buckets", async () => {
      const { token, key } = await createMemberKey(users.free, "free");
      await freshMinute();
      const results = await Promise.all(Array.from({ length: 40 }, () => resolveDataApiBearer(header(token))));
      expect(results.filter(result => result.ok)).toHaveLength(30);
      const refused = results.filter(result => !result.ok);
      expect(refused).toHaveLength(10);
      expect(refused[0]).toMatchObject({ status: 429, window: "minute", limit: 30 });
      const ok = results.find(result => result.ok)!;
      expect(ok).toMatchObject({ actor: { userId: users.free }, entitlement: { planId: "free" }, minute: { limit: 30 }, month: { limit: 100_000 } });
      expect((await state.pool.query("SELECT request_count FROM data_api_rate_buckets WHERE key_id = $1", [key.id])).rows).toEqual([{ request_count: 31 }]);
      expect((await state.pool.query("SELECT count(*)::int AS n FROM member_data_rate_buckets WHERE key_id = $1", [key.id])).rows[0].n).toBe(0);
      expect((await state.pool.query("SELECT request_count FROM data_api_usage_months WHERE user_id = $1", [users.free])).rows).toEqual([{ request_count: 30 }]);
    });

    it("applies an active or trialing pro subscription's limits, and free otherwise", async () => {
      await subscribe(users.pro, "pro");
      await subscribe(users.trial, "pro", { status: "trialing" });
      await subscribe(users.lapsed, "pro", { status: "past_due" });
      await subscribe(users.lapsed, "business", { period: "-1 hour" });
      const keys = Object.fromEntries(await Promise.all((["pro", "trial", "lapsed"] as const).map(async name => [name, (await createMemberKey(users[name], name)).token])));
      expect(await resolveDataApiBearer(header(keys.trial))).toMatchObject({ ok: true, entitlement: { planId: "pro" } });
      expect(await resolveDataApiBearer(header(keys.lapsed))).toMatchObject({ ok: true, entitlement: { planId: "free" }, minute: { limit: 30 } });
      await freshMinute();
      const results = await Promise.all(Array.from({ length: 130 }, () => resolveDataApiBearer(header(keys.pro))));
      expect(results.filter(result => result.ok)).toHaveLength(120);
      expect(results.filter(result => !result.ok && result.status === 429 && result.window === "minute")).toHaveLength(10);
      expect(results.find(result => result.ok)).toMatchObject({ entitlement: { planId: "pro" }, minute: { limit: 120 }, month: { limit: 1_000_000 } });
    });

    it("serves the strongest of duplicate subscriptions and flags it without naming the account", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await subscribe(users.both, "pro");
      await subscribe(users.both, "business");
      const { token } = await createMemberKey(users.both, "both");
      expect(await resolveDataApiBearer(header(token))).toMatchObject({ ok: true, entitlement: { planId: "business" }, minute: { limit: 600 } });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("2 entitling subscriptions"));
      expect(JSON.stringify(warn.mock.calls)).not.toContain(users.both);
      warn.mockRestore();
    });

    it("keeps paid minute counts apart from the free member-prices route", async () => {
      const { token, key } = await createMemberKey(users.pro, "shared key");
      await freshMinute();
      for (let i = 0; i < 50; i++) expect((await resolveDataApiBearer(header(token))).ok).toBe(true);
      const free = await Promise.all(Array.from({ length: 40 }, () => resolveMemberBearer(header(token))));
      expect(free.filter(result => result.ok)).toHaveLength(30);
      expect(await resolveDataApiBearer(header(token))).toMatchObject({ ok: true, minute: { limit: 120, remaining: 69 } });
      const counts = await state.pool.query(`SELECT (SELECT request_count FROM data_api_rate_buckets WHERE key_id = $1) AS paid,
        (SELECT request_count FROM member_data_rate_buckets WHERE key_id = $1) AS free`, [key.id]);
      expect(counts.rows[0]).toEqual({ paid: 51, free: 31 });
    });

    it("stops at the monthly cap atomically, counts only accepted requests and reports the reset", async () => {
      await subscribe(users.capped, "pro");
      const { token } = await createMemberKey(users.capped, "capped");
      await state.pool.query(`INSERT INTO data_api_usage_months (user_id, month, request_count)
        VALUES ($1, (date_trunc('month', NOW() AT TIME ZONE 'UTC'))::date, $2)`, [users.capped, 1_000_000 - 3]);
      await freshMinute();
      const results = await Promise.all(Array.from({ length: 10 }, () => resolveDataApiBearer(header(token))));
      expect(results.filter(result => result.ok)).toHaveLength(3);
      const refused = results.filter(result => !result.ok);
      expect(refused).toHaveLength(7);
      for (const result of refused) expect(result).toMatchObject({ status: 429, window: "month", limit: 1_000_000, month: { remaining: 0, used: 1_000_000 } });
      expect((refused[0] as { resetSeconds: number }).resetSeconds).toBeGreaterThan(0);
      expect((await state.pool.query("SELECT request_count FROM data_api_usage_months WHERE user_id = $1", [users.capped])).rows[0].request_count).toBe(1_000_000);
      // Ending the subscription lowers the cap to free's: still refused.
      await state.pool.query("UPDATE data_api_subscriptions SET status = 'canceled' WHERE user_id = $1", [users.capped]);
      expect(await resolveDataApiBearer(header(token))).toMatchObject({ ok: false, status: 429, window: "month", limit: 100_000 });
    });

    it("refuses malformed, unknown and revoked keys with 401", async () => {
      expect(await resolveDataApiBearer(null)).toEqual({ ok: false, status: 401 });
      expect(await resolveDataApiBearer(header(`ctcg_member_${"a".repeat(43)}`))).toEqual({ ok: false, status: 401 });
      const { token, key } = await createMemberKey(users.free, "revoked");
      await state.pool.query("UPDATE member_data_keys SET revoked_at = NOW() WHERE id = $1", [key.id]);
      expect(await resolveDataApiBearer(header(token))).toEqual({ ok: false, status: 401 });
    });
  });

  describe("key cap follows the entitlement", () => {
    it("keeps the free cap at five with the same message", async () => {
      const owner = randomUUID();
      await state.pool.query("INSERT INTO users (id) VALUES ($1)", [owner]);
      for (let i = 0; i < 5; i++) await createMemberKey(owner, `free ${i}`);
      await expect(createMemberKey(owner, "sixth")).rejects.toMatchObject({ status: 409, message: "You have five active keys. Revoke one before creating another." });
    });
    it("lets a pro account hold ten, serialized under concurrency", async () => {
      await subscribe(users.keysPro, "pro");
      for (let i = 0; i < 10; i++) await createMemberKey(users.keysPro, `pro ${i}`);
      await expect(createMemberKey(users.keysPro, "eleventh")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("10 active keys, the most your plan allows") });
      await subscribe(users.keysRace, "pro");
      const results = await Promise.allSettled(Array.from({ length: 15 }, (_, i) => createMemberKey(users.keysRace, `race ${i}`)));
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(10);
      expect((await state.pool.query("SELECT count(*)::int AS n FROM member_data_keys WHERE user_id = $1", [users.keysRace])).rows[0].n).toBe(10);
    });
  });

  describe("derived readers", () => {
    it("serves each SKU's latest servable reference in request order, within the window", async () => {
      const page = await readReferencePrices(actor, free, parseReferenceQuery(q({ sku: "op-op01-006-en,op-op01-001-en,op-op01-999-en" })), { now: NOW });
      expect(page).toMatchObject({ status: "available", count: 2, complete: true, nextCursor: null, history: { days: 365, start: day(-365), clipped: false } });
      expect(page.items.map(item => [item.sku, item.asOf, item.amount, item.confidence, item.sources])).toEqual([
        ["op-op01-006-en", day(0), "4.2", "high", ["cardmarket", "cardrush", "tcgplayer"]],
        ["op-op01-001-en", day(0), "12.4", "medium", ["cardrush", "tcgplayer"]],
      ]);
      expect(Object.keys(page.items[0]!)).toEqual(["runId", "methodVersion", "asOf", "sku", "game", "setCode", "amount", "currency", "confidence", "sources", "sourceCount"]);
    });

    it("pages a set's references with signed, filter-bound cursors", async () => {
      const pages = await allPages(cursor => readReferencePrices(actor, free, parseReferenceQuery(q({ game: "one-piece", set: "op01", limit: "2", ...(cursor ? { cursor } : {}) })), { now: NOW }));
      expect(pages.map(page => page.items.map(item => item.sku.slice(8, 11)))).toEqual([["001", "002"], ["003", "004"], ["005", "006"], []].slice(0, pages.length));
      expect(pages.at(-1)!.complete).toBe(true);
      expect(new Set(pages.map(page => page.asOf)).size).toBe(1);
      const cursor = pages[0]!.nextCursor!;
      await expect(readReferencePrices(actor, free, parseReferenceQuery(q({ game: "one-piece", set: "op01", limit: "3", cursor })), { now: NOW })).rejects.toThrow(/filter-mismatched/);
      await expect(readReferencePrices({ userId: users.pro }, free, parseReferenceQuery(q({ game: "one-piece", set: "op01", limit: "2", cursor })), { now: NOW })).rejects.toThrow(/filter-mismatched/);
      const tampered = `${cursor.split(".")[0]}x.${cursor.split(".")[1]}`;
      await expect(readReferencePrices(actor, free, parseReferenceQuery(q({ game: "one-piece", set: "op01", limit: "2", cursor: tampered })), { now: NOW })).rejects.toThrow(/Invalid/);
      await expect(readReferencePrices(actor, free, parseReferenceQuery(q({ game: "one-piece", set: "op01", limit: "2", cursor })), { now: new Date(NOW.getTime() + 25 * 3_600_000) })).rejects.toThrow(/expired/);
    });

    it("clips reference history to the free plan's 365 days and serves pro's full history", async () => {
      const freeHistory = await readReferenceHistory(actor, free, parseReferenceHistoryQuery(q({ sku: "op-op01-001-en" })), { now: NOW });
      expect(freeHistory.items.map(item => [item.asOf, item.amount])).toEqual([[day(-100), "11"], [day(-1), "12.3"], [day(0), "12.4"]]);
      expect(freeHistory.history).toEqual({ days: 365, start: day(-365), clipped: true });
      const proHistory = await readReferenceHistory({ userId: users.pro }, pro, parseReferenceHistoryQuery(q({ sku: "op-op01-001-en" })), { now: NOW });
      expect(proHistory.items.map(item => item.asOf)).toEqual([day(-400), day(-100), day(-1), day(0)]);
      expect(proHistory.history).toEqual({ days: null, start: null, clipped: false });
      const inside = await readReferenceHistory(actor, free, parseReferenceHistoryQuery(q({ sku: "op-op01-001-en", from: day(-200), to: day(-1) })), { now: NOW });
      expect(inside.items.map(item => item.asOf)).toEqual([day(-100), day(-1)]);
      expect(inside.history.clipped).toBe(false);
      const before = await readReferenceHistory(actor, free, parseReferenceHistoryQuery(q({ sku: "op-op01-001-en", from: day(-500), to: day(-380) })), { now: NOW });
      expect(before).toMatchObject({ status: "empty", items: [], history: { clipped: true } });
      const paged = await allPages(cursor => readReferenceHistory({ userId: users.pro }, pro, parseReferenceHistoryQuery(q({ sku: "op-op01-001-en", limit: "1", ...(cursor ? { cursor } : {}) })), { now: NOW }));
      expect(paged.flatMap(page => page.items.map(item => item.asOf))).toEqual([day(-400), day(-100), day(-1), day(0)]);
    });

    it("computes 7, 30 and 90 day index changes on read, inside the plan's window", async () => {
      const page = await readMarketIndices(actor, pro, parseIndexQuery(q({ game: "one-piece", set: "op01", market: "cardmarket" })), { now: NOW });
      const latest = page.items.at(-1)!;
      expect(latest.point).toMatchObject({ indexKey: "one-piece:op01:cardmarket", asOf: day(0), level: "110", previousAsOf: day(-7), sources: ["cardmarket"] });
      expect(latest.changes).toEqual({
        d7: { baseAsOf: day(-7), changePercent: "10" },
        d30: { baseAsOf: day(-30), changePercent: "-9.09" },
        d90: { baseAsOf: day(-90), changePercent: "0" },
      });
      expect(page.items.map(item => item.point.asOf)).toEqual([day(-400), day(-90), day(-30), day(-7), day(0)]);
      const freePage = await readMarketIndices(actor, free, parseIndexQuery(q({ game: "one-piece", set: "op01" })), { now: NOW });
      expect(freePage.items.map(item => item.point.asOf)).toEqual([day(-90), day(-30), day(-7), day(0)]);
      // The 90-day base of the -90 point would be -400 (before the window, and beyond the grace): no change.
      expect(freePage.items[0]!.changes).toEqual({ d7: null, d30: null, d90: null });
      const perGame = await readMarketIndices(actor, free, parseIndexQuery(q({ game: "one-piece" })), { now: NOW });
      expect(perGame).toMatchObject({ status: "empty", items: [] });
    });

    it("bases each change only on a level the same read could serve: inside the window, under current evidence", async () => {
      const series = (entitlement: typeof free, set: string) => readMarketIndices(actor, entitlement, parseIndexQuery(q({ game: "one-piece", set, market: "cardmarket" })), { now: NOW });
      // The -392 base is before the free window: the free plan gets no 90-day change; pro, with full history, does.
      expect((await series(free, "op05")).items.map(item => [item.point.asOf, item.changes.d90])).toEqual([[day(-300), null]]);
      expect((await series(pro, "op05")).items.at(-1)!.changes.d90).toEqual({ baseAsOf: day(-392), changePercent: "20" });
      // The -200 base's run named other Cardmarket evidence: not served, as a point or as a base.
      const hidden = await series(pro, "op06");
      expect(hidden.items.map(item => [item.point.asOf, item.changes.d7])).toEqual([[day(-193), null]]);
    });

    it("serves each market pair's latest premium, or a date's, and refuses dates before the window", async () => {
      const page = await readMarketPremiums(actor, free, parsePremiumQuery(q({ game: "one-piece", set: "op01" })), { now: NOW });
      expect(page.items.map(item => [item.market, item.baseMarket, item.ratioMedian, item.asOf])).toEqual([
        ["cardrush", "cardmarket", "1.25", day(0)], ["tcgplayer", "cardmarket", "1.3", day(0)],
      ]);
      // Each side's language basis, as stored.
      expect(page.items.map(item => [item.marketLanguages, item.baseLanguages])).toEqual([[["ja"], ["*"]], [["en", "ja"], ["*"]]]);
      const none = await readMarketPremiums(actor, free, parsePremiumQuery(q({ game: "one-piece", date: day(-1) })), { now: NOW });
      expect(none.status).toBe("empty");
      await expect(readMarketPremiums(actor, free, parsePremiumQuery(q({ game: "one-piece", date: day(-366) })), { now: NOW })).rejects.toMatchObject({ status: 403, code: "INSUFFICIENT_TIER" });
    });

    it("exports a day's derived rows in bounded pages with its run", async () => {
      const pages = await allPages(cursor => readDerivedExport(actor, free, parseExportQuery(q({ date: day(0), limit: "4", ...(cursor ? { cursor } : {}) })), { now: NOW }) as Promise<DerivedPage<{ type: string }>>);
      const rows = pages.flatMap(page => page.items);
      expect(rows.map(row => row.type)).toEqual([...Array(6).fill("reference"), "index", "premium", "premium"]);
      expect(rows.filter(row => row.type === "premium")).toEqual([expect.objectContaining({ marketLanguages: ["ja"], baseLanguages: ["*"] }), expect.objectContaining({ marketLanguages: ["en", "ja"] })]);
      expect(pages.map(page => page.count)).toEqual([4, 4, 1]);
      const first = await readDerivedExport(actor, free, parseExportQuery(q({ date: day(0) })), { now: NOW });
      expect(first).toMatchObject({ total: 9, complete: true, run: { asOf: day(0), methodVersion: METHOD, inputEvidence: EVIDENCE, fx: { EUR: { rate: "1.1534", source: "ecb.europa.eu", as_of: day(0) } } } });
      const missing = await readDerivedExport(actor, free, parseExportQuery(q({ date: day(-2) })), { now: NOW });
      expect(missing).toMatchObject({ status: "empty", run: null, total: 0, reason: "No derivation run is recorded for this date." });
      await expect(readDerivedExport(actor, free, parseExportQuery(q({ date: day(-400) })), { now: NOW })).rejects.toMatchObject({ status: 403 });
      expect((await readDerivedExport({ userId: users.pro }, pro, parseExportQuery(q({ date: day(-400) })), { now: NOW })).total).toBe(2);
    });
  });

  describe("read-time revocation", () => {
    const latest = () => readReferencePrices(actor, free, parseReferenceQuery(q({ sku: "op-op01-001-en,op-op01-006-en" })), { now: NOW });
    const premiums = () => readMarketPremiums(actor, free, parsePremiumQuery(q({ game: "one-piece", set: "op01" })), { now: NOW });
    const indices = () => readMarketIndices(actor, free, parseIndexQuery(q({ game: "one-piece", set: "op01" })), { now: NOW });

    it("hides every row a source contributed to while its derivation is off, then serves them again", async () => {
      await state.pool.query("UPDATE member_price_source_releases SET derivation = false WHERE source = 'cardrush'");
      try {
        expect((await latest()).items).toEqual([]);
        expect((await premiums()).items.map(item => item.market)).toEqual(["tcgplayer"]);
        expect((await indices()).items).toHaveLength(4);
        const day0 = await readDerivedExport(actor, free, parseExportQuery(q({ date: day(0) })), { now: NOW });
        expect(day0.items.map(item => item.type)).toEqual(["index", "premium"]);
      } finally {
        await state.pool.query("UPDATE member_price_source_releases SET derivation = true WHERE source = 'cardrush'");
      }
      expect((await latest()).items).toHaveLength(2);
    });

    it("hides rows of a revoked source, a changed release evidence version, or a run recorded under other evidence", async () => {
      await state.pool.query("UPDATE member_price_source_releases SET revoked_at = NOW() WHERE source = 'tcgplayer'");
      try { expect((await latest()).items).toEqual([]); }
      finally { await state.pool.query("UPDATE member_price_source_releases SET revoked_at = NULL WHERE source = 'tcgplayer'"); }
      await state.pool.query("UPDATE member_price_source_releases SET derivation_evidence_version = 'cardmarket-derivation/2027-01-01.1' WHERE source = 'cardmarket'");
      try {
        expect((await latest()).items.map(item => item.sku)).toEqual(["op-op01-001-en"]);
        expect((await indices()).items).toEqual([]);
      } finally {
        await state.pool.query("UPDATE member_price_source_releases SET derivation_evidence_version = 'cardmarket-derivation/2026-10-28.1' WHERE source = 'cardmarket'");
      }
      // The same version at another evidence URL is not the evidence this code was written for.
      await state.pool.query("UPDATE member_price_source_releases SET derivation_evidence_url = 'repo:docs/decisions/elsewhere.md#cardrush' WHERE source = 'cardrush'");
      try {
        expect((await latest()).items).toEqual([]);
        expect((await premiums()).items.map(item => item.market)).toEqual(["tcgplayer"]);
      } finally {
        await state.pool.query("UPDATE member_price_source_releases SET derivation_evidence_url = 'repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardrush' WHERE source = 'cardrush'");
      }
      expect((await latest()).items).toHaveLength(2);
      await seedRun(day(1), { evidence: { ...EVIDENCE, cardrush: "cardrush/2026-01-01.0" }, references: [{ sku: "op-op01-001-en", amount: "99" }] });
      const after = await latest();
      expect(after.items.find(item => item.sku === "op-op01-001-en")).toMatchObject({ asOf: day(0), amount: "12.4" });
    });

    it("hides a reference once fewer than two of its sources are unexported, whatever a later migration allows", async () => {
      await state.pool.query("ALTER TABLE member_price_source_releases DROP CONSTRAINT member_price_source_releases_page_sources_display_only_check");
      await state.pool.query("UPDATE member_price_source_releases SET member_download = true WHERE source = 'tcgplayer'");
      try { expect((await latest()).items).toEqual([]); }
      finally { await state.pool.query("UPDATE member_price_source_releases SET member_download = false WHERE source = 'tcgplayer'"); }
      expect((await latest()).items).toHaveLength(2);
    });

    it("narrows a pagination in progress and holds its run ceiling", async () => {
      const read = (cursor?: string) => readReferencePrices(actor, free, parseReferenceQuery(q({ game: "one-piece", set: "op01", limit: "3", ...(cursor ? { cursor } : {}) })), { now: NOW });
      const first = await read();
      expect(first.items.map(item => item.sku.slice(8, 11))).toEqual(["001", "002", "003"]);
      await seedRun(day(2), { references: [{ sku: "op-op01-004-en", amount: "50" }] });
      const second = await read(first.nextCursor!);
      expect(second.items.find(item => item.sku === "op-op01-004-en")).toMatchObject({ amount: "3.1", asOf: day(0) });
      expect(second.ceiling).toBe(first.ceiling);
      expect((await read()).items.length).toBe(3);
      expect((await readReferencePrices(actor, free, parseReferenceQuery(q({ sku: "op-op01-004-en" })), { now: NOW })).items[0]).toMatchObject({ amount: "50", asOf: day(2) });
    });
  });

  describe("not provisioned", () => {
    it("reports missing 0139, 0141 and 0142 as not provisioned, never as empty", async () => {
      for (const pool of [bare, no0139]) {
        state.pool = pool;
        try {
          const read = await readReferencePrices(actor, free, parseReferenceQuery(q({ sku: "op-op01-001-en" })), { now: NOW });
          expect(read).toMatchObject({ status: "not-provisioned", items: [], complete: false });
          expect((await readDerivedExport(actor, free, parseExportQuery(q({ date: day(0) })), { now: NOW })).status).toBe("not-provisioned");
        } finally { state.pool = full; }
      }
      state.pool = bare;
      try {
        const { token } = await createMemberKey(users.free, "bare");
        expect(await resolveDataApiBearer(header(token))).toEqual({ ok: false, status: 503, code: "NOT_PROVISIONED" });
        expect(await resolveDataApiBearer(header(`ctcg_member_${"b".repeat(43)}`))).toEqual({ ok: false, status: 401 });
        // The free cap reads no subscription table that does not exist.
        for (let i = 1; i < 5; i++) await createMemberKey(users.free, `bare ${i}`);
        await expect(createMemberKey(users.free, "sixth")).rejects.toMatchObject({ status: 409, message: "You have five active keys. Revoke one before creating another." });
        const response = await referenceRoute.GET(new Request("https://cambridgetcg.com/api/v1/market/reference?sku=op-op01-001-en", { headers: { authorization: header(token) } }));
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: "NOT_PROVISIONED" });
      } finally { state.pool = full; }
    });
  });

  describe("publication", () => {
    it("answers 404 NOT_PUBLISHED while DATA_API_READS is off, before the key is looked up: nothing is counted", async () => {
      const { token, key } = await createMemberKey(users.lapsed, "unpublished");
      const counts = async () => (await state.pool.query(`SELECT (SELECT COALESCE(sum(request_count), 0)::int FROM data_api_rate_buckets WHERE key_id = $1) AS minute,
        (SELECT COALESCE(sum(request_count), 0)::int FROM data_api_usage_months WHERE user_id = $2) AS month`, [key.id, users.lapsed])).rows[0];
      const before = await counts();
      process.env.DATA_API_READS = "off";
      try {
        for (const [route, path] of [[referenceRoute, "/api/v1/market/reference?sku=op-op01-001-en"], [indicesRoute, "/api/v1/market/indices?game=one-piece"],
          [exportRoute, `/api/v1/market/export?date=${day(0)}`], [usageRoute, "/api/v1/account/usage"]] as const) {
          const response = await route.GET(new Request(`https://cambridgetcg.com${path}`, { headers: { authorization: header(token) } }));
          expect(response.status, path).toBe(404);
          expect(await response.json()).toEqual({ error: "The data API is not published.", code: "NOT_PUBLISHED" });
        }
      } finally { process.env.DATA_API_READS = "on"; }
      expect(await counts()).toEqual(before);
    });
  });

  describe("routes over the real bearer and readers", () => {
    it("answers 401 without a key and serves enveloped, metered, rights-labelled data with one", async () => {
      const anonymous = await referenceRoute.GET(new Request("https://cambridgetcg.com/api/v1/market/reference?sku=op-op01-001-en"));
      expect(anonymous.status).toBe(401);
      const { token } = await createMemberKey(users.trial, "routes");
      await freshMinute();
      const response = await referenceRoute.GET(new Request("https://cambridgetcg.com/api/v1/market/reference?game=one-piece&set=op01&limit=2", { headers: { authorization: header(token) } }));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-ratelimit-limit")).toBe("120");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const body = await response.json();
      expect(body.data.items).toHaveLength(2);
      expect(body._meta.data_rights).toContain("Not CC0 and not licensed for AI training");
      expect(body._meta.license).toBe("NOASSERTION");
      expect(body._meta.sources).toEqual(["cardrush", "tcgplayer"]);
      expect(body._meta.next_link).toMatch(/^\/api\/v1\/market\/reference\?game=one-piece&set=op01&limit=2&cursor=/);

      const ndjson = await exportRoute.GET(new Request(`https://cambridgetcg.com/api/v1/market/export?date=${day(0)}`, { headers: { authorization: header(token) } }));
      expect(ndjson.status).toBe(200);
      expect(ndjson.headers.get("content-type")).toContain("application/x-ndjson");
      const lines = (await ndjson.text()).trim().split("\n").map(line => JSON.parse(line));
      expect(lines[0]).toMatchObject({ type: "manifest", schema: METHOD, rights: expect.stringContaining("not licensed for AI training") });
      expect(lines.at(-1)).toMatchObject({ type: "footer", pageComplete: true });

      const usage = await usageRoute.GET(new Request("https://cambridgetcg.com/api/v1/account/usage", { headers: { authorization: header(token) } }));
      const counted = await usage.json();
      // The trial account's fourth metered request: one earlier, then reference, export and this one.
      expect(counted.data).toMatchObject({ plan: { id: "pro" }, limits: { requestsPerMinutePerKey: 120, historyDays: null }, month: { used: 4, limit: 1_000_000 } });
      expect(JSON.stringify(counted)).not.toMatch(/amountPence|amount_pence|"price"/);
    });
  });
});
