import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool, type DatabaseError, type PoolClient } from "pg";
import {
  DERIVED_MARKET_METHOD_VERSION as METHOD, EXPORTABLE_DERIVATION_SOURCES, chainIndex, confidenceFor, marketIndexKey, premiumQuantiles,
  referenceAmount, referenceSourcesAllowed, startIndex,
} from "@cambridge-tcg/data-spec";

// Migrations 0138, 0141 and 0142 exactly as checked in, inside one throwaway
// schema with a stub users table (as member-keys.integration.test.ts does).
const target = process.env.DATA_API_TEST_DATABASE_URL;
const schema = `data_api_schema_test_${randomUUID().replaceAll("-", "")}`;
const MIGRATIONS = ["0138_member_data_keys.sql", "0141_market_derived.sql", "0142_data_api_plans.sql"];
let admin: Pool;
let pool: Pool;

type Row = Record<string, unknown>;
interface Run { id: string; asOf: string }

async function tx<T>(work: (client: PoolClient) => Promise<T>, outcome: "COMMIT" | "ROLLBACK" = "ROLLBACK"): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query(outcome);
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const insert = (client: PoolClient, table: string, row: Row) => {
  const columns = Object.keys(row);
  return client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`, Object.values(row));
};
/** One statement under a savepoint; returns its error so the transaction survives. */
async function refusal(client: PoolClient, sql: string, args: unknown[] = []): Promise<DatabaseError> {
  await client.query("SAVEPOINT attempt");
  try { await client.query(sql, args); }
  catch (error) { await client.query("ROLLBACK TO SAVEPOINT attempt"); return error as DatabaseError; }
  await client.query("RELEASE SAVEPOINT attempt");
  throw new Error(`Expected the database to refuse: ${sql}`);
}
const refuseInsert = (client: PoolClient, table: string, row: Row) => {
  const columns = Object.keys(row);
  return refusal(client, `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(row));
};

const quote = (rate: string, asOf: string) => ({ rate, source: "ecb.europa.eu", as_of: asOf });
const evidence = { cardmarket: "cardmarket-derivation/2026-10-28.1", cardrush: "cardrush/2026-10-28.1" };
const allEvidence = { ...evidence, tcgplayer: "tcgplayer/2026-10-28.1" };
async function insertRun(client: PoolClient, asOf: string, fields: Row = {}): Promise<Run> {
  const { rows } = await insert(client, "market_derivation_runs", {
    method_version: METHOD, as_of: asOf, input_batch_ceiling: 0, input_evidence: allEvidence,
    fx: { EUR: quote("1.1534", asOf), JPY: quote("196.12", asOf), USD: quote("1.3001", asOf) }, ...fields,
  });
  return { id: String(rows[0].id), asOf };
}
const derived = (run: Run) => ({ run_id: run.id, method_version: METHOD, as_of: run.asOf });
const reference = (run: Run, fields: Row = {}): Row => ({
  ...derived(run), sku: "op-op01-001-en", game: "one-piece", set_code: "op01", amount: "12.3", currency: "GBP",
  confidence: "medium", sources: ["cardrush", "tcgplayer"], source_count: 2, ...fields,
});
const indexPoint = (run: Run, fields: Row = {}): Row => ({
  ...derived(run), game: "one-piece", set_code: "op01", market: "cardmarket", level: "100", constituents: 10,
  previous_as_of: null, sources: ["cardmarket"], ...fields,
});
const premium = (run: Run, fields: Row = {}): Row => ({
  ...derived(run), game: "one-piece", set_code: "op01", market: "cardrush", base_market: "cardmarket",
  ratio_p25: "1.1", ratio_median: "1.25", ratio_p75: "1.4", sku_count: 10, sources: ["cardmarket", "cardrush"],
  market_languages: ["ja"], base_languages: ["*"], ...fields,
});
const check = (constraint: string) => ({ code: "23514", constraint });

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const users = { owner: randomUUID(), other: randomUUID(), leaving: randomUUID() };
async function event(client: PoolClient, fields: Row = {}): Promise<string> {
  const { rows } = await insert(client, "data_api_stripe_events", {
    stripe_event_id: id("evt"), environment: "test", event_type: "customer.subscription.updated", livemode: false,
    provider_created_at: "2026-10-28T06:00:00Z", outcome: "applied", outcome_code: "subscription_synced", ...fields,
  });
  return String(rows[0].stripe_event_id);
}
/** The account's one Stripe customer, created on first use. */
async function customer(client: PoolClient, userId: string): Promise<string> {
  await client.query(`INSERT INTO data_api_customers (user_id, stripe_customer_id, environment) VALUES ($1, $2, 'test')
    ON CONFLICT (user_id) DO NOTHING`, [userId, id("cus")]);
  return String((await client.query("SELECT stripe_customer_id FROM data_api_customers WHERE user_id = $1", [userId])).rows[0].stripe_customer_id);
}
async function subscription(client: PoolClient, fields: Row = {}): Promise<Row> {
  const userId = String(fields.user_id ?? users.owner);
  const { rows } = await insert(client, "data_api_subscriptions", {
    environment: "test", user_id: userId, plan_id: "pro", status: "active",
    stripe_customer_id: await customer(client, userId), stripe_subscription_id: id("sub"), current_period_end: "2026-11-28T06:00:00Z",
    last_stripe_event_id: await event(client), provider_updated_at: "2026-10-28T06:00:00Z", ...fields,
  });
  return rows[0];
}

describe.skipIf(!target)("derived market and data-API schemas (explicit loopback *_test database only)", () => {
  beforeAll(async () => {
    // Explicit opt-in only: never DATABASE_URL, never a remote host.
    const url = new URL(target!);
    if (!["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) || !/^\/[A-Za-z0-9_]+_test$/.test(url.pathname) || url.search || url.hash) {
      throw new Error("DATA_API_TEST_DATABASE_URL must name a disposable loopback *_test database.");
    }
    admin = new Pool({ connectionString: target });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 4 });
    await pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    await pool.query("INSERT INTO users (id) VALUES ($1), ($2), ($3)", Object.values(users));
    for (const file of MIGRATIONS) {
      const sql = await readFile(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8");
      await tx(client => client.query(sql), "COMMIT");
    }
    const placed = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname = ANY($2)`, [schema, [
      "market_derivation_runs", "market_reference_prices", "market_indices", "market_premiums",
      "data_api_customers", "data_api_subscriptions", "data_api_stripe_events", "data_api_usage_months", "data_api_rate_buckets",
    ]]);
    expect(placed.rows[0].n).toBe(9);
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  describe("0141 market_derived", () => {
    it("accepts a complete run computed by the contract helpers, and chains the next day", async () => {
      const values = ["12.1", "12.6"];
      const base = startIndex(Array(10).fill("2.5"));
      const quartiles = premiumQuantiles(Array.from({ length: 10 }, (_, i) => ({ market: `1.${i + 1}`, baseMarket: "1" })));
      expect(base.ok && quartiles.ok).toBe(true);
      if (!base.ok || !quartiles.ok) return;
      await tx(async client => {
        const run = await insertRun(client, "2026-10-27");
        const ref = await insert(client, "market_reference_prices", reference(run, { amount: referenceAmount(values), confidence: confidenceFor(values) }));
        expect(ref.rows[0]).toMatchObject({ amount: "12.4", confidence: "medium", source_count: 2 });
        const point = await insert(client, "market_indices", indexPoint(run, { level: base.level, constituents: base.constituents }));
        expect(point.rows[0].index_key).toBe(marketIndexKey("one-piece", "op01", "cardmarket"));
        const perGame = await insert(client, "market_indices", indexPoint(run, { set_code: null, constituents: 25 }));
        expect(perGame.rows[0].index_key).toBe(marketIndexKey("one-piece", null, "cardmarket"));
        await insert(client, "market_premiums", premium(run, {
          ratio_p25: quartiles.ratioP25, ratio_median: quartiles.ratioMedian, ratio_p75: quartiles.ratioP75, sku_count: quartiles.skuCount,
        }));
      }, "COMMIT");
      const step = chainIndex(base.level, Array.from({ length: 12 }, () => ({ previous: "3", current: "1" })));
      expect(step).toMatchObject({ ok: true, level: "33.333333" });
      if (!step.ok) return;
      await tx(async client => {
        const run = await insertRun(client, "2026-10-28", {
          fx: { EUR: quote("1.1534", "2026-10-27"), JPY: quote("196.12", "2026-10-27"), USD: quote("1.3001", "2026-10-27") },
        });
        await insert(client, "market_indices", indexPoint(run, { level: step.level, constituents: step.constituents, previous_as_of: "2026-10-27" }));
        await insert(client, "market_reference_prices", reference(run, {
          amount: "12.7", confidence: "high", sources: ["cardmarket", "cardrush", "tcgplayer"], source_count: 3,
        }));
      }, "COMMIT");
      const history = await pool.query(`SELECT as_of::text, amount::text, sources FROM market_reference_prices
        WHERE sku = $1 AND method_version = $2 ORDER BY as_of`, ["op-op01-001-en", METHOD]);
      expect(history.rows).toEqual([
        { as_of: "2026-10-27", amount: "12.4", sources: ["cardrush", "tcgplayer"] },
        { as_of: "2026-10-28", amount: "12.7", sources: ["cardmarket", "cardrush", "tcgplayer"] },
      ]);
    });

    it.each<[string, Row, object]>([
      ["a one-source reference", { sources: ["cardmarket"], source_count: 1 }, check("market_reference_prices_min_sources")],
      ["one source listed twice", { sources: ["cardmarket", "cardmarket"] }, check("market_reference_prices_sources_valid")],
      ["sources out of canonical order", { sources: ["tcgplayer", "cardrush"] }, check("market_reference_prices_sources_valid")],
      ["a count that is not the list", { source_count: 3 }, check("market_reference_prices_source_count")],
      ["high confidence from two sources", { confidence: "high" }, check("market_reference_prices_high_needs_three")],
      ["an unknown confidence", { confidence: "certain" }, { code: "23514" }],
      ["a full-precision amount", { amount: "12.345" }, check("market_reference_prices_three_figures")],
      ["non-canonical text", { amount: "12.30" }, check("market_reference_prices_three_figures")],
      ["a negative amount", { amount: "-12.3" }, check("market_reference_prices_amount_positive")],
      ["NaN", { amount: "NaN" }, check("market_reference_prices_three_figures")],
      ["a non-GBP currency", { currency: "EUR" }, check("market_reference_prices_gbp")],
      ["a method version not its run's", { method_version: "ctcg.market-derived/v2" }, { code: "23503" }],
      ["a date not its run's", { as_of: "2026-10-31" }, { code: "23503" }],
    ])("refuses %s", async (_label, fields, expected) => {
      await tx(async client => {
        const run = await insertRun(client, "2026-11-01");
        expect(await refuseInsert(client, "market_reference_prices", reference(run, fields))).toMatchObject(expected);
      });
    });

    it.each([["cardmarket", "cardrush"], ["cardmarket", "tcgplayer"]])("refuses %s and %s: the exported Cardmarket value would give the other back", async (...sources) => {
      expect(referenceSourcesAllowed(sources, EXPORTABLE_DERIVATION_SOURCES)).toBe(false);
      await tx(async client => {
        const run = await insertRun(client, "2026-11-01");
        expect(await refuseInsert(client, "market_reference_prices", reference(run, { sources }))).toMatchObject(check("market_reference_prices_unexported_sources"));
        // Cardmarket on top of both display-only sources is a reference.
        await insert(client, "market_reference_prices", reference(run, { sources: ["cardmarket", "cardrush", "tcgplayer"], source_count: 3 }));
      });
    });

    it("refuses a source the run recorded no evidence for, Scryfall included", async () => {
      await tx(async client => {
        const run = await insertRun(client, "2026-11-01", { input_evidence: evidence, fx: { EUR: quote("1.1534", "2026-11-01"), JPY: quote("196.12", "2026-11-01") } });
        for (const sources of [["cardrush", "tcgplayer"], ["cardrush", "scryfall"]]) {
          expect((await refuseInsert(client, "market_reference_prices", reference(run, { sources }))).message).toMatch(/from sources it recorded/);
        }
      });
    });

    it.each<[string, Row, object]>([
      ["a 9-constituent index", { constituents: 9 }, check("market_indices_min_constituents")],
      ["a source other than its market", { sources: ["cardrush"] }, check("market_indices_sources_market")],
      ["a base day not at 100", { level: "101" }, check("market_indices_base_level")],
      ["a chain from a level never published", { level: "101", previous_as_of: "2026-10-20" }, { code: "23503" }],
      ["a market that is not a derivation source", { market: "scryfall", sources: ["scryfall"] }, { code: "P0001" }],
    ])("refuses %s", async (_label, fields, expected) => {
      await tx(async client => {
        const run = await insertRun(client, "2026-11-01");
        expect(await refuseInsert(client, "market_indices", indexPoint(run, fields))).toMatchObject(expected);
      });
    });

    it("never restarts a series at 100, whatever the date; another series or method version starts its own", async () => {
      await tx(async client => {
        const run = await insertRun(client, "2026-11-02");
        for (const restart of [indexPoint(run), indexPoint(run, { set_code: null })]) {
          expect(await refuseInsert(client, "market_indices", restart)).toMatchObject({ code: "23505", constraint: "market_indices_one_base" });
        }
        // The series continues instead, chained from its latest published level.
        await insert(client, "market_indices", indexPoint(run, { level: "35", previous_as_of: "2026-10-28" }));
        await insert(client, "market_indices", indexPoint(run, { set_code: "op02" }));
        const v2 = await insertRun(client, "2026-11-02", { method_version: "ctcg.market-derived/v2" });
        await insert(client, "market_indices", { ...indexPoint(v2), method_version: "ctcg.market-derived/v2" });
      });
      await tx(async client => {
        // A base dated before the series began is a restart too.
        const earlier = await insertRun(client, "2026-10-20");
        expect(await refuseInsert(client, "market_indices", indexPoint(earlier))).toMatchObject({ code: "23505", constraint: "market_indices_one_base" });
      });
    });

    it("refuses an index level beyond six decimal places", async () => {
      await tx(async client => {
        const run = await insertRun(client, "2026-11-01");
        const error = await refuseInsert(client, "market_indices", indexPoint(run, { level: "33.3333333", previous_as_of: "2026-10-28" }));
        expect(error).toMatchObject(check("market_indices_level_scale"));
      });
    });

    it.each<[string, Row, object]>([
      ["a 9-SKU premium", { sku_count: 9 }, check("market_premiums_min_skus")],
      ["a market against itself", { market: "cardrush", base_market: "cardrush" }, check("market_premiums_distinct_markets")],
      ["sources that are not the pair", { sources: ["cardrush", "tcgplayer"] }, check("market_premiums_sources_markets")],
      ["quartiles out of order", { ratio_p25: "1.3" }, check("market_premiums_ratios_ordered")],
      ["a full-precision ratio", { ratio_median: "1.234" }, check("market_premiums_three_figures")],
      ["a zero ratio", { ratio_p25: "0" }, check("market_premiums_ratios_positive")],
      ["no language basis for a side", { market_languages: [] }, check("market_premiums_market_languages_valid")],
      ["a language that is not ISO 639-1", { market_languages: ["jpn"] }, check("market_premiums_market_languages_valid")],
      ["languages out of canonical order", { base_languages: ["en", "*"] }, check("market_premiums_base_languages_valid")],
      ["one language listed twice", { base_languages: ["en", "en"] }, check("market_premiums_base_languages_valid")],
      ["a null language", { base_languages: ["*", null] }, check("market_premiums_base_languages_valid")],
    ])("refuses %s", async (_label, fields, expected) => {
      await tx(async client => {
        const run = await insertRun(client, "2026-11-01", { input_evidence: { ...evidence, tcgplayer: "tcgplayer/2026-10-28.1" }, fx: { EUR: quote("1.15", "2026-11-01"), JPY: quote("196", "2026-11-01"), USD: quote("1.3", "2026-11-01") } });
        expect(await refuseInsert(client, "market_premiums", premium(run, fields))).toMatchObject(expected);
      });
    });

    it.each<[string, Row, object]>([
      ["a fallback FX rate", { fx: { EUR: { ...quote("1.17", "2026-11-01"), source: "fallback" }, JPY: quote("196", "2026-11-01") } }, check("market_derivation_runs_fx_record")],
      ["a numeric FX rate", { fx: { EUR: { ...quote("1.17", "2026-11-01"), rate: 1.17 }, JPY: quote("196", "2026-11-01") } }, check("market_derivation_runs_fx_record")],
      ["an FX rate dated after the run", { fx: { EUR: quote("1.17", "2026-11-02"), JPY: quote("196", "2026-11-01") } }, check("market_derivation_runs_fx_record")],
      ["an FX rate eight days old", { fx: { EUR: quote("1.17", "2026-10-24"), JPY: quote("196", "2026-11-01") } }, check("market_derivation_runs_fx_record")],
      ["a source without its currency's rate", { fx: { EUR: quote("1.17", "2026-11-01") } }, check("market_derivation_runs_fx_covers_inputs")],
      ["Scryfall as an input", { input_evidence: { cardmarket: evidence.cardmarket, scryfall: "member-prices/2026-09-07.1" } }, check("market_derivation_runs_input_evidence_check")],
      ["no inputs", { input_evidence: {} }, check("market_derivation_runs_input_evidence_check")],
      ["an unversioned method", { method_version: "ctcg.market-derived" }, check("market_derivation_runs_method_version_check")],
      ["a forged writer transaction", { writer_transaction: 1 }, { code: "P0001" }],
    ])("refuses a run with %s", async (_label, fields, expected) => {
      await tx(async client => {
        expect(await refuseInsert(client, "market_derivation_runs", {
          method_version: METHOD, as_of: "2026-11-01", input_batch_ceiling: 0, input_evidence: evidence,
          fx: { EUR: quote("1.17", "2026-11-01"), JPY: quote("196", "2026-11-01") }, ...fields,
        })).toMatchObject(expected);
      });
    });

    it("keeps a run closed once committed, one per date and method", async () => {
      const committed = (await pool.query("SELECT id::text FROM market_derivation_runs WHERE as_of = '2026-10-27'")).rows[0].id as string;
      await tx(async client => {
        const late = await refuseInsert(client, "market_reference_prices", reference({ id: committed, asOf: "2026-10-27" }, { sku: "op-op01-002-en" }));
        expect(late.message).toMatch(/own uncommitted run/);
        expect(await refuseInsert(client, "market_derivation_runs", {
          method_version: METHOD, as_of: "2026-10-27", input_batch_ceiling: 9, input_evidence: evidence,
          fx: { EUR: quote("1.17", "2026-10-27"), JPY: quote("196", "2026-10-27") },
        })).toMatchObject({ code: "23505" });
      });
    });

    it.each(["market_derivation_runs", "market_reference_prices", "market_indices", "market_premiums"])("refuses UPDATE, DELETE and TRUNCATE on %s", async table => {
      // Row triggers never fire on TRUNCATE, so each table has its own
      // statement guard; CASCADE alone could be refused by a dependant's.
      const truncateGuards = await pool.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = $1::regclass AND (tgtype & 32) <> 0", [table]);
      expect(truncateGuards.rows[0].n).toBe(1);
      await tx(async client => {
        for (const sql of [`UPDATE ${table} SET as_of = as_of`, `DELETE FROM ${table}`, `TRUNCATE ${table} CASCADE`]) {
          expect((await refusal(client, sql)).message).toMatch(/append-only/);
        }
      });
      expect((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n).toBeGreaterThan(0);
    });
  });

  describe("0142 data_api_plans", () => {
    it("records a test-mode subscription and applies each Stripe event once", async () => {
      await tx(async client => {
        const row = await subscription(client);
        expect(row).toMatchObject({ environment: "test", plan_id: "pro", status: "active", cancel_at_period_end: false });
        const again = await client.query(`INSERT INTO data_api_stripe_events (stripe_event_id, environment, event_type, livemode, provider_created_at, outcome, outcome_code)
          VALUES ($1, 'test', 'customer.subscription.updated', false, now(), 'applied', 'subscription_synced') ON CONFLICT (stripe_event_id) DO NOTHING`, [row.last_stripe_event_id]);
        expect(again.rowCount).toBe(0);
        for (const status of ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]) {
          await client.query("UPDATE data_api_subscriptions SET status = $1 WHERE id = $2", [status, row.id]);
        }
        // A later subscription reuses the account's one customer.
        await insert(client, "data_api_subscriptions", { ...row, id: randomUUID(), plan_id: "business", stripe_subscription_id: id("sub") });
        const held = await client.query("SELECT count(DISTINCT stripe_customer_id)::int AS customers, count(*)::int AS subscriptions FROM data_api_subscriptions WHERE user_id = $1", [users.owner]);
        expect(held.rows[0]).toEqual({ customers: 1, subscriptions: 2 });
      });
    });

    it("refuses live-mode events and duplicate event ids", async () => {
      await tx(async client => {
        const known = await event(client);
        const base = { stripe_event_id: id("evt"), environment: "test", event_type: "invoice.payment_failed", livemode: false, provider_created_at: "2026-10-28T06:00:00Z", outcome: "ignored", outcome_code: "not_data_api_object" };
        expect(await refuseInsert(client, "data_api_stripe_events", { ...base, livemode: true })).toMatchObject(check("data_api_stripe_events_livemode_check"));
        expect(await refuseInsert(client, "data_api_stripe_events", { ...base, environment: "live" })).toMatchObject(check("data_api_stripe_events_environment_check"));
        expect(await refuseInsert(client, "data_api_stripe_events", { ...base, stripe_event_id: known })).toMatchObject({ code: "23505" });
        // An outcome is applied or ignored, with a slug for why; never provider text.
        expect(await refuseInsert(client, "data_api_stripe_events", { ...base, outcome: "processing" })).toMatchObject(check("data_api_stripe_events_outcome_check"));
        expect(await refuseInsert(client, "data_api_stripe_events", { ...base, outcome_code: "No such customer: 'cus_x'" })).toMatchObject(check("data_api_stripe_events_outcome_code_check"));
      });
    });

    it.each<[string, Row, object]>([
      ["a live-environment subscription", { environment: "live" }, check("data_api_subscriptions_environment_check")],
      ["the free plan as a subscription", { plan_id: "free" }, check("data_api_subscriptions_plan_id_check")],
      ["an unknown plan", { plan_id: "enterprise" }, check("data_api_subscriptions_plan_id_check")],
      ["a status Stripe never sends", { status: "cancelled" }, check("data_api_subscriptions_status_check")],
      ["a customer the account does not hold", { stripe_customer_id: "cus_notacustomer0" }, { code: "23503", constraint: "data_api_subscriptions_user_id_stripe_customer_id_fkey" }],
      ["a malformed subscription id", { stripe_subscription_id: "sub_test-1" }, check("data_api_subscriptions_stripe_subscription_id_check")],
      ["an event never received", { last_stripe_event_id: "evt_neverreceived0" }, { code: "23503" }],
    ])("refuses %s", async (_label, fields, expected) => {
      await tx(async client => {
        const row = { environment: "test", user_id: users.owner, plan_id: "pro", status: "active", stripe_customer_id: await customer(client, users.owner),
          stripe_subscription_id: id("sub"), last_stripe_event_id: await event(client), provider_updated_at: "2026-10-28T06:00:00Z", ...fields };
        expect(await refuseInsert(client, "data_api_subscriptions", row)).toMatchObject(expected);
      });
    });

    it("keeps one Stripe customer per account, never shared, and one row per subscription", async () => {
      await tx(async client => {
        const first = await subscription(client);
        const owned = String(first.stripe_customer_id);
        const base = { environment: "test", stripe_customer_id: id("cus") };
        expect(await refuseInsert(client, "data_api_customers", { ...base, user_id: users.owner })).toMatchObject({ code: "23505", constraint: "data_api_customers_pkey" });
        expect(await refuseInsert(client, "data_api_customers", { ...base, user_id: users.other, stripe_customer_id: owned }))
          .toMatchObject({ code: "23505", constraint: "data_api_customers_stripe_customer_id_key" });
        expect(await refuseInsert(client, "data_api_customers", { ...base, user_id: users.other, environment: "live" })).toMatchObject(check("data_api_customers_environment_check"));
        expect(await refuseInsert(client, "data_api_customers", { ...base, user_id: users.other, stripe_customer_id: "cus_1" })).toMatchObject(check("data_api_customers_stripe_customer_id_check"));
        const other = await customer(client, users.other);
        const next = { environment: "test", user_id: users.other, plan_id: "pro", status: "active", last_stripe_event_id: first.last_stripe_event_id, provider_updated_at: "2026-10-28T06:00:00Z" };
        // Another account's customer cannot carry this account's subscription.
        expect(await refuseInsert(client, "data_api_subscriptions", { ...next, stripe_customer_id: owned, stripe_subscription_id: id("sub") }))
          .toMatchObject({ code: "23503", constraint: "data_api_subscriptions_user_id_stripe_customer_id_fkey" });
        expect(await refuseInsert(client, "data_api_subscriptions", { ...next, stripe_customer_id: other, stripe_subscription_id: first.stripe_subscription_id }))
          .toMatchObject({ code: "23505", constraint: "data_api_subscriptions_stripe_subscription_id_key" });
        await insert(client, "data_api_subscriptions", { ...next, stripe_customer_id: other, stripe_subscription_id: id("sub") });
      });
    });

    it("holds account erasure until Stripe reports the subscription ended, then cascades", async () => {
      const row = await tx(client => subscription(client, { user_id: users.leaving }), "COMMIT");
      await tx(client => client.query("INSERT INTO data_api_usage_months (user_id, month, request_count) VALUES ($1, '2026-10-01', 7)", [users.leaving]), "COMMIT");
      await expect(pool.query("DELETE FROM users WHERE id = $1", [users.leaving])).rejects.toMatchObject({ code: "23503", message: expect.stringMatching(/before Stripe reports it ended/) });
      // Removing the customer row directly meets the same guard.
      await expect(pool.query("DELETE FROM data_api_customers WHERE user_id = $1", [users.leaving])).rejects.toMatchObject({ code: "23503", message: expect.stringMatching(/before Stripe reports it ended/) });
      await pool.query("UPDATE data_api_subscriptions SET status = 'canceled', updated_at = now() WHERE id = $1", [row.id]);
      await pool.query("DELETE FROM users WHERE id = $1", [users.leaving]);
      for (const table of ["data_api_customers", "data_api_subscriptions", "data_api_usage_months"]) {
        expect((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [users.leaving])).rows[0].n).toBe(0);
      }
    });

    it("counts usage per account and month only", async () => {
      await tx(async client => {
        await insert(client, "data_api_usage_months", { user_id: users.owner, month: "2026-10-01", request_count: 0 });
        await client.query("UPDATE data_api_usage_months SET request_count = request_count + 1 WHERE user_id = $1 AND month = '2026-10-01'", [users.owner]);
        expect(await refuseInsert(client, "data_api_usage_months", { user_id: users.owner, month: "2026-10-15", request_count: 1 })).toMatchObject(check("data_api_usage_months_month_check"));
        expect(await refuseInsert(client, "data_api_usage_months", { user_id: users.other, month: "2026-11-01", request_count: -1 })).toMatchObject(check("data_api_usage_months_request_count_check"));
        expect(await refuseInsert(client, "data_api_usage_months", { user_id: users.owner, month: "2026-10-01", request_count: 1 })).toMatchObject({ code: "23505" });
      });
      // Metering keeps no paths, queries, IP addresses or read history: the column sets are the promise.
      const columns = await pool.query(`SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns
        FROM information_schema.columns WHERE table_schema = $1
          AND table_name IN ('data_api_usage_months', 'data_api_rate_buckets', 'member_data_rate_buckets', 'data_api_stripe_events', 'data_api_customers')
        GROUP BY table_name ORDER BY table_name`, [schema]);
      expect(columns.rows).toEqual([
        { table_name: "data_api_customers", columns: ["user_id", "stripe_customer_id", "environment", "created_at"] },
        { table_name: "data_api_rate_buckets", columns: ["key_id", "bucket_minute", "request_count"] },
        { table_name: "data_api_stripe_events", columns: ["stripe_event_id", "environment", "event_type", "livemode", "provider_created_at", "outcome", "outcome_code", "received_at"] },
        { table_name: "data_api_usage_months", columns: ["user_id", "month", "request_count"] },
        { table_name: "member_data_rate_buckets", columns: ["key_id", "bucket_minute", "request_count"] },
      ]);
    });

    it("keeps paid minute counts apart, so the free route's saturation can never lower one", async () => {
      const definition = (table: string) => pool.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = $1::regclass AND conname = $2`, [table, `${table}_request_count_check`]);
      // 0142 leaves the free buckets exactly as 0138 made them.
      expect((await definition("member_data_rate_buckets")).rows).toEqual([{ def: "CHECK (((request_count >= 1) AND (request_count <= 31)))" }]);
      expect((await definition("data_api_rate_buckets")).rows).toEqual([{ def: "CHECK (((request_count >= 1) AND (request_count <= 100001)))" }]);
      const cleanup = await pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'data_api_rate_buckets_cleanup'", [schema]);
      expect(cleanup.rows[0].indexdef).toMatch(/\(bucket_minute\)$/);
      await tx(async client => {
        const key = await insert(client, "member_data_keys", { user_id: users.owner, key_hash: "a".repeat(64), key_prefix: "ctcg_member_aaaaaaa", name: "integration" });
        const keyId = key.rows[0].id;
        const minute = "2026-10-28T06:00:00Z";
        await insert(client, "data_api_rate_buckets", { key_id: keyId, bucket_minute: minute, request_count: 500 });
        // The free member-prices route's saturating upsert (member-keys.ts), run past its cap.
        for (let i = 0; i < 40; i++) {
          await client.query(`INSERT INTO member_data_rate_buckets (key_id, bucket_minute, request_count) VALUES ($1, $2, 1)
            ON CONFLICT (key_id, bucket_minute) DO UPDATE SET request_count = LEAST(member_data_rate_buckets.request_count + 1, 31)`, [keyId, minute]);
        }
        const counts = await client.query(`SELECT (SELECT request_count FROM member_data_rate_buckets WHERE key_id = $1 AND bucket_minute = $2) AS free,
          (SELECT request_count FROM data_api_rate_buckets WHERE key_id = $1 AND bucket_minute = $2) AS paid`, [keyId, minute]);
        expect(counts.rows[0]).toEqual({ free: 31, paid: 500 });
        await insert(client, "data_api_rate_buckets", { key_id: keyId, bucket_minute: "2026-10-28T06:01:00Z", request_count: 100001 });
        for (const count of [100002, 0]) {
          expect(await refuseInsert(client, "data_api_rate_buckets", { key_id: keyId, bucket_minute: "2026-10-28T06:02:00Z", request_count: count }))
            .toMatchObject(check("data_api_rate_buckets_request_count_check"));
        }
        await client.query("DELETE FROM member_data_keys WHERE id = $1", [keyId]);
        expect((await client.query("SELECT count(*)::int AS n FROM data_api_rate_buckets WHERE key_id = $1", [keyId])).rows[0].n).toBe(0);
      });
    });
  });
});
