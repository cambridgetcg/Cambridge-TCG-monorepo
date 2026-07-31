import { describe, expect, it } from "vitest";
import {
  buildCashloomHandoff,
  canonicalJson,
  numericGbpToPence,
  parseCashloomHandoffPacket,
  type CashloomTradeSnapshot,
} from "./handoff";

const MERCHANT_KEY_ID = `sha256:${"a".repeat(64)}`;
const TRADE: CashloomTradeSnapshot = {
  id: "11111111-1111-4111-8111-111111111111",
  buyer_id: "22222222-2222-4222-8222-222222222222",
  seller_id: "33333333-3333-4333-8333-333333333333",
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
};

function entropy(nonceByte: number, saltByte = 9) {
  return {
    bindingNonce: new Uint8Array(16).fill(nonceByte),
    referenceSalt: new Uint8Array(32).fill(saltByte),
  };
}

describe("CashLoom canonical handoff", () => {
  it("uses locale-independent key ordering", () => {
    expect(canonicalJson({ z: 1, a: 2, A: 3, 10: 4, 2: 5 })).toBe(
      '{"10":4,"2":5,"A":3,"a":2,"z":1}',
    );
  });

  it("converts NUMERIC strings to pence without floating-point arithmetic", () => {
    expect(numericGbpToPence("0.01", "price")).toBe("1");
    expect(numericGbpToPence("12.3", "price")).toBe("1230");
    expect(numericGbpToPence("9999999999.99", "price")).toBe("999999999999");
    expect(() => numericGbpToPence("1e2", "price")).toThrow(/at most two/);
    expect(() => numericGbpToPence("1.234", "price")).toThrow(/at most two/);
  });

  it("builds a participant-opaque, non-executing packet bound to exact GBP terms", () => {
    const built = buildCashloomHandoff(TRADE, MERCHANT_KEY_ID, entropy(1));

    expect(built.packet.terms.asset_id).toBe("fiat:iso4217/GBP");
    expect(built.packet.terms.economics).toEqual({
      unit_price_pence: "1230",
      quantity: 2,
      gross_amount_pence: "2460",
      commission_amount_pence: "0",
      seller_payout_pence: "2460",
    });
    expect(built.packet.binding.nonce_hex).toBe("01".repeat(16));
    expect(built.packet.binding.participant_references.buyer).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(built.packet.binding.participant_references.seller).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(built.expected_purpose_note).toMatch(/^ctcg:v1:[0-9a-f]{64}$/);
    expect(new TextEncoder().encode(built.expected_purpose_note).byteLength).toBeLessThanOrEqual(160);
    expect(built.handoff_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(built.packet.effects).toEqual({ moves_money: false, changes_trade_state: false });
    expect(Object.values(built.packet.nonclaims).every((claim) => claim === false)).toBe(true);
    expect(built.packet.terms.logistics.shipping_address_included).toBe(false);
    expect(built.canonical_json).not.toContain(TRADE.id);
    expect(built.canonical_json).not.toContain(TRADE.buyer_id);
    expect(built.canonical_json).not.toContain(TRADE.seller_id);
  });

  it("salts identical terms so different nonces produce different hashes and notes", () => {
    const first = buildCashloomHandoff(TRADE, MERCHANT_KEY_ID, entropy(1));
    const second = buildCashloomHandoff(TRADE, MERCHANT_KEY_ID, entropy(2));

    expect(second.terms_hash).not.toBe(first.terms_hash);
    expect(second.expected_purpose_note).not.toBe(first.expected_purpose_note);
    expect(second.handoff_id).not.toBe(first.handoff_id);
  });

  it("rejects malformed merchant pins and corrupt GBP accounting", () => {
    expect(() => buildCashloomHandoff(TRADE, `sha256:${"A".repeat(64)}`, entropy(1))).toThrow(
      /merchantKeyId/,
    );
    expect(() =>
      buildCashloomHandoff({ ...TRADE, seller_payout: "24.59" }, MERCHANT_KEY_ID, entropy(1)),
    ).toThrow(/do not balance/);
  });

  it("rejects self-consistent packets with nested fields outside the closed schema", () => {
    const built = buildCashloomHandoff(TRADE, MERCHANT_KEY_ID, entropy(1));
    const packetWithAddress = {
      ...built.packet,
      terms: {
        ...built.packet.terms,
        logistics: {
          ...built.packet.terms.logistics,
          shipping_address_included: true,
          shipping_address: "private address",
        },
      },
    };

    expect(() => parseCashloomHandoffPacket(packetWithAddress)).toThrow(/closed.*schema/i);
  });

  it("rejects nested type, accounting, and effect contradictions", () => {
    const built = buildCashloomHandoff(TRADE, MERCHANT_KEY_ID, entropy(1));
    expect(() => parseCashloomHandoffPacket({
      ...built.packet,
      terms: {
        ...built.packet.terms,
        economics: { ...built.packet.terms.economics, gross_amount_pence: "2459" },
      },
    })).toThrow(/balance exactly/);
    expect(() => parseCashloomHandoffPacket({
      ...built.packet,
      effects: { ...built.packet.effects, moves_money: true },
    })).toThrow(/non-executing boundary/);
  });
});
