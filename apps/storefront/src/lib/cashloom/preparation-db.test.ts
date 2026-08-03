import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeCashloomPaymentPreparationBuyer,
  getCashloomPaymentPreparationView,
  recordCashloomPaymentPreparation,
} from "./preparation-db";
import {
  buildCashloomPaymentPreparationDigests,
  type CashloomPaymentPreparationWrite,
} from "./preparation";

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  txQuery: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  query: dbMocks.query,
  transaction: dbMocks.transaction,
}));

const TRADE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TRADE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const SELLER_ID = "33333333-3333-4333-8333-333333333333";
const HANDOFF_ID = `sha256:${"a".repeat(64)}`;
const TERMS_HASH = `sha256:${"b".repeat(64)}`;

const INPUT: CashloomPaymentPreparationWrite = {
  action: "record_preparation",
  handoff_id: HANDOFF_ID,
  terms_hash: TERMS_HASH,
  expected_trade_state: "awaiting_payment",
  expected_preparation_state: "none",
  disclosure_notice_version: "cashloom-preparation-retention-v1",
  idempotency_key: "123e4567-e89b-42d3-a456-426614174000",
};

const TRADE = {
  id: TRADE_ID,
  buyer_id: BUYER_ID,
  seller_id: SELLER_ID,
  escrow_status: "awaiting_payment",
  payment_window_open: true,
};

function stored(
  input = INPUT,
  overrides: Record<string, unknown> = {},
) {
  const digests = buildCashloomPaymentPreparationDigests(TRADE_ID, BUYER_ID, input);
  return {
    ...digests,
    trade_id: TRADE_ID,
    handoff_id: input.handoff_id,
    prepared_by: BUYER_ID,
    terms_hash: input.terms_hash,
    state: "prepared",
    expected_trade_state: "awaiting_payment",
    expected_preparation_state: "none",
    disclosure_notice_version: "cashloom-preparation-retention-v1",
    created_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  dbMocks.transaction.mockImplementation(async (callback) => callback(dbMocks.txQuery));
});

describe("CashLoom payment-preparation DAL", () => {
  it("preflights buyer authority using only participant ids", async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ buyer_id: BUYER_ID, seller_id: SELLER_ID }], rowCount: 1 });
    await expect(authorizeCashloomPaymentPreparationBuyer(TRADE_ID, SELLER_ID)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(dbMocks.query.mock.calls[0][0]).toMatch(/^SELECT buyer_id, seller_id/m);
    expect(dbMocks.query.mock.calls[0][0]).not.toMatch(/preparation|handoff|terms_hash/);
  });

  it("rejects self-trades before a preparation can be recorded", async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ buyer_id: BUYER_ID, seller_id: BUYER_ID }], rowCount: 1 });
    await expect(authorizeCashloomPaymentPreparationBuyer(TRADE_ID, BUYER_ID)).resolves.toEqual({
      ok: false,
      reason: "self_trade",
    });
  });

  it("authorizes a participant before selecting receipt material", async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ buyer_id: BUYER_ID, seller_id: SELLER_ID }], rowCount: 1 });
    const result = await getCashloomPaymentPreparationView(TRADE_ID, "44444444-4444-4444-8444-444444444444");
    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(dbMocks.query).toHaveBeenCalledTimes(1);
  });

  it("returns a content-verified receipt only through the repeated participant gate", async () => {
    dbMocks.query
      .mockResolvedValueOnce({
        rows: [{ buyer_id: BUYER_ID, seller_id: SELLER_ID }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          ...TRADE,
          handoff_id: HANDOFF_ID,
          handoff_terms_hash: TERMS_HASH,
          preparation_id: stored().preparation_id,
          preparation_handoff_id: HANDOFF_ID,
          preparation_prepared_by: BUYER_ID,
          preparation_terms_hash: TERMS_HASH,
          preparation_state: "prepared",
          preparation_expected_trade_state: "awaiting_payment",
          preparation_expected_preparation_state: "none",
          preparation_disclosure_notice_version: "cashloom-preparation-retention-v1",
          preparation_request_hash: stored().request_hash,
          preparation_idempotency_key_hash: stored().idempotency_key_hash,
          preparation_created_at: "2026-08-01T12:00:00.000Z",
        }],
        rowCount: 1,
      });

    const result = await getCashloomPaymentPreparationView(TRADE_ID, SELLER_ID);
    expect(result).toMatchObject({
      ok: true,
      value: {
        role: "seller",
        can_record_preparation: false,
        unavailable_reason: "preparation_already_recorded",
        preparation: {
          preparation_id: stored().preparation_id,
          authority: "cambridge_database_session",
          nonclaims: { is_payment_or_acceptance: false },
        },
      },
    });
    expect(dbMocks.query.mock.calls[1][0]).toMatch(
      /AND \(t\.buyer_id = \$2 OR t\.seller_id = \$2\)/,
    );
    expect(dbMocks.query.mock.calls[1][1]).toEqual([TRADE_ID, SELLER_ID]);
  });

  it("locks and rechecks the buyer, exact handoff, state, and window before insert", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [TRADE], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ handoff_id: HANDOFF_ID, terms_hash: TERMS_HASH }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ preparation_id: stored().preparation_id }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [stored()], rowCount: 1 });

    const result = await recordCashloomPaymentPreparation(TRADE_ID, BUYER_ID, INPUT);
    expect(result).toMatchObject({ ok: true, reused: false });
    const statements = dbMocks.txQuery.mock.calls.map(([sql]) => sql as string);
    expect(statements[0]).toMatch(/FOR UPDATE/);
    expect(statements.some((sql) => /ON CONFLICT DO NOTHING/.test(sql))).toBe(true);
    expect(statements.some((sql) => /UPDATE\s+market_trades/i.test(sql))).toBe(false);
    expect(statements.some((sql) => /stripe|wallet|provider/i.test(sql))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns the exact retry winner before applying later trade-state gates", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ ...TRADE, escrow_status: "awaiting_shipment", payment_window_open: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [stored()], rowCount: 1 });
    const result = await recordCashloomPaymentPreparation(TRADE_ID, BUYER_ID, INPUT);
    expect(result).toMatchObject({ ok: true, reused: true });
    expect(dbMocks.txQuery).toHaveBeenCalledTimes(2);
  });

  it("rejects a reused key whose operation bytes changed", async () => {
    const changed: CashloomPaymentPreparationWrite = { ...INPUT, terms_hash: HANDOFF_ID };
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [TRADE], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [stored(INPUT, { trade_id: OTHER_TRADE_ID })], rowCount: 1 });
    await expect(recordCashloomPaymentPreparation(TRADE_ID, BUYER_ID, changed)).resolves.toEqual({
      ok: false,
      reason: "idempotency_conflict",
    });
  });

  it("gives one semantic preparation winner and rejects a competing key", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [TRADE], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [stored()], rowCount: 1 });
    await expect(recordCashloomPaymentPreparation(TRADE_ID, BUYER_ID, {
      ...INPUT,
      idempotency_key: "223e4567-e89b-42d3-a456-426614174000",
    })).resolves.toEqual({ ok: false, reason: "preparation_already_recorded" });
  });

  it("fails closed on stale trade, deadline, missing handoff, or changed terms", async () => {
    for (const fixture of [
      { trade: { ...TRADE, escrow_status: "disputed" }, reason: "trade_not_awaiting_payment", handoff: null },
      { trade: { ...TRADE, payment_window_open: false }, reason: "payment_window_expired", handoff: null },
      { trade: TRADE, reason: "handoff_required", handoff: null },
      { trade: TRADE, reason: "handoff_changed", handoff: { handoff_id: HANDOFF_ID, terms_hash: HANDOFF_ID } },
    ] as const) {
      dbMocks.txQuery.mockReset();
      dbMocks.txQuery
        .mockResolvedValueOnce({ rows: [fixture.trade], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      if (fixture.reason === "handoff_required" || fixture.reason === "handoff_changed") {
        dbMocks.txQuery.mockResolvedValueOnce({
          rows: fixture.handoff ? [fixture.handoff] : [],
          rowCount: fixture.handoff ? 1 : 0,
        });
      }
      await expect(recordCashloomPaymentPreparation(TRADE_ID, BUYER_ID, INPUT)).resolves.toEqual({
        ok: false,
        reason: fixture.reason,
      });
      expect(dbMocks.txQuery.mock.calls.some(([sql]) => /INSERT INTO/.test(sql as string))).toBe(false);
    }
  });
});
