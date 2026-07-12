import { describe, expect, it } from "vitest";
import { toPortablePassportHoldings } from "./export";

describe("Collector Passport private archive projection", () => {
  it("exports account facts and collector text without mixed-source display fields", () => {
    const source = {
      sku: "PK-SV1-001-EN-N",
      condition: "NM",
      quantity: 2,
      acquisition_price: "4.50",
      acquired_at: "2026-07-01",
      notes: "Opened at home",
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-02T10:00:00.000Z",
      public_label: "My first pull",
      public_story: "A good afternoon.",
      passport_public: true,
      card_name: "must not leave",
      set_name: "must not leave",
      image_url: "https://restricted.example/image.jpg",
      current_value: "999.00",
    };
    const [holding] = toPortablePassportHoldings([source]);
    expect(holding).toEqual({
      sku: "PK-SV1-001-EN-N",
      condition: "NM",
      quantity: 2,
      acquisition_price_recorded: {
        amount: "4.50",
        currency: null,
        provenance: "legacy-derived-cost-basis-estimate",
      },
      acquired_at: "2026-07-01",
      private_notes: "Opened at home",
      recorded_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-02T10:00:00.000Z",
      passport: {
        collector_label: "My first pull",
        collector_story: "A good afternoon.",
        publication_selected: true,
      },
    });
    const serialized = JSON.stringify(holding);
    expect(serialized).not.toContain("must not leave");
    expect(serialized).not.toContain("restricted.example");
    expect(serialized).not.toContain("999.00");
  });

  it("rejects malformed rows rather than coercing them into an archive", () => {
    expect(() => toPortablePassportHoldings([{
      sku: "",
      condition: "NM",
      quantity: 1,
      acquisition_price: null,
      acquired_at: null,
      notes: null,
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
      public_label: null,
      public_story: null,
      passport_public: false,
    }])).toThrow(/archive row/);
  });

  it("preserves legacy long notes and recorded negative quantities", () => {
    const notes = "n".repeat(12_000);
    const [holding] = toPortablePassportHoldings([{
      sku: "PK-SV1-001-EN-N",
      condition: "NM",
      quantity: -1,
      acquisition_price: null,
      acquired_at: null,
      notes,
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
      public_label: null,
      public_story: null,
      passport_public: false,
    }]);
    expect(holding.quantity).toBe(-1);
    expect(holding.private_notes).toBe(notes);
  });
});
