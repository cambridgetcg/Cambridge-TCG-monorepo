import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { query, transaction } from "@/lib/db";
import { runMarketMaintenance } from "./db";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@cambridge-tcg/pricing", () => ({
  resolveCommission: vi.fn(),
  computeCommissionAmount: vi.fn(),
}));
vi.mock("@/lib/social/db", () => ({ postActivity: vi.fn(), awardAchievement: vi.fn() }));
vi.mock("@/lib/escrow/service-tiers", () => ({ routeTrade: vi.fn() }));
vi.mock("./email", () => ({
  sendBuyerMatchEmail: vi.fn(),
  sendSellerMatchEmail: vi.fn(),
  sendCancelEmail: vi.fn(),
}));
vi.mock("@/lib/format", () => ({ formatPrice: vi.fn((value: number) => String(value)) }));
vi.mock("@/lib/notifications/db", () => ({ notify: vi.fn() }));

const txQuery = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(transaction).mockImplementation(async (callback) => callback(txQuery));
});

describe("market payment-expiry write guard", () => {
  it("rechecks blocking attempts in the cancelling UPDATE after candidate selection", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          id: "11111111-1111-4111-8111-111111111111",
          bid_order_id: "22222222-2222-4222-8222-222222222222",
          ask_order_id: "33333333-3333-4333-8333-333333333333",
          quantity: 1,
          buyer_id: "44444444-4444-4444-8444-444444444444",
          seller_id: "55555555-5555-4555-8555-555555555555",
        }],
        rowCount: 1,
      });
    // Simulates a reservation winning after the outer SELECT. The first
    // statement waits for and locks the trade; the second statement's fresh
    // snapshot observes the attempt and updates zero rows.
    txQuery
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await runMarketMaintenance();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txQuery.mock.calls[0][0]).toMatch(/SELECT id FROM market_trades[\s\S]*FOR UPDATE/);
    const cancelSql = txQuery.mock.calls[1][0] as string;
    expect(cancelSql).toMatch(/UPDATE market_trades AS target/);
    expect(cancelSql).toMatch(/NOT EXISTS \([\s\S]*market_trade_stripe_checkout_attempts attempt/);
    expect(cancelSql).toMatch(
      /'reserved', 'checkout_open', 'processing', 'requires_review'/,
    );
    expect(cancelSql).toMatch(/target\.stripe_session_id IS NULL[\s\S]*historical/);
    expect(cancelSql).toMatch(
      /historical\.stripe_session_id = target\.stripe_session_id[\s\S]*historical\.status IN \('expired', 'failed'\)/,
    );
    expect(txQuery).toHaveBeenCalledTimes(2);
  });

  it("requires the current compatibility Session to have exact terminal ledger evidence before cancellation", () => {
    const cancellationSource = readFileSync(
      new URL("./trade-cancels.ts", import.meta.url),
      "utf8",
    );
    const exactTerminalGuards = cancellationSource.match(
      /historical\.stripe_session_id = (?:t|market_trades)\.stripe_session_id[\s\S]{0,160}historical\.status IN \('expired', 'failed'\)/g,
    );
    expect(exactTerminalGuards).toHaveLength(2);
  });
});
