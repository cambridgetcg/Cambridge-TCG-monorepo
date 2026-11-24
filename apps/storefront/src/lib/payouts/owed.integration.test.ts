// Opt-in: PAYOUTS_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/<name containing "test">
// Real PostgreSQL and the real migrations: which completed trades and paid
// auctions are listed as owed, swept, shown to the seller, and payable, over
// every combination of the facts the rule reads. Each test runs through
// node-postgres and through postgres.js (@cambridge-tcg/db/compat), which
// production uses and which returns timestamps as text. No row is a person's.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createCompatDb } from "@cambridge-tcg/db/compat";

const state = vi.hoisted(() => ({
  run: null as null | ((sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>),
  transfer: vi.fn(),
  // When set, each gate read waits here until that many have been answered,
  // so two callers both pass the read before either writes.
  gate: null as null | { waiting: number; need: number; open: () => void; opened: Promise<void> },
}));
vi.mock("@/lib/db", () => ({
  query: async (sql: string, params?: unknown[]) => {
    const result = await state.run!(sql, params);
    if (state.gate && / AS owed\b/.test(sql)) {
      const gate = state.gate, turn = gate.waiting;
      gate.waiting += 1;
      if (gate.waiting >= gate.need) gate.open();
      await gate.opened;
      // Every caller now holds a stale read. Let them go one by one: two
      // dynamic imports of a mocked module at the same instant can load the
      // real one (Vitest 4.1).
      await new Promise((resolve) => setTimeout(resolve, turn * 40));
    }
    return result;
  },
  transaction: vi.fn(),
}));
function bothReadFirst(need: number) {
  let open = () => {};
  const opened = new Promise<void>((resolve) => { open = resolve; });
  state.gate = { waiting: 0, need, open, opened };
}
vi.mock("@/lib/admin/auth", () => ({ isAdmin: async () => true }));
vi.mock("@/lib/payouts/stripe-connect", () => ({ createTransferToSeller: state.transfer }));
vi.mock("@/lib/market/email", () => ({ sendPayoutEmail: async () => {}, sendStatusEmail: async () => {} }));
vi.mock("@/lib/notifications/db", () => ({ notify: async () => {} }));
vi.mock("@/lib/social/db", () => ({ postActivity: async () => {}, awardAchievement: async () => {} }));
vi.mock("@/lib/auction/lifecycle-log", () => ({ logAuctionTransition: async () => {} }));
vi.mock("@/lib/escrow/trust-engine", () => ({ calculateTrustScore: async () => 0 }));
vi.mock("@/lib/admin/governance-log", () => ({ logAdminAction: async () => {} }));
vi.mock("@/lib/trust/state", () => ({ loadUserTrustState: async () => null }));

import { GET as outstanding } from "@/app/api/admin/payouts/outstanding/route";
import { recordAuctionPayout } from "@/lib/auction/db";
import { recordTradePayout } from "@/lib/market/db";
import { loadTraderDashboard } from "@/lib/market/trader-dashboard";
import { getPendingPayouts } from "./aggregation";
import { owedTradeSql } from "./owed";
import { runPayoutSweep } from "./sweep";

const target = process.env.PAYOUTS_TEST_DATABASE_URL;
const schema = `payouts_test_${randomUUID().replaceAll("-", "")}`;
const BUYER = randomUUID(), SELLER = randomUUID(), BID = randomUUID(), ASK = randomUUID();
let admin: Pool, pool: Pool, compat: ReturnType<typeof createCompatDb> | null = null;

/** One trade per status and combination; its sku says which. */
async function seedTrades() {
  await pool.query(
    `INSERT INTO market_trades (bid_order_id, ask_order_id, buyer_id, seller_id, sku, price, commission_amount, seller_payout,
                                escrow_status, buyer_paid_at, completed_at, seller_paid_at, payout_hold_days)
     SELECT $1, $2, $3, $4,
            concat_ws(' ', st, CASE WHEN bp THEN 'paid' ELSE 'unpaid' END, CASE WHEN c THEN 'stamped' ELSE 'unstamped' END, CASE WHEN sp THEN 'sent' ELSE 'unsent' END),
            10, 0, 10, st,
            CASE WHEN bp THEN NOW() - interval '20 days' END, CASE WHEN c THEN NOW() - interval '10 days' END,
            CASE WHEN sp THEN NOW() - interval '1 day' END, 5
       FROM unnest(enum_range(NULL::trade_escrow_status)) st, unnest(ARRAY[true,false]) bp, unnest(ARRAY[true,false]) c, unnest(ARRAY[true,false]) sp`,
    [BID, ASK, BUYER, SELLER],
  );
}
async function seedAuctions() {
  await pool.query(
    `INSERT INTO auctions (seller_user_id, title, status, seller_payout, paid_at, seller_paid_at, current_price, starting_price, starts_at, ends_at)
     SELECT CASE WHEN has_seller THEN $1::uuid END,
            concat_ws(' ', st, CASE WHEN pa THEN 'paid' ELSE 'unpaid' END, CASE WHEN po THEN 'payout' ELSE 'nopayout' END,
                      CASE WHEN sp THEN 'sent' ELSE 'unsent' END, CASE WHEN has_seller THEN 'seller' ELSE 'house' END),
            st, CASE WHEN po THEN 45 END, CASE WHEN pa THEN NOW() - interval '10 days' END,
            CASE WHEN sp THEN NOW() - interval '1 day' END, 50, 10, NOW() - interval '30 days', NOW() - interval '20 days'
       FROM unnest(enum_range(NULL::auction_status)) st, unnest(ARRAY[true,false]) pa, unnest(ARRAY[true,false]) po,
            unnest(ARRAY[true,false]) sp, unnest(ARRAY[true,false]) has_seller`,
    [SELLER],
  );
}
const tradeId = async (sku: string) => (await pool.query("SELECT id FROM market_trades WHERE sku = $1", [sku])).rows[0].id as string;
const auctionId = async (title: string) => (await pool.query("SELECT id FROM auctions WHERE title = $1", [title])).rows[0].id as string;
const sent = async (id: string) => (await pool.query("SELECT seller_paid_at, payout_method, stripe_transfer_id FROM market_trades WHERE id = $1", [id])).rows[0];
/** What says a sale was paid out, for every trade or auction. */
const payouts = async (table: "market_trades" | "auctions") =>
  (await pool.query(`SELECT id, seller_paid_at, payout_method, payout_reference, stripe_transfer_id FROM ${table} ORDER BY id`)).rows as { id: string }[];

const OWED_TRADE = "completed paid stamped unsent";
const UNPAID_TRADE = "completed unpaid stamped unsent";
const OWED_AUCTION = "paid paid payout unsent seller";
const HAND_PAID_AUCTION = "paid unpaid payout unsent seller";

describe.skipIf(!target)("what is owed to sellers, on PostgreSQL (explicit loopback test database only)", () => {
  beforeAll(async () => {
    const url = new URL(target!);
    if (!["127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.includes("test") || url.search) {
      throw new Error("Explicit disposable local test database required");
    }
    admin = new Pool({ connectionString: target });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 4 });
    for (const name of ["0009_customer_auth", "0010_auctions", "0012_p2p_market", "0013_customer_auctions", "0019_escrow_trust",
      "0022_escrow_tiers", "0035_payout_tracking", "0036_stripe_connect"]) {
      await pool.query(await readFile(new URL(`../../../drizzle/${name}.sql`, import.meta.url), "utf8"));
    }
    url.searchParams.set("search_path", schema);
    compat = createCompatDb({ url: url.toString(), ssl: false, max: 4 });
    await pool.query(`INSERT INTO users (id, email) VALUES ($1, 'buyer@test.invalid'), ($2, 'seller@test.invalid')`, [BUYER, SELLER]);
    await pool.query(`UPDATE users SET stripe_connect_account_id = 'acct_test', stripe_connect_payouts_enabled = true WHERE id = $1`, [SELLER]);
    await pool.query(`INSERT INTO market_orders (id, user_id, side, sku, price) VALUES ($1, $2, 'bid', 'X', 10), ($3, $4, 'ask', 'X', 10)`, [BID, BUYER, ASK, SELLER]);
    // Loaded here so the two racing callers below find it ready.
    await import("@/lib/payouts/stripe-connect");
    await import("@/lib/market/email");
  });
  afterAll(async () => {
    state.run = null;
    if (compat) await compat.close();
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  describe.each(["node-postgres", "postgres.js"] as const)("through %s", (driver) => {
    beforeEach(async () => {
      state.run = driver === "postgres.js" ? compat!.query : (sql, params) => pool.query(sql, params);
      state.gate = null;
      await pool.query("TRUNCATE market_trades, auctions CASCADE");
      await seedTrades();
      await seedAuctions();
      state.transfer.mockReset();
      state.transfer.mockImplementation(async ({ idempotencyKey }: { idempotencyKey: string }) => ({ transferId: `tr_${idempotencyKey}` }));
    });

    it("answers the rule as a boolean, and a missing stamp as null", async () => {
      const read = async (sku: string) =>
        (await state.run!(`SELECT ${owedTradeSql("t")} AS owed, t.buyer_paid_at FROM market_trades t WHERE t.sku = $1`, [sku])).rows[0] as Record<string, unknown>;
      const paid = await read(OWED_TRADE);
      expect(paid.owed).toBe(true);
      if (driver === "postgres.js") expect(paid.buyer_paid_at).toMatch(/^\d{4}-\d\d-\d\d /);
      else expect(paid.buyer_paid_at).toBeInstanceOf(Date);
      expect(await read(UNPAID_TRADE)).toEqual({ owed: false, buyer_paid_at: null });
    });

    it("the admin list shows exactly the owed rows, and counts the completed ones it leaves out", async () => {
      const body = await (await outstanding()).json();
      expect(body.rows.map((r: { label: string }) => r.label).sort()).toEqual([OWED_TRADE, OWED_AUCTION].sort());
      expect(body.totalOwedGbp).toBe(55);
      expect(body.overdueCount).toBe(2);
      expect(body.completedNotOwedCount).toBe(3); // unpaid stamped, unpaid unstamped, paid unstamped
    });

    it("the seller's page shows exactly the owed rows", async () => {
      const pending = await getPendingPayouts(SELLER);
      expect(pending.trades.map((t) => t.label)).toEqual([OWED_TRADE]);
      expect(pending.auctions.map((a) => a.label)).toEqual([OWED_AUCTION]);
      expect(pending.totalOwed).toBe(55);
    });

    it("the trader dashboard counts exactly the owed trade", async () => {
      const { exposure } = await loadTraderDashboard(SELLER);
      expect(exposure).toMatchObject({ pending_payout_count: 1, pending_payout_value: 10 });
    });

    it("the sweep pays exactly the owed rows, once, and leaves every other row untouched", async () => {
      const owedTrade = await tradeId(OWED_TRADE), owedAuction = await auctionId(OWED_AUCTION);
      const before = { trades: await payouts("market_trades"), auctions: await payouts("auctions") };
      expect(await runPayoutSweep()).toMatchObject({ tradesPaid: 1, auctionsPaid: 1, tradeFailures: [], auctionFailures: [] });
      expect(state.transfer.mock.calls.map(([o]) => o.idempotencyKey).sort()).toEqual(
        [`payout-trade-${owedTrade}`, `payout-auction-${owedAuction}`].sort());
      expect((await payouts("market_trades")).filter((r) => r.id !== owedTrade)).toEqual(before.trades.filter((r) => r.id !== owedTrade));
      expect((await payouts("auctions")).filter((r) => r.id !== owedAuction)).toEqual(before.auctions.filter((r) => r.id !== owedAuction));
      expect(await sent(owedTrade)).toMatchObject({ payout_method: "stripe_connect", stripe_transfer_id: `tr_payout-trade-${owedTrade}` });
      expect(await runPayoutSweep()).toMatchObject({ tradesPaid: 0, auctionsPaid: 0 });
    });

    it("recordTradePayout refuses every trade that is not owed, by any method, and changes nothing", async () => {
      const all = (await pool.query("SELECT id, sku FROM market_trades")).rows as { id: string; sku: string }[];
      const before = await payouts("market_trades");
      for (const method of ["stripe_connect", "bank_transfer"]) {
        for (const { id, sku } of all) {
          if (sku === OWED_TRADE) continue;
          expect(await recordTradePayout({ tradeId: id, method }), sku).toMatchObject({ ok: false });
        }
      }
      expect(state.transfer).not.toHaveBeenCalled();
      expect(await payouts("market_trades")).toEqual(before);
      expect(await recordTradePayout({ tradeId: await tradeId(UNPAID_TRADE), method: "bank_transfer" })).toEqual({
        ok: false, error: "Cannot pay seller: no buyer payment is recorded for this trade.",
      });
      expect(await recordTradePayout({ tradeId: await tradeId(OWED_TRADE), method: "bank_transfer" })).toMatchObject({ ok: true });
    });

    it("of two callers that both read an owed trade before either writes, one records the payout", async () => {
      const id = await tradeId(OWED_TRADE);
      for (const [first, second] of [["bank_transfer", "paypal"], ["stripe_connect", "stripe_connect"]] as const) {
        await pool.query("UPDATE market_trades SET seller_paid_at = NULL, payout_method = NULL, stripe_transfer_id = NULL WHERE id = $1", [id]);
        bothReadFirst(2);
        const results = await Promise.all([
          recordTradePayout({ tradeId: id, method: first, reference: "A" }),
          recordTradePayout({ tradeId: id, method: second, reference: "B" }),
        ]);
        state.gate = null;
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Payout already recorded for this trade." });
      }
      // Both Connect calls used one key, so Stripe makes one transfer.
      expect(new Set(state.transfer.mock.calls.map(([o]) => o.idempotencyKey))).toEqual(new Set([`payout-trade-${id}`]));
    });

    it("recordAuctionPayout refuses every auction that is not owed, by any method, and changes nothing", async () => {
      const all = (await pool.query("SELECT id, title FROM auctions")).rows as { id: string; title: string }[];
      const before = await payouts("auctions");
      for (const method of ["stripe_connect", "bank_transfer"]) {
        for (const { id, title } of all) {
          if (title === OWED_AUCTION) continue;
          expect(await recordAuctionPayout({ auctionId: id, method }), title).toMatchObject({ ok: false });
        }
      }
      expect(state.transfer).not.toHaveBeenCalled();
      expect(await payouts("auctions")).toEqual(before);
      expect(await recordAuctionPayout({ auctionId: await auctionId(HAND_PAID_AUCTION), method: "stripe_connect" })).toEqual({
        ok: false, error: "Cannot pay seller: no winner payment is recorded for this auction.",
      });
      expect(await recordAuctionPayout({ auctionId: await auctionId(OWED_AUCTION), method: "bank_transfer" })).toMatchObject({ ok: true });
    });
  });
});
