import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCashloomHandoff,
  canonicalJson,
  sha256Id,
  type CashloomTradeSnapshot,
} from "./handoff";
import {
  authorizeCashloomTradeSeller,
  getCashloomTradeHandoffView,
  prepareCashloomTradeHandoff,
} from "./db";

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

const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const SELLER_ID = "33333333-3333-4333-8333-333333333333";
const TRADE_ID = "11111111-1111-4111-8111-111111111111";
const KEY_A = `sha256:${"a".repeat(64)}`;
const KEY_B = `sha256:${"b".repeat(64)}`;

const TRADE: CashloomTradeSnapshot & { payment_window_open: boolean } = {
  id: TRADE_ID,
  buyer_id: BUYER_ID,
  seller_id: SELLER_ID,
  sku: "OP-OP01-001-JP",
  card_name: "Roronoa Zoro",
  condition: "NM",
  price: "12.30",
  quantity: 2,
  commission_amount: "0.00",
  seller_payout: "24.60",
  escrow_status: "awaiting_payment",
  escrow_tier: "verified",
  requires_photos: true,
  requires_inspection: false,
  seller_ships_to: "buyer",
  dispute_window_hours: 72,
  payout_hold_days: 3,
  accepts_returns: true,
  return_window_days: 14,
  payment_expires_at: "2026-08-01T12:00:00.000Z",
  payment_window_open: true,
};

function entropy(nonceByte: number, saltByte = 9) {
  return {
    bindingNonce: new Uint8Array(16).fill(nonceByte),
    referenceSalt: new Uint8Array(32).fill(saltByte),
  };
}

function storedHandoff(keyId: string, nonceByte: number) {
  const built = buildCashloomHandoff(TRADE, keyId, entropy(nonceByte));
  return {
    handoff_id: built.handoff_id,
    merchant_key_id: keyId,
    terms_hash: built.terms_hash,
    expected_purpose_note: built.expected_purpose_note,
    canonical_json: built.canonical_json,
    created_at: "2026-07-31T12:00:00.000Z",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  dbMocks.transaction.mockImplementation(async (callback) => callback(dbMocks.txQuery));
});

describe("CashLoom trade DAL", () => {
  it("preflights seller authority without selecting packet bytes", async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ seller_id: SELLER_ID }], rowCount: 1 });

    await expect(authorizeCashloomTradeSeller(TRADE_ID, BUYER_ID)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(dbMocks.query.mock.calls[0][0]).toMatch(/^SELECT seller_id/m);
    expect(dbMocks.query.mock.calls[0][0]).not.toMatch(/canonical_json|merchant_key_id/);
  });

  it("refuses a buyer prepare before profile or insert queries", async () => {
    dbMocks.txQuery.mockResolvedValueOnce({ rows: [TRADE], rowCount: 1 });

    const result = await prepareCashloomTradeHandoff(TRADE_ID, BUYER_ID);

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(dbMocks.txQuery).toHaveBeenCalledTimes(1);
    expect(dbMocks.txQuery.mock.calls[0][0]).toMatch(/FOR SHARE OF t/);
  });

  it("uses insert-on-conflict and returns the stored concurrent winner without moving money", async () => {
    const winner = storedHandoff(KEY_A, 7);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [TRADE], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ merchant_key_id: KEY_A, enabled: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [winner], rowCount: 1 });

    const result = await prepareCashloomTradeHandoff(TRADE_ID, SELLER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reused).toBe(true);
      expect(result.value.handoff?.handoff_id).toBe(winner.handoff_id);
    }
    const statements = dbMocks.txQuery.mock.calls.map(([sql]) => sql as string);
    expect(statements.some((sql) => /ON CONFLICT \(trade_id\) DO NOTHING/.test(sql))).toBe(true);
    expect(statements.some((sql) => /UPDATE\s+market_trades/i.test(sql))).toBe(false);
    expect(statements.some((sql) => /getStripe|stripe\.|fetch\s*\(/i.test(sql))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reuses the immutable snapshot after the account profile rotates", async () => {
    const oldSnapshot = storedHandoff(KEY_A, 1);
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [TRADE], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [oldSnapshot], rowCount: 1 });

    // KEY_B represents the now-current account pin. The existing branch
    // deliberately never reads it: the captured KEY_A packet wins forever.
    const result = await prepareCashloomTradeHandoff(TRADE_ID, SELLER_ID);

    expect(KEY_B).not.toBe(KEY_A);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reused).toBe(true);
      expect(result.value.handoff?.packet.merchant_key_id).toBe(KEY_A);
    }
    expect(dbMocks.txQuery).toHaveBeenCalledTimes(2);
    expect(dbMocks.txQuery.mock.calls.some(([sql]) =>
      /cashloom_settlement_profiles/.test(sql as string),
    )).toBe(false);
  });

  it("authorizes participants before decoding participant-only packet bytes", async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{
        ...TRADE,
        profile_configured: true,
        profile_enabled: true,
        handoff_id: "sha256:corrupt",
        handoff_merchant_key_id: KEY_A,
        handoff_terms_hash: "sha256:corrupt",
        handoff_expected_purpose_note: "ctcg:v1:corrupt",
        handoff_canonical_json: "not-json",
        handoff_created_at: "2026-07-31T12:00:00.000Z",
      }],
      rowCount: 1,
    });

    await expect(
      getCashloomTradeHandoffView(TRADE_ID, "44444444-4444-4444-8444-444444444444"),
    ).resolves.toEqual({ ok: false, reason: "forbidden" });
  });

  it("rejects self-consistent stored bytes that violate the nested privacy schema", async () => {
    const built = buildCashloomHandoff(TRADE, KEY_A, entropy(3));
    const terms = {
      ...built.packet.terms,
      logistics: {
        ...built.packet.terms.logistics,
        shipping_address_included: true,
      },
    };
    const termsHash = sha256Id(canonicalJson({
      nonce_hex: built.packet.binding.nonce_hex,
      terms,
    }));
    const purposeNote = `ctcg:v1:${sha256Id(canonicalJson({
      merchant_key_id: KEY_A,
      participant_references: built.packet.binding.participant_references,
      terms_hash: termsHash,
    })).slice(7)}`;
    const packet = {
      ...built.packet,
      binding: {
        ...built.packet.binding,
        terms_hash: termsHash,
        expected_purpose_note: purposeNote,
      },
      terms,
    };
    const canonical = canonicalJson(packet);
    dbMocks.query.mockResolvedValueOnce({
      rows: [{
        ...TRADE,
        profile_configured: true,
        profile_enabled: true,
        handoff_id: sha256Id(canonical),
        handoff_merchant_key_id: KEY_A,
        handoff_terms_hash: termsHash,
        handoff_expected_purpose_note: purposeNote,
        handoff_canonical_json: canonical,
        handoff_created_at: "2026-07-31T12:00:00.000Z",
      }],
      rowCount: 1,
    });

    await expect(getCashloomTradeHandoffView(TRADE_ID, SELLER_ID)).rejects.toThrow(
      /logistics fields are invalid|shipping address/,
    );
  });
});
