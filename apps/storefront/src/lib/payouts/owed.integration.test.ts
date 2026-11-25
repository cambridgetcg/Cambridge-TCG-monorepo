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
  viewer: "",
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
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: state.viewer } }) }));
vi.mock("@/lib/payouts/stripe-connect", () => ({ createTransferToSeller: state.transfer }));
vi.mock("@/lib/market/email", () => ({ sendPayoutEmail: async () => {}, sendStatusEmail: async () => {} }));
vi.mock("@/lib/notifications/db", () => ({ notify: async () => {} }));
vi.mock("@/lib/social/db", () => ({ postActivity: async () => {}, awardAchievement: async () => {} }));
vi.mock("@/lib/auction/lifecycle-log", () => ({ logAuctionTransition: async () => {} }));
vi.mock("@/lib/escrow/trust-engine", () => ({ calculateTrustScore: async () => 0 }));
vi.mock("@/lib/admin/governance-log", () => ({ logAdminAction: async () => {} }));
vi.mock("@/lib/trust/state", () => ({ loadUserTrustState: async () => null }));

import { GET as outstanding } from "@/app/api/admin/payouts/outstanding/route";
import { GET as allTrades } from "@/app/api/market/trades/route";
import { GET as oneTrade } from "@/app/api/market/trades/[id]/route";
import { recordAuctionPayout } from "@/lib/auction/db";
import { recordTradePayout } from "@/lib/market/db";
import { loadTraderDashboard } from "@/lib/market/trader-dashboard";
import { getPendingPayouts } from "./aggregation";
import { owedTradeSql } from "./owed";
import { runPayoutSweep } from "./sweep";

const target = process.env.PAYOUTS_TEST_DATABASE_URL;
const schema = `payouts_test_${randomUUID().replaceAll("-", "")}`;
const BUYER = randomUUID(), SELLER = randomUUID(), OTHER = randomUUID(), BID = randomUUID(), ASK = randomUUID();
let admin: Pool, pool: Pool, compat: ReturnType<typeof createCompatDb> | null = null;

/** One trade per status and combination; its sku says which. */
async function seedTrades() {
  await pool.query(
    `INSERT INTO market_trades (bid_order_id, ask_order_id, buyer_id, seller_id, sku, price, commission_amount, seller_payout,
                                escrow_status, buyer_paid_at, completed_at, seller_paid_at, payout_hold_days)
     SELECT $1, $2, $3, $4,
            concat_ws(' ', st, CASE WHEN bp THEN 'paid' ELSE 'unpaid' END, CASE WHEN c THEN 'stamped' ELSE 'unstamped' END, CASE WHEN sp THEN 'sent' ELSE 'unsent' END),
            12, 1.5, 10.5, st,
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
            st, CASE WHEN po THEN 45.25 END, CASE WHEN pa THEN NOW() - interval '10 days' END,
            CASE WHEN sp THEN NOW() - interval '1 day' END, 50, 10, NOW() - interval '30 days', NOW() - interval '20 days'
       FROM unnest(enum_range(NULL::auction_status)) st, unnest(ARRAY[true,false]) pa, unnest(ARRAY[true,false]) po,
            unnest(ARRAY[true,false]) sp, unnest(ARRAY[true,false]) has_seller`,
    [SELLER],
  );
}
/** Owed, but not to be swept yet: still held, or the seller has no Connect account. */
async function seedOthers() {
  await pool.query(
    `INSERT INTO market_trades (bid_order_id, ask_order_id, buyer_id, seller_id, sku, price, commission_amount, seller_payout,
                                escrow_status, buyer_paid_at, completed_at, payout_hold_days)
     VALUES ($1, $2, $3, $4, 'held trade', 3, 1, 2, 'completed', NOW() - interval '20 days', NOW() - interval '4 days', 5),
            ($1, $2, $3, $5, 'other trade', 300, 100, 200, 'completed', NOW() - interval '20 days', NOW() - interval '10 days', 5)`,
    [BID, ASK, BUYER, SELLER, OTHER],
  );
  await pool.query(
    `INSERT INTO auctions (seller_user_id, title, status, seller_payout, paid_at, current_price, starting_price, starts_at, ends_at)
     VALUES ($1, 'held auction', 'paid', 4, NOW() - interval '2 days', 5, 1, NOW() - interval '30 days', NOW() - interval '20 days'),
            ($2, 'other auction', 'paid', 400, NOW() - interval '10 days', 500, 1, NOW() - interval '30 days', NOW() - interval '20 days')`,
    [SELLER, OTHER],
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
const METHODS = ["bank_transfer", "paypal", "crypto", "stripe_connect", "store_credit", "other"];

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
    await pool.query("ALTER TABLE users ADD COLUMN username VARCHAR(30) UNIQUE"); // as 0020 does, which needs more tables
    url.searchParams.set("search_path", schema);
    compat = createCompatDb({ url: url.toString(), ssl: false, max: 4 });
    await pool.query(`INSERT INTO users (id, email) VALUES ($1, 'buyer@test.invalid'), ($2, 'seller@test.invalid'), ($3, 'other@test.invalid')`, [BUYER, SELLER, OTHER]);
    await pool.query(`UPDATE users SET stripe_connect_account_id = 'acct_test', stripe_connect_payouts_enabled = true WHERE id = $1`, [SELLER]);
    await pool.query(`INSERT INTO market_orders (id, user_id, side, sku, price) VALUES ($1, $2, 'bid', 'X', 10), ($3, $4, 'ask', 'X', 10)`, [BID, BUYER, ASK, SELLER]);
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
      await seedOthers();
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
      const rows = body.rows as { kind: string; id: string; label: string; dueNow: boolean; seller_email: string }[];
      expect(rows.map((r) => [r.kind, r.id, r.label, r.dueNow, r.seller_email]).sort()).toEqual([
        ["trade", await tradeId(OWED_TRADE), OWED_TRADE, true, "seller@test.invalid"],
        ["auction", await auctionId(OWED_AUCTION), OWED_AUCTION, true, "seller@test.invalid"],
        ["trade", await tradeId("held trade"), "held trade", false, "seller@test.invalid"],
        ["auction", await auctionId("held auction"), "held auction", false, "seller@test.invalid"],
        ["trade", await tradeId("other trade"), "other trade", true, "other@test.invalid"],
        ["auction", await auctionId("other auction"), "other auction", true, "other@test.invalid"],
      ].sort());
      expect(body.totalOwedGbp).toBe(55.75 + 6 + 600);
      expect(body.overdueCount).toBe(4);
      expect(body.completedNotOwedCount).toBe(3); // unpaid stamped, unpaid unstamped, paid unstamped
    });

    it("the seller's page shows exactly the owed rows", async () => {
      const pending = await getPendingPayouts(SELLER);
      expect(pending.trades.map((t) => [t.id, t.label, t.isReady])).toEqual(
        [[await tradeId(OWED_TRADE), OWED_TRADE, true], [await tradeId("held trade"), "held trade", false]]);
      expect(pending.auctions.map((a) => [a.id, a.label, a.isReady])).toEqual(
        [[await auctionId(OWED_AUCTION), OWED_AUCTION, true], [await auctionId("held auction"), "held auction", false]]);
      expect(pending).toMatchObject({ totalOwed: 61.75, readyTotal: 55.75, holdingTotal: 6 });
    });

    it("the trade page and the admin's market page are given the buyer's payment", async () => {
      state.viewer = SELLER;
      const all = (await (await allTrades(new Request("https://example.test/api/market/trades?admin=true"))).json()).trades as { sku: string; buyer_paid_at: string | null }[];
      for (const [sku, paid] of [[OWED_TRADE, true], [UNPAID_TRADE, false]] as const) {
        expect(all.find((t) => t.sku === sku)!.buyer_paid_at !== null, sku).toBe(paid);
        const one = await oneTrade(new Request("https://example.test/"), { params: Promise.resolve({ id: await tradeId(sku) }) });
        const stamp = (await one.json()).trade.buyer_paid_at;
        if (paid) expect(Number.isNaN(Date.parse(stamp)), sku).toBe(false); else expect(stamp, sku).toBeNull();
      }
    });

    it("the trader dashboard counts exactly the owed trades", async () => {
      const { exposure } = await loadTraderDashboard(SELLER);
      expect(exposure).toMatchObject({ pending_payout_count: 2, pending_payout_value: 12.5 });
    });

    it("the sweep pays exactly the owed rows that are due and payable, once, and leaves every other row untouched", async () => {
      const owedTrade = await tradeId(OWED_TRADE), owedAuction = await auctionId(OWED_AUCTION);
      const before = { trades: await payouts("market_trades"), auctions: await payouts("auctions") };
      expect(await runPayoutSweep()).toMatchObject({ tradesPaid: 1, auctionsPaid: 1, tradeFailures: [], auctionFailures: [] });
      expect(state.transfer.mock.calls.map(([o]) => [o.idempotencyKey, o.sellerUserId, o.amountGbp]).sort()).toEqual(
        [[`payout-trade-${owedTrade}`, SELLER, 10.5], [`payout-auction-${owedAuction}`, SELLER, 45.25]].sort());
      expect((await payouts("market_trades")).filter((r) => r.id !== owedTrade)).toEqual(before.trades.filter((r) => r.id !== owedTrade));
      expect((await payouts("auctions")).filter((r) => r.id !== owedAuction)).toEqual(before.auctions.filter((r) => r.id !== owedAuction));
      expect(await sent(owedTrade)).toMatchObject({ payout_method: "stripe_connect", stripe_transfer_id: `tr_payout-trade-${owedTrade}` });
      expect(await runPayoutSweep()).toMatchObject({ tradesPaid: 0, auctionsPaid: 0 });
    });

    it("recordTradePayout refuses every trade that is not owed, by any method, and changes nothing", async () => {
      const all = (await pool.query("SELECT id, sku FROM market_trades")).rows as { id: string; sku: string }[];
      const before = await payouts("market_trades");
      for (const method of METHODS) {
        for (const { id, sku } of all) {
          if ([OWED_TRADE, "held trade", "other trade"].includes(sku)) continue;
          expect(await recordTradePayout({ tradeId: id, method, reference: "R" }), sku).toMatchObject({ ok: false });
        }
      }
      expect(state.transfer).not.toHaveBeenCalled();
      expect(await payouts("market_trades")).toEqual(before);
      expect(await recordTradePayout({ tradeId: await tradeId(UNPAID_TRADE), method: "bank_transfer" })).toEqual({
        ok: false, error: "Cannot pay seller: no buyer payment is recorded for this trade.",
      });
      expect(await recordTradePayout({ tradeId: await tradeId("completed paid unstamped unsent"), method: "bank_transfer" })).toEqual({
        ok: false, error: "Cannot pay seller: no payout is owed for this trade.",
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
        expect(state.gate!.waiting).toBe(2); // both were held at the read
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
      for (const method of METHODS) {
        for (const { id, title } of all) {
          if ([OWED_AUCTION, "held auction", "other auction"].includes(title)) continue;
          expect(await recordAuctionPayout({ auctionId: id, method, reference: "R" }), title).toMatchObject({ ok: false });
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
