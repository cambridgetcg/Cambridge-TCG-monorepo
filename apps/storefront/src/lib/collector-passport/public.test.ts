import { describe, expect, it } from "vitest";
import { toPublicCollectorPassport } from "./public";
import type { PublishedPassportRow } from "./types";

describe("Collector Passport public projection", () => {
  it("returns only collector-authored public fields", () => {
    const row = {
      username: "quiet_collector",
      public_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      public_label: "The card that brought me back",
      public_story: "My own short story.",
      display_order: 2,
      passport_published_at: "2026-07-12T10:00:00.000Z",
      updated_at: "2026-07-12T11:00:00.000Z",
      // Sentinels model a future accidental SELECT * or object spread.
      user_id: "PRIVATE_USER_SENTINEL",
      portfolio_card_id: "PRIVATE_PORTFOLIO_SENTINEL",
      sku: "RESTRICTED_SKU_SENTINEL",
      card_name: "RESTRICTED_NAME_SENTINEL",
      card_number: "RESTRICTED_NUMBER_SENTINEL",
      set_name: "RESTRICTED_SET_SENTINEL",
      image_url: "https://restricted.invalid/image.jpg",
      rarity: "RESTRICTED_RARITY_SENTINEL",
      condition: "PRIVATE_CONDITION_SENTINEL",
      quantity: 99,
      acquisition_price: "999.99",
      acquired_at: "1999-01-01",
      notes: "PRIVATE_NOTES_SENTINEL",
      current_value: 12345,
      pnl: 678,
    } as PublishedPassportRow & Record<string, unknown>;

    const passport = toPublicCollectorPassport([row]);
    expect(passport).toEqual({
      username: "quiet_collector",
      status: "self_attested_unverified",
      published_item_count: 1,
      items: [{
        public_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        label: "The card that brought me back",
        story: "My own short story.",
        display_order: 2,
        published_at: "2026-07-12T10:00:00.000Z",
        updated_at: "2026-07-12T11:00:00.000Z",
      }],
    });

    const wire = JSON.stringify(passport);
    for (const sentinel of [
      "PRIVATE_USER_SENTINEL",
      "PRIVATE_PORTFOLIO_SENTINEL",
      "RESTRICTED_SKU_SENTINEL",
      "RESTRICTED_NAME_SENTINEL",
      "RESTRICTED_NUMBER_SENTINEL",
      "RESTRICTED_SET_SENTINEL",
      "restricted.invalid",
      "RESTRICTED_RARITY_SENTINEL",
      "PRIVATE_CONDITION_SENTINEL",
      "PRIVATE_NOTES_SENTINEL",
      "999.99",
      "1999-01-01",
    ]) {
      expect(wire).not.toContain(sentinel);
    }
  });

  it("does not construct a Passport without published rows", () => {
    expect(toPublicCollectorPassport([])).toBeNull();
  });

  it("fails closed on invalid public text or mixed collectors", () => {
    const base: PublishedPassportRow = {
      username: "collector_one",
      public_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      public_label: "A highlight",
      public_story: null,
      display_order: 0,
      passport_published_at: "2026-07-12T10:00:00.000Z",
      updated_at: "2026-07-12T10:00:00.000Z",
    };
    expect(() => toPublicCollectorPassport([{ ...base, public_label: " " }])).toThrow();
    expect(() => toPublicCollectorPassport([
      base,
      { ...base, public_id: "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee", username: "collector_two" },
    ])).toThrow();
  });
});
