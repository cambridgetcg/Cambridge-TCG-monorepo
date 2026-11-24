import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  isAdmin: vi.fn(),
  recordTradePayout: vi.fn(),
  recordAuctionPayout: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/market/db", () => ({ recordTradePayout: mocks.recordTradePayout }));
vi.mock("@/lib/auction/db", () => ({ recordAuctionPayout: mocks.recordAuctionPayout }));
vi.mock("@/lib/trust/state", () => ({ loadUserTrustState: vi.fn(async () => null) }));

import { GET as outstanding } from "@/app/api/admin/payouts/outstanding/route";
import { loadTraderDashboard } from "@/lib/market/trader-dashboard";
import { getPendingPayouts } from "./aggregation";
import { completedButNotOwedTradeSql, owedAuctionSql, owedTradeSql } from "./owed";
import { runPayoutSweep } from "./sweep";

const flat = (sql: string) => sql.replace(/\s+/g, " ");
const sqls = () => mocks.query.mock.calls.map(([sql]) => flat(sql as string));
const reading = (table: string) => sqls().filter((sql) => sql.includes(`FROM ${table}`));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.isAdmin.mockResolvedValue(true);
});

describe("the rule", () => {
  it("a trade is owed only when completed, stamped, paid by the buyer and not paid out", () => {
    expect(flat(owedTradeSql("t"))).toBe(
      "(t.escrow_status = 'completed' AND t.completed_at IS NOT NULL AND t.buyer_paid_at IS NOT NULL AND t.seller_paid_at IS NULL)",
    );
    expect(owedTradeSql()).toBe(owedTradeSql("t"));
  });
  it("the operator's count is every other trade that is completed and not paid out", () => {
    expect(flat(completedButNotOwedTradeSql("t"))).toBe(
      `(t.escrow_status = 'completed' AND t.seller_paid_at IS NULL AND NOT ${flat(owedTradeSql("t"))})`,
    );
    expect(completedButNotOwedTradeSql()).toBe(completedButNotOwedTradeSql("t"));
  });
  it("an auction is owed only when paid, stamped, with a seller and a payout, and not paid out", () => {
    expect(flat(owedAuctionSql("a"))).toBe(
      "(a.status = 'paid' AND a.paid_at IS NOT NULL AND a.seller_user_id IS NOT NULL AND a.seller_payout IS NOT NULL AND a.seller_paid_at IS NULL)",
    );
    expect(owedAuctionSql()).toBe(owedAuctionSql("a"));
  });
  it("the empty alias names the same columns bare", () => {
    expect(owedTradeSql("")).toBe(owedTradeSql("t").replaceAll("t.", ""));
    expect(completedButNotOwedTradeSql("")).toBe(completedButNotOwedTradeSql("t").replaceAll("t.", ""));
    expect(owedAuctionSql("")).toBe(owedAuctionSql("a").replaceAll("a.", ""));
  });
  it("refuses an alias that is not a plain identifier", () => {
    for (const rule of [owedTradeSql, completedButNotOwedTradeSql, owedAuctionSql]) {
      for (const bad of ["t;", "t.x", "T", "1t", "t --", " "]) expect(() => rule(bad)).toThrow("invalid SQL alias");
    }
  });
});

describe("every reader uses the rule", () => {
  it("the sweep", async () => {
    await runPayoutSweep();
    expect(reading("market_trades t")[0]).toContain(`WHERE ${flat(owedTradeSql("t"))} AND t.completed_at + make_interval`);
    expect(reading("auctions a")[0]).toContain(`WHERE ${flat(owedAuctionSql("a"))} AND a.paid_at + make_interval`);
  });
  it("the admin outstanding list, and its count of what it leaves out", async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("COUNT(*)::int AS n") ? { rows: [{ n: 2 }] } : { rows: [] });
    const res = await outstanding();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [], totalOwedGbp: 0, overdueCount: 0, completedNotOwedCount: 2 });
    const trades = reading("market_trades t");
    expect(trades).toHaveLength(2);
    expect(trades[0].endsWith(`WHERE ${flat(owedTradeSql("t"))}`)).toBe(true);
    expect(trades[1].endsWith(`WHERE ${flat(completedButNotOwedTradeSql("t"))}`)).toBe(true);
    expect(reading("auctions a")[0].endsWith(`WHERE ${flat(owedAuctionSql("a"))}`)).toBe(true);
  });
  it("the list answers nobody but an admin", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect((await outstanding()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("the seller's page", async () => {
    await getPendingPayouts("u");
    expect(reading("market_trades t")[0]).toContain(`AND ${flat(owedTradeSql("t"))}`);
    expect(reading("auctions")[0]).toContain(`AND ${flat(owedAuctionSql(""))}`);
  });
  it("the trader dashboard's pending payout", async () => {
    await loadTraderDashboard("u");
    const pending = sqls().filter((sql) => sql.includes("INTERVAL '14 days'"));
    expect(pending).toHaveLength(1);
    expect(pending[0]).toContain(`AND ${flat(owedTradeSql(""))}`);
  });
});
