import { describe, expect, it } from "vitest";
import {
  buildCashloomPaymentPreparationDigests,
  parseCashloomPaymentPreparationWrite,
} from "./preparation";

const TRADE_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const HANDOFF_ID = `sha256:${"a".repeat(64)}`;
const TERMS_HASH = `sha256:${"b".repeat(64)}`;
const KEY = "123e4567-e89b-42d3-a456-426614174000";

function body(overrides: Record<string, unknown> = {}) {
  return {
    action: "record_preparation",
    handoff_id: HANDOFF_ID,
    terms_hash: TERMS_HASH,
    expected_trade_state: "awaiting_payment",
    expected_preparation_state: "none",
    disclosure_notice_version: "cashloom-preparation-retention-v1",
    idempotency_key: KEY,
    ...overrides,
  };
}

describe("CashLoom payment-preparation contract", () => {
  it("accepts only the closed absent-to-prepared request", () => {
    expect(parseCashloomPaymentPreparationWrite(body())).toEqual({
      ok: true,
      value: body(),
    });
    expect(parseCashloomPaymentPreparationWrite({ ...body(), buyer_id: BUYER_ID })).toMatchObject({
      ok: false,
      field: "body",
    });
    expect(parseCashloomPaymentPreparationWrite(body({ action: "pay" }))).toMatchObject({
      ok: false,
      field: "action",
    });
    expect(parseCashloomPaymentPreparationWrite(body({ expected_preparation_state: "prepared" })))
      .toMatchObject({ ok: false, field: "expected_preparation_state" });
    expect(parseCashloomPaymentPreparationWrite(body({ disclosure_notice_version: "older" })))
      .toMatchObject({ ok: false, field: "disclosure_notice_version" });
  });

  it("requires exact lowercase content ids and a UUID-v4 retry key", () => {
    expect(parseCashloomPaymentPreparationWrite(body({ handoff_id: HANDOFF_ID.toUpperCase() })))
      .toMatchObject({ ok: false, field: "handoff_id" });
    expect(parseCashloomPaymentPreparationWrite(body({ idempotency_key: KEY.toUpperCase() })))
      .toMatchObject({ ok: false, field: "idempotency_key" });
    expect(parseCashloomPaymentPreparationWrite(body({ idempotency_key: "123e4567-e89b-12d3-a456-426614174000" })))
      .toMatchObject({ ok: false, field: "idempotency_key" });
  });

  it("binds operation bytes and actor without exposing raw identifiers or retry keys", () => {
    const parsed = parseCashloomPaymentPreparationWrite(body());
    if (!parsed.ok) throw new Error("fixture must parse");
    const first = buildCashloomPaymentPreparationDigests(TRADE_ID, BUYER_ID, parsed.value);
    const replay = buildCashloomPaymentPreparationDigests(TRADE_ID, BUYER_ID, parsed.value);
    expect(replay).toEqual(first);
    expect(first.preparation_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.request_hash).not.toContain(TRADE_ID);
    expect(first.preparation_id).not.toContain(BUYER_ID);
    expect(first.idempotency_key_hash).not.toContain(KEY);

    const changed = parseCashloomPaymentPreparationWrite(body({ terms_hash: HANDOFF_ID }));
    if (!changed.ok) throw new Error("changed fixture must parse");
    expect(buildCashloomPaymentPreparationDigests(TRADE_ID, BUYER_ID, changed.value).request_hash)
      .not.toBe(first.request_hash);
  });
});
