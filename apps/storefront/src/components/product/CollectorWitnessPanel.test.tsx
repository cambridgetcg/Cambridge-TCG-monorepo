import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildWitnessPayload,
  CollectorPermissionReceipt,
  type CollectorObservation,
  type WitnessForm,
} from "./CollectorWitnessPanel";

const HASH = "a".repeat(64);
const observation: CollectorObservation = {
  id: "123e4567-e89b-42d3-a456-426614174001",
  submission_key: "123e4567-e89b-42d3-a456-426614174000",
  sku: "op-op01-001-ja",
  observation_kind: "purchase",
  condition: "NM",
  price_amount: "12.30",
  price_currency: "GBP",
  observed_on: "2026-07-11",
  sharing_mode: "cc0",
  sharing_terms_version: "collector-witness-v1",
  sharing_changed_at: "2026-07-12T10:00:00.000Z",
  cc0_acknowledged_at: "2026-07-12T10:00:00.000Z",
  evidence_sha256: HASH,
  revision: 3,
  created_at: "2026-07-12T10:00:00.000Z",
  updated_at: "2026-07-12T10:00:00.000Z",
};

function form(overrides: Partial<WitnessForm> = {}): WitnessForm {
  return {
    observationKind: "purchase",
    condition: "NM",
    amount: "12.30",
    currency: "GBP",
    observedOn: "2026-07-11",
    sharingMode: "cc0",
    evidenceSha256: HASH,
    firstPartyAttested: true,
    cc0Acknowledged: false,
    ...overrides,
  };
}

describe("CollectorPermissionReceipt", () => {
  it("shows the active notice version and permission-change time", () => {
    const html = renderToStaticMarkup(
      <CollectorPermissionReceipt
        observation={{
          sharing_mode: "anonymous_aggregate",
          sharing_terms_version: "collector-witness-v2",
          sharing_changed_at: "2026-07-13T11:15:00.000Z",
          cc0_acknowledged_at: null,
        }}
      />,
    );

    expect(html).toContain("Sharing permission receipt");
    expect(html).toContain("collector-witness-v2");
    expect(html).toContain("2026-07-13 11:15:00 UTC");
    expect(html).not.toContain("CC0 acknowledged");
  });

  it("shows the active CC0 acknowledgement time", () => {
    const html = renderToStaticMarkup(
      <CollectorPermissionReceipt
        observation={{
          sharing_mode: "cc0",
          sharing_terms_version: "collector-witness-v2",
          sharing_changed_at: "2026-07-13T11:15:00.000Z",
          cc0_acknowledged_at: "2026-07-13T11:16:00.000Z",
        }}
      />,
    );

    expect(html).toContain("CC0 acknowledged");
    expect(html).toContain("2026-07-13 11:16:00 UTC");
  });
});

describe("buildWitnessPayload", () => {
  const shared = {
    sku: observation.sku,
    editing: observation,
    submissionKey: observation.submission_key,
  };

  it("preserves the old permission receipt and omits stale evidence on a factual edit", () => {
    const payload = buildWitnessPayload({
      ...shared,
      form: form({ amount: "13.00" }),
      evidenceTouched: false,
    });

    expect(payload).toEqual({ revision: 3, price_amount: "13.00" });
    expect(payload).not.toHaveProperty("sharing_mode");
    expect(payload).not.toHaveProperty("cc0_acknowledged");
    expect(payload).not.toHaveProperty("evidence_sha256");
  });

  it("sends null after an explicit evidence removal", () => {
    expect(buildWitnessPayload({
      ...shared,
      form: form({ evidenceSha256: "" }),
      evidenceTouched: true,
    })).toEqual({ revision: 3, evidence_sha256: null });
  });

  it("sends an explicitly recommitted hash even when it matches the old hash", () => {
    expect(buildWitnessPayload({
      ...shared,
      form: form(),
      evidenceTouched: true,
    })).toEqual({ revision: 3, evidence_sha256: HASH });
  });

  it("records current terms only when the sharing choice changes", () => {
    expect(buildWitnessPayload({
      ...shared,
      form: form({ sharingMode: "private" }),
      evidenceTouched: false,
    })).toEqual({
      revision: 3,
      sharing_mode: "private",
      cc0_acknowledged: false,
    });
  });
});
