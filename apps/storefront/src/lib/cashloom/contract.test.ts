import { describe, expect, it } from "vitest";
import {
  CASHLOOM_DISCLOSURE_NOTICE_VERSION,
  parseCashloomPrepareAction,
  parseCashloomProfileWrite,
  parseCashloomTradeId,
} from "./contract";

const KEY_ID = `sha256:${"a".repeat(64)}`;

function profileBody(overrides: Record<string, unknown> = {}) {
  return {
    merchant_key_id: KEY_ID,
    enabled: true,
    handoff_mode: "offline_bundle",
    disclosure_notice_version: CASHLOOM_DISCLOSURE_NOTICE_VERSION,
    disclosure_acknowledged: true,
    ...overrides,
  };
}

describe("CashLoom account contract", () => {
  it("accepts enabled and disabled offline-bundle declarations with current acknowledgement", () => {
    expect(parseCashloomProfileWrite(profileBody())).toEqual({
      ok: true,
      value: profileBody(),
    });
    expect(parseCashloomProfileWrite(profileBody({ enabled: false }))).toEqual({
      ok: true,
      value: profileBody({ enabled: false }),
    });
  });

  it("requires the exact lowercase self-certifying key-id shape", () => {
    const uppercase = parseCashloomProfileWrite(
      profileBody({ merchant_key_id: `sha256:${"A".repeat(64)}` }),
    );
    expect(uppercase).toMatchObject({ ok: false, field: "merchant_key_id" });

    const padded = parseCashloomProfileWrite(
      profileBody({ merchant_key_id: ` ${KEY_ID}` }),
    );
    expect(padded).toMatchObject({ ok: false, field: "merchant_key_id" });
  });

  it("fails closed on stale disclosure, missing acknowledgement, or unknown fields", () => {
    expect(
      parseCashloomProfileWrite(profileBody({ disclosure_notice_version: "old" })),
    ).toMatchObject({ ok: false, field: "disclosure_notice_version" });
    expect(
      parseCashloomProfileWrite(profileBody({ disclosure_acknowledged: false })),
    ).toMatchObject({ ok: false, field: "disclosure_acknowledged" });
    expect(
      parseCashloomProfileWrite({ ...profileBody(), endpoint: "https://example.test" }),
    ).toMatchObject({ ok: false, field: "body" });
  });
});

describe("CashLoom trade action contract", () => {
  it("accepts only the closed prepare action", () => {
    expect(parseCashloomPrepareAction({ action: "prepare" })).toEqual({
      ok: true,
      value: { action: "prepare" },
    });
    expect(parseCashloomPrepareAction({ action: "prepare", execute: true })).toMatchObject({
      ok: false,
      field: "body",
    });
    expect(parseCashloomPrepareAction({ action: "pay" })).toMatchObject({
      ok: false,
      field: "action",
    });
  });

  it("validates and normalizes untrusted dynamic trade ids", () => {
    expect(parseCashloomTradeId("123E4567-E89B-42D3-A456-426614174000")).toEqual({
      ok: true,
      value: "123e4567-e89b-42d3-a456-426614174000",
    });
    expect(parseCashloomTradeId("not-a-uuid")).toMatchObject({ ok: false, field: "id" });
  });
});
